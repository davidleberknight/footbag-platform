/**
 * M_View_Profile: the public profile shows the member's club affiliations and a
 * thumbnail grid of their uploaded media to authenticated viewers; both are
 * withheld from an unauthenticated HoF/BAP visitor. The own profile shows the
 * member's own media grid.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertMemberClubAffiliation,
  insertMediaItem,
  createMemberAtTier,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3209');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const OWNER_ID = 'mvp-owner-1';
const OWNER_SLUG = 'mvp_owner_1';
const VIEWER_ID = 'mvp-viewer-1';
const VIEWER_SLUG = 'mvp_viewer_1';
const HOF_ID = 'mvp-hof-1';
const HOF_SLUG = 'mvp_hof_1';

beforeAll(async () => {
  db = createTestDb(dbPath);

  createMemberAtTier(db, { id: OWNER_ID, slug: OWNER_SLUG, tier: 'tier1' });
  completeOnboarding(db, OWNER_ID);
  const ownerClub = insertClub(db, { id: 'mvp-club-1', name: 'Portland Footbag' });
  insertMemberClubAffiliation(db, OWNER_ID, ownerClub);
  insertMediaItem(db, { uploader_member_id: OWNER_ID, caption: 'Owner trick shot' });
  insertMediaItem(db, { uploader_member_id: OWNER_ID, caption: 'Owner second shot' });

  createMemberAtTier(db, { id: VIEWER_ID, slug: VIEWER_SLUG, tier: 'tier1' });
  completeOnboarding(db, VIEWER_ID);

  // HoF member: profile is visitor-visible, so an unauthenticated request gets a
  // 200 and we can assert the club/media gating rather than a login redirect.
  insertMember(db, { id: HOF_ID, slug: HOF_SLUG, is_hof: 1 });
  const hofClub = insertClub(db, { id: 'mvp-club-2', name: 'Seattle Footbag' });
  insertMemberClubAffiliation(db, HOF_ID, hofClub);
  insertMediaItem(db, { uploader_member_id: HOF_ID, caption: 'HoF trick shot' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const cookieFor = (id: string) => `footbag_session=${createTestSessionJwt({ memberId: id })}`;

describe('M_View_Profile — club + media on the public profile', () => {
  it('shows the member club affiliation to an authenticated viewer', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Portland Footbag');
    expect(res.text).toContain('href="/clubs/');
  });

  it('shows the member media grid and view-all link to an authenticated viewer', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('gallery-grid');
    expect(res.text).toContain('Owner trick shot');
    // Handlebars HTML-escapes '=' in the href, so assert the components.
    expect(res.text).toContain('/media/browse?tag');
    expect(res.text).toContain(`by_${OWNER_SLUG}`);
  });

  it('withholds club and media from an unauthenticated HoF visitor', async () => {
    const res = await request(createApp()).get(`/members/${HOF_SLUG}`);
    expect(res.status).toBe(200); // HoF profile is visitor-visible
    expect(res.text).not.toContain('Seattle Footbag');
    expect(res.text).not.toContain('gallery-grid');
    expect(res.text).not.toContain('View all media');
  });

  it('shows the owner their own media grid on the personal profile', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('gallery-grid');
    expect(res.text).toContain('Owner trick shot');
  });
});
