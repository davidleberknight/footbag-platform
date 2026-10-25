/**
 * A dark production drains the outbox into the stub sender, exactly like
 * staging.
 *
 * While email is dark, production holds the stub sender and every flow that
 * mails (registration, verification, password reset) must work end to end with
 * the message shown on the simulated-email card. That needs the drain to run:
 * a production host that refused to drain left every queued message pending,
 * so the card stayed empty and a registrant waited on a link that never came.
 * Mail drained while dark is a stub-consumed test artifact and is never
 * delivered later; stopping mail while keeping it is the pause switch's job.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_abababababababababababababababababababababababab';
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
  insertMember(db, { id: RECIPIENT_ID, slug: 'dark_prod', login_email: 'dark@example.com' });
  db.close();
  ({ createCommunicationService } = await import('../../src/services/communicationService'));
  ({ createStubSesAdapter } = await import('../../src/adapters/sesAdapter'));
});

afterAll(() => cleanupTestDb(dbPath));

describe('the outbox drain on a dark production host', () => {
  it('sends each queued message through the stub and marks it sent, as staging does', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const enqueued = await svc.enqueue({
      audience: { kind: 'member', memberId: RECIPIENT_ID },
      subject: 'Verify your email',
      bodyText: 'the link a registrant is waiting for',
    });
    const id = enqueued.ids[0];

    const res = await svc.processSendQueue();

    expect(res.paused).toBe(false);
    expect(res.sent).toBe(1);
    // The stub captured it, which is what the simulated-email card reads back.
    expect(stub.sentMessages).toHaveLength(1);
    expect(stub.sentMessages[0].bodyText).toBe('the link a registrant is waiting for');

    const row = readRow(id);
    expect(row.status).toBe('sent');
    // Cleared like any sent row: nothing is kept to deliver once email is armed.
    expect(row.body_text).toBeNull();
  });
});
