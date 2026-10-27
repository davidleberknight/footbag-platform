/**
 * A member whose address bounced, or who reported a message as spam, can get
 * mail again by their own action, and by no one else's.
 *
 * Contract verified:
 *   - a bounced member asks to resume mail from their email-preferences screen:
 *     the address comes off the mail provider's own suppression list, and a
 *     verification link goes to the same address on the strict path
 *   - opening that link clears the bounce and turns back on exactly the lists
 *     the bounce paused; lists the member withdrew from or an administrator
 *     set aside stay as they were, and list mail then reaches the member
 *   - turning a list on while bounced does not, by itself, resume delivery
 *   - a member who reported spam resumes a list by turning it on: the address
 *     comes off the provider's list, the mark clears, and only that list
 *     resumes, the other paused lists waiting for their own choice
 *   - nothing is lifted or cleared for an address already receiving mail, for
 *     an administrator's block, or for another member's screen
 *   - the request is rate-limited per address, and a provider failure leaves
 *     the member's state exactly as it was
 *
 * Every case seeds its own member under its own address, so a rate-limit
 * bucket, an outbox row or an audit row belongs to exactly one case.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { flashValueOf } from '../fixtures/flashCookie';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMailingListSubscription,
  createTestSessionJwt,
  type MailingListSubscriptionStatus,
} from '../fixtures/factories';
import { rowPin, theOnlyRow } from '../fixtures/rowPinning';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('4481');

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let sesMod: typeof import('../../src/adapters/sesAdapter');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let commsMod: typeof import('../../src/services/communicationService');

let seq = 0;

interface Seeded { id: string; slug: string; email: string }

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** A member with the given address state and list rows, under an address no other case uses. */
function seedMember(
  emailStatus: 'ok' | 'bounced' | 'complained' | 'suppressed',
  lists: Record<string, MailingListSubscriptionStatus> = {},
): Seeded {
  seq += 1;
  const id = `rec_member_${seq}`;
  const slug = `rec_member_${seq}`;
  const email = `rec-member-${seq}@example.com`;
  withDb((db) => {
    insertMember(db, { id, slug, login_email: email, email_status: emailStatus });
    for (const [listSlug, status] of Object.entries(lists)) {
      insertMailingListSubscription(db, { member_id: id, list_slug: listSlug, status });
    }
  });
  return { id, slug, email };
}

