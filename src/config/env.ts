import type { MarketConfig } from './market';

export const ACCOUNT_KINDS = ['FUNDED', 'EMPTY'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

// No credentials here: Betsson's bot protection blocks automated logins, so a person logs in by
// hand once per account and tests reuse that browser window (src/session/).

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getProxy(market: MarketConfig): { server: string } | undefined {
  const server = readEnv(`${market.envPrefix}_PROXY_SERVER`);
  return server ? { server } : undefined;
}
