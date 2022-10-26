import { toAscii } from '@cosmjs/encoding';

export interface AppResponse {
  events: any[];
  data: string | null;
}

export class BankModule {
  public static STORE_KEY: Uint8Array = toAscii('bank');

  constructor(public store: any) {
    this.store.balances = {};
  }

  public send(sender: string, recipient: string, amount: number) {
    this.setBalance(sender, this.getBalance(sender) - amount);
    this.setBalance(recipient, this.getBalance(recipient) + amount);
  }

  public setBalance(address: string, amount: number) {
    this.store.balances[address] = amount;
  }

  public getBalance(address: string) {
    return this.store.balances[address] || 0;
  }

  public handleMsg(sender: string, msg: any): AppResponse {
    let bankMsg = msg.bank;
    if (bankMsg.send) {
      this.send(sender, bankMsg.send.recipient, bankMsg.send.amount);
      return {
        events: [],
        data: null,
      };
    }

    throw new Error('Unknown bank message');
  }

  public handleQuery(query: any) {
    let bankQuery = query.bank;
    if (bankQuery.balance) {
      let { address, denom } = bankQuery.balance;
      return {
        amount: this.getBalance(address),
      };
    }

    if (bankQuery.all_balances) {
      let { address } = bankQuery.all_balances;
      return {
        amount: this.getBalance(address),
      };
    }

    throw new Error('Unknown bank query');
  }
}
