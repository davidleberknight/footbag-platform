import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mechanical notation backfill: a clean exemplar'd operator (diving / spinning /
// ducking / symposium / stepping / whirling / miraging) applied to an already-
// notated base. Each derived operational_notation must survive verbatim in
// red_corrections and have bracket-count equal to ADD. gyro-diving-clipper is
// deliberately absent: gyro(+1) on diving-clipper(3) is 4, but its stored ADD is
// 3, so its notation is held for curator review rather than forced to reconcile.
const APPROVED = [
  { slug: 'diving-eclipse', adds: 4, notation: 'SET > DIVE [BOD] > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land)' },
  { slug: 'diving-toe-stall', adds: 2, notation: 'SET > DIVE [BOD] > SAME TOE [DEL]' },
  { slug: 'spinning-ducking-drifter', adds: 5, notation: 'TOE > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'spinning-miraging-symposium-torque', adds: 7, notation: 'SET > (back) SPIN [BOD] > OP IN [DEX] > (no plant while) OP IN [DEX] [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-symposium-whirling-swirl', adds: 6, notation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'spinning-tomahawk', adds: 6, notation: 'CLIP > (back) SPIN [BOD] >> DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]' },
  { slug: 'stepping-ducking-symposium-eggbeater', adds: 6, notation: 'SET > OP IN [DEX] > DUCK [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'symposium-blur', adds: 5, notation: 'CLIP > (no plant while) OP IN [BOD] [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]' },
  { slug: 'symposium-mobius', adds: 6, notation: 'CLIP >> (back) SPIN [BOD] >> (no plant while) SAME IN [BOD] [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'symposium-tomahawk', adds: 6, notation: 'CLIP >> DUCK [BOD] >> (no plant while) SAME FRONT WHIRL [BOD] [DEX] [PDX] > OP CLIP [XBD] [DEL]' },
  { slug: 'whirling-pickup', adds: 3, notation: 'SET > OP FRONT WHIRL [DEX] > OP IN [DEX] > SAME TOE [DEL]' },
  { slug: 'whirling-rake', adds: 3, notation: 'SET > OP FRONT WHIRL [DEX] > SWING [DEX] > SAME TOE [DEL]' },
  // settled-decomposition folk names: the operator comes from the confirmed folk
  // mapping (blizzard = stepping-illusion, etc.), not the slug.
  { slug: 'blizzard', adds: 3, notation: 'SET > OP IN [DEX] > OP OUT [DEX] > OP TOE [DEL]' },
  { slug: 'bedwetter', adds: 4, notation: 'TOE > OP IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'schmoe', adds: 3, notation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'blurrage', adds: 4, notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]' },
  { slug: 'triple-around-the-world', adds: 4, notation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]' },
  // atomic chassis on eggbeater: a leading outward uptime dex over the
  // eggbeater base. atomic(+1) + eggbeater(3) = 4.
  { slug: 'atomic-eggbeater', adds: 4, notation: 'TOE > OP OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]' },
] as const;

const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|UNS|XDEX)\]/g;
const TRICKS_DIR = 'freestyle/inputs/curated/tricks';
const lines = readFileSync(
  join(process.cwd(), `${TRICKS_DIR}/red_corrections_2026_04_20.csv`),
  'utf8',
).split(/\r?\n/);
const opNotation = (slug: string): string | undefined =>
  lines.find(l => l.startsWith(`${slug},operational_notation,`))?.split(',')[3];

describe('mechanical notation backfill (clean operator on notated base)', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation in red_corrections + bracket-count equals ADD`, () => {
      expect(opNotation(a.slug), `red_corrections op_notation for ${a.slug}`).toBe(a.notation);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }

  it('gyro-diving-clipper carries its curator-ruled notation with bracket count matching the corrected ADD', () => {
    // The curator resolved the former hold: the sweep-era 3 undercounted the
    // base, so the row is 4 ADD with the gyro spin as a scored body event.
    const notation = opNotation('gyro-diving-clipper');
    expect(notation).toBe('SET > (back) SPIN [BOD] > DIVE [BOD] > SAME CLIP [XBD] [DEL]');
    expect((notation!.match(ADD_TOKEN) ?? []).length).toBe(4);
  });
});
