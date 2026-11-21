/**
 * A club's cover photo: uploaded at creation or by a co-leader from the club
 * page, shown at the top of the club page as its share image.
 *
 * The contract: the cover is an ordinary photo owned by the member who
 * uploaded it and tagged with the club's hashtag (and the uploader's own #by_
 * tag), so it is also in the club's gallery. The club is created first; a
 * photo the upload refuses leaves the club created with no cover. Replacing a
 * cover moves the pointer and leaves the earlier photo in the gallery; removing
 * it clears the pointer and deletes no photo; either, submitted twice, repeats
 * cleanly. Only a current co-leader holding Tier 1 benefits may change it. A
 * cover shows only while its photo is active and still carries the hashtag.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { flashValueOf } from '../fixtures/flashCookie';
import {
  attachMediaTag,
  completeOnboarding,
  createMemberAtTier,
  createTestSessionJwt,
  insertClub,
  insertClubLeader,
  insertMediaItem,
  insertMember,
  insertTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4972');

let createApp: Awaited<ReturnType<typeof importApp>>;
let resetImageProcessingAdapterForTests: () => void;
let resetRateLimitForTests: () => void;

const CREATOR_A = 'ccp-creator-a';
const CREATOR_B = 'ccp-creator-b';
const CREATOR_C = 'ccp-creator-c';
const OUTSIDER = 'ccp-outsider';
const TIER0_LEADER = 'ccp-tier0-leader';

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

async function jpeg(r: number): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: { r, g: 60, b: 120 } } }).jpeg().toBuffer();
}

function createFields(name: string, city: string, slug: string): Record<string, string> {
  return { name, description: 'We play in the park on Saturdays.', city, region: 'Oregon', country: 'United States', slug };
}

function postCreate(memberId: string, fields: Record<string, string>, photo?: { buffer: Buffer; filename: string }) {
  let req = request(createApp()).post('/clubs/create').set('Cookie', cookieFor(memberId));
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  if (photo) req = req.attach('cover_photo', photo.buffer, photo.filename);
  return req;
}

function postCover(memberId: string, clubKey: string, photo: { buffer: Buffer; filename: string }) {
  return request(createApp()).post(`/clubs/${clubKey}/cover-photo`).set('Cookie', cookieFor(memberId))
    .attach('cover_photo', photo.buffer, photo.filename);
}

function postRemove(memberId: string, clubKey: string) {
  return request(createApp()).post(`/clubs/${clubKey}/cover-photo/remove`).set('Cookie', cookieFor(memberId)).type('form').send({});
}

function clubByKey(clubKey: string): { id: string; cover_media_id: string | null } | undefined {
  return withDb((db) => db.prepare(`
    SELECT c.id, c.cover_media_id FROM clubs c JOIN tags t ON t.id = c.hashtag_tag_id WHERE t.tag_normalized = ?
  `).get(`#${clubKey}`) as { id: string; cover_media_id: string | null } | undefined);
}

function media(mediaId: string): { uploader_member_id: string; moderation_status: string; s3_key_display: string } | undefined {
  return withDb((db) => db.prepare(
    'SELECT uploader_member_id, moderation_status, s3_key_display FROM media_items WHERE id = ?',
  ).get(mediaId) as { uploader_member_id: string; moderation_status: string; s3_key_display: string } | undefined);
}

function tagsOf(mediaId: string): string[] {
  return withDb((db) => (db.prepare(`
    SELECT t.tag_normalized FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? ORDER BY t.tag_normalized
  `).all(mediaId) as Array<{ tag_normalized: string }>).map((r) => r.tag_normalized));
}

function photoCountFor(memberId: string): number {
  return withDb((db) => (db.prepare(
    "SELECT COUNT(*) n FROM media_items WHERE uploader_member_id = ? AND media_type = 'photo'",
  ).get(memberId) as { n: number }).n);
}

function auditCount(actionType: string, entityId: string): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) n FROM audit_entries WHERE action_type = ? AND entity_id = ?',
  ).get(actionType, entityId) as { n: number }).n);
}

function coverImgs(html: string): Array<{ id: string; src: string; alt: string }> {
  return [...html.matchAll(/<img\b[^>]*class="cover-photo"[^>]*>/g)].map((m) => ({
    id: /id="([^"]*)"/.exec(m[0])?.[1] ?? '',
    src: /src="([^"]*)"/.exec(m[0])?.[1] ?? '',
    alt: /alt="([^"]*)"/.exec(m[0])?.[1] ?? '',
  }));
}

function ogImage(html: string): string {
  return /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1] ?? '';
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [id, tier] of [[CREATOR_A, 'tier1'], [CREATOR_B, 'tier1'], [CREATOR_C, 'tier1'], [OUTSIDER, 'tier1'], [TIER0_LEADER, 'tier0']] as const) {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier,
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com` },
    });
    completeOnboarding(db, id);
  }
  insertMember(db, { id: 'member_footbag_hacky_ccp', slug: 'fh_ccp', display_name: 'Footbag Hacky', is_system: 1 });
  db.close();

  createApp = await importApp();

  const adapterMod = await import('../../src/adapters/imageProcessingAdapter');
  const imgMod = await import('../../src/lib/imageProcessing');
  resetImageProcessingAdapterForTests = adapterMod.resetImageProcessingAdapterForTests;
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = init?.body as Buffer | Uint8Array;
    const processed = await imgMod.processPhoto(Buffer.isBuffer(body) ? body : Buffer.from(body));
    return new Response(JSON.stringify({
      thumb: processed.thumb.toString('base64'),
      display: processed.display.toString('base64'),
      widthPx: processed.widthPx,
      heightPx: processed.heightPx,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  adapterMod.setImageProcessingAdapterForTests(
    adapterMod.createHttpImageAdapter({ internalSecret: 'test-internal-event-secret', baseUrl: 'http://test-injected', fetchImpl: fakeFetch }),
  );
  resetRateLimitForTests = (await import('../../src/services/rateLimitService')).resetRateLimitForTests;
});

afterAll(() => {
  resetImageProcessingAdapterForTests?.();
  resetRateLimitForTests?.();
  cleanupTestDb(dbPath);
});

describe('creating a club with a cover photo', () => {
  it('saves the photo as the creator\'s own, tagged with the club hashtag, and shows it on the club page', async () => {
    // Defect caught: the photo is lost, owned by someone else, missing from
    // the club's gallery, or never shown on the club page or as its share image.
    const res = await postCreate(CREATOR_A, createFields('Ashland Kickers', 'Ashland', 'ashland_kickers'), { buffer: await jpeg(200), filename: 'ashland.jpg' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/clubs/club_ashland_kickers');
    const club = clubByKey('club_ashland_kickers')!;
    expect(club.cover_media_id).toBeTruthy();
    const photo = media(club.cover_media_id!)!;
    expect(photo.uploader_member_id).toBe(CREATOR_A);
    expect(tagsOf(club.cover_media_id!)).toEqual([`#by_${CREATOR_A.replace(/-/g, '_')}`, '#club_ashland_kickers'].sort());

    const page = await request(createApp()).get('/clubs/club_ashland_kickers');
    expect(page.status).toBe(200);
    const cover = coverImgs(page.text);
    expect(cover.map((c) => [c.id, c.src])).toEqual([['club-cover-photo', `/media-store/${photo.s3_key_display}`]]);
    expect(cover[0].alt).toContain('Ashland Kickers');
    // Absolute, because a social preview is fetched from outside the site.
    expect(ogImage(page.text)).toBe(`${process.env.PUBLIC_BASE_URL}/media-store/${photo.s3_key_display}`);
    expect(page.text.indexOf('id="club-cover-photo"')).toBeLessThan(page.text.indexOf('class="club-detail-meta"'));
  });

  it('a photo the upload refuses leaves the club created with no cover and no stored photo', async () => {
    // Defect caught: a bad photo loses the club, leaves a pointer at nothing,
    // or the creator is told nothing went wrong.
    const before = photoCountFor(CREATOR_B);
    const res = await postCreate(CREATOR_B, createFields('Bend Bags', 'Bend', 'bend_bags'),
      { buffer: Buffer.from('not an image at all'), filename: 'bend.jpg' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/clubs/club_bend_bags');
    expect(clubByKey('club_bend_bags')!.cover_media_id).toBeNull();
    expect(photoCountFor(CREATOR_B)).toBe(before);
    expect(coverImgs((await request(createApp()).get('/clubs/club_bend_bags')).text)).toEqual([]);
    // The success message carries more than a clean create's: the refusal.
    const clean = await postCreate(CREATOR_B, createFields('Burns Bags', 'Burns', 'burns_bags'));
    expect(clean.status).toBe(303);
    const refusedFlash = flashValueOf(res) ?? '';
    const cleanFlash = (flashValueOf(clean) ?? '').replace('club_burns_bags', 'club_bend_bags');
    expect(refusedFlash.startsWith(cleanFlash)).toBe(true);
    expect(refusedFlash.length).toBeGreaterThan(cleanFlash.length);
  });
});

describe('a co-leader changing the cover', () => {
  it('replaces, removes and repeats cleanly, leaving every photo in the gallery', async () => {
    // Defect caught: a replace or remove deletes or untags a photo, a double
    // click writes twice, or a repeat answers with an error.
    await postCreate(CREATOR_C, createFields('Corvallis Circle', 'Corvallis', 'corvallis_circle'));
    const club = clubByKey('club_corvallis_circle')!;
    expect(club.cover_media_id).toBeNull();

    const photo = { buffer: await jpeg(20), filename: 'corvallis-one.jpg' };
    const a = await postCover(CREATOR_C, 'club_corvallis_circle', photo);
    const photos = photoCountFor(CREATOR_C);
    const b = await postCover(CREATOR_C, 'club_corvallis_circle', photo);
    expect([a.status, b.status]).toEqual([303, 303]);
    expect(flashValueOf(b)).toBe(flashValueOf(a));
    expect(photoCountFor(CREATOR_C)).toBe(photos);
    const firstId = clubByKey('club_corvallis_circle')!.cover_media_id!;
    expect(auditCount('club.cover_photo_set', club.id)).toBe(1);

    await postCover(CREATOR_C, 'club_corvallis_circle', { buffer: await jpeg(60), filename: 'corvallis-two.jpg' });
    const secondId = clubByKey('club_corvallis_circle')!.cover_media_id!;
    expect(secondId).not.toBe(firstId);
    expect(media(firstId)?.moderation_status).toBe('active');
    expect(tagsOf(firstId)).toContain('#club_corvallis_circle');

    const r1 = await postRemove(CREATOR_C, 'club_corvallis_circle');
    const r2 = await postRemove(CREATOR_C, 'club_corvallis_circle');
    expect([r1.status, r2.status]).toEqual([303, 303]);
    expect(r1.headers.location).toBe('/clubs/club_corvallis_circle');
    expect(flashValueOf(r2)).toBe(flashValueOf(r1));
    expect(clubByKey('club_corvallis_circle')!.cover_media_id).toBeNull();
    expect(media(secondId)?.moderation_status).toBe('active');
    expect(flashValueOf(r1)).toMatch(/:o:/);
    expect(auditCount('club.cover_photo_removed', club.id)).toBe(1);

    // Another co-leader finding the cover already gone is told so in the
    // informational tone: they changed nothing, and it is not their repeat.
    withDb((db) => insertClubLeader(db, { club_id: club.id, member_id: CREATOR_B }));
    const r3 = await postRemove(CREATOR_B, 'club_corvallis_circle');
    expect(r3.status).toBe(303);
    expect(flashValueOf(r3)).toMatch(/:i:/);
    expect(auditCount('club.cover_photo_removed', club.id)).toBe(1);
  });

  it('deleting the photo through its owner\'s delete clears the cover', async () => {
    // Defect caught: deleting a photo is blocked by the club pointing at it,
    // or leaves the club pointing at a photo that no longer exists.
    await postCover(CREATOR_C, 'club_corvallis_circle', { buffer: await jpeg(80), filename: 'corvallis-three.jpg' });
    const mediaId = clubByKey('club_corvallis_circle')!.cover_media_id!;
    expect(mediaId).toBeTruthy();
    const del = await request(createApp())
      .post(`/members/${CREATOR_C.replace(/-/g, '_')}/media/${mediaId}/delete`)
      .set('Cookie', cookieFor(CREATOR_C)).type('form').send({});
    expect(del.status).toBe(303);
    expect(media(mediaId)).toBeUndefined();
    expect(clubByKey('club_corvallis_circle')!.cover_media_id).toBeNull();
  });

  it('refuses a member who does not co-lead the club as not-found, and changes nothing', async () => {
    // Defect caught: any member can put a photo on, or take one off, a club
    // they do not lead.
    const coverId = clubByKey('club_ashland_kickers')!.cover_media_id;
    expect(coverId).toBeTruthy();
    expect((await postCover(OUTSIDER, 'club_ashland_kickers', { buffer: await jpeg(90), filename: 'outsider.jpg' })).status).toBe(404);
    expect((await postRemove(OUTSIDER, 'club_ashland_kickers')).status).toBe(404);
    expect(clubByKey('club_ashland_kickers')!.cover_media_id).toBe(coverId);
    expect(photoCountFor(OUTSIDER)).toBe(0);
  });

  it('offers the cover controls only to a co-leader holding Tier 1 benefits', async () => {
    // Defect caught: a Tier 0 co-leader is shown a form the upload would
    // refuse, or a Tier 1 co-leader is not offered it.
    withDb((db) => insertClubLeader(db, { club_id: clubByKey('club_ashland_kickers')!.id, member_id: TIER0_LEADER }));
    const tier1 = await request(createApp()).get('/clubs/club_ashland_kickers').set('Cookie', cookieFor(CREATOR_A));
    expect(tier1.text).toContain('action="/clubs/club_ashland_kickers/cover-photo"');
    expect(tier1.text).toContain('action="/clubs/club_ashland_kickers/cover-photo/remove"');
    const tier0 = await request(createApp()).get('/clubs/club_ashland_kickers').set('Cookie', cookieFor(TIER0_LEADER));
    expect(tier0.status).toBe(200);
    expect(tier0.text).toContain('id="cover-photo"');
    expect(tier0.text).not.toContain('/cover-photo"');
    expect(tier0.text).not.toContain('/cover-photo/remove"');
    expect((await postRemove(TIER0_LEADER, 'club_ashland_kickers')).status).toBe(403);
    expect(clubByKey('club_ashland_kickers')!.cover_media_id).toBeTruthy();
  });
});

describe('when a club cover is honoured', () => {
  it('a photo taken down by an administrator or that lost the hashtag is no cover; a live one is', async () => {
    // Defect caught: a removed or retagged photo keeps showing on the club page.
    const seed = (slug: string, photo: { moderation_status: 'active' | 'removed_by_admin'; tagged: boolean }): string => withDb((db) => {
      const tagId = insertTag(db, { tag_normalized: `#club_${slug}`, standard_type: 'club' });
      const mediaId = insertMediaItem(db, { uploader_member_id: CREATOR_A, moderation_status: photo.moderation_status });
      if (photo.tagged) attachMediaTag(db, mediaId, tagId);
      insertClub(db, { name: `Seeded ${slug}`, city: 'Medford', region: 'Oregon', hashtag_tag_id: tagId, publiclyVisible: true, cover_media_id: mediaId });
      return mediaId;
    });
    const liveId = seed('seeded_live', { moderation_status: 'active', tagged: true });
    seed('seeded_down', { moderation_status: 'removed_by_admin', tagged: true });
    seed('seeded_untagged', { moderation_status: 'active', tagged: false });

    const live = await request(createApp()).get('/clubs/club_seeded_live');
    expect(coverImgs(live.text).map((c) => c.src)).toEqual([`/media-store/${media(liveId)!.s3_key_display}`]);
    for (const key of ['club_seeded_down', 'club_seeded_untagged']) {
      const page = await request(createApp()).get(`/clubs/${key}`);
      expect(page.status).toBe(200);
      expect(coverImgs(page.text), key).toEqual([]);
    }
  });
});
