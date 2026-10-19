/**
 * Integration tests for POST /clubs/create (M_Create_Club).
 *
 * Verifies auth gates, tier gates, happy path (club + tag + leader +
 * affiliation rows), validation errors, business rule errors (already
 * leader, affiliation cap, exact duplicate, tag collision), and work
 * queue item insertion when no contact method is provided.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertClub,
  insertTag,
  insertMemberClubAffiliation,
  insertLegacyClubCandidate,
  insertActivePlayerGrant,
  createMemberAtTier,
  createTestSessionJwt,
  completeOnboarding,
  insertClubLeader,
} from '../fixtures/factories';
import BetterSqlite3 from 'better-sqlite3';

const { dbPath } = setTestEnv('3097');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

// Each member is dedicated to a single test or test group to avoid
// cross-test state pollution (creating a club makes the member a leader).
const HAPPY_ID        = 'cc-happy';
const HAPPY_SLUG      = 'cc_happy';
const TIER0_LAPSED_ID   = 'cc-tier0-lapsed';
const TIER0_LAPSED_SLUG = 'cc_tier0_lapsed';
const TIER0_NEVER_ID    = 'cc-tier0-never';
const TIER0_NEVER_SLUG  = 'cc_tier0_never';
const LEADER_ID       = 'cc-leader';
const LEADER_SLUG     = 'cc_leader';
const CAPPED_ID       = 'cc-capped';
const CAPPED_SLUG     = 'cc_capped';
const VALID_ERR_ID    = 'cc-valid-err';
const VALID_ERR_SLUG  = 'cc_valid_err';
const DUP_ID          = 'cc-dup';
const DUP_SLUG        = 'cc_dup';
const TAG_COLL_ID     = 'cc-tag-coll';
const TAG_COLL_SLUG   = 'cc_tag_coll';
const SLUG_DERIVE_ID  = 'cc-slug-derive';
const SLUG_DERIVE_SLUG = 'cc_slug_derive';
const WQ_ID           = 'cc-wq';
const WQ_SLUG         = 'cc_wq';
const REPEAT_ID       = 'cc-repeat';
const REPEAT_SLUG     = 'cc_repeat';

function authCookie(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function formData(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    name: 'Mile High Footbag',
    description: 'We meet every Sunday.',
    city: 'Denver',
    region: 'Colorado',
    country: 'United States',
    contactEmail: 'info@milehigh.org',
    whatsapp: '',
    slug: 'denver',
  };
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  createMemberAtTier(db, { id: HAPPY_ID, slug: HAPPY_SLUG, tier: 'tier1' });
  // A lapsed-AP Tier 0 member: the one-time Active Player period was spent and
  // has expired, so the create-club bootstrap no longer applies -> denied.
  createMemberAtTier(db, { id: TIER0_LAPSED_ID, slug: TIER0_LAPSED_SLUG, tier: 'tier0' });
  insertActivePlayerGrant(db, {
    member_id: TIER0_LAPSED_ID,
    change_type: 'grant',
    reason_code: 'club_join_one_time_active_player_grant',
    new_active_player_expires_at: '2020-01-01T00:00:00.000Z',
  });
  // A never-AP Tier 0 member: without Active Player, cannot create a club.
  createMemberAtTier(db, { id: TIER0_NEVER_ID, slug: TIER0_NEVER_SLUG, tier: 'tier0' });
  createMemberAtTier(db, { id: VALID_ERR_ID, slug: VALID_ERR_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: DUP_ID, slug: DUP_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: TAG_COLL_ID, slug: TAG_COLL_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: SLUG_DERIVE_ID, slug: SLUG_DERIVE_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: WQ_ID, slug: WQ_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: REPEAT_ID, slug: REPEAT_SLUG, tier: 'tier1' });
  for (const mid of [HAPPY_ID, TIER0_LAPSED_ID, TIER0_NEVER_ID, VALID_ERR_ID, DUP_ID, TAG_COLL_ID, SLUG_DERIVE_ID, WQ_ID, REPEAT_ID]) {
    completeOnboarding(db, mid);
  }

  // Member who already co-leads a club
  createMemberAtTier(db, { id: LEADER_ID, slug: LEADER_SLUG, tier: 'tier1' });
  completeOnboarding(db, LEADER_ID);
  const leaderClubId = insertClub(db, { name: 'Existing Leader Club', city: 'Portland', country: 'USA' });
  insertClubLeader(db, { id: 'cl-leader-test', club_id: leaderClubId, member_id: LEADER_ID });

  // Capped member: already has 2 club affiliations
  createMemberAtTier(db, { id: CAPPED_ID, slug: CAPPED_SLUG, tier: 'tier1' });
  completeOnboarding(db, CAPPED_ID);
  const capClub1 = insertClub(db, { name: 'Cap Club 1', city: 'City1', country: 'Country1' });
  const capClub2 = insertClub(db, { name: 'Cap Club 2', city: 'City2', country: 'Country2' });
  insertMemberClubAffiliation(db, CAPPED_ID, capClub1, { is_primary: 1 });
  insertMemberClubAffiliation(db, CAPPED_ID, capClub2, { is_primary: 0 });

  // Existing club for duplicate-name check
  insertClub(db, {
    name: 'Helsinki Hackers',
    city: 'Helsinki',
    country: 'Finland',
    hashtag_tag_id: insertTag(db, {
      tag_normalized: '#club_helsinki',
      standard_type: 'club',
    }),
  });

  // Reserved tag for tag-collision check
  insertTag(db, {
    tag_normalized: '#club_taken_slug',
    standard_type: 'club',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /clubs/create', () => {
  it('redirects to login when unauthenticated', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/create');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('renders form for authenticated user', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/create')
      .set('Cookie', authCookie(HAPPY_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Create a Club');
    expect(res.text).toContain('#club_');
  });

  it('refuses a lapsed Active Player member and names the benefit instead of the generic wall', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/create')
      .set('Cookie', authCookie(TIER0_LAPSED_ID));
    expect(res.status).toBe(403);
    expect(res.text).toContain('Starting a new club is a Tier 1 benefit');
    expect(res.text).toContain('Upgrade Your Membership');
    expect(res.text).not.toContain('have permission to view this page');
  });

  it('form states what creating makes you and points at the clubs page', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/create')
      .set('Cookie', authCookie(HAPPY_ID));
    expect(res.status).toBe(200);
    // The gate decides who reaches this page, so the page does not restate
    // the requirement to a reader who has already met it.
    expect(res.text).not.toContain('requires IFPA Membership');
    expect(res.text).toContain('href="/clubs"');
  });

  it('tells the member the hashtag is the club address and cannot be changed later', async () => {
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', authCookie(HAPPY_ID));
    expect(res.status).toBe(200);
    // No member path moves a hashtag after creation, so a creator who is not
    // told so learns it only when a typo is already permanent.
    expect(res.text).toContain('cannot be changed after the club is created');
    expect(res.text).toContain('the address of its page');
  });
});

describe('POST /clubs/create', () => {
  it('redirects to login when unauthenticated', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData());
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('returns 403 for a lapsed-AP Tier 0 member', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(TIER0_LAPSED_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData());
    expect(res.status).toBe(403);
  });

  it('returns 403 for a never-AP Tier 0 member and grants no Active Player period', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(TIER0_NEVER_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'Bootstrap Footbag', city: 'Boulder', slug: 'boulder' }));
    expect(res.status).toBe(403);

    // Creating a club requires Tier 1 benefits and grants no Active Player
    // period, so a no-history Tier 0 member remains inactive.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const ap = db.prepare(
      `SELECT is_active_player FROM member_active_player_current WHERE member_id = ?`,
    ).get(TIER0_NEVER_ID) as { is_active_player: number };
    db.close();
    expect(ap.is_active_player).toBe(0);
  });

  it('creates club on success and redirects to club page', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(HAPPY_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData());
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/clubs/club_denver');

    const detail = await request(app)
      .get('/clubs/club_denver')
      .set('Cookie', authCookie(HAPPY_ID));
    expect(detail.status).toBe(200);
    expect(detail.text).toContain('Mile High Footbag');
  });

  it('inserts tag, club, leader, and affiliation rows', async () => {
    const db = new BetterSqlite3(dbPath, { readonly: true });

    const tag = db.prepare(`SELECT * FROM tags WHERE tag_normalized = '#club_denver'`).get() as Record<string, unknown>;
    expect(tag).toBeDefined();
    expect(tag.is_standard).toBe(1);
    expect(tag.standard_type).toBe('club');

    const club = db.prepare(`SELECT * FROM clubs WHERE hashtag_tag_id = ?`).get(tag.id) as Record<string, unknown>;
    expect(club).toBeDefined();
    expect(club.name).toBe('Mile High Footbag');
    expect(club.city).toBe('Denver');
    expect(club.country).toBe('United States');
    expect(club.status).toBe('active');

    const leader = db.prepare(`SELECT * FROM club_leaders WHERE club_id = ? AND member_id = ?`).get(club.id, HAPPY_ID) as Record<string, unknown>;
    expect(leader).toBeDefined();
    expect(leader.role).toBe('co-leader');

    const aff = db.prepare(`SELECT * FROM member_club_affiliations WHERE club_id = ? AND member_id = ?`).get(club.id, HAPPY_ID) as Record<string, unknown>;
    expect(aff).toBeDefined();
    expect(aff.is_current).toBe(1);
    expect(aff.is_primary).toBe(1);
    expect(aff.source).toBe('member_self_service');

    const audit = db.prepare(`SELECT * FROM audit_entries WHERE action_type = 'club.created' AND entity_id = ?`).get(club.id) as Record<string, unknown>;
    expect(audit).toBeDefined();

    db.close();
  });

  it('returns 422 with field errors when name is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(VALID_ERR_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: '', slug: 'testslug1' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Club name is required');
  });

  it('returns 422 with field errors when city is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(VALID_ERR_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ city: '', slug: 'testslug2' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('City is required');
  });

  it('returns 422 with field errors when country is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(VALID_ERR_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ country: '', slug: 'testslug3' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Country is required');
  });

  it('returns 422 when slug has invalid characters', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(VALID_ERR_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ slug: 'INVALID-SLUG!' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('fix the errors');
  });

  it('names the disallowed character, not the first and last characters, for a hyphenated hashtag', async () => {
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(VALID_ERR_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ slug: 'san-francisco' }));
    expect(res.status).toBe(422);
    // Both ends are letters, so a member told to fix the first and last
    // characters is sent looking for a problem that is not there.
    expect(res.text).toContain('may only contain lowercase letters, digits and underscores');
    expect(res.text).not.toContain('must start and end with a letter or digit');
  });

  it('returns 422 when slug has consecutive underscores', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(VALID_ERR_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ slug: 'bad__slug' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('two underscores in a row');
  });

  it('returns 422 when member is already a club leader', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(LEADER_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'New Club', slug: 'leader_new' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('You already co-lead');
    expect(res.text).toContain('Clubs are local groups');
    expect(res.text).toContain('Existing Leader Club');
  });

  it('returns 422 when member has 2 club affiliations', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(CAPPED_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'Cap Club New', slug: 'cap_new' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already in 2 clubs');
  });

  it('returns 422 for exact name+country duplicate', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(DUP_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'Helsinki Hackers', country: 'Finland', city: 'Helsinki', slug: 'helsinki_dup' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already exists');
    expect(res.text).toContain('Helsinki Hackers');
  });

  it('returns 422 for tag collision', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(TAG_COLL_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'Tag Collision Club', country: 'Iceland', slug: 'taken_slug' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('#club_taken_slug is already taken');
    // A bare refusal leaves the member guessing; the story asks for a
    // suggestion to add something that tells the clubs apart.
    expect(res.text).toContain('sets your club apart');
  });

  it('derives slug from city when slug field is empty, and capitalizes an all-lowercase city', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(SLUG_DERIVE_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'Portland FC', city: 'portland', slug: '', country: 'US' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/clubs/club_portland');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const club = db.prepare(`SELECT city FROM clubs WHERE name = 'Portland FC'`).get() as { city: string };
    db.close();
    expect(club.city).toBe('Portland');
  });

  it('preserves form values on validation error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(VALID_ERR_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: '', slug: 'preserve_test', city: 'TestCity' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('TestCity');
    expect(res.text).toContain('preserve_test');
  });
});

describe('POST /clubs/create submitted twice', () => {
  /** Every row a create writes, counted, so a repeat can be shown to write none. */
  function createState(memberId: string, tagNormalized: string): Record<string, number> {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const count = (sql: string, ...params: unknown[]): number =>
        (db.prepare(sql).get(...params) as { n: number }).n;
      return {
        clubs:        count('SELECT COUNT(*) AS n FROM clubs'),
        tags:         count('SELECT COUNT(*) AS n FROM tags WHERE tag_normalized = ?', tagNormalized),
        leaders:      count('SELECT COUNT(*) AS n FROM club_leaders WHERE member_id = ?', memberId),
        affiliations: count('SELECT COUNT(*) AS n FROM member_club_affiliations WHERE member_id = ?', memberId),
        createdAudits: count(
          `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'club.created' AND actor_member_id = ?`,
          memberId,
        ),
        workQueue:    count('SELECT COUNT(*) AS n FROM work_queue_items'),
        outbox:       count('SELECT COUNT(*) AS n FROM outbox_emails'),
      };
    } finally {
      db.close();
    }
  }

  // Defect caught: a member who double-clicks Create, or re-posts the form
  // from the back button, is told they already co-lead a club (the one their
  // first click made), or a second club, tag or audit row is written.
  it('the creator\'s repeat lands on the club the first submit made, with the same success and no new rows', async () => {
    const form = formData({ name: 'Repeat Footbag', city: 'Boulder', slug: 'repeat_boulder' });
    const post = () => request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(REPEAT_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(form);

    const first = await post();
    expect(first.status).toBe(303);
    expect(first.headers.location).toBe('/clubs/club_repeat_boulder');
    const afterFirst = createState(REPEAT_ID, '#club_repeat_boulder');
    expect(afterFirst.createdAudits).toBe(1);

    const second = await post();
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(createState(REPEAT_ID, '#club_repeat_boulder')).toEqual(afterFirst);

    const flash = ((second.headers['set-cookie'] as unknown as string[] | undefined) ?? [])
      .find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
    expect(flash).toBeDefined();
    const landed = await request(createApp())
      .get(second.headers.location)
      .set('Cookie', [authCookie(REPEAT_ID), flash].join('; '));
    expect(landed.status).toBe(200);
    expect(landed.text).toContain('Repeat Footbag');
    expect(landed.text).toContain('<div class="form-success-banner" role="status">Club created.</div>');
  });

  // Defect caught: a creator who goes back, edits a field and submits again is
  // told the club was created and sent to it, while the edit is silently
  // dropped.
  it('the creator\'s resubmission with a changed field is not a repeat, and writes nothing', async () => {
    const before = createState(REPEAT_ID, '#club_repeat_boulder');
    expect(before.createdAudits).toBe(1);
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(REPEAT_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({
        name: 'Repeat Footbag', city: 'Boulder', slug: 'repeat_boulder',
        description: 'Edited after the first submit.',
      }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('You already co-lead');
    expect(createState(REPEAT_ID, '#club_repeat_boulder')).toEqual(before);
  });

  // Defect caught: a member who co-leads a club somebody else created can
  // "create" it again by typing its name and country, and is sent to it as if
  // they had founded it instead of being told they already co-lead a club.
  it('a co-leader of a same-named club they did not create is still told they already co-lead', async () => {
    const before = createState(LEADER_ID, '#club_leader_same_name');
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(LEADER_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'Existing Leader Club', country: 'USA', city: 'Portland', region: 'Oregon', slug: 'leader_same_name' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('You already co-lead');
    expect(res.text).not.toContain('Club created.');
    expect(createState(LEADER_ID, '#club_leader_same_name')).toEqual(before);
  });
});

describe('POST /clubs/create — near-match duplicate warning', () => {
  let _nmSeq = 0;
  function seedCreator(): string {
    _nmSeq += 1;
    const id = `cc-nm-${_nmSeq}`;
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    createMemberAtTier(db, { id, slug: `cc_nm_${_nmSeq}`, tier: 'tier1' });
    completeOnboarding(db, id);
    db.close();
    return id;
  }

  function seedCandidate(displayName: string, classification: 'onboarding_visible' | 'dormant' | 'junk', country: string): void {
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    const id = insertLegacyClubCandidate(db, { display_name: displayName, classification });
    // The shared factory does not set location columns; the duplicate check
    // filters on country, so stamp it directly.
    db.prepare('UPDATE legacy_club_candidates SET country = ?, city = ? WHERE id = ?')
      .run(country, 'Tampere', id);
    db.close();
  }

  it('a legacy candidate with the same normalized name in the same country triggers the warning; confirming proceeds and is audit-flagged', async () => {
    seedCandidate('Tampere Kickers', 'onboarding_visible', 'Finland');
    const creator = seedCreator();
    const app = createApp();

    const warned = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(creator))
      .type('form')
      .send(formData({ name: 'Tampere  Kickers', country: 'Finland', city: 'Tampere', slug: 'tampere' }));
    expect(warned.status).toBe(422);
    expect(warned.text).toContain('similarly named club');
    expect(warned.text).toContain('Tampere Kickers');
    expect(warned.text).toContain('confirm_near_matches');

    const confirmed = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(creator))
      .type('form')
      .send(formData({ name: 'Tampere  Kickers', country: 'Finland', city: 'Tampere', slug: 'tampere', confirm_near_matches: '1' }));
    expect(confirmed.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const audit = db.prepare(`
      SELECT metadata_json FROM audit_entries
      WHERE action_type = 'club.created' AND metadata_json LIKE '%Tampere%'
      ORDER BY rowid DESC LIMIT 1
    `).get() as { metadata_json: string };
    db.close();
    const meta = JSON.parse(audit.metadata_json) as Record<string, unknown>;
    expect(meta.near_matches_acknowledged).toEqual(['Tampere Kickers']);
  });

  it('junk-classified candidates are never surfaced as potential duplicates', async () => {
    seedCandidate('Junkville Jugglers', 'junk', 'Finland');
    const creator = seedCreator();
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(creator))
      .type('form')
      .send(formData({ name: 'Junkville Jugglers', country: 'Finland', city: 'Junkville', slug: 'junkville' }));
    expect(res.status).toBe(303);
  });

  it('a punctuation variant of an existing live club name in the same country triggers the warning with a link to the club', async () => {
    const creator = seedCreator();
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(creator))
      .type('form')
      .send(formData({ name: 'Helsinki-Hackers', country: 'Finland', city: 'Helsinki', slug: 'helsinki_two' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('similarly named club');
    expect(res.text).toContain('Helsinki Hackers');
    expect(res.text).toContain('/clubs/club_helsinki');
  });

  it('a dormant candidate in a DIFFERENT country does not trigger the warning', async () => {
    seedCandidate('Oslo Footbag', 'dormant', 'Norway');
    const creator = seedCreator();
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(creator))
      .type('form')
      .send(formData({ name: 'Oslo Footbag', country: 'Sweden', city: 'Stockholm', slug: 'stockholm_oslo' }));
    expect(res.status).toBe(303);
  });
});

describe('POST /clubs/create — the club country is the canonical name', () => {
  let seq = 0;
  function seedCreator(): string {
    seq += 1;
    const id = `cc-country-${seq}`;
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    createMemberAtTier(db, { id, slug: `cc_country_${seq}`, tier: 'tier1' });
    completeOnboarding(db, id);
    db.close();
    return id;
  }
  function storedCountry(name: string): string | undefined {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT country FROM clubs WHERE name = ?').get(name) as { country: string } | undefined;
    db.close();
    return row?.country;
  }

  it('stores an alias as the canonical name and lists the club on the short country page', async () => {
    // Broken, a club typed as "USA" lands on its own country page apart from
    // every other US club and member.
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(seedCreator()))
      .type('form')
      .send(formData({ name: 'Boulder Bag Bunch', city: 'Boulder', region: 'Colorado', country: 'U.S.A.', slug: 'boulder_bunch' }));
    expect(res.status).toBe(303);
    expect(storedCountry('Boulder Bag Bunch')).toBe('United States');
    const page = await request(createApp()).get('/clubs/usa');
    expect(page.status).toBe(200);
    expect(page.text).toContain('Boulder Bag Bunch');
  });

  it('refuses a country the picker does not offer and creates nothing', async () => {
    // Broken, free text such as "Freedonia" becomes a country page of its own.
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(seedCreator()))
      .type('form')
      .send(formData({ name: 'Freedonia Kickers', city: 'Fredville', region: '', country: 'Freedonia', slug: 'fredville' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Country must be one of the countries offered in the list');
    expect(storedCountry('Freedonia Kickers')).toBeUndefined();
  });

  it('blocks an exact name already taken in the same country under another spelling', async () => {
    // Broken, a second "Lakewood Lads" is created because one form said "USA"
    // and the other "United States", so the duplicate check never compared them.
    const first = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(seedCreator()))
      .type('form')
      .send(formData({ name: 'Lakewood Lads', city: 'Lakewood', region: 'Colorado', country: 'USA', slug: 'lakewood_lads' }));
    expect(first.status).toBe(303);
    const second = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(seedCreator()))
      .type('form')
      .send(formData({ name: 'Lakewood Lads', city: 'Lakewood', region: 'Colorado', country: 'United States', slug: 'lakewood_two' }));
    expect(second.status).toBe(422);
    expect(second.text).toContain('already exists');
  });

  it('offers the country picker on the form', async () => {
    // Broken, the member types a free-text country again and meets a refusal
    // for a spelling the form never offered.
    const res = await request(createApp()).get('/clubs/create').set('Cookie', authCookie(seedCreator()));
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<select id="country" name="country"/);
    expect(res.text).toContain('<option value="New Zealand"');
  });
});

