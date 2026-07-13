import { describe, it, expect } from 'vitest';

// The rake cohort, built on the 2-bracket rake base notation.
// rake is the TERMINAL movement (swing-into-toe catch) worth 2 ADD = SWING [DEX]
// + SAME TOE [DEL]. (pendulum is the
// entry/set counterpart and is intentionally NOT touched here.) Self-contained:
// the rake base is 2 brackets, and each cohort trick ends in the rake terminal
// with bracket count == ADD. base_trick = rake, family = rake (no override).
const RAKE_BASE = { slug: 'rake', add: 2, notation: 'SET > SWING [DEX] > SAME TOE [DEL]' };

const COHORT = [
  { slug: 'reverse-whirling-rake', add: 3, notation: 'SET > OP BACK WHIRL [DEX] > SWING [DEX] > SAME TOE [DEL]' },
  { slug: 'paradox-whirling-rake', add: 4, notation: 'SET > OP FRONT WHIRL [DEX] > SWING [DEX] [PDX] > SAME TOE [DEL]' },
  { slug: 'paradox-symposium-whirling-rake', add: 5, notation: 'SET > OP FRONT WHIRL [DEX] > SAME SYMP [DEX] > SWING [DEX] [PDX] > SAME TOE [DEL]' },
];

const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const RAKE_TERMINAL = /SWING \[DEX\] (\[PDX\] )?> SAME TOE \[DEL\]$/;

describe('rake cohort notation', () => {
  it('rake base is 2 brackets (swing + toe)', () => {
    expect((RAKE_BASE.notation.match(ADD_TOKEN) || []).length).toBe(RAKE_BASE.add);
    expect(RAKE_TERMINAL.test(RAKE_BASE.notation)).toBe(true);
  });

  it('promotes exactly 3 cohort rows', () => {
    expect(COHORT).toHaveLength(3);
  });

  for (const t of COHORT) {
    it(`${t.slug}: bracket count == ADD (${t.add})`, () => {
      expect((t.notation.match(ADD_TOKEN) || []).length).toBe(t.add);
    });

    it(`${t.slug}: parse-valid + ends in the rake terminal`, () => {
      expect(/^(SET|TOE|CLIP)\b/.test(t.notation)).toBe(true);
      expect(/\[DEL\]\s*$/.test(t.notation)).toBe(true);
      expect(RAKE_TERMINAL.test(t.notation)).toBe(true);
    });
  }
});
