import { toBech32 } from '@cosmjs/encoding';
import type { CWSimulateApp } from '../../CWSimulateApp';

import {
  AppResponse,
  Binary,
  CodeInfo,
  Coin,
  ContractInfo,
  ContractInfoResponse,
  ContractResponse,
  Event,
  ExecuteEnv,
  ReplyMsg,
  ReplyOn,
  SubMsg,
  TraceLog,
  DebugLog,
  Snapshot,
} from '../../types';
import { Map } from 'immutable';
import { Err, Ok, Result } from 'ts-results';
import { fromBinary, toBinary } from '../../util';
import { NEVER_IMMUTIFY, Transactional, TransactionalLens } from '../../store/transactional';
import { buildAppResponse, buildContractAddress } from './wasm-util';
import Contract from './contract';

type WasmData = {
  lastCodeId: number;
  lastInstanceId: number;
  codes: Record<number, CodeInfo>;
  contracts: Record<string, ContractInfo>;
  contractStorage: Record<string, Record<string, string>>;
}

export interface Execute {
  contract_addr: string;
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

export interface SmartQuery {
  contract_addr: string;
  msg: string; // Binary
}

export interface RawQuery {
  contract_addr: string;
  key: string; // Binary
}

export interface ContractInfoQuery {
  contract_addr: string;
}

export type WasmMsg =
  | { execute: Execute }
  | { instantiate: Instantiate };

export type WasmQuery =
  | { smart: SmartQuery }
  | { raw: RawQuery }
  | { contract_info: ContractInfoQuery };

export class WasmModule {
  public readonly store: TransactionalLens<WasmData>;
  
  // TODO: benchmark w/ many coexisting VMs
  private contracts: Record<string, Contract> = {};

  constructor(public chain: CWSimulateApp) {
    this.store = chain.store.db.lens<WasmData>('wasm').initialize({
      lastCodeId: 0,
      lastInstanceId: 0,
      codes: {},
      contracts: {},
      contractStorage: {},
    });
  }

  setContractStorage(contractAddress: string, value: Map<string, string>) {
    this.store.tx(setter => {
      setter('contractStorage', contractAddress)(value);
      return Ok(undefined);
    });
  }

  getContractStorage(contractAddress: string, storage?: Snapshot) {
    return this.lens(storage).get('contractStorage', contractAddress) ?? Map();
  }

  setCodeInfo(codeId: number, codeInfo: CodeInfo) {
    this.store.tx(setter => {
      setter('codes', codeId)(codeInfo);
      return Ok(undefined);
    });
  }

  getCodeInfo(codeId: number, storage?: Snapshot) {
    const lens = this.lens(storage).lens('codes', codeId);
    if (!lens) return;
    
    const codeInfo: CodeInfo = {
      creator: lens.get('creator'),
      wasmCode: new Uint8Array(lens.get('wasmCode')),
    };
    return codeInfo;
  }

  setContractInfo(contractAddress: string, contractInfo: ContractInfo) {
    this.store.tx(setter => {
      setter('contracts', contractAddress)(contractInfo);
      return Ok(undefined);
    });
  }

  getContractInfo(contractAddress: string, storage?: Snapshot) {
    const lens = this.lens(storage).lens('contracts', contractAddress);
    if (!lens) return;
    return lens.data.toObject() as any as ContractInfo;
  }

  /** Store a new CosmWasm smart contract bytecode */
  storeCode(creator: string, wasmCode: Uint8Array) {
    return this.chain.pushBlock(() => {
      return this.store.tx(setter => {
        let codeInfo: CodeInfo = {
          creator,
          wasmCode,
        };

        const codeId = this.lastCodeId + 1;
        this.setCodeInfo(codeId, codeInfo);
        setter('lastCodeId')(codeId);
        return Ok(codeId);
      });
    });
  }

  /** Alias for `storeCode`, except it `.unwrap`s the result - kept for backwards compatibility */
  create(creator: string, wasmCode: Uint8Array): number {
    return this.storeCode(creator, wasmCode).unwrap();
  }

  /** Get the `ExecuteEnv` under which the next execution should run */
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

  getContract(address: string) {
    if (!this.contracts[address]) {
      this.contracts[address] = new Contract(this, address);
    }
    return this.contracts[address]!;
  }

  /** Register a new contract instance from codeId */
  protected registerContractInstance(sender: string, codeId: number, label = '', admin: string | null = null): Result<string, string> {
    return this.store.tx(setter => {
      const contractAddressHash = buildContractAddress(
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
        admin,
        label,
        created: this.chain.height,
      };

      this.setContractInfo(contractAddress, contractInfo);
      this.setContractStorage(contractAddress, Map<string, string>());

      setter('lastInstanceId')(this.lastInstanceId + 1);
      return Ok(contractAddress);
    });
  }

