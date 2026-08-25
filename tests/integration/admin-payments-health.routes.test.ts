/**
 * Admin payments-health page contract: the page reports which credential the
 * running process holds beside the mode the deployment declares, whether
 * webhook deliveries are arriving and being accepted, rejected deliveries
 * counted by reason over an administrator-configurable window, settled volume
 * by category and currency, and the outstanding reconciliation count. It is
 * admin-only, read-only, and offers no control: halting payments and rotating
 * keys are System Administrator actions run by script.
 *
 * The failure counts come from a bucketed counter table rather than one row per
 * delivery, because the webhook endpoint is public and unauthenticated by
 * design; these cases pin that the counter increments in place.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertPayment,
  insertSystemConfig,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4091');
process.env.PAYMENT_ADAPTER = 'stub';

const ADMIN_ID    = 'ph_admin_001';
const ADMIN_SLUG  = 'ph_admin_one';
const MEMBER_ID   = 'ph_member_001';
const MEMBER_SLUG = 'ph_member_one';

const HOUR_MS = 60 * 60 * 1000;
const HOURS_AGO = (h: number) => new Date(Date.now() - h * HOUR_MS).toISOString();

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

async function healthPage(): Promise<string> {
  const res = await request(createApp()).get('/admin/payments/health').set('Cookie', adminCookie());
  expect(res.status).toBe(200);
  return res.text;
}

/** The count cell of the rejection row for one reason. The table renders a
 *  fixed row per reason, so the assertion targets that row rather than hunting
 *  the page for a bare number that could come from anywhere. */
function rejectionCountFor(html: string, reasonLabel: string): number {
  const row = new RegExp(`<td>${reasonLabel}</td>\\s*<td>(?:<span class="badge badge-warn">)?(\\d+)`);
  const match = row.exec(html);
  expect(match, `no rejection row for reason ${reasonLabel}`).not.toBeNull();
  return Number(match![1]);
}

function recordFailure(reason: string, opts: { bucket?: string; count?: number } = {}): void {
  const bucket = opts.bucket ?? new Date(Math.floor(Date.now() / 300000) * 300000).toISOString();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 90 * 86400000).toISOString();
  withDb((db) => {
    for (let i = 0; i < (opts.count ?? 1); i += 1) {
      db.prepare(`
        INSERT INTO stripe_webhook_failures
          (bucket_start, reason, failure_count, first_seen_at, last_seen_at, last_event_type, last_event_id, expires_at)
        VALUES (?, ?, 1, ?, ?, NULL, NULL, ?)
        ON CONFLICT(bucket_start, reason) DO UPDATE SET failure_count = failure_count + 1
      `).run(bucket, reason, now, now, expires);
    }
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'PH Admin',  real_name: 'PH Admin',  login_email: 'ph-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'PH Member', real_name: 'PH Member', login_email: 'ph-member@example.com' });
  db.exec(`DROP TRIGGER IF EXISTS trg_system_config_no_update; DROP TRIGGER IF EXISTS trg_system_config_no_delete;`);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM stripe_webhook_failures').run();
    db.prepare('DELETE FROM stripe_events').run();
    db.prepare('DELETE FROM payments').run();
    db.prepare('DELETE FROM reconciliation_issues').run();
    db.prepare(`DELETE FROM system_config WHERE config_key IN ('system_health_window_hours','payments_paused')`).run();
  });
});

