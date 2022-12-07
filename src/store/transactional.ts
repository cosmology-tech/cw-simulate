import { fromJS, isCollection, isList, isMap, List, Map } from "immutable";
import { Ok, Result } from "ts-results";

type Primitive = boolean | number | bigint | string | null | undefined | symbol;

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
  T extends Primitive
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
      const coll = fromJS(data);
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
          const v = isCollection(value) ? value : fromJS(value);
          update(curr => curr.setIn([...this.prefix, ...path], v));
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

function fromImmutable(value: any): any {
  if (isMap(value)) {
    return fromImmutable(value.toObject());
  }
  else if (isList(value)) {
    return fromImmutable(value.toArray());
  }
  else if (typeof value === 'object') {
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
  else {
    return value;
  }
}
