/**
 * Every scored notation flag has a glossary entry.
 *
 * The scored bracket flags are the seven the notation doctrine names; the
 * notation parser's own count confirms each still scores. A reader who meets
 * one in a trick's notation looks it up in the A to Z glossary, so each must be
 * an entry's term or alias there.
 */
import { describe, it, expect } from 'vitest';
import { countScoringBrackets } from '../../src/lib/freestyleNotation';
import { STAGED_GLOSSARY_TERMS } from '../../freestyle/inputs/curator_content/freestyleGlossaryTerms';

const SCORED_FLAGS = ['DEX', 'BOD', 'XBD', 'PDX', 'DEL', 'UNS', 'XDEX'];

describe('the scored notation flags', () => {
  // Defect caught: a flag this list names has stopped scoring, so the list no
  // longer describes the notation the dictionary uses.
  it('each counts as one scoring bracket', () => {
    for (const flag of SCORED_FLAGS) {
      expect(countScoringBrackets(`[${flag}]`), flag).toBe(1);
    }
  });

  // Defect caught: a reader meets a scored flag such as [UNS] in a trick's
  // notation and finds no glossary entry that says what it means.
  it('each is defined by a glossary entry, as its term or an alias', () => {
    const names = new Set(STAGED_GLOSSARY_TERMS.flatMap(t => [t.term, ...(t.aliases ?? [])]));
    for (const flag of SCORED_FLAGS) {
      expect(names.has(flag), `${flag} has no glossary entry`).toBe(true);
    }
  });
});
