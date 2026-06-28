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

// A persona is backed when its feature is built. Blocked personas are catalog-
// only placeholders (greyed on /dev/personas) for test cases that arrive with a
// future feature; they are never seeded.
const BACKED = CANONICAL_PERSONAS.filter((p) => !p.blockedBy);
const BLOCKED = CANONICAL_PERSONAS.filter((p) => p.blockedBy);

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
  it('holds an expanded catalog (20-80 personas) with unique slugs', () => {
    expect(CANONICAL_PERSONAS.length).toBeGreaterThanOrEqual(20);
    expect(CANONICAL_PERSONAS.length).toBeLessThanOrEqual(80);
    const slugs = CANONICAL_PERSONAS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every entry carries non-empty coverage notes', () => {
    for (const spec of CANONICAL_PERSONAS) {
      expect(spec.coverageNotes.length, `${spec.slug} coverageNotes`).toBeGreaterThan(0);
    }
  });

  it('every backed entry seeds without a DB constraint violation and lands a member', () => {
    const memberBySlug = db.prepare(`SELECT id FROM members WHERE slug = ?`);
    for (const spec of BACKED) {
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

  it('club-role personas seed live club_leaders co-leader rows, in different clubs', () => {
    const leadership = db.prepare(`SELECT club_id, role FROM club_leaders WHERE member_id = ?`);
    const leaderA = leadership.get('member_persona_club_leader') as { club_id: string; role: string };
    const coleader = leadership.get('member_persona_club_coleader') as { club_id: string; role: string };
    const leaderB = leadership.get('member_persona_club_leader_b') as { club_id: string; role: string };

    expect(leaderA?.role, 'club_leader is a live co-leader').toBe('co-leader');
    expect(coleader?.role, 'club_coleader is a live co-leader').toBe('co-leader');
    expect(leaderB?.role, 'club_leader_b is a live co-leader').toBe('co-leader');
    // The adjacent-owner co-leads a different club than club_leader (the BOLA shape).
    expect(leaderB.club_id, 'adjacent co-leader is in a different club').not.toBe(leaderA.club_id);
  });

  it('tier0 Active Player co-leader holds a live co-leader row on Active Player benefits alone', () => {
    const memberId = 'member_persona_t0_ap_coleader';
    const tier = db
      .prepare(`SELECT tier_status FROM member_tier_current WHERE member_id = ?`)
      .get(memberId) as { tier_status: string } | undefined;
    expect(tier?.tier_status ?? 'tier0', 'no paid tier grant').toBe('tier0');

    const ap = db
      .prepare(`SELECT is_active_player FROM member_active_player_current WHERE member_id = ?`)
      .get(memberId) as { is_active_player: number } | undefined;
    expect(ap?.is_active_player, 'current Active Player grant is live').toBe(1);

    const leader = db
      .prepare(`SELECT role FROM club_leaders WHERE member_id = ?`)
      .get(memberId) as { role: string } | undefined;
    expect(leader?.role, 'live club_leaders co-leader row').toBe('co-leader');
  });

  it('tier0 bootstrap-leader holds a bootstrap claim with no live co-leader row', () => {
    const memberId = 'member_persona_t0_bootstrap_leader';
    const bootstrap = db
      .prepare(`SELECT id FROM club_bootstrap_leaders WHERE claimed_member_id = ?`)
      .get(memberId) as { id: string } | undefined;
    expect(bootstrap?.id, 'club_bootstrap_leaders claim row exists').toBeTruthy();

    const signal = db
      .prepare(`SELECT COUNT(*) AS n FROM club_bootstrap_leader_signals WHERE bootstrap_leader_id = ?`)
      .get(bootstrap!.id) as { n: number };
    expect(signal.n, 'at least one leadership signal').toBeGreaterThan(0);

    const live = db
      .prepare(`SELECT id FROM club_leaders WHERE member_id = ?`)
      .get(memberId) as { id: string } | undefined;
    expect(live, 'no live club_leaders row until the claim is promoted').toBeUndefined();
  });

  it('every backed persona is exercised: its seeded state matches its declared spec', () => {
    const m = db.prepare(
      `SELECT display_name, is_admin, is_hof, is_bap, is_board, is_deceased,
              email_verified_at, deleted_at, legacy_member_id
         FROM members WHERE id = ?`,
    );
    const tierOf = db.prepare(`SELECT tier_status FROM member_tier_current WHERE member_id = ?`);
    const apOf = db.prepare(
      `SELECT is_active_player FROM member_active_player_current WHERE member_id = ?`,
    );
    const roleOf = db.prepare(`SELECT role FROM club_leaders WHERE member_id = ?`);
    const payN = db.prepare(`SELECT COUNT(*) AS n FROM payments WHERE member_id = ?`);
    const mlN = db.prepare(`SELECT COUNT(*) AS n FROM mailing_list_subscriptions WHERE member_id = ?`);
    const affN = db.prepare(`SELECT COUNT(*) AS n FROM member_club_affiliations WHERE member_id = ?`);
    const onbN = db.prepare(`SELECT COUNT(*) AS n FROM member_onboarding_tasks WHERE member_id = ?`);
    const onbStateOf = db.prepare(`SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?`);
    type MemberRow = {
      display_name: string;
      is_admin: number;
      is_hof: number;
      is_bap: number;
      is_board: number;
      is_deceased: number;
      email_verified_at: string | null;
      deleted_at: string | null;
      legacy_member_id: string | null;
    };
    const countN = (stmt: ReturnType<typeof db.prepare>, id: string): number =>
      (stmt.get(id) as { n: number }).n;

    for (const spec of BACKED) {
      const id = `member_persona_${spec.slug}`;
      const member = m.get(id) as MemberRow | undefined;
      expect(member, `${spec.slug} seeded`).toBeTruthy();
      // Identity round-trips intact: this is the invariant the edge-identity
      // personas (unicode / RTL-override / homoglyph names) carry.
      expect(member!.display_name, `${spec.slug} display name`).toBe(spec.displayName);
      expect(member!.is_admin, `${spec.slug} is_admin`).toBe(spec.isAdmin ? 1 : 0);

      if (spec.tier !== 'tier0') {
        const t = tierOf.get(id) as { tier_status: string } | undefined;
        expect(t?.tier_status, `${spec.slug} tier`).toBe(spec.tier);
      }
      if (spec.honors?.hof) expect(member!.is_hof, `${spec.slug} HoF`).toBe(1);
      if (spec.honors?.bap) expect(member!.is_bap, `${spec.slug} BAP`).toBe(1);
      if (spec.honors?.board) expect(member!.is_board, `${spec.slug} Board`).toBe(1);
      if (spec.isDeceased) expect(member!.is_deceased, `${spec.slug} deceased`).toBe(1);
      if (spec.emailVerified === false) {
        expect(member!.email_verified_at, `${spec.slug} unverified`).toBeNull();
      }
      if (spec.deletionState) expect(member!.deleted_at, `${spec.slug} soft-deleted`).not.toBeNull();
      if (spec.legacy?.linked) {
        expect(member!.legacy_member_id, `${spec.slug} legacy linked`).not.toBeNull();
      }
      if (spec.activePlayer) {
        const expectActive = new Date(spec.activePlayer.expiresAt).getTime() > Date.now() ? 1 : 0;
        const ap = apOf.get(id) as { is_active_player: number } | undefined;
        expect(ap?.is_active_player ?? 0, `${spec.slug} active-player`).toBe(expectActive);
      }
      if (spec.club?.role) {
        const r = roleOf.get(id) as { role: string } | undefined;
        expect(r?.role, `${spec.slug} co-leader row`).toBe('co-leader');
      }
      if (spec.payments?.length) {
        expect(countN(payN, id), `${spec.slug} payment rows`).toBe(spec.payments.length);
      }
      if (spec.mailingList || spec.isAdmin) {
        const declared = spec.mailingList
          ? (Array.isArray(spec.mailingList) ? spec.mailingList : [spec.mailingList])
          : [];
        const declaresAdminAlerts = declared.some((ml) => (ml.listSlug ?? 'announce') === 'admin-alerts');
        // An admin carries an automatic admin-alerts subscription on top of any
        // declared lists, unless the spec already declares admin-alerts itself.
        const want = declared.length + (spec.isAdmin && !declaresAdminAlerts ? 1 : 0);
        expect(countN(mlN, id), `${spec.slug} mailing-list rows`).toBe(want);
      }
      if (spec.clubs?.length) {
        expect(countN(affN, id), `${spec.slug} club affiliations`).toBeGreaterThanOrEqual(
          spec.clubs.length,
        );
      }
      if (spec.onboardingTasks) {
        // Assert the seeded state of each declared task, not just that some row
        // exists: a regression that wrote every task as 'completed' would slip
        // past a bare row-count check.
        for (const [taskType, wantState] of Object.entries(spec.onboardingTasks)) {
          const row = onbStateOf.get(id, taskType) as { state: string } | undefined;
          expect(row?.state, `${spec.slug} ${taskType} state`).toBe(wantState);
        }
      } else if (spec.onboardingComplete) {
        expect(countN(onbN, id), `${spec.slug} onboarding rows`).toBeGreaterThan(0);
      }
    }
  });

  it('admin personas carry the admin-alerts subscription; non-admins do not', () => {
    // Holding the admin role subscribes a member to admin-alerts (the steady
    // state a grant or bootstrap reaches), so the seeded admin matches that
    // invariant and the work-queue fan-out has a target on /dev/outbox.
    const sub = db.prepare(
      `SELECT status FROM mailing_list_subscriptions WHERE member_id = ? AND mailing_list_id = 'admin-alerts'`,
    );
    for (const spec of BACKED) {
      const id = `member_persona_${spec.slug}`;
      const row = sub.get(id) as { status: string } | undefined;
      if (spec.isAdmin) {
        expect(row?.status, `${spec.slug} admin-alerts subscription`).toBe('subscribed');
      } else {
        const declared = spec.mailingList
          ? (Array.isArray(spec.mailingList) ? spec.mailingList : [spec.mailingList])
          : [];
        const declaresAdminAlerts = declared.some((ml) => (ml.listSlug ?? 'announce') === 'admin-alerts');
        if (!declaresAdminAlerts) {
          expect(row, `${spec.slug} has no admin-alerts row`).toBeUndefined();
        }
      }
    }
  });

  it('every persona documents how it is used in testing', () => {
    for (const spec of CANONICAL_PERSONAS) {
      expect(spec.testingUsage.trim().length, `${spec.slug} testingUsage`).toBeGreaterThan(0);
    }
  });

  it('blocked personas are catalog-only: a blockedBy reason, a plain-English user story, never seeded', () => {
    const memberBySlug = db.prepare(`SELECT id FROM members WHERE slug = ?`);
    expect(BLOCKED.length, 'the catalog shows blocked future classes').toBeGreaterThan(0);
    for (const spec of BLOCKED) {
      expect(spec.blockedBy?.length, `${spec.slug} blockedBy`).toBeTruthy();
      expect(spec.userStory?.length, `${spec.slug} userStory`).toBeTruthy();
      // The seed-and-land test seeds only BACKED personas, so a blocked persona
      // must have no seeded member row (it renders greyed on /dev/personas).
      expect(memberBySlug.get(spec.slug), `${spec.slug} not seeded`).toBeUndefined();
    }
  });
});
