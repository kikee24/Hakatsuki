import type { Locator, Page } from '@playwright/test';
import type { MarketUi } from '../config/market';
import { balanceUpdateDecision, type BalanceUpdateDecision } from '../domain/balance-update';
import { parseMoney, type Money } from '../domain/money';

export interface BetssonBalance {
  /** "Disponible para retirar": real money the player can use. Used for the balance rule. */
  withdrawable: Money;
  bonus: Money | null;
  /** Screenshot of the amount rows only (never the row with the player's name). */
  evidence: Buffer;
}

/**
 * The "Saldo" dropdown in the Betsson header. The amount is not shown until it is opened.
 * Its first row contains the player's display name, so evidence is cropped to the labelled rows.
 */
export class BalanceMenu {
  constructor(
    private readonly page: Page,
    private readonly ui: MarketUi,
  ) {}

  /**
   * The header balance button. In the lobby it shows the amount ("98,90 €"), on the game page it
   * reads "Saldo", so it is found by its test id first and by that caption as a fallback.
   */
  private get toggle() {
    return this.page
      .locator('[data-test-id="balance-button"]')
      .or(this.page.getByRole('button', { name: this.ui.balanceButton }))
      .first();
  }

  private label(text: string) {
    return this.page.getByText(text, { exact: true }).first();
  }

  async read(): Promise<BetssonBalance> {
    // Bounded waits: without them a missing element only fails at the 3-minute test timeout.
    await this.toggle.click({ timeout: 15_000 }).catch((e: unknown) => {
      throw new Error(`Header balance button not found (logged out?): ${e instanceof Error ? e.message.split('\n')[0] : e}`);
    });
    const withdrawableLabel = this.label(this.ui.withdrawableLabel);
    await withdrawableLabel.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      throw new Error(`Balance menu opened but "${this.ui.withdrawableLabel}" did not show up.`);
    });

    const withdrawableRow = await this.rowWithAmount(withdrawableLabel);
    const bonusLabel = this.label(this.ui.bonusLabel);
    const bonusRow = (await bonusLabel.isVisible()) ? await this.rowWithAmount(bonusLabel) : null;

    const withdrawable = parseMoney(await amountText(withdrawableRow, this.ui.withdrawableLabel));
    if (!withdrawable) throw new Error(`Could not read "${this.ui.withdrawableLabel}" from the balance menu.`);
    const bonus = bonusRow ? parseMoney(await amountText(bonusRow, this.ui.bonusLabel)) : null;
    const evidence = await withdrawableRow.screenshot();

    await this.close();
    return { withdrawable, bonus, evidence };
  }

  /**
   * Balance after a spin. The header may lag behind the game, so it re-reads until it shows the
   * predicted value, or until it has moved away from `beforeCents` and settled on another value
   * (then the prediction is off and waiting longer would not help: see balanceUpdateDecision), or
   * until the timeout. Returns the last reading either way, with how it ended.
   */
  async readAfterSpin(
    beforeCents: number,
    expectedCents: number,
    timeoutMs = 60_000,
    intervalMs = 3_000,
  ): Promise<{ balance: BetssonBalance; reads: number; ended: BalanceUpdateDecision | 'timeout' }> {
    const deadline = Date.now() + timeoutMs;
    let previousCents: number | null = null;
    for (let reads = 1; ; reads++) {
      const balance = await this.read();
      const currentCents = balance.withdrawable.cents;
      const decision = balanceUpdateDecision({ beforeCents, expectedCents, currentCents, previousCents });
      if (decision !== 'wait') return { balance, reads, ended: decision };
      if (Date.now() > deadline) return { balance, reads, ended: 'timeout' };
      previousCents = currentCents;
      await this.page.waitForTimeout(intervalMs);
    }
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    if (await this.label(this.ui.withdrawableLabel).isVisible()) await this.toggle.click();
  }

  /** The label's parent usually holds the amount; fall back to the grandparent. */
  private async rowWithAmount(label: Locator): Promise<Locator> {
    for (const candidate of [label.locator('xpath=..'), label.locator('xpath=../..')]) {
      if (parseMoney(await candidate.innerText())) return candidate;
    }
    throw new Error('Balance row has no amount next to its label.');
  }
}

async function amountText(row: Locator, label: string): Promise<string> {
  return (await row.innerText()).replace(label, '');
}
