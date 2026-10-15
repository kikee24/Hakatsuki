import { detectCurrency, type CurrencyCode } from './currency';

/** Amounts are integer cents to keep balance arithmetic exact. */
export interface Money {
  cents: number;
  currency: CurrencyCode | null;
}

const AMOUNT = /\d[\d.,\s]*\d|\d/;

/**
 * Parses an on-screen amount such as "1.234,56 €", "CRÉDITO 99,80 €", "APUESTA 0,20 €" or "€1,234.56".
 * The decimal separator is inferred: the last "." or "," followed by 1-2 digits at the end of the
 * number. Every other separator is treated as a thousands separator.
 */
export function parseMoney(text: string): Money | null {
  const match = text.match(AMOUNT);
  if (!match) return null;

  const numeric = match[0].replace(/\s/g, '');
  const decimal = numeric.match(/[.,](\d{1,2})$/);
  const integerPart = (decimal ? numeric.slice(0, -decimal[0].length) : numeric).replace(/[.,]/g, '');
  const fraction = decimal ? decimal[1]!.padEnd(2, '0') : '00';
  if (!/^\d+$/.test(integerPart)) return null;

  return {
    cents: Number(integerPart) * 100 + Number(fraction),
    currency: detectCurrency(text),
  };
}

export function formatMoney(money: Money, locale: string): string {
  const amount = money.cents / 100;
  return money.currency
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(amount)
    : amount.toFixed(2);
}
