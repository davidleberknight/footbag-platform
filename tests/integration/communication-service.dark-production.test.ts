/**
 * A dark production holds the outbox rather than emptying it.
 *
 * Disarming email swaps the live sender for the stub, and the stub reports
 * every send as delivered. A drain running against it would mark each queued
 * message sent and clear its body, so the queue would empty, nothing would
 * arrive, and there would be nothing left to send again. The queued mail would
 * be gone with no record of what it said.
 *
 * What this pins is the refusal: on a production host not holding the live
 * sender the drain declines, every row stays pending with its body intact, and
 * the caller is told why so an operator can see the queue filling. Development
 * and staging are deliberately excluded: they drain into the stub on purpose,
 * which is how their captured mail is read back on screen.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3099');

// A production boot, read once at module load so these are in place before the
// config singleton is built by the dynamic imports below. Everything that would
// otherwise reach AWS stays stubbed; what is under test is the one combination
// a dark production really runs: the production environment holding the stub
// sender.
process.env.NODE_ENV = 'production';
process.env.FOOTBAG_ENV = 'production';
process.env.SES_ADAPTER = 'stub';
process.env.EMAIL_SEND_ARMED = 'dark';
process.env.SESSION_SECRET = 'a'.repeat(48);
process.env.INTERNAL_EVENT_SECRET = 'c'.repeat(48);
process.env.JWT_SIGNER = 'kms';
process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
process.env.SAFE_BROWSING_ADAPTER = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER = 'stub';
process.env.AWS_REGION = 'us-east-1';
process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER = 'local';
process.env.PAYMENT_ADAPTER = 'stub';
process.env.PAYMENTS_ARMED = 'dark';
process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_for_a_dark_production_host';
process.env.CAPTCHA_ADAPTER = 'live';
process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
delete process.env.ALLOW_CURATED_SIDECAR_WRITES;

const RECIPIENT_ID = 'dark-prod-member';

let createCommunicationService:
  typeof import('../../src/services/communicationService').createCommunicationService;
let createStubSesAdapter: typeof import('../../src/adapters/sesAdapter').createStubSesAdapter;

function readRow(id: string): { status: string; body_text: string | null } {
  const db = new BetterSqlite3(dbPath);
  try {
    return db.prepare('SELECT status, body_text FROM outbox_emails WHERE id = ?')
      .get(id) as { status: string; body_text: string | null };
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: RECIPIENT_ID, slug: 'dark_prod', login_email: 'held@example.com' });
  db.close();
  ({ createCommunicationService } = await import('../../src/services/communicationService'));
  ({ createStubSesAdapter } = await import('../../src/adapters/sesAdapter'));
});

afterAll(() => cleanupTestDb(dbPath));

describe('the outbox drain on a dark production host', () => {
  it('holds every queued message instead of marking it sent', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const enqueued = await svc.enqueue({
      audience: { kind: 'member', memberId: RECIPIENT_ID },
      recipientEmail: 'held@example.com',
      subject: 'Verify your email',
      bodyText: 'the link a member is waiting for',
    });
    const id = enqueued.ids[0];

    const res = await svc.processSendQueue();

    expect(res.sendingDark).toBe(true);
    expect(res.claimed).toBe(0);
    expect(res.sent).toBe(0);
    // Nothing reached the sender, real or stubbed.
    expect(stub.sentMessages).toHaveLength(0);

    const row = readRow(id);
    expect(row.status).toBe('pending');
    // The body is what a successful send clears. Still here means the message
    // can still be delivered once email is armed.
    expect(row.body_text).toBe('the link a member is waiting for');
  });

  it('reports the hold distinctly from the administrator pause switch', async () => {
    // An operator seeing a stopped queue must be able to tell which lever did
    // it: the pause switch they can clear in seconds, or the arming state that
    // needs a deploy.
    const svc = createCommunicationService(createStubSesAdapter());
    const res = await svc.processSendQueue();
    expect(res.sendingDark).toBe(true);
    expect(res.paused).toBe(false);
  });
});

describe('the dark-production notice is said once, not on every pass', () => {
  it('reports the held outbox on the first drain and stays quiet afterwards', async () => {
    // The condition is steady, not an event: it holds for as long as email is
    // dark, and the drain runs on a short interval. A line per pass would be
    // tens of identical warnings a minute, at a level production shows, for as
    // long as the state lasts — which buries the lines an operator needs.
    const [{ operationsPlatformService }, { logger }] = await Promise.all([
      import('../../src/services/operationsPlatformService'),
      import('../../src/config/logger'),
    ]);
    const warn = vi.spyOn(logger, 'warn');
    try {
      await operationsPlatformService.runEmailWorker();
      await operationsPlatformService.runEmailWorker();
      await operationsPlatformService.runEmailWorker();
      const darkLines = warn.mock.calls.filter(
        ([msg]) => typeof msg === 'string' && msg.includes('production is dark'),
      );
      expect(darkLines).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});
