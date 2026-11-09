/**
 * What the platform records when the monitoring service reports an alarm: a
 * state change records an active alarm at critical severity, a lost-data
 * notification records one at warning severity, and a return-to-normal
 * notification clears the newest uncleared alarm of that name. Every
 * notification is processed exactly once, keyed on its message identifier,
 * because the queue it arrives on promises at-least-once delivery. A
 * subscription confirmation is recorded for out-of-band action and its one-time
 * URL is never stored.
 *
 * These drive the service with the envelope a notification carries. The
 * transport is a queue the worker polls: the read is authorized by the runtime
 * role and the publishing topic is checked before anything is dispatched here.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertSystemAlarmEvent } from '../fixtures/factories';

const { dbPath } = setTestEnv('4070');

let alarmService: typeof import('../../src/services/systemAlarmService')['systemAlarmService'];

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

interface AlarmRow {
  id: string;
  alarm_type: string;
  severity: string;
  raised_at: string;
  cleared_at: string | null;
  status: string;
  details_json: string;
}

function alarms(): AlarmRow[] {
  return withDb((db) => db.prepare(`
    SELECT id, alarm_type, severity, raised_at, cleared_at, status, details_json
    FROM system_alarm_events ORDER BY raised_at
  `).all() as AlarmRow[]);
}

function auditCount(actionType: string): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = ?',
  ).get(actionType) as { n: number }).n);
}

function claimedMessageIds(): string[] {
  return withDb((db) => (db.prepare(
    'SELECT message_id FROM sns_alarm_events',
  ).all() as Array<{ message_id: string }>).map((r) => r.message_id));
}

function envelope(message: Record<string, unknown>, messageId?: string): string {
  const env: Record<string, unknown> = {
    Type: 'Notification',
    TopicArn: 'arn:aws:sns:us-east-1:000:alarms',
    Message: JSON.stringify(message),
  };
  if (messageId !== undefined) env.MessageId = messageId;
  return JSON.stringify(env);
}

function stateChange(
  alarmName: string,
  newState: string,
  opts: { messageId?: string; reason?: string; at?: string } = {},
): string {
  return envelope({
    AlarmName: alarmName,
    NewStateValue: newState,
    NewStateReason: opts.reason ?? `Threshold crossed for ${alarmName}`,
    AlarmDescription: 'A monitored condition',
    StateChangeTime: opts.at ?? '2026-08-19T03:22:45.123+0000',
    Region: 'US East (N. Virginia)',
  }, opts.messageId);
}

/** The monitoring service's change time for the nth change in a sequence, in its own format. */
const at = (n: number) => `2026-08-19T03:22:${String(10 + n).padStart(2, '0')}.000+0000`;

/** Hands the service one envelope, the way the feed loop does. */
function deliver(body: string) {
  return alarmService.processSnsMessage(body);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: 'aw_admin', slug: 'aw_admin', login_email: 'aw-admin@example.com', is_admin: 1 });
  db.exec(`DROP TRIGGER IF EXISTS trg_audit_no_update; DROP TRIGGER IF EXISTS trg_audit_no_delete;`);
  db.close();
  ({ systemAlarmService: alarmService } = await import('../../src/services/systemAlarmService'));
});

afterAll(() => {
  cleanupTestDb(dbPath);
});

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM system_alarm_events').run();
    db.prepare('DELETE FROM sns_alarm_events').run();
    db.prepare('DELETE FROM audit_entries').run();
  });
});

