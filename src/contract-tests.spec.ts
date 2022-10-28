import { readFileSync } from 'fs';
import { CWSimulateApp } from './CWSimulateApp';

const testBytecode = readFileSync('testing/cw_simulate_tests-aarch64.wasm');

interface MsgCommand {
  msg: any;
}

interface BankMsgCommand {
  bank_msg: any;
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
  | BankMsgCommand
  | SubCommand
  | EvCommand
  | AttrCommand
  | DataCommand
  | ThrowCommand;

function run(program: Command[]) {
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

function bank(payload: any): BankMsgCommand {
  return {
    bank_msg: payload,
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

describe('CWSimulate Contract Tests', function () {
  it('send_coins_works', async () => {
    let app = new CWSimulateApp({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra',
    });

    let info = {
      sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
      funds: [{
        denom: 'uluna',
        amount: '1000000000',
      }],
    };

    let code = app.wasm.create(info.sender, Uint8Array.from(testBytecode));
    let res = await app.wasm.instantiate(info.sender, info.funds, code, {});
    let { contractAddress } = res;
    console.log(res);

    // let executeMsg = run([
    //   sub(1, run([msg(push('S1'))]), ReplyOn.SUCCESS),
    //   sub(2, run([err('s2')]), ReplyOn.ERROR),
    //   msg(push('M1')),
    //   msg(run([err('fail at end')])),
    // ]);

    let executeMsg = run([
      bank({
        send: {
          to_address: 'recipient_address',
          amount: [{ denom: 'uluna', amount: '1000' }],
        },
      }),
    ]);

    res = await app.wasm.execute(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );
    console.log(res);

    res = await app.wasm.query(contractAddress, { get_buffer: {} });
    console.log(res);
  });

  it('send_nonexistent_coins_fails', async () => {
    let app = new CWSimulateApp({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra',
    });

    let info = {
      sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
      funds: [{
        denom: 'uluna',
        amount: '1000000000',
      }],
    };

    let code = app.wasm.create(info.sender, Uint8Array.from(testBytecode));
    let res = await app.wasm.instantiate(info.sender, info.funds, code, {});
    let { contractAddress } = res;
    console.log(res);

    let executeMsg = run([
      bank({
        send: {
          to_address: 'recipient_address',
          amount: [{ denom: 'ufoo', amount: '1000' }],
        },
      }),
    ]);

    res = await app.wasm.execute(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );
    console.log(res);

    res = await app.wasm.query(contractAddress, { get_buffer: {} });
    console.log(res);
  });

  it('send_with_insufficient_funds_fails', async () => {
    let app = new CWSimulateApp({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra',
    });

    let info = {
      sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
      funds: [{
        denom: 'uluna',
        amount: '1000000000',
      }],
    };

    let code = app.wasm.create(info.sender, Uint8Array.from(testBytecode));
    let res = await app.wasm.instantiate(info.sender, info.funds, code, {});
    let { contractAddress } = res;
    console.log(res);

    let executeMsg = run([
      bank({
        send: {
          to_address: 'recipient_address',
          amount: [{ denom: 'uluna', amount: '1000000001' }],
        },
      }),
    ]);

    res = await app.wasm.execute(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );
    console.log(res);

    res = await app.wasm.query(contractAddress, { get_buffer: {} });
    console.log(res);
  });

  it('burn_coins_works', async () => {
    let app = new CWSimulateApp({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra',
    });

    let info = {
      sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
      funds: [{
        denom: 'uluna',
        amount: '1000000000',
      }],
    };

    let code = app.wasm.create(info.sender, Uint8Array.from(testBytecode));
    let res = await app.wasm.instantiate(info.sender, info.funds, code, {});
    let { contractAddress } = res;
    console.log(res);

    let executeMsg = run([
      bank({
        burn: {
          amount: [{ denom: 'uluna', amount: '1000' }],
        },
      }),
    ]);

    res = await app.wasm.execute(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );
    console.log(res);

    res = await app.wasm.query(contractAddress, { get_buffer: {} });
    console.log(res);
  });
});