  async instantiateContract(
    sender: string,
    funds: Coin[],
    codeId: number,
    instantiateMsg: any,
    label:string,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    return await this.chain.pushBlock(async () => {
      const snapshot = this.store.db.data;
      
      // first register the contract instance
      const contractAddress = this.registerContractInstance(sender, codeId, label).unwrap();
      let logs = [] as DebugLog[];
      
      const contract = await this.getContract(contractAddress).init();

      const send = this.chain.bank.send(sender, contract.address, funds);
      if (send.err) return send;

      // then call instantiate
      let response = contract.instantiate(
        sender,
        funds,
        instantiateMsg,
        logs
      );

      if (response.err) {
        let result = Err(response.val);
        trace.push({
          [NEVER_IMMUTIFY]: true,
          type: 'instantiate' as 'instantiate',
          contractAddress,
          msg: instantiateMsg,
          response,
          info: {
            sender,
            funds,
          },
          env: this.getExecutionEnv(contractAddress),
          logs,
          storeSnapshot: snapshot,
          result,
        });
        return result;
      }
      else {
        let customEvent: Event = {
          type: 'instantiate',
          attributes: [
            { key: '_contract_address', value: contractAddress },
            { key: 'code_id', value: codeId.toString() },
          ],
        };
        let res = buildAppResponse(
          contractAddress,
          customEvent,
          response.val,
        );

        let subtrace: TraceLog[] = [];

        let result = await this.handleContractResponse(
          contractAddress,
          response.val.messages,
          res,
          subtrace
        );

        trace.push({
          [NEVER_IMMUTIFY]: true,
          type: 'instantiate' as 'instantiate',
          contractAddress,
          msg: instantiateMsg,
          response,
          info: {
            sender,
            funds,
          },
          env: this.getExecutionEnv(contractAddress),
          logs,
          trace: subtrace,
          storeSnapshot: this.store.db.data,
          result,
        });

        return result;
      }
    });
  }

  /** Call execute on the CW SC */
  async executeContract(
    sender: string,
    funds: Coin[],
    contractAddress: string,
    executeMsg: any,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    return await this.chain.pushBlock(async () => {
      const snapshot = this.store.db.data;
      const contract = await this.getContract(contractAddress).init();
      const env = contract.getExecutionEnv();
      const logs: DebugLog[] = [];

      const send = this.chain.bank.send(sender, contractAddress, funds);
      if (send.err) return send;

      const response = contract.execute(
        sender,
        funds,
        executeMsg,
        logs
      );
      
      if (response.err) {
        const result = Err(response.val);
        
        trace.push({
          [NEVER_IMMUTIFY]: true,
          type: 'execute' as 'execute',
          contractAddress,
          msg: executeMsg,
          response,
          env,
          info: {
            sender,
            funds,
          },
          logs,
          storeSnapshot: snapshot,
          result,
        });
        
        return result;
      }
      else {
        let customEvent = {
          type: 'execute',
          attributes: [
            {
              key: '_contract_addr',
              value: contractAddress,
            },
          ],
        };
        
        let res = buildAppResponse(
          contractAddress,
          customEvent,
          response.val,
        );
        
        let subtrace: TraceLog[] = [];
        let result = await this.handleContractResponse(
          contractAddress,
          response.val.messages,
          res,
          subtrace
        );
        
        trace.push({
          [NEVER_IMMUTIFY]: true,
          type: 'execute' as 'execute',
          contractAddress,
          msg: executeMsg,
          response,
          info: {
            sender,
            funds,
          },
          env,
          trace: subtrace,
          logs,
          storeSnapshot: this.store.db.data,
          result,
        });
        
        return result;
      }
    });
  }

  /** Process contract response & execute (sub)messages */
  protected async handleContractResponse(
    contractAddress: string,
    messages: ContractResponse['messages'],
    res: AppResponse,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    for (const message of messages) {
      const subres = await this.handleSubmsg(contractAddress, message, trace);
      if (subres.err) {
        return subres;
      }
      else {
        res.events = [...res.events, ...subres.val.events];
        if (subres.val.data !== null) {
          res.data = subres.val.data;
        }
      }
    }

    return Ok({ events: res.events, data: res.data });
  }