describe('recording alarm state changes', () => {
  it('records an alarm state as an active critical alarm with the reason given', () => {
    deliver(stateChange('footbag-prod-high-cpu', 'ALARM', {
      messageId: 'msg-1', reason: 'CPU above 85% for 3 minutes',
    }));

    const rows = alarms();
    expect(rows).toHaveLength(1);
    expect(rows[0].alarm_type).toBe('footbag-prod-high-cpu');
    expect(rows[0].severity).toBe('critical');
    expect(rows[0].status).toBe('active');
    expect(rows[0].cleared_at).toBeNull();
    expect(JSON.parse(rows[0].details_json).reason).toBe('CPU above 85% for 3 minutes');
    // The alarm table is the record; a second copy in the audit log would only
    // bury the administrator's acknowledgements among machine events.
    expect(auditCount('alarm.raised')).toBe(0);
  });

  it('records a lost-data state as a warning rather than a critical alarm', () => {
    deliver(stateChange('footbag-prod-high-disk', 'INSUFFICIENT_DATA', { messageId: 'msg-2' }));
    const rows = alarms();
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('warning');
    expect(rows[0].status).toBe('active');
  });

  it("normalizes the monitoring timestamp so it sorts against the platform's own timestamps", () => {
    deliver(stateChange('footbag-prod-tz', 'ALARM', {
      messageId: 'msg-3', at: '2026-08-19T03:22:45.123+0000',
    }));
    expect(alarms()[0].raised_at).toBe('2026-08-19T03:22:45.123Z');
  });

  it('falls back to the current time when the payload carries no usable timestamp', () => {
    deliver(stateChange('footbag-prod-badtime', 'ALARM', { messageId: 'msg-4', at: 'not a time' }));
    const raisedAt = alarms()[0].raised_at;
    expect(raisedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(new Date(raisedAt).getTime())).toBe(false);
  });
});

describe('an alarm that fires again before it clears', () => {
  // The monitoring source is a state machine with one state per alarm, and a
  // return to normal is a single notification. A second row for the same name
  // would therefore never receive a clear of its own and would hold the
  // dashboard badge up for good.
  it('keeps one open record per alarm name through a flap, and a return to normal ends it', () => {
    deliver(stateChange('footbag-prod-errors', 'ALARM', { messageId: 'flap-1', at: at(1) }));
    deliver(stateChange('footbag-prod-errors', 'INSUFFICIENT_DATA', { messageId: 'flap-2', at: at(2) }));

    const open = alarms().filter((a) => a.cleared_at === null);
    expect(open).toHaveLength(1);
    // The record carries the newest state the monitor reported.
    expect(open[0].severity).toBe('warning');

    deliver(stateChange('footbag-prod-errors', 'OK', { messageId: 'flap-3', at: at(3) }));
    expect(alarms().filter((a) => a.cleared_at === null)).toHaveLength(0);
  });
});

