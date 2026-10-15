import { lobbyUrl } from '../../src/config/market';
import { expect, test } from '../../src/fixtures';

// Reachability check: answers "is this market accessible from where we run?" (geo-blocking,
// bot protection) before any credentials are involved.
test('casino lobby is reachable', async ({ page, market }, testInfo) => {
  const response = await page.goto(lobbyUrl(market), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3_000);
  await testInfo.attach('lobby', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('landing-url', { body: page.url(), contentType: 'text/plain' });

  expect(response?.status(), `HTTP status for ${page.url()}`).toBeLessThan(400);
  expect(new URL(page.url()).hostname, 'not redirected to another site').toContain(new URL(market.baseUrl).hostname.replace(/^www\./, ''));
});
