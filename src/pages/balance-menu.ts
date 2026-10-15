import type { Locator, Page } from '@playwright/test';
import type { MarketUi } from '../config/market';
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

  private get toggle() {
    return this.page.getByRole('button', { name: this.ui.balanceButton }).first();
  }

  private label(text: string) {
    return this.page.getByText(text, { exact: true }).first();
  }

  async read(): Promise<BetssonBalance> {
    await this.toggle.click();
    const withdrawableLabel = this.label(this.ui.withdrawableLabel);
    await withdrawableLabel.waitFor({ state: 'visible' });

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
