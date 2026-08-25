/**
 * The notification feeds read from queues.
 *
 * Bounce, complaint and alarm notifications reach the platform by being polled
 * from a queue rather than pushed to a public endpoint. What that has to
 * guarantee: a notification is handed to the service that owns its feed and
 * then deleted, so it is neither lost nor handled twice; a notification the
 * platform fails to record stays on the queue to be delivered again, because a
 * failure nobody recorded must not also be a failure nobody sees; a
 * notification published by a topic this feed does not expect is refused; and a
 * feed with nothing configured reads nothing at all, since consuming a message
 * the platform cannot attribute destroys it.
 *
 * The queue itself is stood up as an in-memory double. What is exercised here is
 * the whole path from an envelope arriving to the row it writes, which is the
 * part that can lose a member's bounce record.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import {
  sesFeedbackEnvelope,
  alarmEnvelope,
  alarmStateChange,
  SES_FEEDBACK_TEST_TOPIC,
} from '../fixtures/snsEnvelopes';
import type {
  StubNotificationFeedAdapter,
  NotificationFeedAdapter,
} from '../../src/adapters/notificationFeedAdapter';

const SES_QUEUE = 'https://sqs.us-east-1.amazonaws.com/000/footbag-test-ses-feedback-feed';
const ALARM_QUEUE = 'https://sqs.us-east-1.amazonaws.com/000/footbag-test-alarm-feed';

const { dbPath } = setTestEnv('4098');

// The queue URLs are read once when the config module first loads, so they are
// set before anything under src/ is imported. Every import of the application
// below is therefore dynamic; a static one would be hoisted above these lines
// and would freeze a config that names no queues.
process.env.SES_FEEDBACK_QUEUE_URL = SES_QUEUE;
process.env.ALARM_QUEUE_URL = ALARM_QUEUE;

type FeedModule = typeof import('../../src/adapters/notificationFeedAdapter');
type OpsService = typeof import('../../src/services/operationsPlatformService')['operationsPlatformService'];

let operationsPlatformService: OpsService;
let feedModule: FeedModule;
let sesFeedbackModule: typeof import('../../src/services/sesFeedbackService');
let feed: StubNotificationFeedAdapter;

const BOUNCED_EMAIL = 'bouncer@example.test';
// Its own mailbox, so the ordering case starts from a status of 'ok' whatever
// the cases before it did. Sharing one would let a member bounced earlier
// satisfy the assertion no matter when the delete happened.
const ORDERING_EMAIL = 'ordering@example.test';

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function emailStatusOf(email: string): string | undefined {
  return withDb((db) => (db
    .prepare('SELECT email_status FROM members WHERE login_email_normalized = ?')
    .get(email.toLowerCase()) as { email_status: string } | undefined)?.email_status);
}

function alarmCount(): number {
  return withDb((db) => (db
    .prepare('SELECT COUNT(*) AS n FROM system_alarm_events')
    .get() as { n: number }).n);
}

/** A permanent bounce for a seeded member, the shape SES publishes. */
function permanentBounce(messageId: string, email: string = BOUNCED_EMAIL): string {
  return sesFeedbackEnvelope({
    notificationType: 'Bounce',
    bounce: {
      bounceType: 'Permanent',
      bouncedRecipients: [{ emailAddress: email }],
    },
  }, { messageId });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { login_email: BOUNCED_EMAIL });
  insertMember(db, { login_email: ORDERING_EMAIL });
  db.close();
  feedModule = await import('../../src/adapters/notificationFeedAdapter');
  sesFeedbackModule = await import('../../src/services/sesFeedbackService');
  ({ operationsPlatformService } = await import('../../src/services/operationsPlatformService'));
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  feed = feedModule.createStubNotificationFeedAdapter();
  feedModule.setNotificationFeedAdapterForTests(feed);
});

afterEach(() => {
  feedModule.resetNotificationFeedAdapterForTests();
});

