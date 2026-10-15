import sharp from 'sharp';
import type { Region } from '../config/game';

/**
 * Crops are rescaled as if the game frame were this wide, then upscaled 3x: Tesseract reads small
 * HUD fonts much better that way, and results do not depend on the screenshot resolution.
 */
const REFERENCE_GAME_WIDTH = 1100;
const UPSCALE = 3;

export type Variant = 'threshold' | 'gray' | 'inverted';

/** Tried in this order. "threshold" won on every fixture; the others are fallbacks. */
export const VARIANTS: readonly Variant[] = ['threshold', 'gray', 'inverted'];

export async function cropRegion(image: Buffer, region: Region): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const left = Math.round(region.x * width);
  const top = Math.round(region.y * height);
  return sharp(image)
    .extract({
      left,
      top,
      width: Math.min(Math.round(region.w * width), width - left),
      height: Math.min(Math.round(region.h * height), height - top),
    })
    .png()
    .toBuffer();
}

/** Crop a region and prepare it for OCR (light text on a busy background → dark text on white). */
export async function prepareForOcr(image: Buffer, region: Region, variant: Variant): Promise<Buffer> {
  const { width = REFERENCE_GAME_WIDTH } = await sharp(image).metadata();
  const crop = await cropRegion(image, region);
  const { width: cropWidth = 1 } = await sharp(crop).metadata();
  const scale = (REFERENCE_GAME_WIDTH / width) * UPSCALE;

  let pipeline = sharp(crop).resize({ width: Math.round(cropWidth * scale) }).grayscale().normalize();
  if (variant === 'threshold') pipeline = pipeline.threshold(150).negate();
  if (variant === 'inverted') pipeline = pipeline.negate();
  return pipeline.png().toBuffer();
}
