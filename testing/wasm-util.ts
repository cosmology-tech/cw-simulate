import { Coin } from '@cosmjs/amino';
import { readFileSync } from 'fs';
import { Event, ReplyOn } from '../src/types';
import { CWSimulateApp } from '../src/CWSimulateApp';
import { BankMessage } from '../src/modules/bank';

export const DEFAULT_CREATOR = 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu';
const BYTECODE = readFileSync(`${__dirname}/cw_simulate_tests-aarch64.wasm`);

interface MsgCommand {
  msg: any;
}

interface BankCommand {
  bank_msg: BankMessage;
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
  | BankCommand
  | SubCommand
  | EvCommand
  | AttrCommand
  | DataCommand
  | ThrowCommand;

export function run(...program: Command[]) {
  return {
    run: {
      program,
    },
  };
}

export const cmd = {
  msg(payload: any): MsgCommand {
    return {
      msg: payload,
    };
  },

  bank(msg: BankMessage): BankCommand {
    return {
      bank_msg: msg,
    };
  },

  sub(id: number, msg: any, reply_on: ReplyOn): SubCommand {
    return {
      sub: [id, msg, reply_on],
    };
  },

  ev(ty: string, attrs: [string, string][]): EvCommand {
    return {
      ev: [ty, attrs],
    };
  },

  attr(k: string, v: string): AttrCommand {
    return {
      attr: [k, v],
    };
  },

  data(v: number[]): DataCommand {
    return {
      data: v,
    };
  },

  push(data: string) {
    return {
      push: { data },
    };
  },

  err(msg: string): ThrowCommand {
    return {
      throw: msg,
    };
  },
};

export function event(ty: string, attrs: [string, string][]): Event {
  return {
    type: ty,
    attributes: attrs.map(([k, v]) => ({ key: k, value: v })),
  };
}

type InstantiateOptions = {
  sender?: string;
  codeId?: number;
  funds?: Coin[];
};

/** Utility methods for registration, instantiation, and interaction
 * with our test contract. */
export class TestContract {
  constructor(
    public readonly app: CWSimulateApp,
    public readonly creator = DEFAULT_CREATOR
  ) {}

  /** Register the test contract wasm code w/ the app */
  register(creator?: string): number {
    return this.app.wasm.create(creator ?? this.creator, BYTECODE);
  }

  /** Instantiate test contract. */
  async instantiate(opts: InstantiateOptions = {}) {
    const codeId = opts.codeId ?? this.register(opts.sender);
    const res = await this.app.wasm.instantiateContract(
      opts.sender ?? this.creator,
      opts.funds ?? [],
      codeId,
      {}
    );

    const addr = res.unwrap().events[0].attributes[0].value;
    return new TestContractInstance(this, addr);
  }
}

export class TestContractInstance {
  constructor(
    public readonly contract: TestContract,
    public readonly address: string
  ) {}

  async execute(
    sender: string,
    msg: any,
    funds: Coin[] = [],
    trace: any[] = []
  ) {
    return await this.app.wasm.executeContract(
      sender,
      funds,
      this.address,
      msg,
      trace
    );
  }

  get app() {
    return this.contract.app;
  }
}
