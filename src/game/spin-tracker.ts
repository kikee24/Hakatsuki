import { MOTION_THRESHOLD } from '../vision/motion';
import type { HudReading } from './hud';

/**
 * armed    → Spin was requested, nothing has happened yet.
 * spinning → The game visibly reacted (see StartSignal).
 * stopped  → Reels are still, or the status line already shows a win.
 * settled  → Credit has stopped changing (win count-up finished) and no bonus round is running:
 *            the result can be read.
 *
 * A bonus (e.g. Wolf Gold's free spins after three scatters) keeps the spin in "stopped" until the
 * round is over, so the payout is the bonus total and not the scatter win that triggered it.
 */
export type SpinPhase = 'armed' | 'spinning' | 'stopped' | 'settled';

/** Independent pieces of on-screen evidence that a spin really started. */
export type StartSignal = 'status-text' | 'wager-deducted' | 'reel-motion';

export interface SpinBaseline {
  creditCents: number;
  betCents: number;
}

export interface Observation {
  /** Milliseconds since the spin was triggered. */
  atMs: number;
  hud: HudReading;
  /** Changed-pixel ratio of the reels against the previous frame; null when there is no previous frame. */
  motionRatio: number | null;
}

export interface PhaseChange {
  atMs: number;
  from: SpinPhase;
  to: SpinPhase;
  reason: string;
}

export interface SpinTrackerOptions {
  motionThreshold: number;
  /**
   * At or below this the reels count as still. Defaults to motionThreshold; higher for games whose
   * symbols move at rest, so their idle animation is not taken for spinning reels (watchSpin).
   */
  stillThreshold?: number;
  /** Consecutive moving frames needed to count as reel motion (a pop-up appearing moves only one). */
  movingFrames: number;
  /** Consecutive still frames needed to count the reels as stopped. */
  stillFrames: number;
  /** Consecutive identical credit reads needed to call the result settled. */
  stableReads: number;
}

export interface SpinOutcome {
  phase: SpinPhase;
  started: boolean;
  stopped: boolean;
  settled: boolean;
  startSignals: StartSignal[];
  baseline: SpinBaseline;
  /** Credit seen right after the wager was taken (baseline − bet), or null if never observed. */
  creditAfterWagerCents: number | null;
  finalCreditCents: number | null;
  /** Win shown by the game once the reels stopped; 0 for a losing spin. */
  payoutCents: number;
  /**
   * The same payout computed the other way, from the credit (final − after wager), as evidence:
   * both should agree. Null when either credit was not read.
   */
  payoutFromCreditCents: number | null;
  /** A bonus round was seen during this spin. */
  bonus: boolean;
  changes: PhaseChange[];
}

const DEFAULTS: SpinTrackerOptions = { motionThreshold: MOTION_THRESHOLD, movingFrames: 2, stillFrames: 2, stableReads: 2 };

/** Follows one spin from the outside, using only what is visible on screen. */
export class SpinTracker {
  private readonly options: SpinTrackerOptions;
  private current: SpinPhase = 'armed';
  private readonly signals = new Set<StartSignal>();
  private readonly changes: PhaseChange[] = [];
  private movingStreak = 0;
  private stillStreak = 0;
  private stableStreak = 0;
  private lastCredit: number | null = null;
  private creditAfterWager: number | null = null;
  private finalCredit: number | null = null;
  private payout = 0;
  private bonusSeen = false;
  /**
   * Win already on screen at the first look after the trigger: Wolf Gold keeps the previous spin's
   * win displayed while the reels turn (seen live after a bonus), so it is not this spin's payout.
   */
  private staleWin: number | null | undefined;

