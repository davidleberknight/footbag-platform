/**
 * What a curated trick clip is for is carried by the clip, exactly once.
 *
 * This suite used to pin a source-id-to-tier registry: a map that decided a
 * clip's content type from where it came from. That map said nothing the source
 * id did not, could not describe a clip differing from its source, and spent a
 * fourth meaning of a word already used here for membership tier, ADD tier and
 * display tier. Three tags replaced it, and tags are the only categorisation a
 * member sees.
 *
 * So the invariant moved with the concept. It is no longer "every in-use source
 * is registered in both maps" but "every curated trick clip carries exactly one
 * of #tutorial, #demo or #record" — a property of the data rather than of a
 * lookup table, which is why it is derived from the committed sidecars rather
 * than from a hand-written list that can drift the way the map did.
 *
 * The friendly-label registry stays and is still checked: a display name is a
 * genuine property of a source, unlike its content type.
 *
 * The individual-shred gallery is a separate media domain: a shred routine is
 * not trick media and carries none of the three. That is asserted rather than
 * skipped, because "no content-type tag" is the ruling for those clips and a
 * tag appearing there would mean the domains had been confused.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { SOURCE_LABELS } from '../../src/services/freestyleService';

const CURATED_ROOT = path.join(__dirname, '../../curated');
const CONTENT_TYPE_TAGS = ['#tutorial', '#demo', '#record'] as const;

interface Sidecar { file: string; sourceId: string | null; tags: string[]; tier?: unknown }

function sidecarsIn(dirFilter: (dir: string) => boolean): Sidecar[] {
  const out: Sidecar[] = [];
  for (const dir of readdirSync(CURATED_ROOT)) {
    if (!dirFilter(dir)) continue;
    const full = path.join(CURATED_ROOT, dir);
    if (!existsSync(full)) continue;
    for (const file of readdirSync(full)) {
      if (!file.endsWith('.meta.json')) continue;
      const raw = JSON.parse(readFileSync(path.join(full, file), 'utf8')) as Record<string, unknown>;
      out.push({
        file: `${dir}/${file}`,
        sourceId: (raw.sourceId as string | undefined) ?? null,
        tags: (raw.tags as string[] | undefined) ?? [],
        tier: raw.tier,
      });
    }
  }
  return out;
}

const trickMedia = () => sidecarsIn((dir) => dir.startsWith('freestyle_'));
const shredMedia = () => sidecarsIn((dir) => dir === 'individual_shred');

describe('every curated trick clip carries exactly one content type', () => {
  it('finds curated trick sidecars to check at all', () => {
    // A filter that matched nothing would make every assertion below vacuous.
    expect(trickMedia().length).toBeGreaterThan(100);
  });

  it('carries one of tutorial, demo or record, never none and never two', () => {
    const wrong = trickMedia()
      .map((s) => ({ file: s.file, found: s.tags.filter((t) => (CONTENT_TYPE_TAGS as readonly string[]).includes(t)) }))
      .filter(({ found }) => found.length !== 1);
    expect(wrong, `${wrong.length} clip(s) do not carry exactly one content-type tag: `
      + `${wrong.slice(0, 5).map((w) => `${w.file} -> [${w.found.join(', ')}]`).join('; ')}`)
      .toEqual([]);
  });

  it('carries no leftover tier field', () => {
    // The field the tags replaced. One left behind would mean two authorities
    // for the same question, which is the state this work ended.
    const leftovers = trickMedia().filter((s) => s.tier !== undefined).map((s) => s.file);
    expect(leftovers, `${leftovers.length} sidecar(s) still carry a tier key`).toEqual([]);
  });
});

describe('a shred routine is not trick media', () => {
  it('finds the shred sidecars', () => {
    expect(shredMedia().length).toBeGreaterThan(50);
  });

  it('carries no content-type tag', () => {
    const tagged = shredMedia()
      .map((s) => ({ file: s.file, found: s.tags.filter((t) => (CONTENT_TYPE_TAGS as readonly string[]).includes(t)) }))
      .filter(({ found }) => found.length > 0);
    expect(tagged, 'a shred routine carries no content-type tag: it is a routine, not a '
      + 'clip of one trick').toEqual([]);
  });

  it('carries no tier field either', () => {
    const leftovers = shredMedia().filter((s) => s.tier !== undefined).map((s) => s.file);
    expect(leftovers).toEqual([]);
  });
});

describe('the source label registry', () => {
  // A display name is a real property of a source, unlike its content type.
  it('names every source in-use curated trick media actually carries', () => {
    const inUse = new Set(trickMedia().map((s) => s.sourceId).filter((k): k is string => !!k));
    expect(inUse.size).toBeGreaterThan(0);
    const unlabelled = [...inUse].filter((key) => !SOURCE_LABELS[key]);
    expect(unlabelled, `${unlabelled.length} in-use source(s) have no friendly label: `
      + `${unlabelled.join(', ')}`).toEqual([]);
  });

  it('keeps the labels it is relied on for', () => {
    expect(SOURCE_LABELS.tt_youtube).toBeTruthy();
    expect(SOURCE_LABELS.passback_tutorials).toBeTruthy();
    expect(SOURCE_LABELS.passback_records).toBeTruthy();
  });
});
