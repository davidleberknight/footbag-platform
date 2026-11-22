/**
 * The database and environment every in-process crawl runs against.
 *
 * Boots the development environment so the persona harness mounts (its switch
 * links are how a crawl becomes a persona), points the media roots at a temp
 * directory so no render reaches a repository path, and seeds a small corpus in
 * which every section has something to link to: members of each standing, a
 * club, an event, news items, a historical honoree, a freestyle corpus with an alias, a
 * modifier and a source, records, the catalog galleries the freestyle landing
 * links, the whole canonical persona catalog, and the private-field canaries.
 *
 * `prepareCrawlEnv` must run at a test file's top level, before the app is
 * imported; `seedCrawlFixture` runs in `beforeAll`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb } from '../testDb';
import { seedStagedSets } from '../stagedSets';
import { seedStagedGlossary } from '../stagedGlossary';
import { seedStagedOperators } from '../stagedOperators';
import { seedPersona } from '../../../src/testkit/personaFactory';
import { CANONICAL_PERSONAS } from '../../../src/testkit/canonicalPersonas';
import {
  insertMember,
  insertClub,
  insertTag,
  insertEvent,
  insertEventOrganizer,
  insertDiscipline,
  insertRegistration,
  insertRegistrationDisciplineSelection,
  insertHistoricalPerson,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifier,
  insertFreestyleFamily,
  insertFreestyleTrickModifierLink,
  insertFreestyleTrickSource,
  insertFreestyleTrickSourceLink,
  insertFreestyleRecord,
  insertConsecutiveKicksRecord,
  insertMemberGallery,
  insertGalleryCriterionTag,
  insertMediaItem,
  insertWorkQueueItem,
  insertNewsItem,
  completeOnboarding,
  seedPrivateFieldCanaries,
  type PrivateFieldCanaries,
} from '../factories';

export const CRAWL_MEMBER_ID = 'crawl-member-001';
export const CRAWL_ADMIN_ID = 'crawl-admin-001';

/** A member upload in the crawl member's gallery, so the item pages are walked. */
export const CRAWL_MEDIA_ITEM_ID = 'media_crawl_item';

/** The freestyle tricks the fixture seeds; other trick-detail links are skipped. */
export const SEEDED_TRICK_SLUGS = new Set(['whirl', 'paradox_whirl']);

export interface CrawlEnv {
  dbPath: string;
  mediaTmp: string;
}

export function prepareCrawlEnv(port: string): CrawlEnv {
  const { dbPath } = setTestEnv(port);
  process.env.FOOTBAG_ENV = 'development';
  const mediaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-crawl-media-'));
  process.env.FOOTBAG_MEDIA_DIR = mediaTmp;
  process.env.FOOTBAG_CURATED_MEDIA_DIR = mediaTmp;
  return { dbPath, mediaTmp };
}

export interface CrawlFixture {
  canaries: PrivateFieldCanaries;
}

