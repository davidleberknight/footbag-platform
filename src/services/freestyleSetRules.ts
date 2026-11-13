/**
 * freestyleSetRules: the rules every freestyle set must meet, applied by the set
 * editor before a save and by the rebuild seeder before it writes. One home, so a
 * roster the seeder accepts is one the editor can save unchanged, and the other
 * way round.
 *
 * A set's slug is lowercase letters, digits and underscores and names one set
 * only; it may equal a trick or modifier slug, because a name that is both has
 * both pages. Its group is one the Set Encyclopedia defines, and every related
 * set names another existing set, once. Pure: no database, no I/O.
 */
import { SET_SUBTYPE_SPECS } from '../content/freestyleCanonicalSets';

export const SET_SLUG_PATTERN = /^[a-z0-9_]+$/;

/** The parts of a set the rules read. */
export interface SetRuleInput {
  slug:            string;
  setGroup:        string;
  sortOrder:       number;
  relatedSetSlugs: readonly string[];
}

/** One broken rule, tied to the set and the field that breaks it. */
export interface SetRuleProblem {
  slug:    string;
  field:   'slug' | 'setGroup' | 'sortOrder' | 'relatedSets';
  message: string;
}

/** Whether a set group is one the encyclopedia defines. */
export function isSetGroup(key: string): boolean {
  return SET_SUBTYPE_SPECS.some((s) => s.key === key);
}

/**
 * Every rule the roster breaks, in roster order. Empty when the roster is sound.
 * displayName resolves a slug to the name a message shows.
 */
export function setRosterProblems(
  roster: readonly SetRuleInput[],
  displayName: (slug: string) => string = (s) => s,
): SetRuleProblem[] {
  const problems: SetRuleProblem[] = [];
  const seen = new Set<string>();
  const slugs = new Set(roster.map((s) => s.slug));

  for (const s of roster) {
    if (!SET_SLUG_PATTERN.test(s.slug)) {
      problems.push({ slug: s.slug, field: 'slug', message: 'A set slug uses only lowercase letters, digits and underscores.' });
    }
    if (seen.has(s.slug)) {
      problems.push({ slug: s.slug, field: 'slug', message: `"${s.slug}" is already a set.` });
    }
    seen.add(s.slug);

    if (!isSetGroup(s.setGroup)) {
      problems.push({ slug: s.slug, field: 'setGroup', message: 'Choose a set group the encyclopedia defines.' });
    }
    if (!Number.isInteger(s.sortOrder)) {
      problems.push({ slug: s.slug, field: 'sortOrder', message: 'Display order must be a whole number.' });
    }

    const related = new Set<string>();
    for (const r of s.relatedSetSlugs) {
      if (r === s.slug) {
        problems.push({ slug: s.slug, field: 'relatedSets', message: 'A set cannot be related to itself.' });
      } else if (!slugs.has(r)) {
        problems.push({ slug: s.slug, field: 'relatedSets', message: `"${r}" is not a set.` });
      } else if (related.has(r)) {
        problems.push({ slug: s.slug, field: 'relatedSets', message: `${displayName(r)} is listed twice as a related set.` });
      }
      related.add(r);
    }
  }
  return problems;
}
