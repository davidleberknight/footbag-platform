import { describe, it, expect } from 'vitest';
import { CORE_TRICKS } from '../../src/services/coreTrickRegistry';
import { committedNotation } from '../fixtures/committedNotation';

// The 12 foundational moves carry their operational notation in the committed
// corrections the dictionary is built from, and the formal notation surfaces
// (browse-card JOB slot, trick-detail JOB row) render it from the database.
// Formal notation carries symbolic CAPS tokens only: no lowercase prose (no
// "[set]", "hippy/leggy in/out dex", "op/ss toe", "ss clipper"). The
// bracket-bearing flags ([DEX]/[BOD]/[XBD]/[DEL]/...) count to the move's ADD.
const EXPECTED: Record<string, { notation: string; adds: number }> = {
  'toe_stall':        { notation: 'SET > SAME TOE [DEL]',                       adds: 1 },
  'clipper_stall':    { notation: 'SET > OP CLIP [XBD] [DEL]',                  adds: 2 },
  'mirage':           { notation: 'SET > OP IN [DEX] > OP TOE [DEL]',           adds: 2 },
  'legover':          { notation: 'SET > OP OUT [DEX] > SAME TOE [DEL]',        adds: 2 },
  'pickup':           { notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',         adds: 2 },
  'illusion':         { notation: 'SET > OP OUT [DEX] > OP TOE [DEL]',          adds: 2 },
  'whirl':            { notation: 'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',    adds: 3 },
  // Butterfly publishes the far / opposite-side default form per the
  // default-catch-side ruling; the side-either fold is superseded.
  'butterfly':        { notation: 'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',   adds: 3 },
  // Clipper-terminal matrix: swirl is the same-side out cell (whirl OP IN,
  // rev whirl OP OUT, rev swirl SAME IN); BACK SWIRL is retired as a token.
  'swirl':            { notation: 'SET > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]', adds: 3 },
  'osis':             { notation: 'SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]', adds: 3 },
  // Around-the-world is the inward circle; orbit is the outward mirror on its
  // own row. Direction is structural, so the two never fold into one.
  'around_the_world': { notation: 'TOE > SAME IN [DEX] > SAME TOE [DEL]',       adds: 2 },
  'orbit':            { notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',      adds: 2 },
};

const PROSE_FORMS = [/\[set\]/, /hippy/, /leggy/, /\bss\b/, /\bop toe\b/, /\bdowntime\b/, /\(midtime\)/];

describe('the foundational moves\' committed operational notation', () => {
  it('every foundational move has an expected entry (catches added or removed moves)', () => {
    expect([...CORE_TRICKS].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [slug, expected] of Object.entries(EXPECTED)) {
    it(`${slug} carries the exact symbolic form, with brackets counting to its ADD and no prose`, () => {
      const notation = committedNotation(slug) ?? '';
      expect(notation).toBe(expected.notation);
      expect((notation.match(/\[[A-Z]+\]/g) ?? []).length).toBe(expected.adds);
      for (const prose of PROSE_FORMS) expect(notation).not.toMatch(prose);
    });
  }
});
