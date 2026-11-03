import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  assertSorobanContract,
  assertStellarAccount,
  canonicalJson,
  canonicalRfqItemRef,
  sha256Hex,
} from '../../src/canonical-rfq.js';

describe('companion-client evidence helpers', () => {
  it('canonicalizes object keys and hashes RFQs deterministically', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}',
    );
    const input = {
      rfqId: '86b82f3d-64d8-4b50-9b28-0d43f2f4500f',
      title: 'Audit',
      commitDeadline: 100,
      revealDeadline: 200,
    };
    expect(canonicalRfqItemRef(input)).toBe(canonicalRfqItemRef({ ...input }));
    expect(canonicalRfqItemRef(input)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes the exact canonical receipt bytes', () => {
    expect(sha256Hex('receipt\n')).toBe(
      '6afd9c1cbf495f9221fe5f9d03d4f0e962babd83fd293c696e69686510611a63',
    );
  });

  it('performs checksum-valid Stellar StrKey validation client-side', () => {
    const account = Keypair.random().publicKey();
    const contract = StrKey.encodeContract(Buffer.alloc(32, 7));
    expect(assertStellarAccount(account)).toBe(account);
    expect(assertSorobanContract(contract)).toBe(contract);
    expect(() => assertStellarAccount(`G${'A'.repeat(55)}`)).toThrow(
      'checksum-valid',
    );
    expect(() => assertSorobanContract(`C${'A'.repeat(55)}`)).toThrow(
      'checksum-valid',
    );
  });
});
