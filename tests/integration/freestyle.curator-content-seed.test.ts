/**
 * The staged curator content seeds the columns the app reads.
 *
 * Before go-live the record review notes, the modifier notes and the per-trick
 * curator facts live as staged modules under the freestyle inputs, and a
 * rebuild seeds them into the database. Every staged entry must land, a stale
 * value from a previous run must not survive, a description the content does not
 * name must be left as the dictionary load wrote it, and an entry naming
 * something the database does not hold must stop the rebuild with nothing
 * written, never be skipped.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertFreestyleRecord, insertFreestyleTrick, insertFreestyleTrickModifier } from '../fixtures/factories';
import {
  seedCuratorContent,
  STAGED_CURATOR_CONTENT,
  CuratorContentRefusal,
  trickSlugsNamedBy,
  type CuratorContent,
} from '../../freestyle/loaders/28a_seed_curator_content';

const { dbPath } = setTestEnv('4148');
const content = STAGED_CURATOR_CONTENT;
const modifierSlugs = [...content.beginnerNotes.keys()];
const trickSlugs = [...trickSlugsNamedBy(content)];
const EXTRA_MODIFIER = 'zz_unstaged_modifier';
const EXTRA_RECORD = 'Zz Unstaged Record';
const EXTRA_TRICK = 'zz_unstaged_trick';
const EXTRA_DESCRIPTION = 'The description the dictionary load wrote.';

/** Every per-trick column the seeder resets, with the staged map that fills it. */
const TRICK_COLUMNS: Array<[column: string, map: ReadonlyMap<string, string>]> = [
  ['about_derivatives', content.aboutDerivatives],
  ['about_naming_note', content.aboutNamingNotes],
  ['reverse_pair_base', content.reversePairBases],
  ['family_override',   content.familyOverrides],
  ['trick_kind',        content.trickKinds],
];

let db: BetterSqlite3.Database;

/** A database holding every record, modifier and trick the staged content
 *  names, plus one of each it does not. */
function build(): BetterSqlite3.Database {
  cleanupTestDb(dbPath);
  const conn = createTestDb(dbPath);
  for (const name of [...content.recordReviews.keys(), EXTRA_RECORD]) insertFreestyleRecord(conn, { trick_name: name });
  for (const slug of [...modifierSlugs, EXTRA_MODIFIER]) insertFreestyleTrickModifier(conn, { slug });
  for (const slug of trickSlugs) insertFreestyleTrick(conn, { slug });
  insertFreestyleTrick(conn, { slug: EXTRA_TRICK, description: EXTRA_DESCRIPTION });
  return conn;
}

function value(sql: string, ...params: unknown[]): unknown {
  return (db.prepare(sql).get(...params) as { v: unknown } | undefined)?.v;
}

beforeEach(() => {
  db?.close();
  db = build();
});

afterAll(() => {
  db?.close();
  cleanupTestDb(dbPath);
});

describe('seeding the staged curator content', () => {
  // Defect caught: a staged note silently not reaching its column, so the page
  // loses curator content once the app reads the database.
  it('writes every staged entry into its column', () => {
    const counts = seedCuratorContent(db);
    for (const [name, note] of content.recordReviews) {
      expect(value('SELECT curator_review_note AS v FROM freestyle_records WHERE trick_name = ?', name), name).toBe(note);
    }
    for (const [slug, note] of content.beginnerNotes) {
      expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', slug), slug).toBe(note);
    }
    for (const [column, map] of [...TRICK_COLUMNS, ['description', content.semanticDescriptions] as const]) {
      for (const [slug, v] of map) {
        expect(value(`SELECT ${column} AS v FROM freestyle_tricks WHERE slug = ?`, slug), `${column} ${slug}`).toBe(v);
      }
    }
    let cohortMembers = 0;
    for (const [terminal, members] of content.terminalCohorts) {
      members.forEach((m, i) => {
        cohortMembers += 1;
        expect(db.prepare('SELECT terminal_cohort AS t, terminal_cohort_position AS p FROM freestyle_tricks WHERE slug = ?').get(m), m)
          .toEqual({ t: terminal, p: i + 1 });
      });
    }
    // The counts are what the rows say, not a tally of the attempts.
    expect(counts).toEqual({
      recordsUnderReview:    content.recordReviews.size,
      beginnerNotes:         content.beginnerNotes.size,
      aboutDerivatives:      content.aboutDerivatives.size,
      aboutNamingNotes:      content.aboutNamingNotes.size,
      semanticDescriptions:  content.semanticDescriptions.size,
      reversePairBases:      content.reversePairBases.size,
      familyOverrides:       content.familyOverrides.size,
      trickKinds:            content.trickKinds.size,
      terminalCohortMembers: cohortMembers,
    });
    // Rows the content does not name stay empty, and a description it does not
    // name keeps what the dictionary load wrote.
    expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBeNull();
    expect(value('SELECT curator_review_note AS v FROM freestyle_records WHERE trick_name = ?', EXTRA_RECORD)).toBeNull();
    expect(db.prepare(`
      SELECT description, about_derivatives, about_naming_note, reverse_pair_base, family_override,
             trick_kind, terminal_cohort, terminal_cohort_position
      FROM freestyle_tricks WHERE slug = ?`).get(EXTRA_TRICK)).toEqual({
      description: EXTRA_DESCRIPTION, about_derivatives: null, about_naming_note: null,
      reverse_pair_base: null, family_override: null, trick_kind: null,
      terminal_cohort: null, terminal_cohort_position: null,
    });
  });

  // Defect caught: an entry removed from a staged module living on in the
  // database after the next refresh.
  it('clears a value no staged entry supplies any more', () => {
    db.prepare('UPDATE freestyle_trick_modifiers SET beginner_note = ? WHERE slug = ?')
      .run('stale', EXTRA_MODIFIER);
    db.prepare('UPDATE freestyle_records SET curator_review_note = ? WHERE trick_name = ?').run('stale', EXTRA_RECORD);
    db.prepare(`
      UPDATE freestyle_tricks
      SET about_derivatives = 'stale', about_naming_note = 'stale', reverse_pair_base = 'stale',
          family_override = 'stale', trick_kind = 'modifier',
          terminal_cohort = 'stale', terminal_cohort_position = 1
      WHERE slug = ?`).run(EXTRA_TRICK);
    seedCuratorContent(db);
    expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBeNull();
    expect(value('SELECT curator_review_note AS v FROM freestyle_records WHERE trick_name = ?', EXTRA_RECORD)).toBeNull();
    expect(db.prepare(`
      SELECT about_derivatives, about_naming_note, reverse_pair_base, family_override,
             trick_kind, terminal_cohort, terminal_cohort_position
      FROM freestyle_tricks WHERE slug = ?`).get(EXTRA_TRICK)).toEqual({
      about_derivatives: null, about_naming_note: null, reverse_pair_base: null,
      family_override: null, trick_kind: null, terminal_cohort: null, terminal_cohort_position: null,
    });
  });
});

