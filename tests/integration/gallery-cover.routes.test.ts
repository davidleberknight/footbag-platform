/**
 * A gallery's cover photo: chosen on the gallery edit form from the gallery's
 * own photos, shown at the head of the gallery's card on the public
 * member-galleries list, on the owner's profile Media section and in My
 * Galleries, and used as the gallery page's social-share image.
 *
 * The cover is a pointer, not membership: it is honoured only while it is an
 * active, non-avatar photo still carrying the gallery's hashtags, and the
 * newest such photo stands in otherwise. A gallery showing no photo shows no
 * cover. An administrator moderating a member's gallery cannot change it, and
 * a curated gallery's save file names it by its source filename.
 *
 * Every case seeds its own gallery and photos, and the suite writes, so it
 * issues plain requests rather than sharing cached pages.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { createScratchDir } from '../fixtures/scratchDir';
import {
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  createTestSessionJwt,
  insertMediaItem,
  insertVideoMediaItem,
  insertFreeformTag,
  attachMediaTag,
  insertMemberGallery,
  insertGalleryCriterionTag,
  insertGalleryExcludeTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3193');
const PORT_ORIGIN = 'http://localhost:3193';

const OWNER_ID = 'member-gc-owner';
const OWNER_SLUG = 'gc_owner';
const VIEWER_ID = 'member-gc-viewer';
const ADMIN_ID = 'member-gc-admin';
const SYSTEM_ID = 'member-gc-system';

let createApp: Awaited<ReturnType<typeof importApp>>;
let curatedRoot: string;
let BY_OWNER = '';
let CURATED = '';

const cookieFor = (memberId: string, role: 'member' | 'admin' = 'member'): string =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
const ownerCookie = (): string => cookieFor(OWNER_ID);
const viewerCookie = (): string => cookieFor(VIEWER_ID);
const adminCookie = (): string => cookieFor(ADMIN_ID, 'admin');

function writeDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

const thumbOf = (mediaId: string): string => `/media-store/test/thumb_${mediaId}.jpg`;
const displayOf = (mediaId: string): string => `/media-store/test/display_${mediaId}.jpg`;
const coverRadio = (mediaId: string): RegExp =>
  new RegExp(`<input type="radio" name="coverMediaId" value="${mediaId}"( checked)?>`);
const newestRadio = /<input type="radio" name="coverMediaId" value=""( checked)?>/;
const isChecked = (html: string, re: RegExp): boolean => (html.match(re)?.[1] ?? '') === ' checked';

/** One card's markup on a card list, up to its title, found by the gallery's
 *  own title link. */
function cardFor(html: string, galleryId: string): string {
  const at = html.indexOf(`href="/media/${galleryId}" class="card-title"`);
  expect(at, `no card links to /media/${galleryId}`).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<div class="card">', at);
  return html.slice(start, at);
}

/** The row of My Galleries naming this gallery, found by its edit link. */
function listRowFor(html: string, galleryId: string): string {
  const at = html.indexOf(`/galleries/${galleryId}/edit`);
  expect(at, `no My Galleries row edits ${galleryId}`).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<tr>', at), at);
}

interface Seeded {
  galleryId: string;
  name: string;
  topicTag: string;
  excludeTag: string;
  topicTagId: string;
  excludeTagId: string;
}

/**
 * A member-owned gallery collecting the owner's `#by_` tag plus one topic
 * hashtag, excluding a second hashtag, as the Share Media form would make it.
 */
function seedOwnerGallery(db: BetterSqlite3.Database, key: string): Seeded {
  const topicTag = `#gc_topic_${key}`;
  const excludeTag = `#gc_exclude_${key}`;
  const topicTagId = insertFreeformTag(db, { tag_normalized: topicTag });
  const excludeTagId = insertFreeformTag(db, { tag_normalized: excludeTag });
  const galleryId = insertMemberGallery(db, {
    id: `gallery_${OWNER_SLUG}_${key}`,
    owner_member_id: OWNER_ID,
    name: `Cover Gallery ${key}`,
    created_by: OWNER_ID,
  });
  insertGalleryCriterionTag(db, galleryId, BY_OWNER);
  insertGalleryCriterionTag(db, galleryId, topicTagId);
  insertGalleryExcludeTag(db, galleryId, excludeTagId);
  return { galleryId, name: `Cover Gallery ${key}`, topicTag, excludeTag, topicTagId, excludeTagId };
}

