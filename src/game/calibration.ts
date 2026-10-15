import sharp from 'sharp';
import type { GameConfig, GameTexts, Region } from '../config/game';
import { centreOf, findIcon, type IconMatch } from '../vision/icon-finder';
import type { OcrEngine, TextLocation } from '../vision/ocr';

/**
 * Finds a game's controls on a screenshot of its frame, so a new Pragmatic Play game does not need
 * hand-measured regions: the player sees the round "circular arrows" button (continue on the intro,
 * spin in the game) and the CRÉDITO / APUESTA labels, and so does this.
 *
 * Measured on real frames of Wolf Gold and Bubble Up (tests/fixtures/screens): the icon scores
 * 0.92-0.95 on an intro's continue button and 0.54-0.73 on the in-game spin button, never above 0.73
 * elsewhere. Hence a high bar for "continue": pressing the spin button by mistake would bet.
 */
export const PRAGMATIC_BUTTON_TEMPLATE = 'assets/templates/pragmatic-spin-icon.png';
export const CONTINUE_MIN_SCORE = 0.85;
export const SPIN_MIN_SCORE = 0.6;

const ICON_SIZES = { minSize: 0.05, maxSize: 0.14, sizeSteps: 8 };
/** The spin button sits in the bottom-right part of the frame in Pragmatic's desktop layout. */
const SPIN_SEARCH: Region = { x: 0.5, y: 0.6, w: 0.5, h: 0.4 };
/**
 * CRÉDITO / APUESTA labels sit bottom-left, stacked. Not wider: the status line "¡HAGA SU
 * APUESTA!" further right would be taken for the bet label (seen on Wolf Gold).
 */
const LABEL_SEARCH: Region = { x: 0, y: 0.75, w: 0.45, h: 0.25 };
/** Vertical distance between the two stacked labels, in label heights (both games: ~1.8). */
const LABEL_STACK = 1.8;
/** "−" bet button: left of the spin button, same height, ~0.88 button widths away (both games). */
const BET_DOWN_OFFSET = 0.88;

/** The intro's continue button, or null when none is clearly visible. */
export async function findIntroContinue(frame: Buffer): Promise<IconMatch | null> {
  const match = await findIcon(frame, PRAGMATIC_BUTTON_TEMPLATE, ICON_SIZES);
  return match && match.score >= CONTINUE_MIN_SCORE ? match : null;
}

export type CalibratedRegions = Pick<GameConfig['regions'], 'money' | 'status' | 'spinButton' | 'betDown'>;

