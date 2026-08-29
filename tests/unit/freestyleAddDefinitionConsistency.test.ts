/**
 * Every surface that defines ADD defines it the same way.
 *
 * ADD is the traditional additive component accounting: it counts the scoring
 * components a trick contains. It is not a ranking of how hard a trick is to
 * execute, and the Trick Dictionary has always said so. Two other surfaces, the
 * A-Z glossary entry and the Concepts core-concept card, had reduced it to
 * "freestyle's difficulty score", which contradicts the dictionary on the same
 * site and misdescribes what the number measures.
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
import { GLOSSARY_TERMS } from '../../src/content/freestyleGlossaryTerms';
import { GLOSSARY_CORE_CONCEPTS_BY_KEY } from '../../src/content/freestyleGlossaryCoreConcepts';
import { countScoringBrackets } from '../../src/lib/freestyleNotation';

const addTerm = GLOSSARY_TERMS.find(t => t.slug === 'add');
const addConcept = GLOSSARY_CORE_CONCEPTS_BY_KEY.get('add');

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

  it('the Concepts card defines ADD as component accounting', () => {
    expect(addConcept, 'no ADD core-concept card').toBeDefined();
    expect(statesComponentAccounting(addConcept!.line)).toBe(true);
  });

  it('the Concepts card does not reduce ADD to a difficulty score', () => {
    expect(/difficulty score/i.test(addConcept!.line)).toBe(false);
    expect(/difficulty score/i.test(addConcept!.relates)).toBe(false);
    expect(/difficulty score/i.test(addConcept!.reveal ?? '')).toBe(false);
  });

  it('the Concepts card says ADD is not a direct measure of execution difficulty', () => {
    const whole = `${addConcept!.line} ${addConcept!.relates}`;
    expect(/not a direct measure|not a measure of how hard/i.test(whole)).toBe(true);
  });
});

describe('the bracket claim is made over scoring brackets', () => {
  it('the Concepts card qualifies the count as scoring brackets', () => {
    const reveal = addConcept!.reveal ?? '';
    expect(/bracket/i.test(reveal), 'the bracket claim is gone entirely').toBe(true);
    // Every bracket-count claim in the sentence names scoring brackets.
    const unqualified = /(?<!scoring[- ])bracket count is the ADD/i.test(reveal);
    expect(unqualified, 'an unqualified bracket-count claim').toBe(false);
  });

  it('the Concepts card does not imply an action marker scores', () => {
    const reveal = addConcept!.reveal ?? '';
    // If [KICK] is mentioned at all it is as something that carries no weight.
    if (/\[KICK\]/i.test(reveal)) {
      expect(/no weight|does not count|non-scoring|carries no/i.test(reveal)).toBe(true);
    }
  });

  it('the notation library agrees: an action marker adds nothing to the count', () => {
    // The claim the prose makes, checked against the code that implements it,
    // so the two cannot drift apart silently.
    const withKick = 'TOE > SAME OUT [DEX] > OP KICK [KICK]';
    const withoutKick = 'TOE > SAME OUT [DEX] > OP KICK';
    expect(countScoringBrackets(withKick)).toBe(countScoringBrackets(withoutKick));
    expect(countScoringBrackets(withKick)).toBe(1);
  });
});
