/**
 * Integration tests for the wizard's detour-pause + dashboard-widget
 * service contract.
 *
 * Covers:
 *   - transitionToDetourPaused writes state='in_progress_paused' + audit
 *     with target_story + source_card metadata.
 *   - getDashboardTaskWidget splits tasks by state and reconstructs the
 *     resumeUrl from the latest detour audit per paused task.
 *   - Re-pause after resume: the latest audit wins.
 *   - completed tasks cannot be paused (no-op).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertAuditEntry } from '../fixtures/factories';

const { dbPath } = setTestEnv('3161');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;

interface TaskRow {
  state: string;
  completed_at: string | null;
}

interface AuditRow {
  action_type: string;
  entity_id: string;
  metadata_json: string;
  occurred_at: string;
}

function readTask(memberId: string, taskType: string): TaskRow | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare(
      `SELECT state, completed_at FROM member_onboarding_tasks
        WHERE member_id = ? AND task_type = ?`,
    )
    .get(memberId, taskType) as TaskRow | undefined;
  db.close();
  return row;
}

function readDetourAudits(memberId: string): AuditRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT action_type, entity_id, metadata_json, occurred_at
         FROM audit_entries
        WHERE actor_member_id = ?
          AND action_type = 'wizard.task.detour_paused'
        ORDER BY rowid`,
    )
    .all(memberId) as AuditRow[];
  db.close();
  return rows;
}

const MEMBER_PAUSE         = 'member-detour-pause';
const MEMBER_COMPLETED     = 'member-detour-completed';
const MEMBER_WIDGET        = 'member-detour-widget';
const MEMBER_REPAUSE       = 'member-detour-repause';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const id of [MEMBER_PAUSE, MEMBER_COMPLETED, MEMBER_WIDGET, MEMBER_REPAUSE]) {
    insertMember(db, { id, slug: id.replace(/-/g, '_'), login_email: `${id}@example.com` });
  }
  db.close();

  const mod = await import('../../src/services/memberOnboardingService');
  svc = mod.memberOnboardingService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('memberOnboardingService.transitionToDetourPaused', () => {
  it('sets state to in_progress_paused and writes a detour audit row', () => {
    svc.startTaskList(MEMBER_PAUSE);
    svc.transitionToDetourPaused(MEMBER_PAUSE, 'club_affiliations', 'M_Create_Club', 'card_club_affiliations');

    const task = readTask(MEMBER_PAUSE, 'club_affiliations');
    expect(task?.state).toBe('in_progress_paused');
    expect(task?.completed_at).toBeNull();

    const audits = readDetourAudits(MEMBER_PAUSE);
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(audits[0].metadata_json);
    expect(meta).toMatchObject({
      task_type:    'club_affiliations',
      target_story: 'M_Create_Club',
      source_card:  'card_club_affiliations',
    });
  });

  it('is a no-op on a completed task', () => {
    svc.startTaskList(MEMBER_COMPLETED);
    svc.completeTask(MEMBER_COMPLETED, 'club_affiliations');
    const beforeState = readTask(MEMBER_COMPLETED, 'club_affiliations')?.state;
    expect(beforeState).toBe('completed');

    const beforeAudits = readDetourAudits(MEMBER_COMPLETED).length;
    svc.transitionToDetourPaused(MEMBER_COMPLETED, 'club_affiliations', 'M_Create_Club', 'some_card');

    const afterState = readTask(MEMBER_COMPLETED, 'club_affiliations')?.state;
    expect(afterState).toBe('completed');
    const afterAudits = readDetourAudits(MEMBER_COMPLETED).length;
    expect(afterAudits).toBe(beforeAudits);
  });
});

describe('memberOnboardingService.getDashboardTaskWidget', () => {
  it('returns empty buckets for a member with no tasks', () => {
    const widget = svc.getDashboardTaskWidget('non-existent-member');
    expect(widget).toEqual({
      pending: [], paused: [], skipped: [],
      hasOutstanding: false,
    });
  });

  it('splits a member tasks into pending / paused / completed with resumeUrl on paused', () => {
    svc.startTaskList(MEMBER_WIDGET);
    svc.completeTask(MEMBER_WIDGET, 'personal_details');
    svc.transitionToDetourPaused(
      MEMBER_WIDGET,
      'club_affiliations',
      'M_Create_Club',
      'card_club_affiliations',
    );

    const widget = svc.getDashboardTaskWidget(MEMBER_WIDGET);

    expect(widget.paused.map((t) => t.taskType)).toContain('club_affiliations');
    // legacy_claim stays pending.
    // personal_details is completed, so it does not appear in any bucket.
    expect(widget.pending.map((t) => t.taskType).sort()).toEqual(
      ['legacy_claim'].sort(),
    );

    const paused = widget.paused.find((t) => t.taskType === 'club_affiliations')!;
    expect(paused.state).toBe('in_progress_paused');
    expect(paused.targetStory).toBe('M_Create_Club');
    expect(paused.sourceCard).toBe('card_club_affiliations');
    expect(paused.resumeUrl).toBe('/register/wizard/club_affiliations');
    expect(paused.taskLabel).toBe('Club affiliation');
    expect(paused.ctaLabel).toBe('Resume Onboarding');
    expect(paused.ctaHref).toBe('/register/wizard/club_affiliations');

    const pendingLegacy = widget.pending.find((t) => t.taskType === 'legacy_claim')!;
    expect(pendingLegacy.taskLabel).toBe('Find your past records');
    expect(pendingLegacy.ctaLabel).toBe('Continue Onboarding');
    expect(pendingLegacy.ctaHref).toBe('/register/wizard/legacy_claim');

    expect(widget.hasOutstanding).toBe(true);
  });

  it('re-pause uses the most recent detour audit metadata', () => {
    svc.startTaskList(MEMBER_REPAUSE);
    svc.transitionToDetourPaused(
      MEMBER_REPAUSE,
      'club_affiliations',
      'M_Create_Club',
      'card_first',
    );
    // Resume by re-starting (state -> pending) and then pause again with a new target.
    svc.startTask(MEMBER_REPAUSE, 'club_affiliations');
    svc.transitionToDetourPaused(
      MEMBER_REPAUSE,
      'club_affiliations',
      'M_Join_Club',
      'card_second',
    );

    const widget = svc.getDashboardTaskWidget(MEMBER_REPAUSE);
    const paused = widget.paused.find((t) => t.taskType === 'club_affiliations')!;
    expect(paused.targetStory).toBe('M_Join_Club');
    expect(paused.sourceCard).toBe('card_second');
  });

  it('malformed JSON in detour metadata: widget renders without crashing; resumeUrl falls back to bare task URL (D3)', () => {
    const MEMBER_MALFORMED = 'member-detour-malformed';
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: MEMBER_MALFORMED,
      slug: 'member_detour_malformed',
      login_email: 'detour_malformed@example.com',
    });
    db.close();

    svc.startTaskList(MEMBER_MALFORMED);

    // Skip the service-side transitionToDetourPaused (which writes valid JSON)
    // and seed the state directly: mark the task as in_progress_paused and
    // INSERT an audit row with malformed metadata_json. Simulates either
    // future schema drift or a manually-replayed audit replication that
    // dropped JSON validity. audit_entries is append-only; only INSERTs work.
    const dbw = new BetterSqlite3(dbPath);
    // Get the task row id.
    const taskRow = dbw.prepare(
      `SELECT id FROM member_onboarding_tasks
        WHERE member_id = ? AND task_type = 'club_affiliations'`,
    ).get(MEMBER_MALFORMED) as { id: string };
    // Force task state to in_progress_paused so the widget classifies it.
    dbw.prepare(
      `UPDATE member_onboarding_tasks SET state = 'in_progress_paused' WHERE id = ?`,
    ).run(taskRow.id);
    // Insert audit row with malformed metadata. metadata_json column has
    // no JSON CHECK so this is accepted at the storage layer; the factory's
    // metadata_json_raw hatch writes the invalid string verbatim.
    insertAuditEntry(dbw, {
      id: 'audit-malformed-d3',
      created_by: 'test',
      actor_type: 'member',
      actor_member_id: MEMBER_MALFORMED,
      action_type: 'wizard.task.detour_paused',
      entity_type: 'member_onboarding_task',
      entity_id: taskRow.id,
      category: 'onboarding',
      metadata_json_raw: '{this is { not json',
    });
    dbw.close();

    // Widget call MUST NOT throw. The JSON.parse catch swallows the bad
    // metadata so targetStory and sourceCard remain null; resumeUrl still
    // points at the bare task GET so the Resume CTA lands somewhere real
    // even when the detour context is unreadable.
    const widget = svc.getDashboardTaskWidget(MEMBER_MALFORMED);
    const paused = widget.paused.find((t) => t.taskType === 'club_affiliations')!;
    expect(paused).toBeDefined();
    expect(paused.state).toBe('in_progress_paused');
    expect(paused.resumeUrl).toBe('/register/wizard/club_affiliations');
    expect(paused.targetStory).toBeNull();
    expect(paused.sourceCard).toBeNull();
  });
});
