/**
 * End-to-end seam for the captured-email viewer: a full contact-request round
 * trip (a member submits, an admin lists it in the work queue and resolves it)
 * is captured by the stub SES adapter and rendered at GET /dev/outbox.
 *
 * The other /dev/outbox tests inject messages into the buffer directly; this one
 * drives the real public and admin routes, then drains the outbox the way the
 * worker does in a running stack, so the assertions cover what an operator
 * actually sees: a routine contact request raises no per-event admin email and
 * instead rolls up into the scheduled admin digest, and the resolution email is
 * sent back to the member. The /dev router mounts only in development or
 * staging, so the file pins the staging boot (NODE_ENV=production, stub
 * adapters).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

// Imported dynamically in beforeAll, not statically: a static import would reach
// src/config/env.ts and freeze config before this file's env overrides run.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let getSesAdapter: typeof import('../../src/adapters/sesAdapter').getSesAdapter;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let resetSesAdapterForTests: typeof import('../../src/adapters/sesAdapter').resetSesAdapterForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let resetDevOutboxCaptureClientForTests: typeof import('../../src/testkit/devOutboxCaptureClient').resetDevOutboxCaptureClientForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let operationsPlatformService: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let resetCommunicationServiceForTests: typeof import('../../src/services/communicationService').resetCommunicationServiceForTests;

const { dbPath } = setTestEnv('3461');

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

// A verified member who files a contact request, and an admin who both works
// the queue and (being subscribed to admin-alerts) receives the submit-side
// notification. Two actors cover both halves of the round trip.
const SUBMITTER_ID   = 'member_outbox_submitter';
const SUBMITTER_SLUG = 'outbox_submitter';
const SUBMITTER_EMAIL = 'submitter@example.com';
const ADMIN_ID       = 'member_outbox_admin';
const ADMIN_SLUG     = 'outbox_admin';
const ADMIN_EMAIL    = 'outbox-admin@example.com';

let createApp: Awaited<ReturnType<typeof importApp>>;

function submitterCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: SUBMITTER_ID })}`;
}

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: SUBMITTER_ID, slug: SUBMITTER_SLUG,
    display_name: 'Outbox Submitter', real_name: 'Outbox Submitter',
    login_email: SUBMITTER_EMAIL,
  });
  insertMember(db, {
    id: ADMIN_ID, slug: ADMIN_SLUG,
    display_name: 'Outbox Admin', real_name: 'Outbox Admin',
    login_email: ADMIN_EMAIL, is_admin: 1,
  });
  // Subscribe the admin to admin-alerts so the submit-side fan-out has a target.
  db.prepare(`
    INSERT INTO mailing_list_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      mailing_list_id, member_id, status, status_updated_at
    ) VALUES (?, ?, 'system', ?, 'system', 1, 'admin-alerts', ?, 'subscribed', ?)
  `).run(`mls-${ADMIN_ID}`, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z', ADMIN_ID, '2025-01-01T00:00:00.000Z');
  db.close();

  createApp = await importApp();
  const sesMod = await import('../../src/adapters/sesAdapter');
  getSesAdapter = sesMod.getSesAdapter;
  resetSesAdapterForTests = sesMod.resetSesAdapterForTests;
  const capMod = await import('../../src/testkit/devOutboxCaptureClient');
  resetDevOutboxCaptureClientForTests = capMod.resetDevOutboxCaptureClientForTests;
  const opsMod = await import('../../src/services/operationsPlatformService');
  operationsPlatformService = opsMod.operationsPlatformService;
  const commsMod = await import('../../src/services/communicationService');
  resetCommunicationServiceForTests = commsMod.resetCommunicationServiceForTests;
});

afterAll(() => {
  resetSesAdapterForTests();
  resetDevOutboxCaptureClientForTests();
  cleanupTestDb(dbPath);
});

// Per-test isolation: a fresh stub buffer and the real (worker-unreachable)
// capture client, plus empty queue + outbox tables so each round trip starts
// from zero captured messages. The communication service captures the SES
// adapter at construction, so it is reset alongside the adapter; otherwise the
// drain would send through a stale stub instance the viewer never reads.
beforeEach(() => {
  resetCommunicationServiceForTests();
  resetSesAdapterForTests();
  getSesAdapter();
  resetDevOutboxCaptureClientForTests();
  const db = new BetterSqlite3(dbPath);
  db.prepare(`DELETE FROM work_queue_items`).run();
  db.prepare(`DELETE FROM outbox_emails`).run();
  db.close();
});

// Submit a contact request through the public form and return the open
// work_queue_items id the service generated.
async function submitContactRequest(): Promise<string> {
  const res = await request(createApp())
    .post(`/members/${SUBMITTER_SLUG}/contact-admin`)
    .set('Cookie', submitterCookie())
    .type('form')
    .send({ category: 'display_name_correction', message: 'Please fix the spelling of my surname.' });
  expect(res.status).toBe(303);
  const db = new BetterSqlite3(dbPath);
  const row = db
    .prepare(`SELECT id FROM work_queue_items WHERE entity_id = ? AND status = 'open'`)
    .get(SUBMITTER_ID) as { id: string } | undefined;
  db.close();
  return row!.id;
}

// Drain pending outbox rows through the stub adapter, exactly as the running
// worker does, so the captured messages reach the in-process buffer the viewer
// reads.
async function drainOutbox(): Promise<void> {
  await operationsPlatformService.runEmailWorker();
}

describe('Dev outbox captures the contact-request round trip', () => {
  it('raises no per-event alert for a routine contact request, and rolls it into the admin digest at /dev/outbox', async () => {
    await submitContactRequest();
    await drainOutbox();

    // A routine work-queue item sends no immediate admin email.
    let res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('New admin queue item');

    // The scheduled digest rolls the open routine item up to each subscribed
    // admin, which the operator then sees captured at /dev/outbox.
    await operationsPlatformService.runAdminQueueDigest();
    await drainOutbox();

    res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.text).toContain('IFPA admin work queue');
    expect(res.text).toContain(ADMIN_EMAIL);
  });

  it('lists the request in the admin work queue and renders the resolution email at /dev/outbox when an admin resolves it', async () => {
    const queueId = await submitContactRequest();

    const listed = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(listed.status).toBe(200);
    expect(listed.text).toContain('Member contact request');
    expect(listed.text).toContain('Display name correction');
    expect(listed.text).toContain(`href="/members/${SUBMITTER_SLUG}"`);

    const resolved = await request(createApp())
      .post(`/admin/work-queue/${queueId}/resolve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ decision_label: 'corrected', resolution_note: 'Fixed your display name.' });
    expect(resolved.status).toBe(303);

    await drainOutbox();

    const res = await request(createApp()).get('/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your IFPA contact request: Corrected');
    expect(res.text).toContain(SUBMITTER_EMAIL);
    expect(res.text).toContain('Fixed your display name.');
  });
});
