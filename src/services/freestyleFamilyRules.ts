/**
 * freestyleFamilyRules: the rules a whole freestyle family roster must meet,
 * applied by the family editor before a save and by the rebuild seeder before it
 * writes. One home, so a roster the seeder accepts is one the editor can save
 * unchanged, and the other way round.
 *
 * Families are two levels deep: a root (no parent) or a branch whose parent is a
 * root family parent. Tier and parent are otherwise independent, so a branch may
 * be a family parent (torque under osis) and a root may be a minor lineage
 * (eclipse). Pure: no database, no I/O.
 */
import { FOUNDATIONAL_TERMINAL_SURFACES } from '../content/freestyleFamilyTiers';

export const FAMILY_TIERS = ['family_parent', 'minor_lineage'] as const;
export type FamilyTierValue = (typeof FAMILY_TIERS)[number];

/** The parts of a family the roster rules read. */
export interface FamilyRuleInput {
  slug:               string;
  parentSlug:         string | null;
  tier:               string;
  sortOrder:          number;
  relatedFamilySlugs: readonly string[];
  foldedLabels:       readonly string[];
}

/** One broken rule, tied to the family and the field that breaks it. */
export interface FamilyRuleProblem {
  slug:    string;
  field:   'parentSlug' | 'tier' | 'sortOrder' | 'relatedFamilySlugs' | 'foldedLabels';
  message: string;
}

/**
 * Every rule the roster breaks, in roster order. Empty when the roster is sound.
 * displayName resolves a slug to the name a message shows.
 */
export function familyRosterProblems(
  roster: readonly FamilyRuleInput[],
  displayName: (slug: string) => string = (s) => s,
): FamilyRuleProblem[] {
  const problems: FamilyRuleProblem[] = [];
  const bySlug = new Map(roster.map(f => [f.slug, f] as const));
  const labelOwner = new Map<string, string>();

  for (const f of roster) {
    if (!(FAMILY_TIERS as readonly string[]).includes(f.tier)) {
      problems.push({ slug: f.slug, field: 'tier', message: 'Tier must be family parent or minor lineage.' });
    } else if (f.tier === 'family_parent' && FOUNDATIONAL_TERMINAL_SURFACES.has(f.slug)) {
      problems.push({
        slug: f.slug, field: 'tier',
        message: `${displayName(f.slug)} is a catch surface, so it cannot be a family parent.`,
      });
    }

    if (!Number.isInteger(f.sortOrder)) {
      problems.push({ slug: f.slug, field: 'sortOrder', message: 'Display order must be a whole number.' });
    }

    if (f.parentSlug !== null) {
      const parent = bySlug.get(f.parentSlug);
      if (f.parentSlug === f.slug) {
        problems.push({ slug: f.slug, field: 'parentSlug', message: 'A family cannot be its own parent.' });
      } else if (!parent) {
        problems.push({ slug: f.slug, field: 'parentSlug', message: `"${f.parentSlug}" is not a family.` });
      } else if (parent.parentSlug !== null) {
        problems.push({
          slug: f.slug, field: 'parentSlug',
          message: `${displayName(parent.slug)} is itself a branch, so it cannot be a parent.`,
        });
      } else if (parent.tier !== 'family_parent') {
        problems.push({
          slug: f.slug, field: 'parentSlug',
          message: `${displayName(parent.slug)} is not a family parent, so it cannot be a parent.`,
        });
      }
    }

    for (const r of f.relatedFamilySlugs) {
      if (r === f.slug) {
        problems.push({ slug: f.slug, field: 'relatedFamilySlugs', message: 'A family cannot be related to itself.' });
      } else if (!bySlug.has(r)) {
        problems.push({ slug: f.slug, field: 'relatedFamilySlugs', message: `"${r}" is not a family.` });
      }
    }

    for (const label of f.foldedLabels) {
      if (bySlug.has(label)) {
        problems.push({
          slug: f.slug, field: 'foldedLabels',
          message: `"${label}" is a family of its own, so it cannot fold into another.`,
        });
        continue;
      }
      const owner = labelOwner.get(label);
      if (owner !== undefined && owner !== f.slug) {
        problems.push({
          slug: f.slug, field: 'foldedLabels',
          message: `"${label}" already folds into ${displayName(owner)}.`,
        });
      } else {
        labelOwner.set(label, f.slug);
      }
    }
  }

  // A family parent named as parent by any branch must stay a family parent; the
  // parent check above reports it on the branch, and this reports it on the
  // family whose tier was changed, which is where an editor's save is refused.
  for (const f of roster) {
    if (f.tier === 'minor_lineage') {
      const branches = roster.filter(b => b.parentSlug === f.slug).map(b => displayName(b.slug));
      if (branches.length > 0) {
        problems.push({
          slug: f.slug, field: 'tier',
          message: `${branches.join(', ')} ${branches.length === 1 ? 'is a branch' : 'are branches'} of this family, so it must stay a family parent.`,
        });
      }
    }
  }
  return problems;
}
