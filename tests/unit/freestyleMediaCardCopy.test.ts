/**
 * Every Freestyle Media card describes the collection it is labelled as.
 *
 * The page composes each card from two sources: the label comes from the
 * structure module, which may rename a gallery for the page, and the
 * description comes from the gallery's own committed sidecar. That split is
 * what let the Records card carry a definition of the word "passback" instead
 * of a description of the records collection: the gallery is named "Passback
 * World Records", the page relabelled it "Freestyle Records", and its
 * description explained the jargon rather than the footage.
 *
 * These assertions read the committed sidecars, which is where the copy lives,
 * so a description that drifts away from its card's subject is caught before it
 * reaches a rebuild. They pin subject agreement, not wording.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FREESTYLE_MEDIA_STRUCTURE } from '../../src/content/freestyleMedia';

interface GallerySidecar {
  id: string;
  name: string;
  description: string;
}

const cards = FREESTYLE_MEDIA_STRUCTURE.flatMap(section =>
  section.folders.map(folder => ({ ...folder, heading: section.heading })),
);

function sidecarFor(galleryId: string): GallerySidecar | null {
  const path = join(process.cwd(), 'curated/galleries', `${galleryId.replace(/^gallery_/, '')}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as GallerySidecar) : null;
}

describe('Freestyle Media cards', () => {
  it('every card resolves to a committed gallery sidecar', () => {
    const missing = cards.filter(c => sidecarFor(c.galleryId) === null).map(c => c.label);
    expect(missing).toEqual([]);
  });

  it('every card carries a description', () => {
    const empty = cards
      .filter(c => (sidecarFor(c.galleryId)?.description ?? '').trim().length === 0)
      .map(c => c.label);
    expect(empty).toEqual([]);
  });

  it('the Records card describes the records collection, not the word passback', () => {
    const records = cards.find(c => c.label === 'Freestyle Records');
    expect(records, 'the Freestyle Records card is gone').toBeDefined();
    const description = sidecarFor(records!.galleryId)!.description;

    expect(/record/i.test(description), `records card description: ${description}`).toBe(true);
    // The defect shape: a description whose whole subject is the jargon term.
    expect(/^passback is freestyle jargon/i.test(description)).toBe(false);
  });

  it('no card description opens by defining a term instead of describing the collection', () => {
    // A description that begins "X is freestyle jargon for" is defining a word,
    // which is the glossary's job and not a card's.
    const defining = cards
      .map(c => ({ label: c.label, description: sidecarFor(c.galleryId)?.description ?? '' }))
      .filter(c => /is freestyle jargon for/i.test(c.description))
      .map(c => c.label);
    expect(defining).toEqual([]);
  });

  it('no two cards share a description', () => {
    // A crosswire between siblings shows up as the same copy under two labels.
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const c of cards) {
      const description = sidecarFor(c.galleryId)?.description ?? '';
      if (description === '') continue;
      const prior = seen.get(description);
      if (prior) collisions.push(`${prior} / ${c.label}`);
      else seen.set(description, c.label);
    }
    expect(collisions).toEqual([]);
  });
});
