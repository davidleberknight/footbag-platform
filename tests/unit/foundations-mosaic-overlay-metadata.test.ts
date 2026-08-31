/**
 * All twelve Foundations of Freestyle clips must carry the metadata that drives
 * the caption correction: the '#foundations' tag (which selects the mask on both
 * the gallery tile and the detail viewer) and a clean caption (the canonical
 * trick name rendered over the mask). If any clip loses the tag or the caption,
 * its obsolete burnt-in caption reappears uncorrected.
 *
 * Each clip also carries the trick it demonstrates. That is its semantic
 * identity, which every media item needs and which a collection tag cannot
 * supply: '#foundations' says which set a clip belongs to, never what it shows.
 * It is also what makes the clip reachable from the move it demonstrates.
 *
 * These are the committed curator sidecars seeded into the media records; the
 * source video files themselves are immutable and are not read here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { join } from 'node:path';
import { TRICKS_MOSAIC } from '../../src/content/freestyleTricksMosaic';

const SITE_DIR = join(process.cwd(), 'curated/site');
const sidecars = readdirSync(SITE_DIR).filter((f) => /^mosaic-.*\.meta\.json$/.test(f));
const clips = readdirSync(SITE_DIR).filter((f) => /^mosaic-.*\.mp4$/.test(f));

const ffprobeAvailable =
  spawnSync('ffprobe', ['-version'], { encoding: 'utf8', ...SPAWN_GUARD }).status === 0;

function clipDimensions(mp4: string): { w: number; h: number } | null {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0', join(SITE_DIR, mp4)],
    { encoding: 'utf8', ...SPAWN_GUARD },
  );
  if (r.status !== 0 || !r.stdout) return null;
  const [w, h] = r.stdout.trim().split(',').map(Number);
  return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null;
}

describe('Foundations of Freestyle mosaic overlay metadata', () => {
  it('covers exactly the twelve foundational clips', () => {
    expect(sidecars.length).toBe(12);
  });

  for (const file of sidecars) {
    it(`${file} carries #foundations and a caption for the correction overlay`, () => {
      const meta = JSON.parse(readFileSync(join(SITE_DIR, file), 'utf8')) as {
        tags?: string[];
        caption?: string;
      };
      expect(meta.tags ?? [], `${file} tags`).toContain('#foundations');
      expect(typeof meta.caption, `${file} caption`).toBe('string');
      expect((meta.caption ?? '').trim().length, `${file} caption non-empty`).toBeGreaterThan(0);
    });

    it(`${file} names the trick it shows`, () => {
      // Derived from the clip's own filename and checked against the mosaic's
      // atom list, so a sidecar cannot be tagged for a move it does not show.
      const meta = JSON.parse(readFileSync(join(SITE_DIR, file), 'utf8')) as { tags?: string[] };
      const slug = file.replace(/^mosaic-/, '').replace(/\.meta\.json$/, '').replace(/-/g, '_');
      expect(TRICKS_MOSAIC.map((a) => a.slug), `${file} is a mosaic atom`).toContain(slug);
      expect(meta.tags ?? [], `${file} trick tag`).toContain(`#${slug}`);
    });
  }

  it('leaves no clip tagged by the layout slot it used to sit in', () => {
    // The tag it replaced named this page's mosaic position rather than what the
    // clip shows, and it reached visitors as a hashtag saying so.
    for (const file of sidecars) {
      const meta = JSON.parse(readFileSync(join(SITE_DIR, file), 'utf8')) as { tags?: string[] };
      expect(meta.tags ?? [], `${file} tags`).not.toContain('#demo_mosaic');
    }
  });
});

// The detail viewer pins the corrected clip to a 1:1 frame. That is only correct
// because the source clips are authoritatively square; assert it against the real
// files so the geometry is derived from the media, not a hardcoded guess. Gated
// on ffprobe (the project's media toolchain); it runs wherever ffmpeg is present.
describe('Foundations mosaic source clips are square (the 1:1 detail frame is authoritative)', () => {
  it('has a clip for each of the twelve sidecars', () => {
    expect(clips.length).toBe(12);
  });

  for (const mp4 of clips) {
    it.skipIf(!ffprobeAvailable)(`${mp4} is square (width === height)`, () => {
      const d = clipDimensions(mp4);
      expect(d, `${mp4} dimensions`).not.toBeNull();
      expect(d!.w).toBe(d!.h);
    });
  }
});
