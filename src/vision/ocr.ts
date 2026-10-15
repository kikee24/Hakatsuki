import sharp from 'sharp';
import { createWorker, type Block, type Worker } from 'tesseract.js';
import type { Region } from '../config/game';
import { matchesWord } from '../domain/text-match';
import { prepareForOcr, regionToPixels, VARIANTS, type Variant } from './preprocess';

export interface OcrResult {
  text: string;
  /** Tesseract's mean confidence, 0-100. */
  confidence: number;
  variant: Variant;
  /** The exact image Tesseract read, kept as evidence for the report. */
  image: Buffer;
}

export interface TextLocation {
  text: string;
  confidence: number;
  /** Where the word is, relative to the whole image (same convention as configured regions). */
  region: Region;
}

/**
 * Thin wrapper around a Tesseract worker. Create one per test (or worker) and terminate it after:
 * starting a worker loads the language model, which takes about a second.
 */
export class OcrEngine {
  private constructor(private readonly worker: Worker) {}

  static async create(language: string): Promise<OcrEngine> {
    const worker = await createWorker(language, 1, { cachePath: '.cache/tesseract' });
    await worker.setParameters({ user_defined_dpi: '300' });
    return new OcrEngine(worker);
  }

  async recognize(image: Buffer): Promise<{ text: string; confidence: number }> {
    const { data } = await this.worker.recognize(image);
    return { text: data.text.trim(), confidence: data.confidence };
  }

  /**
   * Reads a region trying each preprocessing variant until `accept` is satisfied.
   * If none is accepted, returns the most confident attempt so callers can still report what was seen.
   */
  async readRegion(image: Buffer, region: Region, accept: (text: string) => boolean = () => true): Promise<OcrResult> {
    let best: OcrResult | undefined;
    for (const variant of VARIANTS) {
      const prepared = await prepareForOcr(image, region, variant);
      const { text, confidence } = await this.recognize(prepared);
      const result = { text, confidence, variant, image: prepared };
      if (accept(text)) return result;
      if (!best || confidence > best.confidence) best = result;
    }
    return best!;
  }

  /**
   * Finds a word (e.g. a button caption such as "ACEPTAR") inside a region and returns where it is,
   * so it can be clicked by what it says rather than by a hard-coded position.
   */
  async findText(image: Buffer, region: Region, targets: readonly string[]): Promise<TextLocation | null> {
    const { width = 0, height = 0 } = await sharp(image).metadata();
    const crop = regionToPixels(region, width, height);
    for (const variant of VARIANTS) {
      const prepared = await prepareForOcr(image, region, variant);
      const { width: preparedWidth = crop.width } = await sharp(prepared).metadata();
      const scale = preparedWidth / crop.width;
      const { data } = await this.worker.recognize(prepared, {}, { blocks: true });
      const word = wordsOf(data.blocks).find((w) => matchesWord(w.text, targets));
      if (!word) continue;
      const { x0, y0, x1, y1 } = word.bbox;
      return {
        text: word.text,
        confidence: word.confidence,
        region: {
          x: (crop.left + x0 / scale) / width,
          y: (crop.top + y0 / scale) / height,
          w: (x1 - x0) / scale / width,
          h: (y1 - y0) / scale / height,
        },
      };
    }
    return null;
  }

  async terminate(): Promise<void> {
    await this.worker.terminate();
  }
}

function wordsOf(blocks: Block[] | null) {
  return (blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
}
