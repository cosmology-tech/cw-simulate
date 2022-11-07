import { Sha256 } from '@cosmjs/crypto';
import { fromBase64, fromUtf8, toBech32 } from '@cosmjs/encoding';
import { CWSimulateApp } from 'CWSimulateApp';
import {
  BasicBackendApi,
  BasicKVIterStorage,
  IBackend,
} from '@terran-one/cosmwasm-vm-js';
import { CWSimulateVMInstance } from '../instrumentation/CWSimulateVMInstance';

import {
  AppResponse,
  CodeInfo,
  Coin,
  ContractInfo,
  ContractResponse,
  Event,
  ExecuteEnv,
  ReplyMsg,
  ReplyOn,
  RustResult,
  SubMsg,
  TraceLog,
} from '../types';
import { Map } from 'immutable';
import { Err, Ok, Result } from 'ts-results';

function numberToBigEndianUint64(n: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, n, false);
  view.setUint32(4, 0, false);
  return new Uint8Array(buffer);
}

export interface Execute {
  contract_addr: String;
  msg: string;
  funds: { denom: string; amount: string }[];
}

export interface Instantiate {
  admin: string | null;
  code_id: number;
  msg: string;
  funds: { denom: string; amount: string }[];
  label: string;
}

export type WasmMsg =
  | { wasm: { execute: Execute } }
  | { wasm: { instantiate: Instantiate } };

export class WasmModule {
  public lastCodeId: number;
  public lastInstanceId: number;

  constructor(public chain: CWSimulateApp) {
    chain.store.set('wasm', { codes: {}, contracts: {}, contractStorage: {} });

    this.lastCodeId = 0;
    this.lastInstanceId = 0;
  }

  static buildContractAddress(codeId: number, instanceId: number): Uint8Array {
    let contractId = new Uint8Array([
      ...numberToBigEndianUint64(codeId),
      ...numberToBigEndianUint64(instanceId),
    ]);

    // append module name
    let mKey = new Uint8Array([
      ...Uint8Array.from(Buffer.from('wasm', 'utf-8')),
      0,
    ]);
    let payload = new Uint8Array([...mKey, ...contractId]);

    let hasher = new Sha256();
    hasher.update(Buffer.from('module', 'utf-8'));
    let th = hasher.digest();
    hasher = new Sha256(th);
    hasher.update(payload);
    let hash = hasher.digest();
    return hash.slice(0, 20);
  }

  setContractStorage(contractAddress: string, value: Map<string, string>) {
    this.chain.store = this.chain.store.setIn(
      ['wasm', 'contractStorage', contractAddress],
      value
    );
  }

  getContractStorage(contractAddress: string): Map<string, string> {
    return this.chain.store.getIn([
      'wasm',
      'contractStorage',
      contractAddress,
    ]) as Map<string, string>;
  }

  setCodeInfo(codeId: number, codeInfo: CodeInfo) {
    this.chain.store = this.chain.store.setIn(
      ['wasm', 'codes', codeId],
      codeInfo
    );
  }

  getCodeInfo(codeId: number): CodeInfo {
    return this.chain.store.getIn(['wasm', 'codes', codeId]) as CodeInfo;
  }

  setContractInfo(contractAddress: string, contractInfo: ContractInfo) {
    this.chain.store = this.chain.store.setIn(
      ['wasm', 'contracts', contractAddress],
      contractInfo
    );
  }

  getContractInfo(contractAddress: string): ContractInfo | undefined {
    return this.chain.store.getIn([
      'wasm',
      'contracts',
      contractAddress,
    ]) as ContractInfo;
  }

  deleteContractInfo(contractAddress: string) {
    this.chain.store = this.chain.store.deleteIn([
      'wasm',
      'contracts',
      contractAddress,
    ]);
  }

  create(creator: string, wasmCode: Uint8Array): number {
    let codeInfo = {
      creator,
      wasmCode,
    };

    this.setCodeInfo(this.lastCodeId + 1, codeInfo);
    this.lastCodeId += 1;
    return this.lastCodeId;
  }

