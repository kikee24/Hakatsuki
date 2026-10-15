import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/** A rectangle relative to the game frame: every value is a fraction (0..1) of its width or height. */
const RegionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().gt(0).max(1),
  h: z.number().gt(0).max(1),
});

const GameTextsSchema = z.object({
  credit: z.array(z.string()).min(1),
  bet: z.array(z.string()).min(1),
  win: z.array(z.string()).min(1),
  idle: z.array(z.string()).min(1),
  spinning: z.array(z.string()).min(1),
});

const GameSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  path: z.string().startsWith('/'),
  regions: z.object({
    money: RegionSchema,
    status: RegionSchema,
    message: RegionSchema,
    reels: RegionSchema,
    spinButton: RegionSchema,
    /** "−" button that lowers the bet. */
    betDown: RegionSchema,
    /** Round button on the intro splash that enters the game. */
    continueButton: RegionSchema,
  }),
  texts: z.record(z.string(), GameTextsSchema),
});

export type Region = z.infer<typeof RegionSchema>;
export type GameTexts = z.infer<typeof GameTextsSchema>;
export type GameConfig = z.infer<typeof GameSchema>;

export const FULL_FRAME: Region = { x: 0, y: 0, w: 1, h: 1 };

export function loadGame(id: string): GameConfig {
  const file = resolve(process.cwd(), 'config', 'games', `${id}.json`);
  return GameSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

export function gameTexts(game: GameConfig, language: string): GameTexts {
  const texts = game.texts[language];
  if (!texts) throw new Error(`Game "${game.id}" has no on-screen texts for language "${language}".`);
  return texts;
}
