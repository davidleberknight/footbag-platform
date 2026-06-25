/**
 * GET /dev/outbox — tester-facing view of captured outbound email.
 *
 * When SES_ADAPTER=stub (development and staging), the SES adapter records every
 * message in memory instead of sending it. The simulated-email card surfaces
 * those messages on the email-gated pages that have a host page (register,
 * password reset). Notifications such as a tier change or a vouch confirmation
 * have no host page, so this viewer lists the captured buffer, newest first,
 * giving a tester a single place to read any outbound message without a real
 * inbox.
 *
 * The stub buffer is per-process, and the outbox drain loop runs in the worker
 * container, so worker-drained messages live in the worker process's buffer
 * while card-render drains live in this (web) process's buffer. This handler
 * merges both: its own in-memory buffer plus a best-effort fetch of the worker's
 * buffer over the internal-secret IPC channel. A worker that is unreachable
 * degrades to the web-local buffer rather than erroring.
 *
 * Permanent test scaffolding in src/testkit/. Reachability is governed entirely
 * by the env-gated /dev mount in app.ts (development + staging only); this
 * handler adds no auth of its own, mirroring the rest of the dev router. It is
 * read-only: it never sends, mutates, or clears anything. Both buffers clear on
 * server restart.
 */
import { Request, Response } from 'express';
import { config } from '../config/env';
import { getSesAdapter, getStubSesAdapterForTests } from '../adapters/sesAdapter';
import { getDevOutboxCaptureClient, type CapturedEmail } from './devOutboxCaptureClient';
import type { PageViewModel } from '../types/page';

interface DevOutboxRow {
  subject: string;
  to: string;
  fromDisplay: string;
  bodyText: string;
  deliveredAt: string;
  messageId: string;
}

interface DevOutboxContent {
  note: string;
  messages: DevOutboxRow[];
}

// Render through the shared site layout and design vocabulary (no inline styles,
// so the page carries the site look and feel and does not trip the style-src
// CSP). Handlebars auto-escapes every interpolated field, so a crafted subject
// or body cannot inject markup.
function render(res: Response, note: string, messages: CapturedEmail[]): void {
  const vm: PageViewModel<DevOutboxContent> = {
    seo:  { title: 'Dev outbox', noindex: true },
    page: { sectionKey: '', pageKey: 'dev_outbox', title: 'Dev outbox' },
    content: {
      note,
      messages: messages.map((m) => ({
        subject:     m.subject,
        to:          m.to,
        fromDisplay: m.from ?? '(default sender)',
        bodyText:    m.bodyText,
        deliveredAt: m.deliveredAt,
        messageId:   m.messageId,
      })),
    },
  };
  res.render('dev/outbox', vm);
}

export async function getDevOutbox(_req: Request, res: Response): Promise<void> {
  // Decide capture-on from config, not from the presence of the stub singleton:
  // the singleton is null until the adapter is first resolved, so keying off it
  // would falsely report "capture is off" on a fresh web process.
  if (config.sesAdapter !== 'stub') {
    render(res, 'Email capture is off (SES_ADAPTER is not "stub"); there is nothing to show.', []);
    return;
  }

  // Force adapter init so this process's buffer exists even before any email.
  getSesAdapter();
  const stub = getStubSesAdapterForTests();
  const local: CapturedEmail[] = stub
    ? stub.sentMessages.map((m) => ({
        to: m.to,
        subject: m.subject,
        bodyText: m.bodyText,
        from: m.from,
        messageId: m.messageId,
        deliveredAt: m.deliveredAt,
      }))
    : [];

  const worker = await getDevOutboxCaptureClient().fetchWorkerCaptured();

  // Merge both process buffers, dedupe by messageId, newest first by send time.
  const byId = new Map<string, CapturedEmail>();
  for (const m of [...local, ...worker]) byId.set(m.messageId, m);
  const messages = [...byId.values()].sort((a, b) =>
    a.deliveredAt < b.deliveredAt ? 1 : a.deliveredAt > b.deliveredAt ? -1 : 0,
  );

  render(
    res,
    `${messages.length} captured message(s), newest first. Both buffers clear on server restart.`,
    messages,
  );
}