export async function seedCrawlFixture(env: CrawlEnv): Promise<CrawlFixture> {
  const db = createTestDb(env.dbPath);
  const canaries = seedCrawlWorld(db);
  db.close();

  // The finance persona's journey follows its seed, as the seed command runs
  // it, so the Financial Reports page has the report the crawl follows.
  const { runFinanceDemoJourney } = await import('../../../src/testkit/financeDemoJourney');
  const journey = await runFinanceDemoJourney();
  if (journey.status !== 'ran') throw new Error(`the finance journey did not run: ${journey.status}`);

  // The admin curator pages exercise disk paths at render time; point the
  // curated root at tmp via the service's explicit test seam.
  const svcMod = await import('../../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(env.mediaTmp);

  return { canaries };
}

/**
 * The crawl corpus itself, inserted into an open database. The in-process crawl
 * seeds a fresh test database with it; the rendered-style browser check seeds the
 * running stack's database with it, so both walk the same site.
 */
export function seedCrawlWorld(db: BetterSqlite3.Database): PrivateFieldCanaries {
  insertMember(db, {
    id: CRAWL_MEMBER_ID, slug: 'crawl_member', display_name: 'Crawl Member',
    login_email: 'crawl-member@example.com',
  });
  completeOnboarding(db, CRAWL_MEMBER_ID);
  insertMember(db, {
    id: CRAWL_ADMIN_ID, slug: 'crawl_admin', display_name: 'Crawl Admin',
    login_email: 'crawl-admin@example.com', is_admin: 1,
  });
  completeOnboarding(db, CRAWL_ADMIN_ID);
  insertMember(db, {
    id: 'crawl-hof-001', slug: 'crawl_hof', display_name: 'Crawl Hof',
    login_email: 'crawl-hof@example.com', is_hof: 1,
  });
  completeOnboarding(db, 'crawl-hof-001');

  const clubTag = insertTag(db, {
    tag_normalized: '#club_crawlville', tag_display: '#club_crawlville', standard_type: 'club',
  });
  // A real (non-fixture) club in the same country the persona clubs use, so the
  // country directory has a visible club and the persona clubs' country links
  // resolve even though the persona fixtures are excluded from it.
  insertClub(db, { id: 'club-crawlville-real', name: 'Crawlville Footbag', city: 'Crawlville', country: 'United States', hashtag_tag_id: clubTag });

  const crawlEventId = insertEvent(db, { title: 'Crawl Open', status: 'reg_open' });
  // The crawl member and the crawl administrator organize it together, so the
  // profile's My Events block links the crawl to the organizers' manage page,
  // and each sees the other's remove control and their own step-down control;
  // one structured division puts its change and remove controls on that page.
  insertEventOrganizer(db, crawlEventId, CRAWL_MEMBER_ID);
  insertEventOrganizer(db, crawlEventId, CRAWL_ADMIN_ID);

  // The news feed: an administrator's item, a member's Community post with its
  // byline, an item about the crawl event with its hashtag, and an item from an
  // earlier year, so the landing page's year navigation reaches a year page.
  const anHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  insertNewsItem(db, {
    id: 'news_crawl_announcement', published_at: anHourAgo, news_type: 'announcement', title: 'Crawl Announcement',
  });
  insertNewsItem(db, {
    id: 'news_crawl_community', published_at: anHourAgo, news_type: 'community_post', title: 'Crawl Community Post',
    author_member_id: CRAWL_MEMBER_ID,
  });
  insertNewsItem(db, {
    id: 'news_crawl_event', published_at: anHourAgo, news_type: 'event_published', title: 'Crawl Open Is Open',
    entity_type: 'event', entity_id: crawlEventId,
  });
  insertNewsItem(db, { id: 'news_crawl_earlier', published_at: '2024-05-01T12:00:00.000Z', title: 'Crawl Earlier News' });
  insertDiscipline(db, crawlEventId, {
    name: 'Open Singles Footbag Net', discipline_category: 'net', game_id: 'game_footbag_net',
    team_type: 'singles', gender_eligibility: 'open', division_class: 'open',
  });
  // The crawl administrator is registered and the crawl member is not, so the
  // event page offers one of them its withdraw form and the other its register
  // link. The entry is in a second division, which it locks, so the first keeps
  // its change and remove controls.
  const enteredDivisionId = insertDiscipline(db, crawlEventId, {
    name: 'Open Singles Footbag Golf', discipline_category: 'golf', game_id: 'game_footbag_golf',
    team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 2,
  });
  const crawlRegistrationId = insertRegistration(db, crawlEventId, CRAWL_ADMIN_ID);
  insertRegistrationDisciplineSelection(db, crawlRegistrationId, enteredDivisionId);
  // A doubles entry looking for a partner, so the administrator's event page
  // links the page where they choose their own partner. It is on an event the
  // administrator does not organize, so their walk never stops its online
  // registration before reaching that page.
  const doublesEventId = insertEvent(db, { title: 'Crawl Doubles', status: 'reg_open' });
  insertEventOrganizer(db, doublesEventId, CRAWL_MEMBER_ID);
  const doublesDivisionId = insertDiscipline(db, doublesEventId, {
    name: 'Open Doubles Footbag Net', discipline_category: 'net', game_id: 'game_footbag_net',
    team_type: 'doubles', gender_eligibility: 'open', division_class: 'open',
  });
  insertRegistrationDisciplineSelection(db, insertRegistration(db, doublesEventId, CRAWL_ADMIN_ID), doublesDivisionId);
  // An event whose last day has passed and that has no results yet, so its
  // manage page links the results upload and the attendance screen, and the
  // attendance screen and participant list offer the crawl administrator's
  // registration to mark.
  const finishedDay = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const finishedEventId = insertEvent(db, {
    title: 'Crawl Finished', status: 'reg_open', start_date: finishedDay, end_date: finishedDay,
  });
  insertEventOrganizer(db, finishedEventId, CRAWL_MEMBER_ID);
  const finishedDivisionId = insertDiscipline(db, finishedEventId, {
    name: 'Open Singles Footbag Net', discipline_category: 'net', game_id: 'game_footbag_net',
    team_type: 'singles', gender_eligibility: 'open', division_class: 'open',
  });
  insertRegistrationDisciplineSelection(db, insertRegistration(db, finishedEventId, CRAWL_ADMIN_ID), finishedDivisionId);
  // A sanctioned-path draft the crawl administrator organizes, so its manage
  // page offers the sanction request form and the administrators' award page
  // lists it with its award form.
  const sanctionDraftId = insertEvent(db, { title: 'Crawl Sanction Draft', status: 'draft' });
  insertEventOrganizer(db, sanctionDraftId, CRAWL_ADMIN_ID);
  // A request waiting for review, organized by the crawl member, so its queue
  // item page offers the administrator the approve and reject forms.
  const sanctionPendingId = insertEvent(db, {
    title: 'Crawl Sanction Pending', status: 'pending_approval', sanction_status: 'pending',
  });
  insertEventOrganizer(db, sanctionPendingId, CRAWL_MEMBER_ID);
  insertWorkQueueItem(db, {
    task_type: 'sanction_request', entity_type: 'event', entity_id: sanctionPendingId,
    created_by: CRAWL_MEMBER_ID,
  });
  // The world record below credits this record, so the records page links the
  // crawl to a history page the way a visitor reaches one.
  const crawlPersonId = insertHistoricalPerson(db, { person_name: 'Historic Crawler', hof_member: 1 });

  // Minimal freestyle corpus so the freestyle surfaces are crawlable. whirl is
  // an official Family Parent with a family row, so the family links its pages
  // render resolve and the family editor has a family to open;
  // the compound carries an alias, a modifier link and a source link so those
  // rendered blocks emit their links too.
  insertFreestyleFamily(db, { slug: 'whirl', display_name: 'Whirl', sort_order: 10 });
  // Every set as the rebuild seeds it, so the set pages, the encyclopedia and the
  // set editor are crawled, and every link between sets resolves.
  seedStagedSets(db);
  // Every glossary entry as the rebuild seeds it, so the glossary page and the
  // glossary editor are crawled with real entries and their deeper links.
  seedStagedGlossary(db);
  // Every operator as the rebuild seeds it, so the operators page, the operator
  // editor and every operator page are crawled.
  seedStagedOperators(db);
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'Whirl', adds: '3',
    trick_family: 'whirl', base_trick: 'whirl', category: 'dex',
    review_status: 'curated', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox_whirl', canonical_name: 'Paradox Whirl', adds: '4',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
  });
  insertFreestyleTrickAlias(db, 'crawl_alias', 'paradox_whirl', 'Crawl Alias');
  insertFreestyleTrickModifier(db, { slug: 'paradox', modifier_name: 'paradox', add_bonus: 1, modifier_type: 'body' });
  insertFreestyleTrickModifierLink(db, 'paradox_whirl', 'paradox', 1);
  const crawlSourceId = insertFreestyleTrickSource(db, { source_label: 'Crawl Source', source_type: 'curated' });
  insertFreestyleTrickSourceLink(db, 'paradox_whirl', crawlSourceId, {});
  insertFreestyleRecord(db, {
    id: 'crawl_record', person_id: crawlPersonId, display_name: 'Crawl Holder', trick_name: 'Whirl', value_numeric: 12,
  });
  insertConsecutiveKicksRecord(db, {
    id: 'crawl_ck_wr', sort_order: 401, section: 'Official World Records',
    subsection: 'Current', discipline: 'Open Singles', player_1: 'Crawl Kicker', score: 50000,
  });
  insertConsecutiveKicksRecord(db, {
    id: 'crawl_ck_ms', sort_order: 1301, section: 'Milestone Firsts',
    subsection: 'Firsts', discipline: 'Open Singles', player_1: 'Crawl Kicker', score: 10000,
  });

  // The catalog galleries the freestyle landing links statically, owned by a
  // system member. Empty galleries render fine; what matters is that the links
  // the landing renders resolve.
  insertMember(db, {
    id: 'crawl-fh-system', slug: 'crawl_fh', display_name: 'Footbag Hacky', is_system: 1,
  });
  const TS = '2026-01-01T00:00:00.000Z';
  for (const galleryId of [
    'gallery_tricks_of_the_trade',
    'gallery_shred_global',
    'gallery_passback_tutorials',
    'gallery_anz_trikz',
    'gallery_footbag_finland',
    'gallery_footbag_org',
  ]) {
    insertMemberGallery(db, {
      id: galleryId,
      created_at: TS,
      owner_member_id: 'crawl-fh-system',
      name: galleryId.replace(/_/g, ' '),
      description: '',
      is_default: 0,
    });
  }

  // One member upload, gathered by a gallery the member owns, so the member
  // galleries list links a gallery whose viewer links the item: both item
  // routes are walked, and the item page's member controls are judged for
  // every persona that reaches it.
  insertMediaItem(db, {
    id: CRAWL_MEDIA_ITEM_ID, uploader_member_id: CRAWL_MEMBER_ID,
    caption: 'Crawl upload', tags: ['#by_crawl_member'],
  });
  const crawlUploaderTag = db.prepare("SELECT id FROM tags WHERE tag_normalized = '#by_crawl_member'").get() as { id: string };
  insertMemberGallery(db, {
    id: 'gallery_crawl_member', created_at: TS, owner_member_id: CRAWL_MEMBER_ID,
    created_by: CRAWL_MEMBER_ID, name: 'Crawl Uploads', description: '', is_default: 0,
  });
  insertGalleryCriterionTag(db, 'gallery_crawl_member', crawlUploaderTag.id);

  // The full canonical persona catalog, so every /dev/switch link resolves to a
  // loadable session and each persona's conditional surfaces exist.
  for (const spec of CANONICAL_PERSONAS) {
    seedPersona(db, spec);
  }

  return seedPrivateFieldCanaries(db, 'canary');
}

