/**
 * The staged curator content seeds the columns the app reads.
 *
 * Before go-live the record review notes and the modifier notes live as staged
 * modules under the freestyle inputs, and a rebuild seeds them into the
 * database. Every staged entry must land, a stale value from a previous run must
 * not survive, and an entry naming something the database does not hold must
 * stop the rebuild with nothing written, never be skipped.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertFreestyleRecord, insertFreestyleTrickModifier } from '../fixtures/factories';
import {
  seedCuratorContent,
  STAGED_CURATOR_CONTENT,
  CuratorContentRefusal,
  type CuratorContent,
} from '../../freestyle/loaders/28a_seed_curator_content';

const { dbPath } = setTestEnv('4148');
const content = STAGED_CURATOR_CONTENT;
const modifierSlugs = [...new Set([...content.beginnerNotes.keys(), ...content.compositionGlosses.keys()])];
const EXTRA_MODIFIER = 'zz_unstaged_modifier';
const EXTRA_RECORD = 'Zz Unstaged Record';

let db: BetterSqlite3.Database;

/** A database holding every record and modifier the staged content names, plus
 *  one modifier and one record it does not. */
function build(): BetterSqlite3.Database {
  cleanupTestDb(dbPath);
  const conn = createTestDb(dbPath);
  for (const name of [...content.recordReviews.keys(), EXTRA_RECORD]) insertFreestyleRecord(conn, { trick_name: name });
  for (const slug of [...modifierSlugs, EXTRA_MODIFIER]) insertFreestyleTrickModifier(conn, { slug });
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
    for (const [slug, gloss] of content.compositionGlosses) {
      expect(value('SELECT composition_gloss AS v FROM freestyle_trick_modifiers WHERE slug = ?', slug), slug).toBe(gloss);
    }
    // The counts are what the rows say, not a tally of the attempts.
    expect(counts).toEqual({
      recordsUnderReview: content.recordReviews.size,
      beginnerNotes:      content.beginnerNotes.size,
      compositionGlosses: content.compositionGlosses.size,
    });
    // Rows the content does not name stay empty.
    expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBeNull();
    expect(value('SELECT curator_review_note AS v FROM freestyle_records WHERE trick_name = ?', EXTRA_RECORD)).toBeNull();
  });

  // Defect caught: an entry removed from a staged module living on in the
  // database after the next refresh.
  it('clears a value no staged entry supplies any more', () => {
    db.prepare('UPDATE freestyle_trick_modifiers SET beginner_note = ?, composition_gloss = ? WHERE slug = ?')
      .run('stale', 'stale', EXTRA_MODIFIER);
    db.prepare('UPDATE freestyle_records SET curator_review_note = ? WHERE trick_name = ?').run('stale', EXTRA_RECORD);
    seedCuratorContent(db);
    expect(value('SELECT beginner_note AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBeNull();
    expect(value('SELECT composition_gloss AS v FROM freestyle_trick_modifiers WHERE slug = ?', EXTRA_MODIFIER)).toBeNull();
    expect(value('SELECT curator_review_note AS v FROM freestyle_records WHERE trick_name = ?', EXTRA_RECORD)).toBeNull();
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
    ['a gloss for a modifier the registry does not hold', withExtra({
      compositionGlosses: new Map([...content.compositionGlosses, ['no_such_gloss_modifier', 'A gloss.']]),
    }), /no_such_gloss_modifier/],
    ['a record name no record carries', withExtra({
      recordReviews: new Map([...content.recordReviews, ['No Such Record', 'A note.']]),
    }), /No Such Record/],
  ])('%s', (_label, bad, message) => {
    db.prepare('UPDATE freestyle_trick_modifiers SET beginner_note = ? WHERE slug = ?').run('kept', EXTRA_MODIFIER);
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
