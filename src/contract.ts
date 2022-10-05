import {
  BasicBackendApi,
  BasicKVIterStorage,
  BasicQuerier,
  IBackend,
  IIterStorage,
  VMInstance,
} from '@terran-one/cosmwasm-vm-js';

import { CWChain } from './chain';
import { cloneDeep } from 'lodash';

export class CWContractCode {
  constructor(
    public codeId: number,
    public wasmBytecode: Buffer
  ) {}
}

export interface Env {
  block: {
    height: number;
    time: string;
    chain_id: string;
  };
  contract: {
    address: string;
  };
}

export interface Coin {
  amount: string;
  denom: string;
}

export interface MsgInfo {
  sender: string;
  funds: Coin[];
}

export type ExecutionHistoryRecord = {
  request: {
    env: Env,
    info: MsgInfo,
  } & (
    | {
        instantiateMsg: any;
      }
    | {
        executeMsg: any;
      }
  );
  response: any;
  state: IIterStorage;
}

export class CWContractInstance {
  public vm: VMInstance;
  public executionHistory: ExecutionHistoryRecord[] = [];

  private _chain: () => CWChain;

  constructor(
    chain: CWChain,
    public contractAddress: string,
    public contractCode: CWContractCode,
    public storage: IIterStorage = new BasicKVIterStorage()
  ) {
    this._chain = () => chain;

    let backend: IBackend = {
      backend_api: new BasicBackendApi(chain.bech32Prefix),
      storage: this.storage,
      querier: new BasicQuerier(),
    };
    this.vm = new VMInstance(backend);
  }

  async build() {
    await this.vm.build(this.contractCode.wasmBytecode);
  }

  getExecutionEnv(): Env {
    return {
      block: {
        height: this._chain().height,
        time: this._chain().time.toFixed(),
        chain_id: this._chain().chainId,
      },
      contract: {
        address: this.contractAddress,
      },
    };
  }

  instantiate(info: MsgInfo, instantiateMsg: any): any {
    let env = this.getExecutionEnv();
    const response = this.vm.instantiate(env, info, instantiateMsg).json;

    this.executionHistory.push({
      request: {
        env,
        info,
        instantiateMsg,
      },
      response,
      state: cloneDeep(this.storage),
    });
    return response;
  }

  execute(info: MsgInfo, executeMsg: any): any {
    let env = this.getExecutionEnv();
    const response = this.vm.execute(env, info, executeMsg).json;

    this.executionHistory.push({
      request: {
        env,
        info,
        executeMsg,
      },
      response,
      // @ts-ignore
      state: cloneDeep(this.storage),
    });

    return response;
  }

  query(queryMsg: any): any {
    return this.vm.query(this.getExecutionEnv(), queryMsg).json;
  }
}
