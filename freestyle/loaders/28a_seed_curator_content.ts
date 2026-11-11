/**
 * 28a_seed_curator_content.ts
 *
 * Seeds the curator content staged under freestyle/inputs/curator_content/ into
 * the database columns the app reads:
 *
 *   record curator review      → freestyle_records.curator_review_note
 *   modifier beginner notes    → freestyle_trick_modifiers.beginner_note
 *   modifier composition gloss → freestyle_trick_modifiers.composition_gloss
 *
 * It runs after loader 28 and before loader 29, so a curator's save applied by 29
 * still wins over the seeded value. Before go-live these columns are wholly
 * derived from the staged modules plus the curator saves, so each run first
 * resets them and then writes every staged entry: an entry removed from a module
 * leaves no stale value behind.
 *
 * Refuses, writing nothing, when an entry names a record or modifier the database
 * does not hold: a silently skipped entry would drop curator content from the
 * site unnoticed.
 *
 * Deleted with the pipeline at cutover, together with the staged modules.
 *
 * Usage: npx tsx freestyle/loaders/28a_seed_curator_content.ts --db <path>
 */
import BetterSqlite3 from 'better-sqlite3';
import { RECORD_CURATOR_REVIEW } from '../inputs/curator_content/freestyleRecordCuratorReview';
import { MODIFIER_BEGINNER_NOTES } from '../inputs/curator_content/freestyleStructuralFactNotes';
import { MODIFIER_COMPOSITION_GLOSSES } from '../inputs/curator_content/freestyleMovementSystems';

export interface CuratorContent {
  recordReviews: ReadonlyMap<string, string>;
  beginnerNotes: ReadonlyMap<string, string>;
  compositionGlosses: ReadonlyMap<string, string>;
}

export const STAGED_CURATOR_CONTENT: CuratorContent = {
  recordReviews: RECORD_CURATOR_REVIEW,
  beginnerNotes: MODIFIER_BEGINNER_NOTES,
  compositionGlosses: MODIFIER_COMPOSITION_GLOSSES,
};

export interface SeedCounts {
  recordsUnderReview: number;
  beginnerNotes: number;
  compositionGlosses: number;
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
  for (const [label, map] of [['beginner note', content.beginnerNotes], ['composition gloss', content.compositionGlosses]] as const) {
    for (const slug of map.keys()) {
      if (!modifierExists.get(slug)) problems.push(`${label} names modifier "${slug}", which the registry does not hold`);
    }
  }

  if (problems.length > 0) throw new CuratorContentRefusal(problems);

  const setReview   = db.prepare(`UPDATE freestyle_records SET curator_review_note = ? WHERE trim(trick_name) = ?`);
  const setBeginner = db.prepare(`UPDATE freestyle_trick_modifiers SET beginner_note = ? WHERE slug = ?`);
  const setGloss    = db.prepare(`UPDATE freestyle_trick_modifiers SET composition_gloss = ? WHERE slug = ?`);

  return db.transaction((): SeedCounts => {
    db.prepare(`UPDATE freestyle_records SET curator_review_note = NULL`).run();
    db.prepare(`UPDATE freestyle_trick_modifiers SET beginner_note = NULL, composition_gloss = NULL`).run();

    let recordsUnderReview = 0;
    for (const [name, note] of content.recordReviews) {
      recordsUnderReview += setReview.run(note, name.trim()).changes;
    }
    let beginnerNotes = 0;
    for (const [slug, note] of content.beginnerNotes) beginnerNotes += setBeginner.run(note, slug).changes;
    let compositionGlosses = 0;
    for (const [slug, gloss] of content.compositionGlosses) compositionGlosses += setGloss.run(gloss, slug).changes;

    return { recordsUnderReview, beginnerNotes, compositionGlosses };
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
      `${c.beginnerNotes} modifier beginner notes, ${c.compositionGlosses} modifier composition glosses.`,
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
