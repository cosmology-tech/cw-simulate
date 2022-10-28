import { toAscii } from '@cosmjs/encoding';
import { CWSimulateApp } from 'CWSimulateApp';
import { Result, Ok, Err } from 'ts-results';
import { Coin } from '@cosmjs/amino';

export interface AppResponse {
  events: any[];
  data: string | null;
}

export class BankModule {
  public static STORE_KEY: Uint8Array = toAscii('bank');

  constructor(public chain: CWSimulateApp) {
    this.chain.store.set('bank', { balances: {} });
  }

  public send(sender: string, recipient: string, amount: Coin[]) {
    this.setBalance(
      sender,
      this.getBalance(sender) - Number.parseInt(amount[0].amount)
    );
    this.setBalance(
      recipient,
      this.getBalance(recipient) + Number.parseInt(amount[0].amount)
    );
  }

  public setBalance(address: string, amount: number) {
    this.chain.store = this.chain.store.setIn(
      ['bank', 'balances', address],
      amount
    );
  }

  public getBalance(address: string): number {
    return this.chain.store.getIn(['bank', 'balances', address], 0) as number;
  }

  public async handleMsg(
    sender: string,
    msg: any
  ): Promise<Result<AppResponse, string>> {
    let bankMsg = msg.bank;
    if (bankMsg.send) {
      console.log(bankMsg.send);
      this.send(sender, bankMsg.send.to_address, bankMsg.send.amount);
      console.log({
        sender: this.getBalance(sender),
        recipient: this.getBalance(bankMsg.send.to_address),
      });

      return Ok({
        events: [
          {
            type: 'transfer',
            attributes: [
              { key: 'recipient', value: bankMsg.send.to_address },
              { key: 'sender', value: sender },
              { key: 'amount', value: JSON.stringify(bankMsg.send.amount) },
            ],
          },
        ],
        data: null,
      });
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
