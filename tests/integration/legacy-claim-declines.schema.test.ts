/**
 * Schema contract for legacy_claim_declines: a decline names at least one
 * target, confidence is one of the three levels, a member's decline of one
 * target is recorded once (NULL targets folded so they cannot slip past the
 * unique index), and every row belongs to a real member.
 *
 * factory-cannot-express: the local row builder below is deliberately not the
 * shared factory. Every refusal case here asserts the table rejects a bad row
 * (no target, an unknown confidence, an unknown member), so the builder must be
 * able to construct one; a factory typed to the valid shape cannot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember, insertLegacyMember, insertHistoricalPerson, insertLegacyClaimDecline,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');
let db: BetterSqlite3.Database;
let memberId: string;

const NOW = '2026-01-01T00:00:00.000Z';

beforeAll(() => {
  db = createTestDb(dbPath);
  insertLegacyMember(db, { legacy_member_id: 'LM-decl-1' });
  insertLegacyMember(db, { legacy_member_id: 'LM-decl-2' });
  insertHistoricalPerson(db, { person_id: 'HP-decl-1', person_name: 'Decline Tester' });
  insertHistoricalPerson(db, { person_id: 'HP-decl-2', person_name: 'Decline Other' });
  memberId = insertMember(db, { slug: 'schema_declines' });
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function insertRaw(overrides: Partial<Record<string, unknown>> = {}): void {
  const row: Record<string, unknown> = {
    id: `lcd-${Math.random().toString(36).slice(2, 10)}`,
    member_id: memberId,
    legacy_member_id: null,
    historical_person_id: null,
    confidence: 'medium',
    ...overrides,
  };
  // factory-cannot-express: the subject of each case is the table refusing this row.
  db.prepare(`
    INSERT INTO legacy_claim_declines (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, legacy_member_id, historical_person_id, confidence, evidence_json
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, ?, '{}')
  `).run(row.id, NOW, NOW, row.member_id, row.legacy_member_id, row.historical_person_id, row.confidence);
}

describe('legacy_claim_declines', () => {
  // Defect caught: a decline naming nothing is stored, so the matching would
  // read a standing answer that hides no candidate and means nothing.
  it('refuses a decline that names no target', () => {
    expect(() => insertRaw()).toThrow(/CHECK constraint failed/);
  });

  // Defect caught: a confidence outside the matching's three levels is stored
  // and the admin evidence view cannot read it.
  it('refuses an unknown confidence', () => {
    expect(() => insertRaw({ historical_person_id: 'HP-decl-1', confidence: 'certain' }))
      .toThrow(/CHECK constraint failed/);
  });

  // Defect caught: a double submit of "This Is Not Me" records two standing
  // answers, including when one target is NULL, which a plain UNIQUE admits.
  it('records one decline per member and target, folding NULL targets', () => {
    insertLegacyClaimDecline(db, { member_id: memberId, historical_person_id: 'HP-decl-2' });
    expect(() => insertRaw({ historical_person_id: 'HP-decl-2' })).toThrow(/UNIQUE constraint failed/);
    insertLegacyClaimDecline(db, { member_id: memberId, legacy_member_id: 'LM-decl-2', historical_person_id: 'HP-decl-1' });
    expect(() => insertRaw({ legacy_member_id: 'LM-decl-2', historical_person_id: 'HP-decl-1' }))
      .toThrow(/UNIQUE constraint failed/);
    // A different target for the same member is a separate answer.
    insertLegacyClaimDecline(db, { member_id: memberId, legacy_member_id: 'LM-decl-1' });
    const count = db.prepare('SELECT COUNT(*) AS c FROM legacy_claim_declines WHERE member_id = ?')
      .get(memberId) as { c: number };
    expect(count.c).toBe(3);
  });

  // Defect caught: a decline outlives any member, so a purge that misses it
  // leaves a row pointing at nobody.
  it('refuses a decline for a member that does not exist', () => {
    expect(() => insertRaw({ member_id: 'member-nobody', historical_person_id: 'HP-decl-1' }))
      .toThrow(/FOREIGN KEY constraint failed/);
  });
});
