import { KVStore } from './KVStore';
import { toAscii } from '@cosmjs/encoding';

function ascii(s: string): Uint8Array {
  return toAscii(s);
}

describe('KVStore', () => {
  it('should set and get', () => {
    const store = new KVStore();
    store.set(ascii('foo'), ascii('bar'));
    expect(store.get(ascii('foo'))).toEqual(ascii('bar'));
  });

  it('iterator', () => {
    const store = new KVStore();
    store.set(ascii('a'), ascii('1'));
    store.set(ascii('b'), ascii('2'));
    store.set(ascii('c'), ascii('3'));
    store.set(ascii('cd'), ascii('4'));
    store.set(ascii('d'), ascii('5'));

    let range1 = Array.from(store.iterator(ascii('a'), ascii('c')));
    let range2 = Array.from(store.iterator(ascii('b'), ascii('d')));
    let range3 = Array.from(store.iterator(ascii('c'), ascii('e')));

    expect(range1).toEqual([
      [ascii('a'), ascii('1')],
      [ascii('b'), ascii('2')],
    ]);

    expect(range2).toEqual([
      [ascii('b'), ascii('2')],
      [ascii('c'), ascii('3')],
      [ascii('cd'), ascii('4')],
    ]);

    expect(range3).toEqual([
      [ascii('c'), ascii('3')],
      [ascii('cd'), ascii('4')],
      [ascii('d'), ascii('5')],
    ]);

  });
});
