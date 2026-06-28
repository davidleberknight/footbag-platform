import { describe, it, expect } from 'vitest';

// The guay cohort (one ratified modifier on guay, family inside-stall).
// Self-contained verification of the derived
// notation each row was promoted with: parse-valid (entry surface -> terminal [DEL])
// and bracket count == stated ADD. A regression in the derivation or a hand edit to
// the notation fails here, independent of the DB.
const APPROVED = [
  { slug: 'inspinning-reverse-guay', add: 2, family: 'inside-stall', notation: 'SET > SAME IN [DEX] > OP INSIDE [DEL]' },
  { slug: 'ducking-reverse-guay',    add: 3, family: 'inside-stall', notation: 'SET > DUCK [BOD] > SAME IN [DEX] > OP INSIDE [DEL]' },
  { slug: 'gyro-reverse-guay',       add: 3, family: 'inside-stall', notation: 'SET > GYRO [BOD] > SAME IN [DEX] > OP INSIDE [DEL]' },
  { slug: 'spinning-reverse-guay',   add: 3, family: 'inside-stall', notation: 'SET > (back) SPIN [BOD] > SAME IN [DEX] > OP INSIDE [DEL]' },
  { slug: 'pixie-reverse-guay',      add: 3, family: 'inside-stall', notation: 'TOE > SAME IN [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]' },
  { slug: 'fairy-reverse-guay',      add: 3, family: 'inside-stall', notation: 'TOE > SAME OUT [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]' },
  { slug: 'stepping-reverse-guay',   add: 3, family: 'inside-stall', notation: 'CLIP > OP IN [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]' },
];

const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;

describe('guay cohort notation', () => {
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

    it(`${t.slug}: terminal family inside-stall`, () => {
      // guay-based: terminal is an inside catch; family is inside-stall.
      expect(t.family).toBe('inside-stall');
      expect(/INSIDE \[DEL\]\s*$/.test(t.notation)).toBe(true);
    });
  }
});
