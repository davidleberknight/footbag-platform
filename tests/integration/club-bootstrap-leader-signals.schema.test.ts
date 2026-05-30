/**
 * Schema-level tests for club_bootstrap_leader_signals.
 *
 * Verifies the contract of the child table that holds per-signal evidence
 * for combination-gate classification:
 *   - rows insert against a valid bootstrap_leader_id and signal_type
 *   - CHECK enforces signal_type enum (5 structural + 3 modifier values)
 *   - CHECK enforces is_present in (0,1)
 *   - UNIQUE(bootstrap_leader_id, signal_type) blocks duplicates
 *   - FK to club_bootstrap_leaders enforced
 *   - ON DELETE CASCADE removes signal rows when the parent is deleted
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createTestDb } from '../fixtures/testDb';
import {
  insertClub,
  insertClubBootstrapLeader,
  insertHistoricalPerson,
} from '../fixtures/factories';

const STRUCTURAL_SIGNALS = [
  'listed_contact',
  'affiliation',
  'hosting',
  'roster',
  'mirror_text',
] as const;

const MODIFIER_SIGNALS = [
  'tier_signal',
  'recent_activity',
  'geographic_alignment',
] as const;

const ALL_SIGNALS = [...STRUCTURAL_SIGNALS, ...MODIFIER_SIGNALS] as const;

const TS = '2026-01-01T00:00:00.000Z';

function insertSignal(
  db: BetterSqlite3.Database,
  o: {
    id?: string;
    bootstrap_leader_id: string;
    signal_type: string;
    is_present?: 0 | 1;
    signal_payload_json?: string;
    source?: string;
  },
): string {
  const id = o.id ?? `cbls-${Math.random().toString(36).slice(2)}`;
  db.prepare(`
    INSERT INTO club_bootstrap_leader_signals (
      id, created_at, created_by, updated_at, updated_by, version,
      bootstrap_leader_id, signal_type, signal_payload_json, is_present, source
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    id, TS, 'system', TS, 'system',
    o.bootstrap_leader_id,
    o.signal_type,
    o.signal_payload_json ?? '{}',
    o.is_present ?? 1,
    o.source ?? 'test',
  );
  return id;
}

describe('club_bootstrap_leader_signals schema', () => {
  let db: BetterSqlite3.Database;
  let dbPath: string;
  let bootstrapLeaderId: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `footbag-test-cbls-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    db = createTestDb(dbPath);
    const clubId = insertClub(db);
    const legacyMemberId = `lm-${Math.random().toString(36).slice(2)}`;
    insertHistoricalPerson(db, { legacy_member_id: legacyMemberId });
    bootstrapLeaderId = insertClubBootstrapLeader(db, {
      club_id: clubId,
      legacy_member_id: legacyMemberId,
    });
  });

  afterEach(() => {
    db.close();
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  for (const sig of ALL_SIGNALS) {
    it(`accepts valid signal_type "${sig}"`, () => {
      insertSignal(db, {
        bootstrap_leader_id: bootstrapLeaderId,
        signal_type: sig,
      });
      const row = db.prepare(
        `SELECT signal_type, is_present
           FROM club_bootstrap_leader_signals
          WHERE bootstrap_leader_id = ? AND signal_type = ?`,
      ).get(bootstrapLeaderId, sig) as { signal_type: string; is_present: number };
      expect(row.signal_type).toBe(sig);
      expect(row.is_present).toBe(1);
    });
  }

  it('CHECK constraint rejects out-of-enum signal_type', () => {
    expect(() => {
      insertSignal(db, {
        bootstrap_leader_id: bootstrapLeaderId,
        signal_type: 'bogus_signal',
      });
    }).toThrow(/CHECK constraint failed/);
  });

  it('CHECK constraint rejects is_present outside (0,1)', () => {
    expect(() => {
      insertSignal(db, {
        bootstrap_leader_id: bootstrapLeaderId,
        signal_type: 'listed_contact',
        is_present: 2 as 0 | 1,
      });
    }).toThrow(/CHECK constraint failed/);
  });

  it('UNIQUE(bootstrap_leader_id, signal_type) blocks duplicate inserts', () => {
    insertSignal(db, {
      bootstrap_leader_id: bootstrapLeaderId,
      signal_type: 'roster',
    });
    expect(() => {
      insertSignal(db, {
        bootstrap_leader_id: bootstrapLeaderId,
        signal_type: 'roster',
      });
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('FK to club_bootstrap_leaders rejects unknown bootstrap_leader_id', () => {
    expect(() => {
      insertSignal(db, {
        bootstrap_leader_id: 'does-not-exist',
        signal_type: 'roster',
      });
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('ON DELETE CASCADE removes signal rows when parent leader is deleted', () => {
    insertSignal(db, {
      bootstrap_leader_id: bootstrapLeaderId,
      signal_type: 'listed_contact',
    });
    insertSignal(db, {
      bootstrap_leader_id: bootstrapLeaderId,
      signal_type: 'hosting',
    });
    const beforeCount = db.prepare(
      `SELECT COUNT(*) AS n FROM club_bootstrap_leader_signals WHERE bootstrap_leader_id = ?`,
    ).get(bootstrapLeaderId) as { n: number };
    expect(beforeCount.n).toBe(2);

    db.prepare(`DELETE FROM club_bootstrap_leaders WHERE id = ?`).run(bootstrapLeaderId);

    const afterCount = db.prepare(
      `SELECT COUNT(*) AS n FROM club_bootstrap_leader_signals WHERE bootstrap_leader_id = ?`,
    ).get(bootstrapLeaderId) as { n: number };
    expect(afterCount.n).toBe(0);
  });
});