/** An owner's photo carrying the given tags, uploaded `daysAgo` days back. */
function ownerPhoto(
  db: BetterSqlite3.Database,
  tagIds: string[],
  daysAgo: number,
  extra: { is_avatar?: 0 | 1; moderation_status?: 'active' | 'removed_by_admin'; uploader?: string; source_filename?: string } = {},
): string {
  const id = insertMediaItem(db, {
    uploader_member_id: extra.uploader ?? OWNER_ID,
    uploaded_at: new Date(Date.UTC(2026, 0, 30 - daysAgo)).toISOString(),
    is_avatar: extra.is_avatar,
    moderation_status: extra.moderation_status,
    source_filename: extra.source_filename,
  });
  for (const t of tagIds) attachMediaTag(db, id, t);
  return id;
}

/** The fields the member's edit form posts, as it renders them. */
function editBody(s: Seeded, extra: Record<string, string> = {}): Record<string, string> {
  return {
    name: s.name,
    description: '',
    sortOrder: 'upload_desc',
    criteriaTags: s.topicTag,
    excludeTags: s.excludeTag,
    ...extra,
  };
}

function storedCover(galleryId: string): string | null {
  const db = writeDb();
  try {
    return (db.prepare('SELECT cover_media_id FROM member_galleries WHERE id = ?').get(galleryId) as
      { cover_media_id: string | null }).cover_media_id;
  } finally {
    db.close();
  }
}

function galleryState(galleryId: string): { version: number; audits: number } {
  const db = writeDb();
  try {
    const { version } = db.prepare('SELECT version FROM member_galleries WHERE id = ?').get(galleryId) as { version: number };
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ?').get(galleryId) as { n: number };
    return { version, audits: n };
  } finally {
    db.close();
  }
}

const postMemberEdit = (galleryId: string, body: Record<string, string>) =>
  request(createApp())
    .post(`/members/${OWNER_SLUG}/galleries/${galleryId}/edit`)
    .set('Cookie', ownerCookie())
    .type('form')
    .send(body);

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, display_name: 'Cover Owner' });
  completeOnboarding(db, OWNER_ID);
  insertMemberTierGrant(db, { member_id: OWNER_ID, new_tier_status: 'tier1' });
  insertMember(db, { id: VIEWER_ID, slug: 'gc_viewer', display_name: 'Cover Viewer' });
  completeOnboarding(db, VIEWER_ID);
  insertMember(db, { id: ADMIN_ID, slug: 'gc_admin', display_name: 'Cover Admin', is_admin: 1 });
  completeOnboarding(db, ADMIN_ID);
  insertMemberTierGrant(db, { member_id: ADMIN_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });
  insertMember(db, { id: SYSTEM_ID, slug: 'gc_hacky', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });
  BY_OWNER = insertFreeformTag(db, { tag_normalized: `#by_${OWNER_SLUG}` });
  CURATED = insertFreeformTag(db, { tag_normalized: '#curated' });
  db.close();
  createApp = await importApp();
  curatedRoot = createScratchDir('gallery-cover-curated');
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(curatedRoot);
});

afterAll(async () => {
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  fs.rmSync(curatedRoot, { recursive: true, force: true });
  cleanupTestDb(dbPath);
});

