/**
 * Tag conventions the committed curated-media sidecars hold.
 *
 * A `#by_<slug>` tag is the uploader marker the system applies to member
 * uploads; a curated sidecar never writes one, because a curated clip credits
 * the person in it only through `#player_<slug>`.
 *
 * These read the committed sidecars on disk; the seeder and the post-load
 * invariant see the same files only after a database rebuild.
 */
import { describe, it, expect } from 'vitest';

import { scanSource } from '../fixtures/sourceTree';

describe('curated media sidecars', () => {
  // Defect caught: a curated clip shows a visitor an uploader hashtag for an
  // account that never uploaded it, crediting a channel rather than the player.
  it('never carry a system uploader tag', () => {
    const sidecars = scanSource('"#by_', { roots: ['curated'], exts: ['.json'] });
    expect(sidecars).toEqual([]);
  });
});
