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
  language: z.enum(['es']),
  ocrLanguage: z.string(),
  currency: z.enum(Object.keys(CURRENCIES) as [keyof typeof CURRENCIES, ...(keyof typeof CURRENCIES)[]]),
  envPrefix: z.string().regex(/^[A-Z0-9_]+$/),
  insufficientFundsKeywords: z.array(z.string()).min(1),
});

export type MarketConfig = z.infer<typeof MarketSchema>;

// Single market by the organizer's decision (15/10). Adding a market = one JSON in config/markets/ + its id here.
export const MARKET_IDS = ['betsson-es'] as const;
export type MarketId = (typeof MARKET_IDS)[number];

const DEFAULT_MARKETS: MarketId[] = ['betsson-es'];

/** Markets to run, from MARKETS="betsson-es". Defaults to betsson.es. */
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
