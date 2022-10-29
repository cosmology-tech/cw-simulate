import { Map } from 'immutable';
import { cmd, run, TestContract } from '../../testing/wasm-util';
import { AppResponse } from '../cw-interface';
import { CWSimulateApp } from '../CWSimulateApp';
import { BankMessage, ParsedCoin } from './bank';

type WrappedBankMessage = {
  bank: BankMessage;
};

describe('BankModule', () => {
  let chain: CWSimulateApp;
  beforeEach(function() {
    chain = new CWSimulateApp({
      chainId: 'test-1',
      bech32Prefix: 'terra',
    });
  });

  it('handle send', () => {
    const bank = chain.bank;
    bank.setBalance('alice', [{denom: 'foo', amount: '1000'}]);
    bank.send('alice', 'bob', [{denom: 'foo', amount: '100'}]).unwrap();
    
    expect(bank.getBalances()).toEqual(Map([
      ['alice', [{denom: 'foo', amount: '900'}]],
      ['bob',   [{denom: 'foo', amount: '100'}]],
    ]));
    expect(bank.getBalance('alice')).toEqual([new ParsedCoin('foo', BigInt(900))]);
    expect(bank.getBalance('bob')).toEqual([new ParsedCoin('foo', BigInt(100))]);
  });
  
  it.todo('handle send failure');
  
  it('handle burn', () => {
    const bank = chain.bank;
    bank.setBalance('alice', [{denom: 'foo', amount: '1000'}]);
    bank.burn('alice', [{denom: 'foo', amount: '100'}]);
    expect(bank.getBalances()).toEqual(Map([
      ['alice', [{denom: 'foo', amount: '900'}]],
    ]));
  });
  
  it.todo('handle burn failure');
  
  it('handle msg', () => {
    const bank = chain.bank;
    bank.setBalance('alice', [{denom: 'foo', amount: '1000'}]);
    
    let msg: WrappedBankMessage = {
      bank: {
        send: {
          to_address: 'bob',
          amount: [{denom: 'foo', amount: '100'}],
        }
      }
    };
    
    expect(bank.getBalances()).toEqual(Map([
      ['alice', [{denom: 'foo', amount: '1000'}]],
    ]));
    chain.handleMsg('alice', msg);
    
    expect(bank.getBalances()).toEqual(Map([
      ['alice', [{denom: 'foo', amount: '900'}]],
      ['bob',   [{denom: 'foo', amount: '100'}]],
    ]));
  });
  
  it('contract integration', async () => {
    const bank = chain.bank;
    const contract = await new TestContract(chain).instantiate();
    
    bank.setBalance(contract.address, [{denom: 'foo', amount: '1000'}]);
    
    const msg = run(
      cmd.bank({
        send: {
          to_address: 'alice',
          amount: [{denom: 'foo', amount: '100'}],
        },
      }),
      cmd.bank({
        send: {
          to_address: 'bob',
          amount: [{denom: 'foo', amount: '100'}],
        },
      }),
      cmd.bank({
        burn: {
          amount: [{denom: 'foo', amount: '100'}],
        },
      }),
    );
    
    let res = await contract.execute('alice', msg);
    expect(res.ok).toBeTruthy();
    expect(bank.getBalances()).toEqual(Map([
      [contract.address, [{denom: 'foo', amount: '700'}]],
      ['alice', [{denom: 'foo', amount: '100'}]],
      ['bob',   [{denom: 'foo', amount: '100'}]],
    ]));
  });
});
