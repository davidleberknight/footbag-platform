/**
 * The set rules the set editor and the rebuild seeder share: a set slug of
 * lowercase letters, digits and underscores naming one set, a group the Set
 * Encyclopedia defines, a whole-number display order, and related sets that name
 * other existing sets once each.
 */
import { describe, it, expect } from 'vitest';
import { setRosterProblems, type SetRuleInput } from '../../src/services/freestyleSetRules';

const set = (slug: string, o: Partial<SetRuleInput> = {}): SetRuleInput => ({
  slug, setGroup: 'true-core', sortOrder: 10, relatedSetSlugs: [], ...o,
});

describe('setRosterProblems', () => {
  // Defect caught: a sound roster reported as broken, which would refuse every save.
  it('finds nothing wrong with sound sets, including an empty roster', () => {
    expect(setRosterProblems([])).toEqual([]);
    expect(setRosterProblems([set('pixie', { relatedSetSlugs: ['fairy'] }), set('fairy', { relatedSetSlugs: ['pixie'] })])).toEqual([]);
  });

  it.each([
    // Defect caught: a set whose address or hashtag cannot be written.
    ['a slug with a hyphen', [set('zz-bad')], 'zz-bad', 'slug'],
    // Defect caught: two sets under one slug, one hiding the other.
    ['a slug used twice', [set('pixie'), set('pixie')], 'pixie', 'slug'],
    // Defect caught: a set listed under a group the encyclopedia never shows.
    ['an unknown group', [set('pixie', { setGroup: 'nope' })], 'pixie', 'setGroup'],
    // Defect caught: a display order the list cannot sort by.
    ['a fractional display order', [set('pixie', { sortOrder: 1.5 })], 'pixie', 'sortOrder'],
    // Defect caught: a related-set link to a page that does not exist, to itself, or drawn twice.
    ['a related set that is not a set', [set('pixie', { relatedSetSlugs: ['nope'] })], 'pixie', 'relatedSets'],
    ['the set as its own related set', [set('pixie', { relatedSetSlugs: ['pixie'] })], 'pixie', 'relatedSets'],
    ['a related set listed twice', [set('pixie', { relatedSetSlugs: ['fairy', 'fairy'] }), set('fairy')], 'pixie', 'relatedSets'],
  ] as Array<[string, SetRuleInput[], string, string]>)('reports %s on that set and field', (_label, roster, slug, field) => {
    const problems = setRosterProblems(roster);
    expect(problems.map((p) => [p.slug, p.field])).toEqual([[slug, field]]);
  });
});
