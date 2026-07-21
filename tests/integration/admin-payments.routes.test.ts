/**
 * Admin payments routes: the All Payments list and its filters, the payment
 * detail with its read-only donor note, the Reconciliation Issues queue with its
 * status filter, and the resolve action.
 *
 * These sit behind the admin gate, so a non-admin is refused and an anonymous
 * visitor is sent to login. Route ordering matters here: the literal
 * reconciliation paths must win over the payment-id path, or the queue would be
 * looked up as a payment.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4035');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import plainRequest from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember, insertPayment, createTestSessionJwt } from '../fixtures/factories';

const ADMIN = 'adminpay-admin';
const MEMBER = 'adminpay-member';
const NOW = new Date('2026-07-20T03:00:00.000Z');
const IN_WINDOW = '2026-07-18T12:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookie(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId, ttlSeconds: 24 * 60 * 60 })}`;
}

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN, slug: 'adminpay_admin', display_name: 'Admin Pay', login_email: 'ap@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER, slug: 'adminpay_member', display_name: 'Member Pay', login_email: 'mp@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
  const db = openDb();
  try {
    db.prepare('DELETE FROM reconciliation_issues').run();
    db.prepare('DELETE FROM work_queue_items').run();
    db.prepare('DELETE FROM payments').run();
  } finally {
    db.close();
  }
});

function seedPayments(): void {
  const db = openDb();
  try {
    insertPayment(db, {
      id: 'pay-don', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
      status: 'succeeded', amount_cents: 2500, descriptor: 'Donation: HoF Fund',
      donation_note: 'In memory of a friend', stripe_payment_intent_id: 'pi_don',
    });
    insertPayment(db, {
      id: 'pay-mem', member_id: MEMBER, payment_type: 'membership', created_at: IN_WINDOW,
      status: 'pending', amount_cents: 1000, descriptor: 'IFPA Tier 1 Membership',
      stripe_payment_intent_id: 'pi_mem',
    });
  } finally {
    db.close();
  }
}

async function seedOneIssue(): Promise<string> {
  const db = openDb();
  try {
    insertPayment(db, {
      id: 'pay-iss', member_id: MEMBER, created_at: IN_WINDOW,
      status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_iss',
    });
  } finally {
    db.close();
  }
  const { paymentReconciliationService } = await import('../../src/services/paymentReconciliationService');
  await paymentReconciliationService.runReconciliation({ now: NOW });
  const read = openDb();
  try {
    return (read.prepare('SELECT id FROM reconciliation_issues LIMIT 1').get() as { id: string }).id;
  } finally {
    read.close();
  }
}

describe('GET /admin/payments', () => {
  it('redirects the unauthenticated to login and refuses an authenticated non-admin', async () => {
    const anon = await plainRequest(createApp()).get('/admin/payments');
    expect(anon.status).toBe(302);
    const member = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(MEMBER));
    expect(member.status).toBe(403);
  });

  it('renders an empty state for an admin when nothing matches', async () => {
    const res = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain('No payments match your search.');
  });

  it('lists every payment type by default', async () => {
    seedPayments();
    const res = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain('pi_don');
    expect(res.text).toContain('pi_mem');
  });

  it('filters by type', async () => {
    seedPayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments?type=donation').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('pi_don');
    expect(res.text).not.toContain('pi_mem');
  });

  it('filters by status', async () => {
    seedPayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments?status=pending').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('pi_mem');
    expect(res.text).not.toContain('pi_don');
  });

  it('filters by date range', async () => {
    seedPayments();
    const outside = await plainRequest(createApp())
      .get('/admin/payments?from=2027-01-01').set('Cookie', cookie(ADMIN));
    expect(outside.text).toContain('No payments match your search.');
    const inside = await plainRequest(createApp())
      .get('/admin/payments?from=2026-07-01&to=2026-08-01').set('Cookie', cookie(ADMIN));
    expect(inside.text).toContain('pi_don');
  });

  it('finds a payment by its provider reference as well as its own id', async () => {
    seedPayments();
    const byIntent = await plainRequest(createApp())
      .get('/admin/payments?reference=pi_don').set('Cookie', cookie(ADMIN));
    expect(byIntent.text).toContain('pi_don');
    expect(byIntent.text).not.toContain('pi_mem');
    const byId = await plainRequest(createApp())
      .get('/admin/payments?reference=pay-mem').set('Cookie', cookie(ADMIN));
    expect(byId.text).toContain('pi_mem');
  });

  it('filters by member', async () => {
    seedPayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments?member=nobody').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('No payments match your search.');
  });
});

describe('GET /admin/payments/:paymentId', () => {
  it('shows the donor note as a read-only record, with no control to change it', async () => {
    seedPayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments/pay-don').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain('In memory of a friend');
    expect(res.text).toContain('not editable');
    expect(res.text).not.toContain('name="donationNote"');
  });

  it('shows no donor-note block for a payment that carries none', async () => {
    seedPayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments/pay-mem').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Donor note');
  });

  it('resolves by payment id, not by a provider reference that happens to collide', async () => {
    // The detail page used to reuse the multi-column reference filter with a
    // single-row limit, so a payment whose id matched another row's provider id
    // resolved to the wrong row and answered 404 for a payment that exists.
    const db = openDb();
    try {
      insertPayment(db, {
        id: 'pay-collide', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 500, descriptor: 'Collides by id',
      });
      insertPayment(db, {
        id: 'pay-decoy', member_id: MEMBER, created_at: '2026-07-19T12:00:00.000Z',
        status: 'succeeded', amount_cents: 700, descriptor: 'Decoy',
        stripe_payment_intent_id: 'pay-collide',
      });
    } finally {
      db.close();
    }
    const res = await plainRequest(createApp())
      .get('/admin/payments/pay-collide').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Collides by id');
    expect(res.text).not.toContain('Decoy');
  });

  it('404s an unknown payment id', async () => {
    const res = await plainRequest(createApp())
      .get('/admin/payments/pay-nope').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(404);
  });

  it('refuses an authenticated non-admin', async () => {
    seedPayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments/pay-don').set('Cookie', cookie(MEMBER));
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/payments/reconciliation', () => {
  it('resolves to the queue rather than being read as a payment id', async () => {
    const res = await plainRequest(createApp())
      .get('/admin/payments/reconciliation').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Reconciliation Issues');
  });

  it('redirects the unauthenticated and refuses a non-admin', async () => {
    const anon = await plainRequest(createApp()).get('/admin/payments/reconciliation');
    expect(anon.status).toBe(302);
    const member = await plainRequest(createApp())
      .get('/admin/payments/reconciliation').set('Cookie', cookie(MEMBER));
    expect(member.status).toBe(403);
  });

  it('shows outstanding issues by default and hides resolved ones', async () => {
    const issueId = await seedOneIssue();
    const before = await plainRequest(createApp())
      .get('/admin/payments/reconciliation').set('Cookie', cookie(ADMIN));
    expect(before.text).toContain(issueId);

    await request(createApp())
      .post(`/admin/payments/reconciliation/${issueId}/resolve`)
      .set('Cookie', cookie(ADMIN))
      .type('form')
      .send({ notes: 'Checked and cleared.' });

    const after = await plainRequest(createApp())
      .get('/admin/payments/reconciliation').set('Cookie', cookie(ADMIN));
    expect(after.text).not.toContain(issueId);
  });

  it('shows a resolved issue with its resolver and note under the resolved and all filters', async () => {
    const issueId = await seedOneIssue();
    await request(createApp())
      .post(`/admin/payments/reconciliation/${issueId}/resolve`)
      .set('Cookie', cookie(ADMIN))
      .type('form')
      .send({ notes: 'A duplicate test charge.' });

    for (const status of ['resolved', 'all']) {
      const res = await plainRequest(createApp())
        .get(`/admin/payments/reconciliation?status=${status}`).set('Cookie', cookie(ADMIN));
      expect(res.text).toContain(issueId);
      expect(res.text).toContain('A duplicate test charge.');
      expect(res.text).toContain('adminpay_admin');
    }
  });

  it('falls back to outstanding for an unrecognised status filter', async () => {
    const issueId = await seedOneIssue();
    const res = await plainRequest(createApp())
      .get('/admin/payments/reconciliation?status=bogus').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain(issueId);
  });
});

describe('POST /admin/payments/reconciliation/:issueId/resolve', () => {
  it('resolves the issue and returns to the queue with a confirmation', async () => {
    const issueId = await seedOneIssue();
    const res = await request(createApp())
      .post(`/admin/payments/reconciliation/${issueId}/resolve`)
      .set('Cookie', cookie(ADMIN))
      .type('form')
      .send({ notes: 'Confirmed against the provider console.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/payments/reconciliation');

    const db = openDb();
    try {
      const row = db.prepare('SELECT status, resolution_notes FROM reconciliation_issues WHERE id = ?')
        .get(issueId) as { status: string; resolution_notes: string };
      expect(row.status).toBe('resolved');
      expect(row.resolution_notes).toBe('Confirmed against the provider console.');
    } finally {
      db.close();
    }
  });

  it('re-renders the queue at 422 with the reason when the note is missing', async () => {
    const issueId = await seedOneIssue();
    const res = await request(createApp())
      .post(`/admin/payments/reconciliation/${issueId}/resolve`)
      .set('Cookie', cookie(ADMIN))
      .type('form')
      .send({ notes: '   ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Explain what you did');

    const db = openDb();
    try {
      const row = db.prepare('SELECT status FROM reconciliation_issues WHERE id = ?')
        .get(issueId) as { status: string };
      expect(row.status).toBe('outstanding');
    } finally {
      db.close();
    }
  });

  it('404s an unknown issue id', async () => {
    const res = await request(createApp())
      .post('/admin/payments/reconciliation/rec_nope/resolve')
      .set('Cookie', cookie(ADMIN))
      .type('form')
      .send({ notes: 'x' });
    expect(res.status).toBe(404);
  });

  it('refuses a non-admin and redirects the unauthenticated', async () => {
    const issueId = await seedOneIssue();
    const member = await request(createApp())
      .post(`/admin/payments/reconciliation/${issueId}/resolve`)
      .set('Cookie', cookie(MEMBER))
      .type('form')
      .send({ notes: 'x' });
    expect(member.status).toBe(403);

    const anon = await request(createApp())
      .post(`/admin/payments/reconciliation/${issueId}/resolve`)
      .type('form')
      .send({ notes: 'x' });
    expect(anon.status).toBe(302);
  });

  it('rejects a resolve carrying no matching origin', async () => {
    const issueId = await seedOneIssue();
    const res = await plainRequest(createApp())
      .post(`/admin/payments/reconciliation/${issueId}/resolve`)
      .set('Cookie', cookie(ADMIN))
      .type('form')
      .send({ notes: 'x' });
    expect(res.status).toBe(403);
  });
});
