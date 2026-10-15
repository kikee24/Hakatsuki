import { mkdirSync } from 'node:fs';
import { AUTH_DIR, isFreshSession, storageStatePath } from '../../src/config/auth';
import { getCredentials, getProxy, type AccountKind } from '../../src/config/env';
import { lobbyUrl, marketUi } from '../../src/config/market';
import { test as setup } from '../../src/fixtures';
import { CookieBanner } from '../../src/pages/cookie-banner';
import { LoginDialog } from '../../src/pages/login-dialog';

// Runs in the "<market>-setup" project, which has tracing, video and screenshots OFF:
// typed credentials must never end up in a report artifact.
const ACCOUNTS: AccountKind[] = ['FUNDED', 'EMPTY'];

for (const account of ACCOUNTS) {
  setup(`log in with the ${account.toLowerCase()} account`, async ({ browser, market }) => {
    const file = storageStatePath(market.id, account);
    if (isFreshSession(file)) {
      setup.info().annotations.push({ type: 'auth', description: `Reused saved session ${file}` });
      return;
    }

    mkdirSync(AUTH_DIR, { recursive: true });
    const context = await browser.newContext({ locale: market.locale, proxy: getProxy(market) });
    try {
      const page = await context.newPage();
      await page.goto(lobbyUrl(market));
      await new CookieBanner(page).rejectAllIfShown();
      await new LoginDialog(page, marketUi(market)).logIn(getCredentials(market, account));
      await context.storageState({ path: file });
    } finally {
      await context.close();
    }
  });
}