describe('refusing content the database cannot take', () => {
  function withExtra(change: Partial<CuratorContent>): CuratorContent {
    return { ...content, ...change };
  }

  // Each case: an entry silently skipped would drop curator content from the site
  // with nothing to say so; a partial write would leave half the content seeded.
  it.each([
    ['a beginner note for a modifier the registry does not hold', withExtra({
      beginnerNotes: new Map([...content.beginnerNotes, ['no_such_modifier', 'A note.']]),
    }), /no_such_modifier/],
    ['a record name no record carries', withExtra({
      recordReviews: new Map([...content.recordReviews, ['No Such Record', 'A note.']]),
    }), /No Such Record/],
    ['a trick-keyed entry for a trick the dictionary does not hold', withExtra({
      aboutDerivatives: new Map([...content.aboutDerivatives, ['no_such_trick', 'A note.']]),
    }), /no_such_trick/],
    ['a reverse pair whose base the dictionary does not hold', withExtra({
      reversePairBases: new Map([...content.reversePairBases, [EXTRA_TRICK, 'no_such_base']]),
    }), /no_such_base/],
    ['a family override naming a family not on the public list', withExtra({
      familyOverrides: new Map([...content.familyOverrides, [EXTRA_TRICK, 'no_such_family']]),
    }), /no_such_family/],
    ['a terminal list naming a trick the dictionary does not hold', withExtra({
      terminalCohorts: new Map([...content.terminalCohorts, [EXTRA_TRICK, ['no_such_member']]]),
    }), /no_such_member/],
    ['a trick listed under two terminals', withExtra({
      terminalCohorts: new Map([...content.terminalCohorts, [EXTRA_TRICK, [[...content.terminalCohorts.values()][0]![0]!]]]),
    }), /listed under both/],
  ])('%s', (_label, bad, message) => {
    db.prepare('UPDATE freestyle_trick_modifiers SET beginner_note = ? WHERE slug = ?').run('kept', EXTRA_MODIFIER);
    db.prepare('UPDATE freestyle_tricks SET family_override = ? WHERE slug = ?').run('kept', EXTRA_TRICK);
    let refusal: unknown;
    try {
      seedCuratorContent(db, bad);
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toBeInstanceOf(CuratorContentRefusal);
    expect((refusal as CuratorContentRefusal).message).toMatch(message);
    // Nothing written: neither the reset nor any staged value landed.
    expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBe('kept');
    expect(value('SELECT COUNT(*) AS v FROM freestyle_trick_modifiers WHERE beginner_note IS NOT NULL')).toBe(1);
    expect(value('SELECT family_override AS v FROM freestyle_tricks WHERE slug = ?', EXTRA_TRICK)).toBe('kept');
    expect(value('SELECT COUNT(*) AS v FROM freestyle_tricks WHERE family_override IS NOT NULL')).toBe(1);
  });
});

describe('the rebuild stage', () => {
  function runStage() {
    return spawnSync('npx', ['tsx', 'freestyle/loaders/28a_seed_curator_content.ts', '--db', dbPath], {
      encoding: 'utf8', ...SPAWN_GUARD,
    });
  }

  // Defect caught: the rebuild calls the seeder in a way that never runs it, or
  // reports success on a refusal.
  it('seeds the database it is given and reports the counts', () => {
    db.close();
    const r = runStage();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`${content.beginnerNotes.size} modifier beginner notes`);
    expect(r.stdout).toContain(`${content.familyOverrides.size} family overrides`);
    db = new BetterSqlite3(dbPath);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_trick_modifiers WHERE beginner_note IS NOT NULL'))
      .toBe(content.beginnerNotes.size);
  });

  it('exits non-zero, naming the problem, when a staged entry names a missing row', () => {
    db.prepare('DELETE FROM freestyle_trick_modifiers WHERE slug = ?').run(modifierSlugs[0]);
    db.close();
    const r = runStage();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(modifierSlugs[0]);
    db = new BetterSqlite3(dbPath);
    expect(value('SELECT COUNT(*) AS v FROM freestyle_trick_modifiers WHERE beginner_note IS NOT NULL')).toBe(0);
  });
});