export async function teardownCrawlFixture(env: CrawlEnv): Promise<void> {
  const svcMod = await import('../../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  fs.rmSync(env.mediaTmp, { recursive: true, force: true });
}

// Paths no crawl follows. Media-store files are binary uploads; the job event
// stream never ends; logging out ends the crawling session; refreshing the
// persona catalog re-seeds it mid-walk (a dedicated case probes it after).
// Trick-detail links are followed only for the seeded corpus: the freestyle
// reference pages are content authored against the full real dictionary and
// legitimately link tricks this fixture does not carry.
export function shouldSkip(p: string): boolean {
  if (p.startsWith('/media-store/')) return true;
  if (/^\/admin\/curator\/upload\/jobs\/.+\/events$/.test(p)) return true;
  if (p === '/logout') return true;
  if (p === '/dev/personas/refresh') return true;
  const trickDetail = p.match(/^\/freestyle\/tricks\/([^/?#]+)$/);
  if (trickDetail && !SEEDED_TRICK_SLUGS.has(decodeURIComponent(trickDetail[1]))) return true;
  // A work-queue item's page is the same page whatever list state its address
  // carries: the state only says where its forms return. Every list view links
  // each of its items with its own state, so following them all visits each item
  // once per list view and exhausts the page budget. The walk takes each item
  // once per kind, which still reaches every item and every form on it.
  const queueItem = p.match(/^\/admin\/work-queue\/[^/?#]+\?(.*)$/);
  if (queueItem && [...new URLSearchParams(queueItem[1]).keys()].some((k) => k !== 'kind')) return true;
  return false;
}

export const SEED_ROOTS = [
  '/', '/members', '/clubs', '/events', '/media', '/media/browse', '/hof',
  '/bap', '/history', '/freestyle', '/net', '/consecutives', '/rules', '/ifpa',
  '/equipment', '/legal', '/login', '/register', '/password/forgot', '/dev/personas',
  // Admin claim form: requireAuth-only, above the admin gate, linked from no
  // page. Anonymous and non-admin personas see the redirect or the gate.
  '/admin/bootstrap-claim',
  // The machine-read files, so their routes are reached and the sitemap's own
  // entries can be checked.
  '/robots.txt', '/sitemap.xml', '/llms.txt', '/health/live', '/health/ready',
  // A path no route serves, so the not-found page itself is checked.
  '/crawl-probe-no-such-page',
];
