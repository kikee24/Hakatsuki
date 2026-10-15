import type { Page } from '@playwright/test';
import type { GameConfig, Region } from '../config/game';
import { marketUi, type MarketConfig, type MarketUi } from '../config/market';
import { findKeyword } from '../domain/text-match';
import type { HudReader, HudSnapshot } from '../game/hud-reader';
import type { OcrResult } from '../vision/ocr';
import { GameSessionGate } from './game-session-gate';

export interface GameMessage {
  frame: Buffer;
  ocr: OcrResult;
  /** Which expected keyword was recognised, or null if none appeared before the timeout. */
  keyword: string | null;
}

/** One pass through the DGOJ game session gate (see GameSessionGate), kept as evidence. */
export interface GameSessionPass {
  /** False when Betsson showed no loss limit field (no balance): only the time limit was set. */
  lossLimitSet: boolean;
  /** What the limits form showed before submitting. */
  shownText: string;
}

/** Betsson refused to open a game session: play was blocked by the operator, not by the game. */
export class GameSessionRefusedError extends Error {
  constructor(readonly formText: string) {
    super(`Betsson did not accept the game session limits. Form says: ${formText.slice(0, 300)}`);
    this.name = 'GameSessionRefusedError';
  }
}

// The gate can replace the launcher iframe a moment after the iframe shows: only call the game
// open once no gate has appeared for this long.
const GATE_SETTLE_MS = 3_000;
// The gate may come back (e.g. the cool-down notice, then the form); never loop on it forever.
const MAX_GATE_PASSES = 3;

export interface PlayMode {
  real: boolean;
  /** The "modo Práctica" bar above the game is not shown. */
  practiceBannerHidden: boolean;
  /** The launcher URL Betsson builds says forReal=true. */
  launcherForReal: boolean;
  launcherProvider: string | null;
}

/**
 * Betsson game page. Everything outside the game (banner, launcher iframe) is DOM; everything
 * inside the game is a canvas, so this class only clicks inside it at configured regions and
 * leaves every judgement about what happened to the vision code.
 */
export class GamePage {
  private readonly ui: MarketUi;
  private readonly gate: GameSessionGate | undefined;
  /** Every time the game session gate was passed while opening the game. */
  readonly gameSessionPasses: GameSessionPass[] = [];

  constructor(
    private readonly page: Page,
    private readonly market: MarketConfig,
    private readonly game: GameConfig,
  ) {
    this.ui = marketUi(market);
    this.gate = market.gameSession ? new GameSessionGate(page, market.gameSession) : undefined;
  }

  /** The Betsson launcher iframe that hosts the provider game (it lives in shadow DOM). */
  get frame() {
    return this.page.locator('iframe[src*="Gamelauncher"]').first();
  }

  private get practiceBanner() {
    return this.page.getByText(this.ui.practiceBanner).first();
  }

  async open(): Promise<void> {
    await this.page.goto(new URL(this.game.path, this.market.baseUrl).toString());
    await this.waitForGameFrame();
  }

  /** Switches from practice to real money if Betsson opened the game in practice mode. */
  async ensureRealPlay(): Promise<PlayMode> {
    if (await this.practiceBanner.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.page.getByText(this.ui.realModeLink).first().click();
      await this.practiceBanner.waitFor({ state: 'hidden', timeout: 30_000 });
      await this.waitForGameFrame();
    }
    return this.playMode();
  }

