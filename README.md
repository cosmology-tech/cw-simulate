# CWSimulate

CWSimulate is a simulation engine for running [CosmWasm](https://cosmwasm.com) smart contracts for JavaScript environments such as the browser or Node.js. Under the hood, it uses the [`cosmwasm-vm-js`](https://github.com/terran-one/cosmwasm-vm-js) runtime to invoke contract functions inside CosmWasm binaries compiled to WebAssembly (.wasm). The design is inspired by the Rust package [`cw-multi-test`](https://github.com/cosmwasm/cw-multi-test).  

A basic web frontend called [`cw-simulate-ui`](https;//github.com/terran-one/cw-simulate-ui) is available where you can use CWSimulate interactively [here](https://cwsimulate.terran.one).

## Features

- handle multiple contract instances in one simulation environment
- support for user-defined custom blockchain modules
- extensible for further instrumentation via custom middlewares
- handles submessages properly, with detailed execution traces
- proper chain state rollback on errors

## Installation

CWSimulate is available on NPM at [`@terran-one/cw-simulate`](https://www.npmjs.com/package/@terran-one/cw-simulate).

Import the `@terran-one/cw-simulate` library from NPM in your `package.json`.

```bash
$ npm install -S @terran-one/cw-simulate
```

If you're using Yarn:

```bash
$ yarn add @terran-one/cw-simulate
```

## Quickstart

The following example creates a chain, instantiates a contract on it, and performs an `execute` and `query`.

```typescript
import { CWSimulateApp } from '@terran-one/cw-simulate';
import { readFileSync } from 'fs';

const sender = 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu';
const funds = [];
const wasmBytecode = readFileSync('./cw-template.wasm');

const app = new CWSimulateApp({
  chainId: 'phoenix-1',
  bech32Prefix: 'terra'
});

// import the wasm bytecode
const codeId = app.wasm.create(sender, wasmBytecode);

// instantiate the contract
let result = await app.wasm.instantiateContract(sender, funds, codeId, { count: 0 });
console.log('instantiateContract:', result.constructor.name, JSON.stringify(result, null, 2));

// pull out the contract address
const contractAddress = result.val.events[0].attributes[0].value;

// execute the contract
result = await app.wasm.executeContract(sender, funds, contractAddress, { increment: {} });
console.log('executeContract:', result.constructor.name, JSON.stringify(result, null, 2));

// query the contract
result = await app.wasm.query(contractAddress, { get_count: {} });
console.log('query:', result.constructor.name, JSON.stringify(result, null, 2));
```



## Usage

### Creating a new chain simulation





## Development

### Testing

CWSimulate uses [`cw-simulate-tests`](https://github.com/terran-one/cw-simulate-tests), a smart contract designed to test the various components of this package.

## License

This software is licensed under the [MIT License](https://opensource.org/licenses/MIT).

Copyright © 2022 Terran One LLC
