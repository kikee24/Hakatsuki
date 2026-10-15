/**
 * When to stop re-reading the Betsson balance after a spin. The header can lag behind the game for
 * a while, so a reading equal to the balance before the spin means "not updated yet": keep waiting.
 *
 * - `expected`: it shows the value the rule predicts → done.
 * - `settled-elsewhere`: it changed from before and gave the same value twice in a row, but not the
 *   predicted one → Betsson has updated and the prediction is what is off; stop and report the real
 *   value instead of reopening the menu until the timeout (as happened with an OCR-misread payout).
 * - `wait`: anything else (still the old value, or still moving).
 */
export type BalanceUpdateDecision = 'expected' | 'settled-elsewhere' | 'wait';

export function balanceUpdateDecision(input: {
  beforeCents: number;
  expectedCents: number;
  currentCents: number;
  previousCents: number | null;
}): BalanceUpdateDecision {
  const { beforeCents, expectedCents, currentCents, previousCents } = input;
  if (currentCents === expectedCents) return 'expected';
  if (currentCents !== beforeCents && currentCents === previousCents) return 'settled-elsewhere';
  return 'wait';
}
