/**
 * The member's action block on their own profile, and the compact banner it
 * puts on every other member page.
 *
 * The block is advisory and derived at page draw: nothing is stored for it, an
 * item clears when the record behind it changes, and a member with nothing
 * outstanding sees no block and no empty state. Only a needs-attention-now item
 * raises the banner, and never on the profile the banner would link to.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertActivePlayerGrant,
  insertWorkQueueItem,
  insertMemberMessage,
  insertPayment,
  insertRecurringDonationSubscription,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3451');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

const CLEAR_ID = 'act-clear';
const CLEAR_SLUG = 'act_clear';
const EXPIRING_ID = 'act-expiring';
const EXPIRING_SLUG = 'act_expiring';
const LAPSED_ID = 'act-lapsed';
const LAPSED_SLUG = 'act_lapsed';
const PROCESSED_ID = 'act-processed';
const PROCESSED_SLUG = 'act_processed';
const LONG_LAPSED_ID = 'act-long-lapsed';
const LONG_LAPSED_SLUG = 'act_long_lapsed';
const ASKED_ID = 'act-asked';
const ASKED_SLUG = 'act_asked';
const ADMIN_ID = 'act-admin';
const FAILED_PURCHASE_ID = 'act-failed-purchase';
const FAILED_PURCHASE_SLUG = 'act_failed_purchase';
const PAST_DUE_ID = 'act-past-due';
const PAST_DUE_SLUG = 'act_past_due';
const PENDING_PURCHASE_ID = 'act-pending-purchase';
const PENDING_PURCHASE_SLUG = 'act_pending_purchase';

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Nothing outstanding: no Active Player history at all, no question waiting.
  insertMember(db, { id: CLEAR_ID, slug: CLEAR_SLUG, login_email: 'act-clear@example.com' });

  // Active Player still current, inside the first reminder window.
  insertMember(db, { id: EXPIRING_ID, slug: EXPIRING_SLUG, login_email: 'act-expiring@example.com' });
  insertActivePlayerGrant(db, {
    member_id: EXPIRING_ID,
    change_type: 'grant',
    new_active_player_expires_at: isoDaysFromNow(10),
    reason_code: 'official_event_attendance',
  });

  // Active Player lapsed inside the visible window.
  insertMember(db, { id: LAPSED_ID, slug: LAPSED_SLUG, login_email: 'act-lapsed@example.com' });
  insertActivePlayerGrant(db, {
    member_id: LAPSED_ID,
    change_type: 'grant',
    new_active_player_expires_at: isoDaysFromNow(-5),
    reason_code: 'official_event_attendance',
  });

  // Lapsed AND processed by the expiry job, which is the shape a real lapse
  // reaches: the expire row clears the new expiry and carries the date it
  // ended as the old one.
  insertMember(db, { id: PROCESSED_ID, slug: PROCESSED_SLUG, login_email: 'act-processed@example.com' });
  insertActivePlayerGrant(db, {
    member_id: PROCESSED_ID,
    change_type: 'grant',
    new_active_player_expires_at: isoDaysFromNow(-9),
    reason_code: 'official_event_attendance',
  });
  insertActivePlayerGrant(db, {
    member_id: PROCESSED_ID,
    change_type: 'expire',
    old_active_player_expires_at: isoDaysFromNow(-9),
    new_active_player_expires_at: null,
    reason_code: 'active_player_expired',
  });

  // Lapsed long ago: past the window, so the platform stops raising it.
  insertMember(db, { id: LONG_LAPSED_ID, slug: LONG_LAPSED_SLUG, login_email: 'act-long@example.com' });
  insertActivePlayerGrant(db, {
    member_id: LONG_LAPSED_ID,
    change_type: 'grant',
    new_active_player_expires_at: isoDaysFromNow(-120),
    reason_code: 'official_event_attendance',
  });

  // An administrator's question is waiting.
  insertMember(db, { id: ADMIN_ID, slug: 'act_admin', login_email: 'act-admin@example.com', is_admin: 1 });
  insertMember(db, { id: ASKED_ID, slug: ASKED_SLUG, login_email: 'act-asked@example.com' });
  const itemId = insertWorkQueueItem(db, { entity_id: ASKED_ID });
  insertMemberMessage(db, {
    recipient_member_id: ASKED_ID,
    sender_admin_member_id: ADMIN_ID,
    work_queue_item_id: itemId,
    subject: 'A private subject nobody else should read',
    body_text: 'A private question body nobody else should read',
  });

  // A membership payment that settled as failed: the member paid for a tier and
  // holds nothing, and the only notice they had was an email carrying no link.
  insertMember(db, {
    id: FAILED_PURCHASE_ID, slug: FAILED_PURCHASE_SLUG,
    login_email: 'act-failed-purchase@example.com',
  });
  insertPayment(db, {
    member_id: FAILED_PURCHASE_ID, payment_type: 'membership', status: 'failed',
    purchased_tier_status: 'tier2', amount_cents: 5000,
  });

  // A declined attempt inside a live checkout leaves the row pending on
  // purpose, because the buyer may still try another card at the provider.
  insertMember(db, {
    id: PENDING_PURCHASE_ID, slug: PENDING_PURCHASE_SLUG,
    login_email: 'act-pending-purchase@example.com',
  });
  insertPayment(db, {
    member_id: PENDING_PURCHASE_ID, payment_type: 'membership', status: 'pending',
    purchased_tier_status: 'tier1', amount_cents: 1000,
  });

  // A recurring donation the provider could not collect on.
  insertMember(db, {
    id: PAST_DUE_ID, slug: PAST_DUE_SLUG, login_email: 'act-past-due@example.com',
  });
  insertRecurringDonationSubscription(db, {
    member_id: PAST_DUE_ID, status: 'past_due', amount_cents: 2500,
    stripe_subscription_id: 'sub_act_past_due',
  });

  db.close();
  createApp = await importApp();
  testDb = new BetterSqlite3(dbPath);
  testDb.pragma('foreign_keys = ON');
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

async function ownProfile(memberId: string, slug: string) {
  return request(createApp()).get(`/members/${slug}`).set('Cookie', cookieFor(memberId));
}

/** Any member page that is not the viewer's own profile, where the banner lives. */
async function someOtherMemberPage(memberId: string) {
  return request(createApp()).get(`/members/${CLEAR_SLUG}`).set('Cookie', cookieFor(memberId));
}

