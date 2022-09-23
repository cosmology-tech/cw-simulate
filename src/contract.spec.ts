import { CWSimulateEnv } from './engine';
import { readFileSync } from 'fs';

const wasmBytecode = readFileSync('testing/hello_world-aarch64.wasm');

describe('CWSimulateEnv', () => {
  it('chain variables do not go stale', async () => {
    // Arrange
    const env = new CWSimulateEnv();
    const chain = env.createChain({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra'
    });
    const code = chain.storeCode(wasmBytecode);
    const instance = await chain.instantiateContract(code.codeId);

    // Act
    chain.height = 123;
    chain.time = 456;
    const execEnv = instance.getExecutionEnv();

    // Assert
    expect(execEnv.block.height).toBe(123);
    expect(execEnv.block.time).toBe('456');
  });
});
