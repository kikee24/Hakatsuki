import { expect, type Locator, type Page } from '@playwright/test';
import type { GameSessionConfig } from '../config/market';

// A gate button covered by another dialog: stop trying after this and look at the screen again.
const CLICK_TIMEOUT_MS = 2_000;
// After a click went through, the next screen (notice or form) gets at least this long to show.
const FORM_AFTER_CLICK_MS = 15_000;

/**
 * Betsson's regulated "sesión de juego" (DGOJ, Orden HAP/1370/2014 art. 14), shown in the operator's
 * DOM before the game iframe can start in Real Play. Possible screens, in any order:
 *  - game blocked: "El juego no se inicia" → "Iniciar una nueva sesión";
 *  - cool-down notice: "Hace menos de 60 mins. que finalizaste tu sesión de juego" → "Iniciar sesión";
 *  - limits form: time limit chips, loss limit in EUR, optional self-exclusion, "Iniciar sesión".
 */
export class GameSessionGate {
  readonly blocked: Locator;
  readonly startNewSession: Locator;
  readonly coolDownContinue: Locator;
  readonly form: Locator;
  readonly lossLimit: Locator;
  readonly exclusion: Locator;
  readonly submit: Locator;

  constructor(private readonly page: Page, private readonly limits: GameSessionConfig) {
    this.blocked = page.locator('gaming-game_dgoj_session_blocked');
    this.startNewSession = page.locator('[data-test-id="search-other-games"]');
    this.coolDownContinue = page.locator('[data-test-id="start-new-session-buttons-btn-2-button"]');
    this.form = page.locator('[data-test-id="session-settings"]');
    this.lossLimit = page.locator('[data-test-id="session-settings_spending-limit-field-input"] input');
    this.exclusion = page.locator('[data-test-id="timeout-limit-input-input"]');
    this.submit = page.locator('[data-test-id="session-settings_submit-button-btn-1-button"]');
  }

  timeOption(minutes: number): Locator {
    return this.page.locator(`[data-test-id="session-settings_time-limit-option-${minutes * 60}"] button`);
  }

  /**
   * Clicks through the blocked screen and the cool-down notice until the limits form shows.
   * Betsson often opens the notice as a dialog over the blocked screen a moment after it: a click
   * on the button behind it is intercepted, and Playwright would keep scrolling and retrying until
   * the dialog goes. So each click gives up after a moment and the screen is looked at again, and
   * the time to wait counts from the last click that went through.
   */
  async openForm(timeoutMs = 30_000): Promise<void> {
    let deadline = Date.now() + timeoutMs;
    const press = async (button: Locator) => {
      const clicked = await button.click({ timeout: CLICK_TIMEOUT_MS }).then(() => true, () => false);
      if (clicked) deadline = Math.max(deadline, Date.now() + FORM_AFTER_CLICK_MS);
    };
    while (Date.now() < deadline) {
      if (await this.form.isVisible()) return;
      if (await this.coolDownContinue.isVisible()) await press(this.coolDownContinue);
      else if (await this.startNewSession.isVisible()) await press(this.startNewSession);
      await this.page.waitForTimeout(500);
    }
    throw new Error('The DGOJ session limits form did not show up.');
  }

  /** True when the game is held behind the session gate (any of its screens is visible). */
  async isGated(): Promise<boolean> {
    for (const l of [this.blocked, this.coolDownContinue, this.form]) if (await l.isVisible()) return true;
    return false;
  }

  /**
   * Tries to start a game session with the market's small limits. Never touches the self-exclusion
   * option. With no balance Betsson hides the loss limit field and shows a notice instead ("No
   * dispones de saldo, pero puedes crear la sesión…"): then only the time limit is set.
   * `shownText` is what the form showed before submitting (evidence); if Betsson refuses,
   * `accepted` is false and `formText` holds what it shows afterwards.
   */
  async tryStart(): Promise<{ accepted: boolean; lossLimitSet: boolean; shownText: string; formText: string }> {
    const { timeLimitMinutes, lossLimit, noExclusionLabel } = this.limits;
    await this.openForm();
    await this.timeOption(timeLimitMinutes).click();
    const lossLimitSet = await this.lossLimit.isVisible();
    if (lossLimitSet) await this.lossLimit.fill(lossLimit);
    const shownText = await visibleText(this.form);
    // Self-exclusion blocks play for the chosen period and cannot be undone: refuse to submit
    // unless it is still on its default.
    await expect(this.exclusion, 'self-exclusion must stay on its default').toHaveValue(noExclusionLabel);
    // A disabled submit (invalid limits) would make click() wait forever.
    if (await this.submit.isEnabled()) await this.submit.click({ timeout: 5_000 }).catch(() => undefined);
    const accepted = await this.form.waitFor({ state: 'hidden', timeout: 15_000 }).then(() => true, () => false);
    const formText = accepted ? '' : await visibleText(this.form);
    return { accepted, lossLimitSet, shownText, formText };
  }

  async start(): Promise<void> {
    const { accepted, formText } = await this.tryStart();
    if (!accepted) throw new Error(`Betsson did not accept the game session limits. Form says: ${formText.slice(0, 300)}`);
  }
}

/** Text of an element including its open shadow roots (innerText skips them), for evidence. */
async function visibleText(locator: Locator): Promise<string> {
  return locator
    .evaluate((root) => {
      const parts: string[] = [];
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) parts.push(text);
          return;
        }
        if (node instanceof Element && node.shadowRoot) node.shadowRoot.childNodes.forEach(walk);
        node.childNodes.forEach(walk);
      };
      walk(root);
      return parts.join(' ');
    })
    .catch(() => '');
}
