import { readFileSync } from 'fs';
import { CWSimulateApp } from './CWSimulateApp';

const testBytecode = readFileSync('testing/cw_simulate_tests-aarch64.wasm');

describe('CWSimulate Contract Tests', function() {
  it('works', async () => {
    let app = new CWSimulateApp({
      chainId: 'phoenix-1',
      bech32Prefix: 'terra',
    });

    let info = {
      sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
      funds: [],
    };

    let code = app.wasm.create(info.sender, Uint8Array.from(testBytecode));
    let res = await app.wasm.instantiate(info.sender, info.funds, code, {});
    let { contractAddress } = res;
    console.log(res);

    let executeMsg = {
      run: {
        program: [
          {
            msg: {
              push: {
                data: 'Hello',
              },
            },
          },
        ],
      },
    };

    res = await app.wasm.execute(
      info.sender,
      info.funds,
      contractAddress,
      executeMsg
    );
    console.log(res);

    res = await app.wasm.query(contractAddress, { get_buffer: {} });
    console.log(res);
  });
});
