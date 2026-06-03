// Shared view-model builder for the "simulated email" card rendered on
// email-gated pages (/register/check-email, /password/forgot/sent, the legacy
// claim sent state, and the unified link-history wizard). Two modes:
//
//  - dev:      SES_ADAPTER=stub (dev and staging). Returns the captured
//              in-memory messages from StubSesAdapter so a developer or paid
//              tester can finish email flows without leaving the page.
//  - null:     SES_ADAPTER=live (production only). No card is rendered.
//
// Scrub safety: outbox_emails.body_text is NULLed after send for PII
// hygiene. That scrub runs on the DB row, not on the stub adapter's
// in-memory array, so the dev-mode card remains authoritative for the
// original message content.

import { config } from '../config/env';
import { getSesAdapter, getStubSesAdapterForTests } from '../adapters/sesAdapter';
import { operationsPlatformService } from './operationsPlatformService';

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

      // Drain any outbox_emails rows through the stub so the just-enqueued
      // verification email appears without waiting for the scheduled worker.
      // Safe because SES_ADAPTER=stub means no network calls. Swallow any
      // error from the worker drain: this is a dev-card preview, and a
      // worker hiccup must not propagate a 500 to the user on what is
      // really just a page render (verify-sent, password-forgot-sent, etc.).
      try {
        await operationsPlatformService.runEmailWorker();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[simulatedEmailService] runEmailWorker failed during getEmailPreview; surfacing whatever the stub already captured: ${
            (err as Error).message ?? String(err)
          }`,
        );
      }

      const fromIdx = opts.sinceIndex ?? 0;
      const all: SimulatedEmailMessage[] = stub.sentMessages
        .slice(fromIdx)
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
