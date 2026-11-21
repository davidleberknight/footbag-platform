/**
 * An event's cover photo: uploaded at creation or from the manage page, shown
 * at the top of the event page as its share image and as a thumbnail on its
 * listed card.
 *
 * The contract: the cover is an ordinary photo owned by the organizer who
 * uploaded it and tagged with the event's hashtag (and the uploader's own
 * #by_ tag), so it is also in the event's gallery. The event is created first;
 * a photo the upload refuses leaves the event created with no cover. Replacing
 * a cover moves the pointer and leaves the earlier photo in the gallery;
 * removing it clears the pointer and deletes no photo; either, submitted twice,
 * repeats cleanly. Only a current organizer holding Tier 1 benefits may change
 * it. A cover shows only while its photo is active, not an avatar and still
 * carries the hashtag; a deleted photo stops being the cover. Every list of
 * events resolves its covers in one statement, and the compact list draws no
 * thumbnail.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
  insertEvent,
  insertEventOrganizer,
  insertMediaItem,
  insertMember,
  insertTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4971');

let createApp: Awaited<ReturnType<typeof importApp>>;
let resetImageProcessingAdapterForTests: () => void;
let resetRateLimitForTests: () => void;

// Every created event is dated in one future year, so its hashtag is known.
const YEAR = String(new Date().getUTCFullYear() + 2);
const CURRENT_YEAR = String(new Date().getUTCFullYear());

const ORGANIZER = 'ecp-organizer';
const CO_ORGANIZER = 'ecp-co-organizer';
const OUTSIDER = 'ecp-outsider';
const TIER0_ORGANIZER = 'ecp-tier0-organizer';

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

async function jpeg(r: number): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: { r, g: 90, b: 60 } } }).jpeg().toBuffer();
}

function createFields(title: string, slug: string): Record<string, string> {
  return {
    event_type: 'free',
    title,
    description: 'A weekend of net and freestyle.',
    start_date: `${YEAR}-06-12`,
    end_date: `${YEAR}-06-14`,
    city: 'Eugene',
    region: 'Oregon',
    country: 'United States',
    registration_deadline: '',
    tshirt_size_collected: '0',
    attendee_registration_open: '0',
    slug,
    competitor_fee: '',
    spectator_fee: '',
  };
}

function postCreate(memberId: string, fields: Record<string, string>, photo?: { buffer: Buffer; filename: string }) {
  let req = request(createApp()).post('/events/create').set('Cookie', cookieFor(memberId));
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  if (photo) req = req.attach('cover_photo', photo.buffer, photo.filename);
  return req;
}

function postCover(memberId: string, eventKey: string, photo: { buffer: Buffer; filename: string }) {
  return request(createApp()).post(`/events/${eventKey}/cover-photo`).set('Cookie', cookieFor(memberId))
    .attach('cover_photo', photo.buffer, photo.filename);
}

function postRemove(memberId: string, eventKey: string) {
  return request(createApp()).post(`/events/${eventKey}/cover-photo/remove`).set('Cookie', cookieFor(memberId)).type('form').send({});
}

interface EventCoverRow { id: string; cover_media_id: string | null }
function eventByKey(eventKey: string): EventCoverRow | undefined {
  return withDb((db) => db.prepare(`
    SELECT e.id, e.cover_media_id FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE t.tag_normalized = ?
  `).get(`#${eventKey}`) as EventCoverRow | undefined);
}

interface MediaRow { id: string; uploader_member_id: string; moderation_status: string; s3_key_thumb: string; s3_key_display: string }
function media(mediaId: string): MediaRow | undefined {
  return withDb((db) => db.prepare(
    'SELECT id, uploader_member_id, moderation_status, s3_key_thumb, s3_key_display FROM media_items WHERE id = ?',
  ).get(mediaId) as MediaRow | undefined);
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

/** The src, alt and id of every img the page draws with the given class. */
function imgs(html: string, cls: string): Array<{ src: string; alt: string; id: string }> {
  const out: Array<{ src: string; alt: string; id: string }> = [];
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!new RegExp(`class="[^"]*\\b${cls}\\b`).test(tag)) continue;
    out.push({
      src: /src="([^"]*)"/.exec(tag)?.[1] ?? '',
      alt: /alt="([^"]*)"/.exec(tag)?.[1] ?? '',
      id: /id="([^"]*)"/.exec(tag)?.[1] ?? '',
    });
  }
  return out;
}

