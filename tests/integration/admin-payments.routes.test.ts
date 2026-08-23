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
import {
  insertMember, insertPayment, insertEvent, insertRegistration, insertTag,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN = 'adminpay-admin';
const MEMBER = 'adminpay-member';
const NOW = new Date('2026-07-20T03:00:00.000Z');
const IN_WINDOW = '2026-07-18T12:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookie(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, ttlSeconds: 24 * 60 * 60 })}`;
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
    // Before the payments: a registration fee is reached from its registration,
    // and that reference is what a payment's event resolves through.
    db.prepare('DELETE FROM registrations').run();
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

  it('includes a payment dated on the To day, so a same-day search is not empty', async () => {
    seedPayments(); // pay-don is dated 2026-07-18
    const sameDay = await plainRequest(createApp())
      .get('/admin/payments?from=2026-07-18&to=2026-07-18').set('Cookie', cookie(ADMIN));
    expect(sameDay.text).toContain('pi_don');
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

  it("finds a member's payments by display name, login email, or profile handle", async () => {
    seedPayments();
    for (const handle of ['Member', 'mp@example.com', 'adminpay_member']) {
      const res = await plainRequest(createApp())
        .get(`/admin/payments?member=${encodeURIComponent(handle)}`).set('Cookie', cookie(ADMIN));
      expect(res.text, `member handle: ${handle}`).toContain('pi_don');
    }
  });

  it('finds a payment by its invoice id through the reference filter', async () => {
    const db = openDb();
    try {
      insertPayment(db, {
        id: 'pay-inv', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_invoice_id: 'in_search',
      });
    } finally {
      db.close();
    }
    const res = await plainRequest(createApp())
      .get('/admin/payments?reference=in_search').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('pay-inv');
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
    expect(res.text).not.toContain('Donor Note');
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

  it('renders the provider ids on an issue so an administrator can cross-reference in Stripe', async () => {
    await seedOneIssue(); // the issue carries stripe_payment_intent_id 'pi_iss'
    const res = await plainRequest(createApp())
      .get('/admin/payments/reconciliation').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('Payment Intent: pi_iss');
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

// ── Provider mode ─────────────────────────────────────────────────────────────
//
// A test-mode rehearsal and a real charge are otherwise indistinguishable on the
// admin surfaces: same amount, type, status, member and day, and the reference
// column shows a payment intent, which carries no mode marker of its own. The
// contract is that the two states an administrator must not read as real money
// are labelled, and live money is left unlabelled so a missing value can never
// pass for it.

function seedModedPayments(): void {
  const db = openDb();
  try {
    insertPayment(db, {
      id: 'pay-live', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
      status: 'succeeded', amount_cents: 1000, descriptor: 'Donation: live',
      stripe_payment_intent_id: 'pi_live', provider_livemode: 1,
    });
    insertPayment(db, {
      id: 'pay-test', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
      status: 'succeeded', amount_cents: 1000, descriptor: 'Donation: test',
      stripe_payment_intent_id: 'pi_test', provider_livemode: 0,
    });
    insertPayment(db, {
      id: 'pay-unknown', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
      status: 'succeeded', amount_cents: 1000, descriptor: 'Donation: unknown',
      stripe_payment_intent_id: 'pi_unknown', provider_livemode: null,
    });
  } finally {
    db.close();
  }
}

describe('All Payments provider-mode badge', () => {
  it('badges a test-mode payment and a row written before the mode was recorded', async () => {
    seedModedPayments();
    const res = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Test mode');
    expect(res.text).toContain('Unknown mode');
  });

  it('leaves a live payment unbadged, so the absence of a badge means real money', async () => {
    const db = openDb();
    try {
      insertPayment(db, {
        id: 'pay-live-only', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 1000, descriptor: 'Donation: live',
        stripe_payment_intent_id: 'pi_live_only', provider_livemode: 1,
      });
    } finally {
      db.close();
    }
    const res = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('pi_live_only');
    expect(res.text).not.toContain('Test mode');
    expect(res.text).not.toContain('Unknown mode');
  });

  it('badges the payment detail page the same way', async () => {
    seedModedPayments();
    const test = await plainRequest(createApp())
      .get('/admin/payments/pay-test').set('Cookie', cookie(ADMIN));
    expect(test.status).toBe(200);
    expect(test.text).toContain('Test mode');

    const unknown = await plainRequest(createApp())
      .get('/admin/payments/pay-unknown').set('Cookie', cookie(ADMIN));
    expect(unknown.text).toContain('Unknown mode');

    const live = await plainRequest(createApp())
      .get('/admin/payments/pay-live').set('Cookie', cookie(ADMIN));
    expect(live.text).not.toContain('Test mode');
    expect(live.text).not.toContain('Unknown mode');
  });
});

// ── Sorting and the event join ────────────────────────────────────────────────

function seedSortablePayments(): void {
  const db = openDb();
  try {
    insertPayment(db, {
      id: 'pay-cheap', member_id: MEMBER, payment_type: 'donation',
      created_at: '2026-07-10T12:00:00.000Z', status: 'succeeded', amount_cents: 500,
      descriptor: 'Donation: small', stripe_payment_intent_id: 'pi_cheap',
    });
    insertPayment(db, {
      id: 'pay-dear', member_id: MEMBER, payment_type: 'donation',
      created_at: '2026-07-12T12:00:00.000Z', status: 'succeeded', amount_cents: 9000,
      descriptor: 'Donation: large', stripe_payment_intent_id: 'pi_dear',
    });
  } finally {
    db.close();
  }
}

// Events and their hashtags outlive the per-test payment cleanup, and a hashtag
// is globally unique, so each seeding takes its own. Counted rather than
// randomised so a failure reproduces exactly.
let eventSeq = 0;

/** Seeds a registration fee wired to its event, plus an unrelated donation, and
 *  returns the event's id and the public key its page is served under. */
function seedEventPayment(): { eventId: string; eventKey: string } {
  const db = openDb();
  eventSeq += 1;
  const eventKey = `event_2026_admin_open_${eventSeq}`;
  try {
    const tagId = insertTag(db, { tag_normalized: `#${eventKey}` });
    const eventId = insertEvent(db, {
      hashtag_tag_id: tagId, title: `Admin Open 2026 #${eventSeq}`, start_date: '2026-07-01',
    });
    insertPayment(db, {
      id: 'pay-reg', member_id: MEMBER, payment_type: 'event_registration',
      created_at: IN_WINDOW, status: 'succeeded', amount_cents: 4000,
      descriptor: 'Registration: Admin Open', stripe_payment_intent_id: 'pi_reg',
    });
    insertRegistration(db, eventId, MEMBER, { payment_id: 'pay-reg' });
    insertPayment(db, {
      id: 'pay-plain', member_id: MEMBER, payment_type: 'donation',
      created_at: IN_WINDOW, status: 'succeeded', amount_cents: 1500,
      descriptor: 'Donation: unrelated', stripe_payment_intent_id: 'pi_plain',
    });
    return { eventId, eventKey };
  } finally {
    db.close();
  }
}

describe('All Payments sorting', () => {
  it('lists newest first by default', async () => {
    seedSortablePayments();
    const res = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(ADMIN));
    expect(res.text.indexOf('pi_dear')).toBeLessThan(res.text.indexOf('pi_cheap'));
  });

  it('reorders by amount in both directions', async () => {
    seedSortablePayments();
    const asc = await plainRequest(createApp())
      .get('/admin/payments?sort=amount_asc').set('Cookie', cookie(ADMIN));
    expect(asc.text.indexOf('pi_cheap')).toBeLessThan(asc.text.indexOf('pi_dear'));

    const desc = await plainRequest(createApp())
      .get('/admin/payments?sort=amount_desc').set('Cookie', cookie(ADMIN));
    expect(desc.text.indexOf('pi_dear')).toBeLessThan(desc.text.indexOf('pi_cheap'));
  });

  it('reorders by date ascending', async () => {
    seedSortablePayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments?sort=date_asc').set('Cookie', cookie(ADMIN));
    expect(res.text.indexOf('pi_cheap')).toBeLessThan(res.text.indexOf('pi_dear'));
  });

  it('sorts a payment carrying no member last, whichever direction is chosen', async () => {
    const db = openDb();
    try {
      insertPayment(db, {
        id: 'pay-nomember', member_id: null, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 700, descriptor: 'Donation: anonymous',
        stripe_payment_intent_id: 'pi_nomember',
      });
      insertPayment(db, {
        id: 'pay-withmember', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 700, descriptor: 'Donation: named',
        stripe_payment_intent_id: 'pi_withmember',
      });
    } finally {
      db.close();
    }
    const asc = await plainRequest(createApp())
      .get('/admin/payments?sort=member_asc').set('Cookie', cookie(ADMIN));
    expect(asc.text.indexOf('pi_withmember')).toBeLessThan(asc.text.indexOf('pi_nomember'));

    const desc = await plainRequest(createApp())
      .get('/admin/payments?sort=member_desc').set('Cookie', cookie(ADMIN));
    expect(desc.text.indexOf('pi_withmember')).toBeLessThan(desc.text.indexOf('pi_nomember'));
  });

  it('reorders by the reference the column actually shows', async () => {
    seedSortablePayments();
    const asc = await plainRequest(createApp())
      .get('/admin/payments?sort=reference_asc').set('Cookie', cookie(ADMIN));
    // pi_cheap precedes pi_dear alphabetically, the opposite of their date
    // order, so this cannot pass on the default ordering by accident.
    expect(asc.text.indexOf('pi_cheap')).toBeLessThan(asc.text.indexOf('pi_dear'));

    const desc = await plainRequest(createApp())
      .get('/admin/payments?sort=reference_desc').set('Cookie', cookie(ADMIN));
    expect(desc.text.indexOf('pi_dear')).toBeLessThan(desc.text.indexOf('pi_cheap'));
  });

  it('orders a renewal with no payment intent by the value its column shows', async () => {
    const db = openDb();
    try {
      // A subscription charge carries no intent, so ordering on the raw column
      // would file it with every other intent-less row instead of where the
      // reader sees it.
      // Deliberately arranged so the two orderings disagree: the intent-less
      // row sorts LAST by what the column shows, but SQLite puts nulls first,
      // so ordering on the raw intent column would put it first instead.
      insertPayment(db, {
        id: 'pay-sub', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2000, descriptor: 'Renewal',
        stripe_payment_intent_id: null, stripe_subscription_id: 'zzz_sub_last',
      });
      insertPayment(db, {
        id: 'pay-int', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2000, descriptor: 'One-time',
        stripe_payment_intent_id: 'aaa_pi_first',
      });
    } finally {
      db.close();
    }
    const res = await plainRequest(createApp())
      .get('/admin/payments?sort=reference_asc').set('Cookie', cookie(ADMIN));
    expect(res.text.indexOf('aaa_pi_first')).toBeLessThan(res.text.indexOf('zzz_sub_last'));
  });

  it('falls back to the default order for an unknown sort key rather than erroring', async () => {
    seedSortablePayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments?sort=amount_cents%3B+DROP+TABLE+payments').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text.indexOf('pi_dear')).toBeLessThan(res.text.indexOf('pi_cheap'));
    const db = openDb();
    try {
      const still = db.prepare('SELECT COUNT(*) AS c FROM payments').get() as { c: number };
      expect(still.c).toBe(2);
    } finally {
      db.close();
    }
  });

  it('carries the chosen order through a filter submit', async () => {
    seedSortablePayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments?sort=amount_asc').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('name="sort" value="amount_asc"');
  });

  it('marks the sorted column and offers the reverse on the next click', async () => {
    seedSortablePayments();
    const res = await plainRequest(createApp())
      .get('/admin/payments?sort=amount_asc').set('Cookie', cookie(ADMIN));
    // The active column states its direction to a screen reader as well as
    // through the glyph, and clicking it again reverses rather than re-sorting
    // the same way.
    expect(res.text).toContain('aria-sort="ascending"');
    // Handlebars escapes the `=` inside an href attribute, which the browser
    // decodes again; comparing against the decoded form keeps the assertion
    // about the destination rather than about the escaping.
    expect(res.text.replace(/&#x3D;/g, '=')).toContain('/admin/payments?sort=amount_desc');
  });
});

describe('All Payments event column and filter', () => {
  it('resolves a registration fee to its event and links to the event page', async () => {
    const { eventKey } = seedEventPayment();
    const res = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Admin Open 2026');
    expect(res.text).toContain(`/events/${eventKey}`);
  });

  it('shows no event for a donation, which settles no registration', async () => {
    const db = openDb();
    try {
      insertPayment(db, {
        id: 'pay-donation-only', member_id: MEMBER, payment_type: 'donation',
        created_at: IN_WINDOW, status: 'succeeded', amount_cents: 1500,
        descriptor: 'Donation: standalone', stripe_payment_intent_id: 'pi_donation_only',
      });
    } finally {
      db.close();
    }
    const res = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('pi_donation_only');
    expect(res.text).not.toContain('/events/event_');
  });

  it('narrows the list to one event, and the result count agrees with the rows shown', async () => {
    const { eventId } = seedEventPayment();
    const res = await plainRequest(createApp())
      .get(`/admin/payments?event=${eventId}`).set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('pi_reg');
    expect(res.text).not.toContain('pi_plain');
    // The count is built over its own SQL, so a join present in one and absent
    // from the other would show "2 payments" above a single row.
    expect(res.text).toContain('1 payment');
  });

  it('offers only events that actually have payments against them', async () => {
    seedEventPayment();
    const db = openDb();
    try {
      const tagId = insertTag(db, { tag_normalized: '#event_2026_no_payments' });
      insertEvent(db, { hashtag_tag_id: tagId, title: 'Unpaid Gathering 2026' });
    } finally {
      db.close();
    }
    const res = await plainRequest(createApp()).get('/admin/payments').set('Cookie', cookie(ADMIN));
    expect(res.text).toContain('Admin Open 2026');
    expect(res.text).not.toContain('Unpaid Gathering 2026');
  });

  it('shows the event on the detail page of a registration fee, and omits it otherwise', async () => {
    seedEventPayment();
    const reg = await plainRequest(createApp())
      .get('/admin/payments/pay-reg').set('Cookie', cookie(ADMIN));
    expect(reg.status).toBe(200);
    expect(reg.text).toContain('Admin Open 2026');

    const plain = await plainRequest(createApp())
      .get('/admin/payments/pay-plain').set('Cookie', cookie(ADMIN));
    expect(plain.text).not.toContain('Admin Open 2026');
  });
});