describe('notification feeds read from queues', () => {
  it('records a bounce and deletes the message it handled', async () => {
    feed.publishForTests(SES_QUEUE, permanentBounce('sns-bounce-1'));

    const result = await operationsPlatformService.runNotificationFeeds();

    expect(result.handled).toBe(1);
    expect(emailStatusOf(BOUNCED_EMAIL)).toBe('bounced');
    expect(feed.deleted(SES_QUEUE)).toHaveLength(1);
    expect(feed.inFlight(SES_QUEUE)).toHaveLength(0);
  });

  it('records an alarm from the alarm queue in the same pass', async () => {
    feed.publishForTests(
      ALARM_QUEUE,
      alarmEnvelope(alarmStateChange('footbag-test-app-errors', 'ALARM'), { messageId: 'sns-alarm-1' }),
    );

    const before = alarmCount();
    const result = await operationsPlatformService.runNotificationFeeds();

    expect(result.handled).toBe(1);
    expect(alarmCount()).toBe(before + 1);
    expect(feed.deleted(ALARM_QUEUE)).toHaveLength(1);
  });

  it('handles a redelivered notification exactly once', async () => {
    // The queue promises at-least-once delivery, so the same notification
    // arriving twice must leave the record exactly as it stands rather than
    // writing a second alarm or re-flagging a member.
    feed.publishForTests(
      ALARM_QUEUE,
      alarmEnvelope(alarmStateChange('footbag-test-redelivered', 'ALARM'), { messageId: 'sns-alarm-dup' }),
    );
    await operationsPlatformService.runNotificationFeeds();
    const afterFirst = alarmCount();

    feed.publishForTests(
      ALARM_QUEUE,
      alarmEnvelope(alarmStateChange('footbag-test-redelivered', 'ALARM'), { messageId: 'sns-alarm-dup' }),
    );
    await operationsPlatformService.runNotificationFeeds();

    expect(alarmCount()).toBe(afterFirst);
    // Still deleted: a duplicate is handled, and leaving it on the queue would
    // have it redelivered until the queue aged it out.
    expect(feed.deleted(ALARM_QUEUE)).toHaveLength(2);
  });

  it('refuses a notification published by a topic the feed does not expect', async () => {
    feed.publishForTests(SES_QUEUE, sesFeedbackEnvelope({
      notificationType: 'Bounce',
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [{ emailAddress: BOUNCED_EMAIL }],
      },
    }, { messageId: 'sns-spoofed', topicArn: 'arn:aws:sns:us-east-1:999:someone-elses-topic' }));

    const result = await operationsPlatformService.runNotificationFeeds();

    expect(result.handled).toBe(0);
    expect(result.skipped).toBe(1);
    expect(emailStatusOf(BOUNCED_EMAIL)).not.toBe('complained');
  });

  it('deletes a notification only after the record it produces is written', () => {
    // Ordering is the whole guarantee. Deleting first would make a notification
    // the platform never recorded indistinguishable from one it handled, which
    // is precisely the loss the queue transport exists to prevent.
    let statusWhenDeleted: string | undefined;
    const observing: NotificationFeedAdapter = {
      receive: async (queueUrl) => (queueUrl === SES_QUEUE
        ? [{ receiptHandle: 'rh-ordering', body: permanentBounce('sns-ordering', ORDERING_EMAIL) }]
        : []),
      deleteMessage: async () => {
        statusWhenDeleted = emailStatusOf(ORDERING_EMAIL);
      },
    };
    feedModule.setNotificationFeedAdapterForTests(observing);

    return operationsPlatformService.runNotificationFeeds().then(() => {
      expect(statusWhenDeleted).toBe('bounced');
    });
  });

  it('leaves a notification on the queue when handling it throws', async () => {
    // A failure the platform could not record must come back rather than be
    // deleted, so a redelivery gets another chance to write the record.
    const deleted: string[] = [];
    const failing: NotificationFeedAdapter = {
      receive: async (queueUrl) => (queueUrl === SES_QUEUE
        ? [{ receiptHandle: 'rh-fails', body: permanentBounce('sns-fails') }]
        : []),
      deleteMessage: async (_queueUrl, receiptHandle) => {
        deleted.push(receiptHandle);
      },
    };
    const exploded = new Error('the feed service could not record this');
    const spy = vi
      .spyOn(sesFeedbackModule.sesFeedbackService, 'processSnsMessage')
      .mockImplementation(() => {
        throw exploded;
      });
    feedModule.setNotificationFeedAdapterForTests(failing);

    try {
      await expect(operationsPlatformService.runNotificationFeeds())
        .rejects.toThrow('could not record this');
      expect(deleted).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('reads no feed at all when neither queue is configured', async () => {
    // A queue read without the topic to attribute it against would consume
    // messages the platform cannot place, and a consumed message is gone. An
    // environment whose queues do not exist yet must therefore read nothing
    // rather than read blind.
    const saved = {
      ses: process.env.SES_FEEDBACK_QUEUE_URL,
      alarm: process.env.ALARM_QUEUE_URL,
    };
    delete process.env.SES_FEEDBACK_QUEUE_URL;
    delete process.env.ALARM_QUEUE_URL;
    vi.resetModules();
    try {
      const unconfigured = (await import('../../src/services/operationsPlatformService'))
        .operationsPlatformService;
      expect(unconfigured.hasNotificationFeeds()).toBe(false);
      expect(await unconfigured.runNotificationFeeds()).toEqual({ handled: 0, skipped: 0 });
    } finally {
      if (saved.ses !== undefined) process.env.SES_FEEDBACK_QUEUE_URL = saved.ses;
      if (saved.alarm !== undefined) process.env.ALARM_QUEUE_URL = saved.alarm;
      vi.resetModules();
      feedModule = await import('../../src/adapters/notificationFeedAdapter');
  sesFeedbackModule = await import('../../src/services/sesFeedbackService');
      ({ operationsPlatformService } = await import('../../src/services/operationsPlatformService'));
      feed = feedModule.createStubNotificationFeedAdapter();
      feedModule.setNotificationFeedAdapterForTests(feed);
    }
  });

  it('reports an empty poll as nothing handled rather than an error', async () => {
    const result = await operationsPlatformService.runNotificationFeeds();
    expect(result).toEqual({ handled: 0, skipped: 0 });
  });

  it('names the topic each feed expects, so one queue cannot be read as the other', async () => {
    feed.publishForTests(SES_QUEUE, alarmEnvelope(
      alarmStateChange('footbag-test-wrong-queue', 'ALARM'),
      { messageId: 'sns-crossed' },
    ));

    const before = alarmCount();
    const result = await operationsPlatformService.runNotificationFeeds();

    expect(result.skipped).toBe(1);
    expect(alarmCount()).toBe(before);
    expect(SES_FEEDBACK_TEST_TOPIC).not.toBe('arn:aws:sns:us-east-1:000:alarms');
  });
});
