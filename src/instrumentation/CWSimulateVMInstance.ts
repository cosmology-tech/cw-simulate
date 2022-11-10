import { VMInstance, Region, IBackend } from '@terran-one/cosmwasm-vm-js';

export class CWSimulateVMInstance extends VMInstance {
  public callHistory: any[] = [];

  constructor(backend: IBackend) {
    super(backend);
  }

  do_db_read(key: Region): Region {
    let result = super.do_db_read(key);
    this.callHistory.push({
      call: { type: 'db_read', key: key.read() },
      result: result.read(),
    });
    return result;
  }

  do_db_write(key: Region, value: Region) {
    super.do_db_write(key, value);
    this.callHistory.push({
      call: { type: 'db_write', key: key.read(), value: value.read() },
    });
  }

  do_db_remove(key: Region) {
    super.do_db_remove(key);
    this.callHistory.push({ call: { type: 'db_remove', key: key.read() } });
  }

  do_db_scan(start: Region, end: Region, order: number): Region {
    let result = super.do_db_scan(start, end, order);
    this.callHistory.push({
      call: { type: 'db_scan', start: start.read(), end: end.read(), order },
      result: result.read(),
    });
    return result;
  }

  do_db_next(iterator_id: Region): Region {
    let result = super.do_db_next(iterator_id);
    this.callHistory.push({
      call: { type: 'db_next', iterator_id: iterator_id.read() },
      result: result.read(),
    });
    return result;
  }

  do_addr_humanize(source: Region, destination: Region): Region {
    let result = super.do_addr_humanize(source, destination);
    this.callHistory.push({
      call: { type: 'addr_humanize', source: source.read() },
      result: result.read(),
    });
    return result;
  }

  do_addr_canonicalize(source: Region, destination: Region): Region {
    let result = super.do_addr_canonicalize(source, destination);
    this.callHistory.push({
      call: { type: 'addr_canonicalize', source: source.read() },
      result: result.read(),
    });
    return result;
  }

  do_addr_validate(source: Region): Region {
    let result = super.do_addr_validate(source);
    this.callHistory.push({
      call: { type: 'addr_validate', source: source.read() },
      result: result.read(),
    });
    return result;
  }

  do_secp256k1_verify(hash: Region, signature: Region, pubkey: Region): number {
    let result = super.do_secp256k1_verify(hash, signature, pubkey);
    this.callHistory.push({
      call: {
        type: 'secp256k1_verify',
        hash: hash.read(),
        signature: signature.read(),
        pubkey: pubkey.read(),
      },
      result,
    });
    return result;
  }

  do_secp256k1_recover_pubkey(
    msgHash: Region,
    signature: Region,
    recover_param: number
  ): Region {
    let result = super.do_secp256k1_recover_pubkey(
      msgHash,
      signature,
      recover_param
    );
    this.callHistory.push({
      call: {
        type: 'secp256k1_recover_pubkey',
        msgHash: msgHash.read(),
        signature: signature.read(),
        recover_param,
      },
      result: result.read(),
    });
    return result;
  }

  do_abort(message: Region) {
    super.do_abort(message);
    this.callHistory.push({
      call: { type: 'abort', message: message.read() },
    });
  }

  do_debug(message: Region) {
    super.do_debug(message);
    this.callHistory.push({
      call: { type: 'debug', message: message.read() },
    });
  }

  do_ed25519_batch_verify(
    messages_ptr: Region,
    signatures_ptr: Region,
    public_keys_ptr: Region
  ): number {
    let result = super.do_ed25519_batch_verify(
      messages_ptr,
      signatures_ptr,
      public_keys_ptr
    );
    this.callHistory.push({
      call: {
        type: 'ed25519_batch_verify',
        messages_ptr: messages_ptr.read(),
        signatures_ptr: signatures_ptr.read(),
        public_keys_ptr: public_keys_ptr.read(),
      },
    });
    return result;
  }

  do_ed25519_verify(
    message: Region,
    signature: Region,
    pubkey: Region
  ): number {
    let result = super.do_ed25519_verify(message, signature, pubkey);
    this.callHistory.push({
      call: {
        type: 'ed25519_verify',
        message: message.read(),
        signature: signature.read(),
      },
      result,
    });
    return result;
  }

  do_query_chain(request: Region): Region {
    let result = super.do_query_chain(request);
    this.callHistory.push({
      call: { type: 'query_chain', request: request.read() },
      result: result.read(),
    });
    return result;
  }
  
  /** Reset debug information such as debug messages & call history.
   * 
   * These should be valid only for individual contract executions.
   */
  resetDebugInfo() {
    this.debugMsgs = [];
    this.callHistory = [];
    return this;
  }
}
