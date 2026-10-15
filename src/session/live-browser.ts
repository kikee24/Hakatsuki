import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { browserExecutable } from '../config/browser';
import type { AccountKind } from '../config/env';
import type { MarketConfig } from '../config/market';

/**
 * The site's bot protection (AWS WAF + Group-IB) rejects automated logins, and the session it
 * grants cannot be copied to another browser: it lives in localStorage, in session-only cookies
 * that die when the browser closes, and is tied to the device fingerprint. So a person logs in by
 * hand in a normal Edge/Chrome window that stays open, and tests attach to it over CDP.
 * That window has no automation flags, which is also what the bot protection wants to see.
 */

// One window per account, each on its own debugging port.
const CDP_PORTS: Record<AccountKind, number> = { FUNDED: 9301, EMPTY: 9302 };

// Skip browser chores that slow down a fresh profile. None of them changes how pages behave.
const FAST_START_FLAGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-extensions',
  '--disable-component-update',
  '--disable-background-networking',
];

export function cdpUrl(kind: AccountKind): string {
  return `http://127.0.0.1:${CDP_PORTS[kind]}`;
}

export async function isLiveBrowserUp(kind: AccountKind): Promise<boolean> {
  return fetch(`${cdpUrl(kind)}/json/version`).then((r) => r.ok).catch(() => false);
}

/** Opens the account's window at `url` with its persistent profile in .auth/ (gitignored). */
export function launchLiveBrowser(market: MarketConfig, kind: AccountKind, url: string): void {
  const profile = resolve(`.auth/profile-${market.id}-${kind.toLowerCase()}`);
  mkdirSync(profile, { recursive: true });
  // msedge.exe/chrome.exe may be a launcher that exits right away; the browser keeps running.
  spawn(
    browserExecutable(),
    // Scale 1 regardless of Windows display scaling, so screenshots match the CSS pixels (ROIs).
    [`--user-data-dir=${profile}`, `--remote-debugging-port=${CDP_PORTS[kind]}`, '--window-size=1366,900', '--force-device-scale-factor=1', ...FAST_START_FLAGS, url],
    { stdio: 'ignore', detached: true },
  ).unref();
}

/** Opens a tab in an already running window over plain HTTP (nothing attached to the page). Returns its id. */
export async function openTab(kind: AccountKind, url: string): Promise<string> {
  const tab = (await (await fetch(`${cdpUrl(kind)}/json/new?${url}`, { method: 'PUT' })).json()) as { id: string };
  return tab.id;
}

/** Current URL of a tab, read over plain HTTP. Undefined once the tab is closed. */
export async function tabUrl(kind: AccountKind, id: string): Promise<string | undefined> {
  const tabs = (await (await fetch(`${cdpUrl(kind)}/json/list`)).json()) as { id: string; url: string }[];
  return tabs.find((t) => t.id === id)?.url;
}

/** Attach to the account's window. `browser.close()` on the result only disconnects; the window stays open. */
export async function connectLiveBrowser(kind: AccountKind): Promise<Browser> {
  if (!(await isLiveBrowserUp(kind))) {
    throw new Error(`The ${kind} browser window is not open. Open it with: npm run session:${kind.toLowerCase()}`);
  }
  return chromium.connectOverCDP(cdpUrl(kind));
}

/**
 * Closes the account's window (if open) and waits until it is gone. The login survives: the
 * profile's "Recordar" logs it back in when the window is reopened.
 */
export async function closeLiveBrowser(kind: AccountKind): Promise<void> {
  if (!(await isLiveBrowserUp(kind))) return;
  const browser = await chromium.connectOverCDP(cdpUrl(kind));
  const session = await browser.newBrowserCDPSession();
  await session.send('Browser.close').catch(() => undefined);
  const deadline = Date.now() + 15_000;
  while ((await isLiveBrowserUp(kind)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
}
