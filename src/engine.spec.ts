import { CWSimulateEnv } from './engine';
import { readFileSync } from 'fs';
import { fromAscii, toAscii, fromBase64, toBase64 } from '@cosmjs/encoding';

const wasmBytecode = readFileSync('testing/hello_world-aarch64.wasm');

describe('CWSimulateEnv', () => {
  it('works', async () => {
    let env = new CWSimulateEnv();
    let chain = env.createChain({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra',
    });

    let info = {
      sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
      funds: [],
    };

    let code = chain.storeCode(wasmBytecode);
    let instance = await chain.instantiateContract(code.codeId);
    instance.instantiate(info, { count: 0 });

    let result = instance.execute(info, { increment: {} });
    instance.execute(info, { increment: {} });
    instance.execute(info, { increment: {} });
  });
});
