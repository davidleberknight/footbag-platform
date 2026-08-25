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
    expect(auditCount('alarm.raised')).toBe(1);
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
    deliver(stateChange('footbag-prod-errors', 'ALARM', { messageId: 'flap-1' }));
    deliver(stateChange('footbag-prod-errors', 'INSUFFICIENT_DATA', { messageId: 'flap-2' }));

    const open = alarms().filter((a) => a.cleared_at === null);
    expect(open).toHaveLength(1);
    // The record carries the newest state the monitor reported.
    expect(open[0].severity).toBe('warning');

    deliver(stateChange('footbag-prod-errors', 'OK', { messageId: 'flap-3' }));
    expect(alarms().filter((a) => a.cleared_at === null)).toHaveLength(0);
  });

  // A return to normal can overtake its own raise in delivery. The clear finds
  // nothing, and if that dismissal consumed the message identifier the sender's
  // redelivery would be discarded as a duplicate and the alarm would stay open
  // for ever.
  it('a return to normal that arrives before its raise still clears once redelivered', () => {
    deliver(stateChange('footbag-prod-late', 'OK', { messageId: 'early-ok' }));
    expect(claimedMessageIds()).not.toContain('early-ok');

    deliver(stateChange('footbag-prod-late', 'ALARM', { messageId: 'late-raise' }));
    expect(alarms().filter((a) => a.cleared_at === null)).toHaveLength(1);

    deliver(stateChange('footbag-prod-late', 'OK', { messageId: 'early-ok' }));
    expect(alarms().filter((a) => a.cleared_at === null)).toHaveLength(0);
  });
});

describe('clearing an alarm', () => {
  it('clears the newest uncleared alarm of that name and leaves other alarms alone', async () => {
    const other = withDb((db) => insertSystemAlarmEvent(db, { alarm_type: 'footbag-other', status: 'active' }));
    deliver(stateChange('footbag-prod-backlog', 'ALARM', { messageId: 'raise-1' }));

    deliver(stateChange('footbag-prod-backlog', 'OK', { messageId: 'clear-1' }));

    const rows = alarms();
    const backlog = rows.find((r) => r.alarm_type === 'footbag-prod-backlog')!;
    expect(backlog.status).toBe('cleared');
    expect(backlog.cleared_at).not.toBeNull();
    expect(rows.find((r) => r.id === other)!.status).toBe('active');
    expect(auditCount('alarm.cleared')).toBe(1);
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
    expect(auditCount('alarm.cleared')).toBe(0);
  });
});

describe('processing each notification exactly once', () => {
  it('a redelivered alarm notification does not record a second alarm', () => {
    deliver(stateChange('footbag-prod-dup', 'ALARM', { messageId: 'dup-1' }));
    deliver(stateChange('footbag-prod-dup', 'ALARM', { messageId: 'dup-1' }));
    expect(alarms()).toHaveLength(1);
    expect(auditCount('alarm.raised')).toBe(1);
    expect(claimedMessageIds()).toEqual(['dup-1']);
  });

  it('a redelivered return-to-normal does not clear a second time', () => {
    deliver(stateChange('footbag-prod-dupclear', 'ALARM', { messageId: 'dupc-raise' }));
    deliver(stateChange('footbag-prod-dupclear', 'OK', { messageId: 'dupc-clear' }));
    deliver(stateChange('footbag-prod-dupclear', 'OK', { messageId: 'dupc-clear' }));
    expect(auditCount('alarm.cleared')).toBe(1);
  });

  it('a genuine recurrence under a new message id is recorded afresh', () => {
    deliver(stateChange('footbag-prod-again', 'ALARM', { messageId: 'again-1' }));
    deliver(stateChange('footbag-prod-again', 'OK',    { messageId: 'again-2' }));
    deliver(stateChange('footbag-prod-again', 'ALARM', { messageId: 'again-3' }));
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

  it('records a subscription confirmation for out-of-band confirmation without storing its one-time URL', () => {
    deliver(JSON.stringify({
      Type: 'SubscriptionConfirmation',
      TopicArn: 'arn:aws:sns:us-east-1:000:alarms',
      SubscribeURL: 'https://sns.example.com/confirm?token=secret-bearer-token',
    }));
    expect(auditCount('alarm.subscription_pending')).toBe(1);
    const stored = withDb((db) => (db.prepare(
      `SELECT metadata_json, reason_text FROM audit_entries WHERE action_type = 'alarm.subscription_pending'`,
    ).get() as { metadata_json: string; reason_text: string }));
    expect(stored.metadata_json).not.toContain('secret-bearer-token');
    expect(stored.reason_text).not.toContain('secret-bearer-token');
  });

  it('records one subscription confirmation however often it is redelivered', async () => {
    // The confirmation path used to write an audit row per delivery with no
    // idempotency at all, so anyone able to reach the endpoint could flood a
    // ledger that is append-only by trigger and has no sweep.
    const confirmation = JSON.stringify({
      Type: 'SubscriptionConfirmation',
      TopicArn: 'arn:aws:sns:us-east-1:000:alarms',
      MessageId: 'confirm-repeat-1',
      SubscribeURL: 'https://sns.us-east-1.amazonaws.com/confirm?token=one-time',
    });
    for (const _ of [1, 2, 3]) {
      deliver(confirmation);
    }
    expect(auditCount('alarm.subscription_pending')).toBe(1);
    expect(claimedMessageIds()).toEqual(['confirm-repeat-1']);
  });
});
