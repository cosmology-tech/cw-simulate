import { BankModule } from './bank';

describe('BankModule', () => {
  it('init balances', () => {
    const bank = new BankModule({});
  });

  it('handle send', () => {
    const bank = new BankModule({});
    bank.setBalance('alice', 1000);
    bank.send('alice', 'bob', 100);
    expect(bank.getBalance('alice')).toEqual(900);
    expect(bank.getBalance('bob')).toEqual(100);
  });
});
