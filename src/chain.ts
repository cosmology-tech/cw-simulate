import { Result, Ok, Err } from 'ts-results';
import { CWContractCode, CWContractInstance, MsgInfo } from './contract';
import { Sha256 } from '@cosmjs/crypto';
import { fromBech32, toBech32 } from '@cosmjs/encoding';
import { CWAccount } from './account';
import { Event, Binary, ContractResponse } from './cw-interface';
import { BasicKVIterStorage, IIterStorage } from '@terran-one/cosmwasm-vm-js';
import { CodeInfo, ContractInfo } from './telescope/cosmwasm/wasm/v1/types';

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

export interface AppResponse {
  events: Event[],
  data: Binary | null,
}

export interface CWChainOptions {
  chainId: string;
  bech32Prefix: string;
}

export class CWChain {

  public chainId: string;
  public bech32Prefix: string;

  public codes: {[id: number]: CWContractCode};
  public contracts: {[contractAddress: string]: CWContractInstance};

  // backend
  public store: IIterStorage;
  public height: number;
  public time: number;


  constructor(
    options: CWChainOptions,
  ) {
    this.chainId = options.chainId;
    this.bech32Prefix = options.bech32Prefix;


    this.codes = {};
    this.contracts = {};

    this.store = new BasicKVIterStorage();
    this.height = 1;
    this.time = 0;
  }

  get nextCodeId(): number {
    return Object.keys(this.codes).length + 1;
  }

  get nextInstanceId(): number {
    return Object.keys(this.contracts).length + 1;
  }

  create(creator: string, wasmCode: Uint8Array): number {

    let codeInfo = CodeInfo.encode({ creator: creator, codeHash: Uint8Array.from([]) });
    
    this.store.set();
    this.codes[this.nextCodeId] = contractCode;
    return contractCode;
  }

  instantiateContract(msg: MsgInstantiateContract) {
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

  instantiateContract(contractAddress: string, info: MsgInfo, instantiateMsg: any): any {
    const contractInstance = this.contracts[contractAddress];
    let res = contractInstance.instantiate(info, instantiateMsg);
    if (res.ok) {
      this.handleContractResponse(res.val);
    } else {
      return res;
    }
  }

  executeContract(contractAddress: string, info: MsgInfo, executeMsg: any): any {
    const contractInstance = this.contracts[contractAddress];
    let res = contractInstance.execute(info, executeMsg);
  }

  queryContract(contractAddress: string, queryMsg: any): Result<any, Error> {
    const contractInstance = this.contracts[contractAddress];
    return contractInstance.query(queryMsg);
  }

  private handleContractResponse(res: ContractResponse) {

  }

}
