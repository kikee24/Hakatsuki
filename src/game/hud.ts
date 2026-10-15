import type { GameTexts } from '../config/game';
import { parseMoney, type Money } from '../domain/money';
import { fuzzyContains, matchesWord, stripAccents } from '../domain/text-match';

/** What the game says it is doing, read from the status line under the reels. */
export type SpinStatus = 'idle' | 'spinning' | 'win' | 'unknown';

export interface HudReading {
  credit: Money | null;
  bet: Money | null;
  /** Amount shown after a winning spin; null when the status line shows no win. */
  win: Money | null;
  status: SpinStatus;
  /** A bonus round is still running (free spins / respins left), or the game waits on a bonus prompt. */
  bonus?: boolean;
}

/**
 * Finds a label such as "CRÉDITO" in OCR text and parses the amount right after it on the same line.
 * Reading after the label (not the first number on the line) ignores stray characters like "7 APUESTA".
 */
export function amountAfterLabel(text: string, labels: readonly string[]): Money | null {
  for (const rawLine of text.split('\n')) {
    const line = stripAccents(rawLine);
    for (const word of line.matchAll(/\S+/g)) {
      if (word[0].length < 3 || !matchesWord(word[0], labels)) continue;
      const money = parseMoney(line.slice(word.index + word[0].length));
      if (money) return money;
    }
  }
  return null;
}

export function readMoneyBlock(text: string, texts: GameTexts): Pick<HudReading, 'credit' | 'bet'> {
  return { credit: amountAfterLabel(text, texts.credit), bet: amountAfterLabel(text, texts.bet) };
}

/** Credit and bet, or a clear error naming what could not be read on screen. */
export function requireCreditAndBet(hud: HudReading): { credit: Money; bet: Money } {
  if (!hud.credit || !hud.bet) {
    const missing = [!hud.credit && 'credit', !hud.bet && 'bet'].filter(Boolean).join(' and ');
    throw new Error(`Could not read the in-game ${missing} on screen.`);
  }
  return { credit: hud.credit, bet: hud.bet };
}

/**
 * "TIRADAS GRATIS RESTANTES 2" while free spins are still being played. After the round the line
 * reads "TIRADAS GRATIS COMPLETADAS", which does not count: the bonus is over.
 */
export function bonusActive(text: string, texts: GameTexts): boolean {
  return texts.bonusActive.some((p) => fuzzyContains(text, p));
}

/** "PULSE EN CUALQUIER PARTE PARA CONTINUAR": a bonus screen waiting for the player to press. */
export function asksToContinue(text: string, texts: GameTexts): boolean {
  return texts.pressToContinue.some((p) => fuzzyContains(text, p));
}

export function readStatusLine(text: string, texts: GameTexts): Pick<HudReading, 'status' | 'win'> {
  const win = amountAfterLabel(text, texts.win);
  if (win) return { status: 'win', win };
  if (texts.spinning.some((p) => fuzzyContains(text, p))) return { status: 'spinning', win: null };
  if (texts.idle.some((p) => fuzzyContains(text, p))) return { status: 'idle', win: null };
  return { status: 'unknown', win: null };
}