  /** Handle a submessage returned in the response of a contract execution */
  protected async handleSubmsg(
    contractAddress: string,
    message: SubMsg,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    return this.store.tx(async () => {
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
          }
          else {
            // submessage success, call reply, reply success
            if (replyRes.val.data !== null) {
              data = replyRes.val.data;
            }
            events = [...events, ...replyRes.val.events];
          }
        }
        else {
          // submessage success, don't call reply
          data = null;
        }
        
        return Ok({ events, data });
      }
      else {
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
          }
          else {
            // submessage failed, call reply, reply success
            let { events, data } = replyRes.val;
            return Ok({ events, data });
          }
        }
        else {
          // submessage failed, don't call reply (equivalent to normal message)
          return r;
        }
      }
    });
  }

  protected async reply(
    contractAddress: string,
    replyMsg: ReplyMsg,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    const logs: DebugLog[] = [];
    const contract = this.getContract(contractAddress);
    const env = contract.getExecutionEnv();
    const response = contract.reply(replyMsg, logs);
    
    if (response.err) {
      const result = Err(response.val);
      
      trace.push({
        [NEVER_IMMUTIFY]: true,
        type: 'reply' as 'reply',
        contractAddress,
        env,
        msg: replyMsg,
        response,
        logs,
        storeSnapshot: this.store.db.data,
        result,
      });
      
      return result;
    }
    else {
      const customEvent = {
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
      
      let res = buildAppResponse(
        contractAddress,
        customEvent,
        response.val,
      );
      
      let subtrace: TraceLog[] = [];
      let result = await this.handleContractResponse(
        contractAddress,
        response.val.messages,
        res,
        subtrace,
      );
      
      trace.push({
        [NEVER_IMMUTIFY]: true,
        type: 'reply' as 'reply',
        contractAddress,
        msg: replyMsg,
        env,
        response,
        trace: subtrace,
        logs,
        storeSnapshot: this.store.db.data,
        result,
      });
      
      return result;
    }
  }

  query(
    contractAddress: string,
    queryMsg: any
  ): Result<any, string> {
    return this.getContract(contractAddress).query(queryMsg);
  }
  
  queryTrace(
    trace: TraceLog,
    queryMsg: any,
  ): Result<any, string> {
    let { contractAddress, storeSnapshot } = trace;
    return this.getContract(contractAddress).query(queryMsg, storeSnapshot as Map<string, string>);
  }

  async handleMsg(
    sender: string,
    msg: WasmMsg,
    trace: TraceLog[] = []
  ): Promise<Result<AppResponse, string>> {
    return this.store.tx(async () => {
      let wasm = msg;
      if ('execute' in wasm) {
        let { contract_addr, funds, msg } = wasm.execute;
        return await this.executeContract(
          sender,
          funds,
          contract_addr,
          fromBinary(msg),
          trace
        );
      }
      else if ('instantiate' in wasm) {
        let { code_id, funds, msg, label} = wasm.instantiate;
        return await this.instantiateContract(
          sender,
          funds,
          code_id,
          fromBinary(msg),
          label,
          trace,
        );
      }
      else {
        throw new Error('Unknown wasm message');
      }
    });
  }

  handleQuery(query: WasmQuery): Result<Binary, string> {
    if ('smart' in query) {
      const { contract_addr, msg } = query.smart;
      return Ok(
        toBinary(this.query(contract_addr, fromBinary(msg)))
      );
    }
    else if ('raw' in query) {
      const { contract_addr, key } = query.raw;
      
      const storage = this.getContractStorage(contract_addr);
      if (!storage) {
        return Err(`Contract ${contract_addr} not found`);
      }
      
      const value = storage.get(key);
      if (value === undefined) {
        return Err(`Key ${key} not found`);
      }
      else {
        return Ok(value);
      }
    }
    else if ('contract_info' in query) {
      const { contract_addr } = query.contract_info;
      const info = this.getContractInfo(contract_addr);
      if (info === undefined) {
        return Err(`Contract ${contract_addr} not found`);
      }
      else {
        const { codeId: code_id, creator, admin } = info;
        const resp: ContractInfoResponse = {
          code_id,
          creator,
          admin,
          ibc_port: null,
          // TODO: VM lifetime mgmt
          // currently all VMs are always loaded ie pinned
          pinned: true,
        };
        
        return Ok(toBinary(resp));
      }
    }
    else {
      return Err('Unknown wasm query');
    }
  }
  
  private lens(storage?: Snapshot) {
    return storage ? lensFromSnapshot(storage) : this.store;
  }
  
  get lastCodeId() { return this.store.get('lastCodeId') }
  get lastInstanceId() { return this.store.get('lastInstanceId') }
}

export function lensFromSnapshot(snapshot: Snapshot) {
  return new Transactional(snapshot).lens<WasmData>('wasm');
}
