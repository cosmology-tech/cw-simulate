# `cw-simulate`

This package combines `cosmwasm-vm-js` with additional abstractions and state management to
more accurately simulate the effects of CosmWasm contracts on the blockchain environments on which
they are hosted.

## Features

- configure multiple host chain environments with chain-specific settings / state
- multiple simultaneous contract instances can exist per chain
- chain modules can be simulated through custom user code
- extensible for further instrumentation via custom middlewares


## Getting Started

Import the `cw-simulate` library from NPM in your `package.json`.

```bash
$ npm install -S cw-simulate
```

If you're using Yarn:

```bash
$ yarn add cw-simulate
```

## Usage

1. Create a `Simulation` object - this is the global simulation environment where one or more chains can be described.
2. Create and register your `CWChain` instances against the `Simulation` object, which describe chain-specific configurations.
3. As needed, per chain:
   - Upload the WASM bytecode using `CWChain.storeCode()`. This will register a new `codeId` to reference the uploaded contract code.
   - Create a new contract instance using `CWChain.createInstance()` and passing in the `codeId` generated in the previous step. This results in a `contractAddress` to refer to the contract instance.
  - Run `instantiate` on the instance -- the contract's `instantiate` entrypoint. 
  - You can now run `execute` and `query` messages against the instance, and they should work as expected.
### Example

The following example creates 2 chains, instantiates a contract on one of the chains, and performs an `execute` and `query`.

```typescript
import { Simulation } from 'cw-simulate';
import { readFileSync } from 'fs';

const env = new Simulation();

// create first chain
const chain1 = env.createChain({
  chainId: 'phoenix-1',
  bech32Prefix: 'terra'
});

// create second chain
const chain2 = env.createChain({
  chainId: 'juno-1',
  bech32Prefix: 'juno'
});

const wasmBytecode = readFileSync('cw-template.wasm');

const code = chain1.storeCode(wasmBytecode);
const instance = await chain1.instantiateContract(code.codeId);

const info = {
  sender: 'terra1hgm0p7khfk85zpz5v0j8wnej3a90w709vhkdfu',
  funds: []
};

// get contract address
console.log(instance.contractAddress);

// instantiate the contract
let result = instance.instantiate(info, { count: 0 });
console.log(result);

// execute the contract
result = instance.execute(info, { increment: {} });
console.log(result);

// query the contract
result = instance.query({ get_count: {} });
console.log(result);
```