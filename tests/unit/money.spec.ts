import { expect, test } from '@playwright/test';
import { parseMoney } from '../../src/domain/money';

test.describe('parseMoney', () => {
  const cases: [string, number, string | null][] = [
    ['CREDIT €99.80', 9980, 'EUR'],
    ['BET €0.20', 20, 'EUR'],
    ['€1,234.56', 123456, 'EUR'],
    ['1.234,56 €', 123456, 'EUR'],
    ['EUR 10', 1000, 'EUR'],
    ['CRÉDITO S/ 99.80', 9980, 'PEN'],
    ['APUESTA S/. 0.5', 50, 'PEN'],
    ['PEN 2,500.00', 250000, 'PEN'],
    ['1 234,50', 123450, null],
  ];

  for (const [text, cents, currency] of cases) {
    test(`"${text}"`, () => {
      expect(parseMoney(text)).toEqual({ cents, currency });
    });
  }

  test('returns null when there is no number', () => {
    expect(parseMoney('GOOD LUCK!')).toBeNull();
  });
});
