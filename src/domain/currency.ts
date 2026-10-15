/**
 * Ways each currency can appear on screen. Longer markers first so "S/." wins over "S/".
 */
export const CURRENCIES = {
  EUR: { markers: ['EUR', '€'] },
  PEN: { markers: ['PEN', 'S/.', 'S/'] },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export function detectCurrency(text: string): CurrencyCode | null {
  const upper = text.toUpperCase();
  for (const [code, { markers }] of Object.entries(CURRENCIES)) {
    if (markers.some((m) => upper.includes(m))) return code as CurrencyCode;
  }
  return null;
}
