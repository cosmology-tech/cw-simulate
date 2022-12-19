import { toBase64 } from '@cosmjs/encoding';
import fs from 'fs';
import { CWSimulateApp } from './CWSimulateApp';
import * as persist from './persist';
import { TestContract } from '../testing/wasm-util';

const bytecode = fs.readFileSync('./testing/cw_simulate_tests-aarch64.wasm');

describe('de/serialize', () => {
  it('works', async () => {
    {
      const ref = new CWSimulateApp({ chainId: 'phoenix-1', bech32Prefix: 'terra1' });
      ref.wasm.create('alice', bytecode);
      ref.wasm.create('bob',   bytecode);
      
      const response = await ref.wasm.instantiateContract('alice', [], 1, {}, '');
      const address = response.unwrap().events[0].attributes[0].value;
      
      const bytes = persist.save(ref);
      const clone = await persist.load(bytes);
      expect(clone.chainId).toStrictEqual(ref.chainId);
      expect(clone.bech32Prefix).toStrictEqual(ref.bech32Prefix);
      
      const code1 = clone.wasm.getCodeInfo(1)!;
      const code2 = clone.wasm.getCodeInfo(2)!;
      expect(code1.creator).toStrictEqual('alice');
      expect(code2.creator).toStrictEqual('bob');
      expect(toBase64(code1.wasmCode)).toStrictEqual(toBase64(ref.wasm.store.getObject('codes', 1, 'wasmCode')));
      expect(toBase64(code2.wasmCode)).toStrictEqual(toBase64(ref.wasm.store.getObject('codes', 2, 'wasmCode')));
      
      let result = await clone.wasm.executeContract('alice', [], address, { debug: { msg: 'foobar' }});
      expect(result.ok).toBeTruthy();
    }
  })
})