describe('notifications that arrive out of order', () => {
  // The queue does not keep order, so an alarm's return to normal can arrive
  // before the alarm itself, and nothing redelivers a message once handled.
  // What decides is the monitoring service's own change time.

  it('a return to normal that arrives before its raise leaves no active alarm', () => {
    // Defect caught: the late raise opening an alarm nothing will ever clear,
    // holding the admin banner up while the monitoring service reads normal.
    expect(deliver(stateChange('footbag-prod-late', 'OK', { messageId: 'early-ok', at: at(2) })))
      .toEqual({ status: 'ignored', reason: 'nothing_to_clear' });
    expect(deliver(stateChange('footbag-prod-late', 'ALARM', { messageId: 'late-raise', at: at(1) })))
      .toEqual({ status: 'ignored', reason: 'stale' });

    expect(alarms().filter((a) => a.alarm_type === 'footbag-prod-late')).toHaveLength(0);
    // Both are recorded, so a redelivery of either is still a duplicate.
    expect(claimedMessageIds().sort()).toEqual(['early-ok', 'late-raise']);
  });

  it('a late raise after an alarm has already been raised and cleared reopens nothing', () => {
    // Defect caught: the out-of-order copy of an earlier raise reopening the
    // incident the return to normal ended.
    deliver(stateChange('footbag-prod-reopen', 'ALARM', { messageId: 'r-1', at: at(1) }));
    deliver(stateChange('footbag-prod-reopen', 'OK', { messageId: 'r-3', at: at(3) }));
    deliver(stateChange('footbag-prod-reopen', 'INSUFFICIENT_DATA', { messageId: 'r-2', at: at(2) }));
    const rows = alarms().filter((a) => a.alarm_type === 'footbag-prod-reopen');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('cleared');
  });

  it('an older raise arriving after a newer one does not overwrite the newer state', () => {
    // Defect caught: the alarm shown at the severity and raise time of a state
    // the monitoring service has already moved past.
    deliver(stateChange('footbag-prod-order', 'INSUFFICIENT_DATA', { messageId: 'o-2', at: at(2) }));
    deliver(stateChange('footbag-prod-order', 'ALARM', { messageId: 'o-1', at: at(1) }));
    const open = alarms().filter((a) => a.alarm_type === 'footbag-prod-order');
    expect(open).toHaveLength(1);
    expect(open[0].severity).toBe('warning');
    expect(open[0].raised_at).toBe('2026-08-19T03:22:12.000Z');
  });

  it('a raise and a return to normal recorded in the same instant end cleared, whichever arrives first', () => {
    // Defect caught: a tie read as "the last to arrive wins", so a test pair
    // leaves the alarm open on one delivery order and not the other.
    deliver(stateChange('footbag-prod-tie-a', 'OK', { messageId: 'ta-ok', at: at(5) }));
    deliver(stateChange('footbag-prod-tie-a', 'ALARM', { messageId: 'ta-alarm', at: at(5) }));
    deliver(stateChange('footbag-prod-tie-b', 'ALARM', { messageId: 'tb-alarm', at: at(5) }));
    deliver(stateChange('footbag-prod-tie-b', 'OK', { messageId: 'tb-ok', at: at(5) }));
    expect(alarms().filter((a) => a.status === 'active')).toHaveLength(0);
  });

  it('a real recurrence, newer than the return to normal, is raised afresh', () => {
    // Defect caught: the ordering check swallowing a genuine new incident
    // because an earlier clear for the same alarm is on record.
    deliver(stateChange('footbag-prod-recur', 'OK', { messageId: 'rc-ok', at: at(1) }));
    deliver(stateChange('footbag-prod-recur', 'ALARM', { messageId: 'rc-alarm', at: at(2) }));
    expect(alarms().filter((a) => a.alarm_type === 'footbag-prod-recur' && a.status === 'active')).toHaveLength(1);
  });

  it('the ordering is per alarm: a newer change of one alarm does not make another alarm stale', () => {
    // Defect caught: one alarm's clear silencing a different alarm's raise.
    deliver(stateChange('footbag-prod-one', 'OK', { messageId: 'p-one', at: at(9) }));
    deliver(stateChange('footbag-prod-two', 'ALARM', { messageId: 'p-two', at: at(1) }));
    expect(alarms().filter((a) => a.alarm_type === 'footbag-prod-two' && a.status === 'active')).toHaveLength(1);
  });
});

describe('clearing an alarm', () => {
  it('clears the newest uncleared alarm of that name and leaves other alarms alone', async () => {
    const other = withDb((db) => insertSystemAlarmEvent(db, { alarm_type: 'footbag-other', status: 'active' }));
    deliver(stateChange('footbag-prod-backlog', 'ALARM', { messageId: 'raise-1', at: at(1) }));

    deliver(stateChange('footbag-prod-backlog', 'OK', { messageId: 'clear-1', at: at(2) }));

    const rows = alarms();
    const backlog = rows.find((r) => r.alarm_type === 'footbag-prod-backlog')!;
    expect(backlog.status).toBe('cleared');
    expect(backlog.cleared_at).not.toBeNull();
    expect(rows.find((r) => r.id === other)!.status).toBe('active');
    expect(auditCount('alarm.cleared')).toBe(0);
  });

  it('clears an alarm an administrator had already acknowledged, since the condition is what ends it', async () => {
    const id = withDb((db) => insertSystemAlarmEvent(db, {
      alarm_type: 'footbag-prod-acked', status: 'acknowledged',
      acknowledged_by_member_id: 'aw_admin', acknowledged_at: '2026-08-19T01:00:00.000Z',
    }));
    deliver(stateChange('footbag-prod-acked', 'OK', { messageId: 'clear-2' }));
    const row = alarms().find((r) => r.id === id)!;
    expect(row.status).toBe('cleared');
    expect(row.cleared_at).not.toBeNull();
  });

  it('accepts a return-to-normal for an alarm it never recorded, writing nothing', () => {
    deliver(stateChange('footbag-prod-unknown', 'OK', { messageId: 'clear-3' }));
    expect(alarms()).toHaveLength(0);
  });
});

