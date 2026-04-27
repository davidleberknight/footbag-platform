/**
 * Schema-level tests for legacy_club_candidates.classification.
 *
 * Verifies the contract introduced by the column add:
 *   - NOT NULL CHECK enforces enum membership (pre_populate, onboarding_visible, dormant, junk)
 *   - factory default is 'junk' and round-trips through SQLite
 *   - all four valid values accepted and persisted unchanged
 *   - empty / NULL / out-of-enum rejected at INSERT time
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createTestDb } from '../fixtures/testDb';
import {
  insertLegacyClubCandidate,
  type LegacyClubCandidateClassification,
} from '../fixtures/factories';

const VALID_CLASSIFICATIONS: LegacyClubCandidateClassification[] = [
  'pre_populate', 'onboarding_visible', 'dormant', 'junk',
];

describe('legacy_club_candidates.classification', () => {
  let db: BetterSqlite3.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      process.cwd(),
      `test-classification-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    db = createTestDb(dbPath);
  });

  afterEach(() => {
    db.close();
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('factory default classification is junk and round-trips through SQLite', () => {
    const id = insertLegacyClubCandidate(db);
    const row = db.prepare(
      'SELECT classification FROM legacy_club_candidates WHERE id = ?',
    ).get(id) as { classification: string };
    expect(row.classification).toBe('junk');
  });

  for (const value of VALID_CLASSIFICATIONS) {
    it(`accepts valid classification "${value}"`, () => {
      const id = insertLegacyClubCandidate(db, { classification: value });
      const row = db.prepare(
        'SELECT classification FROM legacy_club_candidates WHERE id = ?',
      ).get(id) as { classification: string };
      expect(row.classification).toBe(value);
    });
  }

  it('CHECK constraint rejects out-of-enum classification', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO legacy_club_candidates (
          id, legacy_club_key, display_name, classification,
          created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run('test-bad', 'k', 'n', 'invalid_value', 'ts', 'sys', 'ts', 'sys');
    }).toThrow(/CHECK constraint failed/);
  });

  it('NOT NULL constraint rejects null classification', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO legacy_club_candidates (
          id, legacy_club_key, display_name, classification,
          created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run('test-null', 'k', 'n', null, 'ts', 'sys', 'ts', 'sys');
    }).toThrow(/NOT NULL constraint failed/);
  });

  it('CHECK constraint rejects empty string classification', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO legacy_club_candidates (
          id, legacy_club_key, display_name, classification,
          created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run('test-empty', 'k', 'n', '', 'ts', 'sys', 'ts', 'sys');
    }).toThrow(/CHECK constraint failed/);
  });
});
