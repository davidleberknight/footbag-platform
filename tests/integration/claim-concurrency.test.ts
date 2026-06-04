/**
 * Claim-race contract: when a concurrent claimant wins between a claim's
 * pre-checks and its writes (processes sharing the database), the loser's
 * SQLITE_CONSTRAINT_UNIQUE surfaces as ConflictError with the same
 * user-readable message as the synchronous already-claimed check, and the
 * whole claim transaction rolls back: no partial link, no claim-state
 * change on the target row, no tier grant, no claim audit row.
 *
 * The races are constructed deterministically by pre-committing the
 * winner's unique value (the member-side legacy_email unique index) so the
 * loser's merge write hits the constraint exactly as a mid-race loser
 * would, without needing real cross-process interleaving.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ConflictError: typeof import('../../src/services/serviceErrors').ConflictError;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
  ConflictError = (await import('../../src/services/serviceErrors')).ConflictError;
});

afterAll(() => cleanupTestDb(dbPath));

function db(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function row(sql: string, ...params: unknown[]): Record<string, unknown> | undefined {
  const d = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return d.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  } finally {
    d.close();
  }
}

function count(sql: string, ...params: unknown[]): number {
  const d = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (d.prepare(sql).get(...params) as { n: number }).n;
  } finally {
    d.close();
  }
}

describe('legacy-account claim race loser', () => {
  it('maps the unique-constraint loss to ConflictError and rolls the whole claim back', () => {
    const d = db();
    // The winner already carries the unique value the loser's merge will
    // copy (members.legacy_email is UNIQUE where non-NULL).
    insertMember(d, {
      id: 'race-legacy-winner', slug: 'race_legacy_winner',
      login_email: 'race-legacy-winner@example.com',
      real_name: 'Race Winner', display_name: 'Race Winner',
    });
    d.prepare(`UPDATE members SET legacy_email = 'race-dup@legacy.example.com' WHERE id = 'race-legacy-winner'`).run();

    insertLegacyMember(d, {
      legacy_member_id: 'LM-race-1', legacy_email: 'race-dup@legacy.example.com',
      real_name: 'Race Target', display_name: 'Race Target',
    });
    insertMember(d, {
      id: 'race-legacy-loser', slug: 'race_legacy_loser',
      login_email: 'race-legacy-loser@example.com',
      real_name: 'Race Loser', display_name: 'Race Loser',
    });
    d.close();

    expect(() => svc.claimLegacyAccount('race-legacy-loser', 'LM-race-1'))
      .toThrow(ConflictError);
    expect(() => svc.claimLegacyAccount('race-legacy-loser', 'LM-race-1'))
      .toThrow(/already been claimed by another account/);

    // Full rollback: no partial link on the loser, the target row's claim
    // state is untouched, no tier grant, no claim audit row.
    const loser = row(`SELECT legacy_member_id, legacy_email FROM members WHERE id = 'race-legacy-loser'`)!;
    expect(loser.legacy_member_id).toBeNull();
    expect(loser.legacy_email).toBeNull();
    const target = row(`SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = 'LM-race-1'`)!;
    expect(target.claimed_by_member_id).toBeNull();
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants WHERE member_id = 'race-legacy-loser'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = 'race-legacy-loser' AND action_type = 'claim.legacy_account'`)).toBe(0);
  });
});

describe('historical-person claim race loser (transitive legacy merge)', () => {
  it('maps the unique-constraint loss to ConflictError and rolls the whole claim back', () => {
    const d = db();
    insertMember(d, {
      id: 'race-hp-winner', slug: 'race_hp_winner',
      login_email: 'race-hp-winner@example.com',
      real_name: 'Hp Winner', display_name: 'Hp Winner',
    });
    d.prepare(`UPDATE members SET legacy_email = 'race-dup2@legacy.example.com' WHERE id = 'race-hp-winner'`).run();

    insertLegacyMember(d, {
      legacy_member_id: 'LM-race-2', legacy_email: 'race-dup2@legacy.example.com',
      real_name: 'Hp Contender', display_name: 'Hp Contender',
    });
    insertHistoricalPerson(d, {
      person_id: 'HP-race-1', person_name: 'Hilda Contender',
      legacy_member_id: 'LM-race-2',
    });
    insertMember(d, {
      id: 'race-hp-loser', slug: 'race_hp_loser',
      login_email: 'race-hp-loser@example.com',
      real_name: 'Henri Contender', display_name: 'Henri Contender',
    });
    d.close();

    expect(() => svc.claimHistoricalPerson('race-hp-loser', 'HP-race-1'))
      .toThrow(ConflictError);
    expect(() => svc.claimHistoricalPerson('race-hp-loser', 'HP-race-1'))
      .toThrow(/already been claimed by another member/);

    const loser = row(`SELECT historical_person_id, legacy_member_id FROM members WHERE id = 'race-hp-loser'`)!;
    expect(loser.historical_person_id).toBeNull();
    expect(loser.legacy_member_id).toBeNull();
    const target = row(`SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = 'LM-race-2'`)!;
    expect(target.claimed_by_member_id).toBeNull();
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants WHERE member_id = 'race-hp-loser'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = 'race-hp-loser' AND action_type = 'claim.historical_person'`)).toBe(0);
  });
});
