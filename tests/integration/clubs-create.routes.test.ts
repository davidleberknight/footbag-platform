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
  createMemberAtTier,
  createTestSessionJwt,
  completeOnboarding,
} from '../fixtures/factories';
import BetterSqlite3 from 'better-sqlite3';

const { dbPath } = setTestEnv('3097');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

// Each member is dedicated to a single test or test group to avoid
// cross-test state pollution (creating a club makes the member a leader).
const HAPPY_ID        = 'cc-happy';
const HAPPY_SLUG      = 'cc_happy';
const TIER0_ID        = 'cc-tier0';
const TIER0_SLUG      = 'cc_tier0';
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

function authCookie(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
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
  createMemberAtTier(db, { id: TIER0_ID, slug: TIER0_SLUG, tier: 'tier0' });
  createMemberAtTier(db, { id: VALID_ERR_ID, slug: VALID_ERR_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: DUP_ID, slug: DUP_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: TAG_COLL_ID, slug: TAG_COLL_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: SLUG_DERIVE_ID, slug: SLUG_DERIVE_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: WQ_ID, slug: WQ_SLUG, tier: 'tier1' });
  for (const mid of [HAPPY_ID, TIER0_ID, VALID_ERR_ID, DUP_ID, TAG_COLL_ID, SLUG_DERIVE_ID, WQ_ID]) {
    completeOnboarding(db, mid);
  }

  // Already-a-leader member
  createMemberAtTier(db, { id: LEADER_ID, slug: LEADER_SLUG, tier: 'tier1' });
  completeOnboarding(db, LEADER_ID);
  const leaderClubId = insertClub(db, { name: 'Existing Leader Club', city: 'Portland', country: 'USA' });
  db.prepare(`
    INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, version, club_id, member_id, role, added_at)
    VALUES ('cl-leader-test', ?, 'test', ?, 'test', 1, ?, ?, 'leader', ?)
  `).run('2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', leaderClubId, LEADER_ID, '2024-01-01T00:00:00.000Z');

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

  it('returns 403 for Tier 0 member', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(TIER0_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData());
    expect(res.status).toBe(403);
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
    expect(club.contact_email).toBe('info@milehigh.org');
    expect(club.status).toBe('active');

    const leader = db.prepare(`SELECT * FROM club_leaders WHERE club_id = ? AND member_id = ?`).get(club.id, HAPPY_ID) as Record<string, unknown>;
    expect(leader).toBeDefined();
    expect(leader.role).toBe('leader');

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

  it('returns 422 when slug has consecutive underscores', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(VALID_ERR_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ slug: 'bad__slug' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('consecutive underscores');
  });

  it('returns 422 when member is already a club leader', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(LEADER_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'New Club', slug: 'leader_new' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already a Club Leader');
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
      .send(formData({ name: 'Tag Collision Club', country: 'TagLand', slug: 'taken_slug' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already taken');
  });

  it('derives slug from city when slug field is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(SLUG_DERIVE_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'Portland FC', city: 'Portland', slug: '', country: 'US' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/clubs/club_portland');
  });

  it('rejects creation without a contact email: 422, no club row, no work-queue row', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(WQ_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'No Contact Club', city: 'Nowhere', country: 'Neverland', slug: 'nowhere', contactEmail: '', whatsapp: '' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Contact email is required.');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const club = db.prepare(`SELECT id FROM clubs WHERE name = 'No Contact Club'`).get();
    expect(club).toBeUndefined();
    const wq = db.prepare(`
      SELECT id FROM work_queue_items WHERE entity_type = 'club'
    `).get();
    expect(wq).toBeUndefined();
    db.close();
  });

  it('WhatsApp does not substitute for the required contact email', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/clubs/create')
      .set('Cookie', authCookie(WQ_ID))
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(formData({ name: 'WhatsApp Only Club', city: 'Nowhere', country: 'Neverland', slug: 'wa_only', contactEmail: '', whatsapp: '+1 555 123 4567' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Contact email is required.');
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
