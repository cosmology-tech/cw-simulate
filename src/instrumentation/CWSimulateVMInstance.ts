import { VMInstance, Region, IBackend } from '@terran-one/cosmwasm-vm-js';
import { DebugLog } from '../types';

export class CWSimulateVMInstance extends VMInstance {
  constructor(public logs: Array<DebugLog>, backend: IBackend) {
    super(backend);
  }

  do_db_read(key: Region): Region {
    let result = super.do_db_read(key);
    this.logs.push({
      type: 'call',
      fn: 'db_read',
      args: {
        key: key.read(),
      },
      result: result.read(),
    });
    return result;
  }

  do_db_write(key: Region, value: Region) {
    super.do_db_write(key, value);
    this.logs.push({
      type: 'call',
      fn: 'db_write',
      args: { key: key.read(), value: value.read() },
    });
  }

  do_db_remove(key: Region) {
    super.do_db_remove(key);
    this.logs.push({
      type: 'call',
      fn: 'db_remove',
      args: { key: key.read() },
    });
  }

  do_db_scan(start: Region, end: Region, order: number): Region {
    let result = super.do_db_scan(start, end, order);
    this.logs.push({
      type: 'call',
      fn: 'db_scan',
      args: { start: start.read(), end: end.read(), order },
      result: result.read(),
    });
    return result;
  }

  do_db_next(iterator_id: Region): Region {
    let result = super.do_db_next(iterator_id);
    this.logs.push({
      type: 'call',
      fn: 'db_next',
      args: { iterator_id: iterator_id.read() },
      result: result.read(),
    });
    return result;
  }

  do_addr_humanize(source: Region, destination: Region): Region {
    let result = super.do_addr_humanize(source, destination);
    this.logs.push({
      type: 'call',
      fn: 'addr_humanize',
      args: { source: source.read() },
      result: result.read(),
    });
    return result;
  }

  do_addr_canonicalize(source: Region, destination: Region): Region {
    let result = super.do_addr_canonicalize(source, destination);
    this.logs.push({
      type: 'call',
      fn: 'addr_canonicalize',
      args: { source: source.read(), destination: destination.read() },
      result: result.read(),
    });
    return result;
  }

  do_addr_validate(source: Region): Region {
    let result = super.do_addr_validate(source);
    this.logs.push({
      type: 'call',
      fn: 'addr_validate',
      args: { source: source.read() },
      result: result.read(),
    });
    return result;
  }

  do_secp256k1_verify(hash: Region, signature: Region, pubkey: Region): number {
    let result = super.do_secp256k1_verify(hash, signature, pubkey);
    this.logs.push({
      type: 'call',
      fn: 'secp256k1_verify',
      args: {
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
    this.logs.push({
      type: 'call',
      fn: 'secp256k1_recover_pubkey',
      args: {
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
    this.logs.push({
      type: 'call',
      fn: 'abort',
      args: { message: message.read_str() },
    });
  }

  do_debug(message: Region) {
    this.logs.push({
      type: 'call',
      fn: 'debug',
      args: { message: message.read_str() },
    });
    super.do_debug(message);
    this.logs.push({
      type: 'print',
      message: message.str,
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
    this.logs.push({
      type: 'call',
      fn: 'ed25519_batch_verify',
      args: {
        messages_ptr: messages_ptr.read(),
        signatures_ptr: signatures_ptr.read(),
        pubkeys_ptr: public_keys_ptr.read(),
      },
      result,
    });
    return result;
  }

  do_ed25519_verify(
    message: Region,
    signature: Region,
    pubkey: Region
  ): number {
    let result = super.do_ed25519_verify(message, signature, pubkey);
    this.logs.push({
      type: 'call',
      fn: 'ed25519_verify',
      args: {
        message: message.read(),
        signature: signature.read(),
        pubkey: pubkey.read(),
      },
      result,
    });
    return result;
  }

  do_query_chain(request: Region): Region {
    let result = super.do_query_chain(request);
    this.logs.push({
      type: 'call',
      fn: 'query_chain',
      args: { request: request.read() },
      result: result.read(),
    });
    return result;
  }
}
