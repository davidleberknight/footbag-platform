/**
 * The pre-event reminder job: every confirmed registrant on an event still
 * running registration or closed to it is reminded once, from the configured
 * number of days before the start until the day before it, in the
 * confirmation's own words, as transactional mail.
 *
 * Isolation: the sent ledger is append-only, so each case seeds its own event
 * in a calendar year of its own and passes an injected `now` in that year, and
 * every assertion is scoped to the case's own registration or member.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { expectLoggedError } from '../setup-env';
import {
  insertMember,
  insertEvent,
  insertDiscipline,
  insertRegistration,
  insertRegistrationDisciplineSelection,
  insertEventRegistrationReminderSent,
  insertSystemConfig,
} from '../fixtures/factories';
import { rowPin, snapshotIds, oneRowAddedSince } from '../fixtures/rowPinning';

const { dbPath } = setTestEnv('4990');

/* eslint-disable @typescript-eslint/consistent-type-imports */
let reminders: typeof import('../../src/services/eventRegistrationReminderService');
let registry: typeof import('../../src/testkit/runRegistryJob');
/* eslint-enable @typescript-eslint/consistent-type-imports */

beforeAll(async () => {
  createTestDb(dbPath).close();
  reminders = await import('../../src/services/eventRegistrationReminderService');
  registry = await import('../../src/testkit/runRegistryJob');
});

afterAll(() => cleanupTestDb(dbPath));

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

let year = 2060;
let seq = 0;

interface Seeded {
  memberId: string;
  eventId: string;
  registrationId: string;
  startDate: string;
}

interface SeedOpts {
  startDate: string;
  eventStatus?: 'draft' | 'pending_approval' | 'reg_open' | 'closed' | 'completed' | 'canceled';
  registrationStatus?: 'pending' | 'confirmed' | 'canceled';
  deceased?: boolean;
}

function seed(opts: SeedOpts): Seeded {
  seq += 1;
  return withDb((db) => {
    const memberId = insertMember(db, {
      id: `err-member-${seq}`,
      slug: `err_member_${seq}`,
      login_email: `err-member-${seq}@example.test`,
      is_deceased: opts.deceased ? 1 : 0,
    });
    const eventId = insertEvent(db, {
      title: `Reminder Open ${seq}`,
      start_date: opts.startDate,
      end_date: opts.startDate,
      status: opts.eventStatus ?? 'reg_open',
    });
    const divisionId = insertDiscipline(db, eventId, { name: `Open Singles Net ${seq}` });
    const registrationId = insertRegistration(db, eventId, memberId, {
      status: opts.registrationStatus ?? 'confirmed',
      tshirt_size: 'M',
    });
    insertRegistrationDisciplineSelection(db, registrationId, divisionId);
    return { memberId, eventId, registrationId, startDate: opts.startDate };
  });
}

interface OutboxRow {
  recipient_email: string;
  mailing_list_id: string | null;
  stream: string;
  template_key: string;
  body_text: string;
}

function outboxFor(memberId: string): OutboxRow[] {
  return withDb((db) => db.prepare(`
    SELECT recipient_email, mailing_list_id, stream, template_key, body_text
    FROM outbox_emails WHERE recipient_member_id = ?
  `).all(memberId) as OutboxRow[]);
}

function ledgerFor(registrationId: string): string[] {
  return withDb((db) => (db.prepare(`
    SELECT event_start_date FROM event_registration_reminder_sent
    WHERE registration_id = ? ORDER BY event_start_date
  `).all(registrationId) as Array<{ event_start_date: string }>).map((r) => r.event_start_date));
}

/** A fresh year, the event starting on 10 May and `now` on the given May day. */
function nextYear(): { start: string; at: (day: string) => Date } {
  const y = year++;
  return {
    start: `${y}-05-10`,
    at: (day: string) => new Date(`${y}-05-${day}T12:00:00.000Z`),
  };
}

