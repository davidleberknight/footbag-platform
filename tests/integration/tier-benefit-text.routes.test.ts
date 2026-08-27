/**
 * A member who does not hold Tier 1 benefits reads what the benefit is and how
 * to earn it, wherever a control they cannot use would otherwise have been, and
 * never reaches a form that would refuse their submission.
 *
 * Contract in one place, across every surface that carries a Tier 1 control:
 * the member's gallery list, their profile, and the five forms behind them.
 * Three things are pinned on each: the benefit text appears, the control does
 * not, and the refusal is never the generic permission page, which named
 * nothing the member could act on.
 *
 * The mirror case matters as much: a member who does hold the benefits sees
 * every control and none of the text, so the gate cannot be satisfied by
 * hiding the feature from everyone.
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
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  insertMemberGallery,
  insertMediaItem,
  insertClub,
  insertMemberClubAffiliation,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4132');

let createApp: Awaited<ReturnType<typeof importApp>>;

// The lead sentence of each card, which is what tells the member which benefit
// is at stake; the label of the one control the card offers; and the clause
// that keeps the card from claiming buying is the only road to the benefit.
const MEDIA_LEAD = 'Sharing media is a Tier 1 benefit.';
const CLUB_LEAD = 'Starting a new club is a Tier 1 benefit';
const UPGRADE_BUTTON = 'Upgrade Your Membership';
const OTHER_ROUTE = 'while Active Player status is current';
// The refusal the benefit text replaces.
const GENERIC_WALL = 'have permission to view this page';

const T0_ID = 'tbt-t0';
const T0_SLUG = 'tbt_t0';
const T0_CLUB_ID = 'tbt-t0-club';
const T0_CLUB_SLUG = 'tbt_t0_club';
const T0_EMPTY_ID = 'tbt-t0-empty';
const T0_EMPTY_SLUG = 'tbt_t0_empty';
const T1_ID = 'tbt-t1';
const T1_SLUG = 'tbt_t1';

let t0GalleryId: string;
let t0MediaId: string;
let t1GalleryId: string;
let t1MediaId: string;

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // The system member the curator media service resolves on every gallery
  // read; production seeds it at platform epoch.
  insertMember(db, {
    id: 'member_footbag_hacky_tbt',
    slug: 'fh_tbt',
    display_name: 'Footbag Hacky',
    real_name: 'Footbag Hacky',
    is_system: 1,
  });

  for (const [id, slug] of [
    [T0_ID, T0_SLUG],
    [T0_CLUB_ID, T0_CLUB_SLUG],
    [T0_EMPTY_ID, T0_EMPTY_SLUG],
    [T1_ID, T1_SLUG],
  ] as const) {
    insertMember(db, { id, slug });
    completeOnboarding(db, id);
  }
  insertMemberTierGrant(db, { member_id: T1_ID, new_tier_status: 'tier1' });

  // A club member who is still Tier 0 with no current Active Player period.
  // Belonging to a club is not what decides the benefit, so the notice has to
  // reach them exactly as it reaches a member with no club at all.
  const clubId = insertClub(db, { name: 'Tier Benefit Text Club' });
  insertMemberClubAffiliation(db, T0_CLUB_ID, clubId, {
    is_current: 1,
    is_primary: 1,
    source: 'admin',
  });

  // Galleries and items that outlived the benefits that created them, and the
  // same pair for a member who still holds them.
  t0GalleryId = insertMemberGallery(db, { owner_member_id: T0_ID, name: 'Kept After Lapse' });
  t0MediaId = insertMediaItem(db, { uploader_member_id: T0_ID, source_filename: 'tbt-t0.jpg' });
  t1GalleryId = insertMemberGallery(db, { owner_member_id: T1_ID, name: 'Held Benefits' });
  t1MediaId = insertMediaItem(db, { uploader_member_id: T1_ID, source_filename: 'tbt-t1.jpg' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the gallery list keeps the read and states the benefit in the controls place', () => {
  it('names the benefit and offers neither write control', async () => {
    const res = await request(createApp())
      .get(`/members/${T0_SLUG}/galleries`)
      .set('Cookie', cookieFor(T0_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(MEDIA_LEAD);
    expect(res.text).toContain(OTHER_ROUTE);
    expect(res.text).toContain(UPGRADE_BUTTON);
    expect(res.text).not.toContain('Upload Media');
    expect(res.text).not.toContain('Create New Gallery');
  });

  it('keeps the gallery readable while dropping its edit and delete controls', async () => {
    const res = await request(createApp())
      .get(`/members/${T0_SLUG}/galleries`)
      .set('Cookie', cookieFor(T0_ID));
    expect(res.text).toContain('Kept After Lapse');
    expect(res.text).toContain(`/media/${t0GalleryId}`);
    expect(res.text).not.toContain(`/galleries/${t0GalleryId}/edit`);
    expect(res.text).not.toContain(`/galleries/${t0GalleryId}/delete`);
  });

  it('drops the first-upload control from the no-media teaching block', async () => {
    const res = await request(createApp())
      .get(`/members/${T0_EMPTY_SLUG}/galleries`)
      .set('Cookie', cookieFor(T0_EMPTY_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('You have not shared any photos or videos yet.');
    expect(res.text).toContain(MEDIA_LEAD);
    expect(res.text).not.toContain('Upload Your First Media');
  });

  it('gives a member who holds the benefits every control and no notice', async () => {
    const res = await request(createApp())
      .get(`/members/${T1_SLUG}/galleries`)
      .set('Cookie', cookieFor(T1_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload Media');
    expect(res.text).toContain('Create New Gallery');
    expect(res.text).toContain(`/galleries/${t1GalleryId}/edit`);
    expect(res.text).not.toContain(MEDIA_LEAD);
  });
});

describe('every form behind a Tier 1 control is unreachable to a member it would refuse', () => {
  const cases = () => [
    { name: 'the upload form', path: `/members/${T0_SLUG}/media/upload`, lead: MEDIA_LEAD },
    { name: 'the new-gallery form', path: `/members/${T0_SLUG}/galleries/new`, lead: MEDIA_LEAD },
    { name: "a gallery's edit form", path: `/members/${T0_SLUG}/galleries/${t0GalleryId}/edit`, lead: MEDIA_LEAD },
    { name: "an item's edit form", path: `/members/${T0_SLUG}/media/${t0MediaId}/edit`, lead: MEDIA_LEAD },
    { name: 'the create-club form', path: '/clubs/create', lead: CLUB_LEAD },
  ];

  it('refuses each one, naming the benefit and the routes back', async () => {
    for (const c of cases()) {
      const res = await request(createApp())
        .get(c.path)
        .set('Cookie', cookieFor(T0_ID));
      expect(res.status, `${c.name} refused`).toBe(403);
      expect(res.text, `${c.name} names the benefit`).toContain(c.lead);
      expect(res.text, `${c.name} offers the one control`).toContain(UPGRADE_BUTTON);
      expect(res.text, `${c.name} does not claim buying is the only road`).toContain(OTHER_ROUTE);
      expect(res.text, `${c.name} is not the generic wall`).not.toContain(GENERIC_WALL);
    }
  });

  it('serves each one to a member who holds the benefits', async () => {
    const paths = [
      `/members/${T1_SLUG}/media/upload`,
      `/members/${T1_SLUG}/galleries/new`,
      `/members/${T1_SLUG}/galleries/${t1GalleryId}/edit`,
      `/members/${T1_SLUG}/media/${t1MediaId}/edit`,
      '/clubs/create',
    ];
    for (const path of paths) {
      const res = await request(createApp())
        .get(path)
        .set('Cookie', cookieFor(T1_ID));
      expect(res.status, `${path} served`).toBe(200);
    }
  });
});

describe('the profile states the club benefit and withholds the shortcut it cannot honour', () => {
  it('names the club benefit to a member with no clubs', async () => {
    const res = await request(createApp())
      .get(`/members/${T0_SLUG}`)
      .set('Cookie', cookieFor(T0_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(CLUB_LEAD);
    expect(res.text).toContain('first leader.');
    expect(res.text).toContain(UPGRADE_BUTTON);
    expect(res.text).not.toContain('Start a New Club');
  });

  it('names it to a member who already belongs to a club, whose membership does not confer it', async () => {
    const res = await request(createApp())
      .get(`/members/${T0_CLUB_SLUG}`)
      .set('Cookie', cookieFor(T0_CLUB_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tier Benefit Text Club');
    expect(res.text).toContain(CLUB_LEAD);
    expect(res.text).not.toContain('Start a New Club');
  });

  it('carries the media routes in the Media section and offers no upload control', async () => {
    const res = await request(createApp())
      .get(`/members/${T0_SLUG}`)
      .set('Cookie', cookieFor(T0_ID));
    expect(res.text).toContain('My Galleries');
    expect(res.text).toContain(MEDIA_LEAD);
    expect(res.text).not.toContain('Upload Media');
    // The shortcut list is gone for a member below the organizer tier, so an
    // empty heading cannot stand where the media shortcuts used to be.
    expect(res.text).not.toContain('Quick Actions');
  });

  it('renders the Media section to a member with nothing shared, which is who needs it', async () => {
    const res = await request(createApp())
      .get(`/members/${T0_EMPTY_SLUG}`)
      .set('Cookie', cookieFor(T0_EMPTY_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Media');
    expect(res.text).toContain('You have not shared any photos or videos yet.');
    expect(res.text).toContain(MEDIA_LEAD);
    expect(res.text).toContain(UPGRADE_BUTTON);
  });

  it('gives a member who holds the benefits the upload control and neither card', async () => {
    const res = await request(createApp())
      .get(`/members/${T1_SLUG}`)
      .set('Cookie', cookieFor(T1_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload Media');
    expect(res.text).toContain('My Galleries');
    expect(res.text).not.toContain(CLUB_LEAD);
    expect(res.text).not.toContain(MEDIA_LEAD);
  });
});
