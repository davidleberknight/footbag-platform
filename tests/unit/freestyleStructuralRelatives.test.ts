/**
 * Unit tests for a trick page's closest relatives and its outside-source notes.
 *
 * Closest relatives are only the tricks a curator related to the trick:
 * curated movement neighbours, curated structural relatives and the stored
 * reverse pair, at most six. A shared base, a family label or shared operators
 * never make a relative; a modifier, set or under-review row is never one; and
 * a trick the page lists elsewhere is never listed again. The two named 8-ADD
 * frontier compounds (Carousel and Big Apple Sauce) receive their curated
 * relatives, and an outside-source name the platform does not adopt appears
 * only as a labelled note.
 */
import { describe, it, expect } from 'vitest';
import { FreestyleTrickRow } from '../../src/db/db';
import {
  buildClosestRelatives,
  observationalNotesFor,
} from '../../src/services/freestyleRelatedTricks';
import { COMPOUND_SEMANTIC_DESCRIPTIONS } from '../../freestyle/inputs/curator_content/freestyleSemanticOverridesData';

const getCompoundSemanticDescription = (slug: string): string | null =>
  COMPOUND_SEMANTIC_DESCRIPTIONS.get(slug) ?? null;

function row(
  slug: string,
  adds: string,
  category: string,
  base_trick: string,
  trick_family: string,
): FreestyleTrickRow {
  return {
    slug,
    canonical_name: slug.replace(/_/g, ' '),
    adds,
    base_trick,
    trick_family,
    category,
    description:  null,
    aliases_json: null,
    notation:     null,
    sort_order:   0,
    trick_kind:   null,
    reverse_pair_base: null,
  } as unknown as FreestyleTrickRow;
}

const slugsOf = (list: readonly { slug: string }[]): string[] => list.map(r => r.slug);
const NONE = { neighbours: [], exclude: new Set<string>() };

// Carousel + its curated relatives, and Big Apple Sauce + its curated relatives.
const CAROUSEL = 'surging_ducking_paradox_symposium_whirling_rake';
const carousel      = row(CAROUSEL, '8', 'compound', 'rake', 'rake');
const pswRake       = row('paradox_symposium_whirling_rake', '5', 'compound', 'rake', 'rake');
const sdpTorque     = row('surging_ducking_paradox_torque', '8', 'compound', 'torque', 'torque');
const bigAppleSauce = row('big_apple_sauce', '8', 'compound', 'torque', 'torque');
// Carries the osis label and a public family override to Torque, as the real
// dictionary does.
const smsTorque     = { ...row('spinning_miraging_symposium_torque', '7', 'compound', 'symposium_torque', 'osis'), family_override: 'torque' };

const ALL = [carousel, pswRake, sdpTorque, bigAppleSauce, smsTorque];

describe('buildClosestRelatives — curated relatives for frontier compounds', () => {
  // Defect caught: a frontier compound whose useful neighbours are editorial
  // shows an empty or unrelated relatives list.
  it('Carousel receives its curated Rake-terminal and cross-frontier relatives, each linking its canonical page', () => {
    const rels = buildClosestRelatives(carousel, ALL, NONE);
    expect(slugsOf(rels)).toEqual(['paradox_symposium_whirling_rake', 'surging_ducking_paradox_torque']);
    for (const r of rels) expect(r.detailHref).toBe(`/freestyle/tricks/${r.slug}`);
  });

  // Defect caught: a same-family curated relative is dropped, leaving the page
  // with no named neighbours now that the page carries no family list.
  it('Big Apple Sauce lists both curated Torque-family relatives', () => {
    expect(slugsOf(buildClosestRelatives(bigAppleSauce, ALL, NONE)))
      .toEqual(['surging_ducking_paradox_torque', 'spinning_miraging_symposium_torque']);
  });

  it('drops a curated target that is not an active row rather than fabricating it', () => {
    // Only Carousel + one of its two curated targets are present.
    const rels = buildClosestRelatives(carousel, [carousel, pswRake], NONE);
    expect(slugsOf(rels)).toEqual(['paradox_symposium_whirling_rake']);
  });

  it('surfaces the labelled outside-source note for Carousel, and none for an ordinary trick', () => {
    const notes = observationalNotesFor(CAROUSEL);
    expect(notes.length).toBe(1);
    expect(notes[0].name).toMatch(/Blender/i);
    expect(notes[0].note).toMatch(/Cheese Processor/i);
    expect(observationalNotesFor('paradox_symposium_whirling_rake')).toEqual([]);
  });
});

