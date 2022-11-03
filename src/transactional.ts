import { Err, Ok, Result } from "ts-results";

type OptionalPromise<T> = T | Promise<T>;

/** A transactional runtime storage */
export default class Transactional {
  private _data: Record<string, any> = {};
  
  constructor() {}
  
  substorage<T = any>(name: string, initialValue: T): Substorage<T>;
  substorage<T = any>(name: string, initializer: () => T): Substorage<T>;
  substorage(name: string, init: any): Substorage<any> {
    if (name in this._data)
      throw new Error(`Substorage name already in use: ${name}`);
    this._data[name] = typeof init === 'function' ? init() : init;
    return new Substorage(this, name);
  }
  
  /** Create a new transaction lasting exactly for the duration of `callback`. The `state` the `callback` receives is
   * mutable. Transactions can be nested.
   * 
   * If `callback` returns a `Result`, tx will commit changes only if it is `Ok`.
   * If `callback` does not return a `Result`, tx will commit changes only if
   * `callback` does not throw.
   */
  tx<T, R>(name: string, callback: (state: T) => Promise<R>): Promise<Result<R, any>>;
  tx<T, R>(name: string, callback: (state: T) => R): Result<R, any>;
  tx<T, R, E>(name: string, callback: (state: T) => Promise<Result<R, E>>): Promise<Result<R, E>>;
  tx<T, R, E>(name: string, callback: (state: T) => Result<R, E>): Result<R, E>;
  tx<T>(name: string, callback: (state: T) => any) {
    // Chaos Mode ENGAGED
    const prev = cloneDeep(this._data[name]);
    
    const handleResult = (next: any) => {
      if (Result.isResult(next)) {
        if (next.err) {
          this._data[name] = prev;
        }
        return next;
      }
      else {
        return Ok(next);
      }
    };
    
    try {
      const next = callback(this._data[name]);
      if (typeof next === 'object' && 'then' in next) {
        return next
          .then(handleResult)
          .catch((err: any) => Err(err));
      }
      else {
        return handleResult(next);
      }
    }
    catch (err) {
      this._data[name] = prev;
      return Err(err);
    }
    // Chaos Mode DISENGAGED
  }
  
  /** Read data from the blockchain. Optionally apply a filter. */
  read<T>(name: string): T;
  read<T, R>(name: string, filter: (state: T) => R): R;
  read(name: string, filter = (v: any) => v) {
    return filter(cloneDeep(this._data[name]));
  }
  
  clone() {
    const clone = new Transactional();
    clone._data = cloneDeep(this._data);
    return clone;
  }
}

/** Substorage is a type bound interface to a partition of a `Transactional`'s data. */
export class Substorage<T, E = string> {
  constructor(
    private base: Transactional,
    public readonly name: string,
  ) {}
  
  /** Create a new transaction on this substorage lasting exactly for the duration of `callback`. The `state` the
   * `callback` receives is mutable. Transactions can be nested.
   */
  tx<R>(callback: (state: T) => Promise<R | Result<R, E>>): Promise<Result<R, E>>;
  tx<R>(callback: (state: T) => R | Result<R, E>): Result<R, E>;
  tx(callback: (curr: T) => OptionalPromise<any | Result<any, E>>) {
    return this.base.tx(this.name, callback) as any;
  }
  
  read(): T;
  read<R>(filter: (state: T) => R): R;
  read(filter?: (state: T) => any): any {
    //@ts-ignore
    return this.base.read(this.name, filter);
  }
}

function cloneDeep<T extends { clone(): any }>(obj: T): ReturnType<T['clone']>;
function cloneDeep<T>(obj: T): T;
function cloneDeep(obj: any) {
  if (typeof obj !== 'object') return obj;
  if (!obj) return obj;
  if (typeof obj.clone === 'function') return obj.clone();
  if (obj.buffer instanceof ArrayBuffer) {
    if (typeof obj.slice !== 'function') throw new Error('TypedArray-like missing .slice() method');
    return obj.slice();
  }
  
  // default clone strict arrays
  if (Array.isArray(obj))
    return obj.slice().map(cloneDeep);
  
  // properly clone Buffers
  if (Buffer.isBuffer(obj))
    return Buffer.from(obj);
  
  // fail for non-Clonable, non-literal objects
  if (Object.getPrototypeOf(obj) !== Object.prototype)
    throw new Error('Non-trivial object missing .clone() method');
  
  // default clone
  const clone: any = {};
  for (const prop in obj) {
    clone[prop] = cloneDeep(obj[prop]);
  }
  return clone;
}
