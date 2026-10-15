import type { MarketConfig } from './market';

export type AccountKind = 'FUNDED' | 'EMPTY';

export interface Credentials {
  username: string;
  password: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Credentials always come from the environment (.env locally, repository secrets in CI).
 * Error messages name the missing variable, never its value.
 */
export function getCredentials(market: MarketConfig, kind: AccountKind): Credentials {
  const userVar = `${market.envPrefix}_${kind}_USERNAME`;
  const passVar = `${market.envPrefix}_${kind}_PASSWORD`;
  const username = readEnv(userVar);
  const password = readEnv(passVar);
  const missing = [!username && userVar, !password && passVar].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
  }
  return { username: username!, password: password! };
}

export function getProxy(market: MarketConfig): { server: string } | undefined {
  const server = readEnv(`${market.envPrefix}_PROXY_SERVER`);
  return server ? { server } : undefined;
}