  getExecutionEnv(contractAddress: string): ExecuteEnv {
    return {
      block: {
        height: this.chain.height,
        time: this.chain.time.toFixed(),
        chain_id: this.chain.chainId,
      },
      contract: {
        address: contractAddress,
      },
    };
  }

  async buildVM(contractAddress: string): Promise<CWSimulateVMInstance> {
    const contractInfo = this.getContractInfo(contractAddress);
    if (!contractInfo) {
      throw new Error(`contract ${contractAddress} not found`);
    }

    const { codeId } = contractInfo;
    const codeInfo = this.getCodeInfo(codeId);
    if (!codeInfo) {
      throw new Error(`code ${codeId} not found`);
    }

    const { wasmCode } = codeInfo;
    const contractState = this.getContractStorage(contractAddress);

    let storage = new BasicKVIterStorage();
    storage.dict = contractState;

    let backend: IBackend = {
      backend_api: new BasicBackendApi(this.chain.bech32Prefix),
      storage,
      querier: this.chain.querier,
    };

    let vm = new CWSimulateVMInstance(backend);
    await vm.build(wasmCode);
    return vm;
  }

  // TODO: add admin, label, etc.
  registerContractInstance(sender: string, codeId: number): string {
    const contractAddressHash = WasmModule.buildContractAddress(
      codeId,
      this.lastInstanceId + 1
    );

    const contractAddress = toBech32(
      this.chain.bech32Prefix,
      contractAddressHash
    );

    const contractInfo = {
      codeId,
      creator: sender,
      admin: null,
      label: '',
      created: this.chain.height,
    };

    this.setContractInfo(contractAddress, contractInfo);
    this.setContractStorage(contractAddress, Map<string, string>());

    this.lastInstanceId += 1;
    return contractAddress;
  }

  async callInstantiate(
    sender: string,
    funds: Coin[],
    contractAddress: string,
    instantiateMsg: any,
    debugMsgs: string[] = [],
    callHistory: any[] = []
  ): Promise<RustResult<ContractResponse>> {
    let vm = await this.buildVM(contractAddress);
    let env = this.getExecutionEnv(contractAddress);
    let info = { sender, funds };

    let res = vm.instantiate(env, info, instantiateMsg)
      .json as RustResult<ContractResponse>;

    this.setContractStorage(
      contractAddress,
      (vm.backend.storage as BasicKVIterStorage).dict
    );

    debugMsgs.push(...vm.debugMsgs);
    callHistory.push(...vm.callHistory);

    return res;
  }

  async instantiateContract(
    sender: string,
    funds: Coin[],
    codeId: number,
    instantiateMsg: any,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    // first register the contract instance
    let snapshot = this.chain.store;
    const contractAddress = this.registerContractInstance(sender, codeId);
    let debugMsgs: string[] = [];
    let callHistory: any[] = [];

    // then call instantiate
    let response = await this.callInstantiate(
      sender,
      funds,
      contractAddress,
      instantiateMsg,
      debugMsgs,
      callHistory
    );

    if ('error' in response) {
      // revert the contract instance registration
      this.lastInstanceId -= 1;
      this.deleteContractInfo(contractAddress);
      this.chain.store = snapshot;
      trace.push({
        type: 'instantiate' as 'instantiate',
        contractAddress,
        msg: instantiateMsg,
        response,
        info: {
          sender,
          funds,
        },
        env: this.getExecutionEnv(contractAddress),
        debugMsgs,
        callHistory,
        storeSnapshot: snapshot,
      });
      return Err(response.error);
    } else {
      let customEvent: Event = {
        type: 'instantiate',
        attributes: [
          { key: '_contract_address', value: contractAddress },
          { key: 'code_id', value: codeId.toString() },
        ],
      };
      let res = this.buildAppResponse(
        contractAddress,
        customEvent,
        response.ok
      );

      let subtrace: TraceLog[] = [];

      let result = await this.handleContractResponse(
        contractAddress,
        response.ok.messages,
        res,
        subtrace
      );

      trace.push({
        type: 'instantiate' as 'instantiate',
        contractAddress,
        msg: instantiateMsg,
        response,
        info: {
          sender,
          funds,
        },
        env: this.getExecutionEnv(contractAddress),
        debugMsgs,
        callHistory,
        trace: subtrace,
        storeSnapshot: this.chain.store,
      });

      return result;
    }
  }

