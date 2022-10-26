import {
  BasicBackendApi,
  BasicKVIterStorage,
  BasicQuerier,
  IBackend,
  IIterStorage,
  VMInstance,
} from '@terran-one/cosmwasm-vm-js';

import { Ok, Err, Result } from 'ts-results';

import { CWSimulateApp } from './CWSimulateApp';
import { ContractResponse } from './cw-interface';

export class CWContractCode {
  constructor(public codeId: number, public wasmBytecode: Buffer) {}
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
    env: Env;
    info: MsgInfo;
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
};

export class ExecResponse {
  constructor(
    public messages: any[],
    public events: any[],
    public attributes: any[],
    public data: string | null
  ) {}
}

export class ExecError {
  constructor(public error: string) {}
}

export type RustResult<T, E> =
  | {
      ok: T;
    }
  | { error: E };

export interface Response {
  messages: any[];
  events: any[];
  attributes: any[];
  data: string | null;
}

function rust2TsResult<T>(r: RustResult<T, string>): Result<T, Error> {
  if ('ok' in r) {
    return Ok(r.ok);
  } else {
    return Err(new Error(r.error));
  }
}

export class CWContractInstance {
  public vm: VMInstance;
  public executionHistory: ExecutionHistoryRecord[] = [];

  private _chain: () => CWSimulateApp;

  constructor(
    chain: CWSimulateApp,
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

  instantiate(
    info: MsgInfo,
    instantiateMsg: any
  ): Result<ContractResponse, Error> {
    let env = this.getExecutionEnv();
    let result = rust2TsResult(
      this.vm.instantiate(env, info, instantiateMsg).json as RustResult<
        Response,
        string
      >
    );
    if (result.ok) {
      return Ok(ContractResponse.fromData(result.val));
    } else {
      return Err(result.val);
    }
  }

  execute(info: MsgInfo, executeMsg: any): Result<ContractResponse, Error> {
    let env = this.getExecutionEnv();
    let result = rust2TsResult(
      this.vm.execute(env, info, executeMsg).json as RustResult<
        Response,
        string
      >
    );
    if (result.ok) {
      return Ok(ContractResponse.fromData(result.val));
    } else {
      return Err(result.val);
    }
  }

  query(queryMsg: any): Result<any, Error> {
    let env = this.getExecutionEnv();
    let result = rust2TsResult(
      this.vm.query(env, queryMsg).json as RustResult<any, string>
    );
    if (result.ok) {
      // result.val = base64-encoded string with json
      let json = JSON.parse(Buffer.from(result.val, 'base64').toString('utf8'));
      return Ok(json);
    } else {
      return Err(result.val);
    }
  }
}
