/**
 * clear_v2 requires the on-chain reveal deadline to have passed.
 * Include a small buffer for ledger timestamp differences.
 */
export function remainingRevealWaitMs(
  deadlineSeconds: number,
  nowMs = Date.now(),
  bufferMs = 10_000,
): number {
  if (!Number.isSafeInteger(deadlineSeconds) || deadlineSeconds <= 0) {
    throw new Error('Invalid on-chain reveal deadline');
  }
  return Math.max(0, deadlineSeconds * 1000 + bufferMs - nowMs);
}
