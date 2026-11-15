/**
 * Every surface that defines ADD defines it the same way.
 *
 * ADD is the traditional additive component accounting: it counts the scoring
 * components a trick contains. It is not a ranking of how hard a trick is to
 * execute, and the Trick Dictionary says so. The A-Z glossary entry must say the
 * same: reducing it to "freestyle's difficulty score" would contradict the
 * dictionary on the same site and misdescribe what the number measures.
 *
 * The second half of the same wording is the bracket claim. Scoring brackets are
 * what the count is over: an action marker like [KICK] sits in brackets and
 * carries no weight, so "the bracket count is the ADD" is only true of scoring
 * brackets, which is how the notation library counts and how the scoring
 * doctrine states it.
 *
 * These assertions pin the distinction, not the sentences. Prose may be
 * rewritten freely as long as ADD is not reduced to a difficulty score and the
 * bracket claim stays qualified.
 */
import { describe, it, expect } from 'vitest';
import { STAGED_GLOSSARY_TERMS as GLOSSARY_TERMS } from '../../freestyle/inputs/curator_content/freestyleGlossaryTerms';
import { countScoringBrackets } from '../../src/lib/freestyleNotation';

const addTerm = GLOSSARY_TERMS.find(t => t.slug === 'add');

/** "component accounting", "counts scoring components", or an equivalent: the
 *  claim that ADD is an additive count of parts rather than a difficulty rank. */
function statesComponentAccounting(text: string): boolean {
  return /component accounting/i.test(text) || /counts scoring components/i.test(text);
}

describe('the ADD definition on every surface that carries one', () => {
  it('the glossary entry exists and defines ADD as component accounting', () => {
    expect(addTerm, 'no ADD glossary term').toBeDefined();
    expect(statesComponentAccounting(addTerm!.definition)).toBe(true);
  });

  it('the glossary entry does not reduce ADD to a difficulty score', () => {
    expect(/difficulty score/i.test(addTerm!.definition)).toBe(false);
  });
});

describe('an action marker is not a scoring bracket', () => {
  it('the notation library agrees: an action marker adds nothing to the count', () => {
    // The claim the prose makes, checked against the code that implements it,
    // so the two cannot drift apart silently.
    const withKick = 'TOE > SAME OUT [DEX] > OP KICK [KICK]';
    const withoutKick = 'TOE > SAME OUT [DEX] > OP KICK';
    expect(countScoringBrackets(withKick)).toBe(countScoringBrackets(withoutKick));
    expect(countScoringBrackets(withKick)).toBe(1);
  });
});