function cookieFor(m: Seeded): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: m.id })}`;
}

function emailStatusOf(memberId: string): string {
  return withDb((db) => (db.prepare('SELECT email_status FROM members WHERE id = ?')
    .get(memberId) as { email_status: string }).email_status);
}

function listStatusOf(memberId: string, listSlug: string): string | undefined {
  return withDb((db) => (db.prepare(
    'SELECT status FROM mailing_list_subscriptions WHERE member_id = ? AND mailing_list_id = ?',
  ).get(memberId, listSlug) as { status: string } | undefined)?.status);
}

function auditCount(actionType: string, memberId: string): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = ? AND entity_id = ?',
  ).get(actionType, memberId) as { n: number }).n);
}

function verifyMailsTo(email: string): { body_text: string; bypasses_suppression: number }[] {
  return withDb((db) => db.prepare(
    `SELECT body_text, bypasses_suppression FROM outbox_emails
     WHERE recipient_email = ? AND template_key = 'account_verify'`,
  ).all(email) as { body_text: string; bypasses_suppression: number }[]);
}

function verifyTokenFor(email: string): string {
  const row = withDb((db) => theOnlyRow<{ body_text: string }>(
    db,
    rowPin('outbox_emails', "recipient_email = ? AND template_key = 'account_verify'", [email]),
  ));
  const match = row.body_text.match(/\/verify\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`no verify link in the mail to ${email}`);
  return match[1]!;
}

/** Whether a send to the list would write a row for this member's address. */
function listSendReaches(listSlug: string, email: string): boolean {
  const svc = commsMod.createCommunicationService(sesMod.createStubSesAdapter());
  const key = `rec-list-probe-${listSlug}-${email}`;
  svc.enqueue({
    audience: { kind: 'list', slug: listSlug },
    subject: 'Probe',
    bodyText: 'Probe body',
    idempotencyKey: key,
  });
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_email = ? AND idempotency_key LIKE ?',
  ).get(email, `${key}%`) as { n: number }).n) > 0;
}

function stub(): NonNullable<ReturnType<typeof sesMod.getStubSesAdapterForTests>> {
  const s = sesMod.getStubSesAdapterForTests();
  if (!s) throw new Error('the stub SES adapter is not the configured one');
  return s;
}

function recover(m: Seeded) {
  return request(createApp())
    .post(`/members/${m.slug}/email-preferences/recover`)
    .set('Cookie', cookieFor(m))
    .type('form')
    .send({});
}

function turnOn(m: Seeded, listSlug: string) {
  return request(createApp())
    .post(`/members/${m.slug}/email-preferences`)
    .set('Cookie', cookieFor(m))
    .type('form')
    .send({ slug: listSlug, subscribe: '1' });
}

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
  sesMod = await import('../../src/adapters/sesAdapter');
  commsMod = await import('../../src/services/communicationService');
  // The app resolves its adapter lazily; resolve it now so the stub exists.
  sesMod.getSesAdapter();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  sesMod.getStubSesAdapterForTests()?.clear();
});

describe('a bounced member resuming mail to the same address', () => {
  it('lifts the provider block and sends a strict verification link to that address', async () => {
    const m = seedMember('bounced', { newsletter: 'bounced' });

    const res = await recover(m);

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${m.slug}/email-preferences`);
    expect(flashValueOf(res)).toBe('email_preference_result:recovery_sent');
    // Without the lift the provider drops the link, so the member could never prove anything.
    expect(stub().liftedAddresses).toEqual([m.email]);
    const mails = verifyMailsTo(m.email);
    expect(mails).toHaveLength(1);
    // A non-strict row would be withheld by the platform's own gate for a bounced address.
    expect(mails[0]!.bypasses_suppression).toBe(1);
    expect(auditCount('email.recovery_requested', m.id)).toBe(1);
    // Asking is not proof: the mark stays until the link is opened.
    expect(emailStatusOf(m.id)).toBe('bounced');
  });

  it('opening the link clears the bounce and restores only the lists the bounce paused', async () => {
    const m = seedMember('bounced', {
      newsletter: 'bounced',
      'event-notifications': 'bounced',
      'technical-updates': 'unsubscribed',
      'board-announcements': 'suppressed',
      'all-members': 'complained',
    });
    expect(listSendReaches('newsletter', m.email)).toBe(false);

    await recover(m);
    const res = await request(createApp()).post('/verify').type('form').send({ token: verifyTokenFor(m.email) });

    expect(res.status).toBe(303);
    expect(emailStatusOf(m.id)).toBe('ok');
    expect(listStatusOf(m.id, 'newsletter')).toBe('subscribed');
    expect(listStatusOf(m.id, 'event-notifications')).toBe('subscribed');
    // The member's own withdrawal and an administrator's block are not the bounce's to undo.
    expect(listStatusOf(m.id, 'technical-updates')).toBe('unsubscribed');
    expect(listStatusOf(m.id, 'board-announcements')).toBe('suppressed');
    // A list paused by a spam report waits for its own opt-in, whatever else clears.
    expect(listStatusOf(m.id, 'all-members')).toBe('complained');
    expect(auditCount('email.address_recovered', m.id)).toBe(1);
    expect(listSendReaches('newsletter', m.email)).toBe(true);
  });

  it('turning a list on while bounced does not by itself resume delivery', async () => {
    const m = seedMember('bounced', { newsletter: 'bounced' });

    const res = await turnOn(m, 'newsletter');

    expect(res.status).toBe(303);
    expect(stub().liftedAddresses).toEqual([]);
    expect(emailStatusOf(m.id)).toBe('bounced');
    expect(listSendReaches('newsletter', m.email)).toBe(false);
  });

  it('the screen offers the recovery control to a bounced member, posting to the recovery handler', async () => {
    const m = seedMember('bounced', { newsletter: 'bounced' });

    const res = await request(createApp())
      .get(`/members/${m.slug}/email-preferences`).set('Cookie', cookieFor(m));

    expect(res.status).toBe(200);
    expect(res.text).toContain(`action="/members/${m.slug}/email-preferences/recover"`);
    // The provider is discarding mail to this address, account mail included, so a promise
    // that account mail always arrives would be false on exactly this member's screen.
    expect(res.text).not.toMatch(/is always sent/);
  });

  it('the screen offers no recovery control to a member whose address is receiving mail', async () => {
    const m = seedMember('ok', { newsletter: 'subscribed' });

    const res = await request(createApp())
      .get(`/members/${m.slug}/email-preferences`).set('Cookie', cookieFor(m));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/email-preferences/recover');
    expect(res.text).not.toContain('Your Address');
  });

  it('a spam-reporting or administrator-blocked member is told why, and offered no verification control', async () => {
    // A verification link cannot clear either mark, so a control offering one would only refuse.
    const complained = seedMember('complained', { newsletter: 'complained' });
    const suppressed = seedMember('suppressed');

    const complainedPage = await request(createApp())
      .get(`/members/${complained.slug}/email-preferences`).set('Cookie', cookieFor(complained));
    const suppressedPage = await request(createApp())
      .get(`/members/${suppressed.slug}/email-preferences`).set('Cookie', cookieFor(suppressed));

    expect(complainedPage.status).toBe(200);
    expect(complainedPage.text).toContain('Your Address');
    expect(complainedPage.text).not.toContain('/email-preferences/recover');
    expect(suppressedPage.status).toBe(200);
    expect(suppressedPage.text).not.toContain('/email-preferences/recover');
  });

  it('a verification link clears only a bounce, never a spam report or an administrator block', async () => {
    const complained = seedMember('complained');
    const suppressed = seedMember('suppressed');
    const { accountTokenService } = await import('../../src/services/accountTokenService');

    for (const m of [complained, suppressed]) {
      const { rawToken } = accountTokenService.issueToken({ memberId: m.id, tokenType: 'email_verify', ttlHours: 24 });
      const res = await request(createApp()).post('/verify').type('form').send({ token: rawToken });
      expect(res.status, `opening a link for ${m.slug}`).toBe(303);
    }

    expect(emailStatusOf(complained.id)).toBe('complained');
    expect(emailStatusOf(suppressed.id)).toBe('suppressed');
  });

  // A registrant whose first verification mail bounced recovers through the
  // same link before onboarding finishes. The audit log holds no row about
  // someone who is not a member, and a row there would also keep their
  // unfinished account from ever being deleted.
  it('a registrant still onboarding gets the bounce cleared and no audit row about them', async () => {
    seq += 1;
    const registrant = { id: `rec_registrant_${seq}`, email: `rec-registrant-${seq}@example.com` };
    withDb((db) => insertMember(db, {
      id: registrant.id, slug: `rec_registrant_${seq}`, login_email: registrant.email,
      email_status: 'bounced', email_verified_at: null, onboarding: 'none',
    }));
    const { accountTokenService } = await import('../../src/services/accountTokenService');
    const { rawToken } = accountTokenService.issueToken({ memberId: registrant.id, tokenType: 'email_verify', ttlHours: 24 });

    const res = await request(createApp()).post('/verify').type('form').send({ token: rawToken });

    expect(res.status).toBe(303);
    expect(emailStatusOf(registrant.id)).toBe('ok');
    expect(auditCount('email.address_recovered', registrant.id)).toBe(0);
  });
});

