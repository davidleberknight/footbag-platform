/**
 * 28a_seed_curator_content.ts
 *
 * Seeds the curator content staged under freestyle/inputs/curator_content/ into
 * the database columns the app reads:
 *
 *   record curator review      → freestyle_records.curator_review_note
 *   modifier beginner notes    → freestyle_trick_modifiers.beginner_note
 *   about derivatives          → freestyle_tricks.about_derivatives
 *   about naming notes         → freestyle_tricks.about_naming_note
 *   semantic descriptions      → freestyle_tricks.description
 *   reverse-pair bases         → freestyle_tricks.reverse_pair_base
 *   public family overrides    → freestyle_tricks.family_override
 *   trick kinds                → freestyle_tricks.trick_kind
 *   terminal cohorts           → freestyle_tricks.terminal_cohort and
 *                                terminal_cohort_position
 *   resolved formulas          → freestyle_tricks.add_derivation (without its
 *                                "= N ADD" ending), formula_operator and
 *                                expanded_notation
 *   notation subtitles         → freestyle_tricks.movement_notation_subtitle and
 *                                execution_notation_subtitle
 *   the family roster          → freestyle_families, one row per family, and
 *                                freestyle_family_sublabels, one row per folded
 *                                trick family label
 *   the sets                   → freestyle_sets, one row per set
 *
 * It runs after loader 28 and before loader 29, so a curator's save applied by 29
 * still wins over the seeded value. Before go-live the curator columns are wholly
 * derived from the staged modules plus the curator saves, so each run first
 * resets them and then writes every staged entry: an entry removed from a module
 * leaves no stale value behind. The description column is the exception: the
 * dictionary load fills it, so only staged values are written and nothing is
 * reset. The two family tables and the set table are wholly curator content, so
 * they are emptied and re-inserted.
 *
 * Refuses, writing nothing, when an entry names a record, modifier or trick the
 * database does not hold, a family override names a family that is not on the
 * staged roster, the roster breaks a family rule (the same rules the family
 * editor applies), or the staged sets break a set rule (the same rules the set
 * editor applies): a silently skipped entry would drop curator content from the
 * site unnoticed.
 *
 * Deleted with the pipeline at cutover, together with the staged modules.
 *
 * Usage: npx tsx freestyle/loaders/28a_seed_curator_content.ts --db <path>
 */
import BetterSqlite3 from 'better-sqlite3';
import { RECORD_CURATOR_REVIEW } from '../inputs/curator_content/freestyleRecordCuratorReview';
import { MODIFIER_BEGINNER_NOTES } from '../inputs/curator_content/freestyleStructuralFactNotes';
import { ABOUT_DERIVATIVES, ABOUT_NAMING_NOTES } from '../inputs/curator_content/freestyleAboutDerivatives';
import {
  COMPOUND_SEMANTIC_DESCRIPTIONS,
  REVERSE_PAIR_BASES,
} from '../inputs/curator_content/freestyleSemanticOverridesData';
import { FAMILY_OVERRIDES } from '../inputs/curator_content/freestyleFamilyOverrides';
import { TRICK_KIND_OVERRIDES, type FreestyleTrickKind } from '../inputs/curator_content/freestyleTrickKindOverrides';
import { TERMINAL_DERIVED_COHORTS } from '../inputs/curator_content/freestyleTerminalCohorts';
import { RESOLVED_ADD_FORMULAS, type ResolvedFormula } from '../inputs/curator_content/freestyleResolvedFormulas';
import {
  MOVEMENT_NOTATION_SUBTITLES,
  EXECUTION_NOTATION_SUBTITLES,
} from '../inputs/curator_content/freestyleSectionSubtitles';
import {
  STAGED_FAMILIES,
  STAGED_FAMILY_SUBLABELS,
  type StagedFamily,
} from '../inputs/curator_content/freestyleFamilies';
import { familyRosterProblems } from '../../src/services/freestyleFamilyRules';
import { STAGED_SETS, type StagedSet } from '../inputs/curator_content/freestyleSets';
import { setRosterProblems } from '../../src/services/freestyleSetRules';

