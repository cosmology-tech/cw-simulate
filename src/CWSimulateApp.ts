import { fromBase64, toBase64 } from '@cosmjs/encoding';
import { QuerierBase } from '@terran-one/cosmwasm-vm-js';
import { Err, Ok, Result } from 'ts-results';
import { WasmModule, WasmQuery } from './modules/wasm';
import { BankModule, BankQuery } from './modules/bank';
import { fromImmutable, toImmutable, Transactional, TransactionalLens } from './store/transactional';
import { AppResponse, Binary } from './types';
import { getArrayBuffer, isArrayBufferLike, isArrayLike } from './util';

const TYPED_ARRAYS = [
  null,
  ArrayBuffer,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
]

export interface CWSimulateAppOptions {
  chainId: string;
  bech32Prefix: string;
}

export type ChainData = {
  height: number;
  time: number;
}

export class CWSimulateApp {
  public chainId: string;
  public bech32Prefix: string;

  public store: TransactionalLens<ChainData>;

  public wasm: WasmModule;
  public bank: BankModule;
  public querier: Querier;

  constructor(options: CWSimulateAppOptions) {
    this.chainId = options.chainId;
    this.bech32Prefix = options.bech32Prefix;
    this.store = new Transactional().lens<ChainData>().initialize({
      height: 1,
      time: Date.now(),
    });

    this.wasm = new WasmModule(this);
    this.bank = new BankModule(this);
    this.querier = new Querier(this);
  }

  public async handleMsg(
    sender: string,
    msg: any,
    trace: any = []
  ): Promise<Result<AppResponse, string>> {
    if ('wasm' in msg) {
      return await this.wasm.handleMsg(sender, msg.wasm, trace);
    } else if ('bank' in msg) {
      return await this.bank.handleMsg(sender, msg.bank);
    } else {
      return Err(`unknown message: ${JSON.stringify(msg)}`);
    }
  }
  
  public pushBlock<T>(callback: () => Result<T, string>): Result<T, string>;
  public pushBlock<T>(callback: () => Promise<Result<T, string>>): Promise<Result<T, string>>;
  public pushBlock<T>(callback: () => Result<T, string> | Promise<Result<T, string>>): Result<T, string> | Promise<Result<T, string>> {
    //@ts-ignore
    return this.store.tx(setter => {
      setter('height')(this.height + 1);
      setter('time')(Date.now());
      return callback();
    });
  }
  
  public serialize() {
    return JSON.stringify({
      chainId: this.chainId,
      bech32Prefix: this.bech32Prefix,
      data: toPersistable(fromImmutable(this.store.db.data)),
    });
  }
  
  static deserialize(str: string) {
    const json = JSON.parse(str);
    const {
      bech32Prefix,
      chainId,
      data,
    } = json;
    
    const inst = new CWSimulateApp({ chainId, bech32Prefix });
    inst.store.db.tx(update => {
      update(() => toImmutable(fromPersistable(data)));
      return Ok(undefined);
    });
    return inst;
  }
  
  get height() { return this.store.get('height') }
  get time() { return this.store.get('time') }
}

export type QueryMessage =
  | { bank: BankQuery }
  | { wasm: WasmQuery };

type PersistedTypedArray = {
  /** Corresponds to TYPED_ARRAYS index */
  __TYPEDARRAY__: number;
  /** Base64 encoded binary data */
  data: string;
}

export class Querier extends QuerierBase {
  constructor(public readonly app: CWSimulateApp) {
    super();
  }

  handleQuery(query: QueryMessage): Result<Binary, string> {
    if ('bank' in query) {
      return this.app.bank.handleQuery(query.bank);
    } else if ('wasm' in query) {
      return this.app.wasm.handleQuery(query.wasm);
    } else {
      return Err('Unknown query message');
    }
  }
}

/** Alter given data for optimized JSON stringification. Intended for internal use & testing only. */
export function toPersistable(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (isArrayLike(obj)) {
    if (isArrayBufferLike(obj)) {
      return toPersistedTypedArray(obj);
    } else {
      return obj.map(item => toPersistable(item));
    }
  } else {
    return Object.fromEntries(Object.entries(obj).map(([prop, value]) => [prop, toPersistable(value)]));
  }
}

/** Restore data from altered persistable representation. Inverse of `toPersistable`. Intended for internal use & testing only. */
export function fromPersistable(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if ('__TYPEDARRAY__' in obj) {
    return fromPersistedTypedArray(obj);
  } else if (isArrayLike(obj)) {
    return obj.map(item => fromPersistable(item));
  } else {
    return Object.fromEntries(Object.entries(obj).map(([prop, value]) => [prop, fromPersistable(value)]));
  }
}

function toPersistedTypedArray(obj: ArrayBuffer | ArrayBufferView): PersistedTypedArray {
  const data = getArrayBuffer(obj)!;
  const idx = TYPED_ARRAYS.findIndex(constr => !!constr && obj instanceof constr);
  if (idx === -1) throw new Error('Unknown TypedArray');
  if (idx ===  0) throw new Error('Contingency Error');
  return {
    __TYPEDARRAY__: idx,
    data: toBase64(new Uint8Array(data)),
  };
}

function fromPersistedTypedArray(obj: PersistedTypedArray): ArrayBuffer | ArrayBufferView {
  const { __TYPEDARRAY__: idx, data } = obj;
  if (idx < 1 || idx >= TYPED_ARRAYS.length) throw new Error(`Invalid TypedArray type ${idx}`);
  
  const bytes = new Uint8Array(fromBase64(data));
  if (idx === TYPED_ARRAYS.indexOf(ArrayBuffer)) {
    return bytes.buffer;
  } else {
    //@ts-ignore b/c we handle the only two invalid cases above
    return new TYPED_ARRAYS[idx](bytes.buffer);
  }
}
