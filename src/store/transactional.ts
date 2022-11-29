import { List, Map } from "immutable";
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
  : T extends (infer E)[]
  ? List<Immutify<E>>
  : T extends Record<infer K, infer V>
  ? Map<K, V>
  : T;

type TxUpdater = (set: TxSetter) => void;
type TxSetter = (current: Map<unknown, unknown>) => Map<unknown, unknown>;
type LensSetter<T> = <P extends PropertyKey[]>(...path: P) => ((value: Immutify<Lens<T, P>>) => void);

/** Transactional database underlying multi-module chain storage. */
export class Transactional {
  private _data = Map();
  
  constructor() {}
  
  lens<M extends object>(...path: PropertyKey[]) {
    return new TransactionalLens<M>(this, path);
  }
  
  tx<R extends Result<any, any>>(cb: (update: TxUpdater) => R): R {
    let valid = true;
    const snapshot = this._data;
    const updater: TxUpdater = setter => {
      if (!valid) throw new Error('Attempted to set data outside tx');
      this._data = setter(this._data);
    };
    
    try {
      const result = cb(updater);
      if (result.err) {
        this._data = snapshot;
      }
      return result;
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
      update(curr => curr.setIn([...this.prefix], Map(data)));
      return Ok(undefined);
    }).unwrap();
  }
  
  get<P extends PropertyKey[]>(...path: P): Immutify<Lens<M, P>> {
    return this.db.data.getIn([...this.prefix, ...path]) as any;
  }
  
  tx<R extends Result<any, any>>(cb: (setter: LensSetter<M>) => R): R {
    return this.db.tx(update => {
      const setter: LensSetter<M> = <P extends PropertyKey[]>(...path: P) =>
        (value: Immutify<Lens<M, P>>) => {
          update(curr => curr.setIn([...this.prefix, ...path], value));
        }
      return cb(setter);
    });
  }
  
  lens<P extends PropertyKey[]>(...path: P): TransactionalLens<Lens<M, P>> {
    return new TransactionalLens<Lens<M, P>>(this.db, [...this.prefix, ...path]);
  }
  
  get data() { return this.db.data.getIn([...this.prefix]) as Immutify<M> }
}
