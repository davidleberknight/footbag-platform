/**
 * SesAdapter: interface + implementations + singleton getter for the
 * adapters layer. `LiveSesAdapter` sends via AWS
 * SES in production; `StubSesAdapter` records messages in memory for
 * dev/test. Services call the interface; the getter returns the
 * configured implementation based on `config.sesAdapter`.
 */
import { randomUUID } from 'node:crypto';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { config } from '../config/env';

/**
 * Assembles the RFC 5322 message for a send that carries custom headers. SES's
 * simple send call has no field for them, so a message needing the one-click
 * unsubscribe pair goes out as raw MIME instead. Kept to a single plain-text
 * part, matching the plain-text-only rule the rest of the send path follows:
 * an interpolated member-supplied value cannot inject a header when the body is
 * one text part and every header here is built from values the platform owns.
 */
function buildRawMessage(msg: SesMessage, from: string): string {
  const headerLines = [
    `From: ${from}`,
    // Guarded like the subject rather than trusted. Upstream validation should
    // already exclude a CRLF in an address, but this is the one place where a
    // stray one stops being bad data and becomes an injected header.
    `To: ${encodeHeaderValue(msg.to)}`,
    `Subject: ${encodeHeaderValue(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    ...Object.entries(msg.headers ?? {}).map(([name, value]) => `${name}: ${value}`),
  ];
  return `${headerLines.join('\r\n')}\r\n\r\n${msg.bodyText}`;
}

/**
 * A subject is member-visible text and may hold non-ASCII or a newline. Encoded
 * words keep it inside one header line and make a newline in the value
 * impossible to read as the start of another header.
 */
function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export interface SesMessage {
  to: string;
  subject: string;
  bodyText: string;
  from?: string;
  // The SES configuration set the send is attributed to. Transactional and
  // bulk mail run as separate streams so a complaint spike on one cannot
  // degrade the sending reputation of the other; the configuration set is
  // where SES keeps those metrics apart. Omitted while the sets are not yet
  // provisioned, in which case the send falls back to the account default.
  configurationSet?: string;
  // Headers the receiving mail client acts on rather than the reader: the
  // one-click unsubscribe pair on bulk mail, which the client renders as its
  // own control. A body link would train members to click links arriving in
  // mail, which the anti-phishing policy rules out, so the affordance lives in
  // the envelope instead. Present only on bulk sends.
  headers?: Record<string, string>;
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
      const source = msg.from ?? defaultFrom;
      // A message carrying custom headers goes out as raw MIME, because the
      // simple send call has nowhere to put them. Everything else keeps the
      // simple call, which needs no message assembly of ours.
      const res = msg.headers && Object.keys(msg.headers).length > 0
        ? await client.send(new SendRawEmailCommand({
          Source: source,
          Destinations: [msg.to],
          RawMessage: { Data: Buffer.from(buildRawMessage(msg, source), 'utf8') },
          ConfigurationSetName: msg.configurationSet,
        }))
        : await client.send(new SendEmailCommand({
          Source: source,
          Destination: { ToAddresses: [msg.to] },
          Message: {
            Subject: { Data: msg.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: msg.bodyText, Charset: 'UTF-8' } },
          },
          ConfigurationSetName: msg.configurationSet,
        }));
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
