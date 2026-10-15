import type { Page } from '@playwright/test';
import type { Credentials } from '../config/env';
import type { MarketUi } from '../config/market';

/** Betsson asked us to wait before trying again (seen as an anti-fraud / rate limit response). */
export class LoginBlockedError extends Error {
  constructor() {
    super(
      'Betsson blocked the login ("vuelve a intentarlo en breve"). Wait ~10 minutes before retrying; ' +
        'repeated attempts can extend the block. Ask the challenge mentors to allow-list the test accounts.',
    );
    this.name = 'LoginBlockedError';
  }
}

/**
 * Login dialog. Its fields live inside open shadow DOM web components; Playwright's
 * test-id locators pierce shadow roots, so no special handling is needed.
 */
export class LoginDialog {
  constructor(
    private readonly page: Page,
    private readonly ui: MarketUi,
  ) {}

  get username() {
    return this.page.getByTestId('email-input');
  }

  get password() {
    return this.page.getByTestId('password-input');
  }

  get submit() {
    return this.page.getByTestId('account-login-btn-1-button');
  }

  async open(): Promise<void> {
    if (await this.username.isVisible()) return;
    await this.page.getByRole('button', { name: this.ui.loginButton }).first().click();
    await this.username.waitFor({ state: 'visible' });
  }

  /**
   * Single attempt, never retried automatically: retries are what got us rate-limited.
   * Callers must not record a trace while this runs (traces store the typed values).
   */
  async logIn({ username, password }: Credentials): Promise<void> {
    await this.open();
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submit.click();

    const blocked = this.page.getByText(this.ui.loginBlocked);
    const outcome = await Promise.race([
      this.username.waitFor({ state: 'hidden', timeout: 30_000 }).then(() => 'ok' as const),
      blocked.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'blocked' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome === 'blocked') throw new LoginBlockedError();
    if (outcome === 'timeout') throw new Error('Login did not complete within 30 s (dialog still open).');
  }
}
