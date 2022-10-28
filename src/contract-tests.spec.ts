import { readFileSync } from 'fs';
import { CWSimulateApp } from './CWSimulateApp';
import { Event } from './cw-interface';

const testBytecode = readFileSync('testing/cw_simulate_tests-aarch64.wasm');

interface MsgCommand {
  msg: any;
}

enum ReplyOn {
  SUCCESS = 'success',
  AlWAYS = 'always',
  ERROR = 'error',
  NEVER = 'never',
}

interface SubCommand {
  sub: [number, any, ReplyOn];
}

interface EvCommand {
  ev: [string, [string, string][]];
}

interface AttrCommand {
  attr: [string, string];
}

interface DataCommand {
  data: number[];
}

interface ThrowCommand {
  throw: string;
}

type Command =
  | MsgCommand
  | SubCommand
  | EvCommand
  | AttrCommand
  | DataCommand
  | ThrowCommand;

function run(...program: Command[]) {
  return {
    run: {
      program,
    },
  };
}

function msg(payload: any): MsgCommand {
  return {
    msg: payload,
  };
}

function sub(id: number, msg: any, reply_on: ReplyOn): SubCommand {
  return {
    sub: [id, msg, reply_on],
  };
}

function ev(ty: string, attrs: [string, string][]): EvCommand {
  return {
    ev: [ty, attrs],
  };
}

function attr(k: string, v: string): AttrCommand {
  return {
    attr: [k, v],
  };
}

function data(v: number[]): DataCommand {
  return {
    data: v,
  };
}

function push(data: string) {
  return {
    push: { data },
  };
}

function err(msg: string): ThrowCommand {
  return {
    throw: msg,
  };
}

function event(ty: string, attrs: [string, string][]): Event.Data {
  return {
    type: ty,
    attributes: attrs.map(([k, v]) => ({ key: k, value: v })),
  };
}

const app = new CWSimulateApp({
  chainId: 'phoenix-1',
  bech32Prefix: 'terra',
});

let info = {
  sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
  funds: [],
};

const codeId = app.wasm.create(info.sender, Uint8Array.from(testBytecode));

describe('Events', function () {
  it('single event, no attributes', async () => {
    let res = await app.wasm.instantiateContract(
      info.sender,
      info.funds,
      codeId,
      {}
    );
    if (res.err) {
      throw new Error(res.val);
    } else {
      console.log(JSON.stringify(res.val));
    }
    // let executeMsg = run(
    //   ev('EV1', [
    //     ['EV1-K1', 'EV1-V1'],
    //     ['EV1-K2', 'EV1-V2'],
    //   ]),
    //   ev('EV2', [
    //     ['EV2-K1', 'EV2-V1'],
    //     ['EV2-K2', 'EV2-V2'],
    //   ]),
    //   attr('A1-K', 'A1-V'),
    //   attr('A2-K', 'A2-V')
    // );
    //
    // res = await app.wasm.executeContract(
    //   info.sender,
    //   info.funds,
    //   contractAddress,
    //   executeMsg
    // );
    //
    // expect(res.val).toEqual({
    //   events: [
    //     event('execute', [['_contract_addr', contractAddress]]),
    //     event('wasm', [
    //       ['_contract_addr', contractAddress],
    //       ['A1-K', 'A1-V'],
    //       ['A2-K', 'A2-V'],
    //     ]),
    //     event('wasm-EV1', [
    //       ['EV1-K1', 'EV1-V1'],
    //       ['EV1-K2', 'EV1-V2'],
    //     ]),
    //     event('wasm-EV2', [
    //       ['EV2-K1', 'EV2-V1'],
    //       ['EV2-K2', 'EV2-V2'],
    //     ]),
    //   ],
    //   data: null,
    // });
    //
    // res = await app.wasm.query(contractAddress, { get_buffer: {} });
    // console.log(res);
  });
});
