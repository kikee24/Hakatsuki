import type { Page } from '@playwright/test';

/** OneTrust consent banner. Always rejects non-essential cookies. */
export class CookieBanner {
  constructor(private readonly page: Page) {}

  async rejectAllIfShown(timeoutMs = 5_000): Promise<boolean> {
    const rejectAll = this.page.locator('#onetrust-reject-all-handler');
    const settings = this.page.locator('#onetrust-pc-btn-handler');
    try {
      await rejectAll.or(settings).first().waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
      return false;
    }
    if (await rejectAll.isVisible()) {
      await rejectAll.click();
    } else {
      // Banner without a direct reject button: open preferences and reject from there.
      await settings.click();
      await this.page.locator('.ot-pc-refuse-all-handler').click();
    }
    return true;
  }
}
