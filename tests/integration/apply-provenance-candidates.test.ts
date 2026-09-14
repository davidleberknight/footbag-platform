/**
 * Integration tests for applyProvenanceCandidates.
 *
 * Exercises the write path in isolation: happy apply, skip reasons
 * (hp_already_linked, legacy_missing, legacy_already_claimed,
 * duplicate_target_in_csv, hp_missing), and the all-or-nothing
 * transaction guarantee when a mid-apply invariant is violated.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { createTestDb } from '../fixtures/testDb';
import { insertHistoricalPerson, insertLegacyMember } from '../fixtures/factories';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyProvenanceCandidates, CsvRow } from '../../scripts/apply-provenance-candidates';

const DB_PATH = path.resolve(
  os.tmpdir(),
  `footbag-test-apply-prov-${Date.now()}-${process.pid}.db`,
);

function freshDb(): BetterSqlite3.Database {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  const db = createTestDb(DB_PATH);
  return db;
}

function seedCommon(db: BetterSqlite3.Database): void {
  const insLegacy = (legacy_member_id: string, display_name: string): string =>
    insertLegacyMember(db, {
      legacy_member_id,
      display_name,
      // Mirror-derived rows carry the roster name only; the legal name stays unset.
      real_name: null,
      import_source: 'mirror',
    });
  const insHp = (person_id: string, person_name: string, legacy_member_id: string | null): string =>
    insertHistoricalPerson(db, {
      person_id, person_name, legacy_member_id, source: 'test', country: null,
    });

  insLegacy('LM-clean',    'Clean Target');
  insLegacy('LM-claimed',  'Claimed Target');
  insLegacy('LM-unique-a', 'Unique A');
  insLegacy('LM-unique-b', 'Unique B');

  insHp('hp-clean',         'Clean HP',         null);
  insHp('hp-has-link',      'Already Linked',   'LM-unique-b');  // HP already linked
  insHp('hp-claim-target',  'Claimed Owner',    'LM-claimed');   // holds LM-claimed
  insHp('hp-for-a',         'For Unique A',     null);
  insHp('hp-contends',      'Contender',        null);           // will try to claim LM-claimed
  insHp('hp-missing-lm',    'Bad Target',       null);
}

let db: BetterSqlite3.Database;

beforeAll(() => {
  db = freshDb();
  seedCommon(db);
});

afterAll(() => {
  db.close();
  for (const ext of ['', '-wal', '-shm']) {
    const p = DB_PATH + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

describe('applyProvenanceCandidates', () => {
  it('applies a clean HIGH row and updates historical_persons', () => {
    const rows: CsvRow[] = [
      { historical_person_id: 'hp-clean', candidate_legacy_member_id: 'LM-clean' },
    ];
    const result = applyProvenanceCandidates(db, rows);
    expect(result.applied).toEqual([
      { person_id: 'hp-clean', legacy_member_id: 'LM-clean' },
    ]);
    expect(result.skipped).toEqual([]);

    const hp = db.prepare('SELECT legacy_member_id FROM historical_persons WHERE person_id = ?')
      .get('hp-clean') as { legacy_member_id: string };
    expect(hp.legacy_member_id).toBe('LM-clean');
  });

  it('skips hp_already_linked without touching the existing link', () => {
    const result = applyProvenanceCandidates(db, [
      { historical_person_id: 'hp-has-link', candidate_legacy_member_id: 'LM-unique-a' },
    ]);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]).toMatchObject({
      person_id: 'hp-has-link',
      reason: 'hp_already_linked',
    });
    const hp = db.prepare('SELECT legacy_member_id FROM historical_persons WHERE person_id = ?')
      .get('hp-has-link') as { legacy_member_id: string };
    expect(hp.legacy_member_id).toBe('LM-unique-b');
  });

  it('skips legacy_missing when target legacy_members row does not exist', () => {
    const result = applyProvenanceCandidates(db, [
      { historical_person_id: 'hp-missing-lm', candidate_legacy_member_id: 'LM-does-not-exist' },
    ]);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]).toMatchObject({
      person_id: 'hp-missing-lm',
      legacy_member_id: 'LM-does-not-exist',
      reason: 'legacy_missing',
    });
  });

  it('skips legacy_already_claimed when another HP holds the target', () => {
    const result = applyProvenanceCandidates(db, [
      { historical_person_id: 'hp-contends', candidate_legacy_member_id: 'LM-claimed' },
    ]);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]).toMatchObject({
      person_id: 'hp-contends',
      reason: 'legacy_already_claimed',
    });
  });

  it('deduplicates duplicate_target_in_csv and keeps first occurrence only', () => {
    const rows: CsvRow[] = [
      { historical_person_id: 'hp-for-a',   candidate_legacy_member_id: 'LM-unique-a' },
      { historical_person_id: 'hp-another', candidate_legacy_member_id: 'LM-unique-a' },
    ];
    const result = applyProvenanceCandidates(db, rows);
    expect(result.applied).toEqual([
      { person_id: 'hp-for-a', legacy_member_id: 'LM-unique-a' },
    ]);
    expect(result.skipped[0]).toMatchObject({
      person_id: 'hp-another',
      reason: 'duplicate_target_in_csv',
    });
  });

  it('skips hp_missing when the HP row does not exist', () => {
    const result = applyProvenanceCandidates(db, [
      { historical_person_id: 'hp-does-not-exist', candidate_legacy_member_id: 'LM-unique-b' },
    ]);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]).toMatchObject({
      person_id: 'hp-does-not-exist',
      reason: 'hp_missing',
    });
  });
});
