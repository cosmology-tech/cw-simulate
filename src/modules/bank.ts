import { Coin } from '@cosmjs/amino';
import { fromJS, List, Map } from 'immutable';
import { Err, Ok, Result } from 'ts-results';
import { Binary, Snapshot } from '../types';
import { CWSimulateApp } from '../CWSimulateApp';
import { toBinary } from '../util';
import { Transactional, TransactionalLens } from '../store/transactional';

export interface AppResponse {
  events: any[];
  data: string | null;
}

type BankData = {
  balances: Record<string, Coin[]>;
}

export type BankMessage =
  | {
      send: {
        to_address: string;
        amount: Coin[];
      }
    }
  | {
      burn: {
        amount: Coin[];
      }
    }

export type BankQuery =
  | {
      balance: {
        address: string;
        denom: string;
      };
    }
  | {
      all_balances: {
        address: string;
      };
    }

export type BalanceResponse = { amount: Coin };
export type AllBalancesResponse = { amount: Coin[] };

export class BankModule {
  public readonly store: TransactionalLens<BankData>;

  constructor(public chain: CWSimulateApp) {
    this.store = this.chain.store.db.lens<BankData>('bank').initialize({
      balances: {},
    });
  }

  public send(sender: string, recipient: string, amount: Coin[]): Result<void, string> {
    return this.store.tx(() => {
      let senderBalance = this.getBalance(sender).map(ParsedCoin.fromCoin).filter(c => c.amount > BigInt(0));
      let parsedCoins = amount
        .map(ParsedCoin.fromCoin)
        .filter(c => c.amount > BigInt(0));

      // Deduct coins from sender
      for (const coin of parsedCoins) {
        const hasCoin = senderBalance.find(c => c.denom === coin.denom);
        
        if (hasCoin && hasCoin.amount >= coin.amount) {
          hasCoin.amount -= coin.amount;
        }
        else {
          return Err(`Sender ${sender} has ${hasCoin?.amount ?? BigInt(0)} ${coin.denom}, needs ${coin.amount}`);
        }
      }
      senderBalance = senderBalance.filter(c => c.amount > BigInt(0));

      // Add amount to recipient
      const recipientBalance = this.getBalance(recipient).map(ParsedCoin.fromCoin);
      for (const coin of parsedCoins) {
        const hasCoin = recipientBalance.find(c => c.denom === coin.denom);
        
        if (hasCoin) {
          hasCoin.amount += coin.amount;
        }
        else {
          recipientBalance.push(coin);
        }
      }

      this.setBalance(sender, senderBalance.map(c => c.toCoin()));
      this.setBalance(recipient, recipientBalance.map(c => c.toCoin()));
      return Ok(undefined);
    });
  }

  public burn(sender: string, amount: Coin[]): Result<void, string> {
    return this.store.tx(() => {
      let balance = this.getBalance(sender).map(ParsedCoin.fromCoin);
      let parsedCoins = amount
        .map(ParsedCoin.fromCoin)
        .filter(c => c.amount > BigInt(0));

      for (const coin of parsedCoins) {
        const hasCoin = balance.find(c => c.denom === coin.denom);
        
        if (hasCoin && hasCoin.amount >= coin.amount) {
          hasCoin.amount -= coin.amount;
        }
        else {
          return Err(`Sender ${sender} has ${hasCoin?.amount ?? 0} ${coin.denom}, needs ${coin.amount}`);
        }
      }
      balance = balance.filter(c => c.amount > BigInt(0));
      
      this.setBalance(sender, balance.map(c => c.toCoin()));
      return Ok(undefined);
    });
  }

  public setBalance(address: string, amount: Coin[]) {
    this.store.tx(setter => {
      setter('balances', address)(amount);
      return Ok(undefined);
    });
  }

  public getBalance(address: string, storage?: Snapshot): Coin[] {
    return this.lens(storage).getObject('balances', address) ?? [];
  }
  
  public getBalances() {
    return this.store.getObject('balances');
  }
  
  public deleteBalance(address:string) {
    this.store.tx((_, deleter) => {
      deleter('balances', address);
      return Ok(undefined);
    });
  }

  public async handleMsg(
      sender: string,
      msg: BankMessage,
  ): Promise<Result<AppResponse, string>> {
    if ('send' in msg) {
      const result = this.send(sender, msg.send.to_address, msg.send.amount);
      return result.andThen(() => Ok<AppResponse>({
        events: [
          {
            type: 'transfer',
            attributes: [
              {key: 'recipient', value: msg.send.to_address},
              {key: 'sender', value: sender},
              {key: 'amount', value: JSON.stringify(msg.send.amount)},
            ],
          },
        ],
        data: null,
      }));
    }
    else if ('burn' in msg) {
      const result = this.burn(sender, msg.burn.amount);
      return result.andThen(() => Ok<AppResponse>({
        events: [
          {
            type: 'burn',
            attributes: [
              {key: 'sender', value: sender},
              {key: 'amount', value: JSON.stringify(msg.burn.amount)},
            ],
          },
        ],
        data: null,
      }));
    }
    else {
      return Err('Unknown bank message');
    }
  }

  public handleQuery(query: BankQuery): Result<Binary, string> {
    let bankQuery = query;
    if ('balance' in bankQuery) {
      let { address, denom } = bankQuery.balance;
      const hasCoin = this
        .getBalance(address)
        .find(c => c.denom === denom);
      return Ok(toBinary({
        amount: hasCoin ?? { denom, amount: '0' },
      }));
    }
    else if ('all_balances' in bankQuery) {
      let { address } = bankQuery.all_balances;
      return Ok(toBinary({
        amount: this.getBalance(address),
      }));
    }
    return Err('Unknown bank query');
  }
    private lens(storage?: Snapshot) {
    return storage ? lensFromSnapshot(storage) : this.store;
  }
}

/** Essentially a `Coin`, but the `amount` is a `bigint` for more convenient use. */
export class ParsedCoin {
  constructor(public readonly denom: string, public amount: bigint) {}
  
  toCoin(): Coin {
    return {
      denom: this.denom,
      amount: this.amount.toString(),
    };
  }
  
  static fromCoin(coin: Coin) {
    return new ParsedCoin(coin.denom, BigInt(coin.amount));
  }
}

export function lensFromSnapshot(snapshot: Snapshot) {
  return new Transactional(snapshot).lens<BankData>('contracts');
}