describe('choosing a gallery cover on the edit form', () => {
  it('offers each photo, never a video, with the newest photo chosen until one is picked', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'offer');
    const photo = ownerPhoto(db, [BY_OWNER, s.topicTagId], 2);
    const video = insertVideoMediaItem(db, {
      uploader_member_id: OWNER_ID, video_platform: 'youtube', video_id: 'gcOfferVid1', video_url: 'https://youtu.be/gcOfferVid1',
    });
    attachMediaTag(db, video, BY_OWNER);
    attachMediaTag(db, video, s.topicTagId);
    db.close();

    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${s.galleryId}/edit`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    // A photo with no Cover choice could never be picked.
    expect(res.text).toMatch(coverRadio(photo));
    // A video offered as the cover would put a non-photo on every card.
    expect(res.text).toContain(`/media/${video}/edit`);
    expect(res.text).not.toMatch(coverRadio(video));
    // With nothing chosen, the newest-photo choice is the one in force.
    expect(isChecked(res.text, newestRadio)).toBe(true);
    expect(isChecked(res.text, coverRadio(photo))).toBe(false);
    // The radios post with the gallery form, not a form of their own.
    const formOpen = res.text.indexOf(`action="/members/${OWNER_SLUG}/galleries/${s.galleryId}/edit"`);
    const formClose = res.text.indexOf('</form>', formOpen);
    const radioAt = res.text.search(coverRadio(photo));
    expect(radioAt).toBeGreaterThan(formOpen);
    expect(radioAt).toBeLessThan(formClose);
  });

  it('saves the chosen photo, and every list shows it rather than the newest', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'chosen');
    const older = ownerPhoto(db, [BY_OWNER, s.topicTagId], 5);
    const newest = ownerPhoto(db, [BY_OWNER, s.topicTagId], 1);
    db.close();

    // Before any choice the newest photo stands for the gallery.
    const before = await request(createApp()).get('/media/member-galleries');
    expect(cardFor(before.text, s.galleryId)).toContain(thumbOf(newest));

    const saved = await postMemberEdit(s.galleryId, editBody(s, { coverMediaId: older }));
    expect(saved.status).toBe(303);
    expect(storedCover(s.galleryId)).toBe(older);

    const publicList = await request(createApp()).get('/media/member-galleries');
    const publicCard = cardFor(publicList.text, s.galleryId);
    expect(publicCard).toContain(thumbOf(older));
    expect(publicCard).not.toContain(thumbOf(newest));
    // The image is named for the gallery it stands for.
    expect(publicCard).toContain(`alt="Cover Gallery chosen"`);
    // Clicking the cover opens the gallery, as clicking its name does; the
    // second link is kept out of the keyboard and screen-reader order.
    const coverLink = `<a href="/media/${s.galleryId}" tabindex="-1" aria-hidden="true"><img src="${thumbOf(older)}"`;
    expect(publicCard).toContain(coverLink);

    const profile = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', viewerCookie());
    expect(profile.status).toBe(200);
    expect(cardFor(profile.text, s.galleryId)).toContain(coverLink);

    const mine = await request(createApp()).get(`/members/${OWNER_SLUG}/galleries`).set('Cookie', ownerCookie());
    expect(listRowFor(mine.text, s.galleryId)).toContain(thumbOf(older));

    // The form comes back with the saved choice checked.
    const edit = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${s.galleryId}/edit`)
      .set('Cookie', ownerCookie());
    expect(isChecked(edit.text, coverRadio(older))).toBe(true);
    expect(isChecked(edit.text, newestRadio)).toBe(false);
  });

  it('goes back to the newest photo when the empty choice is saved', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'clear');
    const older = ownerPhoto(db, [BY_OWNER, s.topicTagId], 5);
    const newest = ownerPhoto(db, [BY_OWNER, s.topicTagId], 1);
    db.prepare('UPDATE member_galleries SET cover_media_id = ? WHERE id = ?').run(older, s.galleryId);
    db.close();

    const res = await postMemberEdit(s.galleryId, editBody(s, { coverMediaId: '' }));
    expect(res.status).toBe(303);
    expect(storedCover(s.galleryId)).toBeNull();
    const list = await request(createApp()).get('/media/member-galleries');
    expect(cardFor(list.text, s.galleryId)).toContain(thumbOf(newest));
  });

  // Each refused choice fails a different one of the conditions a cover must
  // meet; a forged form is the only way to submit them.
  it.each([
    ['a video', 'video'],
    ['the owner\'s avatar', 'avatar'],
    ['a photo an administrator removed', 'removed'],
    ['a photo without the gallery\'s hashtag', 'outside'],
    ['a photo carrying the excluded hashtag', 'excluded'],
    ['a media id that does not exist', 'missing'],
  ])('refuses %s, keeps the stored cover, and re-offers a choice that saves', async (_label, kind) => {
    const db = writeDb();
    const s = seedOwnerGallery(db, `refuse_${kind}`);
    const good = ownerPhoto(db, [BY_OWNER, s.topicTagId], 3);
    let bad: string;
    switch (kind) {
      case 'video': {
        bad = insertVideoMediaItem(db, {
          uploader_member_id: OWNER_ID, video_platform: 'youtube', video_id: 'gcRefuseVid', video_url: 'https://youtu.be/gcRefuseVid',
        });
        attachMediaTag(db, bad, BY_OWNER);
        attachMediaTag(db, bad, s.topicTagId);
        break;
      }
      case 'avatar': bad = ownerPhoto(db, [BY_OWNER, s.topicTagId], 1, { is_avatar: 1 }); break;
      case 'removed': bad = ownerPhoto(db, [BY_OWNER, s.topicTagId], 1, { moderation_status: 'removed_by_admin' }); break;
      case 'outside': bad = ownerPhoto(db, [BY_OWNER], 1); break;
      case 'excluded': bad = ownerPhoto(db, [BY_OWNER, s.topicTagId, s.excludeTagId], 1); break;
      default: bad = 'media-gc-does-not-exist';
    }
    db.close();
    const before = galleryState(s.galleryId);

    const refused = await postMemberEdit(s.galleryId, editBody(s, { coverMediaId: bad }));
    expect(refused.status).toBe(422);
    expect(storedCover(s.galleryId)).toBeNull();
    expect(galleryState(s.galleryId)).toEqual(before);
    // The re-rendered form still offers the gallery's real photo.
    expect(refused.text).toMatch(coverRadio(good));

    const retried = await postMemberEdit(s.galleryId, editBody(s, { coverMediaId: good }));
    expect(retried.status).toBe(303);
    expect(storedCover(s.galleryId)).toBe(good);
  });

  it('saves a cover-only change, and treats the same save again as a repeat', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'repeat');
    const photo = ownerPhoto(db, [BY_OWNER, s.topicTagId], 2);
    ownerPhoto(db, [BY_OWNER, s.topicTagId], 1);
    db.close();

    const start = galleryState(s.galleryId);
    const first = await postMemberEdit(s.galleryId, editBody(s, { coverMediaId: photo }));
    expect(first.status).toBe(303);
    const afterFirst = galleryState(s.galleryId);
    // A change of cover alone is a change: it is written and recorded.
    expect(afterFirst.version).toBe(start.version + 1);
    expect(afterFirst.audits).toBe(start.audits + 1);

    const second = await postMemberEdit(s.galleryId, editBody(s, { coverMediaId: photo }));
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    // The repeat writes and records nothing.
    expect(galleryState(s.galleryId)).toEqual(afterFirst);
  });
});

