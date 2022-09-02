# CWSimulate

This package provides a mock blockchain simulation environment for CosmWasm smart contracts to
interact with via the `cosmwasm-vm-js` JavaScript runtime.

## Motivation

Although `cosmwasm-vm-js` is sufficient for loading CosmWasm contracts and is capable of executing
code inside Node.js or the web browser, this by itself is not enough to simulate the effects of
smart contracts. A higher fidelity simulation environment should support the following:

- user customization of different chain environments for contracts to exist on
- multiple instances of contracts on multiple chains existing simultaneously
- an abstraction of various chain modules and chain state
- snapshot histories of chain states at different heights, and individual contract state diffs

This package combines `cosmwasm-vm-js` with additional abstractions and state management to
more accurately simulate the effects of CosmWasm contracts on the blockchain environments on which
they are hosted.

## Features

- support for multiple host chain environments (useful for IBC simulations)
- support for multiple simultaneous contract instances per chain
- chain modules can be simulated through custom user code
- extensible for further instrumentation via custom middlewares

## Frontends

The package `cw-simulate` can be either used directly in JavaScript runtimes that support WebAssembly
such as Node.js or V8-based browsers like Google Chrome. However, many will find that a frontend can
be more useful for better visualization or interactive usage.
# cw-simulate
