import sharp from 'sharp';
import type { Region } from '../config/game';

export interface IconMatch {
  /** Where the icon is, relative to the whole image (same convention as configured regions). */
  region: Region;
  /** Normalised cross-correlation with the template, -1..1 (1 = identical up to brightness/contrast). */
  score: number;
}

export interface FindIconOptions {
  /** Only look inside this part of the image. Default: everywhere. */
  search?: Region;
  /** Icon sizes to try, as fractions of the image width (the template is square). */
  minSize: number;
  maxSize: number;
  sizeSteps?: number;
  /** The image is shrunk to this width first: matching is O(pixels × template pixels). */
  workWidth?: number;
}

interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

async function gray(image: Buffer | string, width: number, height?: number): Promise<Gray> {
  // removeAlpha + extractChannel: always one byte per pixel, even for images with transparency.
  // fit "fill" only with both sides given: with the width alone it would keep the original height
  // and stretch the image vertically.
  const { data, info } = await sharp(image)
    .removeAlpha()
    .resize(height === undefined ? { width } : { width, height, fit: 'fill' })
    .greyscale()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/**
 * Finds a round icon (e.g. Pragmatic Play's spin / continue button) by template matching, so it can
 * be clicked where the player sees it instead of at a position written per game. Only the inside of
 * the circle is compared, so the game's own background around the button does not matter.
 */
export async function findIcon(image: Buffer, template: Buffer | string, options: FindIconOptions): Promise<IconMatch | null> {
  const { search = { x: 0, y: 0, w: 1, h: 1 }, minSize, maxSize, sizeSteps = 8, workWidth = 240 } = options;
  const img = await gray(image, workWidth);
  const { width: W, height: H } = img;
  const sx0 = Math.floor(search.x * W);
  const sy0 = Math.floor(search.y * H);
  const sx1 = Math.min(W, Math.ceil((search.x + search.w) * W));
  const sy1 = Math.min(H, Math.ceil((search.y + search.h) * H));

  let best: IconMatch | null = null;
  for (let step = 0; step < sizeSteps; step++) {
    const size = Math.round((minSize + ((maxSize - minSize) * step) / Math.max(1, sizeSteps - 1)) * W);
    if (size < 6 || size > sx1 - sx0 || size > sy1 - sy0) continue;
    const tpl = await gray(template, size, size);

    // Circular mask and zero-mean template over it.
    const centre = (size - 1) / 2;
    const radius = size * 0.46;
    const offsets: number[] = [];
    const values: number[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((x - centre) ** 2 + (y - centre) ** 2 > radius ** 2) continue;
        offsets.push(y * W + x);
        values.push(tpl.data[y * size + x]!);
      }
    }
    const n = values.length;
    const meanT = values.reduce((a, b) => a + b, 0) / n;
    const t = values.map((v) => v - meanT);
    const normT = Math.sqrt(t.reduce((a, v) => a + v * v, 0));
    if (normT === 0) continue;

    for (let y = sy0; y + size <= sy1; y++) {
      for (let x = sx0; x + size <= sx1; x++) {
        const base = y * W + x;
        let sumI = 0;
        let sumI2 = 0;
        let sumIT = 0;
        for (let k = 0; k < n; k++) {
          const v = img.data[base + offsets[k]!]!;
          sumI += v;
          sumI2 += v * v;
          sumIT += v * t[k]!;
        }
        const varI = sumI2 - (sumI * sumI) / n;
        if (varI <= 0) continue;
        const score = sumIT / (Math.sqrt(varI) * normT);
        if (!best || score > best.score) {
          best = { score, region: { x: x / W, y: y / H, w: size / W, h: size / H } };
        }
      }
    }
  }
  return best;
}

export function centreOf(region: Region): { x: number; y: number } {
  return { x: region.x + region.w / 2, y: region.y + region.h / 2 };
}
