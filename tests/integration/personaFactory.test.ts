/**
 * Persona factory (seedPersona) composition + harness containment.
 *
 * Verifies the composition primitive builds the member-plus-supporting-rows
 * shape for each spec dimension, stamps the grep-able detection markers, and
 * contains the persona password literal to a single checked-in file.
 *
 * FOOTBAG_ENV='development' is set before any import because the containment
 * test imports TEST_PERSONA_SEED_PASSWORD_LITERAL from personaSecrets, whose
 * module-load guard refuses any other environment. The composition tests
 * import only personaFactory / personaRowBuilders, which carry no guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { seedPersona, PERSONA_SEED_REASON_CODE } from '../../src/testkit/personaFactory';

const { dbPath } = setTestEnv('3402');

const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = process.env.FOOTBAG_ENV ?? 'development';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
let db: BetterSqlite3.Database;
let TEST_PERSONA_SEED_PASSWORD_LITERAL: string;

beforeAll(async () => {
  db = createTestDb(dbPath);
  const m = await import('../../src/testkit/personaSecrets');
  TEST_PERSONA_SEED_PASSWORD_LITERAL = m.TEST_PERSONA_SEED_PASSWORD_LITERAL;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

describe('seedPersona — composition by dimension', () => {
  it('tier0 spec produces a member with no tier grant', () => {
    const p = seedPersona(db, { slug: 'fac_t0', displayName: 'Fac T0', tier: 'tier0', coverageNotes: ['t0'] });
    expect(p.memberId).toBe('member_persona_fac_t0');
    const member = db.prepare(`SELECT is_admin FROM members WHERE id = ?`).get(p.memberId) as { is_admin: number };
    expect(member.is_admin).toBe(0);
    const grants = db.prepare(`SELECT COUNT(*) c FROM member_tier_grants WHERE member_id = ?`).get(p.memberId) as { c: number };
    expect(grants.c).toBe(0);
  });

  it('tier1 spec with payment produces tier grant (marked) + payment row', () => {
    const p = seedPersona(db, {
      slug: 'fac_t1', displayName: 'Fac T1', tier: 'tier1',
      payments: [{ type: 'membership', status: 'succeeded', purchasedTier: 'tier1' }],
      coverageNotes: ['t1', 'payment'],
    });
    const grant = db.prepare(
      `SELECT new_tier_status, reason_code FROM member_tier_grants WHERE member_id = ?`,
    ).get(p.memberId) as { new_tier_status: string; reason_code: string };
    expect(grant.new_tier_status).toBe('tier1');
    expect(grant.reason_code).toBe(PERSONA_SEED_REASON_CODE);
    const pay = db.prepare(`SELECT COUNT(*) c FROM payments WHERE member_id = ?`).get(p.memberId) as { c: number };
    expect(pay.c).toBe(1);
  });

  it('admin spec sets is_admin=1', () => {
    const p = seedPersona(db, { slug: 'fac_admin', displayName: 'Fac Admin', tier: 'tier2', isAdmin: true, coverageNotes: ['admin'] });
    const member = db.prepare(`SELECT is_admin FROM members WHERE id = ?`).get(p.memberId) as { is_admin: number };
    expect(member.is_admin).toBe(1);
  });

  it('linked legacy spec produces legacy_member + historical_person + claimed link', () => {
    const p = seedPersona(db, {
      slug: 'fac_legacy', displayName: 'Fac Legacy', tier: 'tier0',
      legacy: { linked: true, realName: 'Legacy Linked' }, coverageNotes: ['legacy-claim'],
    });
    expect(p.legacyMemberId).toBeDefined();
    expect(p.personId).toBeDefined();
    const member = db.prepare(`SELECT legacy_member_id FROM members WHERE id = ?`).get(p.memberId) as { legacy_member_id: string | null };
    expect(member.legacy_member_id).toBe(p.legacyMemberId);
    const legacy = db.prepare(`SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?`).get(p.legacyMemberId!) as { claimed_by_member_id: string | null };
    expect(legacy.claimed_by_member_id).toBe(p.memberId);
    const hp = db.prepare(`SELECT COUNT(*) c FROM historical_persons WHERE legacy_member_id = ?`).get(p.legacyMemberId!) as { c: number };
    expect(hp.c).toBe(1);
  });

  it('club-leader spec produces club affiliation + leadership signal', () => {
    const p = seedPersona(db, {
      slug: 'fac_leader', displayName: 'Fac Leader', tier: 'tier1',
      club: { clubName: 'Fac Club', leader: true }, coverageNotes: ['club-leader'],
    });
    expect(p.clubId).toBeDefined();
    const aff = db.prepare(`SELECT COUNT(*) c FROM member_club_affiliations WHERE member_id = ? AND club_id = ?`).get(p.memberId, p.clubId!) as { c: number };
    expect(aff.c).toBe(1);
    const leader = db.prepare(`SELECT id FROM club_bootstrap_leaders WHERE claimed_member_id = ?`).get(p.memberId) as { id: string } | undefined;
    expect(leader?.id).toBeDefined();
    const signal = db.prepare(`SELECT COUNT(*) c FROM club_bootstrap_leader_signals WHERE bootstrap_leader_id = ?`).get(leader!.id) as { c: number };
    expect(signal.c).toBeGreaterThan(0);
  });

  it('onboardingTasks spec writes per-task state with completed_at only on completed', () => {
    const p = seedPersona(db, {
      slug: 'fac_onb', displayName: 'Fac Onb', tier: 'tier0',
      onboardingTasks: { personal_details: 'completed', legacy_claim: 'in_progress_paused', club_affiliations: 'skipped' },
      coverageNotes: ['partial wizard'],
    });
    const rows = db.prepare(
      `SELECT task_type, state, completed_at FROM member_onboarding_tasks WHERE member_id = ? ORDER BY task_type`,
    ).all(p.memberId) as { task_type: string; state: string; completed_at: string | null }[];
    expect(rows).toEqual([
      { task_type: 'club_affiliations', state: 'skipped', completed_at: null },
      { task_type: 'legacy_claim', state: 'in_progress_paused', completed_at: null },
      { task_type: 'personal_details', state: 'completed', completed_at: '2025-01-01T00:00:00.000Z' },
    ]);
  });

  it('legacy spec with legacyEmail seeds the legacy_members email anchor', () => {
    const p = seedPersona(db, {
      slug: 'fac_legemail', displayName: 'Fac LegEmail', tier: 'tier0',
      legacy: { linked: false, legacyEmail: 'anchor@legacy.test' }, coverageNotes: ['email fast path'],
    });
    const legacy = db.prepare(`SELECT legacy_email FROM legacy_members WHERE legacy_member_id = ?`).get(p.legacyMemberId!) as { legacy_email: string | null };
    expect(legacy.legacy_email).toBe('anchor@legacy.test');
    const member = db.prepare(`SELECT legacy_member_id FROM members WHERE id = ?`).get(p.memberId) as { legacy_member_id: string | null };
    expect(member.legacy_member_id).toBeNull();
  });

  it('linked legacy spec preserves legacyEmail through the claim upsert', () => {
    const p = seedPersona(db, {
      slug: 'fac_leglinked', displayName: 'Fac LegLinked', tier: 'tier0',
      legacy: { linked: true, legacyEmail: 'kept@legacy.test' }, coverageNotes: ['linked + email'],
    });
    const legacy = db.prepare(`SELECT legacy_email, claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?`).get(p.legacyMemberId!) as { legacy_email: string | null; claimed_by_member_id: string | null };
    expect(legacy.legacy_email).toBe('kept@legacy.test');
    expect(legacy.claimed_by_member_id).toBe(p.memberId);
  });

  it('activePlayer spec writes an Active Player grant with the given expiry', () => {
    const p = seedPersona(db, {
      slug: 'fac_ap', displayName: 'Fac AP', tier: 'tier0',
      activePlayer: { expiresAt: '2024-06-01T00:00:00.000Z' }, coverageNotes: ['expired AP'],
    });
    const grant = db.prepare(
      `SELECT change_type, new_active_player_expires_at FROM active_player_grants WHERE member_id = ?`,
    ).get(p.memberId) as { change_type: string; new_active_player_expires_at: string } | undefined;
    expect(grant?.change_type).toBe('grant');
    expect(grant?.new_active_player_expires_at).toBe('2024-06-01T00:00:00.000Z');
  });

  it('clubs spec writes one affiliation per club with current/former flags', () => {
    const p = seedPersona(db, {
      slug: 'fac_multiclub', displayName: 'Fac MultiClub', tier: 'tier1',
      clubs: [
        { clubName: 'Current Primary', current: true, primary: true },
        { clubName: 'Former Club', current: false },
      ],
      coverageNotes: ['multi-club'],
    });
    const affs = db.prepare(
      `SELECT is_current, is_primary FROM member_club_affiliations WHERE member_id = ? ORDER BY is_current DESC`,
    ).all(p.memberId) as { is_current: number; is_primary: number }[];
    expect(affs).toEqual([
      { is_current: 1, is_primary: 1 },
      { is_current: 0, is_primary: 0 },
    ]);
  });

  it('mailingList spec creates the parent list and a subscription row at the given status', () => {
    const p = seedPersona(db, {
      slug: 'fac_ml', displayName: 'Fac ML', tier: 'tier1',
      mailingList: { listSlug: 'fac_list', status: 'unsubscribed' }, coverageNotes: ['mailing list'],
    });
    const sub = db.prepare(
      `SELECT mailing_list_id, status FROM mailing_list_subscriptions WHERE member_id = ?`,
    ).get(p.memberId) as { mailing_list_id: string; status: string } | undefined;
    expect(sub).toEqual({ mailing_list_id: 'fac_list', status: 'unsubscribed' });
    const list = db.prepare(`SELECT COUNT(*) c FROM mailing_lists WHERE slug = 'fac_list'`).get() as { c: number };
    expect(list.c).toBe(1);
  });

  it('legacyClubCandidates spec writes candidate + affiliation rows in each resolution state', () => {
    const p = seedPersona(db, {
      slug: 'fac_clubcards', displayName: 'Fac Cards', tier: 'tier0',
      legacy: { linked: false, realName: 'Fac Cards' },
      legacyClubCandidates: [
        { clubName: 'Pending Club', classification: 'onboarding_visible', resolutionStatus: 'pending' },
        { clubName: 'Declined Club', resolutionStatus: 'rejected' },
        { clubName: 'Resolved Club', resolutionStatus: 'confirmed_current', mapped: true },
        { clubName: 'Junk Club', classification: 'junk' },
      ],
      coverageNotes: ['club candidate states'],
    });
    const affs = db.prepare(
      `SELECT a.resolution_status AS status, a.resolved_club_id AS resolved,
              c.classification AS cls, c.mapped_club_id AS mapped, c.display_name AS name
         FROM legacy_person_club_affiliations a
         JOIN legacy_club_candidates c ON c.id = a.legacy_club_candidate_id
        WHERE a.historical_person_id = ?
        ORDER BY c.display_name`,
    ).all(p.personId) as Array<{ status: string; resolved: string | null; cls: string; mapped: string | null; name: string }>;
    const byName = Object.fromEntries(affs.map((r) => [r.name, r]));
    expect(Object.keys(byName).sort()).toEqual(['Declined Club', 'Junk Club', 'Pending Club', 'Resolved Club']);
    expect(byName['Pending Club'].status).toBe('pending');
    expect(byName['Pending Club'].cls).toBe('onboarding_visible');
    expect(byName['Declined Club'].status).toBe('rejected');
    // confirmed_current must carry a resolved club (schema CHECK).
    expect(byName['Resolved Club'].status).toBe('confirmed_current');
    expect(byName['Resolved Club'].resolved).not.toBeNull();
    // junk + null mapped_club_id is the suppressed-card shape.
    expect(byName['Junk Club'].cls).toBe('junk');
    expect(byName['Junk Club'].mapped).toBeNull();
  });

  it('legacyClubCandidates without a legacy identity throws', () => {
    expect(() =>
      seedPersona(db, {
        slug: 'fac_clubcards_nolegacy', displayName: 'No Legacy', tier: 'tier0',
        legacyClubCandidates: [{ clubName: 'Orphan' }],
        coverageNotes: ['guard'],
      }),
    ).toThrow(/legacy identity/);
  });
});

describe('seedPersona — detection markers', () => {
  it('writes a grep-able tier-grant reason_code and a seed audit action_type', () => {
    const p = seedPersona(db, { slug: 'fac_marker', displayName: 'Fac Marker', tier: 'tier1', coverageNotes: ['markers'] });
    const grant = db.prepare(
      `SELECT COUNT(*) c FROM member_tier_grants WHERE member_id = ? AND reason_code = 'dev_persona_seed.tier_grant'`,
    ).get(p.memberId) as { c: number };
    expect(grant.c).toBe(1);
    const audit = db.prepare(
      `SELECT COUNT(*) c FROM audit_entries WHERE entity_id = ? AND action_type = 'dev_persona_seed'`,
    ).get(p.memberId) as { c: number };
    expect(audit.c).toBe(1);
  });
});

describe('persona harness — single-source containment', () => {
  it('TEST_PERSONA_SEED_PASSWORD_LITERAL appears in exactly one checked-in file: personaSecrets.ts', () => {
    const cmd =
      `grep -r -l --include='*.ts' --include='*.tsx' --include='*.js' ` +
      `--include='*.sh' --include='*.json' --include='*.hbs' ` +
      `--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git ` +
      `--exclude-dir=database --exclude-dir=coverage ` +
      `-F '${TEST_PERSONA_SEED_PASSWORD_LITERAL}' .`;
    let raw = '';
    try {
      raw = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' });
    } catch (err) {
      const e = err as { status?: number };
      if (e.status !== 1) throw err;
    }
    const hits = raw.split('\n').filter((s) => s.length > 0).map((s) => s.replace(/^\.\//, ''));
    expect(hits).toEqual(['src/testkit/personaSecrets.ts']);
  }, 30_000);

  it('the seed runner inherits the production import guard by importing personaSecrets', () => {
    const source = readFileSync(path.resolve(REPO_ROOT, 'src', 'testkit', 'personaSeedRunner.ts'), 'utf8');
    expect(source).toMatch(/from '\.\/personaSecrets'/);
  });
});
