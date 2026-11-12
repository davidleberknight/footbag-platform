/**
 * The rules a whole freestyle family roster must meet. The family editor and the
 * rebuild seeder both apply them, so a broken rule here lets the editor save, or
 * the seeder write, a roster whose pages and links no longer agree.
 */
import { describe, it, expect } from 'vitest';
import { familyRosterProblems, type FamilyRuleInput } from '../../src/services/freestyleFamilyRules';

function fam(slug: string, o: Partial<FamilyRuleInput> = {}): FamilyRuleInput {
  return {
    slug, parentSlug: null, tier: 'family_parent', sortOrder: 10,
    relatedFamilySlugs: [], foldedLabels: [], ...o,
  };
}

// A sound two-level roster: two root family parents, a paged branch, a root
// minor lineage, and a folded label.
const SOUND: FamilyRuleInput[] = [
  fam('osis', { relatedFamilySlugs: ['whirl'] }),
  fam('whirl', { foldedLabels: ['whirling_swirl'] }),
  fam('torque', { parentSlug: 'osis' }),
  fam('eclipse', { tier: 'minor_lineage' }),
];

function problemsOf(roster: FamilyRuleInput[]): string[] {
  return familyRosterProblems(roster).map(p => `${p.slug}.${p.field}`);
}

describe('familyRosterProblems', () => {
  // Defect caught: a sound roster refused, so neither the seeder nor the editor
  // could save the families the site already shows.
  it('accepts a sound roster, including a paged branch and a root minor lineage', () => {
    expect(problemsOf(SOUND)).toEqual([]);
  });

  // Defect caught: a branch under another branch, which the one-level display
  // code would draw under the wrong family or lose.
  it('refuses a parent that is itself a branch', () => {
    expect(problemsOf([...SOUND, fam('mobius', { parentSlug: 'torque' })])).toEqual(['mobius.parentSlug']);
  });

  // Defect caught: a branch whose "Branch of" link points at a family with no page.
  // The minor lineage it names is flagged too, since a family with a branch must
  // be a family parent.
  it('refuses a parent that is a minor lineage, on both families', () => {
    expect(problemsOf([...SOUND, fam('rev_eclipse', { parentSlug: 'eclipse' })]).sort())
      .toEqual(['eclipse.tier', 'rev_eclipse.parentSlug']);
  });

  // Defect caught: a family parent demoted while a branch still names it, leaving
  // the branch pointing at a page that is gone.
  it('refuses demoting a family parent that a branch names, on both families', () => {
    const roster = SOUND.map(f => (f.slug === 'osis' ? { ...f, tier: 'minor_lineage' } : f));
    expect(problemsOf(roster).sort()).toEqual(['osis.tier', 'torque.parentSlug']);
  });

  // Defect caught: a family made its own ancestor, or a parent slug that names
  // nothing, so the family's position cannot be drawn.
  it('refuses a self parent and an unknown parent', () => {
    expect(problemsOf([...SOUND, fam('loop', { parentSlug: 'loop' })])).toEqual(['loop.parentSlug']);
    expect(problemsOf([...SOUND, fam('stray', { parentSlug: 'nowhere' })])).toEqual(['stray.parentSlug']);
  });

  // Defect caught: a universal catch surface given its own family page.
  it('refuses a catch surface as a family parent but allows it as a minor lineage', () => {
    expect(problemsOf([...SOUND, fam('toe_stall')])).toEqual(['toe_stall.tier']);
    expect(problemsOf([...SOUND, fam('toe_stall', { tier: 'minor_lineage' })])).toEqual([]);
  });

  // Defect caught: a tier value no page knows how to treat.
  it('refuses an unknown tier', () => {
    expect(problemsOf([...SOUND, fam('dyno', { tier: 'foundational' })])).toEqual(['dyno.tier']);
  });

  // Defect caught: a related-families list linking a family to itself or to
  // nothing, which renders a pointless or broken link.
  it('refuses a related family that is the family itself or no family', () => {
    expect(problemsOf([...SOUND, fam('dyno', { relatedFamilySlugs: ['dyno'] })])).toEqual(['dyno.relatedFamilySlugs']);
    expect(problemsOf([...SOUND, fam('dyno', { relatedFamilySlugs: ['blur'] })])).toEqual(['dyno.relatedFamilySlugs']);
  });

  // Defect caught: a family's own slug folded into another family, so its tricks
  // show under two families, or one label folded into two.
  it('refuses a folded label that is a family slug or already folds elsewhere', () => {
    expect(problemsOf([...SOUND, fam('dyno', { foldedLabels: ['torque'] })])).toEqual(['dyno.foldedLabels']);
    expect(problemsOf([...SOUND, fam('dyno', { foldedLabels: ['whirling_swirl'] })])).toEqual(['dyno.foldedLabels']);
  });

  // Defect caught: a display order the browse cannot sort by.
  it('refuses a display order that is not a whole number', () => {
    expect(problemsOf([...SOUND, fam('dyno', { sortOrder: 1.5 })])).toEqual(['dyno.sortOrder']);
  });
});
