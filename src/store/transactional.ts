import { isCollection, isList, isMap, List, Map } from "immutable";
import { Ok, Result } from "ts-results";
import { isArrayLike } from "../util";

// NEVER_IMMUTIFY is a string because that's easily serializable with different algorithms - symbols are not
export type NeverImmutify = typeof NEVER_IMMUTIFY;
export const NEVER_IMMUTIFY = '__NEVER_IMMUTIFY__';

type Primitive = boolean | number | bigint | string | null | undefined | symbol;
type NoImmutify = Primitive | ArrayBuffer | ArrayBufferView | { [NEVER_IMMUTIFY]: any };

type Prefix<P, T extends any[]> = [P, ...T];
type First<T extends any[]> = T extends Prefix<infer F, any[]> ? F : never;
type Shift<T extends any[]> = T extends Prefix<any, infer R> ? R : [];

// god type
type Lens<T, P extends PropertyKey[]> =
  P extends Prefix<any, any[]>
  ? First<P> extends keyof T
    ? Shift<P> extends Prefix<any, any[]>
      ? Lens<T[First<P>], Shift<P>>
      : T[First<P>]
    : never
  : T;

type Immutify<T> =
  T extends NoImmutify
  ? T
  : T extends ArrayLike<infer E>
  ? List<Immutify<E>>
  : T extends Record<infer K, infer V>
  ? Map<K, Immutify<V>>
  : T;

type TxUpdater = (set: TxSetter) => void;
type TxSetter = (current: Map<unknown, unknown>) => Map<unknown, unknown>;
type LensSetter<T> = <P extends PropertyKey[]>(...path: P) => ((value: Lens<T, P> | Immutify<Lens<T, P>>) => void);
type LensDeleter = <P extends PropertyKey[]>(...path: P) => void;

/** Transactional database underlying multi-module chain storage. */
export class Transactional {
  constructor(private _data = Map()) {}
  
  lens<M extends object>(...path: PropertyKey[]) {
    return new TransactionalLens<M>(this, path);
  }
  
  tx<R extends Result<any, any>>(cb: (update: TxUpdater) => Promise<R>): Promise<R>;
  tx<R extends Result<any, any>>(cb: (update: TxUpdater) => R): R;
  tx<R extends Result<any, any>>(cb: (update: TxUpdater) => R | Promise<R>): R | Promise<R> {
    let valid = true;
    const snapshot = this._data;
    const updater: TxUpdater = setter => {
      if (!valid) throw new Error('Attempted to set data outside tx');
      this._data = setter(this._data);
    };
    
    try {
      const result = cb(updater);
      if ('then' in result) {
        return result.then(r => {
          if (r.err) {
            this._data = snapshot;
          }
          return r;
        })
        .catch(reason => {
          this._data = snapshot;
          return reason;
        })
      }
      else {
        if (result.err) {
          this._data = snapshot;
        }
        return result;
      }
    }
    catch (ex) {
      this._data = snapshot;
      throw ex;
    }
    finally {
      valid = false;
    }
  }
  
  get data() {
    return this._data;
  }
}

export class TransactionalLens<M extends object> {
  constructor(public readonly db: Transactional, public readonly prefix: PropertyKey[]) {}
  
  initialize(data: M) {
    this.db.tx(update => {
      const coll = toImmutable(data);
      if (!isCollection(coll)) throw new Error('Not an Immutable.Map');
      update(curr => curr.setIn([...this.prefix], coll));
      return Ok(undefined);
    }).unwrap();
    return this;
  }
  
  get<P extends PropertyKey[]>(...path: P): Immutify<Lens<M, P>> {
    return this.db.data.getIn([...this.prefix, ...path]) as any;
  }
  
  getObject<P extends PropertyKey[]>(...path: P): Lens<M, P> {
    return fromImmutable(this.get(...path));
  }
  
  tx<R extends Result<any, any>>(cb: (setter: LensSetter<M>, deleter: LensDeleter) => Promise<R>): Promise<R>;
  tx<R extends Result<any, any>>(cb: (setter: LensSetter<M>, deleter: LensDeleter) => R): R;
  tx<R extends Result<any, any>>(cb: (setter: LensSetter<M>, deleter: LensDeleter) => R | Promise<R>): R | Promise<R> {
    //@ts-ignore
    return this.db.tx(update => {
      const setter: LensSetter<M> = <P extends PropertyKey[]>(...path: P) =>
        (value: Lens<M, P> | Immutify<Lens<M, P>>) => {
          update(curr => curr.setIn([...this.prefix, ...path], toImmutable(value)));
        }
      const deleter: LensDeleter = <P extends PropertyKey[]>(...path: P) => {
        update(curr => curr.deleteIn([...this.prefix, ...path]));
      }
      return cb(setter, deleter);
    });
  }
  
  lens<P extends PropertyKey[]>(...path: P): TransactionalLens<Lens<M, P>> {
    return new TransactionalLens<Lens<M, P>>(this.db, [...this.prefix, ...path]);
  }
  
  get data() { return this.db.data.getIn([...this.prefix]) as Immutify<M> }
}

function toImmutable(value: any): any {
  // passthru Immutable collections
  if (isCollection(value)) return value;
  
  // don't touch ArrayBuffers & ArrayBufferViews - freeze them
  if (ArrayBuffer.isView(value)) {
    Object.freeze(value.buffer);
    return value;
  }
  if (value instanceof ArrayBuffer) {
    Object.freeze(value);
    return value;
  }
  
  // recurse into arrays & objects, converting them to lists & maps
  // skip primitives & objects that don't want to be touched
  if (typeof value === 'object' && !(NEVER_IMMUTIFY in value)) {
    if (isArrayLike(value)) {
      return List(value.map(item => toImmutable(item)));
    } else {
      return Map(
        Object.entries(value).map(
          ([key, value]) => [key, toImmutable(value)]
        )
      );
    }
  }
  
  return value;
}

function fromImmutable(value: any): any {
  // reverse Immutable maps & lists
  if (isMap(value)) {
    return fromImmutable(value.toObject());
  }
  if (isList(value)) {
    return fromImmutable(value.toArray());
  }
  
  // passthru ArrayBuffers & ArrayBufferViews
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  
  // revert objects & arrays
  // but: passthru objects w/ NEVER_IMMUTIFY
  if (typeof value === 'object' && !(NEVER_IMMUTIFY in value)) {
    if (typeof value.length === 'number' && 0 in value && value.length-1 in value) {
      for (let i = 0; i < value.length; ++i) {
        value[i] = fromImmutable(value[i]);
      }
    }
    else {
      for (const prop in value) {
        value[prop] = fromImmutable(value[prop]);
      }
    }
    return value;
  }
  
  return value;
}