// The typed club text is cleaned before it is checked and stored: tags and
// entities dropped, control characters removed, Unicode composed, whitespace
// tidied.
describe('POST /clubs/create — typed text is cleaned before it is checked', () => {
  let seq = 0;
  function seedCreator(): string {
    seq += 1;
    const id = `cc-clean-${seq}`;
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    createMemberAtTier(db, { id, slug: `cc_clean_${seq}`, tier: 'tier1' });
    completeOnboarding(db, id);
    db.close();
    return id;
  }
  function storedClub(slug: string): Record<string, unknown> | undefined {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      return db.prepare(
        `SELECT c.name, c.description, c.city, c.region FROM clubs c
         JOIN tags t ON t.id = c.hashtag_tag_id WHERE t.tag_normalized = ?`,
      ).get(`#club_${slug}`) as Record<string, unknown> | undefined;
    } finally { db.close(); }
  }

  // Defect caught: a club is stored with live markup, a control character,
  // CRLF line ends or a decomposed accent in its name, description, city or
  // region; or the creator's own resubmission of that form is refused as
  // though they already led another club, because the repeat check compares
  // the raw form with the cleaned row.
  it('stores the cleaned name, description, city and region, and recognises the repeat', async () => {
    const creator = seedCreator();
    const form = formData({
      name: 'Clean <b>Kick</b>\u0085 Club',
      description: 'Café <i>meets</i>\u0085 weekly\r\n\r\nBring a bag',
      city: '<b>golden</b>',
      region: '<i>Colorado</i>',
      country: 'United States',
      slug: 'clean_golden',
    });
    const post = () => request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(creator))
      .type('form')
      .send(form);
    const first = await post();
    expect(first.status).toBe(303);
    expect(storedClub('clean_golden')).toEqual({
      name: 'Clean Kick Club',
      description: 'Café meets weekly\n\nBring a bag',
      city: 'Golden',
      region: 'Colorado',
    });
    const second = await post();
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
  });

  // Defect caught: a name that is only markup passes the required check and a
  // club with an empty visible name is created.
  it('refuses a markup-only name and creates nothing', async () => {
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(seedCreator()))
      .type('form')
      .send(formData({ name: '<b></b>', slug: 'clean_markup_only' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Club name is required');
    expect(storedClub('clean_markup_only')).toBeUndefined();
  });

  // Defect caught: the per-country duplicate-name block runs on the raw name,
  // so a second club differing only by markup takes the same visible name.
  it('blocks a name that differs from an existing club only by markup', async () => {
    const res = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(seedCreator()))
      .type('form')
      .send(formData({
        name: '<b>Helsinki</b> Hackers', city: 'Espoo', region: '', country: 'Finland', slug: 'espoo_dup',
      }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already exists');
    expect(storedClub('espoo_dup')).toBeUndefined();
  });

  // Defect caught: a description longer than the form allows is stored when
  // posted around the browser's limit, or the limit refuses a description that
  // is exactly at it. The forms declare 2000 characters.
  it('accepts a description of exactly 2000 characters and refuses 2001', async () => {
    const atLimit = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(seedCreator()))
      .type('form')
      .send(formData({ name: 'Limit Club', description: 'd'.repeat(2000), city: 'Aurora', slug: 'clean_limit' }));
    expect(atLimit.status).toBe(303);
    expect((storedClub('clean_limit')?.description as string).length).toBe(2000);

    const over = await request(createApp())
      .post('/clubs/create')
      .set('Cookie', authCookie(seedCreator()))
      .type('form')
      .send(formData({ name: 'Over Club', description: 'd'.repeat(2001), city: 'Aurora', slug: 'clean_over' }));
    expect(over.status).toBe(422);
    expect(over.text).toContain('Club description must be 2000 characters or fewer.');
    expect(storedClub('clean_over')).toBeUndefined();
  });
});