/** The card the dated-item partial drew for the event whose page this links. */
function cardFor(html: string, eventKey: string): string {
  const cards = html.split('<article class="card card-static">').slice(1).map((c) => c.slice(0, c.indexOf('</article>')));
  const card = cards.find((c) => c.includes(`href="/events/${eventKey}"`));
  expect(card, `a card for ${eventKey}`).toBeDefined();
  return card as string;
}

function ogImage(html: string): string {
  return /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1] ?? '';
}

// A seeded event whose cover pointer names a seeded photo; the photo's state
// is what each read case varies.
function seedEventWithCover(opts: {
  key: string; title: string; start: string; end: string; status?: 'reg_open' | 'completed' | 'canceled';
  photo: { moderation_status?: 'active' | 'removed_by_admin'; is_avatar?: 0 | 1; tagged: boolean; caption?: string | null };
}): { eventId: string; mediaId: string } {
  return withDb((db) => {
    const tagId = insertTag(db, { tag_normalized: `#${opts.key}`, standard_type: 'event' });
    const mediaId = insertMediaItem(db, {
      uploader_member_id: ORGANIZER,
      moderation_status: opts.photo.moderation_status ?? 'active',
      is_avatar: opts.photo.is_avatar ?? 0,
      caption: opts.photo.caption ?? null,
    });
    if (opts.photo.tagged) attachMediaTag(db, mediaId, tagId);
    const eventId = insertEvent(db, {
      title: opts.title, hashtag_tag_id: tagId, start_date: opts.start, end_date: opts.end,
      status: opts.status ?? 'reg_open', cover_media_id: mediaId,
    });
    insertEventOrganizer(db, eventId, ORGANIZER);
    return { eventId, mediaId };
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [id, tier] of [[ORGANIZER, 'tier1'], [CO_ORGANIZER, 'tier1'], [OUTSIDER, 'tier1'], [TIER0_ORGANIZER, 'tier0']] as const) {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier,
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com` },
    });
    completeOnboarding(db, id);
  }
  // The upload path looks the system member up when it materializes the
  // uploader's Personal Gallery.
  insertMember(db, { id: 'member_footbag_hacky_ecp', slug: 'fh_ecp', display_name: 'Footbag Hacky', is_system: 1 });
  db.close();

  createApp = await importApp();

  // The image worker is the in-process Sharp pipeline injected at the HTTP
  // adapter boundary, as the Share Media suite does.
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

describe('creating an event with a cover photo', () => {
  it('saves the photo as the organizer\'s own, tagged with the event hashtag, and shows it on the page and its card', async () => {
    // Defect caught: the photo is lost, owned by someone else, missing from the
    // event's gallery, or never shown where a visitor looks for it.
    const key = `event_${YEAR}_cover_open`;
    const res = await postCreate(ORGANIZER, createFields('Cover Open', 'cover_open'), { buffer: await jpeg(200), filename: 'cover-open.jpg' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/events/${key}/manage`);
    const event = eventByKey(key);
    expect(event?.cover_media_id).toBeTruthy();
    const photo = media(event!.cover_media_id!);
    expect(photo?.uploader_member_id).toBe(ORGANIZER);
    expect(tagsOf(photo!.id)).toEqual([`#by_${ORGANIZER.replace(/-/g, '_')}`, `#${key}`].sort());

    const page = await request(createApp()).get(`/events/${key}`);
    expect(page.status).toBe(200);
    const cover = imgs(page.text, 'cover-photo');
    expect(cover.map((c) => [c.id, c.src])).toEqual([['event-cover-photo', `/media-store/${photo!.s3_key_display}`]]);
    // With no caption, the alt text names the event.
    expect(cover[0].alt).toContain('Cover Open');
    // Absolute, because a social preview is fetched from outside the site.
    expect(ogImage(page.text)).toBe(`${process.env.PUBLIC_BASE_URL}/media-store/${photo!.s3_key_display}`);
    // The cover sits under the hero and before the facts strip.
    expect(page.text.indexOf('id="event-cover-photo"')).toBeLessThan(page.text.indexOf('class="event-meta-row"'));

    const landing = await request(createApp()).get('/events');
    const card = cardFor(landing.text, key);
    // The thumbnail links to the event page, out of the tab order and hidden
    // from assistive technology, with an empty alt.
    const thumb = /<a class="card-thumb" href="([^"]+)" tabindex="-1" aria-hidden="true"><img src="([^"]+)" alt=""/.exec(card);
    expect(thumb?.slice(1)).toEqual([`/events/${key}`, `/media-store/${photo!.s3_key_thumb}`]);
  });

  it('without a photo creates the event with no cover and draws its card unchanged', async () => {
    // Defect caught: a cover appears, or the card grows a broken thumbnail,
    // for an event nobody gave a photo; or a create without a file fails.
    const key = `event_${YEAR}_plain_open`;
    const res = await postCreate(ORGANIZER, createFields('Plain Open', 'plain_open'));
    expect(res.status).toBe(303);
    expect(eventByKey(key)?.cover_media_id).toBeNull();
    const page = await request(createApp()).get(`/events/${key}`);
    expect(imgs(page.text, 'cover-photo')).toEqual([]);
    expect(cardFor((await request(createApp()).get('/events')).text, key)).not.toContain('card-thumb');
  });

  it('a photo the upload refuses leaves the event created, with no cover and no stored photo', async () => {
    // Defect caught: a bad photo loses the whole event, or leaves a pointer at
    // nothing, or the organizer is told nothing went wrong.
    const key = `event_${YEAR}_refused_photo`;
    const before = photoCountFor(CO_ORGANIZER);
    const res = await postCreate(CO_ORGANIZER, createFields('Refused Photo Open', 'refused_photo'),
      { buffer: Buffer.from('this is not an image'), filename: 'not-a-photo.jpg' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/events/${key}/manage`);
    expect(eventByKey(key)?.cover_media_id).toBeNull();
    expect(photoCountFor(CO_ORGANIZER)).toBe(before);
    // The success message carries more than a clean create's: the refusal.
    const clean = await postCreate(CO_ORGANIZER, createFields('Clean Photo Open', 'clean_photo'));
    const refusedFlash = flashValueOf(res) ?? '';
    const cleanFlash = (flashValueOf(clean) ?? '').replace(`event_${YEAR}_clean_photo`, key);
    expect(refusedFlash.startsWith(cleanFlash)).toBe(true);
    expect(refusedFlash.length).toBeGreaterThan(cleanFlash.length);
  });
});

describe('changing the cover from the manage page', () => {
  it('replacing moves the pointer and leaves the earlier photo in the gallery; removing clears it and deletes nothing', async () => {
    // Defect caught: a replace deletes or untags the earlier photo, a remove
    // deletes the photo, or neither is audited.
    const key = `event_${YEAR}_replace_open`;
    await postCreate(ORGANIZER, createFields('Replace Open', 'replace_open'));
    const event = eventByKey(key)!;

    const first = await postCover(ORGANIZER, key, { buffer: await jpeg(10), filename: 'replace-first.jpg' });
    expect(first.status).toBe(303);
    const firstId = eventByKey(key)!.cover_media_id!;
    const second = await postCover(ORGANIZER, key, { buffer: await jpeg(40), filename: 'replace-second.jpg' });
    expect(second.status).toBe(303);
    const secondId = eventByKey(key)!.cover_media_id!;
    expect(secondId).not.toBe(firstId);
    expect(media(firstId)?.moderation_status).toBe('active');
    expect(tagsOf(firstId)).toContain(`#${key}`);
    expect(auditCount('event.cover_photo_set', event.id)).toBe(2);

    const removed = await postRemove(ORGANIZER, key);
    expect(removed.status).toBe(303);
    expect(removed.headers.location).toBe(`/events/${key}/manage`);
    expect(eventByKey(key)!.cover_media_id).toBeNull();
    expect(media(secondId)?.moderation_status).toBe('active');
    expect(auditCount('event.cover_photo_removed', event.id)).toBe(1);
    expect(imgs((await request(createApp()).get(`/events/${key}`)).text, 'cover-photo')).toEqual([]);
  });

  it('submitted twice, an upload and a remove each report the first outcome and change nothing more', async () => {
    // Defect caught: a double click stores the photo twice, writes a second
    // audit row, or answers the repeat with an error.
    const key = `event_${YEAR}_twice_open`;
    await postCreate(ORGANIZER, createFields('Twice Open', 'twice_open'));
    const event = eventByKey(key)!;
    const photo = { buffer: await jpeg(70), filename: 'twice.jpg' };

    const a = await postCover(ORGANIZER, key, photo);
    const photos = photoCountFor(ORGANIZER);
    const b = await postCover(ORGANIZER, key, photo);
    expect([a.status, b.status]).toEqual([303, 303]);
    expect(b.headers.location).toBe(a.headers.location);
    expect(flashValueOf(b)).toBe(flashValueOf(a));
    expect(photoCountFor(ORGANIZER)).toBe(photos);
    expect(auditCount('event.cover_photo_set', event.id)).toBe(1);

    const r1 = await postRemove(ORGANIZER, key);
    const r2 = await postRemove(ORGANIZER, key);
    expect([r1.status, r2.status]).toEqual([303, 303]);
    expect(flashValueOf(r2)).toBe(flashValueOf(r1));
    expect(flashValueOf(r1)).toMatch(/:o:/);
    expect(auditCount('event.cover_photo_removed', event.id)).toBe(1);

    // Another organizer finding the cover already gone is told so in the
    // informational tone: they changed nothing, and it is not their repeat.
    withDb((db) => insertEventOrganizer(db, event.id, CO_ORGANIZER));
    const r3 = await postRemove(CO_ORGANIZER, key);
    expect(r3.status).toBe(303);
    expect(flashValueOf(r3)).toMatch(/:i:/);
    expect(auditCount('event.cover_photo_removed', event.id)).toBe(1);
  });

  it('a canceled event takes no cover change and offers no controls', async () => {
    // Defect caught: an organizer changes the record of an event that was
    // canceled and takes no further changes.
    const control = `event_${YEAR}_open_control`;
    seedEventWithCover({ key: control, title: 'Open Control', start: `${YEAR}-09-03`, end: `${YEAR}-09-04`, photo: { tagged: true } });
    const live = await request(createApp()).get(`/events/${control}/manage`).set('Cookie', cookieFor(ORGANIZER));
    expect(live.text).toContain(`action="/events/${control}/cover-photo"`);
    expect(live.text).toContain(`action="/events/${control}/cover-photo/remove"`);

    const key = `event_${YEAR}_canceled_cover`;
    const { mediaId } = seedEventWithCover({ key, title: 'Canceled Cover', start: `${YEAR}-09-01`, end: `${YEAR}-09-02`, status: 'canceled', photo: { tagged: true } });
    const manage = await request(createApp()).get(`/events/${key}/manage`).set('Cookie', cookieFor(ORGANIZER));
    expect(manage.status).toBe(200);
    expect(manage.text).not.toContain(`action="/events/${key}/cover-photo"`);
    expect(manage.text).not.toContain(`action="/events/${key}/cover-photo/remove"`);
    const up = await postCover(ORGANIZER, key, { buffer: await jpeg(150), filename: 'canceled.jpg' });
    expect(up.status).toBe(422);
    const rm = await postRemove(ORGANIZER, key);
    expect(rm.status).toBe(303);
    expect(flashValueOf(rm)).toMatch(/:n:/);
    expect(eventByKey(key)!.cover_media_id).toBe(mediaId);
  });

  it('refuses a member who does not organize the event as not-found, and changes nothing', async () => {
    // Defect caught: any member can put a photo on, or take one off, an event
    // they do not organize, or learns that it exists.
    const key = `event_${YEAR}_guarded_open`;
    await postCreate(ORGANIZER, createFields('Guarded Open', 'guarded_open'), { buffer: await jpeg(120), filename: 'guarded.jpg' });
    const coverId = eventByKey(key)!.cover_media_id;
    expect(coverId).toBeTruthy();

    const up = await postCover(OUTSIDER, key, { buffer: await jpeg(130), filename: 'outsider.jpg' });
    expect(up.status).toBe(404);
    const rm = await postRemove(OUTSIDER, key);
    expect(rm.status).toBe(404);
    expect(eventByKey(key)!.cover_media_id).toBe(coverId);
    expect(photoCountFor(OUTSIDER)).toBe(0);
  });

  it('offers the cover controls only to an organizer holding Tier 1 benefits', async () => {
    // Defect caught: a Tier 0 organizer is shown a form the upload would
    // refuse, or a Tier 1 organizer is not offered it.
    const key = `event_${YEAR}_tiered_open`;
    await postCreate(ORGANIZER, createFields('Tiered Open', 'tiered_open'));
    withDb((db) => insertEventOrganizer(db, eventByKey(key)!.id, TIER0_ORGANIZER));

    const tier1 = await request(createApp()).get(`/events/${key}/manage`).set('Cookie', cookieFor(ORGANIZER));
    expect(tier1.status).toBe(200);
    expect(tier1.text).toContain(`action="/events/${key}/cover-photo"`);
    expect(tier1.text).toContain('id="event_cover_photo"');

    const tier0 = await request(createApp()).get(`/events/${key}/manage`).set('Cookie', cookieFor(TIER0_ORGANIZER));
    expect(tier0.status).toBe(200);
    expect(tier0.text).toContain('id="cover-photo"');
    expect(tier0.text).not.toContain('/cover-photo"');
    expect(tier0.text).not.toContain('/cover-photo/remove"');

    const post = await postCover(TIER0_ORGANIZER, key, { buffer: await jpeg(140), filename: 'tier0.jpg' });
    expect(post.status).toBe(403);
    expect(eventByKey(key)!.cover_media_id).toBeNull();
  });
});