describe('a cover that leaves its gallery', () => {
  it('falls back to the newest photo when the gallery stops matching the cover, keeping the pointer', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'leaves');
    const cover = ownerPhoto(db, [BY_OWNER, s.topicTagId], 5);
    const newest = ownerPhoto(db, [BY_OWNER, s.topicTagId], 1);
    // A second hashtag only the cover carries.
    const leaveTag = '#gc_leave_marker';
    attachMediaTag(db, cover, insertFreeformTag(db, { tag_normalized: leaveTag }));
    db.prepare('UPDATE member_galleries SET cover_media_id = ? WHERE id = ?').run(cover, s.galleryId);
    db.close();

    // The owner excludes a hashtag the cover carries; the form, offering the
    // cover, posts it back unchanged.
    const res = await postMemberEdit(s.galleryId, editBody(s, {
      excludeTags: `${s.excludeTag} ${leaveTag}`, coverMediaId: cover,
    }));
    expect(res.status).toBe(303);
    expect(storedCover(s.galleryId)).toBe(cover);

    const list = await request(createApp()).get('/media/member-galleries');
    const card = cardFor(list.text, s.galleryId);
    expect(card).toContain(thumbOf(newest));
    expect(card).not.toContain(thumbOf(cover));
  });

  it('falls back to the newest photo when the cover is deleted, clearing the pointer', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'deleted');
    const cover = ownerPhoto(db, [BY_OWNER, s.topicTagId], 5);
    const newest = ownerPhoto(db, [BY_OWNER, s.topicTagId], 1);
    db.prepare('UPDATE member_galleries SET cover_media_id = ? WHERE id = ?').run(cover, s.galleryId);
    db.close();

    const del = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${cover}/delete`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ confirmed: '1' });
    expect(del.status).toBe(303);
    // Deleting the photo neither fails on the gallery pointing at it nor
    // deletes the gallery.
    expect(storedCover(s.galleryId)).toBeNull();

    const list = await request(createApp()).get('/media/member-galleries');
    expect(cardFor(list.text, s.galleryId)).toContain(thumbOf(newest));
  });
});

describe('a gallery showing no photo', () => {
  it('shows no cover on its card, while a gallery with a photo does', async () => {
    const db = writeDb();
    const noPhoto = seedOwnerGallery(db, 'videoonly');
    const video = insertVideoMediaItem(db, {
      uploader_member_id: OWNER_ID, video_platform: 'youtube', video_id: 'gcOnlyVideo', video_url: 'https://youtu.be/gcOnlyVideo',
    });
    attachMediaTag(db, video, BY_OWNER);
    attachMediaTag(db, video, noPhoto.topicTagId);
    const withPhoto = seedOwnerGallery(db, 'hasphoto');
    ownerPhoto(db, [BY_OWNER, withPhoto.topicTagId], 1);
    db.close();

    const list = await request(createApp()).get('/media/member-galleries');
    expect(cardFor(list.text, withPhoto.galleryId)).toContain('class="card-cover"');
    expect(cardFor(list.text, noPhoto.galleryId)).not.toContain('class="card-cover"');

    const mine = await request(createApp()).get(`/members/${OWNER_SLUG}/galleries`).set('Cookie', ownerCookie());
    expect(listRowFor(mine.text, withPhoto.galleryId)).toContain('class="gallery-list-cover"');
    expect(listRowFor(mine.text, noPhoto.galleryId)).not.toContain('class="gallery-list-cover"');

    // No photo means no cover choice on the form either.
    const edit = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${noPhoto.galleryId}/edit`)
      .set('Cookie', ownerCookie());
    expect(edit.text).toContain(`/media/${video}/edit`);
    expect(edit.text).not.toMatch(newestRadio);
  });
});

