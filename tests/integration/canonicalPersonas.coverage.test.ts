/**
 * Canonical persona catalog: every entry instantiates cleanly and carries
 * coverage annotations.
 *
 * Iterates CANONICAL_PERSONAS, seeds each into a fresh test DB via seedPersona,
 * and asserts: no DB constraint violation, a member row lands under the
 * persona slug, and the entry documents the dimensions it exercises. As the
 * catalog grows (onboarding, legacy, club, payment-history, edge-case
 * variants), this test exercises every added persona without further edits.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersona } from '../../src/testkit/personaFactory';

const { dbPath } = setTestEnv('3401');
let db: BetterSqlite3.Database;

beforeAll(() => {
  db = createTestDb(dbPath);
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('canonical persona catalog', () => {
  it('holds an expanded catalog (20-60 personas) with unique slugs', () => {
    expect(CANONICAL_PERSONAS.length).toBeGreaterThanOrEqual(20);
    expect(CANONICAL_PERSONAS.length).toBeLessThanOrEqual(60);
    const slugs = CANONICAL_PERSONAS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every entry carries non-empty coverage notes', () => {
    for (const spec of CANONICAL_PERSONAS) {
      expect(spec.coverageNotes.length, `${spec.slug} coverageNotes`).toBeGreaterThan(0);
    }
  });

  it('every entry seeds without a DB constraint violation and lands a member', () => {
    const memberBySlug = db.prepare(`SELECT id FROM members WHERE slug = ?`);
    for (const spec of CANONICAL_PERSONAS) {
      expect(() => db.transaction(() => seedPersona(db, spec))(), spec.slug).not.toThrow();
      const row = memberBySlug.get(spec.slug) as { id: string } | undefined;
      expect(row?.id, `${spec.slug} member row`).toBe(`member_persona_${spec.slug}`);
    }
  });

  it('account-state personas seed the columns their gates read', () => {
    // The catalog is already seeded by the test above (shared db).
    const col = db.prepare(
      `SELECT email_verified_at, is_deceased, deceased_at, is_hof, deleted_at, deletion_grace_expires_at
       FROM members WHERE id = ?`,
    );
    type Row = {
      email_verified_at: string | null;
      is_deceased: number;
      deceased_at: string | null;
      is_hof: number;
      deleted_at: string | null;
      deletion_grace_expires_at: string | null;
    };
    const now = Date.now();

    const unverified = col.get('member_persona_unverified') as Row;
    expect(unverified.email_verified_at, 'unverified: email_verified_at is NULL').toBeNull();

    const deceased = col.get('member_persona_deceased') as Row;
    expect(deceased.is_deceased, 'deceased: is_deceased=1').toBe(1);
    expect(deceased.deceased_at, 'deceased: deceased_at set').not.toBeNull();
    expect(deceased.is_hof, 'deceased: HoF honor preserved').toBe(1);

    const open = col.get('member_persona_del_grace_open') as Row;
    expect(open.deleted_at, 'grace-open: deleted_at set').not.toBeNull();
    expect(
      new Date(open.deletion_grace_expires_at as string).getTime(),
      'grace-open: restoration window still in the future',
    ).toBeGreaterThan(now);

    const elapsed = col.get('member_persona_del_grace_elapsed') as Row;
    expect(elapsed.deleted_at, 'grace-elapsed: deleted_at set').not.toBeNull();
    expect(
      new Date(elapsed.deletion_grace_expires_at as string).getTime(),
      'grace-elapsed: restoration window already elapsed',
    ).toBeLessThan(now);
  });

  it('honors personas seed their standing flags', () => {
    const flags = db.prepare(`SELECT is_hof, is_bap, is_board FROM members WHERE id = ?`);
    expect((flags.get('member_persona_honors_hof') as { is_hof: number }).is_hof).toBe(1);
    expect((flags.get('member_persona_honors_bap') as { is_bap: number }).is_bap).toBe(1);
    expect((flags.get('member_persona_honors_board') as { is_board: number }).is_board).toBe(1);
  });

  it('claimed-legacy admin flag does not confer a live admin role', () => {
    const member = db
      .prepare(`SELECT is_admin FROM members WHERE id = ?`)
      .get('member_persona_legacy_admin_flag') as { is_admin: number };
    const legacy = db
      .prepare(`SELECT legacy_is_admin FROM legacy_members WHERE legacy_member_id = ?`)
      .get('legmem_persona_legacy_admin_flag') as { legacy_is_admin: number };
    expect(legacy.legacy_is_admin, 'legacy row carries the admin flag').toBe(1);
    expect(member.is_admin, 'live member did NOT inherit admin').toBe(0);
  });

  it('club-role personas seed live club_leaders rows, leader and adjacent in different clubs', () => {
    const leadership = db.prepare(`SELECT club_id, role FROM club_leaders WHERE member_id = ?`);
    const leaderA = leadership.get('member_persona_club_leader') as { club_id: string; role: string };
    const coleader = leadership.get('member_persona_club_coleader') as { club_id: string; role: string };
    const leaderB = leadership.get('member_persona_club_leader_b') as { club_id: string; role: string };

    expect(leaderA?.role, 'club_leader is a live leader').toBe('leader');
    expect(coleader?.role, 'club_coleader is a live co-leader').toBe('co-leader');
    expect(leaderB?.role, 'club_leader_b is a live leader').toBe('leader');
    // The adjacent-owner leads a different club than club_leader (the BOLA shape).
    expect(leaderB.club_id, 'adjacent leader is in a different club').not.toBe(leaderA.club_id);
  });
});
