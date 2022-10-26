import { IKVStore } from './KVStore';

export class PrefixStore implements IKVStore {
  constructor(private base: IKVStore, public prefix: Uint8Array) {}

  private _prefixKey(key: Uint8Array): Uint8Array {
    return new Uint8Array([...this.prefix, ...key]);
  }

  get(key: Uint8Array): Uint8Array {
    return this.base.get(this._prefixKey(key));
  }

  has(key: Uint8Array): boolean {
    return this.base.has(this._prefixKey(key));
  }

  set(key: Uint8Array, value: Uint8Array): void {
    return this.base.set(this._prefixKey(key), value);
  }

  delete(key: Uint8Array): void {
    return this.base.delete(this._prefixKey(key));
  }

  iterator(
    start: Uint8Array,
    end: Uint8Array
  ): Iterable<[Uint8Array, Uint8Array]> {
    return this.base.iterator(this._prefixKey(start), this._prefixKey(end));
  }

  reverseIterator(
    start: Uint8Array,
    end: Uint8Array
  ): Iterable<[Uint8Array, Uint8Array]> {
    return this.base.reverseIterator(this._prefixKey(start), this._prefixKey(end));
  }

}
