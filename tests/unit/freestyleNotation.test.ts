/**
 * Scoring-bracket parity helper for freestyle operational notation.
 *
 * Counts the scoring bracket flags (BOD, DEX, XBD, DEL, UNS, PDX, XDEX) in an
 * execution-notation string and checks that the count equals a numeric ADD.
 * KICK is a non-scoring marker; non-flag brackets such as [set] are ignored.
 * A row is not checkable (returns null) when the ADD is non-numeric or the
 * notation carries no scoring brackets.
 */
import { describe, it, expect } from 'vitest';
import { countScoringBrackets, checkAddMatchesScoringBrackets } from '../../src/lib/freestyleNotation';

describe('countScoringBrackets', () => {
  it('counts each scoring flag once', () => {
    expect(countScoringBrackets('CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]')).toBe(4);
  });

  it('counts every scoring flag in the vocabulary', () => {
    expect(countScoringBrackets('[BOD] [DEX] [XBD] [DEL] [UNS] [PDX] [XDEX]')).toBe(7);
  });

  it('excludes the non-scoring KICK marker', () => {
    expect(countScoringBrackets('CLIP > OP IN [DEX] [KICK]')).toBe(1);
  });

  it('ignores non-flag brackets like [set]', () => {
    expect(countScoringBrackets('[set] > toe')).toBe(0);
  });

  it('is case-insensitive (op_notation sometimes lowercases flags)', () => {
    expect(countScoringBrackets('OP CLIP [xbd] [del]')).toBe(2);
  });

  it('returns 0 for a blank string', () => {
    expect(countScoringBrackets('')).toBe(0);
  });

  it('does not carry regex state across calls', () => {
    const s = '[DEX] [DEL]';
    expect(countScoringBrackets(s)).toBe(2);
    expect(countScoringBrackets(s)).toBe(2); // a global-flagged regex reused via .test would drift
  });
});

describe('checkAddMatchesScoringBrackets', () => {
  it('reports ok when the count equals a numeric ADD', () => {
    expect(checkAddMatchesScoringBrackets('4', 'CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]'))
      .toEqual({ add: 4, bracketCount: 4, ok: true });
  });

  it('reports not-ok when the count differs from a numeric ADD', () => {
    expect(checkAddMatchesScoringBrackets('5', 'OP IN [DEX] [DEL]'))
      .toEqual({ add: 5, bracketCount: 2, ok: false });
  });

  it('is not checkable when the notation has no scoring brackets (blank)', () => {
    expect(checkAddMatchesScoringBrackets('3', '')).toBeNull();
  });

  it('is not checkable when the notation has zero scoring brackets (primitive markers)', () => {
    expect(checkAddMatchesScoringBrackets('2', '[set] > clipper')).toBeNull();
  });

  it('is not checkable when ADD is null', () => {
    expect(checkAddMatchesScoringBrackets(null, '[DEX] [DEL]')).toBeNull();
  });

  it('is not checkable when ADD is the literal "modifier"', () => {
    expect(checkAddMatchesScoringBrackets('modifier', '[DEX] [DEL]')).toBeNull();
  });

  it('is not checkable when ADD is not a whole number', () => {
    expect(checkAddMatchesScoringBrackets('lots', '[DEX] [DEL]')).toBeNull();
  });
});

// The swing element is a structural movement word, not a scoring bracket. It is
// never written as a bracketed flag; the score sits on the adjacent [DEX], and
// the pendulum primitive carries its swing ADD on an open (contact) surface with
// no scoring bracket at all. These cases pin that a bracketed [swing] does not
// count and a bare SWING is ignored, so the real swing-family rows stay in parity.
describe('scoring-bracket parity: the swing movement element', () => {
  it('does not count a bracketed [swing] or [SWING] as a scoring flag', () => {
    expect(countScoringBrackets('SET > [swing] [DEX] > SAME TOE [DEL]')).toBe(2);
    expect(countScoringBrackets('[SWING] [XBD]')).toBe(1);
  });

  it('ignores a bare SWING word so the adjacent [DEX] carries the score', () => {
    // rake: SWING [DEX] + [DEL] = 2 scoring brackets == ADD 2.
    expect(checkAddMatchesScoringBrackets('2', 'SET > SWING [DEX] > SAME TOE [DEL]'))
      .toEqual({ add: 2, bracketCount: 2, ok: true });
  });

  it('keeps every real swing-family row in parity, and skips the pendulum primitive', () => {
    const swingRows: Array<[string, number]> = [
      ['SET > OP FRONT WHIRL [DEX] > SWING [DEX] > SAME TOE [DEL]', 3],
      ['SET > OP BACK WHIRL [DEX] > SWING [DEX] > SAME TOE [DEL]', 3],
      ['SET > OP FRONT WHIRL [DEX] > SWING [DEX] [PDX] > SAME TOE [DEL]', 4],
      ['SET > OP FRONT WHIRL [DEX] > SAME SYMP [DEX] > SWING [DEX] [PDX] > SAME TOE [DEL]', 5],
      ['CLIP > OP IN [DEX] >> (back) SPIN [BOD] >> DUCK [BOD] >> OP FRONT WHIRL [DEX] > SAME SYMP [DEX] > SWING [DEX] [PDX] > SAME TOE [DEL]', 8],
    ];
    for (const [notation, add] of swingRows) {
      expect(checkAddMatchesScoringBrackets(String(add), notation)).toEqual({ add, bracketCount: add, ok: true });
    }
    // pendulum: `TOE SWING (SET) > (contact)` — zero scoring brackets, so the
    // parity check does not run (the swing/contact ADD lives off the bracket grammar).
    expect(checkAddMatchesScoringBrackets('2', 'TOE SWING (SET) > (contact)')).toBeNull();
  });
});
