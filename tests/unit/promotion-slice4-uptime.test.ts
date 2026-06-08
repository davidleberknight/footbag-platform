import { describe, it, expect } from 'vitest';

// Slice 4 of the observational->canonical promotion: the D3 `>>`-boundary cohort.
// Each base carries an internal `>>` (uptime) boundary that reverse/entry-surface
// must preserve (verified in VERIFICATION_BATCH_RESULTS.md). Self-contained:
// parse-valid, bracket count == ADD, and the `>>` survives in each notation.
// All five carry a family override (base trick != family).
const APPROVED = [
  { slug: 'reverse-magellan',          add: 3, family: 'legover',   notation: 'TOE > OP IN [DEX] >> OP OUT [DEX] > OP TOE [DEL]' },
  { slug: 'toe-flurry',                add: 4, family: 'legover',   notation: 'TOE > OP IN [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'toe-ripwalk',               add: 4, family: 'butterfly', notation: 'TOE > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'reverse-whirling-twirl',    add: 5, family: 'osis',      notation: 'CLIP >> OP FRONT SWIRL [DEX] > OP WHIRL [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
  { slug: 'backside-symposium-smear',  add: 5, family: 'mirage',    notation: 'TOE > BS [DEX] > SAME IN [DEX] >> SAME SYMP [DEX] > OP IN [DEX] > OP TOE [DEL]' },
];

const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;

describe('promotion slice 4 - D3 >>-boundary cohort', () => {
  it('promotes exactly 5 rows', () => {
    expect(APPROVED).toHaveLength(5);
  });

  for (const t of APPROVED) {
    it(`${t.slug}: bracket count == ADD (${t.add})`, () => {
      expect((t.notation.match(ADD_TOKEN) || []).length).toBe(t.add);
    });

    it(`${t.slug}: parse-valid (entry surface -> terminal [DEL])`, () => {
      expect(/^(SET|TOE|CLIP)\b/.test(t.notation)).toBe(true);
      expect(/\[DEL\]\s*$/.test(t.notation)).toBe(true);
    });

    it(`${t.slug}: preserves the uptime >> boundary`, () => {
      expect(t.notation.includes('>>')).toBe(true);
    });
  }
});