/** The actor the seeded family and set rows are stamped with. */
export const FAMILY_SEED_ACTOR = 'curator-content-seed';

/** The breakdown the trick page shows: the derivation without a final "= N ADD",
 *  because the total beside it is the row's adds. A note after the total stays. */
export function derivationBreakdown(derivation: string): string {
  return derivation.replace(/\s*=\s*\d+\s*ADD\s*$/, '');
}

export interface CuratorContent {
  recordReviews: ReadonlyMap<string, string>;
  beginnerNotes: ReadonlyMap<string, string>;
  aboutDerivatives: ReadonlyMap<string, string>;
  aboutNamingNotes: ReadonlyMap<string, string>;
  semanticDescriptions: ReadonlyMap<string, string>;
  reversePairBases: ReadonlyMap<string, string>;
  familyOverrides: ReadonlyMap<string, string>;
  trickKinds: ReadonlyMap<string, FreestyleTrickKind>;
  /** Terminal trick slug to the tricks that land on it, in display order. */
  terminalCohorts: ReadonlyMap<string, readonly string[]>;
  formulas: readonly ResolvedFormula[];
  movementNotationSubtitles: ReadonlyMap<string, string>;
  executionNotationSubtitles: ReadonlyMap<string, string>;
  /** The family roster, in display order. */
  families: readonly StagedFamily[];
  /** Trick family label to the family it folds into. */
  familySublabels: ReadonlyMap<string, string>;
  /** The sets, in display order. */
  sets: readonly StagedSet[];
}

export const STAGED_CURATOR_CONTENT: CuratorContent = {
  recordReviews: RECORD_CURATOR_REVIEW,
  beginnerNotes: MODIFIER_BEGINNER_NOTES,
  aboutDerivatives: new Map(Object.entries(ABOUT_DERIVATIVES)),
  aboutNamingNotes: new Map(Object.entries(ABOUT_NAMING_NOTES)),
  semanticDescriptions: COMPOUND_SEMANTIC_DESCRIPTIONS,
  reversePairBases: REVERSE_PAIR_BASES,
  familyOverrides: FAMILY_OVERRIDES,
  trickKinds: TRICK_KIND_OVERRIDES,
  terminalCohorts: TERMINAL_DERIVED_COHORTS,
  formulas: RESOLVED_ADD_FORMULAS,
  movementNotationSubtitles: MOVEMENT_NOTATION_SUBTITLES,
  executionNotationSubtitles: EXECUTION_NOTATION_SUBTITLES,
  families: STAGED_FAMILIES,
  familySublabels: STAGED_FAMILY_SUBLABELS,
  sets: STAGED_SETS,
};

/** Every trick slug the content names, as a key or as a target. */
export function trickSlugsNamedBy(content: CuratorContent): Set<string> {
  const slugs = new Set<string>([
    ...content.aboutDerivatives.keys(),
    ...content.aboutNamingNotes.keys(),
    ...content.semanticDescriptions.keys(),
    ...content.reversePairBases.keys(),
    ...content.reversePairBases.values(),
    ...content.familyOverrides.keys(),
    ...content.trickKinds.keys(),
    ...content.terminalCohorts.keys(),
    ...content.formulas.map((f) => f.slug),
    ...content.movementNotationSubtitles.keys(),
    ...content.executionNotationSubtitles.keys(),
  ]);
  for (const members of content.terminalCohorts.values()) for (const m of members) slugs.add(m);
  return slugs;
}

export interface SeedCounts {
  recordsUnderReview: number;
  beginnerNotes: number;
  aboutDerivatives: number;
  aboutNamingNotes: number;
  semanticDescriptions: number;
  reversePairBases: number;
  familyOverrides: number;
  trickKinds: number;
  terminalCohortMembers: number;
  formulas: number;
  expandedNotations: number;
  movementNotationSubtitles: number;
  executionNotationSubtitles: number;
  families: number;
  familySublabels: number;
  sets: number;
}

