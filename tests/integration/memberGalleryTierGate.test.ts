/**
 * Integration tests for the requireTier1Benefits gate on the member-owned
 * gallery writes: creating one by naming hashtags on the Share Media form,
 * and the two gallery POST routes:
 *   POST /members/:memberKey/media/upload
 *   POST /members/:memberKey/galleries/:id/edit
 *   POST /members/:memberKey/galleries/:id/delete
 *
 * Scope: prove the gate is mounted, fires before the controller's
 * owner check, and matches the hasTier1Benefits truth table end-to-end.
 * Semantic correctness of the predicate and middleware decision logic
 * are covered by dedicated unit and service-level test suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  insertActivePlayerGrant,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3075');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'admin-tg-001';
const FUTURE_AP = '2099-01-01T00:00:00.000Z';

interface TierFixture {
  label: string;
  id: string;
  slug: string;
  expectGated: boolean;
}

const FIXTURES: TierFixture[] = [
  { label: 'tier0_no_ap',    id: 'mtg-t0-noap',  slug: 'tg_t0_noap',  expectGated: true  },
  { label: 'tier0_with_ap',  id: 'mtg-t0-ap',    slug: 'tg_t0_ap',    expectGated: false },
  { label: 'tier1',          id: 'mtg-t1',       slug: 'tg_t1',       expectGated: false },
  { label: 'tier2',          id: 'mtg-t2',       slug: 'tg_t2',       expectGated: false },
  { label: 'tier3',          id: 'mtg-t3',       slug: 'tg_t3',       expectGated: false },
];

const NON_OWNER: TierFixture = {
  label: 'tier1_non_owner', id: 'mtg-t1-other', slug: 'tg_t1_other', expectGated: false,
};

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'tg_admin', is_admin: 1 });
  completeOnboarding(db, ADMIN_ID);
  // System (Footbag Hacky) member: curatorMediaService.createGallery eagerly
  // resolves the system member id to compute the FH-owned-vs-member-owned
  // branch, even for purely member-owned creates. Production seeds this row
  // at platform epoch; tests must seed it explicitly or createGallery throws
  // `Configuration error: no system member row found`.
  insertMember(db, {
    id: 'member_footbag_hacky_tg',
    slug: 'fh_tg',
    display_name: 'Footbag Hacky',
    real_name: 'Footbag Hacky',
    is_system: 1,
  });
  for (const f of FIXTURES) {
    insertMember(db, { id: f.id, slug: f.slug });
    completeOnboarding(db, f.id);
  }
  insertMember(db, { id: NON_OWNER.id, slug: NON_OWNER.slug });
  completeOnboarding(db, NON_OWNER.id);

  // tier0_with_ap: AP grant only.
  insertActivePlayerGrant(db, {
    member_id: 'mtg-t0-ap',
    change_type: 'grant',
    new_active_player_expires_at: FUTURE_AP,
    reason_code: 'official_event_attendance',
  });
  // tier1, tier2: simple grant rows.
  insertMemberTierGrant(db, { member_id: 'mtg-t1', new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: 'mtg-t2', new_tier_status: 'tier2' });
  // tier3: governance_set requires new_underlying_tier_status (CHECK).
  insertMemberTierGrant(db, {
    member_id: 'mtg-t3',
    actor_member_id: ADMIN_ID,
    change_type: 'governance_set',
    new_tier_status: 'tier3',
    new_underlying_tier_status: 'tier1',
    reason_code: 'governance.tier3_set',
  });
  // Non-owner Tier 1.
  insertMemberTierGrant(db, { member_id: NON_OWNER.id, new_tier_status: 'tier1' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// A gallery is created by naming a set of hashtags on the Share Media form,
// sent with the preview the form's script records.
async function createGalleryOnShareForm(slug: string, memberId: string, name: string, tags: string) {
  const svc = await import('../../src/services/curatorMediaService');
  const p = svc.previewNewMemberGallery(slug, name, svc.parseTagList(tags), () => false);
  return request(createApp())
    .post(`/members/${slug}/media/upload`)
    .set('Cookie', cookieFor(memberId))
    .field('mediaType', 'photo')
    .field('tags', tags)
    .field('galleryName', name)
    .field('galleryPreview', 'refusal' in p ? '' : svc.newGalleryPreviewToken(p));
}

describe('creating a gallery on the Share Media form — tier gate', () => {
  // Each fixture uses a distinct gallery name to avoid UNIQUE(owner, name)
  // conflicts across the it.each iterations.
  it.each(FIXTURES)('$label → gated: $expectGated', async (f) => {
    const name = `Try-${f.label}`;
    const res = await createGalleryOnShareForm(f.slug, f.id, name, '#x');
    if (f.expectGated) {
      expect(res.status).toBe(403);
      expect(res.text).toContain('403');
      // Gate fires before service: no gallery row was inserted.
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const row = db
        .prepare(`SELECT id FROM member_galleries WHERE owner_member_id = ? AND name = ?`)
        .get(f.id, name) as { id: string } | undefined;
      db.close();
      expect(row).toBeUndefined();
    } else {
      // The create must actually succeed (303 PRG redirect to the new
      // gallery) and a fresh `member_galleries` row must exist for this owner.
      expect(res.status).toBe(303);
      expect(res.headers.location).toMatch(new RegExp(`^/media/gallery_${f.slug}_`));
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const row = db
        .prepare(`SELECT id, owner_member_id, name FROM member_galleries WHERE owner_member_id = ? AND name = ?`)
        .get(f.id, name) as { id: string; owner_member_id: string; name: string } | undefined;
      db.close();
      expect(row).toBeDefined();
      expect(row!.owner_member_id).toBe(f.id);
    }
  });
});

describe('POST /members/:memberKey/galleries/:id/edit — tier gate', () => {
  it('tier0 no-AP owner → 403 (gate fires before missing-gallery 404)', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t0_noap/galleries/gallery_does_not_exist/edit`)
      .set('Cookie', cookieFor('mtg-t0-noap'))
      .type('form')
      .send({ name: 'X', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).toBe(403);
  });

  it('tier1 owner → not 403 (gate passes; controller 404 for missing gallery)', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t1/galleries/gallery_does_not_exist/edit`)
      .set('Cookie', cookieFor('mtg-t1'))
      .type('form')
      .send({ name: 'X', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).not.toBe(403);
  });
});

describe('POST /members/:memberKey/galleries/:id/delete — tier gate', () => {
  it('tier0 no-AP owner → 403', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t0_noap/galleries/gallery_does_not_exist/delete`)
      .set('Cookie', cookieFor('mtg-t0-noap'));
    expect(res.status).toBe(403);
  });

  it('tier1 owner → not 403', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t1/galleries/gallery_does_not_exist/delete`)
      .set('Cookie', cookieFor('mtg-t1'));
    expect(res.status).not.toBe(403);
  });
});

describe('Owner-check still fires after the gate', () => {
  it('Tier 1 non-owner posting to a different member\'s gallery route → 404 (anti-enumeration), not 403', async () => {
    // tier1 non-owner sessioned, posting to tier1 owner's Share Media route.
    // The gate passes (predicate true), so the controller's slug-mismatch
    // 404 anti-enumeration branch must fire.
    const res = await request(createApp())
      .post(`/members/tg_t1/media/upload`)
      .set('Cookie', cookieFor(NON_OWNER.id))
      .field('mediaType', 'photo')
      .field('galleryName', 'Y');
    expect(res.status).toBe(404);
  });
});

describe('The list stays open and states the benefit; the form behind it does not', () => {
  it('GET /members/:memberKey/galleries renders for a tier0 no-AP owner, naming the benefit instead of the controls', async () => {
    const res = await request(createApp())
      .get(`/members/tg_t0_noap/galleries`)
      .set('Cookie', cookieFor('mtg-t0-noap'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sharing media is a Tier 1 benefit.');
    // No share control: the form behind it would refuse this member.
    expect(res.text).not.toContain('href="/members/tg_t0_noap/media/upload"');
  });

  it('GET /members/:memberKey/media/upload refuses a tier0 no-AP owner and names the benefit', async () => {
    const res = await request(createApp())
      .get(`/members/tg_t0_noap/media/upload`)
      .set('Cookie', cookieFor('mtg-t0-noap'));
    expect(res.status).toBe(403);
    expect(res.text).toContain('Sharing media is a Tier 1 benefit.');
    expect(res.text).not.toContain('have permission to view this page');
  });

  it('GET /members/:memberKey/media/upload renders for an owner holding the benefits', async () => {
    const res = await request(createApp())
      .get(`/members/tg_t0_ap/media/upload`)
      .set('Cookie', cookieFor('mtg-t0-ap'));
    expect(res.status).toBe(200);
  });
});

describe('Defensive: requireAuth fires before requireTier1Benefits', () => {
  it('unauthenticated POST → 302 to /login (no 403)', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t1/media/upload`)
      .field('mediaType', 'photo')
      .field('galleryName', 'Z');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });
});
