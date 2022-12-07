import Immutable from 'immutable';
import { Result } from 'ts-results';
import type { NEVER_IMMUTIFY } from './store/transactional';

export interface ContractResponse {
  messages: SubMsg[];
  events: Event[];
  attributes: Attribute[];
  data: Binary | null;
}

export type AppResponse = {
  events: Event[];
  data: Binary | null;
};

export interface Attribute {
  key: string;
  value: string;
}

export interface Event {
  type: string;
  attributes: Attribute[];
}

export type RustResult<T> = { ok: T } | { error: string };

export type ReplyMsg = {
  id: number;
  result: RustResult<{
    events: Event[];
    data: string | null;
  }>;
};

export interface CodeInfo {
  creator: string;
  wasmCode: Uint8Array;
}

export interface ContractInfo {
  codeId: number;
  creator: string;
  admin: string | null;
  label: string;
  created: number; // chain height
}

export interface ContractInfoResponse {
  code_id: number;
  creator: string;
  admin: string | null;
  pinned: boolean;
  ibc_port: string | null;
}

export type DebugLog = PrintDebugLog | CallDebugLog;

export interface PrintDebugLog {
  type: 'print';
  message: string;
}

type Bytes = string;

type NamedArg<T extends any = any> = { [name: string]: T };

type APIFn<
  CallArgs extends NamedArg,
  ReturnType = undefined
> = ReturnType extends undefined
  ? {
      args: CallArgs;
    }
  : {
      args: CallArgs;
      result: ReturnType;
    };

interface CosmWasmAPI {
  db_read: APIFn<{ key: Bytes }, Bytes>;
  db_write: APIFn<{ key: Bytes; value: Bytes }>;
  db_remove: APIFn<{ key: Bytes }>;
  db_scan: APIFn<{ start: Bytes; end: Bytes; order: number }, Bytes>;
  db_next: APIFn<{ iterator_id: Bytes }, Bytes>;
  addr_humanize: APIFn<{ source: Bytes }, Bytes>;
  addr_canonicalize: APIFn<{ source: Bytes; destination: Bytes }, Bytes>;
  addr_validate: APIFn<{ source: Bytes }, Bytes>;
  secp256k1_verify: APIFn<
    { hash: Bytes; signature: Bytes; pubkey: Bytes },
    number
  >;
  secp256k1_recover_pubkey: APIFn<
    { msgHash: Bytes; signature: Bytes; recover_param: number },
    Bytes
  >;
  abort: APIFn<{ message: string }>;
  debug: APIFn<{ message: string }>;
  ed25519_verify: APIFn<
    { message: Bytes; signature: Bytes; pubkey: Bytes },
    number
  >;
  ed25519_batch_verify: APIFn<
    { messages_ptr: Bytes; signatures_ptr: Bytes; pubkeys_ptr: Bytes },
    number
  >;
  query_chain: APIFn<{ request: Bytes }, Bytes>;
}

type Unionize<T> = T extends { [key in keyof T]: infer ValueType }
  ? ValueType
  : never;

type CallDebugLog<T extends keyof CosmWasmAPI = keyof CosmWasmAPI> = {
  type: 'call';
} & Unionize<{
  [K in T]: { fn: K } & CosmWasmAPI[K];
}>;

export type Snapshot = Immutable.Map<unknown, unknown>;

interface TraceLogCommon {
  [NEVER_IMMUTIFY]: true;
  type: string;
  contractAddress: string;
  env: ExecuteEnv;
  msg: any;
  response: RustResult<ContractResponse>;
  logs: DebugLog[];
  trace?: TraceLog[];
  storeSnapshot: Snapshot;
  result: Result<AppResponse, string>;
}

export type ExecuteTraceLog = TraceLogCommon & {
  type: 'execute' | 'instantiate';
  info: {
    sender: string;
    funds: Coin[];
  };
};

export type ReplyTraceLog = TraceLogCommon & {
  type: 'reply';
  msg: ReplyMsg;
};

export type TraceLog = ExecuteTraceLog | ReplyTraceLog;

export interface SubMsg {
  id: number;
  msg: any;
  gas_limit: number | null;
  reply_on: ReplyOn;
}

export enum ReplyOn {
  Always = 'always',
  Never = 'never',
  Success = 'success',
  Error = 'error',
}

export type Binary = string;

export interface Coin {
  denom: string;
  amount: string;
}

export interface ExecuteEnv {
  block: {
    height: number;
    time: string;
    chain_id: string;
  };
  contract: {
    address: string;
  };
}
