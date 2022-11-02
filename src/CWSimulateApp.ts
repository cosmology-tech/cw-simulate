import { QuerierBase } from '@terran-one/cosmwasm-vm-js';
import { Map } from 'immutable';
import { Result, Err } from 'ts-results';
import { WasmModule } from './modules/wasm';
import { BankModule, BankQuery } from './modules/bank';
import { AppResponse } from './cw-interface';

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
      return await this.wasm.handleMsg(sender, msg, trace);
    } else if ('bank' in msg) {
      return await this.bank.handleMsg(sender, msg.bank);
    } else {
      return Err(`unknown message: ${JSON.stringify(msg)}`);
    }
  }
}

type QueryMessage =
  | {
      bank: BankQuery;
    }

export class Querier extends QuerierBase {
  constructor(public readonly app: CWSimulateApp) {
    super();
  }
  
  handleQuery(query: QueryMessage) {
    if ('bank' in query) {
      return this.app.bank.handleQuery(query.bank);
    }
    else {
      return Err('Unknown query message');
    }
  }
}
