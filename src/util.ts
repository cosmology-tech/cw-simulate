import { fromBase64, fromUtf8, toBase64, toUtf8 } from "@cosmjs/encoding";
import { Err, Ok, Result } from "ts-results";
import { Binary, RustResult } from "./types";

export const toBinary = (value: any): Binary => toBase64(toUtf8(JSON.stringify(value)));
export const fromBinary = (str: string): unknown => JSON.parse(fromUtf8(fromBase64(str)));

export function fromRustResult<T>(res: RustResult<T>): Result<T, string> {
  if ('ok' in res) {
    return Ok(res.ok);
  }
  else if ('error' in res) {
    return Err(res.error);
  }
  else throw new Error('Invalid RustResult type');
}
export function toRustResult<T>(res: Result<T, string>): RustResult<T> {
  if (res.ok) {
    return { ok: res.val }
  } else {
    return { error: res.val }
  }
}