describe('a member with nothing outstanding', () => {
  it('renders no action block and no empty state', async () => {
    const res = await ownProfile(CLEAR_ID, CLEAR_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Waiting on You');
    expect(res.text).not.toContain('all caught up');
  });

  it('carries no banner anywhere', async () => {
    const res = await someOtherMemberPage(LONG_LAPSED_ID);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('flash-action');
  });
});

describe('an obligation that can wait', () => {
  it('renders in the block with its deadline explained', async () => {
    const res = await ownProfile(EXPIRING_ID, EXPIRING_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Waiting on You');
    expect(res.text).toContain('Keep your Active Player status');
    expect(res.text).toContain('It runs out on');
  });

  it('offers the two routes back this member can take for themselves', async () => {
    // Both paid tiers end the dependence on the status, so the upgrade names
    // both and points at the block that sells them rather than buying one.
    const res = await ownProfile(EXPIRING_ID, EXPIRING_SLUG);
    expect(res.text).toContain('Upgrade to Tier 1 or Tier 2 Membership');
    expect(res.text).toContain('href="#membership"');
    expect(res.text).toContain('Find an Event');
  });

  it('states the vouch route rather than offering it as a control', async () => {
    // A vouch is given by a Tier 2 or Tier 3 member, so a control would promise
    // this member an action that is not theirs to take.
    const res = await ownProfile(EXPIRING_ID, EXPIRING_SLUG);
    expect(res.text).toContain('A Tier 2 or Tier 3 member can also vouch for you');
    expect(res.text).not.toContain('Vouch for You</a>');
    expect(res.text).not.toContain('Vouch for You</button>');
  });

  it('does not sell a single tier from the action block', async () => {
    // One control cannot buy either tier, so the option must not be a purchase
    // submit; the membership block is the one place a tier is actually bought.
    const res = await ownProfile(EXPIRING_ID, EXPIRING_SLUG);
    const actionBlock = res.text.slice(
      res.text.indexOf('Waiting on You'),
      res.text.indexOf('id="membership"'),
    );
    expect(actionBlock).not.toContain('purchase-tier');
  });

  it('offers no club-join route, which this member can no longer receive', async () => {
    // The grant is defined for a member who has never been Active Player, and
    // anyone this item can appear for already has been. The block must not
    // point at a route the grant refuses.
    const res = await ownProfile(EXPIRING_ID, EXPIRING_SLUG);
    expect(res.text).not.toContain('Join a Club');
    expect(res.text).not.toContain('Find a Club');
  });

  it('raises no banner, because only a needs-attention-now item does', async () => {
    const res = await someOtherMemberPage(EXPIRING_ID);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('flash-action');
  });
});

describe('an obligation that needs attention now', () => {
  it('renders in the block for a lapsed Active Player', async () => {
    const res = await ownProfile(LAPSED_ID, LAPSED_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Get your Active Player status back');
    expect(res.text).toContain('It ran out on');
  });

  it('still renders after the expiry job has processed the lapse', async () => {
    // The expire row clears the new expiry and moves the date to the old
    // column. A read that looked only at the new one would go silent for every
    // member whose expiry actually ran, which is the whole audience.
    const res = await ownProfile(PROCESSED_ID, PROCESSED_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Get your Active Player status back');
    expect(res.text).toContain('It ran out on');
  });

  it('lets the membership block state the lapse for that same member', async () => {
    const res = await ownProfile(PROCESSED_ID, PROCESSED_SLUG);
    expect(res.text).toContain('Active Player expired');
    expect(res.text).toContain('Official IFPA Roster listing have ended');
  });

  it('stops being raised once the lapse is long past', async () => {
    const res = await ownProfile(LONG_LAPSED_ID, LONG_LAPSED_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Waiting on You');
    expect(res.text).not.toContain('Get your Active Player status back');
  });

  it('puts one compact banner on another member page', async () => {
    const res = await someOtherMemberPage(LAPSED_ID);
    expect(res.status).toBe(200);
    expect(res.text).toContain('flash-action');
    expect(res.text).toContain('Something needs your attention.');
    expect(res.text).toContain(`href="/members/${LAPSED_SLUG}"`);
  });

  it('does not repeat the banner on the profile it would link to', async () => {
    const res = await ownProfile(LAPSED_ID, LAPSED_SLUG);
    expect(res.text).not.toContain('flash-action');
  });

  it('does not repeat the banner when that profile is reached with a trailing slash', async () => {
    // Routing matches both forms to the same page, so suppression has to as
    // well; otherwise the banner draws directly above the block it points at.
    const res = await request(createApp())
      .get(`/members/${LAPSED_SLUG}/`)
      .set('Cookie', cookieFor(LAPSED_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Waiting on You');
    expect(res.text).not.toContain('flash-action');
  });
});

describe('an administrator question', () => {
  it('renders as an item pointing at the owner-only answer page', async () => {
    const res = await ownProfile(ASKED_ID, ASKED_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).toContain('An IFPA administrator has a question for you');
    expect(res.text).toContain(`href="/members/${ASKED_SLUG}/questions"`);
  });

  it('carries no part of the question, which is read only on that page', async () => {
    const res = await ownProfile(ASKED_ID, ASKED_SLUG);
    expect(res.text).not.toContain('A private subject nobody else should read');
    expect(res.text).not.toContain('A private question body nobody else should read');
  });

  it('keeps the question out of the banner too', async () => {
    const res = await someOtherMemberPage(ASKED_ID);
    expect(res.text).toContain('flash-action');
    expect(res.text).not.toContain('A private subject nobody else should read');
    expect(res.text).not.toContain('A private question body nobody else should read');
  });

  it('is offered once on the page, not also as a quick action', async () => {
    const res = await ownProfile(ASKED_ID, ASKED_SLUG);
    expect(res.text).toContain('Quick Actions');
    expect(res.text).not.toContain('Answer IFPA');
  });
});

describe('the block belongs to its owner', () => {
  it('never renders on another member’s view of the same profile', async () => {
    const res = await request(createApp())
      .get(`/members/${ASKED_SLUG}`)
      .set('Cookie', cookieFor(CLEAR_ID));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('An IFPA administrator has a question for you');
    expect(res.text).not.toContain('Waiting on You');
  });

  it('shows an anonymous visitor nothing of it', async () => {
    const res = await request(createApp()).get(`/members/${ASKED_SLUG}`);
    expect(res.text).not.toContain('An IFPA administrator has a question for you');
    expect(res.text).not.toContain('Waiting on You');
  });
});

describe('a membership payment that failed', () => {
  it('reaches the member on the site, not only by an email carrying no link', async () => {
    // The two payment obligations were previously deliverable only by mail, and
    // notification mail on this platform carries no clickable links, so neither
    // message could point anywhere. A member who paid and received nothing had
    // no way to find the problem or act on it.
    const res = await ownProfile(FAILED_PURCHASE_ID, FAILED_PURCHASE_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your membership payment did not go through');
  });

  it('offers the way back for the tier that was actually being bought', async () => {
    const res = await ownProfile(FAILED_PURCHASE_ID, FAILED_PURCHASE_SLUG);
    expect(res.text).toContain(`action="/members/${FAILED_PURCHASE_SLUG}/purchase-tier"`);
    expect(res.text).toContain('value="tier2"');
    expect(res.text).toContain('Try Again');
  });

  it('says nothing while a checkout is still live and another card may yet work', async () => {
    // A declined attempt leaves the payment pending on purpose, because the
    // buyer is still at the provider and may present another card. Raising an
    // obligation there would nag someone mid-purchase.
    const res = await ownProfile(PENDING_PURCHASE_ID, PENDING_PURCHASE_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Your membership payment did not go through');
  });
});

describe('a recurring donation the provider could not collect', () => {
  it('tells the member, and offers no action, because the provider is still trying', async () => {
    const res = await ownProfile(PAST_DUE_ID, PAST_DUE_SLUG);
    expect(res.status).toBe(200);
    expect(res.text).toContain('A payment on your recurring donation could not be collected');
    expect(res.text).toContain(`href="/members/${PAST_DUE_SLUG}/payments"`);
  });

  it('raises no banner, because it is pending rather than needing attention now', async () => {
    // It clears when the provider collects or gives up on its own dunning
    // schedule, so there is nothing for the member to do until then.
    const res = await request(createApp())
      .get(`/members/${CLEAR_SLUG}`)
      .set('Cookie', cookieFor(PAST_DUE_ID));
    expect(res.text).not.toContain('A payment on your recurring donation could not be collected');
  });
});
