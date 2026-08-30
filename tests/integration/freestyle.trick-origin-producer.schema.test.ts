/**
 * Who is entitled to retire a trick row.
 *
 * The dictionary is built by three committed producers and, since the curation
 * funnel shipped, by curators as well. Each owns a different part of it, so
 * "delete the rows my input no longer carries" is only safe when a producer can
 * tell its own rows from everyone else's. This column is how it tells.
 *
 * Ownership is the current right to retire, not a record of who inserted first:
 * it can move between committed producers when an input moves. What it may never
 * do is move away from a curator, and it may never be acquired by a producer that
 * merely rewrites a row it did not create.
 *
 * A null owner is the protected default rather than a gap. Every row that
 * predates the stamp is unowned, an unowned row is nobody's to delete, and a row
 * that cannot be classified with evidence keeps that state and simply persists.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('4142');

let db: BetterSqlite3.Database;

beforeAll(() => {
  db = createTestDb(dbPath);
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function owner(slug: string): string | null {
  return (db.prepare('SELECT trick_origin_producer FROM freestyle_tricks WHERE slug = ?')
    .get(slug) as { trick_origin_producer: string | null }).trick_origin_producer;
}

describe('the column the dictionary is refreshed by', () => {
  it('accepts each producer that creates a trick row', () => {
    for (const producer of ['base-dictionary', 'expert-additions',
                            'footbag-org-pending', 'curator-publication']) {
      const slug = `owned_by_${producer.replace(/-/g, '_')}`;
      insertFreestyleTrick(db, { slug, trick_origin_producer: producer });
      expect(owner(slug)).toBe(producer);
    }
  });

  it('leaves a row unowned by default, which is the protected state', () => {
    insertFreestyleTrick(db, { slug: 'unowned_row' });
    expect(owner('unowned_row')).toBeNull();
  });

  it('refuses a producer nobody recognises', () => {
    expect(() =>
      insertFreestyleTrick(db, { slug: 'bogus_owner', trick_origin_producer: 'some-script' }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses the empty string, which is not the same as unowned', () => {
    expect(() =>
      insertFreestyleTrick(db, { slug: 'blank_owner', trick_origin_producer: '' }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('lets ownership move between committed producers in place', () => {
    // An input can legitimately hand a row over. Recording that by deleting and
    // re-creating the row would break every reference to it, so the column is
    // updatable rather than write-once.
    insertFreestyleTrick(db, { slug: 'transferred', trick_origin_producer: 'base-dictionary' });
    db.prepare('UPDATE freestyle_tricks SET trick_origin_producer = ? WHERE slug = ?')
      .run('expert-additions', 'transferred');
    expect(owner('transferred')).toBe('expert-additions');
  });

  it('carries no second column restating what the producer already says', () => {
    // A committed-or-curator flag beside this one would be derivable from it, and
    // two fields that can disagree about the same fact is how they drift.
    const columns = (db.prepare("PRAGMA table_info('freestyle_tricks')").all() as { name: string }[])
      .map((c) => c.name);
    expect(columns.filter((c) => /origin/i.test(c))).toEqual(['trick_origin_producer']);
  });
});
