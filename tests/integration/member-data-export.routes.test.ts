/**
 * Member self-service data export.
 *
 * The contract: the signed-in member downloads a copy of their own data and
 * nobody else's, built and returned in the same response; the download is a
 * read, so it writes nothing and a repeat returns the same document; the
 * document carries what the platform holds about that member including the
 * parts page-facing reads hide from them and what other people recorded about
 * them; it names any section cut at the per-section ceiling; and it never
 * carries how they voted, a payment-provider identifier, an email body, or
 * another person's identity or personal data.
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
  insertLegacyMember,
  insertClubLeader,
  insertEvent,
  insertRegistration,
  insertMailingListSubscription,
  insertMemberLink,
  insertMemberDeclaredAnchor,
  insertMemberTierGrant,
  insertActivePlayerGrant,
  insertActivePlayerVouch,
  insertEventOrganizer,
  insertPaymentStatusTransition,
  insertRecurringDonationTransition,
  insertMediaFlag,
  insertOutboxEmail,
  insertWorkQueueItem,
  insertMemberMessage,
  insertClubInsightNote,
  insertClubViabilitySignal,
  insertOnboardingTask,
  setOnboardingHeldAnswer,
  insertTag,
  insertGalleryCriterionTag,
  insertGalleryExcludeTag,
  insertGalleryExternalLink,
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

  // Defect caught: the member's copy omits what they did on the platform or what
  // others did to their record, or hands them the free-form metadata, reasons
  // and actor ids that name other people.
  it('carries the member’s own actions and the actions on their record, as type and time only', async () => {
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
        occurred_at: '2026-03-03T10:00:00.000Z',
        reason_text: 'admin-reason-text-leak',
        metadata: { note: 'admin-metadata-leak' },
      });
      insertAuditEntry(db, {
        actor_type: 'system', actor_member_id: null,
        action_type: 'member.pii_purged', entity_type: 'member', entity_id: id,
        occurred_at: '2026-03-04T10:00:00.000Z',
      });
      // An action on another member's record is not about this member.
      insertAuditEntry(db, {
        actor_type: 'admin', actor_member_id: id,
        action_type: 'admin.other_member_correction', entity_type: 'member', entity_id: other,
      });
    });

    const res = await download(slug, id);
    expect(res.status).toBe(200);
    const doc = JSON.parse(res.text);

    // ordering-is-the-contract: the member's actions read oldest first.
    expect(doc.ownActions.map((a: { action_type: string }) => a.action_type)).toEqual([
      'club.affiliation_added', 'member.profile_updated', 'admin.other_member_correction',
    ]);
    expect(doc.ownActions[0]).toEqual({ action_type: 'club.affiliation_added', occurred_at: '2026-03-01T10:00:00.000Z' });
    // ordering-is-the-contract: the actions on the member's record read oldest
    // first, and the member's own action on their own record is not repeated.
    expect(doc.actionsOnMemberRecord).toEqual([
      { action_type: 'admin.subject_only_correction', occurred_at: '2026-03-03T10:00:00.000Z' },
      { action_type: 'member.pii_purged', occurred_at: '2026-03-04T10:00:00.000Z' },
    ]);
    for (const leak of [
      'own-reason-text-leak', 'own-metadata-leak', 'club-exp-audit', other,
      'admin-reason-text-leak', 'admin-metadata-leak',
    ]) {
      expect(res.text, `export leaked ${leak}`).not.toContain(leak);
    }
  });

  // Defect caught: a long-active member's copy stops at a fixed count and keeps
  // their oldest actions, silently dropping everything they did recently.
  it('carries every one of the member’s own actions, the newest included', async () => {
    const slug = 'exp_audit_many';
    const id = makeMember(slug);
    withDb((db) => {
      const seed = db.transaction(() => {
        for (let i = 0; i < 5001; i += 1) {
          insertAuditEntry(db, {
            actor_type: 'member', actor_member_id: id,
            action_type: 'member.profile_updated', entity_type: 'member', entity_id: id,
            occurred_at: new Date(Date.UTC(2025, 0, 1) + i * 60_000).toISOString(),
          });
        }
      });
      seed();
    });
    const doc = JSON.parse((await download(slug, id)).text);
    expect(doc.ownActions).toHaveLength(5001);
    expect(doc.ownActions.at(-1).occurred_at).toBe(new Date(Date.UTC(2025, 0, 1) + 5000 * 60_000).toISOString());
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

  // Defect caught: a section the document has always claimed to carry is wired
  // to the wrong read, or to nothing, and the member's copy silently lacks it.
  it('carries leadership, registrations, subscriptions, links, anchors, the legacy account and current membership', async () => {
    const slug = 'exp_wired';
    const legacyId = 'legacy-exp-wired';
    const { id, other } = withDb((db) => {
      const id = insertMember(db, { slug, display_name: slug, login_email: `${slug}@example.com`, legacy_member_id: legacyId });
      // Replaces the stub the member factory makes for the claimed account.
      insertLegacyMember(db, { legacy_member_id: legacyId, street_address: '12 Wired Lane', postal_code: 'WIRED1', claimed_by_member_id: id });
      const other = insertMember(db, { slug: 'exp_wired_other', legacy_member_id: 'legacy-exp-wired-other' });
      const myClub = insertClub(db, { name: 'Wired Led Club' });
      const theirClub = insertClub(db, { name: 'Wired Other Club' });
      insertClubLeader(db, { club_id: myClub, member_id: id });
      insertClubLeader(db, { club_id: theirClub, member_id: other });
      const myEvent = insertEvent(db, { title: 'Wired Registered Event' });
      const theirEvent = insertEvent(db, { title: 'Wired Other Event' });
      insertRegistration(db, myEvent, id);
      insertRegistration(db, theirEvent, other);
      insertMailingListSubscription(db, { member_id: id, list_slug: 'wired_list' });
      insertMailingListSubscription(db, { member_id: other, list_slug: 'wired_other_list' });
      insertMemberLink(db, id, { url: 'https://example.com/wired-mine' });
      insertMemberLink(db, other, { url: 'https://example.com/wired-theirs' });
      insertMemberDeclaredAnchor(db, { member_id: id, anchor_value: 'wiredsurname' });
      insertMemberDeclaredAnchor(db, { member_id: other, anchor_value: 'wiredothersurname' });
      insertMemberTierGrant(db, { member_id: id, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });
      insertMemberTierGrant(db, { member_id: other, new_tier_status: 'tier1' });
      return { id, other };
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(res.status).toBe(200);
    expect(doc.clubs.leadership.map((r: { club_name: string }) => r.club_name)).toEqual(['Wired Led Club']);
    expect(doc.eventRegistrations.map((r: { event_title: string }) => r.event_title)).toEqual(['Wired Registered Event']);
    expect(doc.emailSubscriptions.map((r: { mailing_list_id: string }) => r.mailing_list_id)).toEqual(['wired_list']);
    expect(doc.externalLinks.map((r: { url: string }) => r.url)).toEqual(['https://example.com/wired-mine']);
    expect(doc.declaredAnchors.map((r: { anchor_value: string }) => r.anchor_value)).toEqual(['wiredsurname']);
    expect(doc.legacyAccount).toMatchObject({ legacy_member_id: legacyId, street_address: '12 Wired Lane', postal_code: 'WIRED1' });
    expect(doc.membership.tier).toMatchObject({ tier_status: 'tier2' });
    for (const leak of ['Wired Other Club', 'Wired Other Event', 'wired_other_list', 'wired-theirs', 'wiredothersurname', 'legacy-exp-wired-other', other]) {
      expect(res.text, `export leaked ${leak}`).not.toContain(leak);
    }
  });
});

/** The member asking, another member whose rows must never appear, and an
 *  administrator whose identity must never appear. */