  async callExecute(
    sender: string,
    funds: Coin[],
    contractAddress: string,
    executeMsg: any,
    debugMsgs: string[] = [],
    callHistory: any[] = []
  ): Promise<RustResult<ContractResponse>> {
    let vm = await this.buildVM(contractAddress);

    let env = this.getExecutionEnv(contractAddress);
    let info = { sender, funds };

    let res = vm.execute(env, info, executeMsg)
      .json as RustResult<ContractResponse>;

    this.setContractStorage(
      contractAddress,
      (vm.backend.storage as BasicKVIterStorage).dict
    );

    debugMsgs.push(...vm.debugMsgs);
    callHistory.push(...vm.callHistory);

    return res;
  }

  async executeContract(
    sender: string,
    funds: Coin[],
    contractAddress: string,
    executeMsg: any,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    let snapshot = this.chain.store;
    let debugMsgs: string[] = [];
    let callHistory: any[] = [];

    let response = await this.callExecute(
      sender,
      funds,
      contractAddress,
      executeMsg,
      debugMsgs,
      callHistory
    );
    if ('error' in response) {
      this.chain.store = snapshot; // revert
      trace.push({
        type: 'execute' as 'execute',
        contractAddress,
        msg: executeMsg,
        response,
        env: this.getExecutionEnv(contractAddress),
        info: {
          sender,
          funds,
        },
        debugMsgs,
        callHistory,
        storeSnapshot: snapshot,
      });
      return Err(response.error);
    } else {
      let customEvent = {
        type: 'execute',
        attributes: [
          {
            key: '_contract_addr',
            value: contractAddress,
          },
        ],
      };
      let res = this.buildAppResponse(
        contractAddress,
        customEvent,
        response.ok
      );
      let subtrace: TraceLog[] = [];
      let result = await this.handleContractResponse(
        contractAddress,
        response.ok.messages,
        res,
        subtrace
      );
      trace.push({
        type: 'execute' as 'execute',
        contractAddress,
        msg: executeMsg,
        response,
        info: {
          sender,
          funds,
        },
        env: this.getExecutionEnv(contractAddress),
        trace: subtrace,
        debugMsgs,
        callHistory,
        storeSnapshot: this.chain.store,
      });
      return result;
    }
  }

  async handleContractResponse(
    contractAddress: string,
    messages: ContractResponse['messages'],
    res: AppResponse,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    let snapshot = this.chain.store;
    for (const message of messages) {
      let subres = await this.executeSubmsg(contractAddress, message, trace);
      if (subres.err) {
        this.chain.store = snapshot; // revert
        return subres;
      } else {
        res.events = [...res.events, ...subres.val.events];
        if (subres.val.data !== null) {
          res.data = subres.val.data;
        }
      }
    }

    return Ok({ events: res.events, data: res.data });
  }

  async executeSubmsg(
    contractAddress: string,
    message: SubMsg,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    let { id, msg, gas_limit, reply_on } = message;
    let r = await this.chain.handleMsg(contractAddress, msg, trace);
    if (r.ok) {
      // submessage success
      let { events, data } = r.val;
      if (reply_on === ReplyOn.Success || reply_on === ReplyOn.Always) {
        // submessage success, call reply
        let replyMsg: ReplyMsg = {
          id,
          result: {
            ok: {
              events,
              data,
            },
          },
        };
        let replyRes = await this.reply(contractAddress, replyMsg, trace);
        if (replyRes.err) {
          // submessage success, call reply, reply failed
          return replyRes;
        } else {
          // submessage success, call reply, reply success
          if (replyRes.val.data !== null) {
            data = replyRes.val.data;
          }
          events = [...events, ...replyRes.val.events];
        }
      } else {
        // submessage success, don't call reply
        data = null;
      }
      return Ok({ events, data });
    } else {
      // submessage failed
      if (reply_on === ReplyOn.Error || reply_on === ReplyOn.Always) {
        // submessage failed, call reply
        let replyMsg: ReplyMsg = {
          id,
          result: {
            error: r.val,
          },
        };
        let replyRes = await this.reply(contractAddress, replyMsg, trace);
        if (replyRes.err) {
          // submessage failed, call reply, reply failed
          return replyRes;
        } else {
          // submessage failed, call reply, reply success
          let { events, data } = replyRes.val;
          return Ok({ events, data });
        }
      } else {
        // submessage failed, don't call reply (equivalent to normal message)
        return r;
      }
    }
  }

