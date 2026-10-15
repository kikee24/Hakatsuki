/**
 * Reconnaissance run: logs in, opens a game and records what the player sees.
 * It never clicks inside the game, so it never places a bet.
 *
 *   npx tsx tools/recon.ts [funded|empty] [seconds]
 *
 * Output goes to recon-output/<timestamp>/ (git-ignored): periodic screenshots of the page and of
 * the game iframe, plus a network log with query strings stripped.
 */
import 'dotenv/config';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { browserChannel } from '../src/config/browser';
import { getCredentials, type AccountKind } from '../src/config/env';
import { loadMarket } from '../src/config/market';

const GAME_PATH = '/casino/tragaperras-slots/wolf-gold?gameAction=play';
const SAFE_PARAMS = ['lang', 'language', 'currency', 'cur', 'gameSymbol', 'symbol', 'gameId', 'forReal', 'marketCode', 'provider'];

const kind = (process.argv[2]?.toUpperCase() ?? 'FUNDED') as AccountKind;
const seconds = Number(process.argv[3] ?? 120);
const market = loadMarket('betsson-es');
const outDir = join('recon-output', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(outDir, { recursive: true });

const log = (file: string, line: string) => appendFileSync(join(outDir, file), line + '\n');
const say = (msg: string) => console.log(`[recon] ${msg}`);

/** Origin + path plus a few known-harmless params; tokens and session ids are dropped. */
function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const kept = SAFE_PARAMS.filter((p) => url.searchParams.has(p)).map((p) => `${p}=${url.searchParams.get(p)}`);
    return `${url.origin}${url.pathname}${kept.length ? ' ?' + kept.join('&') : ''}`;
  } catch {
    return raw.slice(0, 80);
  }
}

async function rejectCookies(page: Page) {
  try {
    const direct = page.locator('#onetrust-reject-all-handler');
    if (await direct.isVisible({ timeout: 5_000 })) return direct.click();
    await page.locator('#onetrust-pc-btn-handler').click({ timeout: 5_000 });
    await page.locator('.ot-pc-refuse-all-handler').click({ timeout: 5_000 });
  } catch {
    say('Cookie banner not handled automatically (reject it by hand if it shows up).');
  }
}

async function login(page: Page) {
  const { username, password } = getCredentials(market, kind);
  const email = page.getByTestId('email-input');
  try {
    if (!(await email.isVisible({ timeout: 3_000 }))) {
      await page.getByRole('button', { name: 'Iniciar sesión' }).first().click({ timeout: 10_000 });
    }
    await email.fill(username, { timeout: 10_000 });
    await page.getByTestId('password-input').fill(password);
    await page.getByTestId('account-login-btn-1-button').click();
  } catch {
    say('Automatic login failed: log in by hand in the browser window.');
  }
  await email.waitFor({ state: 'hidden', timeout: 120_000 });
  say('Logged in.');
}

async function main() {
  say(`Account: ${kind}. Recording for ${seconds}s into ${outDir}`);
  const browser = await chromium.launch({ headless: false, channel: browserChannel() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: market.locale });
  const page = await context.newPage();

  page.on('request', (r) => log('network.log', `${r.method()} ${r.resourceType()} ${safeUrl(r.url())}`));
  page.on('requestfailed', (r) => log('network.log', `FAILED ${safeUrl(r.url())} ${r.failure()?.errorText ?? ''}`));
  page.on('response', async (r) => {
    if (r.status() >= 400) log('network.log', `HTTP ${r.status()} ${safeUrl(r.url())}`);
    if (/gameService/i.test(r.url())) {
      const body = await r.text().catch(() => '');
      log('game-service.log', `${safeUrl(r.url())}\n${body.slice(0, 600)}\n`);
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log('console.log', `${m.type()} ${m.text().slice(0, 300)}`);
  });

  await page.goto(new URL('/casino', market.baseUrl).toString());
  await rejectCookies(page);
  await login(page);
  await page.goto(new URL(GAME_PATH, market.baseUrl).toString());
  say('Game page opened. Do not click Spin; just watch.');

  const game = page.locator('iframe[src*="Gamelauncher"]').first();
  const shots = Math.ceil(seconds / 5);
  for (let i = 1; i <= shots; i++) {
    await page.waitForTimeout(5_000);
    const n = String(i).padStart(2, '0');
    await page.screenshot({ path: join(outDir, `page-${n}.png`) });
    await game.screenshot({ path: join(outDir, `game-${n}.png`) }).catch(() => undefined);
    say(`Screenshot ${i}/${shots}`);
  }

  const frames = page.frames().map((f) => safeUrl(f.url()));
  writeFileSync(join(outDir, 'frames.txt'), frames.join('\n'));
  say(`Done. Results in ${outDir}`);
  await browser.close();
}

main().catch((err) => {
  console.error(`[recon] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
