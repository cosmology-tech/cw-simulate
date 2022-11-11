import { toAscii, toBase64 } from '@cosmjs/encoding';
import { Result } from 'ts-results';
import { TestContract, TestContractInstance } from '../../testing/wasm-util';
import { CWSimulateApp } from '../CWSimulateApp';
import { Event, ReplyOn, TraceLog } from '../types';
import { fromBinary, toBinary } from '../util';

interface MsgCommand {
  msg: any;
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

function debug(msg: string) {
  return {
    debug: { msg },
  };
}

function err(msg: string): ThrowCommand {
  return {
    throw: msg,
  };
}

function event(ty: string, attrs: [string, string][]): Event {
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

const testCode = new TestContract(app, info.sender);
const codeId = testCode.register();

describe('Events', function () {
  let testContract: TestContractInstance;

  beforeEach(async () => {
    testContract = await testCode.instantiate({ codeId, funds: info.funds });
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

    let res = await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
    );

    expect(res.val).toEqual({
      events: [
        event('execute', [['_contract_addr', testContract.address]]),
        event('wasm', [
          ['_contract_addr', testContract.address],
          ['A1-K', 'A1-V'],
          ['A2-K', 'A2-V'],
        ]),
        event('wasm-EV1', [
          ['_contract_addr', testContract.address],
          ['EV1-K1', 'EV1-V1'],
          ['EV1-K2', 'EV1-V2'],
        ]),
        event('wasm-EV2', [
          ['_contract_addr', testContract.address],
          ['EV2-K1', 'EV2-V1'],
          ['EV2-K2', 'EV2-V2'],
        ]),
      ],
      data: null,
    });
  });

  it('submessages and replies', async () => {
    let executeMsg = run(
      sub(1, run(msg(push('N1'))), ReplyOn.Success),
      sub(2, run(err('error-S2')), ReplyOn.Error)
    );

    let res = await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
    );

    expect(res.val).toEqual({
      data: null,
      events: [
        event('execute', [['_contract_addr', testContract.address]]),
        event('execute', [['_contract_addr', testContract.address]]),
        event('execute', [['_contract_addr', testContract.address]]),
        event('wasm-push', [
          ['_contract_addr', testContract.address],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', testContract.address],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', testContract.address],
          ['key1', 'value1'],
        ]),
        event('reply', [
          ['_contract_addr', testContract.address],
          ['mode', 'handle_failure'],
        ]),
        event('wasm-reply_inv', [
          ['_contract_addr', testContract.address],
          ['err', 'custom: error-S2'],
        ]),
      ],
    });
  });

  it('nested submessages', async () => {
    let executeMsg = run(
      sub(1, run(msg(push('N1'))), ReplyOn.Success),
      sub(
        1,
        run(sub(1, run(msg(push('N2'))), ReplyOn.Success)),
        ReplyOn.Success
      )
    );

    let res = await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
    );

    expect(res.val).toEqual({
      data: null,
      events: [
        event('execute', [['_contract_addr', testContract.address]]),
        event('execute', [['_contract_addr', testContract.address]]),
        event('execute', [['_contract_addr', testContract.address]]),
        event('wasm-push', [
          ['_contract_addr', testContract.address],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', testContract.address],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', testContract.address],
          ['key1', 'value1'],
        ]),
        event('execute', [['_contract_addr', testContract.address]]),
        event('execute', [['_contract_addr', testContract.address]]),
        event('execute', [['_contract_addr', testContract.address]]),
        event('wasm-push', [
          ['_contract_addr', testContract.address],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', testContract.address],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', testContract.address],
          ['key1', 'value1'],
        ]),
        event('reply', [
          ['_contract_addr', testContract.address],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', testContract.address],
          ['key1', 'value1'],
        ]),
      ],
    });
  });
});

