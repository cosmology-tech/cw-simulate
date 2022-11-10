import { fromBase64, fromUtf8, toBase64, toUtf8 } from "@cosmjs/encoding";
import { Binary } from "./types";

export const toBinary = (value: any): Binary => toBase64(toUtf8(JSON.stringify(value)));
export const fromBinary = (str: string): unknown => JSON.parse(fromUtf8(fromBase64(str)));
