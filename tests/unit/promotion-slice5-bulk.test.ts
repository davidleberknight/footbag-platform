import { describe, it, expect } from 'vitest';

// Slice 5 of the observational->canonical promotion: the remaining verified
// PROMOTE_NOW bulk (28 depth-<=1 single-modifier compounds; notations in
// DERIVED_NOTATION_PROMOTE_NOW.md). Self-contained: parse-valid + bracket count
// == ADD. Family overrides: blender/torque->osis, drifter->clipper-stall.
const APPROVED = [
  { slug: 'rev-swirl', add: 3, family: 'swirl', notation: 'CLIP > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'diving-reverse-swirl', add: 4, family: 'swirl', notation: 'CLIP > DIVE [BOD] > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'fairy-reverse-swirl', add: 4, family: 'swirl', notation: 'TOE > SAME OUT [DEX] >> OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'pixie-reverse-swirl', add: 4, family: 'swirl', notation: 'TOE > SAME IN [DEX] >> OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-reverse-swirl', add: 4, family: 'swirl', notation: 'CLIP > (back) SPIN [BOD] > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'stepping-reverse-swirl', add: 4, family: 'swirl', notation: 'CLIP > OP IN [DEX] >> OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'swirling-reverse-swirl', add: 4, family: 'swirl', notation: 'CLIP > OP BACK SWIRL [DEX] > SAME SWIRL [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'toe-symposium-swirl', add: 4, family: 'swirl', notation: 'TOE > SAME SYMP [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'toe-whirling-swirl', add: 4, family: 'swirl', notation: 'TOE > OP WHIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'clipper-diving-whirl', add: 4, family: 'whirl', notation: 'CLIP > DIVE [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'clipper-ducking-whirl', add: 4, family: 'whirl', notation: 'CLIP > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'clipper-symposium-whirl', add: 4, family: 'whirl', notation: 'CLIP > SAME SYMP [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'fairy-reverse-whirl', add: 4, family: 'whirl', notation: 'TOE > SAME OUT [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'pixie-reverse-whirl', add: 4, family: 'whirl', notation: 'TOE > SAME IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'spinning-reverse-whirl', add: 4, family: 'whirl', notation: 'SET > (back) SPIN [BOD] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'stepping-reverse-whirl', add: 4, family: 'whirl', notation: 'CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'whirling-reverse-whirl', add: 4, family: 'whirl', notation: 'SET > SAME IN [DEX] > OP WHIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'reverse-blender', add: 4, family: 'osis', notation: 'SET > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'clipper-ducking-blender', add: 5, family: 'osis', notation: 'CLIP > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
  { slug: 'reverse-swirling-blender', add: 5, family: 'osis', notation: 'SET > SAME SWIRL [DEX] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'reverse-torque', add: 4, family: 'osis', notation: 'SET > SAME IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
  { slug: 'toe-spinning-torque', add: 5, family: 'osis', notation: 'TOE > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'reverse-swirling-osis', add: 4, family: 'osis', notation: 'SET > OP SWIRL [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'clipper-ducking-drifter', add: 4, family: 'clipper-stall', notation: 'CLIP > DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'toe-gyro-mirage', add: 3, family: 'mirage', notation: 'TOE > GYRO [BOD] > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'toe-ducking-legover', add: 3, family: 'legover', notation: 'TOE > DUCK [BOD] > OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'reverse-swirling-pickup', add: 3, family: 'pickup', notation: 'SET > SAME SWIRL [DEX] > SAME IN [DEX] > OP TOE [DEL]' },
  { slug: 'butterfly-gyro-toe', add: 4, family: 'butterfly', notation: 'TOE > GYRO [BOD] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
];

const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;

describe('promotion slice 5 - remaining PROMOTE_NOW bulk', () => {
  it('promotes exactly 28 rows', () => {
    expect(APPROVED).toHaveLength(28);
  });

  for (const t of APPROVED) {
    it(`${t.slug}: bracket count == ADD (${t.add})`, () => {
      expect((t.notation.match(ADD_TOKEN) || []).length).toBe(t.add);
    });

    it(`${t.slug}: parse-valid (entry surface -> terminal [DEL])`, () => {
      expect(/^(SET|TOE|CLIP)\b/.test(t.notation)).toBe(true);
      expect(/\[DEL\]\s*$/.test(t.notation)).toBe(true);
    });
  }
});