describe('Rollback', function () {
  let testContract: TestContractInstance;

  beforeEach(async () => {
    testContract = await testCode.instantiate({ codeId, funds: info.funds });
  });

  it('control case', async () => {
    let executeMsg = run(msg(push('A')), msg(push('B')));

    await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
    );

    let queryRes = await app.wasm.query(testContract.address, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: ['A', 'B'],
    });
  });

  it('rollbacks if message fails', async () => {
    let executeMsg = run(msg(push('A')), msg(push('B')), err('error'));

    await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
    );

    let queryRes = await app.wasm.query(testContract.address, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: [],
    });
  });

  it('partial rollback - submessages', async () => {
    let executeMsg = run(
      msg(push('A')),
      sub(2, run(msg(push('B')), msg(push('C')), err('error')), ReplyOn.Error),
      msg(push('D'))
    );

    await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
    );

    let queryRes = await app.wasm.query(testContract.address, { get_buffer: {} });
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
            ReplyOn.Error
          ),
          msg(push('E'))
        ),
        ReplyOn.Success
      ),
      msg(push('F'))
    );

    await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
    );

    let queryRes = await app.wasm.query(testContract.address, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: ['A', 'B', 'E', 'F'],
    });
  });
});

describe('Data', () => {
  let testContract: TestContractInstance;

  beforeEach(async () => {
    testContract = await testCode.instantiate({ codeId, funds: info.funds });
  });

  it('control case', async () => {
    let executeMsg = run(msg(push('S1')), data([1]));

    let res = await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
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

describe('TraceLog', () => {
  let testContract: TestContractInstance;

  beforeEach(async () => {
    testContract = await testCode.instantiate({ codeId, funds: info.funds });
  });

  it('works', async () => {
    let executeMsg = run(
      sub(1, debug('S1'), ReplyOn.Success),
      msg(push('M1')),
      sub(1, run(sub(1, debug('S2'), ReplyOn.Success)), ReplyOn.Success)
    );

    let trace: TraceLog[] = [];
    await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
      trace,
    );

    expect(trace).toMatchObject([
      {
        type: 'execute',
        trace: [
          {
            type: 'execute', // S1
            debugMsgs: ['S1'],
          },
          {
            type: 'reply', // reply(S1)
          },
          {
            type: 'execute', // M1
          },
          {
            type: 'execute', // S2
            trace: [
              {
                type: 'execute',
                debugMsgs: ['S2'],
              },
              {
                type: 'reply',
              },
            ],
          },
          {
            type: 'reply', // reply(S2)
          },
        ],
      },
    ]);
  });
});

describe('Query', () => {
  let testContract: TestContractInstance;
  
  beforeEach(async () => {
    testContract = await testCode.instantiate({ codeId, funds: info.funds });
  });
  
  it('smart', async () => {
    let executeMsg = push('foobar');
    
    await testContract.execute(
      info.sender,
      executeMsg,
      info.funds,
    );
    
    let res = await app.wasm.handleQuery({
      smart: {
        contract_addr: testContract.address,
        msg: toBinary({ get_buffer: {} }),
      },
    });
    expect(res.ok).toBeTruthy();
    
    let parsedRes = fromBinary(res.val) as Result<any, string>;
    expect(parsedRes.ok).toBeTruthy();
    expect(parsedRes.val).toEqual({
      buffer: ['foobar'],
    });
  });
  
  it('raw', async () => {
    for (let i = 0; i < 3; ++i) {
      await app.wasm.executeContract(
        info.sender,
        info.funds,
        testContract.address,
        push(`foobar${i}`),
      );
    }
    
    let res = await app.wasm.handleQuery({
      raw: {
        contract_addr: testContract.address,
        key: toBase64(toAscii('buffer')),
      },
    });
    expect(res.ok).toBeTruthy();
    expect(fromBinary(res.val)).toEqual(['foobar0', 'foobar1', 'foobar2']);
  });
  
  it('contract info', async () => {
    let res = await app.wasm.handleQuery({
      contract_info: {
        contract_addr: testContract.address,
      },
    });
    
    expect(res.ok).toBeTruthy();
    expect(fromBinary(res.val)).toMatchObject({
      code_id: codeId,
      creator: info.sender,
      admin: null,
    });
  });
});