  /**
   * Waits for the launcher iframe, passing the DGOJ game session gate (Spain) whenever it shows up:
   * it may not, if a game session is already active. Throws GameSessionRefusedError if Betsson
   * refuses the session.
   */
  private async waitForGameFrame(timeoutMs = 90_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.gate && (await this.gate.isGated())) {
        if (this.gameSessionPasses.length >= MAX_GATE_PASSES) throw new Error('The game session gate keeps coming back.');
        const { accepted, lossLimitSet, shownText, formText } = await this.gate.tryStart();
        if (!accepted) throw new GameSessionRefusedError(formText);
        this.gameSessionPasses.push({ lossLimitSet, shownText });
        continue;
      }
      if (await this.frame.isVisible()) {
        await this.page.waitForTimeout(GATE_SETTLE_MS);
        if (!(this.gate && (await this.gate.isGated())) && (await this.frame.isVisible())) return;
        continue;
      }
      if (Date.now() > deadline) throw new Error(`Game frame did not show up within ${timeoutMs / 1000}s.`);
      await this.page.waitForTimeout(1_000);
    }
  }

  async playMode(): Promise<PlayMode> {
    const practiceBannerHidden = !(await this.practiceBanner.isVisible());
    const src = (await this.frame.getAttribute('src')) ?? '';
    const params = new URL(src, this.market.baseUrl).searchParams;
    const launcherForReal = params.get('forReal') === 'true';
    return {
      real: practiceBannerHidden && launcherForReal,
      practiceBannerHidden,
      launcherForReal,
      launcherProvider: params.get('provider'),
    };
  }

  /** Screenshot of the game frame only: the input for every visual check. */
  async capture(): Promise<Buffer> {
    return this.frame.screenshot();
  }

  /** Clicks the centre of a region of the game frame (the canvas has no DOM controls). */
  async clickRegion(region: Region): Promise<void> {
    const box = await this.frame.boundingBox();
    if (!box) throw new Error('Game frame is not visible.');
    await this.page.mouse.click(box.x + (region.x + region.w / 2) * box.width, box.y + (region.y + region.h / 2) * box.height);
  }

  async clickSpin(): Promise<void> {
    await this.clickRegion(this.game.regions.spinButton);
  }

  /**
   * Waits until the HUD is readable (credit and bet visible), passing the intro splash if shown.
   * "Ready" is decided by reading the screen, not by the click succeeding.
   */
  async waitUntilReady(reader: HudReader, timeoutMs = 90_000): Promise<HudSnapshot> {
    const deadline = Date.now() + timeoutMs;
    let lastIntroClick = 0;
    for (;;) {
      const hud = await reader.read(await this.capture());
      if (hud.credit && hud.bet) return hud;
      if (Date.now() > deadline) throw new Error('Game HUD never became readable (credit/bet not found on screen).');
      // Loading or intro splash: press the continue button now and then, never in a tight loop.
      if (Date.now() - lastIntroClick > 5_000) {
        await this.clickRegion(this.game.regions.continueButton);
        lastIntroClick = Date.now();
      }
      await this.page.waitForTimeout(1_000);
    }
  }

  /** Reads the HUD until credit and bet are both visible, without clicking anything. */
  async readHud(reader: HudReader, timeoutMs = 15_000): Promise<HudSnapshot> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hud = await reader.read(await this.capture());
      if ((hud.credit && hud.bet) || Date.now() > deadline) return hud;
      await this.page.waitForTimeout(1_000);
    }
  }

  /** Waits for an in-game pop-up whose text contains one of `keywords` (fuzzy, OCR-tolerant). */
  async waitForMessage(reader: HudReader, keywords: readonly string[], timeoutMs = 15_000): Promise<GameMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const frame = await this.capture();
      const ocr = await reader.readMessage(frame);
      const keyword = findKeyword(ocr.text, keywords);
      if (keyword || Date.now() > deadline) return { frame, ocr, keyword };
      await this.page.waitForTimeout(1_000);
    }
  }

  /** Presses "−" until the bet read on screen stops going down, to spend as little as possible. */
  async lowerBetToMinimum(reader: HudReader, maxClicks = 20): Promise<HudSnapshot> {
    let hud = await reader.read(await this.capture());
    for (let i = 0; i < maxClicks; i++) {
      const before = hud.bet?.cents;
      await this.clickRegion(this.game.regions.betDown);
      await this.page.waitForTimeout(400);
      hud = await reader.read(await this.capture());
      if (hud.bet?.cents === before) break;
    }
    if (!hud.bet) throw new Error('Bet is not readable after lowering it.');
    return hud;
  }
}
