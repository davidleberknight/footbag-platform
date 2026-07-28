/**
 * SesAdapter: interface + implementations + singleton getter for the
 * adapters layer. `LiveSesAdapter` sends via AWS
 * SES in production; `StubSesAdapter` records messages in memory for
 * dev/test. Services call the interface; the getter returns the
 * configured implementation based on `config.sesAdapter`.
 */
import { randomUUID } from 'node:crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from '../config/env';

export interface SesMessage {
  to: string;
  subject: string;
  bodyText: string;
  from?: string;
}

export interface SesSendResult {
  messageId: string;
  deliveredAt: string;
}

export interface SesAdapter {
  sendEmail(msg: SesMessage): Promise<SesSendResult>;
  captureCurrentMessageIndex(): number | null;
}

interface StubSentMessage extends SesMessage {
  messageId: string;
  deliveredAt: string;
}

export interface StubSesAdapter extends SesAdapter {
  readonly sentMessages: readonly StubSentMessage[];
  clear(): void;
  failNext(error: Error): void;
}

export function createLiveSesAdapter(opts: {
  region?: string;
  fromIdentity: string;
  sesClient?: SESClient;
}): SesAdapter {
  const client =
    opts.sesClient ?? new SESClient(opts.region ? { region: opts.region } : {});
  const defaultFrom = opts.fromIdentity;
  return {
    async sendEmail(msg) {
      const res = await client.send(
        new SendEmailCommand({
          Source: msg.from ?? defaultFrom,
          Destination: { ToAddresses: [msg.to] },
          Message: {
            Subject: { Data: msg.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: msg.bodyText, Charset: 'UTF-8' } },
          },
        }),
      );
      if (!res.MessageId) {
        throw new Error('SES SendEmail returned no MessageId');
      }
      return {
        messageId: res.MessageId,
        deliveredAt: new Date().toISOString(),
      };
    },
    captureCurrentMessageIndex() {
      return null;
    },
  };
}

export function createStubSesAdapter(): StubSesAdapter {
  const sent: StubSentMessage[] = [];
  let pendingError: Error | null = null;
  return {
    get sentMessages() {
      return sent;
    },
    clear() {
      sent.length = 0;
      pendingError = null;
    },
    failNext(error: Error) {
      pendingError = error;
    },
    async sendEmail(msg) {
      if (pendingError) {
        const err = pendingError;
        pendingError = null;
        throw err;
      }
      const record: StubSentMessage = {
        ...msg,
        messageId: `stub-${randomUUID()}`,
        deliveredAt: new Date().toISOString(),
      };
      sent.push(record);
      return { messageId: record.messageId, deliveredAt: record.deliveredAt };
    },
    captureCurrentMessageIndex() {
      return sent.length;
    },
  };
}

let singleton: SesAdapter | null = null;
let stubSingleton: StubSesAdapter | null = null;

export function getSesAdapter(): SesAdapter {
  if (singleton) return singleton;
  if (config.sesAdapter === 'live') {
    // The Vitest runner must never resolve the live sender through the
    // application path: a test that reached this branch could deliver real
    // mail to a real mailbox. The operator-run staging smoke tier exercises
    // real SES deliberately and constructs createLiveSesAdapter directly,
    // so it never passes through this accessor.
    if (config.isTestRunner) {
      throw new Error(
        'getSesAdapter() refuses SES_ADAPTER=live under the Vitest runner; a test must use the stub adapter or inject a double',
      );
    }
    if (!config.sesFromIdentity) {
      throw new Error('SES_FROM_IDENTITY is required when SES_ADAPTER=live');
    }
    singleton = createLiveSesAdapter({
      region: config.awsRegion,
      fromIdentity: config.sesFromIdentity,
    });
  } else {
    stubSingleton = createStubSesAdapter();
    singleton = stubSingleton;
  }
  return singleton;
}

/** Exposes the in-memory stub adapter for test inspection. Null unless SES_ADAPTER=stub. */
export function getStubSesAdapterForTests(): StubSesAdapter | null {
  return stubSingleton;
}

/**
 * Installs a double in place of the resolved adapter. A suite that must run
 * with SES_ADAPTER=live for the config-gated rendering (the simulated-email
 * card hides under the live adapter) injects a double here, because the
 * accessor refuses to construct the real live sender under the test runner.
 */
export function setSesAdapterForTests(adapter: SesAdapter): void {
  singleton = adapter;
}

export function resetSesAdapterForTests(): void {
  singleton = null;
  stubSingleton = null;
}
