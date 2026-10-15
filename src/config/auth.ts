import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountKind } from './env';

/** Saved browser sessions (cookies + storage). Git-ignored: they grant access to the account. */
export const AUTH_DIR = '.auth';

export function storageStatePath(marketId: string, account: AccountKind): string {
  return join(AUTH_DIR, `${marketId}-${account.toLowerCase()}.json`);
}

/**
 * Reusing a recent session avoids logging in on every run, which is what triggered Betsson's
 * temporary block. AUTH_MAX_AGE_MINUTES=0 forces a fresh login.
 */
export function isFreshSession(file: string, maxAgeMinutes = Number(process.env.AUTH_MAX_AGE_MINUTES ?? 30)): boolean {
  try {
    return Date.now() - statSync(file).mtimeMs < maxAgeMinutes * 60_000;
  } catch {
    return false;
  }
}