function threeMembers(prefix: string): { slug: string; id: string; other: string; admin: string } {
  const slug = prefix;
  const id = makeMember(slug);
  const other = makeMember(`${prefix}_other`);
  const admin = withDb((db) => insertMember(db, { slug: `${prefix}_admin`, is_admin: 1 }));
  return { slug, id, other, admin };
}

function expectNoneOf(body: string, leaks: string[]): void {
  for (const leak of leaks) expect(body, `export leaked ${leak}`).not.toContain(leak);
}

describe('what other people recorded about the member', () => {
  // Defect caught: the member cannot see the history of their tier and Active
  // Player standing or the vouches they received, or the copy names the
  // administrator or voucher who acted.
  it('carries tier and Active Player history and vouches received, without the actor or voucher', async () => {
    const { slug, id, other, admin } = threeMembers('exp_hist');
    withDb((db) => {
      insertMemberTierGrant(db, { member_id: id, actor_member_id: admin, reason_code: 'admin.correct', reason_text: 'tier-reason-mine' });
      insertMemberTierGrant(db, { member_id: other, actor_member_id: admin, reason_text: 'tier-reason-theirs' });
      insertActivePlayerGrant(db, { member_id: id, actor_member_id: admin, reason_text: 'ap-reason-mine' });
      insertActivePlayerGrant(db, { member_id: other, actor_member_id: admin, reason_text: 'ap-reason-theirs' });
      insertActivePlayerVouch(db, { voucher_member_id: other, target_member_id: id, reason_text: 'vouch-for-me' });
      // A vouch the member gave is their act on someone else, not one received.
      insertActivePlayerVouch(db, { voucher_member_id: id, target_member_id: other, reason_text: 'vouch-i-gave' });
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.membership.tierHistory.map((r: { reason_text: string }) => r.reason_text)).toEqual(['tier-reason-mine']);
    expect(doc.membership.activePlayerHistory.map((r: { reason_text: string }) => r.reason_text)).toEqual(['ap-reason-mine']);
    expect(doc.membership.vouchesReceived.map((r: { reason_text: string }) => r.reason_text)).toEqual(['vouch-for-me']);
    expectNoneOf(res.text, ['tier-reason-theirs', 'ap-reason-theirs', 'vouch-i-gave', other, admin, 'actor_member_id', 'voucher_member_id']);
  });

  // Defect caught: the member's organizer roles are missing, or another
  // organizer's role appears in their copy.
  it('carries the events the member organizes', async () => {
    const { slug, id, other } = threeMembers('exp_org');
    withDb((db) => {
      const mine = insertEvent(db, { title: 'Organized By Me' });
      const theirs = insertEvent(db, { title: 'Organized By Them' });
      insertEventOrganizer(db, mine, id);
      insertEventOrganizer(db, theirs, other);
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.eventsOrganized.map((r: { event_title: string }) => r.event_title)).toEqual(['Organized By Me']);
    expectNoneOf(res.text, ['Organized By Them', other]);
  });

  // Defect caught: the member cannot follow how their payments and gifts moved
  // between states, or the copy carries the payment provider's identifiers.
  it('carries payment and recurring-gift transitions, without provider identifiers or metadata', async () => {
    const { slug, id, other } = threeMembers('exp_trans');
    const provider = {
      event:       'evt-exp-trans-leak',
      intent:      'pi-exp-trans-leak',
      subscription:'sub-exp-trans-leak',
      invoice:     'in-exp-trans-leak',
      correlation: 'corr-exp-trans-leak',
    };
    withDb((db) => {
      insertStripeEvent(db, { event_id: provider.event, event_type: 'payment_intent.succeeded' });
      const myPayment = insertPayment(db, { member_id: id });
      const theirPayment = insertPayment(db, { member_id: other });
      insertPaymentStatusTransition(db, {
        payment_id: myPayment, transition_reason_text: 'pst-reason-mine',
        stripe_event_id: provider.event, stripe_payment_intent_id: provider.intent,
        correlation_key: provider.correlation,
      });
      insertPaymentStatusTransition(db, { payment_id: theirPayment, transition_reason_text: 'pst-reason-theirs' });
      const mySub = insertRecurringDonationSubscription(db, { member_id: id });
      const theirSub = insertRecurringDonationSubscription(db, { member_id: other });
      insertRecurringDonationTransition(db, {
        recurring_subscription_id: mySub, member_id: id, reason_text: 'rdst-reason-mine',
        stripe_subscription_id: provider.subscription, stripe_invoice_id: provider.invoice,
        correlation_key: provider.correlation,
      });
      insertRecurringDonationTransition(db, { recurring_subscription_id: theirSub, member_id: other, reason_text: 'rdst-reason-theirs' });
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.payments.statusTransitions.map((r: { transition_reason_text: string }) => r.transition_reason_text))
      .toEqual(['pst-reason-mine']);
    expect(doc.payments.recurringDonationTransitions.map((r: { reason_text: string }) => r.reason_text))
      .toEqual(['rdst-reason-mine']);
    expectNoneOf(res.text, [
      ...Object.values(provider), 'pst-reason-theirs', 'rdst-reason-theirs', other,
      'metadata_json', 'correlation_key', 'stripe_',
    ]);
  });

  // Defect caught: the member cannot see the reports against their media or
  // the reports they made, or the copy identifies who reported them or which
  // administrator resolved it.
  it('carries flags on the member’s media and flags they raised, without the reporter or the administrator', async () => {
    const { slug, id, other, admin } = threeMembers('exp_flags');
    withDb((db) => {
      const myItem = insertMediaItem(db, { uploader_member_id: id, source_filename: 'flagged-mine.jpg' });
      const theirItem = insertMediaItem(db, { uploader_member_id: other, source_filename: 'flagged-theirs.jpg' });
      insertMediaFlag(db, {
        media_id: myItem, reporter_member_id: other, reason_code: 'spam', reason_text: 'reporter-own-words',
        status: 'resolved', resolved_at: '2026-04-01T00:00:00.000Z', resolved_by_admin_member_id: admin,
        resolution_label: 'kept', resolution_reason: 'admin-outcome-note',
      });
      insertMediaFlag(db, { media_id: theirItem, reporter_member_id: id, reason_code: 'impersonation', reason_text: 'my-own-flag-words' });
      // A flag between two other people is neither on this member's media nor theirs.
      insertMediaFlag(db, { media_id: theirItem, reporter_member_id: admin, reason_text: 'unrelated-flag-words' });
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.media.flagsOnOwnMedia).toHaveLength(1);
    expect(doc.media.flagsOnOwnMedia[0]).toMatchObject({
      reason_code: 'spam', status: 'resolved', resolution_label: 'kept', resolution_reason: 'admin-outcome-note',
    });
    expect(doc.media.flagsRaised.map((r: { reason_text: string }) => r.reason_text)).toEqual(['my-own-flag-words']);
    expectNoneOf(res.text, ['reporter-own-words', 'unrelated-flag-words', other, admin, 'reporter_member_id', 'resolved_by_admin_member_id']);
  });

  // Defect caught: the member cannot see the mail sent to them or an
  // administrator's questions, or the copy carries a body with a live link,
  // the provider's message identifier, or the sender's identity.
  it('carries mail by subject and kind without its body, and an administrator’s messages without the sender', async () => {
    const { slug, id, other, admin } = threeMembers('exp_mail');
    withDb((db) => {
      insertOutboxEmail(db, {
        recipient_member_id: id, subject: 'Subject for me', template_key: 'password_reset',
        body_text: 'mail-body-with-live-link', provider_message_id: 'provider-msg-exp-leak',
        status: 'sent', reviewed_at: '2026-04-01T00:00:00.000Z', reviewed_by_member_id: admin,
        review_note: 'reviewer-note-leak',
      });
      insertOutboxEmail(db, { recipient_member_id: other, subject: 'Subject for them' });
      const item = insertWorkQueueItem(db, { entity_id: id });
      insertMemberMessage(db, {
        recipient_member_id: id, sender_admin_member_id: admin, work_queue_item_id: item,
        subject: 'Question for me', body_text: 'admin-question-body-mine',
        answer: { outcome: 'acknowledged', note_text: 'my-answer-note' },
      });
      const theirItem = insertWorkQueueItem(db, { entity_id: other });
      insertMemberMessage(db, {
        recipient_member_id: other, sender_admin_member_id: admin, work_queue_item_id: theirItem,
        body_text: 'admin-question-body-theirs',
      });
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.mailReceived).toHaveLength(1);
    expect(doc.mailReceived[0]).toMatchObject({ subject: 'Subject for me', template_key: 'password_reset', status: 'sent' });
    expect(doc.messagesReceived).toHaveLength(1);
    expect(doc.messagesReceived[0]).toMatchObject({
      subject: 'Question for me', body_text: 'admin-question-body-mine', outcome: 'acknowledged', note_text: 'my-answer-note',
    });
    expectNoneOf(res.text, [
      'mail-body-with-live-link', 'provider-msg-exp-leak', 'reviewer-note-leak', 'Subject for them',
      'admin-question-body-theirs', other, admin,
    ]);
  });

  // Defect caught: the member cannot see the requests and administrative
  // items about them, or the copy carries the stored payload that names the
  // other accounts in a dispute, or the administrators who handled the item.
  it('carries work-queue items about the member, without their reason payload or the administrators', async () => {
    const { slug, id, other, admin } = threeMembers('exp_wq');
    withDb((db) => {
      insertWorkQueueItem(db, {
        entity_id: id, task_type: 'member_contact_request', created_by: id,
        detail_text: 'my-request-words',
        reason_text: JSON.stringify({ disputed_record_holders: [other], marker: 'wq-payload-leak' }),
        resolved_at: '2026-04-02T00:00:00.000Z', resolved_by_member_id: admin, status: 'resolved',
      });
      insertWorkQueueItem(db, {
        entity_id: id, parked_at: '2026-04-03T00:00:00.000Z', parked_by_member_id: admin,
        park_reason: 'admin-park-note',
      });
      insertWorkQueueItem(db, { entity_id: other, detail_text: 'their-request-words' });
      // Same id, different kind of entity: not an item about this member.
      insertWorkQueueItem(db, { entity_type: 'event', entity_id: id, detail_text: 'event-entity-words' });
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    const items = doc.workQueueItemsAboutMember as Array<{ detail_text: string | null; park_reason: string | null }>;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.detail_text).filter(Boolean)).toEqual(['my-request-words']);
    expect(items.map((i) => i.park_reason).filter(Boolean)).toEqual(['admin-park-note']);
    expectNoneOf(res.text, ['wq-payload-leak', 'their-request-words', 'event-entity-words', other, admin]);
  });

  // Defect caught: the member's notes and activity answers about clubs are
  // missing, or another member's appear in their copy.
  it('carries the member’s club insight notes and activity signals', async () => {
    const { slug, id, other } = threeMembers('exp_clubsig');
    withDb((db) => {
      const club = insertClub(db, { name: 'Signal Club' });
      insertClubInsightNote(db, { member_id: id, club_id: club, note_text: 'insight-mine' });
      insertClubInsightNote(db, { member_id: other, club_id: club, note_text: 'insight-theirs' });
      insertClubViabilitySignal(db, { member_id: id, club_id: club, activity_signal: 'not_active' });
      insertClubViabilitySignal(db, { member_id: other, club_id: club, activity_signal: 'active' });
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.clubs.insightNotes.map((r: { note_text: string }) => r.note_text)).toEqual(['insight-mine']);
    expect(doc.clubs.viabilitySignals.map((r: { activity_signal: string; club_name: string }) => [r.activity_signal, r.club_name]))
      .toEqual([['not_active', 'Signal Club']]);
    expectNoneOf(res.text, ['insight-theirs', other]);
  });

  // Defect caught: the member cannot see where they stand on each onboarding
  // step, or the copy carries the held answers, which point at the records
  // they claimed and can name another person's.
  it('carries the onboarding steps by type and state, without the held answers', async () => {
    const slug = 'exp_onb';
    const { id, other } = withDb((db) => {
      const id = insertMember(db, { slug, onboarding: 'none' });
      const other = insertMember(db, { slug: 'exp_onb_other' });
      insertOnboardingTask(db, id, 'personal_details', 'completed');
      insertOnboardingTask(db, id, 'legacy_claim', 'completed', { birth_date_changes: 2 });
      insertOnboardingTask(db, id, 'club_affiliations', 'completed');
      setOnboardingHeldAnswer(db, id, 'legacy_claim', { claim: { target: { legacyMemberId: 'held-claim-target-leak' } } });
      setOnboardingHeldAnswer(db, other, 'club_affiliations', { answers: [{ insightNote: 'their-held-note' }] });
      return { id, other };
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.onboardingSteps.map((r: { task_type: string; state: string }) => [r.task_type, r.state]))
      .toEqual([['club_affiliations', 'completed'], ['legacy_claim', 'completed'], ['personal_details', 'completed']]);
    expect(doc.onboardingSteps.find((r: { task_type: string }) => r.task_type === 'legacy_claim').birth_date_changes).toBe(2);
    expectNoneOf(res.text, ['held-claim-target-leak', 'their-held-note', 'answer_json', other]);
  });

  // Defect caught: the rules and links the member set on their own galleries
  // are missing, or another member's appear in their copy.
  it('carries the member’s gallery tags and gallery links', async () => {
    const { slug, id, other } = threeMembers('exp_gal');
    withDb((db) => {
      const mine = insertMemberGallery(db, { owner_member_id: id, created_by: id });
      const theirs = insertMemberGallery(db, { owner_member_id: other, created_by: other });
      const include = insertTag(db, { tag_normalized: '#exp_gal_include', tag_display: '#exp_gal_include' });
      const exclude = insertTag(db, { tag_normalized: '#exp_gal_exclude', tag_display: '#exp_gal_exclude' });
      const foreign = insertTag(db, { tag_normalized: '#exp_gal_theirs', tag_display: '#exp_gal_theirs' });
      insertGalleryCriterionTag(db, mine, include);
      insertGalleryExcludeTag(db, mine, exclude);
      insertGalleryCriterionTag(db, theirs, foreign);
      insertGalleryExternalLink(db, { gallery_id: mine, url: 'https://example.test/exp-gal-mine' });
      insertGalleryExternalLink(db, { gallery_id: theirs, url: 'https://example.test/exp-gal-theirs' });
    });

    const res = await download(slug, id);
    const doc = JSON.parse(res.text);

    expect(doc.media.galleryTags.map((r: { tag_display: string; criterion: string }) => [r.criterion, r.tag_display]).sort())
      .toEqual([['exclude', '#exp_gal_exclude'], ['include', '#exp_gal_include']]);
    expect(doc.media.galleryExternalLinks.map((r: { url: string }) => r.url)).toEqual(['https://example.test/exp-gal-mine']);
    expectNoneOf(res.text, ['#exp_gal_theirs', 'exp-gal-theirs', other]);
  });
});

describe('a section cut at the ceiling', () => {
  // Defect caught: a section stops at the per-section ceiling and the file
  // gives the member no sign that it is incomplete, or names a section that
  // was not cut. The ceiling is 5000 rows; the member at exactly that many is
  // whole, and one row more is cut.
  it('is named in the document, and a section at the ceiling is not', async () => {
    const atCap = makeMember('exp_cap_at');
    const overCap = makeMember('exp_cap_over');
    withDb((db) => {
      const club = insertClub(db, { name: 'Ceiling Club' });
      const seed = db.transaction(() => {
        for (let i = 0; i < 5000; i += 1) insertClubViabilitySignal(db, { member_id: atCap, club_id: club });
        for (let i = 0; i < 5001; i += 1) insertClubViabilitySignal(db, { member_id: overCap, club_id: club });
      });
      seed();
    });

    const whole = JSON.parse((await download('exp_cap_at', atCap)).text);
    const cut = JSON.parse((await download('exp_cap_over', overCap)).text);

    expect(whole.incompleteSections).toEqual([]);
    expect(whole.clubs.viabilitySignals).toHaveLength(5000);
    expect(cut.incompleteSections).toEqual(['clubs.viabilitySignals']);
    expect(cut.clubs.viabilitySignals).toHaveLength(5000);
  });
});