export interface Calibration {
  /** Null when something was not found: the configured regions are then kept. */
  regions: CalibratedRegions | null;
  spin: IconMatch | null;
  creditLabel: TextLocation | null;
  betLabel: TextLocation | null;
  /** What is missing, in words, when `regions` is null. */
  missing: string[];
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

function box(x0: number, y0: number, x1: number, y1: number): Region {
  const x = clamp(x0);
  const y = clamp(y0);
  return { x, y, w: clamp(x1) - x, h: clamp(y1) - y };
}

/**
 * CRÉDITO above APUESTA. Small frames make OCR miss one of them now and then (Bubble Up's
 * "CRÉDITO"), so once one is found the other is looked for right above / below it, in a small crop
 * that OCR reads better, and failing that placed by the stacked layout. The caller validates the
 * result by reading the HUD with it.
 */
async function findStackedLabels(
  frame: Buffer,
  ocr: OcrEngine,
  texts: GameTexts,
): Promise<{ creditLabel: TextLocation | null; betLabel: TextLocation | null }> {
  let creditLabel = await ocr.findText(frame, LABEL_SEARCH, texts.credit);
  let betLabel = await ocr.findText(frame, LABEL_SEARCH, texts.bet);
  const near = (r: Region, dy: number): Region => box(r.x - 0.05, r.y + dy - r.h, r.x + r.w + 0.08, r.y + dy + 2 * r.h);
  const shifted = (l: TextLocation, dy: number, text: string): TextLocation => ({
    text: `${text} (placed by layout)`,
    confidence: 0,
    region: { ...l.region, y: l.region.y + dy },
  });
  if (betLabel && !creditLabel) {
    const dy = -LABEL_STACK * betLabel.region.h;
    creditLabel = (await ocr.findText(frame, near(betLabel.region, dy), texts.credit)) ?? shifted(betLabel, dy, 'credit');
  }
  if (creditLabel && !betLabel) {
    const dy = LABEL_STACK * creditLabel.region.h;
    betLabel = (await ocr.findText(frame, near(creditLabel.region, dy), texts.bet)) ?? shifted(creditLabel, dy, 'bet');
  }
  return { creditLabel, betLabel };
}

/** Regions of the base game (HUD readable), found on one screenshot of the game frame. */
export async function calibrateBaseGame(frame: Buffer, ocr: OcrEngine, texts: GameTexts): Promise<Calibration> {
  const spinCandidate = await findIcon(frame, PRAGMATIC_BUTTON_TEMPLATE, { ...ICON_SIZES, search: SPIN_SEARCH });
  const spin = spinCandidate && spinCandidate.score >= SPIN_MIN_SCORE ? spinCandidate : null;
  const { creditLabel, betLabel } = await findStackedLabels(frame, ocr, texts);

  const missing = [!spin && 'spin button', !creditLabel && 'credit label', !betLabel && 'bet label'].filter(
    (m): m is string => Boolean(m),
  );
  if (!spin || !creditLabel || !betLabel) return { regions: null, spin, creditLabel, betLabel, missing };

  const spinCentre = centreOf(spin.region);
  const size = spin.region.w;
  const betDownCentre = { x: spinCentre.x - BET_DOWN_OFFSET * size, y: spinCentre.y };
  const betDown = box(betDownCentre.x - 0.02, betDownCentre.y - 0.035, betDownCentre.x + 0.02, betDownCentre.y + 0.035);

  // Money block: both labels plus room for the amounts printed after them.
  const labelsLeft = Math.min(creditLabel.region.x, betLabel.region.x);
  const labelsRight = Math.max(creditLabel.region.x + creditLabel.region.w, betLabel.region.x + betLabel.region.w);
  const labelsTop = Math.min(creditLabel.region.y, betLabel.region.y);
  const labelsBottom = Math.max(creditLabel.region.y + creditLabel.region.h, betLabel.region.y + betLabel.region.h);
  const money = box(labelsLeft - 0.01, labelsTop - 0.015, labelsRight + 0.15, labelsBottom + 0.015);

  // Status line: between the money block and the bet buttons, from just above the spin button's
  // centre to the bottom (two lines: total win, then per-line detail or free spins left).
  const status = box(money.x + money.w - 0.03, spinCentre.y - 0.04, betDown.x - 0.005, 1);

  // Layout sanity: labels left of the bet buttons, both labels stacked in the money block, a status
  // line wide enough to hold "¡HAGA SU APUESTA!". Anything else means something was misread.
  const problems = [
    status.w < 0.15 && 'status line too narrow (labels found too far right?)',
    money.h > 0.15 && 'credit and bet labels too far apart',
    money.x + money.w > betDown.x && 'money block overlaps the bet buttons',
  ].filter((p): p is string => Boolean(p));
  if (problems.length) return { regions: null, spin, creditLabel, betLabel, missing: problems };

  return { regions: { money, status, spinButton: spin.region, betDown }, spin, creditLabel, betLabel, missing };
}

/** The frame with every calibrated region drawn on it: evidence for the report. */
export async function drawRegions(frame: Buffer, regions: Partial<Record<string, Region>>): Promise<Buffer> {
  const { width = 1, height = 1 } = await sharp(frame).metadata();
  const colours = ['#ff3b30', '#34c759', '#ffcc00', '#00c7ff', '#ff2d55', '#af52de'];
  const shapes = Object.entries(regions)
    .filter((e): e is [string, Region] => Boolean(e[1]))
    .map(([name, r], i) => {
      const c = colours[i % colours.length];
      const x = r.x * width;
      const y = r.y * height;
      return `<rect x="${x}" y="${y}" width="${r.w * width}" height="${r.h * height}" fill="none" stroke="${c}" stroke-width="3"/><text x="${x + 3}" y="${Math.max(12, y - 4)}" fill="${c}" font-size="14" font-family="Arial">${name}</text>`;
    })
    .join('');
  return sharp(frame)
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}">${shapes}</svg>`) }])
    .png()
    .toBuffer();
}
