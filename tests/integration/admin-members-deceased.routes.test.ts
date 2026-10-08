/**
 * Marking a member deceased from the administrator member record.
 *
 * Covers the marking and its cascade to a linked historical record, the
 * withdrawal from events that have not happened yet alongside the completed
 * event that must survive it, the reversal inside the grace period and its
 * refusal outside one, and the contributions the marking is required to leave
 * untouched: honours, uploaded media attribution, and competition history.
 *
 * Also covers what the marking must NOT collect. No surface asks for free text
 * about the death, and a request carrying some anyway stores none: the audit
 * ledger is append-only and beyond the reach of both erasure paths, so text
 * about a named person landing there would outlive every erasure the platform
 * can perform.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertHistoricalPerson, insertEvent, createTestSessionJwt,
  insertRegistration, insertOutboxEmail, insertRecurringDonationSubscription,
  insertSystemConfig, insertEventOrganizer,
} from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('3431');
process.env.PAYMENT_ADAPTER = 'stub';

const ADMIN_ID = 'dm_admin';
const PLAIN_ID = 'dm_plain';
const LINKED_ID = 'dm_linked';
const HONOURED_ID = 'dm_honoured';
const REVERT_ID = 'dm_revert';
const STALE_ID = 'dm_stale';
const PROBE_ID = 'dm_probe';
const QUEUED_ID = 'dm_queued';
const DONOR_ID = 'dm_donor';
const ENDED_DONOR_ID = 'dm_ended_donor';
const DECLINED_DONOR_ID = 'dm_declined_donor';

const DONOR_SUB = 'sub_dm_donor';
const ENDED_SUB = 'sub_dm_ended';
const DECLINED_SUB = 'sub_dm_declined';

const PERSON_ID = 'dm_person_1';
const UNLINKED_PERSON_ID = 'dm_person_2';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

async function mark(memberId: string): Promise<number> {
  const res = await request(createApp())
    .post(`/admin/members/${memberId}/deceased/confirm`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({});
  return res.status;
}

async function revert(memberId: string): Promise<number> {
  const res = await request(createApp())
    .post(`/admin/members/${memberId}/deceased/revert/confirm`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({});
  return res.status;
}

function memberRow(memberId: string): { is_deceased: number; deceased_at: string | null } {
  return db((conn) => conn.prepare(
    `SELECT is_deceased, deceased_at FROM members WHERE id = ?`,
  ).get(memberId)) as { is_deceased: number; deceased_at: string | null };
}

function auditCount(actionType: string, entityId: string): number {
  return (db((conn) => conn.prepare(
    `SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = ? AND entity_id = ?`,
  ).get(actionType, entityId)) as { c: number }).c;
}

function auditRows(entityId: string): { reason_text: string | null; metadata_json: string | null }[] {
  return db((conn) => conn.prepare(
    `SELECT reason_text, metadata_json FROM audit_entries
     WHERE entity_id = ? AND action_type IN ('member.deceased_marked', 'member.deceased_reverted')
     ORDER BY id`,
  ).all(entityId)) as { reason_text: string | null; metadata_json: string | null }[];
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'dm_admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'dm-admin@example.com', is_admin: 1,
  });
  for (const [id, name] of [
    [PLAIN_ID, 'Pat Plain'], [REVERT_ID, 'Rex Revert'], [STALE_ID, 'Stan Stale'],
    [PROBE_ID, 'Percy Probe'], [QUEUED_ID, 'Quinn Queued'],
    [DONOR_ID, 'Dora Donor'], [ENDED_DONOR_ID, 'Eddie Ended'], [DECLINED_DONOR_ID, 'Dee Declined'],
  ] as const) {
    insertMember(conn, {
      id, slug: id, display_name: name, real_name: name, login_email: `${id}@example.com`,
    });
  }

  insertHistoricalPerson(conn, { person_id: PERSON_ID, person_name: 'Linked Legend' });
  insertHistoricalPerson(conn, { person_id: UNLINKED_PERSON_ID, person_name: 'Unlinked Legend' });
  insertMember(conn, {
    id: LINKED_ID, slug: LINKED_ID, display_name: 'Lena Linked', real_name: 'Lena Linked',
    login_email: 'dm-linked@example.com', historical_person_id: PERSON_ID,
  });
  insertMember(conn, {
    id: HONOURED_ID, slug: HONOURED_ID, display_name: 'Honor Bright', real_name: 'Honor Bright',
    login_email: 'dm-honoured@example.com', is_hof: 1, is_bap: 1, hof_inducted_year: 1998,
  });

  // One event still ahead and one already finished, so the withdrawal can be
  // shown to reach exactly the first.
  insertEvent(conn, { id: 'dm_event_future', title: 'Next Worlds', start_date: '2099-07-01', end_date: '2099-07-05' });
  insertEvent(conn, { id: 'dm_event_past', title: 'Past Worlds', start_date: '2019-07-01', end_date: '2019-07-05' });
  for (const [rid, eid] of [['dm_reg_future', 'dm_event_future'], ['dm_reg_past', 'dm_event_past']] as const) {
    insertRegistration(conn, eid, PLAIN_ID, { id: rid });
  }

  insertRecurringDonationSubscription(conn, {
    id: 'rds_dm_donor', member_id: DONOR_ID, stripe_subscription_id: DONOR_SUB,
  });
  // One cancellation attempt per member per hour, which the donor case below
  // uses up before the marking. The administrator's one cancellation per
  // marking is not a member's double submit and must not be refused as one.
  insertSystemConfig(conn, { config_key: 'donation_rate_limit_per_hour', value_json: '1' });
  insertRecurringDonationSubscription(conn, {
    id: 'rds_dm_ended', member_id: ENDED_DONOR_ID, stripe_subscription_id: ENDED_SUB,
    status: 'canceled', canceled_at: '2025-01-01T00:00:00.000Z',
  });
  insertRecurringDonationSubscription(conn, {
    id: 'rds_dm_declined', member_id: DECLINED_DONOR_ID, stripe_subscription_id: DECLINED_SUB,
  });

  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('marking a member deceased', () => {
  it('sets the flag, withdraws only the future registration, and audits the whole thing', async () => {
    expect(await mark(PLAIN_ID)).toBe(303);

    const row = memberRow(PLAIN_ID);
    expect(row.is_deceased).toBe(1);
    expect(row.deceased_at).not.toBeNull();

    const future = db((conn) => conn.prepare(
      `SELECT status, cancel_reason FROM registrations WHERE id = 'dm_reg_future'`,
    ).get()) as { status: string; cancel_reason: string | null };
    const past = db((conn) => conn.prepare(
      `SELECT status FROM registrations WHERE id = 'dm_reg_past'`,
    ).get()) as { status: string };

    expect(future.status).toBe('canceled');
    expect(future.cancel_reason).toBe('Member deceased');
    // The finished event is part of the record this marking exists to preserve.
    expect(past.status).toBe('confirmed');

    expect(auditCount('member.deceased_marked', PLAIN_ID)).toBe(1);
  });

  // Defect caught: mail queued before the marking (a club notice held behind an
  // operator pause, say) still drains to the family afterwards.
  it('stops mail already queued to the member, and leaves what was sent alone', async () => {
    const ids = db((conn) => ({
      queued: insertOutboxEmail(conn, {
        recipient_member_id: QUEUED_ID, recipient_email: `${QUEUED_ID}@example.com`, status: 'pending',
      }),
      sent: insertOutboxEmail(conn, {
        recipient_member_id: QUEUED_ID, recipient_email: `${QUEUED_ID}@example.com`, status: 'sent',
      }),
    }));

    expect(await mark(QUEUED_ID)).toBe(303);

    const rows = db((conn) => ({
      queued: conn.prepare('SELECT status, last_error, body_text FROM outbox_emails WHERE id = ?')
        .get(ids.queued) as { status: string; last_error: string | null; body_text: string | null },
      sent: conn.prepare('SELECT status FROM outbox_emails WHERE id = ?')
        .get(ids.sent) as { status: string },
    }));
    expect(rows.queued.status).toBe('dead_letter');
    expect(rows.queued.last_error).toBe('recipient_deceased');
    expect(rows.queued.body_text).toBeNull();
    expect(rows.sent.status).toBe('sent');
  });

  it('refuses a second marking rather than writing a second audit row', async () => {
    expect(await mark(PLAIN_ID)).toBe(422);
    expect(auditCount('member.deceased_marked', PLAIN_ID)).toBe(1);
  });

  it('records the consequences and no free text on the audit row', async () => {
    const rows = auditRows(PLAIN_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason_text).toBeNull();

    // What makes the action reviewable is what it did, not a sentence about
    // why: the cascade and the registrations it withdrew.
    const metadata = JSON.parse(rows[0]!.metadata_json ?? '{}') as Record<string, unknown>;
    expect(metadata['registrations_withdrawn']).toBe(1);
    expect(metadata['cascaded_to_historical_person']).toBe(false);
  });

  it('asks the administrator to confirm on a page naming the member, with no reason to type', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${PROBE_ID}/deceased`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(200);
    expect(res.text).toContain('Percy Probe');
    expect(res.text).toContain(PROBE_ID);
    expect(res.text).not.toContain('name="reason"');
    expect(res.text).not.toContain('Reason:');
    // Reviewing the change must not be what performs it.
    expect(memberRow(PROBE_ID).is_deceased).toBe(0);
  });

  it('stores nothing from a request that supplies free text anyway', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${PROBE_ID}/deceased/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'family said it was cancer' });
    expect(res.status).toBe(303);
    expect(memberRow(PROBE_ID).is_deceased).toBe(1);

    expect(auditRows(PROBE_ID).every((r) => r.reason_text === null)).toBe(true);
    const hits = db((conn) => conn.prepare(
      `SELECT COUNT(*) AS c FROM audit_entries
       WHERE COALESCE(reason_text, '') || COALESCE(metadata_json, '') LIKE '%cancer%'`,
    ).get()) as { c: number };
    expect(hits.c).toBe(0);
  });

  it('marks a linked historical record to match, so the two surfaces agree', async () => {
    expect(await mark(LINKED_ID)).toBe(303);
    const person = db((conn) => conn.prepare(
      `SELECT is_deceased FROM historical_persons WHERE person_id = ?`,
    ).get(PERSON_ID)) as { is_deceased: number };
    expect(person.is_deceased).toBe(1);
  });

  it('leaves the honours and the induction year exactly as they were', async () => {
    expect(await mark(HONOURED_ID)).toBe(303);
    const row = db((conn) => conn.prepare(
      `SELECT is_hof, is_bap, hof_inducted_year, display_name FROM members WHERE id = ?`,
    ).get(HONOURED_ID)) as {
      is_hof: number; is_bap: number; hof_inducted_year: number; display_name: string;
    };
    expect(row.is_hof).toBe(1);
    expect(row.is_bap).toBe(1);
    expect(row.hof_inducted_year).toBe(1998);
    expect(row.display_name).toBe('Honor Bright');
  });
});

describe('the same flag on a record nobody has claimed', () => {
  it('records and then removes it, auditing the record rather than a member', async () => {
    const setRes = await request(createApp())
      .post(`/admin/historical-records/${UNLINKED_PERSON_ID}/deceased/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(setRes.status).toBe(303);
    expect(auditCount('member.deceased_marked', UNLINKED_PERSON_ID)).toBe(1);
    expect(auditRows(UNLINKED_PERSON_ID).every((r) => r.reason_text === null)).toBe(true);

    const unsetRes = await request(createApp())
      .post(`/admin/historical-records/${UNLINKED_PERSON_ID}/deceased/revert/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(unsetRes.status).toBe(303);
    const person = db((conn) => conn.prepare(
      `SELECT is_deceased FROM historical_persons WHERE person_id = ?`,
    ).get(UNLINKED_PERSON_ID)) as { is_deceased: number };
    expect(person.is_deceased).toBe(0);
  });

  it('refuses a direct request against a record somebody holds', async () => {
    // Hiding the control on the listing is not a rule. A request that arrives
    // anyway would leave the record marked while the living member's own row
    // stayed clear, which is exactly the disagreement one home prevents.
    const res = await request(createApp())
      .post(`/admin/historical-records/${PERSON_ID}/deceased/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(422);
    expect(res.text).toContain('member record');

    const person = db((conn) => conn.prepare(
      `SELECT is_deceased FROM historical_persons WHERE person_id = ?`,
    ).get(PERSON_ID)) as { is_deceased: number };
    // Already 1 from the member-side cascade earlier in this file, and
    // unchanged by the refused request; what matters is that this path did not
    // write it.
    expect(person.is_deceased).toBe(1);
  });

  it('sends an administrator to the member record when somebody holds the record', async () => {
    const res = await request(createApp())
      .get('/admin/historical-records?q=Linked Legend').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Lena Linked');
    expect(res.text).toContain(`/admin/members/${LINKED_ID}`);
  });
});

// A yearly gift left running charges a dead person's card every year, which
// ends in a dispute by the family. The marking ends each active gift at the
// close of the period already paid for, so the gift made is kept and nothing
// further is charged. The provider call cannot sit inside the marking's
// transaction, so a provider failure leaves the marking in place and tells the
// administrator rather than undoing it.
describe('a deceased member\'s recurring donations', () => {
  let cancelCalls: string[] = [];

  async function watchProvider(fail: boolean): Promise<void> {
    const mod = await import('../../src/adapters/paymentAdapter');
    mod.resetPaymentAdapterForTests();
    const stub = mod.getPaymentAdapter();
    cancelCalls = [];
    mod.setPaymentAdapterForTests({
      ...stub,
      async cancelSubscriptionAtPeriodEnd(id: string) {
        cancelCalls.push(id);
        if (fail) throw new Error('injected provider refusal');
      },
    });
  }

  afterEach(async () => {
    const mod = await import('../../src/adapters/paymentAdapter');
    mod.resetPaymentAdapterForTests();
  });

  async function markAndLand(memberId: string): Promise<string> {
    const res = await request(createApp())
      .post(`/admin/members/${memberId}/deceased/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    const carried = (res.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const landed = await request(createApp())
      .get(`/admin/members/${memberId}`)
      .set('Cookie', `${carried}; ${adminCookie()}`);
    expect(landed.status).toBe(200);
    return landed.text;
  }

  function subscription(id: string): { status: string; is_cancel_at_period_end: number } {
    return db((conn) => conn.prepare(
      'SELECT status, is_cancel_at_period_end FROM recurring_donation_subscriptions WHERE id = ?',
    ).get(id)) as { status: string; is_cancel_at_period_end: number };
  }

  function markingMetadata(memberId: string): Record<string, unknown> {
    const row = db((conn) => conn.prepare(
      "SELECT metadata_json FROM audit_entries WHERE action_type = 'member.deceased_marked' AND entity_id = ?",
    ).get(memberId)) as { metadata_json: string };
    return JSON.parse(row.metadata_json) as Record<string, unknown>;
  }

  it('cancels an active donation at period end, on the administrator\'s authority', async () => {
    await watchProvider(false);
    const { hit } = await import('../../src/services/rateLimitService');
    expect(hit(`cancel-recurring:${DONOR_ID}`, 1, 60).allowed).toBe(true);
    const page = await markAndLand(DONOR_ID);

    expect(memberRow(DONOR_ID).is_deceased).toBe(1);
    expect(cancelCalls).toEqual([DONOR_SUB]);
    expect(subscription('rds_dm_donor')).toEqual({ status: 'active', is_cancel_at_period_end: 1 });
    expect(markingMetadata(DONOR_ID)['recurring_donations_to_cancel']).toEqual(['rds_dm_donor']);

    // The cancellation is the administrator's act, not the member's: a trail
    // reading as the member's own request would misstate who ended the gift.
    const cancel = db((conn) => conn.prepare(
      `SELECT actor_type, actor_member_id,
              json_extract(metadata_json, '$.member_id') AS member_id,
              json_extract(metadata_json, '$.reason') AS reason
       FROM audit_entries
       WHERE action_type = 'payment.recurring_cancel_requested' AND entity_id = 'rds_dm_donor'`,
    ).all()) as Record<string, unknown>[];
    expect(cancel).toEqual([{
      actor_type: 'admin', actor_member_id: ADMIN_ID, member_id: DONOR_ID, reason: 'member_deceased',
    }]);
    const ledger = db((conn) => conn.prepare(
      `SELECT reason_text FROM recurring_donation_subscription_transitions
       WHERE recurring_subscription_id = 'rds_dm_donor' AND lifecycle_event_code = 'cancel_requested'`,
    ).all()) as { reason_text: string }[];
    expect(ledger).toEqual([
      { reason_text: 'cancelled at period end because the member was marked deceased' },
    ]);

    // The family receives no "your donation was cancelled" notice.
    const outbox = db((conn) => conn.prepare(
      'SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ?',
    ).get(DONOR_ID)) as { c: number };
    expect(outbox.c).toBe(0);

    expect(page).not.toContain('could not be cancelled');
  });

  it('asks the provider for nothing when the donation has already ended', async () => {
    await watchProvider(false);
    await markAndLand(ENDED_DONOR_ID);

    expect(memberRow(ENDED_DONOR_ID).is_deceased).toBe(1);
    expect(cancelCalls).toEqual([]);
    expect(markingMetadata(ENDED_DONOR_ID)['recurring_donations_to_cancel']).toEqual([]);
  });

  it('keeps the marking and tells the administrator when the provider refuses', async () => {
    await watchProvider(true);
    expectLoggedError('recurring donation could not be cancelled after the member was marked deceased');
    const page = await markAndLand(DECLINED_DONOR_ID);

    expect(memberRow(DECLINED_DONOR_ID).is_deceased).toBe(1);
    expect(cancelCalls).toEqual([DECLINED_SUB]);
    expect(subscription('rds_dm_declined')).toEqual({ status: 'active', is_cancel_at_period_end: 0 });
    expect(page).toContain('could not be cancelled');
  });
});

describe('reversing a marking made in error', () => {
  it('clears the flag inside the grace period and audits the reversal', async () => {
    expect(await mark(REVERT_ID)).toBe(303);
    expect(memberRow(REVERT_ID).is_deceased).toBe(1);

    expect(await revert(REVERT_ID)).toBe(303);
    const row = memberRow(REVERT_ID);
    expect(row.is_deceased).toBe(0);
    expect(row.deceased_at).toBeNull();
    expect(auditCount('member.deceased_reverted', REVERT_ID)).toBe(1);
  });

  it('refuses to reverse a marking that is not there', async () => {
    expect(await revert(REVERT_ID)).toBe(422);
  });

  it('refuses once the grace period has passed, leaving the flag set', async () => {
    expect(await mark(STALE_ID)).toBe(303);
    // Backdate past the configured window, which is what the contact scrub
    // waits out before clearing the details a reversal would restore.
    db((conn) => conn.prepare(
      `UPDATE members SET deceased_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`,
    ).run(STALE_ID));

    expect(await revert(STALE_ID)).toBe(303);
    expect(memberRow(STALE_ID).is_deceased).toBe(1);
    expect(auditCount('member.deceased_reverted', STALE_ID)).toBe(0);
  });
});

describe('an event organized by a member who is marked deceased', () => {
  function seedOrganizer(id: string): void {
    db((conn) => insertMember(conn, {
      id, slug: id, display_name: id, real_name: id, login_email: `${id}@example.com`,
    }));
  }

  function seedEvent(id: string, organizerIds: string[]): void {
    db((conn) => {
      insertEvent(conn, { id, title: id, start_date: '2099-09-01', end_date: '2099-09-02' });
      for (const memberId of organizerIds) insertEventOrganizer(conn, id, memberId);
    });
  }

  function needsOrganizerItems(eventId: string, status: string): number {
    return (db((conn) => conn.prepare(
      `SELECT COUNT(*) AS c FROM work_queue_items
       WHERE task_type = 'needs_organizer' AND entity_type = 'event' AND entity_id = ? AND status = ?`,
    ).get(eventId, status)) as { c: number }).c;
  }

  it('asks an administrator for a new organizer when the sole organizer is marked deceased', async () => {
    seedOrganizer('dm_org_sole');
    seedEvent('dm_event_sole', ['dm_org_sole']);

    expect(await mark('dm_org_sole')).toBe(303);
    expect(needsOrganizerItems('dm_event_sole', 'open')).toBe(1);
  });

  it('asks nothing while another living organizer still runs the event', async () => {
    seedOrganizer('dm_org_shared_dies');
    seedOrganizer('dm_org_shared_lives');
    seedEvent('dm_event_shared', ['dm_org_shared_dies', 'dm_org_shared_lives']);

    expect(await mark('dm_org_shared_dies')).toBe(303);
    expect(needsOrganizerItems('dm_event_shared', 'open')).toBe(0);
  });

  it('counts an organizer who died earlier as gone when the last living one is marked', async () => {
    seedOrganizer('dm_org_first_dies');
    seedOrganizer('dm_org_second_dies');
    seedEvent('dm_event_both_die', ['dm_org_first_dies', 'dm_org_second_dies']);

    expect(await mark('dm_org_first_dies')).toBe(303);
    expect(needsOrganizerItems('dm_event_both_die', 'open')).toBe(0);
    expect(await mark('dm_org_second_dies')).toBe(303);
    expect(needsOrganizerItems('dm_event_both_die', 'open')).toBe(1);
  });

  it('withdraws the request again when the marking is reversed', async () => {
    seedOrganizer('dm_org_reverted');
    seedEvent('dm_event_reverted', ['dm_org_reverted']);

    expect(await mark('dm_org_reverted')).toBe(303);
    expect(needsOrganizerItems('dm_event_reverted', 'open')).toBe(1);

    expect(await revert('dm_org_reverted')).toBe(303);
    expect(needsOrganizerItems('dm_event_reverted', 'open')).toBe(0);
    expect(needsOrganizerItems('dm_event_reverted', 'resolved')).toBe(1);
  });
});
