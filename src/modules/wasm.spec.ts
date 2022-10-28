import { readFileSync } from 'fs';
import { CWSimulateApp } from '../CWSimulateApp';
import { AppResponse, Event } from '../cw-interface';
import { toBase64 } from '@cosmjs/encoding';

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

function getContractAddress(res: AppResponse): string {
  return res.events[0].attributes[0].value;
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
  let contractAddress: string;

  beforeEach(async () => {
    let res = await app.wasm.instantiateContract(
      info.sender,
      info.funds,
      codeId,
      {}
    );
    if (res.err) {
      throw new Error(res.val);
    }
    contractAddress = getContractAddress(res.val);
  });

  it('attributes get added to `wasm` event and events are prefixed with `wasm-`', async () => {
    let executeMsg = run(
      ev('EV1', [
        ['EV1-K1', 'EV1-V1'],
        ['EV1-K2', 'EV1-V2'],
      ]),
      ev('EV2', [
        ['EV2-K1', 'EV2-V1'],
        ['EV2-K2', 'EV2-V2'],
      ]),
      attr('A1-K', 'A1-V'),
      attr('A2-K', 'A2-V')
    );

    let res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );

    expect(res.val).toEqual({
      events: [
        event('execute', [['_contract_addr', contractAddress]]),
        event('wasm', [
          ['_contract_addr', contractAddress],
          ['A1-K', 'A1-V'],
          ['A2-K', 'A2-V'],
        ]),
        event('wasm-EV1', [
          ['_contract_addr', contractAddress],
          ['EV1-K1', 'EV1-V1'],
          ['EV1-K2', 'EV1-V2'],
        ]),
        event('wasm-EV2', [
          ['_contract_addr', contractAddress],
          ['EV2-K1', 'EV2-V1'],
          ['EV2-K2', 'EV2-V2'],
        ]),
      ],
      data: null,
    });
  });

  it('submessages and replies', async () => {
    let executeMsg = run(
      sub(1, run(msg(push('N1'))), ReplyOn.SUCCESS),
      sub(2, run(err('error-S2')), ReplyOn.ERROR)
    );

    let res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );

    expect(res.val).toEqual({
      data: null,
      events: [
        event('execute', [['_contract_addr', contractAddress]]),
        event('execute', [['_contract_addr', contractAddress]]),
        event('execute', [['_contract_addr', contractAddress]]),
        event('wasm-push', [
          ['_contract_addr', contractAddress],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', contractAddress],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', contractAddress],
          ['key1', 'value1'],
        ]),
        event('reply', [
          ['_contract_addr', contractAddress],
          ['mode', 'handle_failure'],
        ]),
        event('wasm-reply_inv', [
          ['_contract_addr', contractAddress],
          ['err', 'custom: error-S2'],
        ]),
      ],
    });
  });

  it('nested submessages', async () => {
    let executeMsg = run(
      sub(1, run(msg(push('N1'))), ReplyOn.SUCCESS),
      sub(
        1,
        run(sub(1, run(msg(push('N2'))), ReplyOn.SUCCESS)),
        ReplyOn.SUCCESS
      )
    );

    let res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );

    expect(res.val).toEqual({
      data: null,
      events: [
        event('execute', [['_contract_addr', contractAddress]]),
        event('execute', [['_contract_addr', contractAddress]]),
        event('execute', [['_contract_addr', contractAddress]]),
        event('wasm-push', [
          ['_contract_addr', contractAddress],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', contractAddress],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', contractAddress],
          ['key1', 'value1'],
        ]),
        event('execute', [['_contract_addr', contractAddress]]),
        event('execute', [['_contract_addr', contractAddress]]),
        event('execute', [['_contract_addr', contractAddress]]),
        event('wasm-push', [
          ['_contract_addr', contractAddress],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', contractAddress],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', contractAddress],
          ['key1', 'value1'],
        ]),
        event('reply', [
          ['_contract_addr', contractAddress],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', contractAddress],
          ['key1', 'value1'],
        ]),
      ],
    });
  });
});

describe('Rollback', function () {
  let contractAddress: string;

  beforeEach(async () => {
    let res = await app.wasm.instantiateContract(
      info.sender,
      info.funds,
      codeId,
      {}
    );
    if (res.err) {
      throw new Error(res.val);
    }
    contractAddress = getContractAddress(res.val);
  });

  it('control case', async () => {
    let executeMsg = run(msg(push('A')), msg(push('B')));

    let res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );

    let queryRes = await app.wasm.query(contractAddress, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: ['A', 'B'],
    });
  });

  it('rollbacks if message fails', async () => {
    let executeMsg = run(msg(push('A')), msg(push('B')), err('error'));

    let res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );

    let queryRes = await app.wasm.query(contractAddress, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: [],
    });
  });

  it('partial rollback - submessages', async () => {
    let executeMsg = run(
      msg(push('A')),
      sub(2, run(msg(push('B')), msg(push('C')), err('error')), ReplyOn.ERROR),
      msg(push('D'))
    );

    let res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );

    let queryRes = await app.wasm.query(contractAddress, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: ['A', 'D'],
    });
  });

  it('partial rollback - nested submessages', async () => {
    let executeMsg = run(
      msg(push('A')),
      sub(
        1,
        run(
          msg(push('B')),
          sub(
            2,
            run(msg(push('C')), msg(push('D')), err('error')),
            ReplyOn.ERROR
          ),
          msg(push('E'))
        ),
        ReplyOn.SUCCESS
      ),
      msg(push('F'))
    );

    let trace: any = [];
    let res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg,
      trace
    );

    console.log(JSON.stringify(trace, null, 2));

    let queryRes = await app.wasm.query(contractAddress, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: ['A', 'B', 'E', 'F'],
    });
  });
});

describe('Data', () => {
  let contractAddress: string;

  beforeEach(async () => {
    let res = await app.wasm.instantiateContract(
      info.sender,
      info.funds,
      codeId,
      {}
    );
    if (res.err) {
      throw new Error(res.val);
    }
    contractAddress = getContractAddress(res.val);
  });

  it('control case', async () => {
    let executeMsg = run(data([1]));

    let res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );

    expect(res.val).toMatchObject({
      data: toBase64(new Uint8Array([1])),
    });
  });

  it('last msg data is returned', async () => {
    // TODO: implement; this requires changing cw-simulate-tests in Rust :P
    // it may be tricky because outermost data is returned, so we may need to make
    // new ExecuteMsg types that don't overwrite at the root level instead of
    // a command-processor
  });

  it('if reply has no data, last data is used', async () => {
    // TODO: implement
  });
});
