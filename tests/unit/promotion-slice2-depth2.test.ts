import { describe, it, expect } from 'vitest';

// Slice 2 of the observational->canonical promotion: the D1 depth-2 cohort (two
// ratified modifiers on a base; composition order entry -> body -> operators ->
// base core -> terminal, verified in VERIFICATION_BATCH_RESULTS.md). Self-contained
// verification of each promoted notation: parse-valid and bracket count == ADD.
// `reverse-swirling-paradox-torque` carries a torque->osis family override (loader-19).
const APPROVED = [
  { slug: 'clipper-ducking-symposium-whirl',  add: 5, family: 'whirl',  notation: 'CLIP > DUCK [BOD] > SAME SYMP [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'reverse-swirling-symposium-mirage', add: 4, family: 'mirage', notation: 'SET > SAME SWIRL [DEX] > SAME SYMP [DEX] > SAME IN [DEX] > SAME TOE [DEL]' },
  { slug: 'reverse-swirling-paradox-torque',   add: 6, family: 'osis',   notation: 'SET > SAME SWIRL [DEX] > SAME IN [DEX] [PDX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
  { slug: 'symposium-reverse-swirling-pickup', add: 4, family: 'pickup', notation: 'SET > SAME SWIRL [DEX] > SAME SYMP [DEX] > SAME IN [DEX] > OP TOE [DEL]' },
  { slug: 'symposium-reverse-whirling-swirl',  add: 5, family: 'swirl',  notation: 'CLIP > OP WHIRL [DEX] > SAME SYMP [DEX] > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'whirling-gyro-mirage',              add: 4, family: 'mirage', notation: 'SET > GYRO [BOD] > OP WHIRL [DEX] > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'whirling-paradox-mirage',           add: 4, family: 'mirage', notation: 'SET > OP WHIRL [DEX] > OP IN [DEX] [PDX] > OP TOE [DEL]' },
];

const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const KNOWN_FAMILIES = new Set(['whirl', 'mirage', 'osis', 'pickup', 'swirl']);

describe('promotion slice 2 - D1 depth-2 cohort', () => {
  it('promotes exactly 7 rows', () => {
    expect(APPROVED).toHaveLength(7);
  });

  for (const t of APPROVED) {
    it(`${t.slug}: bracket count == ADD (${t.add})`, () => {
      expect((t.notation.match(ADD_TOKEN) || []).length).toBe(t.add);
    });

    it(`${t.slug}: parse-valid (entry surface -> terminal [DEL])`, () => {
      expect(/^(SET|TOE|CLIP)\b/.test(t.notation)).toBe(true);
      expect(/\[DEL\]\s*$/.test(t.notation)).toBe(true);
    });

    it(`${t.slug}: terminal family resolved`, () => {
      expect(KNOWN_FAMILIES.has(t.family)).toBe(true);
    });
  }
});
