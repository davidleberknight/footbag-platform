/**
 * Member self-service data export.
 *
 * The contract: the signed-in member downloads a copy of their own data and
 * nobody else's, built and returned in the same response; the download is a
 * read, so it writes nothing and a repeat returns the same document; the
 * document carries what the platform holds about that member including the
 * parts page-facing reads hide from them; and it never carries how they voted,
 * a payment-provider identifier, or another member's personal data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMediaItem,
  insertMemberGallery,
  insertClub,
  insertMemberClubAffiliation,
  completeOnboarding,
  createTestSessionJwt,
  insertStripeEvent,
  insertRecurringDonationSubscription,
  insertPayment,
  insertAuditEntry,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4185');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function makeMember(slug: string): string {
  return withDb((db) => {
    const id = insertMember(db, {
      slug,
      display_name: slug,
      login_email:  `${slug}@example.com`,
    });
    completeOnboarding(db, id);
    return id;
  });
}

async function download(slug: string, memberId: string) {
  return request(createApp())
    .get(`/members/${slug}/download`)
    .set('Cookie', cookieFor(memberId));
}

/** Rows in every table the old emailed-link flow wrote, so a test can prove the
 *  download writes none of them. */
function writeCounts(): { tokens: number; outbox: number; audit: number } {
  return withDb((db) => ({
    tokens: (db.prepare('SELECT COUNT(*) AS c FROM account_tokens').get() as { c: number }).c,
    outbox: (db.prepare('SELECT COUNT(*) AS c FROM outbox_emails').get() as { c: number }).c,
    audit:  (db.prepare('SELECT COUNT(*) AS c FROM audit_entries').get() as { c: number }).c,
  }));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('downloading the export', () => {
  it('hands the signed-in member their own file as a download', async () => {
    const slug = 'exp_downloads';
    const id = makeMember(slug);
    const res = await download(slug, id);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('footbag-my-data.json');
    expect(JSON.parse(res.text).member.slug).toBe(slug);
  });

  it('writes nothing, and a repeat returns the same document', async () => {
    const slug = 'exp_repeat';
    const id = makeMember(slug);
    const before = writeCounts();

    const first = await download(slug, id);
    const second = await download(slug, id);

    expect(writeCounts()).toEqual(before);
    expect(second.status).toBe(200);
    const strip = (text: string) => ({ ...JSON.parse(text), exportedAt: null });
    expect(strip(second.text)).toEqual(strip(first.text));
  });

  it('answers not-found when one member asks for another member’s data', async () => {
    makeMember('exp_target');
    const nosy = makeMember('exp_nosy');
    const res = await download('exp_target', nosy);
    expect(res.status).toBe(404);
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('hands nothing to a visitor who is not signed in', async () => {
    makeMember('exp_anon');
    const res = await request(createApp()).get('/members/exp_anon/download');
    expect(res.status).not.toBe(200);
    expect(res.headers['content-disposition']).toBeUndefined();
  });
});

describe('what the document carries', () => {
  it('carries the member’s own sections, including what page-facing reads hide from them', async () => {
    const slug = 'exp_contents';
    const id = makeMember(slug);
    withDb((db) => {
      // An avatar and a gallery: the profile media read drops avatars, so a
      // document sourced from that read would under-answer the request.
      insertMediaItem(db, { uploader_member_id: id, is_avatar: 1, caption: 'my avatar', source_filename: 'avatar.jpg' });
      insertMediaItem(db, { uploader_member_id: id, caption: 'my photo', source_filename: 'photo.jpg' });
      insertMemberGallery(db, { owner_member_id: id, name: 'My Gallery' });
      const clubId = insertClub(db, { name: 'Export Test Club' });
      insertMemberClubAffiliation(db, id, clubId);
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.member.slug).toBe(slug);
    expect(doc.member.login_email).toBe(`${slug}@example.com`);
    expect(doc.media.items).toHaveLength(2);
    expect(doc.media.items.map((i: { source_filename: string }) => i.source_filename).sort())
      .toEqual(['avatar.jpg', 'photo.jpg']);
    expect(doc.media.galleries.length).toBeGreaterThan(0);
    expect(doc.clubs.affiliations).toHaveLength(1);
    expect(doc.clubs.affiliations[0].club_name).toBe('Export Test Club');
    expect(Array.isArray(doc.eventRegistrations)).toBe(true);
    expect(Array.isArray(doc.votesParticipatedIn)).toBe(true);
    expect(doc.exportedAt).toBeTruthy();
  });

  // Defect caught: a section read with SELECT * hands the member's payment
  // provider identifiers to whoever downloads the file. The member holds
  // every identifier the provider mints, so no section passes for want of a row.
  it('never carries how the member voted, nor a payment-provider identifier', async () => {
    const slug = 'exp_secrets';
    const id = makeMember(slug);
    const providerValues = {
      customer:     'cus-test-export-leak',
      subscription: 'sub-test-export-leak',
      checkout:     'cs-test-export-leak',
      event:        'evt-test-export-leak',
      intent:       'pi-test-export-leak',
      paymentCheckout: 'cs-test-export-leak-payment',
    };
    withDb((db) => {
      db.prepare('UPDATE members SET stripe_customer_id = ? WHERE id = ?').run(providerValues.customer, id);
      insertStripeEvent(db, { event_id: providerValues.event, event_type: 'customer.subscription.updated' });
      insertRecurringDonationSubscription(db, {
        member_id: id,
        stripe_customer_id: providerValues.customer,
        stripe_subscription_id: providerValues.subscription,
        checkout_session_id: providerValues.checkout,
        last_stripe_event_id: providerValues.event,
        amount_cents: 4321,
      });
      // An abandoned checkout is not a gift the member made, and another
      // member's gift is not theirs: neither belongs in this export.
      insertRecurringDonationSubscription(db, { member_id: id, status: 'incomplete', amount_cents: 1111 });
      const other = insertMember(db, { slug: 'exp_secrets_other' });
      insertRecurringDonationSubscription(db, { member_id: other, amount_cents: 9999 });
      insertPayment(db, {
        member_id: id,
        stripe_payment_intent_id: providerValues.intent,
        stripe_checkout_session_id: providerValues.paymentCheckout,
        stripe_customer_id: providerValues.customer,
      });
    });
    const body = (await download(slug, id)).text;

    // The sections are present, so the absence below is a real exclusion.
    const doc = JSON.parse(body);
    expect(doc.payments.recurringDonations.map((r: { amount_cents: number }) => r.amount_cents))
      .toEqual([4321]);
    expect(doc.payments.history).toHaveLength(1);

    for (const value of Object.values(providerValues)) {
      expect(body, `export leaked provider identifier ${value}`).not.toContain(value);
    }
    for (const forbidden of [
      'checkout_session_id',
      'last_stripe_event_id',
      'encrypted_ballot_b64',
      'encrypted_data_key_b64',
      'ballot_nonce_b64',
      'ballot_auth_tag_b64',
      'receipt_token_hash',
      'kms_key_id',
      'stripe_customer_id',
      'stripe_payment_intent_id',
      'stripe_subscription_id',
      'password_hash',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  // Defect caught: the member's copy omits what they did on the platform, or
  // hands them the free-form metadata and reasons that routinely name other
  // people, or lists actions someone else took on their record.
  it('carries the member’s own actions as type and time only, and nothing done to them by others', async () => {
    const slug = 'exp_audit';
    const id = makeMember(slug);
    const other = makeMember('exp_audit_other');
    withDb((db) => {
      insertAuditEntry(db, {
        actor_type: 'member', actor_member_id: id,
        action_type: 'member.profile_updated', entity_type: 'member', entity_id: id,
        occurred_at: '2026-03-02T10:00:00.000Z',
        reason_text: 'own-reason-text-leak',
        metadata: { other_member_id: other, note: 'own-metadata-leak' },
      });
      insertAuditEntry(db, {
        actor_type: 'member', actor_member_id: id,
        action_type: 'club.affiliation_added', entity_type: 'club', entity_id: 'club-exp-audit',
        occurred_at: '2026-03-01T10:00:00.000Z',
      });
      // The member is only the subject here: an administrator acted, and the
      // system acted with no actor at all.
      insertAuditEntry(db, {
        actor_type: 'admin', actor_member_id: other,
        action_type: 'admin.subject_only_correction', entity_type: 'member', entity_id: id,
      });
      insertAuditEntry(db, {
        actor_type: 'system', actor_member_id: null,
        action_type: 'system.subject_only_sweep', entity_type: 'member', entity_id: id,
      });
    });

    const res = await download(slug, id);
    expect(res.status).toBe(200);
    const doc = JSON.parse(res.text);

    // ordering-is-the-contract: the member's actions read oldest first.
    expect(doc.ownActions).toEqual([
      { action_type: 'club.affiliation_added', occurred_at: '2026-03-01T10:00:00.000Z' },
      { action_type: 'member.profile_updated', occurred_at: '2026-03-02T10:00:00.000Z' },
    ]);
    for (const leak of [
      'own-reason-text-leak', 'own-metadata-leak', 'club-exp-audit', other,
      'admin.subject_only_correction', 'system.subject_only_sweep',
    ]) {
      expect(res.text, `export leaked ${leak}`).not.toContain(leak);
    }
  });

  it('carries nothing about another member', async () => {
    const mine   = makeMember('exp_mine');
    const theirs = makeMember('exp_theirs');
    withDb((db) => {
      insertMediaItem(db, { uploader_member_id: theirs, caption: 'not-my-caption', source_filename: 'theirs.jpg' });
    });

    const body = (await download('exp_mine', mine)).text;

    expect(body).not.toContain('not-my-caption');
    expect(body).not.toContain('theirs.jpg');
    expect(body).not.toContain(theirs);
  });
});
