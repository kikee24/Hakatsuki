import { expect, test } from '@playwright/test';
import { parseMoney } from '../../src/domain/money';

test.describe('parseMoney', () => {
  const cases: [string, number, string | null][] = [
    ['1.234,56 €', 123456, 'EUR'],
    ['CRÉDITO 99,80 €', 9980, 'EUR'],
    ['APUESTA 0,20 €', 20, 'EUR'],
    ['GANANCIA 1,5 €', 150, 'EUR'],
    ['12.345,00 €', 1234500, 'EUR'],
    ['EUR 10', 1000, 'EUR'],
    // Some games ignore the locale and render English formatting
    ['€1,234.56', 123456, 'EUR'],
    ['1 234,50', 123450, null],
  ];

  for (const [text, cents, currency] of cases) {
    test(`"${text}"`, () => {
      expect(parseMoney(text)).toEqual({ cents, currency });
    });
  }

  test('returns null when there is no number', () => {
    expect(parseMoney('¡BUENA SUERTE!')).toBeNull();
  });
});
