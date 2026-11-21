/**
 * The hourly job that closes registration once an event's cutoff has passed.
 *
 * The contract: every event still open for registration whose cutoff (its
 * registration deadline, or its start date when none is set) is before today
 * moves to closed, the same transition an organizer's close makes. The cutoff
 * day itself is still open. An event already closed, completed or canceled is
 * never touched, so a repeat run changes nothing. No mail is sent. Each
 * transition is one audit row, the system's act, naming the event, the old and
 * new status and the cutoff; the job's run row lists the events it closed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertEvent } from '../fixtures/factories';
import { rowPin, snapshotIds, oneRowAddedSince } from '../fixtures/rowPinning';

const { dbPath } = setTestEnv('4995');

/* eslint-disable @typescript-eslint/consistent-type-imports */
let events: typeof import('../../src/services/eventService');
let registry: typeof import('../../src/testkit/runRegistryJob');
let jobs: typeof import('../../src/services/jobRegistry');
let schedule: typeof import('../../src/lib/jobSchedule');
/* eslint-enable @typescript-eslint/consistent-type-imports */

beforeAll(async () => {
  createTestDb(dbPath).close();
  events = await import('../../src/services/eventService');
  registry = await import('../../src/testkit/runRegistryJob');
  jobs = await import('../../src/services/jobRegistry');
  schedule = await import('../../src/lib/jobSchedule');
});

afterAll(() => cleanupTestDb(dbPath));

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function seed(o: {
  status?: 'reg_open' | 'closed' | 'completed' | 'canceled';
  start: string;
  deadline?: string | null;
}): string {
  return withDb((db) => insertEvent(db, {
    status: o.status ?? 'reg_open',
    start_date: o.start,
    end_date: o.start,
    registration_deadline: o.deadline ?? null,
  }));
}

function statusOf(id: string): string {
  return withDb((db) => (db.prepare('SELECT status FROM events WHERE id = ?').get(id) as { status: string }).status);
}

function auditFor(id: string): Array<{ actor_type: string; actor_member_id: string | null; metadata_json: string }> {
  return withDb((db) => db.prepare(
    `SELECT actor_type, actor_member_id, metadata_json FROM audit_entries
      WHERE action_type = 'event.registration_closed' AND entity_id = ?`,
  ).all(id) as Array<{ actor_type: string; actor_member_id: string | null; metadata_json: string }>);
}

function outboxCount(): number {
  return withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number }).n);
}

// Each case runs on its own far-future year so the events one case seeds are
// not yet due on another case's day.
let yearSeq = 2070;
const nextYear = (): number => { yearSeq += 1; return yearSeq; };

describe('the closing pass', () => {
  // Defect caught: an event whose deadline has passed keeps reading as open,
  // or one still on its last day is closed early, or a past start date with
  // no deadline is never treated as the cutoff.
  it('closes an open event the day after its cutoff, and not on the cutoff day', () => {
    const y = nextYear();
    const pastDeadline = seed({ start: `${y}-06-20`, deadline: `${y}-06-09` });
    const onDeadline = seed({ start: `${y}-06-20`, deadline: `${y}-06-10` });
    const startedNoDeadline = seed({ start: `${y}-06-09` });

    const result = events.eventService.closeDueRegistrations(new Date(`${y}-06-10T12:00:00.000Z`));

    expect(statusOf(pastDeadline)).toBe('closed');
    expect(statusOf(startedNoDeadline)).toBe('closed');
    expect(statusOf(onDeadline)).toBe('reg_open');
    expect([...result.closedEventIds].sort()).toEqual([pastDeadline, startedNoDeadline].sort());
  });

  // Defect caught: the job reopens, rewrites or re-audits an event that is not
  // open, so a repeat run or a finished event changes history.
  it('leaves closed, completed and canceled events alone, and a repeat run changes nothing', () => {
    const y = nextYear();
    const open = seed({ start: `${y}-03-01` });
    const untouched = (['closed', 'completed', 'canceled'] as const).map((status) => ({ status, id: seed({ status, start: `${y}-03-01` }) }));
    const day = new Date(`${y}-03-05T00:30:00.000Z`);

    events.eventService.closeDueRegistrations(day);
    const second = events.eventService.closeDueRegistrations(day);

    expect(second.closedEventIds).toEqual([]);
    expect(auditFor(open)).toHaveLength(1);
    for (const e of untouched) {
      expect(statusOf(e.id), e.status).toBe(e.status);
      expect(auditFor(e.id), e.status).toHaveLength(0);
    }
  });

  // Defect caught: the trail cannot say who closed the event or which cutoff
  // passed, or members are mailed about a change the event page already shows.
  it('audits each close as the system with the cutoff, and sends no mail', () => {
    const y = nextYear();
    const id = seed({ start: `${y}-09-20`, deadline: `${y}-09-01` });
    const mailBefore = outboxCount();

    events.eventService.closeDueRegistrations(new Date(`${y}-09-02T08:00:00.000Z`));

    const [row] = auditFor(id);
    expect(row.actor_type).toBe('system');
    expect(row.actor_member_id).toBeNull();
    expect(JSON.parse(row.metadata_json)).toMatchObject({ before: 'reg_open', after: 'closed', cutoff: `${y}-09-01` });
    expect(outboxCount()).toBe(mailBefore);
  });
});

describe('when the scheduler runs it', () => {
  // Defect caught: the job runs too rarely for "closed within the hour", or
  // on every five-minute tick.
  it('is due an hour after its last success, not before', () => {
    const job = jobs.JOBS.find((j) => j.name === 'SYS_Close_Event_Registration');
    expect(job, 'the job is in the registry').toBeDefined();
    const last = { lastSuccessAt: '2071-01-01T10:00:00.000Z', lastStartedAt: '2071-01-01T10:00:00.000Z' };
    expect(schedule.isJobDue(job!, last, new Date('2071-01-01T10:55:00.000Z'))).toBe(false);
    expect(schedule.isJobDue(job!, last, new Date('2071-01-01T11:00:00.000Z'))).toBe(true);
  });

  // Defect caught: 24 routine successes a day push every daily job out of
  // the administrators' recent-runs list.
  it('counts as a frequent job, so its successes stay out of the recent-runs list', () => {
    expect(jobs.listHighFrequencyJobNames()).toContain('SYS_Close_Event_Registration');
  });
});

describe('the scheduled run', () => {
  const jobRuns = rowPin('system_job_runs', `job_name = 'SYS_Close_Event_Registration'`);

  // Defect caught: the job is missing from the worker's registry, or its run
  // row does not say which events it closed.
  it('runs through its registry entry and records the events it closed', async () => {
    const y = nextYear();
    const id = seed({ start: `${y}-04-10`, deadline: `${y}-04-01` });
    const before = withDb((db) => snapshotIds(db, jobRuns));

    const outcome = await registry.runRegistryJobNow('SYS_Close_Event_Registration', { now: new Date(`${y}-04-02T03:00:00.000Z`) });

    expect(outcome.status).toBe('ran');
    expect(statusOf(id)).toBe('closed');
    const run = withDb((db) => oneRowAddedSince<{ status: string; details_json: string }>(db, jobRuns, before));
    expect(run.status).toBe('succeeded');
    expect(JSON.parse(run.details_json).closedEventIds).toContain(id);
  });
});
