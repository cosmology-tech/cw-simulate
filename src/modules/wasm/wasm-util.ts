import { Sha256 } from "@cosmjs/crypto";
import { AppResponse, ContractResponse, Event } from "../../types";

function numberToBigEndianUint64(n: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, n, false);
  view.setUint32(4, 0, false);
  return new Uint8Array(buffer);
}

export function buildContractAddress(codeId: number, instanceId: number): Uint8Array {
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

export function buildAppResponse(
  contract: string,
  customEvent: Event,
  response: ContractResponse,
): AppResponse {
  const appEvents: Event[] = [];
  // add custom event
  appEvents.push(customEvent);

  // add contract attributes under `wasm` event type
  if (response.attributes.length > 0) {
    appEvents.push({
      type: 'wasm',
      attributes: [
        {
          key: '_contract_addr',
          value: contract,
        },
        ...response.attributes,
      ],
    });
  }

  // add events and prefix with `wasm-`
  for (const event of response.events) {
    appEvents.push({
      type: `wasm-${event.type}`,
      attributes: [
        { key: '_contract_addr', value: contract },
        ...event.attributes,
      ],
    });
  }

  return {
    events: appEvents,
    data: response.data,
  };
}
