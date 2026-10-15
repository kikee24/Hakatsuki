import type { TestInfo } from '@playwright/test';
import type { HudReading } from '../game/hud';
import type { HudSnapshot } from '../game/hud-reader';
import type { SpinWatchResult } from '../game/spin-watcher';
import type { OcrResult } from '../vision/ocr';

export async function attachPng(testInfo: TestInfo, name: string, body: Buffer): Promise<void> {
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

export async function attachJson(testInfo: TestInfo, name: string, data: unknown): Promise<void> {
  await testInfo.attach(name, { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
}

/** Plain values of a HUD reading, without image buffers. */
export function hudValues(hud: HudReading) {
  return {
    status: hud.status,
    credit: hud.credit?.cents ?? null,
    bet: hud.bet?.cents ?? null,
    win: hud.win?.cents ?? null,
    currency: hud.credit?.currency ?? hud.bet?.currency ?? null,
  };
}

export async function attachOcr(testInfo: TestInfo, label: string, ocr: OcrResult): Promise<void> {
  await attachPng(testInfo, `${label} — OCR input`, ocr.image);
  await testInfo.attach(`${label} — OCR text`, {
    body: `variant: ${ocr.variant}\nconfidence: ${ocr.confidence.toFixed(0)}\n\n${ocr.text}`,
    contentType: 'text/plain',
  });
}

/** What the checker read from the HUD and the exact pixels it read it from. */
export async function attachHud(testInfo: TestInfo, label: string, hud: HudSnapshot, frame?: Buffer): Promise<void> {
  if (frame) await attachPng(testInfo, `${label} — game frame`, frame);
  await attachOcr(testInfo, `${label} — credit & bet`, hud.ocr.money);
  await attachOcr(testInfo, `${label} — status line`, hud.ocr.status);
  await attachJson(testInfo, `${label} — values (cents)`, hudValues(hud));
}

/** One frame (and reel diff) per phase of the spin, plus the full timeline. */
export async function attachSpin(testInfo: TestInfo, label: string, result: SpinWatchResult): Promise<void> {
  for (const [i, key] of result.keyFrames.entries()) {
    const name = `${label} ${i + 1}. ${key.phase} (${key.atMs} ms)`;
    await attachPng(testInfo, name, key.frame);
    if (key.diff) await attachPng(testInfo, `${name} — reel motion ${(100 * (key.motionRatio ?? 0)).toFixed(1)}%`, key.diff);
  }
  await attachJson(testInfo, `${label} — timeline`, {
    framesObserved: result.framesObserved,
    timedOut: result.timedOut,
    ...result.outcome,
    keyFrames: result.keyFrames.map((k) => ({
      phase: k.phase,
      reason: k.reason,
      atMs: k.atMs,
      motionRatio: k.motionRatio,
      hud: k.hud ? hudValues(k.hud) : null,
    })),
  });
}