describe('when a cover is honoured', () => {
  it('a photo taken down by an administrator, or one that lost the hashtag is no cover; a live one is', async () => {
    // Defect caught: a removed or retagged photo keeps showing on the event
    // page and its card, or another photo stands in for it.
    const live = seedEventWithCover({ key: `event_${YEAR}_live_cover`, title: 'Live Cover', start: `${YEAR}-07-01`, end: `${YEAR}-07-02`, photo: { tagged: true, caption: 'The finals court' } });
    const down = seedEventWithCover({ key: `event_${YEAR}_down_cover`, title: 'Down Cover', start: `${YEAR}-07-03`, end: `${YEAR}-07-04`, photo: { tagged: true, moderation_status: 'removed_by_admin' } });
    const untagged = seedEventWithCover({ key: `event_${YEAR}_untagged_cover`, title: 'Untagged Cover', start: `${YEAR}-07-05`, end: `${YEAR}-07-06`, photo: { tagged: false } });
    // An avatar is never a cover, even one carrying the hashtag.
    seedEventWithCover({ key: `event_${YEAR}_avatar_cover`, title: 'Avatar Cover', start: `${YEAR}-07-07`, end: `${YEAR}-07-08`, photo: { tagged: true, is_avatar: 1 } });

    const livePage = await request(createApp()).get(`/events/event_${YEAR}_live_cover`);
    const liveMedia = media(live.mediaId)!;
    expect(imgs(livePage.text, 'cover-photo')).toEqual([{ id: 'event-cover-photo', src: `/media-store/${liveMedia.s3_key_display}`, alt: 'The finals court' }]);
    for (const key of [`event_${YEAR}_down_cover`, `event_${YEAR}_untagged_cover`, `event_${YEAR}_avatar_cover`]) {
      const page = await request(createApp()).get(`/events/${key}`);
      expect(page.status).toBe(200);
      expect(imgs(page.text, 'cover-photo'), key).toEqual([]);
    }

    const landing = (await request(createApp()).get('/events')).text;
    expect(cardFor(landing, `event_${YEAR}_live_cover`)).toContain('card-thumb');
    expect(cardFor(landing, `event_${YEAR}_down_cover`)).not.toContain('card-thumb');
    expect(cardFor(landing, `event_${YEAR}_untagged_cover`)).not.toContain('card-thumb');
    // The pointers themselves are left as they were: the read decides.
    expect(eventByKey(`event_${YEAR}_down_cover`)!.cover_media_id).toBe(down.mediaId);
    expect(eventByKey(`event_${YEAR}_untagged_cover`)!.cover_media_id).toBe(untagged.mediaId);
  });

  it('deleting the photo through its owner\'s delete clears the cover', async () => {
    // Defect caught: deleting a photo is blocked by the event pointing at it,
    // or leaves the event pointing at a photo that no longer exists.
    const key = `event_${YEAR}_deleted_cover`;
    await postCreate(ORGANIZER, createFields('Deleted Cover', 'deleted_cover'), { buffer: await jpeg(160), filename: 'deleted-cover.jpg' });
    const mediaId = eventByKey(key)!.cover_media_id!;
    const del = await request(createApp())
      .post(`/members/${ORGANIZER.replace(/-/g, '_')}/media/${mediaId}/delete`)
      .set('Cookie', cookieFor(ORGANIZER)).type('form').send({});
    expect(del.status).toBe(303);
    expect(media(mediaId)).toBeUndefined();
    expect(eventByKey(key)!.cover_media_id).toBeNull();
    expect(imgs((await request(createApp()).get(`/events/${key}`)).text, 'cover-photo')).toEqual([]);
  });

  it('the compact current-year list draws no thumbnail, while the year page draws it for the same event', async () => {
    // Defect caught: the side-by-side compact list is crowded with thumbnails,
    // or the year page loses them.
    const key = `event_${CURRENT_YEAR}_compact_cover`;
    seedEventWithCover({ key, title: 'Compact Cover', start: `${CURRENT_YEAR}-01-02`, end: `${CURRENT_YEAR}-01-03`, status: 'completed', photo: { tagged: true } });
    expect(cardFor((await request(createApp()).get('/events')).text, key)).not.toContain('card-thumb');
    expect(cardFor((await request(createApp()).get(`/events/year/${CURRENT_YEAR}`)).text, key)).toContain('card-thumb');
  });

  it('a list of events reads its covers in one statement however many events it holds', async () => {
    // Defect caught: each listed event reads its own cover, so a busy year
    // page fans out into one query per event.
    for (let i = 0; i < 4; i++) {
      seedEventWithCover({ key: `event_${YEAR}_batch_${i}`, title: `Batch ${i}`, start: `${YEAR}-08-0${i + 1}`, end: `${YEAR}-08-0${i + 1}`, photo: { tagged: true } });
    }
    const { db } = await import('../../src/db/db');
    const { eventService } = await import('../../src/services/eventService');
    const spy = vi.spyOn(db, 'prepare');
    try {
      const items = eventService.listUpcomingEventItems(new Date().toISOString());
      const batch = items.filter((i) => i.href.includes('_batch_'));
      expect(batch).toHaveLength(4);
      expect(batch.every((i) => i.image?.thumbUrl.startsWith('/media-store/'))).toBe(true);
      const coverReads = spy.mock.calls.filter(([sql]) => String(sql).includes('cover_media_id'));
      expect(coverReads).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});