  async callReply(
    contractAddress: string,
    replyMsg: ReplyMsg,
    debugMsgs: string[] = [],
    callHistory: any[] = []
  ): Promise<RustResult<ContractResponse>> {
    let vm = await this.buildVM(contractAddress);
    let res = vm.reply(this.getExecutionEnv(contractAddress), replyMsg)
      .json as RustResult<ContractResponse>;

    this.setContractStorage(
      contractAddress,
      (vm.backend.storage as BasicKVIterStorage).dict
    );

    debugMsgs.push(...vm.debugMsgs);
    callHistory.push(...vm.callHistory);

    return res;
  }

  async reply(
    contractAddress: string,
    replyMsg: ReplyMsg,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    let debugMsgs: string[] = [];
    let callHistory: any[] = [];
    let response = await this.callReply(
      contractAddress,
      replyMsg,
      debugMsgs,
      callHistory
    );
    if ('error' in response) {
      trace.push({
        type: 'reply' as 'reply',
        contractAddress,
        env: this.getExecutionEnv(contractAddress),
        msg: replyMsg,
        response,
        debugMsgs,
        callHistory,
        storeSnapshot: this.chain.store,
      });
      return Err(response.error);
    } else {
      let customEvent = {
        type: 'reply',
        attributes: [
          {
            key: '_contract_addr',
            value: contractAddress,
          },
          {
            key: 'mode',
            value:
              'ok' in replyMsg.result ? 'handle_success' : 'handle_failure',
          },
        ],
      };
      let res = this.buildAppResponse(
        contractAddress,
        customEvent,
        response.ok
      );
      let subtrace: TraceLog[] = [];
      let result = await this.handleContractResponse(
        contractAddress,
        response.ok.messages,
        res,
        subtrace
      );
      trace.push({
        type: 'reply' as 'reply',
        contractAddress,
        msg: replyMsg,
        env: this.getExecutionEnv(contractAddress),
        response,
        trace: subtrace,
        debugMsgs,
        callHistory,
        storeSnapshot: this.chain.store,
      });
      return result;
    }
  }

  async query(
    contractAddress: string,
    queryMsg: any
  ): Promise<Result<any, string>> {
    let vm = await this.buildVM(contractAddress);
    let env = this.getExecutionEnv(contractAddress);
    let res = vm.query(env, queryMsg).json as RustResult<string>;

    if ('ok' in res) {
      return Ok(JSON.parse(fromUtf8(fromBase64(res.ok))));
    } else {
      return Err(res.error);
    }
  }

  buildAppResponse(
    contract: string,
    customEvent: Event,
    response: ContractResponse
  ): AppResponse {
    let appEvents = [];
    // add custom event
    appEvents.push(customEvent);

    // add contract attributes under `wasm` event type
    if (response.attributes.length > 0) {
      appEvents.push({
        type: 'wasm',
        attributes: [
          {
            key: '_contract_addr',
            value: contract,
          },
          ...response.attributes,
        ],
      });
    }

    // add events and prefix with `wasm-`
    for (const event of response.events) {
      appEvents.push({
        type: `wasm-${event.type}`,
        attributes: [
          { key: '_contract_addr', value: contract },
          ...event.attributes,
        ],
      });
    }

    return {
      events: appEvents,
      data: response.data,
    };
  }

  async handleMsg(
    sender: string,
    msg: any,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    let { wasm } = msg;
    if ('execute' in wasm) {
      let { contract_addr, funds, msg } = wasm.execute;
      let msgJSON = fromUtf8(fromBase64(msg));
      return await this.executeContract(
        sender,
        funds,
        contract_addr,
        JSON.parse(msgJSON),
        trace
      );
    } else if ('instantiate' in wasm) {
      throw new Error('unimplemented');
    } else {
      throw new Error('Unknown wasm message');
    }
  }
}
