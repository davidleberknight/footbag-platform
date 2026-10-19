/**
 * Tag conventions the committed curated-media sidecars hold.
 *
 * A `#by_<slug>` tag is the uploader marker the system applies to member
 * uploads; a curated sidecar never writes one, because a curated clip credits
 * the person in it only through `#player_<slug>`. And a clip's content type
 * (`#tutorial`, `#demo`, `#record`) says what trick media is for, so on the trick
 * clips it travels with the `#trick` marker: a clip in the trick-media folders
 * that carries a content type without that marker is either trick media missing
 * its marker, or a clip naming no trick that should carry no content type.
 *
 * These read the committed sidecars on disk; the seeder and the post-load
 * invariant see the same files only after a database rebuild.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, listFiles, scanSource } from '../fixtures/sourceTree';

const CONTENT_TYPES = ['#tutorial', '#demo', '#record'];

// The folders whose sidecars are trick media: the per-trick clips and the
// landing-page foundations mosaic. Concept and set lessons live elsewhere and
// may carry a content type with no trick.
const TRICK_MEDIA_DIRS = ['curated/freestyle_tricks', 'curated/site'];

function tagsOf(relPath: string): string[] {
  const meta = JSON.parse(readFileSync(join(REPO_ROOT, relPath), 'utf8')) as { tags?: string[] };
  return (meta.tags ?? []).map((t) => t.toLowerCase());
}

describe('curated media sidecars', () => {
  // Defect caught: a curated clip shows a visitor an uploader hashtag for an
  // account that never uploaded it, crediting a channel rather than the player.
  it('never carry a system uploader tag', () => {
    const sidecars = scanSource('"#by_', { roots: ['curated'], exts: ['.json'] });
    expect(sidecars).toEqual([]);
  });

  // Defect caught: a trick clip lacks the trick-media marker and drops out of
  // the listings that select on it, or a clip naming no trick is labelled as a
  // demonstration of one.
  it('in the trick-media folders, carry #trick wherever they carry a content type', () => {
    let typed = 0;
    const offenders: string[] = [];
    for (const dir of TRICK_MEDIA_DIRS) {
      for (const file of listFiles(dir, /\.meta\.json$/)) {
        const tags = tagsOf(`${dir}/${file}`);
        if (!tags.some((t) => CONTENT_TYPES.includes(t))) continue;
        typed++;
        if (!tags.includes('#trick')) offenders.push(`${dir}/${file}`);
      }
    }
    // Positive control: the folders hold typed trick clips at all, so a renamed
    // folder or an emptied listing cannot pass by checking nothing.
    expect(typed).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
