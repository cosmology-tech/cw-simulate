import { Sha256 } from '@cosmjs/crypto';
import { fromAscii, fromBase64, fromUtf8, toBech32 } from '@cosmjs/encoding';
import { CWSimulateApp } from 'CWSimulateApp';
import {
  BasicBackendApi,
  BasicKVIterStorage,
  BasicQuerier,
  IBackend,
  VMInstance,
} from '@terran-one/cosmwasm-vm-js';
import { ContractResponse, RustResult, SubMsg } from '../cw-interface';
import { Map } from 'immutable';
import { Result, Ok, Err } from 'ts-results';

export interface AppResponse {
  events: any[];
  data: string | null;
}

function numberToBigEndianUint64(n: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, n, false);
  view.setUint32(4, 0, false);
  return new Uint8Array(buffer);
}

export interface Coin {
  denom: string;
  amount: string;
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

  create(creator: string, wasmCode: Uint8Array): number {
    let codeInfo = {
      creator,
      wasmCode,
    };

    this.chain.store = this.chain.store.setIn(
      ['wasm', 'codes', this.lastCodeId + 1],
      codeInfo
    );
    this.lastCodeId += 1;
    return this.lastCodeId;
  }

  getExecutionEnv(contractAddress: string): any {
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

  async buildVM(contractAddress: string): Promise<VMInstance> {
    // @ts-ignore
    let { codeId } = this.chain.store.getIn([
      'wasm',
      'contracts',
      contractAddress,
    ]);
    // @ts-ignore
    let { wasmCode } = this.chain.store.getIn(['wasm', 'codes', codeId]);

    let backend: IBackend = {
      backend_api: new BasicBackendApi(this.chain.bech32Prefix),
      // @ts-ignore
      storage: this.chain.store.getIn([
        'wasm',
        'contractStorage',
        contractAddress,
      ]),
      querier: new BasicQuerier(),
    };

    let vm = new VMInstance(backend);
    await vm.build(wasmCode);
    return vm;
  }

  async instantiate(
    sender: string,
    funds: Coin[],
    codeId: number,
    instantiateMsg: any
  ): Promise<any> {
    // TODO: add funds logic

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

    this.chain.store = this.chain.store.setIn(
      ['wasm', 'contracts', contractAddress],
      contractInfo
    );
    this.chain.store = this.chain.store.setIn(
      ['wasm', 'contractStorage', contractAddress],
      new BasicKVIterStorage()
    );
    this.lastInstanceId += 1;

    let vm = await this.buildVM(contractAddress);

    let env = this.getExecutionEnv(contractAddress);
    let info = { sender, funds };

    let res = vm.instantiate(env, info, instantiateMsg)
      .json as RustResult<ContractResponse.Data>;
    if ('ok' in res) {
      let response = await this.handleContractResponse(contractAddress, res.ok);
      return {
        contractAddress,
        response,
      };
    } else {
      return res;
    }
  }

  async execute(
    sender: string,
    funds: Coin[],
    contractAddress: string,
    executeMsg: any
  ): Promise<Result<AppResponse, string>> {
    let contractInfo = this.chain.store.getIn([
      'wasm',
      'contracts',
      contractAddress,
    ]);
    if (contractInfo === undefined) {
      throw new Error(`Contract ${contractAddress} does not exist`);
    }

    let vm = await this.buildVM(contractAddress);

    let env = this.getExecutionEnv(contractAddress);
    let info = { sender, funds };

    let snapshot = this.chain.store;

    let res = vm.execute(env, info, executeMsg)
      .json as RustResult<ContractResponse.Data>;
    if ('ok' in res) {
      return await this.handleContractResponse(contractAddress, res.ok);
    } else {
      this.chain.store = snapshot;
      return Err(res.error);
    }
  }

  async handleContractResponse(
    contractAddress: string,
    res: ContractResponse.Data
  ): Promise<Result<AppResponse, string>> {
    let { messages, events, attributes, data } = res;
    let snapshot = this.chain.store;
    let contractStorage = this.chain.store.getIn([
      'wasm',
      'contractStorage',
      contractAddress,
    ]) as BasicKVIterStorage;
    let contractSnapshot = new BasicKVIterStorage();
    contractSnapshot.dict = contractStorage.dict;

    for (const message of messages) {
      let subres = await this.executeSubmsg(contractAddress, message);
      if (subres.err) {
        this.chain.store = snapshot;
        this.chain.store = this.chain.store.setIn(
          ['wasm', 'contractStorage', contractAddress],
          contractSnapshot
        );
        return subres;
      } else {
        events = [...events, ...subres.val.events];
        if (subres.val.data === null) {
          data = subres.val.data;
        }
      }
    }

    return Ok({ events, data });
  }

  async executeSubmsg(
    contractAddress: string,
    message: SubMsg.Data
  ): Promise<Result<AppResponse, string>> {
    let { id, msg, gas_limit, reply_on } = message;
    let r = await this.chain.handleMsg(contractAddress, msg);
    if (r.ok) {
      // submessage success
      let { events, data } = r.val;
      if (reply_on === 'success' || reply_on === 'always') {
        // submessage success, call reply
        let replyMsg = {
          id,
          result: {
            ok: {
              events,
              data,
            },
          },
        };
        let replyRes = await this.reply(contractAddress, replyMsg);
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
      if (reply_on === 'error' || reply_on === 'always') {
        // submessage failed, call reply
        let replyMsg = {
          id,
          result: {
            error: r.val,
          },
        };
        let replyRes = await this.reply(contractAddress, replyMsg);
        if (replyRes.ok) {
          // submessage failed, call reply, reply success
          let { events, data } = replyRes.val;
          return Ok({ events, data });
        } else {
          // submessage failed, call reply, reply failed
          return replyRes;
        }
      } else {
        // submessage failed, don't call reply (equivalent to normal message)
        return r;
      }
    }
  }

  async reply(
    contractAddress: string,
    replyMsg: any
  ): Promise<Result<AppResponse, string>> {
    let vm = await this.buildVM(contractAddress);
    let res = vm.reply(this.getExecutionEnv(contractAddress), replyMsg)
      .json as RustResult<ContractResponse.Data>;
    if ('ok' in res) {
      // handle response
      return await this.handleContractResponse(contractAddress, res.ok);
    } else {
      return Err(res.error);
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

  async handleMsg(
    sender: string,
    msg: any
  ): Promise<Result<AppResponse, string>> {
    let { wasm } = msg;
    if ('execute' in wasm) {
      let { contract_addr, funds, msg } = wasm.execute;
      let msgJSON = fromUtf8(fromBase64(msg));
      return await this.execute(
        sender,
        funds,
        contract_addr,
        JSON.parse(msgJSON)
      );
    } else if ('instantiate' in wasm.instantiate) {
      throw new Error('unimplemented');
    } else {
      throw new Error('Unknown wasm message');
    }
  }
}
