/**
 * Schema contract for auto_link_staged_candidates: target-presence and
 * status/resolved_at CHECK constraints, confidence and status enums, and the
 * partial unique index that makes one open row per member/target pair the
 * hard invariant (re-staging an open pair fails; staging again after the
 * pair resolved succeeds).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');
let db: BetterSqlite3.Database;
let memberId: string;

const NOW = '2026-01-01T00:00:00.000Z';

beforeAll(() => {
  db = createTestDb(dbPath);
  insertLegacyMember(db, { legacy_member_id: 'LM-schema-1', legacy_email: 'schema1@example.com' });
  insertHistoricalPerson(db, { person_id: 'HP-schema-1', person_name: 'Schema Tester' });
  memberId = insertMember(db, { slug: 'schema_staged', login_email: 'staged-schema@example.com' });
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function insertRow(overrides: Partial<Record<string, unknown>> = {}): void {
  const row: Record<string, unknown> = {
    id: `alsc-${Math.random().toString(36).slice(2, 10)}`,
    member_id: memberId,
    legacy_member_id: 'LM-schema-1',
    historical_person_id: 'HP-schema-1',
    confidence: 'high',
    proposed_evidence_strength: 'currently_controls_modern_email_matching_legacy',
    source_pass: 'batch',
    status: 'staged',
    resolved_at: null,
    ...overrides,
  };
  db.prepare(`
    INSERT INTO auto_link_staged_candidates (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, legacy_member_id, historical_person_id,
      confidence, matched_anchors_json, proposed_evidence_strength,
      source_pass, status, resolved_at, expires_at
    ) VALUES (?, ?, 'system', ?, 'system', 1, ?, ?, ?, ?, '[]', ?, ?, ?, ?, NULL)
  `).run(
    row.id, NOW, NOW,
    row.member_id, row.legacy_member_id, row.historical_person_id,
    row.confidence, row.proposed_evidence_strength,
    row.source_pass, row.status, row.resolved_at,
  );
}

describe('auto_link_staged_candidates schema', () => {
  it('rejects a candidate with neither target source', () => {
    expect(() => insertRow({ legacy_member_id: null, historical_person_id: null }))
      .toThrow(/CHECK constraint failed/);
  });

  it('rejects an open row with resolved_at set, and a resolved row without it', () => {
    expect(() => insertRow({ status: 'staged', resolved_at: NOW }))
      .toThrow(/CHECK constraint failed/);
    expect(() => insertRow({ status: 'declined', resolved_at: null }))
      .toThrow(/CHECK constraint failed/);
  });

  it('rejects out-of-enum confidence and status values', () => {
    expect(() => insertRow({ confidence: 'low' })).toThrow(/CHECK constraint failed/);
    expect(() => insertRow({ status: 'pending', resolved_at: null })).toThrow(/CHECK constraint failed/);
  });

  it('enforces one OPEN row per member/target pair, and admits a new row once the pair resolved', () => {
    insertRow();
    expect(() => insertRow()).toThrow(/UNIQUE constraint failed/);

    db.prepare(`
      UPDATE auto_link_staged_candidates
      SET status = 'expired', resolved_at = ?
      WHERE member_id = ? AND status = 'staged'
    `).run(NOW, memberId);

    expect(() => insertRow()).not.toThrow();
  });
});
