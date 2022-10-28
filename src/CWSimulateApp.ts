import { WasmModule } from './modules/wasm';
import { BankModule } from './modules/bank';
import { AppResponse } from './cw-interface';
import { Map } from 'immutable';
import { Result, Ok, Err } from 'ts-results';

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

  constructor(options: CWSimulateAppOptions) {
    this.chainId = options.chainId;
    this.bech32Prefix = options.bech32Prefix;
    this.store = Map<string, any>();
    this.height = 1;
    this.time = 0;

    this.wasm = new WasmModule(this);
    this.bank = new BankModule(this);
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
