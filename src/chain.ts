import { CWContractCode, CWContractInstance } from './contract';
import { Sha256 } from '@cosmjs/crypto';
import { toBech32 } from '@cosmjs/encoding';
import { CWAccount } from './account';

function numberToBigEndianUint64(n: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, n, false);
  view.setUint32(4, 0, false);
  return new Uint8Array(buffer);
}

function buildContractAddress(codeId: number, instanceId: number): Uint8Array {
  let contractId = new Uint8Array([
    ...numberToBigEndianUint64(codeId),
    ...numberToBigEndianUint64(instanceId),
  ]);

  // append module name
  let mKey = new Uint8Array([
    ...Uint8Array.from(Buffer.from('wasm', 'utf-8')),
    0,
  ]);
  let payload = new Uint8Array([...mKey, ...contractId]);

  let hasher = new Sha256();
  hasher.update(Buffer.from('module', 'utf-8'));
  let th = hasher.digest();
  hasher = new Sha256(th);
  hasher.update(payload);
  let hash = hasher.digest();
  return hash.slice(0, 20);
}

export class CWChain {
  constructor(
    public chainId: string,
    public bech32Prefix: string,
    public height: number = 1,
    public time: number = 0,
    public codes: { [id: number]: CWContractCode } = {},
    public contracts: { [contractAddress: string]: CWContractInstance } = {},
    public accounts: { [address: string]: CWAccount } = {}
  ) {}

  get nextCodeId(): number {
    return Object.keys(this.codes).length + 1;
  }

  get nextInstanceId(): number {
    return Object.keys(this.contracts).length + 1;
  }

  storeCode(wasmBytecode: Buffer): CWContractCode {
    const contractCode = new CWContractCode(
      this.nextCodeId,
      wasmBytecode
    );
    this.codes[this.nextCodeId] = contractCode;
    return contractCode;
  }

  async instantiateContract(codeId: number): Promise<CWContractInstance> {
    const contractAddressHash = buildContractAddress(
      codeId,
      this.nextInstanceId
    );
    const contractAddress = toBech32(this.bech32Prefix, contractAddressHash);
    const contractInstance = new CWContractInstance(
      this,
      contractAddress,
      this.codes[codeId]
    );
    await contractInstance.build();
    this.contracts[contractAddress] = contractInstance;
    return contractInstance;
  }
}
