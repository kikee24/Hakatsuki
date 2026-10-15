import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export const SCREENS_DIR = join('tests', 'fixtures', 'screens');

interface HudFixture {
  file: string;
  gameBox: { left: number; top: number; width: number; height: number };
  expected: { creditCents: number | null; betCents: number | null; winCents: number | null; status: string };
}

export const screenFixtures = JSON.parse(readFileSync(join(SCREENS_DIR, 'fixtures.json'), 'utf8')) as {
  hud: HudFixture[];
  messages: { file: string; expectedKeyword: string }[];
};

/** The game frame cut out of a full-page fixture: what an iframe screenshot looks like in production. */
export async function gameFrame(file: string): Promise<Buffer> {
  const fixture = screenFixtures.hud.find((f) => f.file === file);
  if (!fixture) throw new Error(`No HUD fixture named ${file}`);
  return sharp(join(SCREENS_DIR, file)).extract(fixture.gameBox).png().toBuffer();
}
