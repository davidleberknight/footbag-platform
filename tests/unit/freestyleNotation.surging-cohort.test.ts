import { describe, it, expect } from 'vitest';

// The surging cohort.
// surging = stepping entry (CLIP > OP IN [DEX] >>) + spinning [BOD], with the first
// base dex flipped OP->SAME (side-flip).
// Self-contained: parse-valid, bracket count == ADD, and every notation carries the
// surging signature (stepping-entry `>>` + a (back) SPIN [BOD]). No family overrides
// (base trick == family for all four).
const APPROVED = [
  { slug: 'surging-legover', add: 4, family: 'legover', notation: 'CLIP > OP IN [DEX] >> (back) SPIN [BOD] > SAME OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'surging-mirage',  add: 4, family: 'mirage',  notation: 'CLIP > OP IN [DEX] >> (back) SPIN [BOD] > SAME IN [DEX] > OP TOE [DEL]' },
  { slug: 'surging-osis',    add: 5, family: 'osis',    notation: 'CLIP > OP IN [DEX] >> (back) SPIN [BOD] > (front) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
  { slug: 'surging-whirl',   add: 5, family: 'whirl',   notation: 'CLIP > OP IN [DEX] >> (back) SPIN [BOD] > SAME IN [DEX] > OP CLIP [XBD] [DEL]' },
];

const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;

describe('surging cohort notation', () => {
  it('promotes exactly 4 rows', () => {
    expect(APPROVED).toHaveLength(4);
  });

  for (const t of APPROVED) {
    it(`${t.slug}: bracket count == ADD (${t.add})`, () => {
      expect((t.notation.match(ADD_TOKEN) || []).length).toBe(t.add);
    });

    it(`${t.slug}: parse-valid (entry surface -> terminal [DEL])`, () => {
      expect(/^(SET|TOE|CLIP)\b/.test(t.notation)).toBe(true);
      expect(/\[DEL\]\s*$/.test(t.notation)).toBe(true);
    });

    it(`${t.slug}: carries the surging signature (stepping >> + spinning [BOD])`, () => {
      expect(/^CLIP > OP IN \[DEX\] >>/.test(t.notation)).toBe(true);
      expect(/SPIN \[BOD\]/.test(t.notation)).toBe(true);
    });
  }
});
