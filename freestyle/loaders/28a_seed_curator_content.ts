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
 *
 * It runs after loader 28 and before loader 29, so a curator's save applied by 29
 * still wins over the seeded value. Before go-live the curator columns are wholly
 * derived from the staged modules plus the curator saves, so each run first
 * resets them and then writes every staged entry: an entry removed from a module
 * leaves no stale value behind. The description column is the exception: the
 * dictionary load fills it for every trick, so only the staged descriptions are
 * written and nothing is reset.
 *
 * Refuses, writing nothing, when an entry names a record, modifier or trick the
 * database does not hold, or a family override names a family that is not on the
 * public family list: a silently skipped entry would drop curator content from
 * the site unnoticed.
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
import { PUBLIC_DISPLAY_FAMILIES } from '../../src/content/freestylePublicFamilies';

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

  const publicFamilies = new Set(PUBLIC_DISPLAY_FAMILIES.map((f) => f.slug));
  for (const [slug, family] of content.familyOverrides) {
    if (!publicFamilies.has(family)) {
      problems.push(`family override for "${slug}" names "${family}", which is not on the public family list`);
    }
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
          terminal_cohort = NULL, terminal_cohort_position = NULL
    `).run();

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
      `${c.terminalCohortMembers} terminal cohort members.`,
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
