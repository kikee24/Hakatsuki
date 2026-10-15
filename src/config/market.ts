import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { CURRENCIES } from '../domain/currency';

const MarketSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string().url(),
  lobbyPath: z.string().startsWith('/'),
  locale: z.string(),
  language: z.enum(['en', 'es']),
  ocrLanguage: z.string(),
  currency: z.enum(Object.keys(CURRENCIES) as [keyof typeof CURRENCIES, ...(keyof typeof CURRENCIES)[]]),
  envPrefix: z.string().regex(/^[A-Z0-9_]+$/),
  insufficientFundsKeywords: z.array(z.string()).min(1),
});

export type MarketConfig = z.infer<typeof MarketSchema>;

export const MARKET_IDS = ['betsson-es', 'betsson-com', 'betsson-pe'] as const;
export type MarketId = (typeof MARKET_IDS)[number];

const DEFAULT_MARKETS: MarketId[] = ['betsson-es'];

/** Markets to run, from MARKETS="betsson-es,betsson-pe". Defaults to the market we have accounts for. */
export function activeMarkets(value = process.env.MARKETS): MarketId[] {
  const requested = value?.split(',').map((m) => m.trim()).filter(Boolean);
  if (!requested?.length) return DEFAULT_MARKETS;
  const unknown = requested.filter((m) => !(MARKET_IDS as readonly string[]).includes(m));
  if (unknown.length) throw new Error(`Unknown market(s) in MARKETS: ${unknown.join(', ')}. Known: ${MARKET_IDS.join(', ')}`);
  return requested as MarketId[];
}

export function loadMarket(id: string): MarketConfig {
  const file = resolve(process.cwd(), 'config', 'markets', `${id}.json`);
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return MarketSchema.parse(raw);
}

export function lobbyUrl(market: MarketConfig): string {
  return new URL(market.lobbyPath, market.baseUrl).toString();
}
