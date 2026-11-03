import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  assertSorobanContract,
  assertStellarAccount,
  canonicalJson,
  canonicalRfqItemRef,
  sha256Hex,
} from '../../src/canonical-rfq.js';
import { CosmosPaySubRosaClient } from '../../src/cosmos-pay-client.js';

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

  it('sends an API key to the gateway, and the gateway secret only to this machine', () => {
    expect(
      () =>
        new CosmosPaySubRosaClient({
          baseUrl: 'https://api.cosmospay.lat/cosmos-api',
          apiKey: 'ck_live_x',
        }),
    ).not.toThrow();
    expect(
      () =>
        new CosmosPaySubRosaClient({
          baseUrl: 'http://127.0.0.1:3000',
          gatewaySecret: 's',
          consumerUsername: 'u',
        }),
    ).not.toThrow();
    expect(
      () =>
        new CosmosPaySubRosaClient({
          baseUrl: 'https://api.cosmospay.lat/cosmos-api',
          gatewaySecret: 's',
          consumerUsername: 'u',
        }),
    ).toThrow('this machine only');
    expect(
      () =>
        new CosmosPaySubRosaClient({
          baseUrl: 'http://api.example.com',
          apiKey: 'ck_live_x',
        }),
    ).toThrow('must be https');
    expect(
      () =>
        new CosmosPaySubRosaClient({
          baseUrl: 'https://api.example.com',
          apiKey: 'k',
          gatewaySecret: 's',
          consumerUsername: 'u',
        }),
    ).toThrow('either apiKey or gatewaySecret');
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
