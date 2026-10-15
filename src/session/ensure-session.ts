import type { Page } from '@playwright/test';
import { ACCOUNT_KINDS, type AccountKind } from '../config/env';
import { lobbyUrl, type MarketConfig } from '../config/market';
import { closeLiveBrowser, connectLiveBrowser, isLiveBrowserUp, launchLiveBrowser, openTab, tabUrl } from './live-browser';

async function waitFor<T>(what: string, timeoutMs: number, probe: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => undefined);
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

/** Logged-in header: the "Saldo" button only exists for a player with a session. */
export async function isLoggedIn(page: Page, timeoutMs = 20_000): Promise<boolean> {
  return page
    .locator('[data-test-id="balance-button"]')
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true, () => false);
}

/** Checks login in a fresh tab of the account's window (closed afterwards). */
async function windowIsLoggedIn(market: MarketConfig, kind: AccountKind): Promise<boolean> {
  const browser = await connectLiveBrowser(kind);
  try {
    const page = await browser.contexts()[0]!.newPage();
    try {
      await page.goto(lobbyUrl(market), { waitUntil: 'domcontentloaded' });
      return await isLoggedIn(page);
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    await browser.close(); // disconnects only
  }
}

/**
 * Makes sure the account's window is open and logged in, so tests never type a password:
 * 1. window already open and logged in → nothing to do;
 * 2. window closed → reopen it with its profile; Betsson's "Recordar" usually logs it back in;
 * 3. still logged out → open the login page and wait for a person to log in by hand.
 * While the person logs in nothing is attached to the page (only the tab list is polled over HTTP).
 *
 * Only one account is logged in at a time: with two accounts open at once from the same device,
 * Betsson's fraud protection logs one of them out. So the other accounts' windows are closed first.
 */
export async function ensureLoggedIn(market: MarketConfig, kind: AccountKind, loginTimeoutMs = 10 * 60_000): Promise<void> {
  for (const other of ACCOUNT_KINDS) if (other !== kind) await closeLiveBrowser(other);

  if (!(await isLiveBrowserUp(kind))) {
    launchLiveBrowser(market, kind, lobbyUrl(market));
    await waitFor('the browser to start', 30_000, async () => ((await isLiveBrowserUp(kind)) ? true : undefined));
  }
  if (await windowIsLoggedIn(market, kind)) return;

  const returnPath = new URL(lobbyUrl(market)).pathname;
  const loginUrl = new URL(`/inicio?returnUrl=${encodeURIComponent(returnPath)}`, market.baseUrl).toString();
  const tab = await openTab(kind, loginUrl);
  console.log(`\n>>> La sesión ${kind} no está iniciada. Inicia sesión A MANO en la ventana que se ha abierto (${loginTimeoutMs / 60_000} min).\n`);
  // Betsson leaves /inicio for returnUrl once the login succeeds.
  await waitFor('the manual login', loginTimeoutMs, async () => {
    const url = await tabUrl(kind, tab);
    return url && URL.canParse(url) && !new URL(url).pathname.startsWith('/inicio') ? true : undefined;
  });
  if (!(await windowIsLoggedIn(market, kind))) {
    throw new Error(`The ${kind} window left the login page but the header shows no balance button.`);
  }
}
