/**
 * A trick has one gallery: every media save stores a trick alias tag under the
 * canonical trick's slug.
 *
 * The gallery filters on one literal tag and never expands aliases, so a clip
 * saved under an alias would be missing from the trick's own gallery. Each save
 * path is driven here through the service method its controller calls.
 *
 * A tag that names no trick stays a free-text hashtag, and so does an alias whose
 * trick is not active, because no public trick page could show the clip.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import {
  insertMember,
  insertMemberTierGrant,
  insertMediaSource,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
} from '../fixtures/factories';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';
import type { ImageProcessingAdapter } from '../../src/adapters/imageProcessingAdapter';
import type { VideoTranscodingAdapter } from '../../src/adapters/videoTranscodingAdapter';
import type { MediaJobRow } from '../../src/db/db';

const { dbPath } = setTestEnv('4161');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svcModule: typeof import('../../src/services/curatorMediaService');
let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'admin-alias-tags-001';
const MEMBER_ID = 'member-alias-tags-001';
const MEMBER_SLUG = 'alias_tags_member';

const CANONICAL = 'canonicalaliastrick';
const ALIAS = 'folded_alias_name';
const HELD_TARGET = 'heldaliastarget';
const HELD_ALIAS = 'alias_of_held_trick';

const curatedRoot = createScratchDir('alias-tags-curated');
let photo: Buffer;
let videoIds = 0;

function storage(): MediaStorageAdapter {
  const contents = new Map<string, Buffer>();
  return {
    async put(key, data) { contents.set(key, Buffer.from(data)); },
    async get(key) {
      const data = contents.get(key);
      if (!data) throw new Error(`missing key ${key}`);
      return data;
    },
    async delete(key) { contents.delete(key); },
    constructURL(key) { return `/media-store/${key}`; },
    async exists(key) { return contents.has(key); },
    async headSize(key) { return contents.get(key)?.length ?? null; },
    async generatePresignedPutUrl(key) { return `/put/${key}`; },
    async generatePresignedGetUrl(key) { return `/get/${key}`; },
  };
}

function imageProcessor(): ImageProcessingAdapter {
  const rendition = { thumb: Buffer.from('t'), display: Buffer.from('d'), widthPx: 1000, heightPx: 750 };
  return {
    async processAvatar() { return { ...rendition, widthPx: 300, heightPx: 300 }; },
    async processPhoto() { return rendition; },
  };
}

function transcoder(store: MediaStorageAdapter): VideoTranscodingAdapter {
  return {
    transcode: async () => ({ bytes: Buffer.from('mp4'), outputFormat: 'mp4' }),
    transcodeFromStorage: async (_source, outputKey) => {
      await store.put(outputKey, Buffer.from('mp4'));
      return { outputKey, outputFormat: 'mp4', outputBytes: 3 };
    },
  };
}

function service(store: MediaStorageAdapter = storage()) {
  return svcModule.createCuratorMediaService({
    storage: store,
    imageProcessor: imageProcessor(),
    videoTranscoder: transcoder(store),
    videoUrlVerifier: async () => ({ ok: true, status: 200, body: { title: 'Clip' } }),
    curatedRootDir: curatedRoot,
  });
}

function fakeMp4(): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('ftyp', 4, 'ascii');
  buf.write('isom', 8, 'ascii');
  return buf;
}

function nextYoutubeUrl(): string {
  videoIds += 1;
  return `https://www.youtube.com/watch?v=aliastag${String(videoIds).padStart(3, '0')}`;
}

let fileSeq = 0;
function filename(ext: string): string {
  fileSeq += 1;
  return `alias-tags-${fileSeq}.${ext}`;
}

function storedTags(mediaId: string): string[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (db.prepare(
      `SELECT t.tag_normalized AS tag FROM media_tags mt JOIN tags t ON t.id = mt.tag_id
       WHERE mt.media_id = ? ORDER BY t.tag_normalized`,
    ).all(mediaId) as { tag: string }[]).map((r) => r.tag);
  } finally {
    db.close();
  }
}

function jobRow(tags: string): MediaJobRow {
  return {
    id: `mediajob_alias_${filename('job')}`,
    kind: 'curator_video',
    state: 'processing',
    admin_member_id: ADMIN_ID,
    source_video_key: 'pending/alias/source.mp4',
    source_poster_key: 'pending/alias/source-poster.jpg',
    caption: 'finalize',
    tags,
    source_filename: filename('mp4'),
    external_url: null,
    media_id: null,
    retry_count: 0,
    last_error: null,
    last_attempted_at: '2026-01-01T00:00:00.000Z',
    lease_expires_at: '2099-01-01T00:00:00.000Z',
    expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    created_by: 'admin',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by: 'admin',
    version: 1,
  } as MediaJobRow;
}

const uploadCuratorPhoto = (tags: string[]) => service().uploadPhoto({
  adminMemberId: ADMIN_ID, photoBuffer: photo, sourceFilename: filename('jpg'), caption: null, tags,
});

const uploadMemberPhoto = (tags: string[]) => service().uploadPhotoForMember({
  memberId: MEMBER_ID, actorIsAdmin: true, slug: MEMBER_SLUG, photoBuffer: photo,
  sourceFilename: filename('jpg'), caption: null, tags,
});

const uploadReference = (tags: string[], videoUrl = nextYoutubeUrl()) => service().uploadUrlReference({
  adminMemberId: ADMIN_ID,
  category: 'freestyle_tricks',
  videoUrl,
  videoPlatform: 'youtube',
  primarySlug: CANONICAL,
  title: 'Alias clip',
  sourceId: 'tt_youtube',
  startSeconds: null,
  endSeconds: null,
  tags,
});

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'alias_tags_admin', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG });
  insertMember(db, { id: 'member_footbag_hacky_test', slug: 'footbag_hacky', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  insertMemberTierGrant(db, { member_id: ADMIN_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });
  insertMemberTierGrant(db, { member_id: MEMBER_ID, new_tier_status: 'tier1' });
  insertMediaSource(db, 'tt_youtube', { sourceName: 'Tricks of the Trade', sourceType: 'youtube' });

  insertFreestyleTrick(db, {
    slug: CANONICAL, canonical_name: CANONICAL, adds: '3', base_trick: CANONICAL, trick_family: CANONICAL,
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  });
  insertFreestyleTrick(db, {
    slug: HELD_TARGET, canonical_name: HELD_TARGET, adds: '3', category: 'compound',
    review_status: 'pending', is_active: 0,
  });
  insertFreestyleTrickAlias(db, ALIAS, CANONICAL);
  insertFreestyleTrickAlias(db, HELD_ALIAS, HELD_TARGET);
  db.close();

  photo = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 80, g: 120, b: 160 } },
  }).jpeg().toBuffer();
  svcModule = await import('../../src/services/curatorMediaService');
  createApp = await importApp();
});

afterAll(() => {
  removeScratch(curatedRoot);
  cleanupTestDb(dbPath);
});

const SAVE_PATHS: [string, (tags: string[]) => Promise<{ mediaId: string }>][] = [
  ['a curator photo upload', uploadCuratorPhoto],
  ['a curator video upload', (tags) => service().uploadVideo({
    adminMemberId: ADMIN_ID, videoBuffer: fakeMp4(), posterBuffer: photo,
    sourceFilename: filename('mp4'), caption: null, tags,
  })],
  ['a finished curator video transcode', async (tags) => {
    const store = storage();
    await store.put('pending/alias/source.mp4', fakeMp4());
    await store.put('pending/alias/source-poster.jpg', photo);
    return service(store).finalizeTranscodeForJob(jobRow(tags.join(' ')));
  }],
  ['a curator URL reference', (tags) => uploadReference(tags)],
  ['a curator edit', async (tags) => {
    const { mediaId } = await uploadCuratorPhoto(['#untouched_start']);
    await service().editMedia({ adminMemberId: ADMIN_ID, mediaId, tags });
    return { mediaId };
  }],
  ['a member photo upload', uploadMemberPhoto],
  ['a member edit', async (tags) => {
    const { mediaId } = await uploadMemberPhoto(['#untouched_start']);
    await service().editMemberMedia({ memberId: MEMBER_ID, actorIsAdmin: true, slug: MEMBER_SLUG, mediaId, tags });
    return { mediaId };
  }],
  ['a member video submission', (tags) => service().submitVideoForMember({
    memberId: MEMBER_ID, actorIsAdmin: true, slug: MEMBER_SLUG, videoUrl: nextYoutubeUrl(),
    videoPlatform: 'youtube', caption: null, tags,
  })],
];

describe('every media save stores a trick alias tag under the canonical trick', () => {
  it.each(SAVE_PATHS)('%s', async (_name, saveWith) => {
    const { mediaId } = await saveWith([`#${ALIAS}`, '#freestyle']);

    const tags = storedTags(mediaId);
    expect(tags).toContain(`#${CANONICAL}`);
    expect(tags).not.toContain(`#${ALIAS}`);
    expect(tags).toContain('#freestyle');
  });
});

describe('what the conversion leaves alone', () => {
  it('keeps a tag that names no trick as a free-text hashtag', async () => {
    const { mediaId } = await uploadCuratorPhoto(['#not_a_trick_at_all']);

    expect(storedTags(mediaId)).toContain('#not_a_trick_at_all');
  });

  it('keeps an alias whose trick is not active as a free-text hashtag', async () => {
    const { mediaId } = await uploadCuratorPhoto([`#${HELD_ALIAS}`]);

    expect(storedTags(mediaId)).toContain(`#${HELD_ALIAS}`);
    expect(storedTags(mediaId)).not.toContain(`#${HELD_TARGET}`);
  });

  it('reads the alias whatever capitalisation was typed', async () => {
    const { mediaId } = await uploadCuratorPhoto([`#${ALIAS.toUpperCase()}`]);

    expect(storedTags(mediaId)).toContain(`#${CANONICAL}`);
  });

});

describe('a clip saved under an alias reaches its trick', () => {
  it('writes the canonical tag to the committed file, so a rebuild cannot bring the alias back', async () => {
    const videoUrl = nextYoutubeUrl();
    await uploadReference([`#${ALIAS}`, '#freestyle', '#trick', '#tutorial'], videoUrl);

    const dir = path.join(curatedRoot, 'freestyle_tricks');
    const sidecars = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const written = sidecars.find((s) => s.videoUrl === videoUrl);
    expect(written.tags).toContain(`#${CANONICAL}`);
    expect(written.tags).not.toContain(`#${ALIAS}`);
  });

  it('appears in the trick gallery the trick page links to', async () => {
    await uploadReference([`#${ALIAS}`, '#freestyle', '#trick', '#tutorial']);
    const app = await createApp();

    const trickPage = await request(app).get(`/freestyle/tricks/${CANONICAL}`);
    expect(trickPage.status).toBe(200);
    expect(trickPage.text).toContain(`/media/browse?context&#x3D;${CANONICAL}`);
    expect(trickPage.text).not.toContain(`/media/browse?context&#x3D;${ALIAS}`);

    const gallery = await request(app).get(`/media/browse?context=${CANONICAL}`);
    expect(gallery.status).toBe(200);
    expect(gallery.text).toContain('aliastag');
  });
});
