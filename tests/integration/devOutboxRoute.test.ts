/**
 * GET /dev/outbox — tester-facing view of captured outbound email.
 *
 * The /dev router mounts only when config.footbagEnv is 'development' or
 * 'staging'. This file pins the staging boot (NODE_ENV=production, stub
 * adapters) where testers exercise the harness.
 *
 * The stub buffer is per-process and the outbox drain runs in the worker
 * container, so the viewer merges this (web) process's buffer with a best-effort
 * fetch of the worker process's buffer. These tests assert that merge, newest-
 * first ordering, dedupe by messageId, the empty state, content escaping, and
 * graceful degradation when the worker is unreachable; plus the worker-side
 * capture endpoint's secret gate. The production-refusal (404) case for the
 * whole /dev mount is covered by devRoutes.prodGate.test.ts.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

// Imported dynamically in beforeAll, not statically: a static import here would
// reach src/config/env.ts and freeze config before this file's env overrides
// run (imports hoist above the top-level process.env assignments below), boxing
// the adapter to the wrong environment.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let getSesAdapter: typeof import('../../src/adapters/sesAdapter').getSesAdapter;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let getStubSesAdapterForTests: typeof import('../../src/adapters/sesAdapter').getStubSesAdapterForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let resetSesAdapterForTests: typeof import('../../src/adapters/sesAdapter').resetSesAdapterForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let setDevOutboxCaptureClientForTests: typeof import('../../src/testkit/devOutboxCaptureClient').setDevOutboxCaptureClientForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let resetDevOutboxCaptureClientForTests: typeof import('../../src/testkit/devOutboxCaptureClient').resetDevOutboxCaptureClientForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createTranscodeWorker: typeof import('../../src/transcodeWorker').createTranscodeWorker;

const { dbPath } = setTestEnv('3438');

process.env.NODE_ENV                  = 'production';
process.env.FOOTBAG_ENV               = 'staging';
process.env.SESSION_SECRET            = 'a'.repeat(48);
process.env.JWT_SIGNER                = 'local';
process.env.SES_ADAPTER               = 'stub';
process.env.SES_FROM_IDENTITY         = 'noreply@test.example.com';
process.env.AWS_REGION                = 'us-east-1';
process.env.SAFE_BROWSING_ADAPTER     = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER           = 'stub';
process.env.IMAGE_PROCESSOR_URL       = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER     = 'local';
process.env.PAYMENT_ADAPTER           = 'live';
process.env.STRIPE_WEBHOOK_SECRET     = 'whsec_live_realvalue';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
  const sesMod = await import('../../src/adapters/sesAdapter');
  getSesAdapter = sesMod.getSesAdapter;
  getStubSesAdapterForTests = sesMod.getStubSesAdapterForTests;
  resetSesAdapterForTests = sesMod.resetSesAdapterForTests;
  const capMod = await import('../../src/testkit/devOutboxCaptureClient');
  setDevOutboxCaptureClientForTests = capMod.setDevOutboxCaptureClientForTests;
  resetDevOutboxCaptureClientForTests = capMod.resetDevOutboxCaptureClientForTests;
  const wkMod = await import('../../src/transcodeWorker');
  createTranscodeWorker = wkMod.createTranscodeWorker;
});

afterAll(() => {
  resetSesAdapterForTests();
  resetDevOutboxCaptureClientForTests();
  cleanupTestDb(dbPath);
});

// Per-test isolation: a fresh stub buffer and a reset capture client so one
// case's captured messages never bleed into the next.
beforeEach(() => {
  resetSesAdapterForTests();
  getSesAdapter();
  resetDevOutboxCaptureClientForTests();
});

interface FakeCaptured {
  to: string;
  subject: string;
  bodyText: string;
  from?: string;
  messageId: string;
  deliveredAt: string;
}

function fakeWorkerCapture(messages: FakeCaptured[]): void {
  setDevOutboxCaptureClientForTests({ fetchWorkerCaptured: async () => messages });
}

describe('GET /dev/outbox', () => {
  it('merges web-local and worker-captured messages, newest first', async () => {
    await getSesAdapter().sendEmail({ to: 'web@example.com', subject: 'Web local message', bodyText: 'body-web' });
    fakeWorkerCapture([
      { to: 'w1@example.com', subject: 'Worker newer', bodyText: 'b1', messageId: 'wk-1', deliveredAt: '2999-01-01T00:00:00.000Z' },
      { to: 'w2@example.com', subject: 'Worker older', bodyText: 'b2', messageId: 'wk-2', deliveredAt: '2000-01-01T00:00:00.000Z' },
    ]);

    const res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    const text = res.text;
    expect(text).toContain('Worker newer');
    expect(text).toContain('Web local message');
    expect(text).toContain('Worker older');
    // Sorted by deliveredAt descending across both buffers.
    expect(text.indexOf('Worker newer')).toBeLessThan(text.indexOf('Web local message'));
    expect(text.indexOf('Web local message')).toBeLessThan(text.indexOf('Worker older'));
    expect(text).toContain('3 captured message(s)');
  });

  it('renders the empty state when both buffers are empty', async () => {
    fakeWorkerCapture([]);
    const res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.text).toContain('0 captured message(s)');
    expect(res.text).not.toContain('<article');
  });

  it('degrades to the web-local buffer when the worker is unreachable (no 500)', async () => {
    // Real client (reset above) targets http://localhost:3100, where nothing
    // listens in tests; its fetch failure must resolve to [] rather than 500.
    await getSesAdapter().sendEmail({ to: 'only@example.com', subject: 'Only web message', bodyText: 'b' });
    const res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Only web message');
  });

  it('escapes message content so a crafted subject cannot inject markup', async () => {
    await getSesAdapter().sendEmail({ to: 'x@example.com', subject: '<script>alert(1)</script>', bodyText: 'safe body' });
    fakeWorkerCapture([]);
    const res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('dedupes a message present in both buffers by messageId', async () => {
    await getSesAdapter().sendEmail({ to: 'dup@example.com', subject: 'Shared dup message', bodyText: 'b' });
    const m = getStubSesAdapterForTests()!.sentMessages[0];
    fakeWorkerCapture([{
      to: m.to, subject: m.subject, bodyText: m.bodyText, from: m.from, messageId: m.messageId, deliveredAt: m.deliveredAt,
    }]);

    const res = await request(createApp()).get('/dev/outbox');
    const occurrences = res.text.split('Shared dup message').length - 1;
    expect(occurrences).toBe(1);
    expect(res.text).toContain('1 captured message(s)');
  });
});

describe('worker /dev/outbox-capture endpoint', () => {
  const SECRET = 'test-internal-secret';

  it('rejects a request without the internal secret', async () => {
    const worker = createTranscodeWorker({ internalSecret: SECRET });
    const res = await request(worker.app).get('/dev/outbox-capture');
    expect(res.status).toBe(401);
  });

  it('returns the worker process stub buffer with the secret', async () => {
    await getSesAdapter().sendEmail({ to: 'wk@example.com', subject: 'Worker buffer message', bodyText: 'b' });
    const worker = createTranscodeWorker({ internalSecret: SECRET });
    const res = await request(worker.app).get('/dev/outbox-capture').set('x-internal-secret', SECRET);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.some((x: { subject: string }) => x.subject === 'Worker buffer message')).toBe(true);
  });
});