export class CuratorContentRefusal extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`curator content refused, nothing written:\n  ${problems.join('\n  ')}`);
    this.name = 'CuratorContentRefusal';
  }
}

export function seedCuratorContent(
  db: BetterSqlite3.Database,
  content: CuratorContent = STAGED_CURATOR_CONTENT,
): SeedCounts {
  const problems: string[] = [];

  const countRecords = db.prepare(
    `SELECT COUNT(*) AS n FROM freestyle_records WHERE trim(trick_name) = ?`,
  );
  for (const name of content.recordReviews.keys()) {
    const { n } = countRecords.get(name.trim()) as { n: number };
    if (n === 0) problems.push(`record review names "${name}", which no record carries`);
  }

  const modifierExists = db.prepare(`SELECT 1 FROM freestyle_trick_modifiers WHERE slug = ?`);
  for (const slug of content.beginnerNotes.keys()) {
    if (!modifierExists.get(slug)) problems.push(`beginner note names modifier "${slug}", which the registry does not hold`);
  }

  const trickExists = db.prepare(`SELECT 1 FROM freestyle_tricks WHERE slug = ?`);
  for (const slug of trickSlugsNamedBy(content)) {
    if (!trickExists.get(slug)) problems.push(`curator content names trick "${slug}", which the dictionary does not hold`);
  }

  const publicFamilies = new Set(content.families.map((f) => f.slug));
  for (const [slug, family] of content.familyOverrides) {
    if (!publicFamilies.has(family)) {
      problems.push(`family override for "${slug}" names "${family}", which is not on the public family list`);
    }
  }

  // The roster meets the family rules the editor applies, and no family appears
  // twice.
  const seenFamilies = new Set<string>();
  for (const f of content.families) {
    if (seenFamilies.has(f.slug)) problems.push(`family "${f.slug}" is listed more than once`);
    seenFamilies.add(f.slug);
  }
  for (const [label, family] of content.familySublabels) {
    if (!publicFamilies.has(family)) problems.push(`folded label "${label}" names "${family}", which is not a family`);
  }
  const foldedBy = new Map<string, string[]>();
  for (const [label, family] of content.familySublabels) {
    foldedBy.set(family, [...(foldedBy.get(family) ?? []), label]);
  }
  for (const p of familyRosterProblems(content.families.map((f) => ({
    slug:               f.slug,
    parentSlug:         f.parentSlug,
    tier:               f.tier,
    sortOrder:          f.sortOrder,
    relatedFamilySlugs: f.relatedFamilySlugs,
    foldedLabels:       foldedBy.get(f.slug) ?? [],
  })))) {
    problems.push(`family "${p.slug}": ${p.message}`);
  }

  // The sets meet the set rules the editor applies: one row per slug, a group the
  // encyclopedia defines, and related sets that name other sets.
  for (const p of setRosterProblems(content.sets.map((s) => ({
    slug:            s.slug,
    setGroup:        s.setGroup,
    sortOrder:       s.sortOrder,
    relatedSetSlugs: s.relatedSets.map((r) => r.slug),
  })))) {
    problems.push(`set "${p.slug}": ${p.message}`);
  }

  // A trick sits in at most one "Tricks that land here" list, because the row
  // holds one terminal and one position.
  const cohortOf = new Map<string, string>();
  for (const [terminal, members] of content.terminalCohorts) {
    for (const m of members) {
      const earlier = cohortOf.get(m);
      if (earlier) problems.push(`trick "${m}" is listed under both "${earlier}" and "${terminal}"`);
      cohortOf.set(m, terminal);
    }
  }

  // A trick has one formula: a second entry for a slug would leave which one the
  // page shows to the order of the module.
  const formulaSlugs = new Set<string>();
  for (const f of content.formulas) {
    if (formulaSlugs.has(f.slug)) problems.push(`trick "${f.slug}" has more than one formula`);
    formulaSlugs.add(f.slug);
  }

  if (problems.length > 0) throw new CuratorContentRefusal(problems);

  const setReview   = db.prepare(`UPDATE freestyle_records SET curator_review_note = ? WHERE trim(trick_name) = ?`);
  const setBeginner = db.prepare(`UPDATE freestyle_trick_modifiers SET beginner_note = ? WHERE slug = ?`);
  const setTrick = (column: string) =>
    db.prepare(`UPDATE freestyle_tricks SET ${column} = ? WHERE slug = ?`);
  const setCohort = db.prepare(
    `UPDATE freestyle_tricks SET terminal_cohort = ?, terminal_cohort_position = ? WHERE slug = ?`,
  );

  const apply = (map: ReadonlyMap<string, string>, column: string): number => {
    const stmt = setTrick(column);
    let n = 0;
    for (const [slug, value] of map) n += stmt.run(value, slug).changes;
    return n;
  };

  return db.transaction((): SeedCounts => {
    db.prepare(`UPDATE freestyle_records SET curator_review_note = NULL`).run();
    db.prepare(`UPDATE freestyle_trick_modifiers SET beginner_note = NULL`).run();
    db.prepare(`
      UPDATE freestyle_tricks
      SET about_derivatives = NULL, about_naming_note = NULL, reverse_pair_base = NULL,
          family_override = NULL, trick_kind = NULL,
          terminal_cohort = NULL, terminal_cohort_position = NULL,
          add_derivation = NULL, formula_operator = NULL, expanded_notation = NULL,
          movement_notation_subtitle = NULL, execution_notation_subtitle = NULL
    `).run();

    const setFormula = db.prepare(
      `UPDATE freestyle_tricks SET add_derivation = ?, formula_operator = ? WHERE slug = ?`,
    );
    const setExpanded = setTrick('expanded_notation');
    let formulas = 0;
    let expandedNotations = 0;
    for (const f of content.formulas) {
      formulas += setFormula.run(derivationBreakdown(f.derivation), f.operator, f.slug).changes;
      if (f.expandedNotation) expandedNotations += setExpanded.run(f.expandedNotation, f.slug).changes;
    }

    let recordsUnderReview = 0;
    for (const [name, note] of content.recordReviews) {
      recordsUnderReview += setReview.run(note, name.trim()).changes;
    }
    let beginnerNotes = 0;
    for (const [slug, note] of content.beginnerNotes) beginnerNotes += setBeginner.run(note, slug).changes;

    let terminalCohortMembers = 0;
    for (const [terminal, members] of content.terminalCohorts) {
      members.forEach((m, i) => { terminalCohortMembers += setCohort.run(terminal, i + 1, m).changes; });
    }

    // The family tables: emptied and re-inserted, roots before branches so each
    // branch's parent row exists when it is written.
    db.prepare(`DELETE FROM freestyle_family_sublabels`).run();
    db.prepare(`DELETE FROM freestyle_families`).run();
    const now = new Date().toISOString();
    const insertFamily = db.prepare(`
      INSERT INTO freestyle_families
        (slug, display_name, parent_slug, tier, sort_order, hook, description,
         plain_language_reading, importance, how_to_recognize_json,
         related_family_slugs_json, shared_structure, trick_page_note,
         created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    let families = 0;
    const rootsFirst = [...content.families].sort((a, b) =>
      Number(a.parentSlug !== null) - Number(b.parentSlug !== null));
    for (const f of rootsFirst) {
      families += insertFamily.run(
        f.slug, f.displayName, f.parentSlug, f.tier, f.sortOrder, f.hook, f.description,
        f.plainLanguageReading, f.importance, JSON.stringify(f.howToRecognize),
        JSON.stringify(f.relatedFamilySlugs), f.sharedStructure, f.trickPageNote,
        now, FAMILY_SEED_ACTOR, now, FAMILY_SEED_ACTOR,
      ).changes;
    }
    const insertSublabel = db.prepare(`
      INSERT INTO freestyle_family_sublabels
        (label, family_slug, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    let familySublabels = 0;
    for (const [label, family] of content.familySublabels) {
      familySublabels += insertSublabel.run(label, family, now, FAMILY_SEED_ACTOR, now, FAMILY_SEED_ACTOR).changes;
    }

    // The set table: emptied and re-inserted, so a set removed from the staged
    // module leaves no page behind. A set the editor created comes back from its
    // save file in loader 29.
    db.prepare(`DELETE FROM freestyle_sets`).run();
    const insertSet = db.prepare(`
      INSERT INTO freestyle_sets
        (slug, display_name, set_group, sort_order, formula, explanation, related_sets_json,
         held_from_list, created_at, created_by, updated_at, updated_by, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    let sets = 0;
    for (const s of content.sets) {
      sets += insertSet.run(
        s.slug, s.displayName, s.setGroup, s.sortOrder, s.formula, s.explanation,
        JSON.stringify(s.relatedSets.map((r) => ({ slug: r.slug, label: r.label }))),
        s.heldFromList ? 1 : 0, now, FAMILY_SEED_ACTOR, now, FAMILY_SEED_ACTOR,
      ).changes;
    }

    return {
      recordsUnderReview,
      beginnerNotes,
      aboutDerivatives:     apply(content.aboutDerivatives, 'about_derivatives'),
      aboutNamingNotes:     apply(content.aboutNamingNotes, 'about_naming_note'),
      semanticDescriptions: apply(content.semanticDescriptions, 'description'),
      reversePairBases:     apply(content.reversePairBases, 'reverse_pair_base'),
      familyOverrides:      apply(content.familyOverrides, 'family_override'),
      trickKinds:           apply(content.trickKinds, 'trick_kind'),
      terminalCohortMembers,
      formulas,
      expandedNotations,
      movementNotationSubtitles:  apply(content.movementNotationSubtitles, 'movement_notation_subtitle'),
      executionNotationSubtitles: apply(content.executionNotationSubtitles, 'execution_notation_subtitle'),
      families,
      familySublabels,
      sets,
    };
  })();
}

function main(argv: readonly string[]): number {
  const dbFlag = argv.indexOf('--db');
  const dbPath = dbFlag >= 0 ? argv[dbFlag + 1] : undefined;
  if (!dbPath) {
    console.error('usage: 28a_seed_curator_content.ts --db <path>');
    return 2;
  }
  const db = new BetterSqlite3(dbPath);
  try {
    const c = seedCuratorContent(db);
    console.log(
      `Seeded curator content: ${c.recordsUnderReview} records under review, ` +
      `${c.beginnerNotes} modifier beginner notes, ` +
      `${c.aboutDerivatives} derivatives notes, ${c.aboutNamingNotes} naming notes, ` +
      `${c.semanticDescriptions} descriptions, ${c.reversePairBases} reverse pairs, ` +
      `${c.familyOverrides} family overrides, ${c.trickKinds} trick kinds, ` +
      `${c.terminalCohortMembers} terminal cohort members, ` +
      `${c.formulas} formulas, ${c.expandedNotations} expanded notations, ` +
      `${c.movementNotationSubtitles + c.executionNotationSubtitles} notation subtitles, ` +
      `${c.families} families, ${c.familySublabels} folded family labels, ${c.sets} sets.`,
    );
    return 0;
  } catch (err) {
    if (err instanceof CuratorContentRefusal) {
      console.error(err.message);
      return 1;
    }
    throw err;
  } finally {
    db.close();
  }
}

if (process.argv[1] !== undefined && /28a_seed_curator_content\.ts$/.test(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
