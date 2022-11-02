import { Map } from 'immutable';
import { cmd, run, TestContract } from '../../testing/wasm-util';
import { CWSimulateApp } from '../CWSimulateApp';
import { BankMessage, BankQuery, ParsedCoin } from './bank';

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
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [{denom: 'foo', amount: '1000'}]);

    // Act
    bank.send('alice', 'bob', [{denom: 'foo', amount: '100'}]).unwrap();

    // Assert
    expect(bank.getBalance('alice')).toEqual([new ParsedCoin('foo', BigInt(900))]);
    expect(bank.getBalance('bob')).toEqual([new ParsedCoin('foo', BigInt(100))]);
    expect(bank.getBalances()).toEqual({
      alice: [{denom: 'foo', amount: '900'}],
      bob:   [{denom: 'foo', amount: '100'}],
    });
  });

  it('handle send failure', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [{denom: 'foo', amount: '100'}]);

    // Act
    const res = bank.send('alice', 'bob', [{denom: 'foo', amount: '1000'}]);

    // Assert
    expect(res.err).toBeDefined();
    expect(bank.getBalances()).toEqual({
      alice: [{denom: 'foo', amount: '100'}],
    });
    expect(bank.getBalance('alice')).toEqual([new ParsedCoin('foo', BigInt(100))]);
  });

  it('handle burn', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [{denom: 'foo', amount: '1000'}]);

    // Act
    bank.burn('alice', [{denom: 'foo', amount: '100'}]);

    // Assert
    expect(bank.getBalance('alice')).toEqual([new ParsedCoin('foo', BigInt(900))]);
    expect(bank.getBalances()).toEqual({
      alice: [{denom: 'foo', amount: '900'}],
    });
  });

  it('handle burn failure', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [{denom: 'foo', amount: '100'}]);

    // Act
    const res = bank.burn('alice', [{denom: 'foo', amount: '1000'}]);

    // Assert
    expect(res.err).toBeDefined()
    expect(bank.getBalance('alice')).toEqual([new ParsedCoin('foo', BigInt(100))]);
    expect(bank.getBalances()).toEqual({
      alice: [{denom: 'foo', amount: '100'}],
    });
  });

  it('handle msg', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [{denom: 'foo', amount: '1000'}]);

    // Act
    let msg: WrappedBankMessage = {
      bank: {
        send: {
          to_address: 'bob',
          amount: [{denom: 'foo', amount: '100'}],
        }
      }
    };
    chain.handleMsg('alice', msg);

    // Assert
    expect(bank.getBalances()).toEqual({
      alice: [{denom: 'foo', amount: '900'}],
      bob:   [{denom: 'foo', amount: '100'}],
    });
  });

  it('contract integration', async () => {
    // Arrange
    const bank = chain.bank;
    const contract = await new TestContract(chain).instantiate();
    bank.setBalance(contract.address, [{denom: 'foo', amount: '1000'}]);

    // Act
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
    const res = await contract.execute('alice', msg);

    // Assert
    expect(res.ok).toBeTruthy();
    expect(bank.getBalances()).toEqual({
      [contract.address]: [{denom: 'foo', amount: '700'}],
      alice: [{denom: 'foo', amount: '100'}],
      bob:   [{denom: 'foo', amount: '100'}],
    });
  });
  
  it('querier integration', () => {
    const bank = chain.bank;
    
    const queryBalance: BankQuery = {
      balance: {
        address: 'alice',
        denom: 'foo',
      },
    };
    
    const queryAllBalances: BankQuery = {
      all_balances: {
        address: 'bob',
      },
    };
    
    bank.setBalance('alice', [
      { denom: 'foo', amount: '100' },
      { denom: 'bar', amount: '200' },
    ]);
    bank.setBalance('bob', [
      { denom: 'foo', amount: '200' },
      { denom: 'bar', amount: '200' },
    ]);
    
    let response = chain.querier.handleQuery({ bank: queryBalance });
    expect(response.ok).toBeTruthy();
    expect(response.unwrap().amount).toEqual({ denom: 'foo', amount: '100' });
    
    response = chain.querier.handleQuery({ bank: queryAllBalances });
    expect(response.ok).toBeTruthy();
    expect(response.unwrap().amount).toEqual([
      { denom: 'foo', amount: '200' },
      { denom: 'bar', amount: '200' },
    ]);
  });
});
