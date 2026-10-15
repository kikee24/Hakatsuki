import { expect, test } from '@playwright/test';
import { reconcileBalance } from '../../src/domain/balance-rule';
import { findKeyword, fuzzyContains } from '../../src/domain/text-match';
import { activeMarkets, loadMarket, MARKET_IDS } from '../../src/config/market';

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
    expect(fuzzyContains('¡BUENA SUERTE! HAZ TU APUESTA', 'saldo insuficiente')).toBe(false);
  });

  test('betsson.es keywords match the Spanish insufficient-balance message', () => {
    const es = loadMarket('betsson-es');
    expect(findKeyword('No tienes suficiente saldo para esta apuesta', es.insufficientFundsKeywords)).not.toBeNull();
    expect(findKeyword('¡BUENA SUERTE!', es.insufficientFundsKeywords)).toBeNull();
  });
});

test('every market config is valid', () => {
  for (const id of MARKET_IDS) expect(() => loadMarket(id)).not.toThrow();
});

test.describe('activeMarkets', () => {
  test('defaults to betsson.es', () => {
    expect(activeMarkets(undefined)).toEqual(['betsson-es']);
  });

  test('reads the MARKETS list', () => {
    expect(activeMarkets(' betsson-es ')).toEqual(['betsson-es']);
  });

  test('rejects markets out of scope', () => {
    expect(() => activeMarkets('betsson-es,betsson-pe')).toThrow(/Unknown market/);
  });
});