describe('a member who reported spam turning a list back on', () => {
  it('lifts the provider block, clears the mark, and resumes only the list turned on', async () => {
    const m = seedMember('complained', { newsletter: 'complained', 'event-notifications': 'complained' });

    const res = await turnOn(m, 'newsletter');

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${m.slug}/email-preferences`);
    expect(flashValueOf(res)).toBe('email_preference_result:subscribed');
    expect(stub().liftedAddresses).toEqual([m.email]);
    expect(emailStatusOf(m.id)).toBe('ok');
    expect(listStatusOf(m.id, 'newsletter')).toBe('subscribed');
    // Each list needs its own opt-in after a spam report.
    expect(listStatusOf(m.id, 'event-notifications')).toBe('complained');
    expect(auditCount('email.complaint_withdrawn', m.id)).toBe(1);
    expect(listSendReaches('newsletter', m.email)).toBe(true);
    expect(listSendReaches('event-notifications', m.email)).toBe(false);
  });

  it('withdrawing a report reads as a change even where the list row already read as on', async () => {
    const m = seedMember('complained', { newsletter: 'subscribed' });

    const res = await turnOn(m, 'newsletter');

    // An "already set, nothing changed" notice would hide that mail just resumed.
    expect(res.headers.location).toBe(`/members/${m.slug}/email-preferences`);
    expect(flashValueOf(res)).toBe('email_preference_result:subscribed');
    expect(emailStatusOf(m.id)).toBe('ok');
    expect(auditCount('email.complaint_withdrawn', m.id)).toBe(1);
  });

  it('turning a list off lifts nothing and leaves the mark', async () => {
    const m = seedMember('complained', { newsletter: 'subscribed' });

    const res = await request(createApp())
      .post(`/members/${m.slug}/email-preferences`)
      .set('Cookie', cookieFor(m))
      .type('form')
      .send({ slug: 'newsletter', subscribe: '0' });

    expect(res.status).toBe(303);
    expect(stub().liftedAddresses).toEqual([]);
    expect(emailStatusOf(m.id)).toBe('complained');
    expect(auditCount('email.complaint_withdrawn', m.id)).toBe(0);
  });

  it('a provider failure leaves the mark, the list and the ledger as they were', async () => {
    const m = seedMember('complained', { newsletter: 'complained' });
    stub().failNextLift(new Error('synthetic provider failure lifting a complaint'));
    expectLoggedError(/suppression_lift_failed/);

    const res = await turnOn(m, 'newsletter');

    expect(res.status).toBe(503);
    expect(emailStatusOf(m.id)).toBe('complained');
    expect(listStatusOf(m.id, 'newsletter')).toBe('complained');
    expect(auditCount('email.complaint_withdrawn', m.id)).toBe(0);
  });
});

describe('what the recovery request refuses', () => {
  it('changes nothing for an address already receiving mail', async () => {
    const m = seedMember('ok');

    const res = await recover(m);

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${m.slug}/email-preferences`);
    expect(flashValueOf(res)).toBe('email_preference_result:recovery_unneeded');
    expect(stub().liftedAddresses).toEqual([]);
    expect(verifyMailsTo(m.email)).toHaveLength(0);
  });

  it('never lifts an administrator\'s block', async () => {
    const m = seedMember('suppressed');

    const res = await recover(m);

    expect(res.status).toBe(422);
    expect(stub().liftedAddresses).toEqual([]);
    expect(verifyMailsTo(m.email)).toHaveLength(0);
    expect(emailStatusOf(m.id)).toBe('suppressed');
  });

  it('sends a spam-reporting member to the list choice rather than a verification link', async () => {
    const m = seedMember('complained', { newsletter: 'complained' });

    const res = await recover(m);

    expect(res.status).toBe(422);
    expect(stub().liftedAddresses).toEqual([]);
    expect(verifyMailsTo(m.email)).toHaveLength(0);
    expect(emailStatusOf(m.id)).toBe('complained');
  });

  it('404s another member\'s recovery and lifts nothing', async () => {
    const m = seedMember('bounced');
    const other = seedMember('bounced');

    const res = await request(createApp())
      .post(`/members/${other.slug}/email-preferences/recover`)
      .set('Cookie', cookieFor(m))
      .type('form')
      .send({});

    expect(res.status).toBe(404);
    expect(stub().liftedAddresses).toEqual([]);
    expect(verifyMailsTo(other.email)).toHaveLength(0);
  });

  it('sends a signed-out visitor to sign in', async () => {
    const m = seedMember('bounced');

    const res = await request(createApp())
      .post(`/members/${m.slug}/email-preferences/recover`)
      .type('form')
      .send({});

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
    expect(stub().liftedAddresses).toEqual([]);
  });

  it('rate-limits repeated requests for one address, with a Retry-After', async () => {
    const m = seedMember('bounced');

    for (let i = 0; i < 3; i += 1) {
      expect((await recover(m)).status).toBe(303);
    }
    const res = await recover(m);

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
    // The refused request reached the provider no more than the allowed ones did.
    expect(stub().liftedAddresses).toHaveLength(3);
  });

  it('shares its limit with the verification resend for the same address', async () => {
    // Both mail a verify link to the address, so splitting the bucket would double what one
    // address can be sent in an hour.
    const m = seedMember('bounced');
    for (let i = 0; i < 3; i += 1) {
      await request(createApp()).post('/verify/resend').type('form').send({ email: m.email });
    }

    const res = await recover(m);

    expect(res.status).toBe(429);
    expect(stub().liftedAddresses).toEqual([]);
  });

  it('a provider failure sends no link and leaves the bounce in place', async () => {
    const m = seedMember('bounced', { newsletter: 'bounced' });
    stub().failNextLift(new Error('synthetic provider failure lifting a bounce'));
    expectLoggedError(/suppression_lift_failed/);

    const res = await recover(m);

    expect(res.status).toBe(503);
    expect(verifyMailsTo(m.email)).toHaveLength(0);
    expect(emailStatusOf(m.id)).toBe('bounced');
    expect(auditCount('email.recovery_requested', m.id)).toBe(0);
  });

  it('a link that fails to queue after the unblock is a temporary outage on the member\'s record', async () => {
    // The provider took the address off its list, then the link could not be
    // queued. Answered as an unexpected crash, the member reads a server fault
    // and the operator gets a registrant's alarm about a member, with nothing
    // on the member's record saying their request failed.
    const m = seedMember('bounced', { newsletter: 'bounced' });
    const { emailService } = await import('../../src/services/emailService');
    const spy = vi.spyOn(emailService, 'send').mockImplementation(() => {
      throw new Error('synthetic outbox failure queuing a verification link');
    });
    expectLoggedError(/^audit: email\.recovery_link_failed$/);
    try {
      const res = await recover(m);
      expect(res.status).toBe(503);
    } finally {
      spy.mockRestore();
    }

    expect(auditCount('email.recovery_link_failed', m.id)).toBe(1);
    const row = withDb((db) => db.prepare(
      "SELECT actor_type, actor_member_id, metadata_json FROM audit_entries WHERE action_type = 'email.recovery_link_failed' AND entity_id = ?",
    ).get(m.id) as { actor_type: string; actor_member_id: string; metadata_json: string });
    expect(row.actor_type).toBe('member');
    expect(row.actor_member_id).toBe(m.id);
    // The class only: the message can quote the address.
    expect(row.metadata_json).not.toContain(m.email);
    expect(auditCount('email.recovery_requested', m.id)).toBe(0);
    expect(verifyMailsTo(m.email)).toHaveLength(0);
  });
});
