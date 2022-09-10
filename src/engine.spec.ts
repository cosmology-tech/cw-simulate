import { CWSimulateEnv } from './engine';
import { readFileSync } from 'fs';

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
    instance.instantiate(info, {count: 0});

    let result = instance.execute(info, {increment: {}});
    instance.execute(info, {increment: {}});
    instance.execute(info, {increment: {}});
  });

  it('works with multiple chains and contracts', async () => {
    let env = new CWSimulateEnv();
    let chain1 = env.createChain({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra',
    });

    let chain2 = env.createChain({
      chainId: 'cosmoshub-2',
      bech32Prefix: 'cosmos',
    });

    let info = {
      sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
      funds: [],
    };

    expect(Object.keys(env.chains).length).toBe(2);
    expect(env.chains['phoenix-1']).toEqual(JSON.parse(JSON.stringify(chain1)));
    expect(env.chains['cosmoshub-2']).toEqual(JSON.parse(JSON.stringify(chain2)));
    let code = chain1.storeCode(wasmBytecode);
    let instance = await chain1.instantiateContract(code.codeId);
    instance.instantiate(info, {count: 0});

    let result = instance.execute(info, {increment: {}});

    let code2 = chain2.storeCode(wasmBytecode);
    let instance2 = await chain2.instantiateContract(code2.codeId);
    instance2.instantiate(info, {count: 0});

    let result2 = instance2.execute(info, {increment: {}});

    instance.execute(info, {increment: {}});
    instance.execute(info, {increment: {}});
  });
});
