/**
 * Media surfaces link a gallery owner's name to their member profile only for a
 * viewer who can open that profile.
 *
 * Member profiles are for members. A registrant still in the onboarding wizard
 * holds a session but is not yet a member, reads public pages as a signed-out
 * visitor does, and gets not-found from every ordinary member profile. Linking
 * the owner's name for that viewer hands them a link that can only fail, so the
 * name renders plain for them exactly as it does for a signed-out visitor.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMemberGallery,
  insertFreeformTag,
  insertGalleryCriterionTag,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3471');

const OWNER_ID = 'owner-link-owner';
const OWNER_SLUG = 'owner_link_owner';
const MEMBER_ID = 'owner-link-member';
const PENDING_ID = 'owner-link-pending';
const GALLERY_ID = 'gallery_owner_link';
const OWNER_PROFILE_LINK = `href="/members/${OWNER_SLUG}"`;

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, display_name: 'Gallery Owner' });
  insertMember(db, { id: MEMBER_ID, slug: 'owner_link_member', display_name: 'Full Member' });
  // A registrant with a session who has not finished onboarding.
  insertMember(db, { id: PENDING_ID, slug: 'owner_link_pending', display_name: 'Pending Registrant', onboarding: 'none' });

  // A named gallery whose only criterion is the owner's uploader tag, so the
  // gallery page heads itself with the owner's name (the identity header) and
  // the member-galleries list attributes it to the owner.
  const byTag = insertFreeformTag(db, { tag_normalized: `#by_${OWNER_SLUG}`, tag_display: `#by_${OWNER_SLUG}` });
  insertMemberGallery(db, { id: GALLERY_ID, owner_member_id: OWNER_ID, created_by: OWNER_ID, name: 'Owner Link Gallery' });
  insertGalleryCriterionTag(db, GALLERY_ID, byTag);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/member-galleries owner attribution', () => {
  it('links the owner to their profile for a member', async () => {
    const res = await request(createApp()).get('/media/member-galleries').set('Cookie', cookieFor(MEMBER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Gallery Owner');
    expect(res.text).toContain(OWNER_PROFILE_LINK);
  });

  it('shows a registrant still onboarding the owner name without a profile link they cannot open', async () => {
    const res = await request(createApp()).get('/media/member-galleries').set('Cookie', cookieFor(PENDING_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Gallery Owner');
    expect(res.text).not.toContain(OWNER_PROFILE_LINK);
  });

  it('confirms the link it withholds is one the onboarding registrant cannot open', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(PENDING_ID));
    expect(res.status).toBe(404);
  });
});

describe('GET /media/:galleryId identity header', () => {
  it('links the owner name in the header for a member', async () => {
    const res = await request(createApp()).get(`/media/${GALLERY_ID}`).set('Cookie', cookieFor(MEMBER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(OWNER_PROFILE_LINK);
  });

  it('renders the owner name plain in the header for a registrant still onboarding', async () => {
    const res = await request(createApp()).get(`/media/${GALLERY_ID}`).set('Cookie', cookieFor(PENDING_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Gallery Owner');
    expect(res.text).not.toContain(OWNER_PROFILE_LINK);
  });
});
