import { QuerierBase } from '@terran-one/cosmwasm-vm-js';
import { Map } from 'immutable';
import { Err, Result } from 'ts-results';
import { WasmModule, WasmQuery } from './modules/wasm';
import { BankModule, BankQuery } from './modules/bank';
import { AppResponse, Binary } from './types';

export interface CWSimulateAppOptions {
  chainId: string;
  bech32Prefix: string;
}

export class CWSimulateApp {
  public chainId: string;
  public bech32Prefix: string;

  public store: Map<string, any>;
  public height: number;
  public time: number;

  public wasm: WasmModule;
  public bank: BankModule;
  public querier: Querier;

  constructor(options: CWSimulateAppOptions) {
    this.chainId = options.chainId;
    this.bech32Prefix = options.bech32Prefix;
    this.store = Map<string, any>();
    this.height = 1;
    this.time = 0;

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
