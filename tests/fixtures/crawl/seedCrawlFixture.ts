/**
 * The database and environment every in-process crawl runs against.
 *
 * Boots the development environment so the persona harness mounts (its switch
 * links are how a crawl becomes a persona), points the media roots at a temp
 * directory so no render reaches a repository path, and seeds a small corpus in
 * which every section has something to link to: members of each standing, a
 * club, an event, a historical honoree, a freestyle corpus with an alias, a
 * modifier and a source, records, the catalog galleries the freestyle landing
 * links, the whole canonical persona catalog, and the private-field canaries.
 *
 * `prepareCrawlEnv` must run at a test file's top level, before the app is
 * imported; `seedCrawlFixture` runs in `beforeAll`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTestEnv, createTestDb } from '../testDb';
import {
  insertMember,
  insertClub,
  insertTag,
  insertEvent,
  insertHistoricalPerson,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  insertFreestyleTrickSource,
  insertFreestyleTrickSourceLink,
  insertFreestyleRecord,
  insertConsecutiveKicksRecord,
  insertMemberGallery,
  insertGalleryCriterionTag,
  insertMediaItem,
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
  insertClub(db, { id: 'club-crawlville-real', name: 'Crawlville Footbag', city: 'Crawlville', country: 'USA', hashtag_tag_id: clubTag });

  insertEvent(db, { title: 'Crawl Open', status: 'reg_open' });
  insertHistoricalPerson(db, { person_name: 'Historic Crawler', hof_member: 1 });

  // Minimal freestyle corpus so the freestyle surfaces are crawlable. whirl is
  // an official Family Parent, so the family links its pages render resolve;
  // the compound carries an alias, a modifier link and a source link so those
  // rendered blocks emit their links too.
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
    id: 'crawl_record', display_name: 'Crawl Holder', trick_name: 'Whirl', value_numeric: 12,
  });
  insertConsecutiveKicksRecord(db, {
    id: 'crawl_ck_wr', sort_order: 401, section: 'Official World Records',
    subsection: 'Current', division: 'Open Singles', player_1: 'Crawl Kicker', score: 50000,
  });
  insertConsecutiveKicksRecord(db, {
    id: 'crawl_ck_ms', sort_order: 1301, section: 'Milestone Firsts',
    subsection: 'Firsts', division: 'Open Singles', player_1: 'Crawl Kicker', score: 10000,
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
  const { seedPersona } = await import('../../../src/testkit/personaFactory');
  const { CANONICAL_PERSONAS } = await import('../../../src/testkit/canonicalPersonas');
  for (const spec of CANONICAL_PERSONAS) {
    seedPersona(db, spec);
  }

  const canaries = seedPrivateFieldCanaries(db, 'canary');
  db.close();

  // The admin curator pages exercise disk paths at render time; point the
  // curated root at tmp via the service's explicit test seam.
  const svcMod = await import('../../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(env.mediaTmp);

  return { canaries };
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
  return false;
}

export const SEED_ROOTS = [
  '/', '/members', '/clubs', '/events', '/media', '/media/browse', '/hof',
  '/bap', '/history', '/freestyle', '/net', '/records', '/rules', '/ifpa',
  '/legal', '/login', '/register', '/password/forgot', '/dev/personas',
  // Admin claim form: requireAuth-only, above the admin gate, linked from no
  // page. Anonymous and non-admin personas see the redirect or the gate.
  '/admin/bootstrap-claim',
  // The machine-read files, so their routes are reached and the sitemap's own
  // entries can be checked.
  '/robots.txt', '/sitemap.xml', '/llms.txt', '/health/live', '/health/ready',
  // A path no route serves, so the not-found page itself is checked.
  '/crawl-probe-no-such-page',
];