describe('the reminder pass', () => {
  it('reminds a confirmed registrant once inside the window, as transactional mail naming what they entered', () => {
    const y = nextYear();
    const s = seed({ startDate: y.start });

    const first = reminders.runDailyPass({ now: y.at('04') });

    // A registrant never reminded, or reminded with nothing about their entry, misses the promise of the story.
    const rows = outboxFor(s.memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].template_key).toBe('event_registration_reminder');
    expect(rows[0].recipient_email).toBe(`err-member-${seq}@example.test`);
    expect(rows[0].body_text).toContain(`Reminder Open ${seq}`);
    expect(rows[0].body_text).toContain(`Open Singles Net ${seq}`);
    // A reminder sent on a mailing list would be silenced by an unrelated unsubscribe.
    expect(rows[0].mailing_list_id).toBeNull();
    expect(rows[0].stream).toBe('transactional');
    expect(ledgerFor(s.registrationId)).toEqual([y.start]);
    expect(first.reminders_enqueued).toBeGreaterThanOrEqual(1);

    // A second pass the same day or later in the window would remind the member twice.
    reminders.runDailyPass({ now: y.at('04') });
    reminders.runDailyPass({ now: y.at('08') });
    expect(outboxFor(s.memberId)).toHaveLength(1);
  });

  it('sends nothing before the window opens, still sends after a missed day, and nothing from the start date on', () => {
    const early = nextYear();
    const a = seed({ startDate: early.start });
    // Eight days out with the default seven: an early reminder would arrive before the setting says.
    reminders.runDailyPass({ now: early.at('02') });
    expect(outboxFor(a.memberId)).toHaveLength(0);
    // The day before the start, the first pass to run in the window still reminds.
    reminders.runDailyPass({ now: early.at('09') });
    expect(outboxFor(a.memberId)).toHaveLength(1);

    const late = nextYear();
    const b = seed({ startDate: late.start });
    // A reminder on the day itself, or after, is no reminder.
    reminders.runDailyPass({ now: late.at('10') });
    reminders.runDailyPass({ now: late.at('11') });
    expect(outboxFor(b.memberId)).toHaveLength(0);
    expect(ledgerFor(b.registrationId)).toEqual([]);
  });

  it('reminds again when the event moves to a new start date', () => {
    const y = nextYear();
    const s = seed({ startDate: y.start });
    reminders.runDailyPass({ now: y.at('05') });
    const moved = `${y.start.slice(0, 4)}-05-20`;
    withDb((db) => db.prepare('UPDATE events SET start_date = ?, end_date = ? WHERE id = ?').run(moved, moved, s.eventId));

    // Registrants of a postponed event would otherwise not be reminded of the new date.
    reminders.runDailyPass({ now: new Date(`${moved.slice(0, 4)}-05-15T12:00:00.000Z`) });
    expect(outboxFor(s.memberId)).toHaveLength(2);
    expect(ledgerFor(s.registrationId)).toEqual([y.start, moved]);
  });

  it('reminds only confirmed registrations on events open or closed to registration, and never a deceased member', () => {
    const y = nextYear();
    const live = seed({ startDate: y.start });
    const closed = seed({ startDate: y.start, eventStatus: 'closed' });
    const pending = seed({ startDate: y.start, registrationStatus: 'pending' });
    const canceledReg = seed({ startDate: y.start, registrationStatus: 'canceled' });
    const canceledEvent = seed({ startDate: y.start, eventStatus: 'canceled' });
    const draft = seed({ startDate: y.start, eventStatus: 'draft' });
    const deceased = seed({ startDate: y.start, deceased: true });

    const result = reminders.runDailyPass({ now: y.at('06') });

    // The positive controls: a live registrant on an open or a closed event is reminded.
    expect(outboxFor(live.memberId)).toHaveLength(1);
    expect(outboxFor(closed.memberId)).toHaveLength(1);
    // Each of these would be mail about a place the member does not hold or an event not happening.
    for (const [label, s] of Object.entries({ pending, canceledReg, canceledEvent, draft, deceased })) {
      expect(outboxFor(s.memberId), label).toHaveLength(0);
      expect(ledgerFor(s.registrationId), label).toEqual([]);
    }
    expect(result.skipped_deceased).toBe(1);
  });

  it('does not send twice when the ledger already holds the reminder', () => {
    const y = nextYear();
    const s = seed({ startDate: y.start });
    withDb((db) => insertEventRegistrationReminderSent(db, s.registrationId, { event_start_date: y.start }));

    // A reminder recorded on an earlier pass and sent again would reach the member twice.
    reminders.runDailyPass({ now: y.at('06') });
    expect(outboxFor(s.memberId)).toHaveLength(0);
  });

  it('rolls back a failed send so the next pass retries it, and serves the other registrants meanwhile', async () => {
    expectLoggedError('SYS_Send_Event_Registration_Reminders: candidate failed');
    const { emailService } = await import('../../src/services/emailService');
    const y = nextYear();
    const failing = seed({ startDate: y.start });
    const other = seed({ startDate: y.start });
    const realSend = emailService.send.bind(emailService);
    const spy = vi.spyOn(emailService, 'send').mockImplementation((input) => {
      if (input.recipientMemberId === failing.memberId) throw new Error('outbox unavailable');
      return realSend(input);
    });
    let first: ReturnType<typeof reminders.runDailyPass>;
    try {
      first = reminders.runDailyPass({ now: y.at('06') });
    } finally {
      spy.mockRestore();
    }

    // A ledger row left behind by a failed send would mark the reminder sent when it never was.
    expect(first.failed).toBe(1);
    expect(ledgerFor(failing.registrationId)).toEqual([]);
    expect(outboxFor(failing.memberId)).toHaveLength(0);
    // One failure aborting the pass would leave every later registrant unreminded.
    expect(outboxFor(other.memberId)).toHaveLength(1);

    reminders.runDailyPass({ now: y.at('07') });
    expect(outboxFor(failing.memberId)).toHaveLength(1);
  });
});

describe('the scheduled run', () => {
  const jobRuns = rowPin('system_job_runs', `job_name = 'SYS_Send_Event_Registration_Reminders'`);

  it('runs through its registry entry and records the counts on its run row', async () => {
    const y = nextYear();
    const s = seed({ startDate: y.start });
    const before = withDb((db) => snapshotIds(db, jobRuns));

    const outcome = await registry.runRegistryJobNow('SYS_Send_Event_Registration_Reminders', { now: y.at('05') });

    // A job missing from the registry would never run on the worker at all.
    expect(outcome.status).toBe('ran');
    expect(outboxFor(s.memberId)).toHaveLength(1);
    const run = withDb((db) => oneRowAddedSince<{ status: string; details_json: string }>(db, jobRuns, before));
    expect(run.status).toBe('succeeded');
    // An operator reading the run row could not tell a quiet day from a broken one without the counts.
    expect(JSON.parse(run.details_json)).toMatchObject({ reminders_enqueued: 1, failed: 0 });
  });

  it('reads the administrator setting for the length of the window', () => {
    // Runs last in the file: the setting it writes applies to every later pass.
    const y = nextYear();
    const s = seed({ startDate: y.start });
    withDb((db) => insertSystemConfig(db, { config_key: 'event_registration_reminder_days', value_json: '2' }));

    // An administrator's shorter setting ignored would remind members earlier than IFPA chose.
    reminders.runDailyPass({ now: y.at('07') });
    expect(outboxFor(s.memberId)).toHaveLength(0);
    reminders.runDailyPass({ now: y.at('08') });
    expect(outboxFor(s.memberId)).toHaveLength(1);
  });
});
