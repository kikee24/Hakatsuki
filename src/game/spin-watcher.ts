import type { Region } from '../config/game';
import { compareFrames } from '../vision/motion';
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
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function watchSpin(options: SpinWatchOptions): Promise<SpinWatchResult> {
  const { capture, readHud, trigger, baseline, reelsRegion } = options;
  const { intervalMs = 250, startTimeoutMs = 10_000, timeoutMs = 60_000 } = options;
  const sleep = options.sleep ?? wait;
  const now = options.now ?? Date.now;

  const tracker = new SpinTracker(baseline, options.tracker);
  let previous = await capture();
  const keyFrames: KeyFrame[] = [
    { phase: 'armed', reason: 'before spin', atMs: 0, frame: previous, diff: null, motionRatio: null, hud: null },
  ];

  const startedAt = now();
  await trigger();

  let framesObserved = 0;
  let timedOut = false;
  for (;;) {
    await sleep(intervalMs);
    const frame = await capture();
    const motion = await compareFrames(previous, frame, reelsRegion);
    const hud = await readHud(frame);
    const atMs = now() - startedAt;
    framesObserved++;

    const changesBefore = tracker.outcome.changes.length;
    const phase = tracker.observe({ atMs, hud, motionRatio: motion.changedRatio });
    for (const change of tracker.outcome.changes.slice(changesBefore)) {
      keyFrames.push({
        phase: change.to,
        reason: change.reason,
        atMs,
        frame,
        diff: motion.diffImage,
        motionRatio: motion.changedRatio,
        hud,
      });
    }
    previous = frame;

    if (phase === 'settled') break;
    const elapsed = now() - startedAt;
    if ((phase === 'armed' && elapsed > startTimeoutMs) || elapsed > timeoutMs) {
      timedOut = true;
      break;
    }
  }

  return { outcome: tracker.outcome, keyFrames, framesObserved, timedOut };
}
