import { toBase64 } from '@cosmjs/encoding';
import { cmd, DEFAULT_CREATOR, event, run, TestContract, TestContractInstance } from '../../testing/wasm-util';
import { ReplyOn } from '../cw-interface';
import { CWSimulateApp } from '../CWSimulateApp';

const app = new CWSimulateApp({
  chainId: 'phoenix-1',
  bech32Prefix: 'terra',
});

const testContract = new TestContract(app);
const codeId = testContract.register();

describe('Events', function () {
  let contract: TestContractInstance;

  beforeEach(async () => {
    contract = await testContract.instantiate({ codeId });
  });

  it('attributes get added to `wasm` event and events are prefixed with `wasm-`', async () => {
    let executeMsg = run(
      cmd.ev('EV1', [
        ['EV1-K1', 'EV1-V1'],
        ['EV1-K2', 'EV1-V2'],
      ]),
      cmd.ev('EV2', [
        ['EV2-K1', 'EV2-V1'],
        ['EV2-K2', 'EV2-V2'],
      ]),
      cmd.attr('A1-K', 'A1-V'),
      cmd.attr('A2-K', 'A2-V'),
    );

    let res = await contract.execute(DEFAULT_CREATOR, executeMsg);

    expect(res.val).toEqual({
      events: [
        event('execute', [['_contract_addr', contract.address]]),
        event('wasm', [
          ['_contract_addr', contract.address],
          ['A1-K', 'A1-V'],
          ['A2-K', 'A2-V'],
        ]),
        event('wasm-EV1', [
          ['_contract_addr', contract.address],
          ['EV1-K1', 'EV1-V1'],
          ['EV1-K2', 'EV1-V2'],
        ]),
        event('wasm-EV2', [
          ['_contract_addr', contract.address],
          ['EV2-K1', 'EV2-V1'],
          ['EV2-K2', 'EV2-V2'],
        ]),
      ],
      data: null,
    });
  });

  it('submessages and replies', async () => {
    let executeMsg = run(
      cmd.sub(1, run(cmd.msg(cmd.push('N1'))), ReplyOn.Success),
      cmd.sub(2, run(cmd.err('error-S2')), ReplyOn.Error)
    );

    let res = await contract.execute(DEFAULT_CREATOR, executeMsg);

    expect(res.val).toEqual({
      data: null,
      events: [
        event('execute', [['_contract_addr', contract.address]]),
        event('execute', [['_contract_addr', contract.address]]),
        event('execute', [['_contract_addr', contract.address]]),
        event('wasm-push', [
          ['_contract_addr', contract.address],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', contract.address],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', contract.address],
          ['key1', 'value1'],
        ]),
        event('reply', [
          ['_contract_addr', contract.address],
          ['mode', 'handle_failure'],
        ]),
        event('wasm-reply_inv', [
          ['_contract_addr', contract.address],
          ['err', 'custom: error-S2'],
        ]),
      ],
    });
  });

  it('nested submessages', async () => {
    let executeMsg = run(
      cmd.sub(1, run(cmd.msg(cmd.push('N1'))), ReplyOn.Success),
      cmd.sub(
        1,
        run(cmd.sub(1, run(cmd.msg(cmd.push('N2'))), ReplyOn.Success)),
        ReplyOn.Success
      )
    );

    let res = await contract.execute(DEFAULT_CREATOR, executeMsg);

    expect(res.val).toEqual({
      data: null,
      events: [
        event('execute', [['_contract_addr', contract.address]]),
        event('execute', [['_contract_addr', contract.address]]),
        event('execute', [['_contract_addr', contract.address]]),
        event('wasm-push', [
          ['_contract_addr', contract.address],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', contract.address],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', contract.address],
          ['key1', 'value1'],
        ]),
        event('execute', [['_contract_addr', contract.address]]),
        event('execute', [['_contract_addr', contract.address]]),
        event('execute', [['_contract_addr', contract.address]]),
        event('wasm-push', [
          ['_contract_addr', contract.address],
          ['key', 'value'],
        ]),
        event('reply', [
          ['_contract_addr', contract.address],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', contract.address],
          ['key1', 'value1'],
        ]),
        event('reply', [
          ['_contract_addr', contract.address],
          ['mode', 'handle_success'],
        ]),
        event('wasm-reply_id', [
          ['_contract_addr', contract.address],
          ['key1', 'value1'],
        ]),
      ],
    });
  });
});

describe('Rollback', function () {
  let contract: TestContractInstance;

  beforeEach(async () => {
    contract = await testContract.instantiate({ codeId });
  });

  it('control case', async () => {
    let executeMsg = run(
      cmd.msg(cmd.push('A')),
      cmd.msg(cmd.push('B')),
    );

    let res = await contract.execute(DEFAULT_CREATOR, executeMsg);

    let queryRes = await app.wasm.query(contract.address, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: ['A', 'B'],
    });
  });

  it('rollbacks if message fails', async () => {
    let executeMsg = run(
      cmd.msg(cmd.push('A')),
      cmd.msg(cmd.push('B')),
      cmd.err('error'),
    );

    let res = await contract.execute(DEFAULT_CREATOR, executeMsg);

    let queryRes = await app.wasm.query(contract.address, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: [],
    });
  });

  it('partial rollback - submessages', async () => {
    let executeMsg = run(
      cmd.msg(cmd.push('A')),
      cmd.sub(2, run(cmd.msg(cmd.push('B')), cmd.msg(cmd.push('C')), cmd.err('error')), ReplyOn.Error),
      cmd.msg(cmd.push('D')),
    );

    let res = await contract.execute(DEFAULT_CREATOR, executeMsg);

    let queryRes = await app.wasm.query(contract.address, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: ['A', 'D'],
    });
  });

  it('partial rollback - nested submessages', async () => {
    let executeMsg = run(
      cmd.msg(cmd.push('A')),
      cmd.sub(
        1,
        run(
          cmd.msg(cmd.push('B')),
          cmd.sub(
            2,
            run(cmd.msg(cmd.push('C')), cmd.msg(cmd.push('D')), cmd.err('error')),
            ReplyOn.Error
          ),
          cmd.msg(cmd.push('E'))
        ),
        ReplyOn.Success
      ),
      cmd.msg(cmd.push('F'))
    );

    let trace: any = [];
    let res = await contract.execute(DEFAULT_CREATOR, executeMsg, trace);

    console.log(JSON.stringify(trace, null, 2));

    let queryRes = await app.wasm.query(contract.address, { get_buffer: {} });
    expect(queryRes.val).toEqual({
      buffer: ['A', 'B', 'E', 'F'],
    });
  });
});

describe('Data', () => {
  let contract: TestContractInstance;

  beforeEach(async () => {
    contract = await testContract.instantiate({ codeId });
  });

  it('control case', async () => {
    let executeMsg = run(cmd.data([1]));

    let res = await contract.execute(DEFAULT_CREATOR, executeMsg);

    expect(res.val).toMatchObject({
      data: toBase64(new Uint8Array([1])),
    });
  });

  // TODO: implement; this requires changing cw-simulate-tests in Rust :P
  // it may be tricky because outermost data is returned, so we may need to make
  // new ExecuteMsg types that don't overwrite at the root level instead of
  // a command-processor
  it.todo('last msg data is returned');

  it.todo('if reply has no data, last data is used');
});
