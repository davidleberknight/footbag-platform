/**
 * Schema-level tests for member_onboarding_tasks.
 *
 * Verifies the contract of the table:
 *   - one row per task_type per member accepted (all three valid task_types)
 *   - default state is 'pending' when not supplied
 *   - CHECK enforces task_type enum
 *   - CHECK enforces state enum
 *   - UNIQUE(member_id, task_type) blocks duplicates
 *   - FK to members(id) enforced
 *   - NOT NULL on created_by enforced (row-metadata convention)
 *
 * factory-cannot-express: rows here are written as statements rather than
 * through the shared onboarding factory, and that is the point. The factory
 * inserts with OR IGNORE, which
 * swallows exactly the UNIQUE and CHECK failures these cases assert are thrown,
 * and its enum types cannot express the invalid task_type and state values the
 * refusal cases need. The statement is the subject of the assertion, not test
 * data being seeded.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertClub,
  insertClubLeader,
  insertEvent,
  insertEventOrganizer,
  insertLegacyClubCandidate,
  insertLegacyMember,
  insertLegacyPersonClubAffiliation,
  insertMember,
  insertMemberTierGrant,
  insertOnboardingTask,
} from '../fixtures/factories';

// The held-answer case below drives the onboarding service, which opens the
// database this sets before any module import; the schema cases each build
// their own throwaway database.
const { dbPath: serviceDbPath } = setTestEnv('3248');

const TASK_TYPES = [
  'personal_details',
  'legacy_claim',
  'club_affiliations',
] as const;

// Two states only: a task is outstanding until the member answers it.
const STATES = ['pending', 'completed'] as const;
const REJECTED_STATES = ['in_progress_paused', 'skipped', 'not_applicable', 'bogus'] as const;

const TS = '2026-01-01T00:00:00.000Z';

function insertTask(
  db: BetterSqlite3.Database,
  o: {
    id: string;
    member_id: string;
    task_type: string;
    state?: string | null;
    completed_at?: string | null;
    created_by?: string | null;
  },
) {
  // factory-cannot-express: the shared onboarding factory inserts with OR IGNORE,
  // which swallows exactly the UNIQUE and CHECK failures these cases assert are
  // thrown, and its enum types cannot carry the invalid task_type and state values.
  return db.prepare(`
    INSERT INTO member_onboarding_tasks (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, task_type, state, completed_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, COALESCE(?, 'pending'), ?)
  `).run(
    o.id,
    TS, o.created_by === undefined ? 'system' : o.created_by, TS, 'system',
    o.member_id, o.task_type, o.state ?? null, o.completed_at ?? null,
  );
}

describe('member_onboarding_tasks schema', () => {
  let db: BetterSqlite3.Database;
  let dbPath: string;
  let memberId: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `footbag-test-mot-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    db = createTestDb(dbPath);
    // This suite exercises the raw schema constraints, so the member must
    // start with no task rows at all.
    memberId = insertMember(db, { onboarding: 'none' });
  });

  afterEach(() => {
    db.close();
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('accepts one row per task_type for a member', () => {
    for (const [i, taskType] of TASK_TYPES.entries()) {
      insertTask(db, { id: `mot-${i}`, member_id: memberId, task_type: taskType });
    }
    const rows = db.prepare(
      `SELECT task_type, state, completed_at, version
         FROM member_onboarding_tasks
        WHERE member_id = ?
        ORDER BY task_type`,
    ).all(memberId) as Array<{
      task_type: string;
      state: string;
      completed_at: string | null;
      version: number;
    }>;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(TASK_TYPES).toContain(row.task_type as typeof TASK_TYPES[number]);
      expect(row.state).toBe('pending');
      expect(row.completed_at).toBeNull();
      expect(row.version).toBe(1);
    }
  });

  it('schema default for state is pending when the column is omitted', () => {
    // factory-cannot-express: the point is what the SCHEMA supplies when the
    // column is omitted, so the statement has to omit it. Every factory supplies
    // a state, which would mean asserting the factory's default instead.
    db.prepare(`
      INSERT INTO member_onboarding_tasks (
        id, created_at, created_by, updated_at, updated_by, version,
        member_id, task_type
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run('mot-default-state', TS, 'system', TS, 'system', memberId, 'legacy_claim');
    const row = db.prepare(
      `SELECT state FROM member_onboarding_tasks WHERE id = ?`,
    ).get('mot-default-state') as { state: string };
    expect(row.state).toBe('pending');
  });

  for (const state of STATES) {
    it(`accepts valid state "${state}"`, () => {
      insertTask(db, {
        id: `mot-state-${state}`,
        member_id: memberId,
        task_type: 'legacy_claim',
        state,
      });
      const row = db.prepare(
        `SELECT state FROM member_onboarding_tasks WHERE id = ?`,
      ).get(`mot-state-${state}`) as { state: string };
      expect(row.state).toBe(state);
    });
  }

  for (const state of REJECTED_STATES) {
    it(`refuses state "${state}", which the wizard has no way to write`, () => {
      expect(() => {
        insertTask(db, {
          id: `mot-bad-state-${state}`,
          member_id: memberId,
          task_type: 'legacy_claim',
          state,
        });
      }).toThrow(/CHECK constraint failed/);
    });
  }

  it('UNIQUE(member_id, task_type) blocks a duplicate insert', () => {
    insertTask(db, { id: 'mot-dup-1', member_id: memberId, task_type: 'legacy_claim' });
    expect(() => {
      insertTask(db, { id: 'mot-dup-2', member_id: memberId, task_type: 'legacy_claim' });
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('CHECK constraint rejects out-of-enum task_type', () => {
    expect(() => {
      insertTask(db, { id: 'mot-bad-type', member_id: memberId, task_type: 'bogus' });
    }).toThrow(/CHECK constraint failed/);
  });

  it('CHECK constraint rejects out-of-enum state', () => {
    expect(() => {
      insertTask(db, {
        id: 'mot-bad-state',
        member_id: memberId,
        task_type: 'legacy_claim',
        state: 'in_progress',
      });
    }).toThrow(/CHECK constraint failed/);
  });

  it('NOT NULL constraint rejects null created_by', () => {
    expect(() => {
      insertTask(db, {
        id: 'mot-no-creator',
        member_id: memberId,
        task_type: 'legacy_claim',
        created_by: null,
      });
    }).toThrow(/NOT NULL constraint failed/);
  });

  it('FK to members(id) rejects an unknown member_id', () => {
    expect(() => {
      insertTask(db, {
        id: 'mot-bad-fk',
        member_id: 'does-not-exist',
        task_type: 'legacy_claim',
      });
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('the onboarded-member view counts the same number of tasks the catalog defines', () => {
    // members_onboarded excludes a pending account by requiring every task
    // completed, and it spells that as a literal count. Extending the catalog
    // without updating the view inverts the predicate: a member who completes
    // the new task exceeds the count and vanishes from every member surface,
    // while one who has not yet answered it still appears. Nothing else pins
    // the two together, so this does.
    const viewSql = fs.readFileSync(
      path.join(process.cwd(), 'database', 'schema.sql'),
      'utf8',
    );
    const definition = viewSql.slice(
      viewSql.indexOf('CREATE VIEW members_onboarded'),
      viewSql.indexOf(';', viewSql.indexOf('CREATE VIEW members_onboarded')),
    );
    const counted = definition.match(/state = 'completed'\s*\)\s*=\s*(\d+)/);
    expect(counted, 'members_onboarded must gate on a completed-task count').not.toBeNull();
    expect(Number(counted![1])).toBe(TASK_TYPES.length);
  });

  it('a prospective member is absent from every member view while a finished member beside them is present', () => {
    // A prospective member is not a member. If any of these views reaches one,
    // a half-registered person shows up in member search, as a club's leader,
    // as an event's organizer or on the Official IFPA Roster, and a club or
    // event they alone hold reads as led or run by someone who cannot act.
    const member = insertMember(db, { slug: 'finished-member', login_email: 'finished@example.com' });
    const pending = insertMember(db, {
      slug: 'pending-registrant', login_email: 'pending@example.com', onboarding: 'none',
    });
    // Two of three steps done is still pending: membership needs every one.
    const partway = insertMember(db, {
      slug: 'partway-registrant', login_email: 'partway@example.com', onboarding: 'none',
    });
    insertOnboardingTask(db, partway, 'personal_details', 'completed');
    insertOnboardingTask(db, partway, 'legacy_claim', 'completed');
    insertOnboardingTask(db, partway, 'club_affiliations', 'pending');
    const club = insertClub(db);
    const otherClub = insertClub(db);
    const thirdClub = insertClub(db);
    const event = insertEvent(db);
    for (const [memberId, clubId] of [[member, club], [pending, otherClub], [partway, thirdClub]] as const) {
      insertClubLeader(db, { club_id: clubId, member_id: memberId });
      insertEventOrganizer(db, event, memberId);
      insertMemberTierGrant(db, { member_id: memberId, new_tier_status: 'tier1' });
    }

    const views: Array<[string, string]> = [
      ['members_onboarded', 'id'],
      ['members_searchable', 'id'],
      ['club_leaders_current', 'member_id'],
      ['event_organizers_current', 'member_id'],
      ['official_ifpa_roster_current', 'member_id'],
    ];
    for (const [view, column] of views) {
      const ids = (db.prepare(`SELECT ${column} AS id FROM ${view}`).all() as { id: string }[])
        .map((r) => r.id);
      expect(ids, `${view} must include the finished member`).toContain(member);
      expect(ids, `${view} must exclude the prospective member`).not.toContain(pending);
      expect(ids, `${view} must exclude a registrant partway through onboarding`).not.toContain(partway);
    }
  });
});

describe('member_onboarding_tasks.answer_json once onboarding completes', () => {
  let db: BetterSqlite3.Database;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;

  beforeAll(async () => {
    db = createTestDb(serviceDbPath);
    svc = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
  });

  afterAll(() => {
    db.close();
    cleanupTestDb(serviceDbPath);
  });

  it('is NULL on every task row of a member who finished through the wizard', async () => {
    // Defect caught: completion writes the held claim and club answers but
    // leaves them on the task rows, so a member keeps answers that a later
    // replay would apply a second time, and personal answers outlive the
    // purpose they were held for.
    const email = 'held-schema-claimant@example.com';
    const legacyId = insertLegacyMember(db, { real_name: 'Ada Heldschema', legacy_email: email });
    const club = insertClub(db, { city: 'Iotaville' });
    const candidate = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: club });
    const card = insertLegacyPersonClubAffiliation(db, {
      legacy_member_id: legacyId, legacy_club_candidate_id: candidate, inferred_role: 'member',
    });
    const memberId = insertMember(db, {
      onboarding: 'none', real_name: 'Ada Heldschema', login_email: email, birth_date: '1975-06-12',
    });
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');

    const heldRows = () => (db.prepare(
      'SELECT task_type FROM member_onboarding_tasks WHERE member_id = ? AND answer_json IS NOT NULL ORDER BY task_type',
    ).all(memberId) as { task_type: string }[]).map((r) => r.task_type);

    expect(svc.processClaimCandidate(memberId, { accountId: legacyId, recordId: null }, '10.8.0.1', false).kind)
      .toBe('advance');
    // The claim is held while the member is still signing up: the positive
    // control that the column carries answers before completion.
    expect(heldRows()).toEqual(['legacy_claim']);

    const last = await svc.processClubAffiliationsSubmit(memberId, {
      kind: 'membership', candidateId: card, userDecision: 'confirm', activitySignal: 'active',
    });
    expect(last.kind).toBe('advance');
    expect(svc.isOnboardingComplete(memberId)).toBe(true);
    // The answers landed, so their release is not an answer thrown away.
    expect((db.prepare('SELECT legacy_member_id FROM members WHERE id = ?').get(memberId) as {
      legacy_member_id: string | null;
    }).legacy_member_id).toBe(legacyId);

    const rows = db.prepare(
      'SELECT task_type, answer_json FROM member_onboarding_tasks WHERE member_id = ? ORDER BY task_type',
    ).all(memberId) as { task_type: string; answer_json: string | null }[];
    expect(rows.map((r) => r.task_type)).toEqual(['club_affiliations', 'legacy_claim', 'personal_details']);
    expect(heldRows()).toEqual([]);
  });
});
