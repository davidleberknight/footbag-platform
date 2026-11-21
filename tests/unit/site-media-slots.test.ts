/**
 * Every video a page features in a fixed spot is a curated media item with
 * hashtags, found by browsing media like any other video. The site-media
 * registry says which tags each slot must carry; the committed curator sidecars
 * are what the seeder actually stores. The two are maintained independently, so
 * this holds them against each other: a slot whose sidecar is missing, or lost a
 * tag, would render a video that browsing never finds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, parse } from 'node:path';

import { REPO_ROOT, listFiles } from '../fixtures/sourceTree';
import { SITE_MEDIA_SLOTS, SiteMediaSlot } from '../../src/content/siteMedia';

interface SidecarJson { tags?: string[]; videoUrl?: string }

function readSidecar(relDir: string, file: string): SidecarJson {
  return JSON.parse(readFileSync(join(REPO_ROOT, relDir, file), 'utf8')) as SidecarJson;
}

const siteFiles = listFiles('curated/site');
const linkedSidecars = listFiles('curated/site_videos', /\.meta\.json$/).map((file) => ({
  file,
  body: readSidecar('curated/site_videos', file),
}));

// The tags the seeder will store for a slot: the sidecar's own plus the
// `#curated` it applies to every curator item.
function seededTags(slot: SiteMediaSlot): string[] | null {
  if (slot.videoUrl !== undefined) {
    const match = linkedSidecars.filter((s) => s.body.videoUrl === slot.videoUrl);
    if (match.length !== 1) return null;
    return ['#curated', ...(match[0].body.tags ?? [])];
  }
  const sidecar = `${parse(slot.sourceFilename).name}.meta.json`;
  if (!siteFiles.includes(slot.sourceFilename) || !siteFiles.includes(sidecar)) return null;
  return ['#curated', ...(readSidecar('curated/site', sidecar).tags ?? [])];
}

describe('fixed site media slots', () => {
  it('back every slot with exactly one committed curator item carrying the tags the slot expects', () => {
    for (const [key, slot] of Object.entries(SITE_MEDIA_SLOTS) as [string, SiteMediaSlot][]) {
      const tags = seededTags(slot);
      expect(tags, `${key}: no single committed sidecar (and binary) backs this slot`).not.toBeNull();
      const missing = slot.expectedTags.filter((t) => !tags!.includes(t));
      expect(missing, `${key}: sidecar lacks tags the slot expects`).toEqual([]);
    }
  });

  it('give every video slot a hashtag beyond the curator marker, so browsing can find it', () => {
    for (const [key, slot] of Object.entries(SITE_MEDIA_SLOTS) as [string, SiteMediaSlot][]) {
      if (slot.kind !== 'video') continue;
      const browsable = slot.expectedTags.filter((t) => t !== '#curated');
      expect(browsable.length, `${key}: expects no tag a visitor would browse by`).toBeGreaterThan(0);
    }
  });
});
