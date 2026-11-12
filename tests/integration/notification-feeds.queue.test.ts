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
// The sibling topic AWS Health notices reach in the backup Region, which the
// alarm feed's queue is subscribed to beside the main alarm topic.
const HEALTH_TOPIC = 'arn:aws:sns:us-west-2:000:alarms-usw2';
process.env.ALARM_ADDITIONAL_TOPIC_ARNS = HEALTH_TOPIC;

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

  it('an alarm whose return to normal arrives first ends with no active alarm, both messages handled', async () => {
    // The queue does not keep order. Defect caught: the return to normal dropped
    // because nothing was open, then the late raise opening an alarm that holds
    // the admin banner up for good, since nothing redelivers a handled message.
    feed.publishForTests(ALARM_QUEUE, alarmEnvelope(
      alarmStateChange('footbag-test-overtaken', 'OK', { stateChangeTime: '2026-08-25T00:00:02.000+0000' }),
      { messageId: 'sns-overtaken-ok' },
    ));
    feed.publishForTests(ALARM_QUEUE, alarmEnvelope(
      alarmStateChange('footbag-test-overtaken', 'ALARM', { stateChangeTime: '2026-08-25T00:00:01.000+0000' }),
      { messageId: 'sns-overtaken-alarm' },
    ));
    const deletedBefore = feed.deleted(ALARM_QUEUE).length;

    await operationsPlatformService.runNotificationFeeds();

    const active = withDb((db) => (db.prepare(
      "SELECT COUNT(*) AS n FROM system_alarm_events WHERE alarm_type = 'footbag-test-overtaken' AND status = 'active'",
    ).get() as { n: number }).n);
    expect(active).toBe(0);
    expect(feed.deleted(ALARM_QUEUE).length - deletedBefore).toBe(2);
    expect(feed.inFlight(ALARM_QUEUE)).toHaveLength(0);
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

  it('records an alarm published by the additional topic and refuses one from any other', async () => {
    // Defect caught: an AWS Health notice from the backup Region never reaching
    // the admin console; or the list widening the feed to topics nobody named.
    feed.publishForTests(
      ALARM_QUEUE,
      alarmEnvelope(alarmStateChange('footbag-test-health-usw2', 'ALARM'), { messageId: 'sns-health-1', topicArn: HEALTH_TOPIC }),
    );
    feed.publishForTests(
      ALARM_QUEUE,
      alarmEnvelope(alarmStateChange('footbag-test-foreign', 'ALARM'), {
        messageId: 'sns-foreign-1', topicArn: 'arn:aws:sns:us-west-2:999:someone-elses-topic',
      }),
    );

    const before = alarmCount();
    const result = await operationsPlatformService.runNotificationFeeds();

    expect(result.handled).toBe(1);
    expect(result.skipped).toBe(1);
    expect(alarmCount()).toBe(before + 1);
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

  it('hands the shutdown signal to every delete as well as every read', async () => {
    // Without it a stop waits on a delete the queue never answers, for the
    // whole socket limit, after the read itself was already ended.
    const seen: Array<AbortSignal | undefined> = [];
    const recording: NotificationFeedAdapter = {
      receive: async (queueUrl) => (queueUrl === SES_QUEUE
        ? [
          { receiptHandle: 'rh-ok', body: permanentBounce('sns-signal-ok') },
          {
            receiptHandle: 'rh-foreign',
            body: sesFeedbackEnvelope({
              notificationType: 'Bounce',
              bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: BOUNCED_EMAIL }] },
            }, { messageId: 'sns-signal-foreign', topicArn: 'arn:aws:sns:us-east-1:999:someone-elses-topic' }),
          },
        ]
        : []),
      deleteMessage: async (_queueUrl, _receiptHandle, opts) => {
        seen.push(opts?.abortSignal);
      },
    };
    feedModule.setNotificationFeedAdapterForTests(recording);
    const shutdown = new AbortController();

    await operationsPlatformService.runNotificationFeeds({ abortSignal: shutdown.signal });

    expect(seen).toHaveLength(2);
    for (const signal of seen) expect(signal).toBe(shutdown.signal);
  });

  it('keeps a message in flight when its delete is refused by a stop already under way', async () => {
    // The stub refuses as the live queue client does, so a shutdown mid-pass
    // leaves the message for redelivery rather than reporting it deleted.
    feed.publishForTests(SES_QUEUE, permanentBounce('sns-stopped'));
    const [message] = await feed.receive(SES_QUEUE);
    const shutdown = new AbortController();
    shutdown.abort();

    await expect(feed.deleteMessage(SES_QUEUE, message.receiptHandle, { abortSignal: shutdown.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(feed.deleted(SES_QUEUE)).toHaveLength(0);
    expect(feed.inFlight(SES_QUEUE)).toHaveLength(1);
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
