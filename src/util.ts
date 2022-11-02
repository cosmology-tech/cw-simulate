import { Result, Err, Ok } from 'ts-results';
import { RustResult } from 'types';

export function fromRustResult<T>(result: RustResult<T>): Result<T, string> {
  if ('ok' in result) {
    return Ok(result.ok);
  }
  else if ('error' in result) {
    return Err(result.error);
  }
  throw new Error('Not a RustResult');
}

export function toRustResult<T>(result: Result<T, { toString(): string }>): RustResult<T> {
  if (result.ok) {
    return {
      ok: result.val,
    };
  }
  else {
    return {
      error: result.val.toString(),
    };
  }
}