describe('processing each notification exactly once', () => {
  it('a redelivered alarm notification does not record a second alarm', () => {
    deliver(stateChange('footbag-prod-dup', 'ALARM', { messageId: 'dup-1' }));
    deliver(stateChange('footbag-prod-dup', 'ALARM', { messageId: 'dup-1' }));
    expect(alarms()).toHaveLength(1);
    expect(claimedMessageIds()).toEqual(['dup-1']);
  });

  it('a redelivered return-to-normal does not clear a second time', () => {
    deliver(stateChange('footbag-prod-dupclear', 'ALARM', { messageId: 'dupc-raise', at: at(1) }));
    deliver(stateChange('footbag-prod-dupclear', 'OK', { messageId: 'dupc-clear', at: at(2) }));
    const firstClear = alarms().find((r) => r.alarm_type === 'footbag-prod-dupclear')!.cleared_at;
    deliver(stateChange('footbag-prod-dupclear', 'OK', { messageId: 'dupc-clear', at: at(2) }));
    const rows = alarms().filter((r) => r.alarm_type === 'footbag-prod-dupclear');
    expect(rows).toHaveLength(1);
    expect(rows[0].cleared_at).toBe(firstClear);
  });

  it('a genuine recurrence under a new message id is recorded afresh', () => {
    deliver(stateChange('footbag-prod-again', 'ALARM', { messageId: 'again-1', at: at(1) }));
    deliver(stateChange('footbag-prod-again', 'OK',    { messageId: 'again-2', at: at(2) }));
    deliver(stateChange('footbag-prod-again', 'ALARM', { messageId: 'again-3', at: at(3) }));
    const rows = alarms().filter((r) => r.alarm_type === 'footbag-prod-again');
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
  });

  it('a notification with no message identifier is still processed, since losing a real alarm is worse', () => {
    deliver(stateChange('footbag-prod-noid', 'ALARM'));
    expect(alarms()).toHaveLength(1);
    expect(claimedMessageIds()).toHaveLength(0);
  });
});

describe('payloads the service declines to act on', () => {
  it('ignores a body that is not valid data rather than throwing on it', () => {
    // The feed loop deletes a message the service returns on and leaves one it
    // throws on for redelivery, so raising here would have the queue hand back
    // the same unparseable body until it aged out.
    const result = deliver('this is not json');
    expect(result).toEqual({ status: 'ignored', reason: 'malformed' });
    expect(alarms()).toHaveLength(0);
  });

  it('accepts and ignores a notification whose inner payload is not valid data', () => {
    deliver(JSON.stringify({
      Type: 'Notification', MessageId: 'bad-inner', Message: 'not json either',
      TopicArn: 'arn:aws:sns:us-east-1:000:alarms',
    }));
    expect(alarms()).toHaveLength(0);
  });

  it('accepts and ignores a notification naming no alarm', () => {
    deliver(envelope({ NewStateValue: 'ALARM' }, 'no-name'));
    expect(alarms()).toHaveLength(0);
  });

  it('accepts and ignores a state value it does not recognise', () => {
    deliver(stateChange('footbag-prod-weird', 'SOMETHING_ELSE', { messageId: 'weird-1' }));
    expect(alarms()).toHaveLength(0);
  });

  it('accepts a subscription confirmation without writing it, or its one-time URL, to the audit log', () => {
    // A pending subscription changes nothing; an audit row for it would also be
    // a row anyone able to reach the endpoint could add.
    const before = withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM audit_entries').get() as { n: number }).n);
    deliver(JSON.stringify({
      Type: 'SubscriptionConfirmation',
      TopicArn: 'arn:aws:sns:us-east-1:000:alarms',
      SubscribeURL: 'https://sns.example.com/confirm?token=secret-bearer-token',
    }));
    const after = withDb((db) => db.prepare('SELECT metadata_json, reason_text FROM audit_entries').all());
    expect(after).toHaveLength(before);
    expect(JSON.stringify(after)).not.toContain('secret-bearer-token');
  });

  it('claims a redelivered subscription confirmation once', async () => {
    const confirmation = JSON.stringify({
      Type: 'SubscriptionConfirmation',
      TopicArn: 'arn:aws:sns:us-east-1:000:alarms',
      MessageId: 'confirm-repeat-1',
      SubscribeURL: 'https://sns.us-east-1.amazonaws.com/confirm?token=one-time',
    });
    for (const _ of [1, 2, 3]) {
      deliver(confirmation);
    }
    expect(claimedMessageIds()).toEqual(['confirm-repeat-1']);
  });
});
