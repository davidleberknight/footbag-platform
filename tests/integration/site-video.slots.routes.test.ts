/**
 * The videos the section landings feature are curated media items. Once each
 * slot's item is stored, its page plays that item, and browsing media by the
 * item's hashtag lists it, the same as any other video.
 *
 * Each slot's item is seeded the way the curator seed stores it: a stored clip
 * by its source file name, a YouTube video by its watch URL, each with the tags
 * its slot expects. The page each slot belongs on is written out here by hand.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertCuratorVideo, insertCuratorUrlReference } from '../fixtures/factories';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SITE_MEDIA_SLOTS, SiteMediaSlot, SiteMediaSlotKey } from '../../src/content/siteMedia';

const { dbPath } = setTestEnv('3963');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;
let curatedRoot: string;

const PAGE_SLOTS: Record<string, SiteMediaSlotKey[]> = {
  '/net': ['net_demo', 'net_singles', 'net_doubles'],
  '/freestyle': [
    'freestyle_demo', 'freestyle_circle', 'freestyle_sick_3', 'freestyle_shred_30',
    'freestyle_reese_1988', 'freestyle_conlon_1998', 'freestyle_worlds_2023_team',
    'freestyle_san_marino_2026', 'fountain_shred',
  ],
  '/consecutives': ['consecutives_demo'],
  '/golf': ['golf_demo'],
  '/sideline': ['circle_kicking_demo'],
  '/x-square': ['four_square_demo'],
};

// What a page's HTML carries when it plays the slot's item: a stored clip's
// media-store key, or a YouTube video's embed address.
const marker = new Map<SiteMediaSlotKey, string>();
const mediaIdOf = new Map<SiteMediaSlotKey, string>();

function youtubeId(url: string): string {
  return new URL(url).searchParams.get('v') ?? '';
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  curatedRoot = createScratchDir('site-video-slots');
  try {
    const fhId = insertMember(db, { is_system: 1, slug: 'fh-site-video' });
    for (const key of Object.values(PAGE_SLOTS).flat()) {
      const slot: SiteMediaSlot = SITE_MEDIA_SLOTS[key];
      const tags = slot.expectedTags.filter((t) => t !== '#curated');
      if (slot.videoUrl !== undefined) {
        const videoId = youtubeId(slot.videoUrl);
        const { mediaId } = insertCuratorUrlReference(db, {
          uploaderMemberId: fhId,
          curatedRoot,
          category: 'site_videos',
          primarySlug: key,
          videoUrl: slot.videoUrl,
          videoPlatform: 'youtube',
          videoId,
          caption: `seeded ${key}`,
          tags,
        });
        mediaIdOf.set(key, mediaId);
        marker.set(key, `youtube-nocookie.com/embed/${videoId}`);
      } else {
        const mediaId = insertCuratorVideo(db, {
          uploaderMemberId: fhId,
          sourceFilename: slot.sourceFilename,
          slotTag: tags[0],
          caption: `seeded ${key}`,
        });
        mediaIdOf.set(key, mediaId);
        marker.set(key, `${mediaId}-video.mp4`);
      }
    }
  } finally {
    db.close();
  }
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  removeScratch(curatedRoot);
});

describe('section landings with their slot media stored', () => {
  // Defect caught: a landing page leaves out a featured video whose curated
  // item is stored, or plays something other than that item.
  it('play each slot\'s stored item on its own page', async () => {
    const app = createApp();
    for (const [path, keys] of Object.entries(PAGE_SLOTS)) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(200);
      for (const key of keys) expect(res.text, `${path} ${key}`).toContain(marker.get(key));
    }
  });

  // Defect caught: a featured video carries no hashtag a visitor browses by,
  // so browsing media by its sport never lists it.
  it('list each slot\'s item when browsing media by the slot\'s first tag', async () => {
    const app = createApp();
    for (const key of Object.values(PAGE_SLOTS).flat()) {
      const tag = SITE_MEDIA_SLOTS[key].expectedTags.find((t) => t !== '#curated')!;
      const res = await request(app).get(`/media/browse?tag=${encodeURIComponent(tag.slice(1))}`);
      expect(res.status, tag).toBe(200);
      expect(res.text, `${key} under ${tag}`).toContain(mediaIdOf.get(key));
    }
  });
});
