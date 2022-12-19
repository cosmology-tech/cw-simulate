import { QuerierBase } from '@terran-one/cosmwasm-vm-js';
import { Err, Ok, Result } from 'ts-results';
import { WasmModule, WasmQuery } from './modules/wasm';
import { BankModule, BankQuery } from './modules/bank';
import { fromImmutable, toImmutable, Transactional, TransactionalLens } from './store/transactional';
import { AppResponse, Binary } from './types';

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
  
  get height() { return this.store.get('height') }
  get time() { return this.store.get('time') }
}

export type QueryMessage =
  | { bank: BankQuery }
  | { wasm: WasmQuery };

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
