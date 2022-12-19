import { cmd, exec, TestContract } from '../../testing/wasm-util';
import { CWSimulateApp } from '../CWSimulateApp';
import { fromBinary } from '../util';
import { BankMessage, BankQuery } from './bank';

type WrappedBankMessage = {
  bank: BankMessage;
};

describe.only('BankModule', () => {
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
    bank.setBalance('alice', [coin('foo', 1000)]);

    // Act
    bank.send('alice', 'bob', [coin('foo', 100)]).unwrap();

    // Assert
    expect(bank.getBalance('alice')).toEqual([coin('foo', 900)]);
    expect(bank.getBalance('bob')).toEqual([coin('foo', 100)]);
    expect(bank.getBalances()).toEqual({
      alice: [coin('foo', 900)],
      bob:   [coin('foo', 100)],
    });
  });

  it('handle send failure', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [coin('foo', 100)]);

    // Act
    const res = bank.send('alice', 'bob', [coin('foo', 1000)]);

    // Assert
    expect(res.err).toBeDefined();
    expect(bank.getBalances()).toEqual({
      alice: [coin('foo', 100)],
    });
    expect(bank.getBalance('alice')).toEqual([coin('foo', 100)]);
  });

  it('handle burn', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [coin('foo', 1000)]);

    // Act
    bank.burn('alice', [coin('foo', 100)]);

    // Assert
    expect(bank.getBalance('alice')).toEqual([coin('foo', 900)]);
    expect(bank.getBalances()).toEqual({
      alice: [coin('foo', 900)],
    });
  });

  it('handle burn failure', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [coin('foo', 100)]);

    // Act
    const res = bank.burn('alice', [coin('foo', 1000)]);

    // Assert
    expect(res.err).toBeDefined()
    expect(bank.getBalance('alice')).toEqual([coin('foo', 100)]);
    expect(bank.getBalances()).toEqual({
      alice: [coin('foo', 100)],
    });
  });

  it('handle msg', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [coin('foo', 1000)]);

    // Act
    let msg: WrappedBankMessage = {
      bank: {
        send: {
          to_address: 'bob',
          amount: [coin('foo', 100)],
        }
      }
    };
    chain.handleMsg('alice', msg);

    // Assert
    expect(bank.getBalances()).toEqual({
      alice: [coin('foo', 900)],
      bob:   [coin('foo', 100)],
    });
  });

  it('contract integration', async () => {
    // Arrange
    const bank = chain.bank;
    const contract = await new TestContract(chain).instantiate();
    bank.setBalance(contract.address, [coin('foo', 1000)]);

    // Act
    const msg = exec.run(
      cmd.bank({
        send: {
          to_address: 'alice',
          amount: [coin('foo', 100)],
        },
      }),
      cmd.bank({
        send: {
          to_address: 'bob',
          amount: [coin('foo', 100)],
        },
      }),
      cmd.bank({
        burn: {
          amount: [coin('foo', 100)],
        },
      }),
    );
    const res = await contract.execute('alice', msg);

    // Assert
    expect(res.ok).toBeTruthy();
    expect(bank.getBalances()).toMatchObject({
      [contract.address]: [coin('foo', 700)],
      alice: [coin('foo', 100)],
      bob:   [coin('foo', 100)],
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
      coin('foo', 100),
      coin('bar', 200),
    ]);
    bank.setBalance('bob', [
      coin('foo', 200),
      coin('bar', 200),
    ]);
    
    let res = chain.querier.handleQuery({ bank: queryBalance });
    expect(res.ok).toBeTruthy();
    expect(fromBinary(res.val)).toEqual({ amount: coin('foo', 100)});
    
    res = chain.querier.handleQuery({ bank: queryAllBalances });
    expect(res.ok).toBeTruthy();
    expect(fromBinary(res.val)).toEqual({
      amount: [
        coin('foo', 200),
        coin('bar', 200),
      ],
    });
  });
  
  it('handle delete', () => {
    // Arrange
    const bank = chain.bank;
    bank.setBalance('alice', [coin('foo', 1000)]);
    bank.setBalance('bob', [coin('fizz', 900)]);

    // Act
    bank.deleteBalance('bob');

    // Assert
    expect(bank.getBalance('alice')).toBeDefined();
    expect(bank.getBalances()).toEqual({
      alice: [coin('foo', 1000)],
    });
  });
});

const coin = (denom: string, amount: string | number) => ({ denom, amount: `${amount}` });
