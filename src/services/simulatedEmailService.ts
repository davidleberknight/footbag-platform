// Shared view-model builder for the "simulated email" card rendered on
// email-gated pages (/register/check-email and the verify-resend and
// password-forgot pages). Building the card only reads; the request that
// queued the mail drains it into the stub first (drainCapturedMail). Two modes:
//
//  - dev:      SES_ADAPTER=stub. Returns the captured in-memory messages from
//              StubSesAdapter so a developer or paid tester can finish email
//              flows without leaving the page. This is not a dev-and-staging
//              branch: production selects the stub adapter too whenever email
//              is dark, so it runs there and every path below must hold on a
//              production image.
//  - null:     SES_ADAPTER=live. No card is rendered.
//
// Scrub safety: outbox_emails.body_text is NULLed after send for PII
// hygiene. That scrub runs on the DB row, not on the stub adapter's
// in-memory array, so the dev-mode card remains authoritative for the
// original message content.

import { config } from '../config/env';
import { logger } from '../config/logger';
import { getSesAdapter, getStubSesAdapterForTests } from '../adapters/sesAdapter';
import { operationsPlatformService } from './operationsPlatformService';
import { getDevOutboxCaptureClient } from '../testkit/devOutboxCaptureClient';

export interface SimulatedEmailMessage {
  to:          string;
  from:        string;
  subject:     string;
  bodyText:    string;
  messageId:   string;
  deliveredAt: string;
  firstUrl:    string | null;
}

export type SimulatedEmailPreview =
  | { mode: 'dev'; messages: SimulatedEmailMessage[] };

const URL_PATTERN = /https?:\/\/\S+/;

/**
 * Filter that restricts which captured stub messages appear in the dev card.
 * Without a filter, the card shows every message ever sent in the running
 * process, including stale links the user has already consumed (e.g., the
 * verify-email link after they verified). Clicking a stale link gives a
 * "invalid/expired/already used" page that's confusing in a dev workflow.
 *
 * Pass a `urlPathPrefix` to restrict to messages whose extracted firstUrl
 * starts with that path. Pages that enqueue a specific kind of email pass
 * the matching prefix so the card only shows the just-enqueued message.
 */
export interface GetEmailPreviewOpts {
  /** Only include messages whose firstUrl pathname starts with this prefix. */
  urlPathPrefix?: string;
  /**
   * Only include messages added at or after this index in the stub's
   * sentMessages buffer. Callers capture
   * `getStubSesAdapterForTests()?.sentMessages.length ?? 0` BEFORE invoking
   * the service that may enqueue, then pass that length here. This scopes
   * the dev card to "messages this turn" so a prior turn's matching message
   * does not bleed alongside a current turn's silent no-op.
   */
  sinceIndex?: number;
  /**
   * Only include messages addressed to this recipient (case-insensitive). The
   * POST->303->GET redirect on register/resend loses all per-request buffer
   * state, so the receiving GET cannot scope by sinceIndex; it scopes by the
   * just-registered recipient (carried across the redirect in a signed flash)
   * so the dev card never renders another pending user's verify token.
   */
  recipientEmail?: string;
}

export const simulatedEmailService = {
  async getEmailPreview(opts: GetEmailPreviewOpts = {}): Promise<SimulatedEmailPreview | null> {
    if (config.sesAdapter === 'stub') {
      // Force adapter init so stubSingleton is populated on a fresh server
      // that has not yet dispatched any email. Idempotent when already live.
      getSesAdapter();
      const stub = getStubSesAdapterForTests();
      if (!stub) return { mode: 'dev', messages: [] };

      // sinceIndex is an index into THIS process's buffer, so it is applied
      // there and nowhere else. Applying it to a merged list would cut at the
      // wrong place the moment the worker's buffer is non-empty, which is
      // precisely when the merge matters.
      const fromIdx = opts.sinceIndex ?? 0;
      const localSinceTurn = stub.sentMessages.slice(fromIdx);

      // The email-outbox loop runs in the worker container, so a message it
      // drains is captured in ITS stub buffer and never reaches this one. The
      // drain the queuing request ran only catches what the worker has not
      // already claimed, so without this the card shows nothing whenever the
      // worker got there first. Same client and same merge /dev/outbox has used since the
      // cross-process capture was introduced.
      //
      // Worker captures carry no index to scope by; the urlPathPrefix and
      // recipientEmail filters below are what keep a stale message from a
      // previous turn off the card, and they apply to both sources equally.
      const workerCaptured = await getDevOutboxCaptureClient().fetchWorkerCaptured();
      const byId = new Map<string, (typeof stub.sentMessages)[number]>();
      for (const m of localSinceTurn) byId.set(m.messageId, m);
      for (const m of workerCaptured) byId.set(m.messageId, m as (typeof stub.sentMessages)[number]);

      const all: SimulatedEmailMessage[] = [...byId.values()]
        .sort((a, b) => (a.deliveredAt < b.deliveredAt ? -1 : a.deliveredAt > b.deliveredAt ? 1 : 0))
        .reverse()
        .map((m) => {
          const match = m.bodyText.match(URL_PATTERN);
          return {
            to:          m.to,
            from:        m.from ?? '(default)',
            subject:     m.subject,
            bodyText:    m.bodyText,
            messageId:   m.messageId,
            deliveredAt: m.deliveredAt,
            firstUrl:    match ? match[0] : null,
          };
        });

      const prefixed = opts.urlPathPrefix
        ? all.filter((m) => urlPathStartsWith(m.firstUrl, opts.urlPathPrefix!))
        : all;

      const recipient = opts.recipientEmail?.toLowerCase().trim();
      const messages = recipient
        ? prefixed.filter((m) => m.to.toLowerCase().trim() === recipient)
        : prefixed;

      return { mode: 'dev', messages };
    }

    return null;
  },

  /**
   * Drain queued mail through the stub sender so the card the next page shows
   * already holds it, without waiting for the scheduled worker. Called by the
   * state-changing request that queued the mail, never by the page that shows
   * the card: a page read changes no stored state, and a drain marks outbox
   * rows sent. Does nothing unless the sender is the stub, so it never makes a
   * provider call. A drain failure is logged and swallowed: the mail stays
   * queued for the worker, and the request that queued it already succeeded.
   */
  async drainCapturedMail(): Promise<void> {
    if (config.sesAdapter !== 'stub') return;
    try {
      await operationsPlatformService.runEmailWorker();
    } catch (err) {
      logger.warn(
        'simulatedEmailService.drainCapturedMail: runEmailWorker drain failed; the mail stays queued for the worker',
        { error: (err as Error).message ?? String(err) },
      );
    }
  },
};

function urlPathStartsWith(url: string | null, prefix: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname.startsWith(prefix);
  } catch {
    // Fallback: substring match. URL parse fails on malformed inputs, but
    // the body-text URLs are constructed from config.publicBaseUrl + path,
    // so this branch is a defensive backstop.
    return url.includes(prefix);
  }
}
