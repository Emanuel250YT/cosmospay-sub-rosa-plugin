import { createHash } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';

export interface CanonicalRfqInput {
  rfqId: string;
  title: string;
  description?: string;
  commitDeadline: number;
  revealDeadline: number;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalRfqItemRef(input: CanonicalRfqInput): string {
  return sha256Hex(
    canonicalJson({
      schema: 'cosmos-pay:sub-rosa-rfq:v1',
      ...input,
      description: input.description ?? null,
    }),
  );
}

export function assertStellarAccount(value: string): string {
  try {
    StrKey.decodeEd25519PublicKey(value);
    return value;
  } catch {
    throw new Error('Expected a checksum-valid Stellar G... account');
  }
}

export function assertSorobanContract(value: string): string {
  try {
    StrKey.decodeContract(value);
    return value;
  } catch {
    throw new Error('Expected a checksum-valid Soroban C... contract id');
  }
}
