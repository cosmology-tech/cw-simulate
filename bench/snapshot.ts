import { readFileSync } from 'fs';
import { AppResponse, CWSimulateApp } from '../src';
import { List } from 'immutable';
import _ from 'lodash';
import bytes = require('bytes');

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
  let snapshots = List();

  // make 25 contracts
  console.time('calls');
  for (let i = 0; i < 25; i++) {
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
    for (let j = 0; j < 1000; j++) {
      res = await app.wasm.executeContract(
        info.sender,
        info.funds,
        contractAddress,
        { push: { data: 'A'.repeat(100) } }
      );
      snapshots = snapshots.push(app.store);
    }
  }
  console.timeEnd('calls');

  console.log(_.mapValues(process.memoryUsage(), bytes));
}

main();
