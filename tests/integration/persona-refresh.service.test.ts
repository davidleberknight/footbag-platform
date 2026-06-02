/**
 * refreshAllPersonas — scoped persona teardown + reseed.
 *
 * Real SQLite (no mocks). Each test builds a fresh schema, seeds the canonical
 * catalog by calling refreshAllPersonas against an empty DB, then exercises one
 * dimension. repoRoot points at an empty temp dir so no .local extension loads;
 * the runner reseeds canonical personas only.
 *
 * No passwordHash is passed: seeded members get the factory placeholder hash, so
 * the module never imports the env-gated persona secret (FOOTBAG_ENV is unset
 * under Vitest).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { refreshAllPersonas } from '../../src/testkit/personaRefreshRunner';
import {
  insertMember,
  insertClub,
  insertMemberTierGrant,
  insertAuditEntry,
} from '../../src/testkit/personaRowBuilders';

const { dbPath } = setTestEnv('3097');

const T1 = 'member_persona_t1_paid';
const T2 = 'member_persona_t2_paid';

let repoRoot: string;
let db: BetterSqlite3.Database;

const tierOf = (memberId: string): string | undefined =>
  (db.prepare(`SELECT tier_status FROM member_tier_current WHERE member_id = ?`).get(memberId) as
    | { tier_status: string }
    | undefined)?.tier_status;

const count = (sql: string, ...params: unknown[]): number =>
  (db.prepare(sql).get(...params) as { n: number }).n;

beforeAll(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-personaroot-'));
});

afterAll(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
  cleanupTestDb(dbPath);
});

beforeEach(() => {
  cleanupTestDb(dbPath);
  db = createTestDb(dbPath);
  // Baseline: seed the canonical catalog from an empty DB.
  refreshAllPersonas(db, repoRoot);
});

afterEach(() => {
  db.close();
});

describe('refreshAllPersonas', () => {
  it('resets a tier upgrade that stuck in the append-only ledger', () => {
    expect(tierOf(T1)).toBe('tier1');

    // Simulate an in-app upgrade: a later-stamped grant wins member_tier_current.
    insertMemberTierGrant(db, {
      member_id: T1,
      new_tier_status: 'tier2',
      created_at: '2026-01-01T00:00:00.000Z',
      reason_code: 'purchase.tier2',
    });
    expect(tierOf(T1)).toBe('tier2');

    refreshAllPersonas(db, repoRoot);

    // Back to the seeded tier, and the upgrade grant is physically gone — proving
    // the row was deleted, not merely out-voted by a fresh seed grant.
    expect(tierOf(T1)).toBe('tier1');
    const grants = db
      .prepare(`SELECT created_at, new_tier_status FROM member_tier_grants WHERE member_id = ?`)
      .all(T1) as { created_at: string; new_tier_status: string }[];
    expect(grants).toHaveLength(1);
    expect(grants[0].new_tier_status).toBe('tier1');
    expect(grants.some((g) => g.created_at === '2026-01-01T00:00:00.000Z')).toBe(false);
  });

  it('rebuilds persona-owned rows including legacy identity and name variants', () => {
    // Linked legacy persona keeps its deterministic legacy root.
    expect(count(`SELECT COUNT(*) AS n FROM legacy_members WHERE legacy_member_id = ?`, 'legmem_persona_legacy_linked')).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM members WHERE id = ?`, 'member_persona_legacy_linked')).toBe(1);
    // The medium auto-link persona seeds a name_variants row.
    expect(count(`SELECT COUNT(*) AS n FROM historical_persons WHERE legacy_member_id = ?`, 'legmem_persona_autolink_medium')).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM name_variants`)).toBeGreaterThan(0);
  });

  it('leaves non-persona data untouched', () => {
    insertMember(db, { id: 'member-outsider-1', slug: 'outsider_1' });
    insertMemberTierGrant(db, { member_id: 'member-outsider-1', new_tier_status: 'tier1' });
    insertClub(db, { id: 'club-outsider-1' });
    // An audit row referencing a persona member but written by a non-persona actor.
    insertAuditEntry(db, {
      created_by: 'real-system',
      action_type: 'real_event',
      entity_id: T1,
    });
    // The shared mailing_lists parent (seeded by ml_subscribed) must survive teardown.
    expect(count(`SELECT COUNT(*) AS n FROM mailing_lists WHERE slug = 'announce'`)).toBe(1);

    refreshAllPersonas(db, repoRoot);

    expect(count(`SELECT COUNT(*) AS n FROM members WHERE id = 'member-outsider-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants WHERE member_id = 'member-outsider-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM clubs WHERE id = 'club-outsider-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM audit_entries WHERE created_by = 'real-system'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM mailing_lists WHERE slug = 'announce'`)).toBe(1);
  });

  it('is idempotent: repeated refreshes do not accumulate or throw', () => {
    const personaMembers = () => count(`SELECT COUNT(*) AS n FROM members WHERE id LIKE 'member_persona_%'`);
    const clubs = () => count(`SELECT COUNT(*) AS n FROM clubs`);
    const tags = () => count(`SELECT COUNT(*) AS n FROM tags`);
    const variants = () => count(`SELECT COUNT(*) AS n FROM name_variants`);

    const m0 = personaMembers();
    const c0 = clubs();
    const t0 = tags();
    const v0 = variants();

    expect(() => refreshAllPersonas(db, repoRoot)).not.toThrow();
    expect(() => refreshAllPersonas(db, repoRoot)).not.toThrow();

    // Stable counts prove teardown removed the prior round's random-id rows
    // (clubs/tags) and PK-keyed rows (members/name_variants) before reseeding.
    expect(personaMembers()).toBe(m0);
    expect(clubs()).toBe(c0);
    expect(tags()).toBe(t0);
    expect(variants()).toBe(v0);
    expect(tierOf(T1)).toBe('tier1');
  });

  it('restores the append-only DELETE guards after refresh', () => {
    expect(() =>
      db.prepare(`DELETE FROM member_tier_grants WHERE member_id = ?`).run(T1),
    ).toThrow(/append-only/);
    expect(() =>
      db.prepare(`DELETE FROM active_player_grants WHERE member_id = ?`).run('member_persona_ap_active'),
    ).toThrow(/append-only/);
    const auditId = (db.prepare(`SELECT id FROM audit_entries LIMIT 1`).get() as { id: string }).id;
    expect(() => db.prepare(`DELETE FROM audit_entries WHERE id = ?`).run(auditId)).toThrow(/immutable/);
  });

  it('rolls back fully (guards restored, data unchanged) when teardown hits a FK block', () => {
    insertMemberTierGrant(db, {
      member_id: T1,
      new_tier_status: 'tier2',
      created_at: '2026-01-01T00:00:00.000Z',
      reason_code: 'purchase.tier2',
    });
    expect(tierOf(T1)).toBe('tier2');

    // A vouch whose target is a persona member RESTRICTs the member delete mid-teardown.
    db.prepare(
      `INSERT INTO active_player_vouches
         (id, created_at, created_by, voucher_member_id, target_member_id, vouched_at)
       VALUES (?, ?, 'system', ?, ?, ?)`,
    ).run('apv-block-1', '2026-01-01T00:00:00.000Z', T2, T1, '2026-01-01T00:00:00.000Z');

    expect(() => refreshAllPersonas(db, repoRoot)).toThrow();

    // Guards restored by the transaction rollback (DDL is transactional in SQLite).
    const guards = count(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'
         AND name IN ('trg_tier_grants_no_delete','trg_active_player_grants_no_delete','trg_audit_no_delete')`,
    );
    expect(guards).toBe(3);
    // Pre-refresh state intact: the upgrade grant and the vouch both survive.
    expect(tierOf(T1)).toBe('tier2');
    expect(count(`SELECT COUNT(*) AS n FROM active_player_vouches WHERE id = 'apv-block-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM members WHERE id = ?`, T1)).toBe(1);
  });
});
