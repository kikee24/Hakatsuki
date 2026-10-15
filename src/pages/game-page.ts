import type { Page } from '@playwright/test';
import type { GameConfig, Region } from '../config/game';
import { marketUi, type MarketConfig, type MarketUi } from '../config/market';
import { findKeyword } from '../domain/text-match';
import { drawRegions, findIntroContinue } from '../game/calibration';
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
    let lastCalibrationTry = 0;
    for (;;) {
      const frame = await this.capture();
      const hud = await reader.read(frame);
      if (hud.credit && hud.bet) return (await this.autoCalibrate(frame, reader, hud)) ?? hud;
      // HUD not readable with the configured regions: maybe they are wrong (new game). Try finding
      // the controls on screen (about a second of OCR, so not on every frame), unless this is
      // clearly the intro.
      const intro = await findIntroContinue(frame);
      if (!intro && Date.now() - lastCalibrationTry > 4_000) {
        lastCalibrationTry = Date.now();
        const calibrated = await this.autoCalibrate(frame, reader, null);
        if (calibrated) return calibrated;
      }
      if (Date.now() > deadline) throw new Error('Game HUD never became readable (credit/bet not found on screen).');
      // Loading or intro splash: press the continue button now and then, never in a tight loop.
      // Where the player sees it if it is on screen, else at the configured position.
      if (Date.now() - lastIntroClick > 5_000) {
        await this.clickRegion(intro?.region ?? this.game.regions.continueButton);
        this.introPresses.push(intro ? `continue button found on screen (score ${intro.score.toFixed(2)})` : 'configured continue position');
        lastIntroClick = Date.now();
      }
      await this.page.waitForTimeout(1_000);
    }
  }

  /** How the intro was passed, for the report. */
  readonly introPresses: string[] = [];
  /** What auto-calibration found on the base game, and whether it was used. */
  calibration: { applied: boolean; reason: string; regions: Partial<Record<string, Region>>; image: Buffer } | null = null;

  /**
   * Finds the controls on this base-game frame and uses them instead of the configured regions,
   * but only if the HUD then reads right: the same credit and bet as with the configured regions
   * (`configured`), or at least a readable credit and bet when the configured ones failed (null).
   * The regions live in the game config object shared with the HUD reader, so both switch.
   */
  private async autoCalibrate(frame: Buffer, reader: HudReader, configured: HudSnapshot | null): Promise<HudSnapshot | null> {
    if (this.calibration?.applied) return null;
    const result = await reader.calibrate(frame);
    if (!result.regions) {
      this.calibration = { applied: false, reason: `not found: ${result.missing.join(', ')}`, regions: {}, image: frame };
      return null;
    }
    const saved = { ...this.game.regions };
    Object.assign(this.game.regions, result.regions);
    const hud = await reader.read(frame);
    const agrees = configured
      ? hud.credit?.cents === configured.credit?.cents && hud.bet?.cents === configured.bet?.cents
      : Boolean(hud.credit && hud.bet);
    const image = await drawRegions(frame, result.regions);
    if (!agrees) {
      Object.assign(this.game.regions, saved);
      this.calibration = { applied: false, reason: 'the HUD did not read right with the found regions: configured ones kept', regions: result.regions, image };
      return null;
    }
    this.calibration = { applied: true, reason: configured ? 'found on screen, same HUD reading as the configured regions' : 'found on screen (configured regions did not read the HUD)', regions: result.regions, image };
    return hud;
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
