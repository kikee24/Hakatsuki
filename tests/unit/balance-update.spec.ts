import { expect, test } from '@playwright/test';
import { balanceUpdateDecision } from '../../src/domain/balance-update';

// Real values from the 15 Oct runs: 98,90 € before, wager 0,25 €, win 0,15 € → 98,80 €.
const before = 9890;

test('stops at the first read that shows the predicted balance', () => {
  expect(balanceUpdateDecision({ beforeCents: before, expectedCents: 9880, currentCents: 9880, previousCents: null })).toBe('expected');
});

test('keeps waiting while Betsson still shows the old balance, even twice in a row', () => {
  expect(balanceUpdateDecision({ beforeCents: before, expectedCents: 9880, currentCents: 9890, previousCents: null })).toBe('wait');
  expect(balanceUpdateDecision({ beforeCents: before, expectedCents: 9880, currentCents: 9890, previousCents: 9890 })).toBe('wait');
});

test('stops when Betsson updated to another value and it is stable (prediction is off)', () => {
  // The payout was misread as 15,00 €, predicting 113,65 €; Betsson really showed 98,80 €.
  expect(balanceUpdateDecision({ beforeCents: before, expectedCents: 11365, currentCents: 9880, previousCents: null })).toBe('wait');
  expect(balanceUpdateDecision({ beforeCents: before, expectedCents: 11365, currentCents: 9880, previousCents: 9880 })).toBe('settled-elsewhere');
});

test('a balance still moving is not settled', () => {
  expect(balanceUpdateDecision({ beforeCents: before, expectedCents: 11365, currentCents: 9900, previousCents: 9880 })).toBe('wait');
});

test('a spin that paid back its wager leaves the balance unchanged and that is expected', () => {
  expect(balanceUpdateDecision({ beforeCents: before, expectedCents: before, currentCents: before, previousCents: null })).toBe('expected');
});
