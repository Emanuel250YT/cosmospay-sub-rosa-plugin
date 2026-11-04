import { describe, expect, it } from 'vitest';
import { remainingRevealWaitMs } from '../../src/reveal-timing.js';

describe('clear_v2 reveal deadline guard', () => {
  it('waits until deadline plus ledger buffer', () => {
    expect(remainingRevealWaitMs(1000, 999_000)).toBe(11_000);
  });

  it('allows clearing after the buffer', () => {
    expect(remainingRevealWaitMs(1000, 1_011_000)).toBe(0);
  });

  it('rejects an invalid deadline', () => {
    expect(() => remainingRevealWaitMs(NaN)).toThrow();
  });
});
