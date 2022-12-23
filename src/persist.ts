import SerdeProtocol, { SERDE } from '@kiruse/serde';
import { Reference } from '@kiruse/serde/dist/types';
import { List, Map } from 'immutable';
import { Ok } from 'ts-results';
import { CWSimulateApp } from './CWSimulateApp';

export const serde = SerdeProtocol.standard()
  .derive('immutable-list',
    (list: List<any>, data) => {
      return {
        data: data(list.toArray()),
        // ownerID is a unique object that should not even appear on
        // other Immutable data structures. When present, it signifies
        // that the Immutable should be mutated in-place rather than
        // creating copies of its data.
        mutable: !!(list as any).__ownerID,
      };
    },
    ({ data, mutable }, deref) => {
      if (!data.length) return List();
      const list = List().asMutable();
      Reference.all(deref, data, values => {
        for (const value of values) {
          list.push(value);
        }
        !mutable && list.asImmutable();
      });
      return list;
    },
  )
  .derive('immutable-map',
    (map: Map<any, any>, data) => {
      return {
        data: data(map.toObject()),
        // same as with List above
        mutable: !!(map as any).__ownerID,
      };
    },
    ({ data, mutable }, deref) => {
      const map = Map().asMutable();
      const keys = Object.keys(data);
      if (!keys.length) return Map();
      Reference.all(deref, keys.map(k => data[k]), values => {
        values.forEach((value, i) => {
          const key = keys[i];
          map.set(key, value);
        });
        !mutable && map.asImmutable();
      });
      return map;
    },
  )
  .derive('cw-simulate-app',
    (app: CWSimulateApp) => ({
      chainId: app.chainId,
      bech32Prefix: app.bech32Prefix,
      store: app.store.db.data,
    }),
    ({ chainId, bech32Prefix, store }, deref): CWSimulateApp => {
      const app = new CWSimulateApp({
        chainId,
        bech32Prefix,
      });
      Reference.all(deref, [store], ([map]) => {
        app.store.db.tx(update => {
          update(() => map);
          return Ok(undefined);
        });
      });
      return app;
    },
  )

export const save = (app: CWSimulateApp) => serde.serializeAs('cw-simulate-app', app).compress().buffer;
export const load = async (bytes: Uint8Array) => {
  const app = serde.deserializeAs('cw-simulate-app', bytes);
  const contracts = [...app.wasm.store.get('contracts').keys()];
  await Promise.all(contracts.map(address => app.wasm.getContract(address).init()));
  return app;
};

// Inject SERDE
Map.prototype[SERDE] = 'immutable-map';
List.prototype[SERDE] = 'immutable-list';
