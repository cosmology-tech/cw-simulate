import Immutable from 'immutable';

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

export interface ExecuteTraceLog {
  type: 'execute' | 'instantiate';
  contractAddress: string;
  info: {
    sender: string;
    funds: Coin[];
  };
  env: ExecuteEnv;
  msg: any;
  response: RustResult<ContractResponse>;
  debugMsgs: string[];
  trace?: TraceLog[];
  storeSnapshot: Immutable.Map<string, any>;
}

export interface ReplyTraceLog {
  type: 'reply';
  contractAddress: string;
  env: ExecuteEnv;
  msg: ReplyMsg;
  response: RustResult<ContractResponse>;
  debugMsgs: string[];
  trace?: TraceLog[];
  storeSnapshot: Immutable.Map<string, any>;
}

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