describe('the gallery page share image', () => {
  it('is the cover\'s display rendition, absolute; a gallery with no photo keeps the site logo', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'share');
    const cover = ownerPhoto(db, [BY_OWNER, s.topicTagId], 5);
    ownerPhoto(db, [BY_OWNER, s.topicTagId], 1);
    db.prepare('UPDATE member_galleries SET cover_media_id = ? WHERE id = ?').run(cover, s.galleryId);
    const empty = seedOwnerGallery(db, 'share_empty');
    db.close();

    const page = await request(createApp()).get(`/media/${s.galleryId}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`<meta property="og:image" content="${PORT_ORIGIN}${displayOf(cover)}" />`);

    const emptyPage = await request(createApp()).get(`/media/${empty.galleryId}`);
    expect(emptyPage.status).toBe(200);
    expect(emptyPage.text).toContain(`<meta property="og:image" content="${PORT_ORIGIN}/img/ifpa-logo.png" />`);
  });
});

describe('a cover past the photos the edit form lists', () => {
  it('is still shown, chosen, and kept by a save', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'pastcap');
    // The form lists the newest 100 matching items; the cover is older than
    // all of them.
    const cover = ownerPhoto(db, [BY_OWNER, s.topicTagId], 200);
    for (let i = 0; i < 101; i += 1) ownerPhoto(db, [BY_OWNER, s.topicTagId], 150 - i);
    db.prepare('UPDATE member_galleries SET cover_media_id = ? WHERE id = ?').run(cover, s.galleryId);
    db.close();

    const edit = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${s.galleryId}/edit`)
      .set('Cookie', ownerCookie());
    expect(edit.status).toBe(200);
    expect(isChecked(edit.text, coverRadio(cover))).toBe(true);
    expect(isChecked(edit.text, newestRadio)).toBe(false);

    const res = await postMemberEdit(s.galleryId, editBody(s, { description: 'kept', coverMediaId: cover }));
    expect(res.status).toBe(303);
    expect(storedCover(s.galleryId)).toBe(cover);
  });
});

