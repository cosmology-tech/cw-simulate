import { CWChain } from './chain';

export class CWSimulateEnv {
  public chains: { [key: string]: CWChain } = {};

  constructor() {}

  createChain(opts: { chainId: string; bech32Prefix: string }): CWChain {
    const chain = new CWChain(opts.chainId, opts.bech32Prefix)
    this.chains[opts.chainId] = chain;
    return chain;
  }
}
