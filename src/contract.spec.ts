import { CWSimulateEnv } from './engine';
import { readFileSync } from 'fs';
import { CWAccount } from './address';

const wasmBytecode = readFileSync('testing/hello_world-aarch64.wasm');

describe('CWSimulateEnv', () => {
  it('chain variables do not go stale', async () => {
    // Arrange
    const env = new CWSimulateEnv();
    const chain = env.createChain({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra'
    });

    const account = new CWAccount('terraaddress123', {
      'uluna': '1000',
      'uust': '10000'
    });
    chain.accounts[account.address] = account;

    const code = chain.storeCode(wasmBytecode);
    const instance = await chain.instantiateContract(code.codeId);

    // Act
    chain.height = 123;
    chain.time = 456;
    const execEnv = instance.getExecutionEnv();

    // Assert
    expect(chain.accounts['terraaddress123'].balances['uluna']).toBe('1000');
    expect(chain.accounts['terraaddress123'].balances['uust']).toBe('10000');

    expect(execEnv.block.height).toBe(123);
    expect(execEnv.block.time).toBe('456');
  });
});
