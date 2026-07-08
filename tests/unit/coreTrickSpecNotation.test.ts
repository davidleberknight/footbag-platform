import { describe, it, expect } from 'vitest';
import { CORE_TRICK_SPEC } from '../../src/content/freestyleLandingContent';

// The 12 foundational atoms render their operational notation on formal
// notation surfaces (browse-card JOB slot + trick-detail JOB row), sourced from
// CORE_TRICK_SPEC.operationalNotation. Formal notation surfaces carry symbolic
// CAPS tokens only — no lowercase prose (no "[set]", "hippy/leggy in/out dex",
// "op/ss toe", "ss clipper"). Bracket-bearing flags ([DEX]/[BOD]/[XBD]/[DEL]/...)
// must count to the atom's ADD.
const EXPECTED: Record<string, { notation: string; adds: number }> = {
  'toe_stall':        { notation: 'SET > SAME TOE [DEL]',                       adds: 1 },
  'clipper_stall':    { notation: 'SET > OP CLIP [XBD] [DEL]',                  adds: 2 },
  'mirage':           { notation: 'SET > OP IN [DEX] > OP TOE [DEL]',           adds: 2 },
  'legover':          { notation: 'SET > OP OUT [DEX] > SAME TOE [DEL]',        adds: 2 },
  'pickup':           { notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',         adds: 2 },
  'illusion':         { notation: 'SET > OP OUT [DEX] > OP TOE [DEL]',          adds: 2 },
  'whirl':            { notation: 'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',    adds: 3 },
  'butterfly':        { notation: 'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',   adds: 3 },
  'swirl':            { notation: 'SET > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]', adds: 3 },
  'osis':             { notation: 'SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]', adds: 3 },
  'around_the_world': { notation: 'TOE > SAME IN [DEX] > SAME TOE [DEL]',       adds: 2 },
  'orbit':            { notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',      adds: 2 },
};

const PROSE_FORMS = [/\[set\]/, /hippy/, /leggy/, /\bss\b/, /\bop toe\b/, /\bdowntime\b/, /\(midtime\)/];

describe('CORE_TRICK_SPEC operational notation — formal-surface symbolic forms', () => {
  it('every atom has an expected entry (catches added/removed atoms)', () => {
    const slugs = CORE_TRICK_SPEC.map(s => s.slug).sort();
    expect(slugs).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const spec of CORE_TRICK_SPEC) {
    const expected = EXPECTED[spec.slug];

    it(`${spec.slug} renders the exact symbolic form`, () => {
      expect(spec.operationalNotation).toBe(expected.notation);
    });

    it(`${spec.slug} bracket-flag count equals its ADD (${expected.adds})`, () => {
      const brackets = (spec.operationalNotation ?? '').match(/\[[A-Z]+\]/g) ?? [];
      expect(brackets.length).toBe(expected.adds);
    });

    it(`${spec.slug} carries no lowercase-prose notation`, () => {
      for (const prose of PROSE_FORMS) {
        expect(spec.operationalNotation ?? '').not.toMatch(prose);
      }
    });
  }
});
