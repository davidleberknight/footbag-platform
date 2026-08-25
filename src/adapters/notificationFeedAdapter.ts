/**
 * NotificationFeedAdapter: interface + implementations + singleton getter for
 * the adapters layer. `LiveNotificationFeedAdapter` polls the SQS queues that
 * carry the SES bounce/complaint feed and the platform alarm feed;
 * `StubNotificationFeedAdapter` serves an in-memory queue for dev and test.
 * Services call the interface; the getter returns the configured
 * implementation.
 *
 * A queue rather than a push endpoint is what makes these feeds durable and
 * unauthenticated-by-secret. An HTTPS subscription gets a fixed retry window
 * and then the notification is gone; a queue holds it until something reads it,
 * and the read is authorized by the runtime role rather than by a shared key
 * travelling in a URL where every proxy on the path logs it.
 *
 * The queue carries the SNS envelope unchanged, so what a consumer receives in
 * `body` is the same JSON an HTTPS endpoint would have been posted, complete
 * with the MessageId it claims for idempotency and the TopicArn it checks.
 */
import { randomUUID } from 'node:crypto';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { config } from '../config/env';

export interface FeedMessage {
  /** The queue's own handle for this delivery, used to delete it once handled. */
  receiptHandle: string;
  /** The SNS envelope as JSON text, exactly as an HTTPS endpoint would receive it. */
  body: string;
}

export interface ReceiveOptions {
  /**
   * Seconds to hold the connection open waiting for a message. Long polling is
   * what keeps an idle feed from costing a request per second, and it is why
   * the caller must be able to abort: without an abort the loop is unreachable
   * for the length of a wait, and a shutdown lands in the middle of one.
   */
  waitTimeSeconds?: number;
  maxMessages?: number;
  abortSignal?: AbortSignal;
}

export interface NotificationFeedAdapter {
  receive(queueUrl: string, opts?: ReceiveOptions): Promise<FeedMessage[]>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}

export interface StubNotificationFeedAdapter extends NotificationFeedAdapter {
  /** Places an envelope on a stub queue so a consumer can read it back. */
  publishForTests(queueUrl: string, body: string): void;
  /** Envelopes delivered but not yet deleted, per queue. */
  inFlight(queueUrl: string): FeedMessage[];
  /** Envelopes the consumer deleted, in the order it deleted them. */
  deleted(queueUrl: string): string[];
  reset(): void;
}

export function createLiveNotificationFeedAdapter(deps: {
  region: string | undefined;
  sqsClient?: SQSClient;
}): NotificationFeedAdapter {
  const client = deps.sqsClient ?? new SQSClient({ region: deps.region });

  return {
    async receive(queueUrl, opts = {}) {
      const res = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          WaitTimeSeconds: opts.waitTimeSeconds ?? 20,
          MaxNumberOfMessages: opts.maxMessages ?? 10,
        }),
        opts.abortSignal ? { abortSignal: opts.abortSignal } : undefined,
      );
      // An empty long poll returns no Messages key at all rather than an empty
      // array, which is the normal state of a healthy feed.
      return (res.Messages ?? [])
        .filter((m): m is typeof m & { ReceiptHandle: string; Body: string } =>
          typeof m.ReceiptHandle === 'string' && typeof m.Body === 'string')
        .map((m) => ({ receiptHandle: m.ReceiptHandle, body: m.Body }));
    },

    async deleteMessage(queueUrl, receiptHandle) {
      await client.send(
        new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }),
      );
    },
  };
}

export function createStubNotificationFeedAdapter(): StubNotificationFeedAdapter {
  const queued = new Map<string, FeedMessage[]>();
  const outstanding = new Map<string, FeedMessage[]>();
  const removed = new Map<string, string[]>();

  const listFor = (map: Map<string, FeedMessage[]>, url: string): FeedMessage[] => {
    const existing = map.get(url);
    if (existing) return existing;
    const created: FeedMessage[] = [];
    map.set(url, created);
    return created;
  };

  return {
    async receive(queueUrl, opts = {}) {
      const pending = listFor(queued, queueUrl);
      const batch = pending.splice(0, opts.maxMessages ?? 10);
      listFor(outstanding, queueUrl).push(...batch);
      return batch;
    },

    async deleteMessage(queueUrl, receiptHandle) {
      const held = listFor(outstanding, queueUrl);
      const at = held.findIndex((m) => m.receiptHandle === receiptHandle);
      if (at >= 0) held.splice(at, 1);
      const done = removed.get(queueUrl) ?? [];
      done.push(receiptHandle);
      removed.set(queueUrl, done);
    },

    publishForTests(queueUrl, body) {
      listFor(queued, queueUrl).push({ receiptHandle: `stub-${randomUUID()}`, body });
    },

    inFlight(queueUrl) {
      return [...listFor(outstanding, queueUrl)];
    },

    deleted(queueUrl) {
      return [...(removed.get(queueUrl) ?? [])];
    },

    reset() {
      queued.clear();
      outstanding.clear();
      removed.clear();
    },
  };
}

let singleton: NotificationFeedAdapter | null = null;
let stubSingleton: StubNotificationFeedAdapter | null = null;

export function getNotificationFeedAdapter(): NotificationFeedAdapter {
  if (singleton) return singleton;
  if (config.footbagEnv === 'staging' || config.footbagEnv === 'production') {
    // Reading a real queue from a test run would consume notifications the
    // environment's own worker is there to handle, and a consumed message is
    // gone: SQS hands each delivery to one reader. A test uses the stub or
    // injects a double.
    if (config.isTestRunner) {
      throw new Error(
        'getNotificationFeedAdapter() refuses a live queue under the Vitest runner; a test must use the stub adapter or inject a double',
      );
    }
    singleton = createLiveNotificationFeedAdapter({ region: config.awsRegion });
  } else {
    stubSingleton = createStubNotificationFeedAdapter();
    singleton = stubSingleton;
  }
  return singleton;
}

/** Exposes the in-memory stub for test inspection. Null unless the stub is resolved. */
export function getStubNotificationFeedAdapterForTests(): StubNotificationFeedAdapter | null {
  return stubSingleton;
}

export function setNotificationFeedAdapterForTests(adapter: NotificationFeedAdapter): void {
  singleton = adapter;
}

export function resetNotificationFeedAdapterForTests(): void {
  singleton = null;
  stubSingleton = null;
}
