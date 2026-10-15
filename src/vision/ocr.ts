import { createWorker, type Worker } from 'tesseract.js';
import type { Region } from '../config/game';
import { prepareForOcr, VARIANTS, type Variant } from './preprocess';

export interface OcrResult {
  text: string;
  /** Tesseract's mean confidence, 0-100. */
  confidence: number;
  variant: Variant;
  /** The exact image Tesseract read, kept as evidence for the report. */
  image: Buffer;
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

  async terminate(): Promise<void> {
    await this.worker.terminate();
  }
}