describe('buildClosestRelatives — only what a curator related', () => {
  // Defect caught: the relatives list grows back into a family list, through a
  // shared base, a shared family label or shared operators.
  it('never lists a trick that only shares a base or a family with this one', () => {
    const cur      = row('cur', '3', 'compound', 'base_a', 'fam_x');
    const sameBase = row('same_base', '4', 'compound', 'base_a', 'fam_x');
    const famOnly  = row('fam_only', '4', 'compound', 'base_c', 'fam_x');
    expect(buildClosestRelatives(cur, [cur, sameBase, famOnly], NONE)).toEqual([]);
  });

  // Defect caught: a reversed trick and the trick it reverses do not point at
  // each other, although a curator stored the pair.
  it('lists the stored reverse pair in both directions', () => {
    const whirl    = row('whirl', '3', 'dex', 'whirl', 'whirl');
    const revWhirl = { ...row('rev_whirl', '3', 'dex', 'rev_whirl', 'rev_whirl'), reverse_pair_base: 'whirl' };
    expect(slugsOf(buildClosestRelatives(revWhirl, [whirl, revWhirl], NONE))).toEqual(['whirl']);
    expect(slugsOf(buildClosestRelatives(whirl, [whirl, revWhirl], NONE))).toEqual(['rev_whirl']);
  });

  // Defect caught: a modifier, set or under-review row is linked as if it were
  // a trick, so the link redirects or leads to a held-back row.
  it('never lists a modifier, set or under-review row, even as a curated neighbour', () => {
    const cur      = row('cur', '2', 'compound', 'cur', 'cur');
    const modifier = row('spinning', '1', 'modifier', 'spinning', 'spinning');
    const set      = row('atomic', '1', 'set', 'atomic', 'atomic');
    const pending  = { ...row('held', '3', 'compound', 'held', 'held'), trick_kind: 'pending-review' };
    const real     = row('real', '2', 'compound', 'real', 'real');
    const rels = buildClosestRelatives(cur, [cur, modifier, set, pending, real], {
      neighbours: ['spinning', 'atomic', 'held', 'real'].map(slug => ({ slug, reason: 'Movement neighbour' })),
      exclude:    new Set(),
    });
    expect(slugsOf(rels)).toEqual(['real']);
  });

  // Defect caught: the curated neighbours, which a curator ordered, lose their
  // order or fall behind the reverse pair.
  it('keeps curated neighbours first, in the order given, then the reverse pair', () => {
    const cur = { ...row('cur', '2', 'dex', 'cur', 'cur'), reverse_pair_base: 'rev' };
    const rev = row('rev', '2', 'dex', 'rev', 'rev');
    const b   = row('b', '1', 'body', 'b', 'b');
    const a   = row('a', '1', 'body', 'a', 'a');
    const rels = buildClosestRelatives(cur, [cur, rev, a, b], {
      neighbours: [{ slug: 'b', reason: 'Movement neighbour' }, { slug: 'a', reason: 'Movement neighbour' }],
      exclude:    new Set(),
    });
    expect(slugsOf(rels)).toEqual(['b', 'a', 'rev']);
  });

  // Defect caught: a trick named in another relationship list on the page is
  // listed again here, so two sections repeat one another.
  it('never lists a trick the caller excludes', () => {
    const cur = row('cur', '2', 'dex', 'cur', 'cur');
    const nb  = row('nb', '2', 'dex', 'nb', 'nb');
    expect(buildClosestRelatives(cur, [cur, nb], {
      neighbours: [{ slug: 'nb', reason: 'Movement neighbour' }], exclude: new Set(['nb']),
    })).toEqual([]);
  });

  // Defect caught: a long curated neighbourhood turns the list into a dump.
  it('stops at six relatives however many are curated', () => {
    const cur = row('cur', '2', 'dex', 'cur', 'cur');
    const many = Array.from({ length: 9 }, (_, i) => row(`n${i}`, '2', 'dex', `n${i}`, `n${i}`));
    const rels = buildClosestRelatives(cur, [cur, ...many], {
      neighbours: many.map(r => ({ slug: r.slug, reason: 'Movement neighbour' })), exclude: new Set(),
    });
    expect(rels).toHaveLength(6);
  });
});

describe('curated About copy — exact rendered text for the named frontier compounds', () => {
  it('Carousel curated About matches the approved wording', () => {
    expect(getCompoundSemanticDescription('surging_ducking_paradox_symposium_whirling_rake')).toBe(
      'Carousel is a frontier compound built around a Rake terminal. A Surging entry leads into Ducking, followed by the Paradox, Symposium, and Whirling structure that sets up the final swing-to-toe Rake finish. It is one of the deepest Rake-terminal structures in the vocabulary.',
    );
  });
  it('Big Apple Sauce curated About matches the approved wording and avoids miraging-reverse language', () => {
    const about = getCompoundSemanticDescription('big_apple_sauce')!;
    expect(about).toContain('spinning paradox entry');
    expect(about).toContain('no-plant inward dexterity');
    expect(about).toContain('Torque spin-to-clipper terminal');
    expect(about.toLowerCase()).not.toContain('miraging reverse');
  });
});
