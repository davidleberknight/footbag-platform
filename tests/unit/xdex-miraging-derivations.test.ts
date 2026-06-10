import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// X-Dex miraging-family derived operational notation. A qualifying far-miraging
// (or illusioning) dex on an atomic or quantum set carries an extra [XDEX] flag
// alongside its own [DEX], worth one additional ADD. Each entry must survive
// verbatim in red_corrections and have ADD equal to its bracket-flag count,
// counting [XDEX] the same as any other flag.
const APPROVED = [
  {
    slug: 'atomic-miraging-butterfly',
    adds: 6,
    notation: 'TOE > OP OUT [DEX] > OP IN [DEX] [XDEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  },
  {
    slug: 'atom-smasher',
    adds: 4,
    notation: 'TOE > OP OUT [DEX] > OP IN [DEX] [XDEX] > OP TOE [DEL]',
  },
  {
    slug: 'sumo',
    adds: 5,
    notation: 'CLIP > SAME OUT [DEX] [PDX] >> OP IN [DEX] [XDEX] > OP TOE [DEL]',
  },
] as const;

const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|UNS|XDEX)\]/g;
const TRICKS_DIR = 'legacy_data/inputs/curated/tricks';

const correctionsLines = readFileSync(
  join(process.cwd(), `${TRICKS_DIR}/red_corrections_2026_04_20.csv`),
  'utf8',
).split(/\r?\n/);

const additionsLines = readFileSync(
  join(process.cwd(), `${TRICKS_DIR}/red_additions_2026_04_20.csv`),
  'utf8',
).split(/\r?\n/);

describe('X-Dex miraging-family derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = correctionsLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: carries an [XDEX] flag on the qualifying dex`, () => {
      expect(a.notation).toContain('[XDEX]');
    });

    it(`${a.slug}: bracket-flag count (XDEX included) equals ADD`, () => {
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }

  it('atomic-miraging-butterfly: red_additions ADD is 6', () => {
    const line = additionsLines.find(l => l.startsWith('atomic-miraging-butterfly,'));
    expect(line, 'red_additions row for atomic-miraging-butterfly').toBeDefined();
    expect(line!.split(',')[1]).toBe('6');
  });
});
