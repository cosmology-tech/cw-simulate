import { WasmModule } from './modules/wasm';
import { AppResponse } from './cw-interface';
import { Result, Ok, Err } from 'ts-results';

export interface CWSimulateAppOptions {
  chainId: string;
  bech32Prefix: string;
}

export class CWSimulateApp {
  public chainId: string;
  public bech32Prefix: string;

  public store: any;
  public height: number;
  public time: number;

  public wasm: WasmModule;

  constructor(options: CWSimulateAppOptions) {
    this.chainId = options.chainId;
    this.bech32Prefix = options.bech32Prefix;
    this.store = {};
    this.height = 1;
    this.time = 0;

    this.wasm = new WasmModule(this);
  }

  public async handleMsg(
    sender: string,
    msg: any
  ): Promise<Result<AppResponse, string>> {
    if ('wasm' in msg) {
      return await this.wasm.handleMsg(sender, msg);
    }

    return Err(`unknown message: ${JSON.stringify(msg)}`);
  }
}
