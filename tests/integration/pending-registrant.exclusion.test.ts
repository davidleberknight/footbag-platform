/**
 * A prospective member is not a member. Every read that lists,
 * counts, links, finds or mails other people, on a public page, an admin page
 * or a mail send, must leave them out, while a member who finished onboarding
 * beside them in the same shape stays in. Each case seeds both into one shape
 * and asserts the pair, so an absence can never pass by an empty fixture.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  createTestSessionJwt,
  insertAuditEntry,
  insertClub,
  insertClubLeader,
  insertEvent,
  insertFreestyleRecord,
  insertHistoricalPerson,
  insertMailingListSubscription,
  insertMediaFlag,
  insertMediaItem,
  insertMember,
  insertMemberClubAffiliation,
  insertMemberGallery,
  insertPayment,
  insertRegistration,
  insertWorkQueueItem,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4732');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');
let createApp: Awaited<ReturnType<typeof importApp>>;

// The pair every case is built from: one person per state, each with a
// historical record of their own so the record-linked surfaces have a
// subject. Both are Hall of Fame so the honor-gated surfaces include them.
const MEMBER = { id: 'pr-member', slug: 'pr_member', hp: 'hp-pr-member' };
const PENDING = { id: 'pr-pending', slug: 'pr_pending', hp: 'hp-pr-pending' };
let adminId: string;
let systemId: string;
let clubId: string;

beforeAll(async () => {
  db = createTestDb(dbPath);
  for (const [who, onboarding] of [[MEMBER, 'complete'], [PENDING, 'none']] as const) {
    insertHistoricalPerson(db, { person_id: who.hp, person_name: `Name ${who.slug}`, hof_member: 1 });
    insertMember(db, {
      id: who.id, slug: who.slug, display_name: `Name ${who.slug}`,
      login_email: `${who.slug}@example.com`, is_hof: 1, onboarding,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(who.hp, who.id);
  }
  adminId = insertMember(db, { slug: 'pr_admin', login_email: 'pr-admin@example.com', is_admin: 1 });
  // The system account never onboards, so it carries no task rows, exactly as
  // the real one does; the surfaces that serve it must not mistake it for a
  // prospective member.
  systemId = insertMember(db, { slug: 'pr_system', is_system: 1, onboarding: 'none' });
  clubId = insertClub(db);
  dbMod = await import('../../src/db/db');
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: adminId, role: 'admin' })}`;
}

describe('public surfaces leave a prospective member out', () => {
  it('a historical record links to its holder only once the holder is a member', () => {
    const linked = dbMod.publicPlayers.findLinkedMemberSlug.get(MEMBER.hp) as { slug: string } | undefined;
    const pending = dbMod.publicPlayers.findLinkedMemberSlug.get(PENDING.hp);
    expect(linked?.slug).toBe(MEMBER.slug);
    expect(pending).toBeUndefined();
  });

  it('the sitemap keeps an honoree record a prospective member holds, and drops one a member holds', () => {
    // A record a member holds redirects to their profile, so the sitemap lists
    // the profile instead; a pending holder has no profile, so the record stays.
    const ids = (dbMod.publicPlayers.listPublicDetailIds.all() as { person_id: string }[])
      .map((r) => r.person_id);
    expect(ids).not.toContain(MEMBER.hp);
    expect(ids).toContain(PENDING.hp);
  });

  it('a freestyle record links its holder to a profile only for a member', () => {
    insertFreestyleRecord(db, { person_id: MEMBER.hp, confidence: 'verified' });
    insertFreestyleRecord(db, { person_id: PENDING.hp, confidence: 'verified' });
    const rows = dbMod.freestyleRecords.listPublic.all() as { holder_member_slug: string | null }[];
    const slugs = rows.map((r) => r.holder_member_slug);
    expect(slugs).toContain(MEMBER.slug);
    expect(slugs).not.toContain(PENDING.slug);
  });

  it('a club roster and its member count include the member and not the prospective member', () => {
    insertMemberClubAffiliation(db, MEMBER.id, clubId);
    insertMemberClubAffiliation(db, PENDING.id, clubId);
    const roster = (dbMod.clubs.listLiveMembersByClubId.all(clubId) as { member_id: string }[])
      .map((r) => r.member_id);
    expect(roster).toContain(MEMBER.id);
    expect(roster).not.toContain(PENDING.id);
    const counts = dbMod.clubs.listMemberCountsForAllClubs.all() as { club_id: string; member_count: number }[];
    expect(counts.find((c) => c.club_id === clubId)?.member_count).toBe(1);
  });

  it('a gallery list and uploader credits name a member and never a prospective member', () => {
    insertMemberGallery(db, { owner_member_id: MEMBER.id, name: 'Member Gallery', created_by: MEMBER.id });
    insertMemberGallery(db, { owner_member_id: PENDING.id, name: 'Pending Gallery', created_by: PENDING.id });
    const owners = (dbMod.media.listMemberOwnedNamedGalleries.all() as { owner_slug: string }[])
      .map((g) => g.owner_slug);
    expect(owners).toContain(MEMBER.slug);
    expect(owners).not.toContain(PENDING.slug);
    const credited = dbMod.queryMemberDisplayNamesBySlugs([MEMBER.slug, PENDING.slug]).map((r) => r.slug);
    expect(credited).toEqual([MEMBER.slug]);
  });

  it('the media hub keeps the system account\'s curated galleries while leaving a pending owner\'s out', () => {
    insertMemberGallery(db, { owner_member_id: systemId, name: 'Curated Gallery' });
    insertMemberGallery(db, { owner_member_id: PENDING.id, name: 'Pending Hub Gallery', created_by: PENDING.id });
    const names = (dbMod.media.listAllNamedGalleries.all() as { name: string }[]).map((g) => g.name);
    expect(names).toContain('Curated Gallery');
    expect(names).not.toContain('Pending Hub Gallery');
  });
});

describe('admin surfaces never find or name a prospective member', () => {
  it('member search and key lookups find the member and not the prospective member', () => {
    const search = (key: string): string[] =>
      (dbMod.account.findMemberIdsForAdminSearch.all(key, key, '', 'no-name-matches-this', 50) as { id: string }[])
        .map((r) => r.id);
    expect(search(MEMBER.slug)).toEqual([MEMBER.id]);
    expect(search(PENDING.slug)).toEqual([]);
    expect(dbMod.account.findActiveMemberByKey.get(MEMBER.slug, MEMBER.slug)).toBeDefined();
    expect(dbMod.account.findActiveMemberByKey.get(PENDING.slug, PENDING.slug)).toBeUndefined();
    expect(dbMod.clubLeaders.findMemberByKeyForAdmin.get(MEMBER.slug, MEMBER.slug)).toBeDefined();
    expect(dbMod.clubLeaders.findMemberByKeyForAdmin.get(PENDING.slug, PENDING.slug)).toBeUndefined();
  });

  it('the admin member record opens for the member and answers not-found for the prospective member', async () => {
    const member = await request(createApp()).get(`/admin/members/${MEMBER.id}`).set('Cookie', adminCookie());
    const pending = await request(createApp()).get(`/admin/members/${PENDING.id}`).set('Cookie', adminCookie());
    expect(member.status).toBe(200);
    expect(pending.status).toBe(404);
  });

  it('the system account, which never onboards, still has an admin record', async () => {
    const res = await request(createApp()).get(`/admin/members/${systemId}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
  });

  it('the audit log names the member and shows the prospective member by id only', () => {
    insertAuditEntry(db, { action_type: 'member.name_corrected', entity_type: 'member', entity_id: MEMBER.id });
    insertAuditEntry(db, { action_type: 'member.name_corrected', entity_type: 'member', entity_id: PENDING.id });
    const rows = dbMod.queryAuditLog({ actionType: 'member.name_corrected' }, 50, 0);
    const byEntity = new Map(rows.map((r) => [r.entity_id, r]));
    expect(byEntity.get(MEMBER.id)?.entity_display_name).toBe(`Name ${MEMBER.slug}`);
    expect(byEntity.get(PENDING.id)?.entity_display_name ?? null).toBeNull();
    expect(byEntity.get(PENDING.id)?.entity_slug ?? null).toBeNull();
  });

  it('the audit log names a member actor and shows a pending actor by id only', () => {
    insertAuditEntry(db, {
      action_type: 'club.content_edited', actor_type: 'member', actor_member_id: MEMBER.id,
      entity_type: 'club', entity_id: 'club-a',
    });
    insertAuditEntry(db, {
      action_type: 'club.content_edited', actor_type: 'member', actor_member_id: PENDING.id,
      entity_type: 'club', entity_id: 'club-b',
    });
    const rows = dbMod.queryAuditLog({ actionType: 'club.content_edited' }, 50, 0);
    const byActor = new Map(rows.map((r) => [r.actor_member_id, r]));
    expect(byActor.get(MEMBER.id)?.actor_display_name).toBe(`Name ${MEMBER.slug}`);
    expect(byActor.get(PENDING.id)?.actor_display_name ?? null).toBeNull();
  });

  it('the recent honor grants list names a member and shows a pending one by id', async () => {
    insertAuditEntry(db, { action_type: 'tier.hof_grant', entity_type: 'member', entity_id: MEMBER.id });
    insertAuditEntry(db, { action_type: 'tier.hof_grant', entity_type: 'member', entity_id: PENDING.id });
    const { adminHonorGrantService } = await import('../../src/services/adminHonorGrantService');
    const names = adminHonorGrantService.getHonorGrantsPage().content.recent.map((r) => r.displayName);
    expect(names).toContain(`Name ${MEMBER.slug}`);
    expect(names).toContain(PENDING.id);
    expect(names).not.toContain(`Name ${PENDING.slug}`);
  });

  it('the admin work queue names and links a member subject, and shows a pending one by id with no links', async () => {
    insertWorkQueueItem(db, { queue_category: 'membership', entity_type: 'member', entity_id: MEMBER.id, reason_text: 'member item' });
    insertWorkQueueItem(db, { queue_category: 'membership', entity_type: 'member', entity_id: PENDING.id, reason_text: 'pending item' });
    const res = await request(createApp()).get('/admin/work-queue?category=membership').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`/admin/members/${MEMBER.id}`);
    expect(res.text).toContain(`/members/${MEMBER.slug}`);
    expect(res.text).not.toContain(`/admin/members/${PENDING.id}`);
    expect(res.text).not.toContain(`/members/${PENDING.slug}`);
    expect(res.text).not.toContain(`Name ${PENDING.slug}`);
  });

  it('an admin payment links a member payer and never a pending one', () => {
    const memberPay = insertPayment(db, { member_id: MEMBER.id, status: 'succeeded' });
    const pendingPay = insertPayment(db, { member_id: PENDING.id, status: 'succeeded' });
    expect(dbMod.findAdminPaymentById(memberPay)?.member_slug).toBe(MEMBER.slug);
    expect(dbMod.findAdminPaymentById(pendingPay)?.member_slug ?? null).toBeNull();
    const listed = new Map(dbMod.queryAdminPayments({}, 100, 0).map((p) => [p.id, p.member_slug ?? null]));
    expect(listed.get(memberPay)).toBe(MEMBER.slug);
    expect(listed.get(pendingPay)).toBeNull();
  });

  it('the media-flags queue keeps a pending reporter\'s flag but marks them not nameable', () => {
    const media = insertMediaItem(db, { uploader_member_id: MEMBER.id });
    insertMediaFlag(db, { media_id: media, reporter_member_id: MEMBER.id });
    insertMediaFlag(db, { media_id: media, reporter_member_id: PENDING.id });
    const rows = dbMod.mediaFlags.listOpenFlagsWithMedia.all() as
      { reporter_member_id: string; reporter_is_nameable: number }[];
    const byReporter = new Map(rows.map((r) => [r.reporter_member_id, r.reporter_is_nameable]));
    expect(byReporter.get(MEMBER.id)).toBe(1);
    expect(byReporter.get(PENDING.id)).toBe(0);
  });

  it('a club\'s leader list and the honor holders name the member and not the prospective member', () => {
    const leaderClub = insertClub(db);
    const otherClub = insertClub(db);
    insertClubLeader(db, { club_id: leaderClub, member_id: MEMBER.id });
    insertClubLeader(db, { club_id: otherClub, member_id: PENDING.id });
    expect((dbMod.clubLeaders.listLeadersWithNames.all(leaderClub) as unknown[]).length).toBe(1);
    expect((dbMod.clubLeaders.listLeadersWithNames.all(otherClub) as unknown[]).length).toBe(0);
    const hof = (dbMod.memberTier.listCurrentHofHolders.all() as { id: string }[]).map((r) => r.id);
    expect(hof).toContain(MEMBER.id);
    expect(hof).not.toContain(PENDING.id);
  });

  it('a held record names a member holder and shows a pending holder by id only', () => {
    const member = dbMod.legacyClaim.findHolderForAdmin.get(MEMBER.id) as { is_nameable: number };
    const pending = dbMod.legacyClaim.findHolderForAdmin.get(PENDING.id) as { is_nameable: number };
    expect(member.is_nameable).toBe(1);
    expect(pending.is_nameable).toBe(0);
    const rows = dbMod.deceasedMarking.searchHistoricalPersons.all('', 'name pr_', 50) as
      { person_id: string; claimed_by_is_nameable: number }[];
    const byRecord = new Map(rows.map((r) => [r.person_id, r.claimed_by_is_nameable]));
    expect(byRecord.get(MEMBER.hp)).toBe(1);
    expect(byRecord.get(PENDING.hp)).toBe(0);
  });

  it('the dashboard account count grows for a new member and not for a new prospective member', () => {
    const count = (): number => (dbMod.officialRoster.totalRegisteredAccounts.get() as { n: number }).n;
    const before = count();
    insertMember(db, { slug: 'pr_count_pending', login_email: 'pr-count-p@example.com', onboarding: 'none' });
    expect(count()).toBe(before);
    insertMember(db, { slug: 'pr_count_member', login_email: 'pr-count-m@example.com' });
    expect(count()).toBe(before + 1);
  });
});

describe('mail never goes to a prospective member as one of a list', () => {
  it('a mailing-list broadcast reaches the member subscriber and not the pending one', () => {
    insertMailingListSubscription(db, { member_id: MEMBER.id, list_slug: 'pr-list' });
    insertMailingListSubscription(db, { member_id: PENDING.id, list_slug: 'pr-list' });
    db.prepare("UPDATE mailing_lists SET status = 'active' WHERE slug = 'pr-list'").run();
    const recipients = (dbMod.mailingListSubscriptions.listActiveSubscribersBySlug.all('pr-list') as
      { member_id: string }[]).map((r) => r.member_id);
    expect(recipients).toEqual([MEMBER.id]);
  });

  it('a mail to an event\'s confirmed participants reaches the member and not the prospective member', () => {
    const eventId = insertEvent(db);
    insertRegistration(db, eventId, MEMBER.id, { status: 'confirmed' });
    insertRegistration(db, eventId, PENDING.id, { status: 'confirmed' });
    const recipients = (dbMod.mailingListSubscriptions.listConfirmedParticipantRecipients.all(eventId) as
      { member_id: string }[]).map((r) => r.member_id);
    expect(recipients).toEqual([MEMBER.id]);
  });
});
