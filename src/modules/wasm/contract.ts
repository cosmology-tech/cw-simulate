import { BasicBackendApi, BasicKVIterStorage, IBackend } from "@terran-one/cosmwasm-vm-js";
import { Map } from "immutable";
import { Ok, Result } from "ts-results";
import { CWSimulateVMInstance } from "../../instrumentation/CWSimulateVMInstance";
import { Coin, ContractResponse, DebugLog, ReplyMsg, Snapshot } from "../../types";
import { fromBinary, fromRustResult } from "../../util";
import type { WasmModule } from "./module";

/** An interface to interact with CW SCs */
export default class Contract {
  private _vm: CWSimulateVMInstance | undefined;
  
  constructor(private _wasm: WasmModule, public readonly address: string) {}
  
  async init() {
    if (!this._vm) {
      const { _wasm: wasm, address } = this;
      const contractInfo = wasm.getContractInfo(address);
      if (!contractInfo)
        throw new Error(`contract ${address} not found`);

      const { codeId } = contractInfo;
      const codeInfo = wasm.getCodeInfo(codeId);
      if (!codeInfo)
        throw new Error(`code ${codeId} not found`);

      const { wasmCode } = codeInfo;
      const contractState = this.getStorage();

      let storage = new BasicKVIterStorage();
      storage.dict = contractState;

      let backend: IBackend = {
        backend_api: new BasicBackendApi(wasm.chain.bech32Prefix),
        storage,
        querier: wasm.chain.querier,
      };

      const logs: DebugLog[] = [];
      const vm = new CWSimulateVMInstance(logs, backend);
      await vm.build(wasmCode);
      this._vm = vm;
    }
    return this;
  }
  
  instantiate(
    sender: string,
    funds: Coin[],
    instantiateMsg: any,
    logs: DebugLog[]
  ): Result<ContractResponse, string> {
    if (!this._vm) throw new Error(`No VM for contract ${this.address}`);
    const vm = this._vm;
    const env = this.getExecutionEnv();
    const info = { sender, funds };

    const res = fromRustResult<ContractResponse>(vm.instantiate(env, info, instantiateMsg).json);

    this.setStorage((vm.backend.storage as BasicKVIterStorage).dict);

    logs.push(...vm.logs);

    return res;
  }
  
  execute(
    sender: string,
    funds: Coin[],
    executeMsg: any,
    logs: DebugLog[],
  ): Result<ContractResponse, string>
  {
    const vm = this._vm;
    if (!vm) throw new Error(`No VM for contract ${this.address}`);
    vm.resetDebugInfo();

    const env = this.getExecutionEnv();
    const info = { sender, funds };

    const res = fromRustResult<ContractResponse>(vm.execute(env, info, executeMsg).json);

    this.setStorage((vm.backend.storage as BasicKVIterStorage).dict);

    logs.push(...vm.logs);

    return res;
  }
  
  reply(
    replyMsg: ReplyMsg,
    logs: DebugLog[],
  ): Result<ContractResponse, string> {
    if (!this._vm) throw new NoVMError(this.address);
    const vm = this._vm;
    const res = fromRustResult<ContractResponse>(vm.reply(this.getExecutionEnv(), replyMsg).json);

    this.setStorage((vm.backend.storage as BasicKVIterStorage).dict);

    logs.push(...vm.logs);

    return res;
  }
  
  query(queryMsg: any, store?: Map<string, string>): Result<any, string> {
    if (!this._vm) throw new NoVMError(this.address);
    const vm = this._vm;
    
    // time travel
    const currBackend = vm.backend;
    const storage = new BasicKVIterStorage(this.getStorage(store));
    vm.backend = {
      ...vm.backend,
      storage,
    };
    
    try {
      let env = this.getExecutionEnv();
      return fromRustResult<string>(vm.query(env, queryMsg).json)
        .andThen(v => Ok(fromBinary(v)));
    }
    // reset time travel
    finally {
      vm.backend = currBackend;
    }
  }
  
  setStorage(value: Map<string, string>) {
    this._wasm.setContractStorage(this.address, value);
  }
  
  getStorage(storage?: Snapshot): Map<string, string> {
    return this._wasm.getContractStorage(this.address, storage);
  }
  
  getExecutionEnv() {
    return this._wasm.getExecutionEnv(this.address);
  }
  
  get vm() { return this._vm }
  get valid() { return !!this._vm }
}

class NoVMError extends Error {
  constructor(contractAddress: string) {
    super(`No VM for contract ${contractAddress}`);
  }
}
