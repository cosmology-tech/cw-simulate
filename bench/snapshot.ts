import { readFileSync } from 'fs';
import { AppResponse, CWSimulateApp } from '../src';

const testBytecode = readFileSync('testing/cw_simulate_tests-aarch64.wasm');

function getContractAddress(res: AppResponse): string {
  return res.events[0].attributes[0].value;
}

const app = new CWSimulateApp({
  chainId: 'phoenix-1',
  bech32Prefix: 'terra',
});

let info = {
  sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
  funds: [],
};

const codeId = app.wasm.create(info.sender, Uint8Array.from(testBytecode));

async function main() {
  let res = await app.wasm.instantiateContract(
    info.sender,
    info.funds,
    codeId,
    {}
  );
  if (res.err) {
    throw new Error(res.val);
  }
  let contractAddress = getContractAddress(res.val);
  let snapshots = [];

  for (let i = 0; i < 1000; i++) {
    res = await app.wasm.executeContract(
      info.sender,
      info.funds,
      contractAddress,
      { push: { data: 'A'.repeat(100) } }
    );
    snapshots.push(app.store);
  }

  console.log(process.memoryUsage());
}

main();
