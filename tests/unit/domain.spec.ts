import { expect, test } from '@playwright/test';
import { reconcileBalance } from '../../src/domain/balance-rule';
import { findKeyword, fuzzyContains } from '../../src/domain/text-match';
import { loadMarket, MARKET_IDS } from '../../src/config/market';

test.describe('reconcileBalance', () => {
  test('losing spin', () => {
    const r = reconcileBalance({ beforeCents: 10000, wagerCents: 20, payoutCents: 0, afterCents: 9980 });
    expect(r.ok).toBe(true);
  });

  test('winning spin', () => {
    const r = reconcileBalance({ beforeCents: 10000, wagerCents: 20, payoutCents: 150, afterCents: 10130 });
    expect(r.ok).toBe(true);
  });

  test('reports the difference when it does not reconcile', () => {
    const r = reconcileBalance({ beforeCents: 10000, wagerCents: 20, payoutCents: 0, afterCents: 10000 });
    expect(r).toMatchObject({ ok: false, expectedAfterCents: 9980, differenceCents: 20 });
  });
});

test.describe('fuzzy text matching', () => {
  test('tolerates OCR noise and accents', () => {
    expect(fuzzyContains('NO TIENES SALD0 INSUFlCIENTE para esta apuesta', 'saldo insuficiente')).toBe(true);
    expect(fuzzyContains('Fondos insuficientes', 'fondos insuficientes')).toBe(true);
  });

  test('does not match unrelated text', () => {
    expect(fuzzyContains('GOOD LUCK! PLACE YOUR BETS', 'insufficient funds')).toBe(false);
  });

  test('English keywords do not match a Spanish message', () => {
    const en = loadMarket('betsson-com');
    expect(findKeyword('Saldo insuficiente', en.insufficientFundsKeywords)).toBeNull();
  });
});

test('every market config is valid', () => {
  for (const id of MARKET_IDS) expect(() => loadMarket(id)).not.toThrow();
});
