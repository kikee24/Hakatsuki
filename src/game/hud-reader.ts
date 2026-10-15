import { gameTexts, type GameConfig, type GameTexts, type Region } from '../config/game';
import type { OcrEngine, OcrResult, TextLocation } from '../vision/ocr';
import { readMoneyBlock, readStatusLine, type HudReading } from './hud';

export interface HudSnapshot extends HudReading {
  /** Raw OCR for each region, so a report can show exactly what was read and from which pixels. */
  ocr: { money: OcrResult; status: OcrResult };
}

/** Reads the game HUD from a screenshot of the game frame only (the iframe element). */
export class HudReader {
  private readonly texts: GameTexts;

  constructor(
    private readonly ocr: OcrEngine,
    private readonly game: GameConfig,
    language: string,
  ) {
    this.texts = gameTexts(game, language);
  }

  async read(gameImage: Buffer): Promise<HudSnapshot> {
    const money = await this.ocr.readRegion(gameImage, this.game.regions.money, (text) => {
      const { credit, bet } = readMoneyBlock(text, this.texts);
      return credit !== null && bet !== null;
    });
    const status = await this.ocr.readRegion(
      gameImage,
      this.game.regions.status,
      (text) => readStatusLine(text, this.texts).status !== 'unknown',
    );
    return {
      ...readMoneyBlock(money.text, this.texts),
      ...readStatusLine(status.text, this.texts),
      ocr: { money, status },
    };
  }

  /** Text of a pop-up message (e.g. insufficient funds). Defaults to the game's message area. */
  async readMessage(gameImage: Buffer, region: Region = this.game.regions.message): Promise<OcrResult> {
    return this.ocr.readRegion(gameImage, region, (text) => text.replace(/\W/g, '').length > 10);
  }

  /** Locates the button that closes a pop-up by reading its caption ("ACEPTAR"). */
  async findDismissButton(gameImage: Buffer, region: Region = this.game.regions.message): Promise<TextLocation | null> {
    return this.ocr.findText(gameImage, region, this.texts.dismiss);
  }
}
