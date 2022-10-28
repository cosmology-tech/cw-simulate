import { toAscii } from '@cosmjs/encoding';
import { CWSimulateApp } from 'CWSimulateApp';
import { Ok, Result } from 'ts-results';
import { Coin } from '@cosmjs/amino';

export interface AppResponse {
  events: any[];
  data: string | null;
}

export class BankModule {
  public static STORE_KEY: Uint8Array = toAscii('bank');

  constructor(public chain: CWSimulateApp) {
    this.chain.store.set('bank', {'balances': {}});
  }

  public send(sender: string, recipient: string, amount: Coin[]) {
    let senderBalance: Coin[] = this.getBalance(sender);
    amount.forEach((coin: Coin) => {
      // Check if sender has coin.denom
      const hasCoin = senderBalance.find((c: Coin) => c.denom === coin.denom);
      if (hasCoin) {
        // Check if sender has enough balance
        if (parseInt(hasCoin.amount) >= parseInt(coin.amount)) {
          const newCoin = {
            denom: coin.denom,
            amount: (parseInt(hasCoin.amount) - parseInt(coin.amount)).toString(),
          }
          const deleteIndex = senderBalance.findIndex((c: Coin) => c.denom === coin.denom);
          delete senderBalance[deleteIndex];
          senderBalance.push(newCoin);
          this.setBalance(sender, senderBalance);
        } else {
          // rollback
          throw new Error(`Sender ${sender} does not have enough balance`);
        }
      } else {
        throw new Error(`Sender ${sender} does not have ${coin.denom} coin`);
      }
    });

    // Add amount to recipient
    const recipientBalance = this.getBalance(recipient);
    amount.forEach((coin: Coin) => {
      const hasCoin = recipientBalance.find((c: Coin) => c.denom === coin.denom);
      if (hasCoin) {
        const newCoin = {
          denom: coin.denom,
          amount: (parseInt(hasCoin.amount) + parseInt(coin.amount)).toString(),
        }
        const deleteIndex = recipientBalance.findIndex((c: Coin) => c.denom === coin.denom);
        delete recipientBalance[deleteIndex];
        recipientBalance.push(newCoin);
        this.setBalance(recipient, recipientBalance);
      } else {
        recipientBalance.push(coin);
        this.setBalance(recipient, recipientBalance);
      }
    });
  }

  public burn(from_address: string, amount: Coin[]) {
    let balance = this.getBalance(from_address);
    amount.forEach((coin: Coin) => {
      const hasCoin = balance.find((c: Coin) => c.denom === coin.denom);
      if (hasCoin) {
        if (parseInt(hasCoin.amount) >= parseInt(coin.amount)) {
          const newCoin = {
            denom: coin.denom,
            amount: (parseInt(hasCoin.amount) - parseInt(coin.amount)).toString(),
          }
          const deleteIndex = balance.findIndex((c: Coin) => c.denom === coin.denom);
          delete balance[deleteIndex];
          balance.push(newCoin);
          this.setBalance(from_address, balance);
        } else {
          throw new Error(`Sender ${from_address} does not have enough balance`);
        }
      } else {
        throw new Error(`Sender ${from_address} does not have ${coin.denom} coin`);
      }
    });
  }

  public setBalance(address: string, amount: Coin[]) {
    this.chain.store = this.chain.store.setIn(
        ['bank', 'balances', address],
        amount
    );
  }

  public getBalance(address: string): Coin[] {
    return this.chain.store.getIn(['bank', 'balances', address], []) as Coin[];
  }

  public async handleMsg(
      sender: string,
      msg: any
  ): Promise<Result<AppResponse, string>> {
    let bankMsg = msg.bank;
    if (bankMsg.send) {
      this.send(sender, bankMsg.send.to_address, bankMsg.send.amount);
      return Ok({
        events: [
          {
            type: 'transfer',
            attributes: [
              {key: 'recipient', value: bankMsg.send.to_address},
              {key: 'sender', value: sender},
              {key: 'amount', value: JSON.stringify(bankMsg.send.amount)},
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
      let {address, denom} = bankQuery.balance;
      return {
        amount: this.getBalance(address),
      };
    }

    if (bankQuery.all_balances) {
      let {address} = bankQuery.all_balances;
      return {
        amount: this.getBalance(address),
      };
    }

    throw new Error('Unknown bank query');
  }
}
