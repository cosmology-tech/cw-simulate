import { readFileSync} from 'fs';
import { CWSimulateEnv } from './engine';

const testBytecode = readFileSync('testing/cw_simulate_tests-aarch64.wasm');

describe('CWSimulate Contract Tests', function() {
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

    let code = chain.storeCode(testBytecode);
    let { contractAddress } = await chain.createContractInstance(code.codeId);

    let executeMsg = {
      run: {
        program: [
          {
            msg: {
              push: {
                data: "Hello"
              }
            }
          }
        ]
      }
    };

    chain.instantiateContract(contractAddress, info, {});
    chain.executeContract(contractAddress, info, executeMsg);
    let res = chain.queryContract(contractAddress, { get_buffer: {} });
    console.log(res);
  });
});