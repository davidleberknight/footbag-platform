/**
 * BSOS and BSOR are one concept on this platform, and the glossary says why.
 *
 * The two abbreviations expand differently, to "both sides one string" and
 * "both sides one run". That looks like it could be two achievements of
 * different scope, and the outside compilation the equivalence came from flags
 * its own confidence in it as low.
 *
 * It is one concept here because of what this site's own vocabulary says: a run
 * is a continuous flow of linked tricks, "players also call it a string", the
 * run entry carries string as an alias, and the separate string entry is a
 * pointer to run. Under those definitions the two expansions name the same
 * continuous sequence, so the two abbreviations describe the same achievement.
 *
 * That reasoning is the thing worth pinning. If the definition of a run ever
 * changed so that a string were a segment within one, the equivalence would stop
 * following and this entry would need reopening rather than quietly standing.
 */
import { describe, it, expect } from 'vitest';
import { GLOSSARY_TERMS, GLOSSARY_CROSS_REFERENCES } from '../../src/content/freestyleGlossaryTerms';

const bsos = GLOSSARY_TERMS.find(t => t.slug === 'bsos');
const run = GLOSSARY_TERMS.find(t => t.slug === 'run');

describe('BSOS and BSOR', () => {
  it('are one entry, not two concepts', () => {
    expect(bsos, 'the BSOS entry').toBeDefined();
    // No second entry of its own: a BSOR concept beside this one would be the
    // site asserting a distinction it does not hold.
    const rivals = GLOSSARY_TERMS.filter(t => t.term.toUpperCase() === 'BSOR');
    expect(rivals).toEqual([]);
  });

  it('keeps BSOR as an alias of that one entry', () => {
    expect(bsos!.aliases ?? []).toContain('BSOR');
  });

  it('explains the equivalence rather than asserting it', () => {
    // The previous wording said only that the other abbreviation "means the same
    // thing", which a reader had to take on trust.
    expect(bsos!.definition).toMatch(/string and run name the same continuous sequence/i);
    expect(bsos!.definition).not.toMatch(/means the same thing/i);
  });
});

describe('the reason the equivalence holds', () => {
  it('is that this site treats a string and a run as one unit', () => {
    // The load-bearing neighbour. Were this to change, the BSOS entry's stated
    // reason would no longer be true and the equivalence would need re-ruling.
    expect(run, 'the run entry').toBeDefined();
    expect(run!.aliases ?? []).toContain('string');
  });

  it('and that the string entry points at run rather than defining a smaller unit', () => {
    const stringEntry = GLOSSARY_CROSS_REFERENCES.find(s => s.slug === 'string');
    expect(stringEntry, 'the string see-also entry').toBeDefined();
    expect(stringEntry!.seeSlug).toBe('run');
    // And it is a pointer, not a term with a definition of its own.
    expect(GLOSSARY_TERMS.some(t => t.slug === 'string')).toBe(false);
  });
});