describe('GET /admin/payments/health', () => {
  it('unauthenticated visitors are sent to log in', async () => {
    const res = await request(createApp()).get('/admin/payments/health');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('an authenticated non-admin is refused', async () => {
    const res = await request(createApp())
      .get('/admin/payments/health')
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('renders for an admin with nothing recorded yet', async () => {
    const html = await healthPage();
    expect(html).toContain('Payments Health');
    // Every reason renders even at zero: "none" and "not measured" must not
    // look the same to whoever is reading this during an incident.
    expect(rejectionCountFor(html, 'Signature rejected')).toBe(0);
    expect(rejectionCountFor(html, 'Processing failed, retry asked for')).toBe(0);
    expect(rejectionCountFor(html, 'Unexpected error')).toBe(0);
    expect(html).toContain('never');
  });
});

describe('webhook rejection counts', () => {
  it('counts rejections by reason inside the window', async () => {
    recordFailure('signature', { count: 3 });
    recordFailure('recoverable', { count: 1 });
    const html = await healthPage();
    expect(rejectionCountFor(html, 'Signature rejected')).toBe(3);
    expect(rejectionCountFor(html, 'Processing failed, retry asked for')).toBe(1);
    expect(rejectionCountFor(html, 'Unexpected error')).toBe(0);
  });

  it('increments one bucket in place rather than adding a row per delivery', () => {
    recordFailure('signature', { count: 5 });
    const rows = withDb((db) => db.prepare(
      "SELECT failure_count FROM stripe_webhook_failures WHERE reason = 'signature'",
    ).all() as { failure_count: number }[]);
    // One row, holding five. A row per delivery would let anything on the
    // internet inflate the database that holds the money records.
    expect(rows).toHaveLength(1);
    expect(rows[0].failure_count).toBe(5);
  });

  it('leaves rejections older than the window out of the count', async () => {
    recordFailure('signature', { bucket: HOURS_AGO(48), count: 4 });
    recordFailure('signature', { count: 1 });
    const html = await healthPage();
    expect(rejectionCountFor(html, 'Signature rejected')).toBe(1);
  });

  it('widens the window when the administrator configures a longer one', async () => {
    recordFailure('signature', { bucket: HOURS_AGO(48), count: 4 });
    withDb((db) => insertSystemConfig(db, {
      config_key: 'system_health_window_hours', value_json: '96',
    }));
    const html = await healthPage();
    expect(rejectionCountFor(html, 'Signature rejected')).toBe(4);
  });

  it('survives a nonsensical configured window rather than emptying or throwing', async () => {
    recordFailure('signature', { count: 2 });
    withDb((db) => insertSystemConfig(db, {
      config_key: 'system_health_window_hours', value_json: '-5',
    }));
    const html = await healthPage();
    expect(rejectionCountFor(html, 'Signature rejected')).toBe(2);
  });
});

describe('webhook silence', () => {
  it('warns when nothing has been processed for a long time', async () => {
    withDb((db) => db.prepare(
      `INSERT INTO stripe_events (event_id, created_at, event_type, stripe_created, processed_at)
       VALUES ('evt_old', ?, 'payment_intent.succeeded', ?, ?)`,
    ).run(HOURS_AGO(200), HOURS_AGO(200), HOURS_AGO(200)));
    const html = await healthPage();
    expect(html).toContain('Nothing has been processed for more than');
  });

  it('does not warn when a delivery landed recently', async () => {
    withDb((db) => db.prepare(
      `INSERT INTO stripe_events (event_id, created_at, event_type, stripe_created, processed_at)
       VALUES ('evt_fresh', ?, 'payment_intent.succeeded', ?, ?)`,
    ).run(HOURS_AGO(1), HOURS_AGO(1), HOURS_AGO(1)));
    const html = await healthPage();
    expect(html).not.toContain('Nothing has been processed for more than');
  });
});

describe('settled volume', () => {
  it('groups by category and never sums two currencies into one figure', async () => {
    withDb((db) => {
      insertPayment(db, {
        id: 'ph-pay-usd', member_id: MEMBER_ID, created_at: HOURS_AGO(2),
        status: 'succeeded', amount_cents: 2500, currency: 'USD', payment_type: 'donation',
      });
      insertPayment(db, {
        id: 'ph-pay-eur', member_id: MEMBER_ID, created_at: HOURS_AGO(2),
        status: 'succeeded', amount_cents: 2500, currency: 'EUR', payment_type: 'donation',
      });
    });
    const html = await healthPage();
    // Two rows, each carrying its own currency code, and no invented symbol in
    // front of either: a dollar sign before a euro total is a false statement.
    expect(html).toContain('25.00 USD');
    expect(html).toContain('25.00 EUR');
    expect(html).not.toContain('$25.00');
  });

  it('leaves unsettled payments out of the volume', async () => {
    withDb((db) => insertPayment(db, {
      id: 'ph-pay-pending', member_id: MEMBER_ID, created_at: HOURS_AGO(2),
      status: 'pending', amount_cents: 9900, currency: 'USD', payment_type: 'membership',
    }));
    const html = await healthPage();
    expect(html).toContain('Nothing settled in this window.');
  });
});

describe('the read-only contract', () => {
  it('offers no control that acts on payments', async () => {
    // The site chrome carries its own forms (log out, search), so the assertion
    // is about this page's own content: nothing here posts anywhere, and in
    // particular nothing offers to pause payments or touch a key.
    const html = await healthPage();
    expect(html).not.toMatch(/<form[^>]*action="\/admin\/payments/);
    expect(html).not.toMatch(/method="post"[^>]*action="\/admin\/payments/i);
    expect(html).not.toContain('Pause payments');
    expect(html).not.toContain('Rotate');
  });

  it('shows no key identifier, key fragment or key age', async () => {
    const html = await healthPage();
    expect(html).toContain('No key identifier, key fragment or key age is shown here.');
    expect(html).not.toMatch(/sk_(live|test)_/);
  });

  it('reports the running credential mode beside the declared one', async () => {
    const html = await healthPage();
    expect(html).toContain('Credential this process is running with');
    expect(html).toContain('Mode this deployment declares');
  });

  it('raises no half-applied-arming warning outside production, where the two figures are not comparable', async () => {
    // The arming switch has no meaning outside production and defaults to
    // armed, while the adapter is always the stub and always reports test. The
    // comparison there is a default against a constant, so warning on it would
    // put a permanent banner on every development and staging environment, and
    // a banner that is always on is one nobody reads. This is the single signal
    // that a live-money change half-applied, so it is the last one that can
    // afford to become noise.
    const html = await healthPage();
    expect(html).not.toContain('does not match the declared');
  });

  it('names the pause state and the operator procedure that clears it', async () => {
    withDb((db) => insertSystemConfig(db, {
      config_key: 'payments_paused', value_json: '1',
    }));
    const html = await healthPage();
    expect(html).toContain('New purchases and donations are refused.');
    expect(html).toContain('payments-pause script');
  });

  it('says when the declared mode last changed once a boot has recorded it, and not before', async () => {
    const before = await healthPage();
    expect(before).toContain('not yet recorded');

    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    const first = operationsPlatformService.recordDeclaredPaymentMode(new Date('2026-07-01T10:00:00.000Z'));
    expect(first.changed).toBe(true);
    // A restart on the same declared mode appends nothing: the table records
    // changes, not boots.
    const again = operationsPlatformService.recordDeclaredPaymentMode(new Date('2026-07-02T10:00:00.000Z'));
    expect(again.changed).toBe(false);
    const rows = withDb((db) => (db.prepare(
      "SELECT COUNT(*) AS c FROM system_config WHERE config_key = 'payments_declared_mode'",
    ).get() as { c: number }).c);
    expect(rows).toBe(1);

    const after = await healthPage();
    expect(after).toContain('Declared mode last changed');
    expect(after).not.toContain('not yet recorded');
    expect(after).toContain('2026-07-01');
  });
});

describe('what the settled volume counts', () => {
  it('counts real money only, says what it set aside, and names where fees and payouts live', async () => {
    withDb((db) => {
      insertPayment(db, {
        id: 'ph-vol-live', member_id: MEMBER_ID, payment_type: 'donation', status: 'succeeded',
        amount_cents: 5000, created_at: HOURS_AGO(1), provider_livemode: 1,
      });
      insertPayment(db, {
        id: 'ph-vol-test', member_id: MEMBER_ID, payment_type: 'donation', status: 'succeeded',
        amount_cents: 7000, created_at: HOURS_AGO(1), provider_livemode: 0,
      });
    });
    const html = await healthPage();
    expect(html).toContain('50.00 USD');
    expect(html).not.toContain('120.00 USD');
    expect(html).toContain('Set aside: 1 test-mode payment.');
    expect(html).toContain('book of record for money movement');
    expect(html).toContain('Go to Financial Reports');
  });
});
