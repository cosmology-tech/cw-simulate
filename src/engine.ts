import { CWChain } from './chain';

export class CWSimulateEnv {
  public chains: { [key: string]: CWChain } = {};

  constructor() {}

  createChain(opts: { chainId: string; bech32Prefix: string }): CWChain {
    this.chains[opts.chainId] = new CWChain(opts.chainId, opts.bech32Prefix);
    return new CWChain(opts.chainId, opts.bech32Prefix);
  }
}
