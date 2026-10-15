import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type { Region } from '../config/game';
import { cropRegion } from './preprocess';

/** Both crops are resized to this before comparing, so screenshots of any size compare equally. */
const SAMPLE = { width: 320, height: 180 };

/**
 * Share of changed pixels above which the reels count as moving. Measured on Wolf Gold fixtures:
 * compression noise and brightness shifts give 0%, a single blurred (still spinning) reel ~6%,
 * a completely new set of symbols 55-67%.
 */
export const MOTION_THRESHOLD = 0.02;

export interface MotionResult {
  /** Fraction (0..1) of sampled pixels that differ between the two frames. */
  changedRatio: number;
  moving: boolean;
  /** Visual diff (changed pixels in red) for the report. */
  diffImage: Buffer;
}

async function sample(image: Buffer, region: Region): Promise<Buffer> {
  const crop = await cropRegion(image, region);
  return sharp(crop).resize(SAMPLE.width, SAMPLE.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
}

export async function compareFrames(before: Buffer, after: Buffer, region: Region): Promise<MotionResult> {
  const [a, b] = await Promise.all([sample(before, region), sample(after, region)]);
  const diff = Buffer.alloc(SAMPLE.width * SAMPLE.height * 4);
  // threshold: per-pixel colour tolerance (0..1); 0.15 absorbs compression and glow flicker.
  const changed = pixelmatch(a, b, diff, SAMPLE.width, SAMPLE.height, { threshold: 0.15 });
  const changedRatio = changed / (SAMPLE.width * SAMPLE.height);
  const diffImage = await sharp(diff, { raw: { ...SAMPLE, channels: 4 } }).png().toBuffer();
  return { changedRatio, moving: changedRatio > MOTION_THRESHOLD, diffImage };
}
