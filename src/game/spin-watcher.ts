import type { Region } from '../config/game';
import { compareFrames, MOTION_THRESHOLD } from '../vision/motion';
import type { HudReading } from './hud';
import {
  SpinTracker,
  type SpinBaseline,
  type SpinOutcome,
  type SpinPhase,
  type SpinTrackerOptions,
} from './spin-tracker';

export interface KeyFrame {
  phase: SpinPhase;
  reason: string;
  atMs: number;
  frame: Buffer;
  /** Reel diff against the previous frame (changed pixels highlighted). */
  diff: Buffer | null;
  motionRatio: number | null;
  hud: HudReading | null;
}

export interface SpinWatchOptions {
  /** Screenshot of the game frame only. */
  capture: () => Promise<Buffer>;
  readHud: (frame: Buffer) => Promise<HudReading>;
  /** Clicks Spin (or tries to). Called once, after the "before" frame is taken. */
  trigger: () => Promise<void>;
  baseline: SpinBaseline;
  reelsRegion: Region;
  intervalMs?: number;
  /** Give up if the game shows no reaction at all within this time. */
  startTimeoutMs?: number;
  /** Give up if the spin has not settled within this time. */
  timeoutMs?: number;
  /**
   * Bonus rounds (free spins, respins): `readPrompt` says whether a bonus screen waits for the
   * player ("pulse en cualquier parte para continuar") and `pressToContinue` presses it, like a
   * player would. Without them bonuses are not handled (and no settle confirmation is done).
   */
  readPrompt?: (frame: Buffer) => Promise<boolean>;
  pressToContinue?: () => Promise<void>;
  /** Give up if a spin with a bonus has not settled within this time. */
  bonusTimeoutMs?: number;
  /** Once settled, look again after this long: a bonus screen can appear after the trigger win. */
  settleConfirmMs?: number;
  /** Minimum time between two presses on a bonus prompt. */
  pressIntervalMs?: number;
  /**
   * Measure the reels' own motion at rest (two frames this far apart, before the spin) and require
   * clearly more to call them moving: some games animate their symbols all the time (Bubble Up).
   */
  idleBaselineMs?: number;
  tracker?: Partial<SpinTrackerOptions>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface SpinWatchResult {
  outcome: SpinOutcome;
  /** "before" frame plus one frame per phase change: the visual proof of the spin. */
  keyFrames: KeyFrame[];
  framesObserved: number;
  timedOut: boolean;
  /** Times a bonus prompt was pressed to continue. */
  bonusPresses: number;
  /** Reel motion at rest measured before the spin (idleBaselineMs), and the threshold used. */
  idleMotionRatio: number | null;
  motionThreshold: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function watchSpin(options: SpinWatchOptions): Promise<SpinWatchResult> {
  const { capture, readHud, trigger, baseline, reelsRegion, readPrompt, pressToContinue } = options;
  const { intervalMs = 250, startTimeoutMs = 10_000, timeoutMs = 60_000 } = options;
  const { bonusTimeoutMs = 300_000, settleConfirmMs = 4_000, pressIntervalMs = 3_000 } = options;
  const sleep = options.sleep ?? wait;
  const now = options.now ?? Date.now;

  let previous = await capture();
  let idleMotionRatio: number | null = null;
  if (options.idleBaselineMs) {
    await sleep(options.idleBaselineMs);
    const second = await capture();
    idleMotionRatio = (await compareFrames(previous, second, reelsRegion)).changedRatio;
    previous = second;
  }
  // Moving = clearly above what the reels do on their own at rest.
  const motionThreshold = Math.max(options.tracker?.motionThreshold ?? MOTION_THRESHOLD, idleMotionRatio === null ? 0 : idleMotionRatio * 2.5 + 0.01);
  const tracker = new SpinTracker(baseline, { ...options.tracker, motionThreshold });
  const keyFrames: KeyFrame[] = [
    { phase: 'armed', reason: 'before spin', atMs: 0, frame: previous, diff: null, motionRatio: null, hud: null },
  ];

  const startedAt = now();
  await trigger();

  let framesObserved = 0;
  let timedOut = false;
  let bonusPresses = 0;
  let lastPressAt = -Infinity;
  for (;;) {
    await sleep(intervalMs);
    const frame = await capture();
    const motion = await compareFrames(previous, frame, reelsRegion);
    let hud = await readHud(frame);
    const atMs = now() - startedAt;
    framesObserved++;

    // A full-screen bonus prompt means the round is not over. That OCR is slow (about a second) and
    // would thin out the frames used for motion, so it only runs when the status line points to a
    // bonus or cannot be read (a prompt covering it); a plain spin never pays for it.
    const lookForPrompt =
      readPrompt && tracker.phase !== 'armed' && (hud.bonus || tracker.outcome.bonus || hud.status === 'unknown');
    const prompt = lookForPrompt ? await readPrompt(frame) : false;
    if (prompt) hud = { ...hud, bonus: true };

    const changesBefore = tracker.outcome.changes.length;
    const phase = tracker.observe({ atMs, hud, motionRatio: motion.changedRatio });
    const key = (phaseOf: SpinPhase, reason: string) =>
      keyFrames.push({ phase: phaseOf, reason, atMs, frame, diff: motion.diffImage, motionRatio: motion.changedRatio, hud });
    for (const change of tracker.outcome.changes.slice(changesBefore)) key(change.to, change.reason);
    previous = frame;

    if (prompt && pressToContinue && atMs - lastPressAt >= pressIntervalMs) {
      key(phase, 'bonus screen waits for the player: pressed to continue');
      await pressToContinue();
      bonusPresses++;
      lastPressAt = atMs;
    }

    if (phase === 'settled') {
      if (!readPrompt) break;
      // A bonus screen can follow the win that triggered it (scatters): look again before trusting it.
      await sleep(settleConfirmMs);
      const check = await capture();
      const checkHud = await readHud(check);
      if (!checkHud.bonus && !(await readPrompt(check))) break;
      const checkAt = now() - startedAt;
      tracker.reopen(checkAt, 'bonus round started after the win: waiting for it to finish');
      keyFrames.push({ phase: 'stopped', reason: 'bonus round started after the win', atMs: checkAt, frame: check, diff: null, motionRatio: null, hud: checkHud });
      previous = check;
      continue;
    }
    const elapsed = now() - startedAt;
    const limit = tracker.outcome.bonus ? bonusTimeoutMs : timeoutMs;
    if ((phase === 'armed' && elapsed > startTimeoutMs) || elapsed > limit) {
      timedOut = true;
      break;
    }
  }

  return { outcome: tracker.outcome, keyFrames, framesObserved, timedOut, bonusPresses, idleMotionRatio, motionThreshold };
}