  constructor(
    private readonly baseline: SpinBaseline,
    options: Partial<SpinTrackerOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  get phase(): SpinPhase {
    return this.current;
  }

  observe({ atMs, hud, motionRatio }: Observation): SpinPhase {
    const moving = motionRatio !== null && motionRatio > this.options.motionThreshold;
    this.movingStreak = moving ? this.movingStreak + 1 : 0;
    const credit = hud.credit?.cents ?? null;
    if (hud.bonus) this.bonusSeen = true;
    if (this.staleWin === undefined) this.staleWin = hud.status === 'win' ? (hud.win?.cents ?? null) : null;
    // Once "¡BUENA SUERTE!" was seen the line has been cleared, so any win after it is this spin's,
    // even with the same amount as the previous one (two equal wins in a row).
    const newWin =
      hud.status === 'win' && hud.win !== null && (this.signals.has('status-text') || hud.win.cents !== this.staleWin);

    if (this.current === 'armed' || this.current === 'spinning') {
      if (hud.status === 'spinning') this.signals.add('status-text');
      if (credit !== null && credit === this.baseline.creditCents - this.baseline.betCents) {
        this.signals.add('wager-deducted');
        this.creditAfterWager ??= credit;
      }
      if (this.movingStreak >= this.options.movingFrames) this.signals.add('reel-motion');
    }

    if (this.current === 'armed') {
      if (this.signals.size === 0) return this.current;
      this.moveTo('spinning', atMs, `game reacted: ${[...this.signals].join(', ')}`);
    }

    if (this.current === 'spinning') {
      const still = motionRatio !== null && motionRatio <= (this.options.stillThreshold ?? this.options.motionThreshold);
      this.stillStreak = still ? this.stillStreak + 1 : 0;
      // A win left over from the previous spin does not stop this one: wait for the reels instead.
      if (newWin) {
        this.moveTo('stopped', atMs, 'status line shows a win');
      } else if (
        (this.signals.has('status-text') || this.signals.has('wager-deducted')) &&
        this.signals.has('reel-motion') &&
        hud.status === 'idle'
      ) {
        // The wager was taken (or "¡BUENA SUERTE!" shown, which many Pragmatic games never do),
        // the reels moved, and the status line reads "¡HAGA SU APUESTA!": the spin is over. Does
        // not need still reels, which never happens in games whose symbols are always animated
        // (Bubble Up waited for the 90 s timeout). If this comes too early, the watcher's settle
        // check reopens the spin when a win or the credit shows up afterwards.
        this.moveTo('stopped', atMs, 'status line idle after the spin started');
      } else if (
        this.signals.has('reel-motion') &&
        this.stillStreak >= this.options.stillFrames &&
        hud.status !== 'spinning'
      ) {
        this.moveTo('stopped', atMs, `reels still for ${this.stillStreak} frames`);
      } else {
        return this.current;
      }
    }

    if (this.current === 'stopped') {
      if (newWin) this.payout = hud.win!.cents;
      this.stableStreak = credit !== null && credit === this.lastCredit ? this.stableStreak + 1 : credit !== null ? 1 : 0;
      this.lastCredit = credit;
      if (this.stableStreak >= this.options.stableReads && hud.status !== 'spinning' && !hud.bonus) {
        this.finalCredit = credit;
        if (hud.status === 'idle') {
          // "¡HAGA SU APUESTA!" once the spin is over: it paid nothing (a win stays displayed).
          this.payout = 0;
        } else if (hud.status === 'win' && hud.win && this.payout === 0 && credit !== null && credit > this.baseline.creditCents - this.baseline.betCents) {
          // Same amount as the previous win, but the credit went up: it is a new win after all.
          this.payout = hud.win.cents;
        }
        this.moveTo('settled', atMs, `credit stable at ${credit} cents for ${this.stableStreak} reads`);
      }
    }
    return this.current;
  }

  /**
   * The result was still changing after the spin looked settled: a bonus showed up (e.g. the
   * free-spins screen a few seconds after the scatter win; `bonus`, the default) or the win/credit
   * moved on (cascading wins, `bonus: false`). Go back to "stopped" and wait for the end.
   */
  reopen(atMs: number, reason: string, { bonus = true }: { bonus?: boolean } = {}): void {
    if (this.current !== 'settled') return;
    if (bonus) this.bonusSeen = true;
    this.finalCredit = null;
    this.stableStreak = 0;
    this.lastCredit = null;
    this.moveTo('stopped', atMs, reason);
  }

  get outcome(): SpinOutcome {
    return {
      phase: this.current,
      started: this.current !== 'armed',
      stopped: this.current === 'stopped' || this.current === 'settled',
      settled: this.current === 'settled',
      startSignals: [...this.signals],
      baseline: this.baseline,
      creditAfterWagerCents: this.creditAfterWager,
      finalCreditCents: this.finalCredit,
      payoutCents: this.payout,
      payoutFromCreditCents:
        this.finalCredit !== null && this.creditAfterWager !== null ? this.finalCredit - this.creditAfterWager : null,
      bonus: this.bonusSeen,
      changes: [...this.changes],
    };
  }

  private moveTo(to: SpinPhase, atMs: number, reason: string) {
    this.changes.push({ atMs, from: this.current, to, reason });
    this.current = to;
  }
}