describe('an administrator moderating a member\'s gallery', () => {
  it('is offered no cover choice, cannot change the cover, and keeps it on a moderation that saves', async () => {
    const db = writeDb();
    const s = seedOwnerGallery(db, 'moderated');
    const cover = ownerPhoto(db, [BY_OWNER, s.topicTagId], 5);
    const other = ownerPhoto(db, [BY_OWNER, s.topicTagId], 1);
    db.prepare('UPDATE member_galleries SET cover_media_id = ? WHERE id = ?').run(cover, s.galleryId);
    db.close();

    const form = await request(createApp())
      .get(`/admin/curator/galleries/${s.galleryId}/edit`)
      .set('Cookie', adminCookie());
    expect(form.status).toBe(200);
    // The items are listed, with no cover control among them.
    expect(form.text).toContain(`/admin/curator/media/${other}/edit`);
    expect(form.text).not.toMatch(coverRadio(other));
    expect(form.text).not.toMatch(newestRadio);

    const body = {
      name: 'Cover Gallery moderated', description: '', sortOrder: 'upload_desc',
      criteriaTags: s.topicTag, excludeTags: s.excludeTag, reason: 'Checking the cover rule',
    };
    const before = galleryState(s.galleryId);
    const forged = await request(createApp())
      .post(`/admin/curator/galleries/${s.galleryId}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ ...body, coverMediaId: other });
    expect(forged.status).toBe(422);
    expect(storedCover(s.galleryId)).toBe(cover);
    expect(galleryState(s.galleryId)).toEqual(before);

    const cleared = await request(createApp())
      .post(`/admin/curator/galleries/${s.galleryId}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ ...body, clearName: '1' });
    expect(cleared.status).toBe(303);
    expect(storedCover(s.galleryId)).toBe(cover);
  });
});

describe('a curated gallery\'s save file', () => {
  it('names the chosen cover by its source filename', async () => {
    const db = writeDb();
    const topic = insertFreeformTag(db, { tag_normalized: '#gc_curated_topic' });
    const galleryId = insertMemberGallery(db, { id: 'gallery_gc_curated', owner_member_id: SYSTEM_ID, name: 'Curated Cover' });
    insertGalleryCriterionTag(db, galleryId, CURATED);
    insertGalleryCriterionTag(db, galleryId, topic);
    const photo = ownerPhoto(db, [CURATED, topic], 2, { uploader: SYSTEM_ID, source_filename: 'gc_curated_cover.jpg' });
    db.close();

    const res = await request(createApp())
      .post(`/admin/curator/galleries/${galleryId}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'Curated Cover', description: '', sortOrder: 'upload_desc',
        criteriaTags: '#curated #gc_curated_topic', excludeTags: '', coverMediaId: photo,
      });
    expect(res.status).toBe(303);
    expect(storedCover(galleryId)).toBe(photo);
    const saved = JSON.parse(fs.readFileSync(path.join(curatedRoot, 'galleries', 'gc_curated.json'), 'utf-8'));
    // A media id here would point at nothing once the photo's bytes change.
    expect(saved.coverPhoto).toBe('gc_curated_cover.jpg');
  });
});

describe('/media/member-galleries reads covers without a statement per gallery', () => {
  it('runs one cover statement for one gallery and for many', async () => {
    const coverStatements = async (): Promise<number> => {
      const { db } = await import('../../src/db/db');
      const spy = vi.spyOn(db, 'prepare');
      try {
        await request(createApp()).get('/media/member-galleries');
        return spy.mock.calls.filter(([sql]) => String(sql).includes('cover_media_id')).length;
      } finally {
        spy.mockRestore();
      }
    };
    const db = writeDb();
    ownerPhoto(db, [BY_OWNER, seedOwnerGallery(db, 'qc_0').topicTagId], 1);
    db.close();
    const one = await coverStatements();

    const many = writeDb();
    for (let i = 1; i <= 10; i += 1) ownerPhoto(many, [BY_OWNER, seedOwnerGallery(many, `qc_${i}`).topicTagId], 1);
    many.close();
    expect(one).toBe(1);
    expect(await coverStatements()).toBe(one);
  });
});
