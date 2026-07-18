/**
 * Unit tests for buildStructuralRelatives and the outside-source notes.
 *
 * The structural-relatives engine ranks "similar tricks" by real structure
 * (same base, same family or terminal, established-operator overlap, or a
 * one-operator delta), applies a minimum-relationship threshold so unrelated
 * tricks are never listed to pad a count, excludes self / operators / modifiers /
 * pending rows, and lets a structurally exceptional page pin curated relatives.
 * The two named 8-ADD frontier compounds (Carousel and Big Apple Sauce) must
 * receive useful, valid relatives, and an outside-source name that the platform
 * does not adopt appears only as a labelled note.
 */
import { describe, it, expect } from 'vitest';
import { FreestyleTrickRow } from '../../src/db/db';
import {
  buildStructuralRelatives,
  buildStructuralAbout,
  observationalNotesFor,
} from '../../src/services/freestyleRelatedTricks';
import { getCompoundSemanticDescription } from '../../src/content/freestyleSemanticOverrides';

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
  } as unknown as FreestyleTrickRow;
}

// Carousel + its curated relatives, and Big Apple Sauce + its curated relatives.
const CAROUSEL = 'surging_ducking_paradox_symposium_whirling_rake';
const carousel      = row(CAROUSEL, '8', 'compound', 'rake', 'rake');
const pswRake       = row('paradox_symposium_whirling_rake', '5', 'compound', 'rake', 'rake');
const sdpTorque     = row('surging_ducking_paradox_torque', '8', 'compound', 'torque', 'torque');
const bigAppleSauce = row('big_apple_sauce', '8', 'compound', 'torque', 'torque');
const smsTorque     = row('spinning_miraging_symposium_torque', '7', 'compound', 'symposium_torque', 'osis');

const ALL = [carousel, pswRake, sdpTorque, bigAppleSauce, smsTorque];

describe('buildStructuralRelatives — curated overrides for frontier compounds', () => {
  it('Carousel receives its curated Rake-terminal and cross-frontier relatives', () => {
    const rels = buildStructuralRelatives(carousel, ALL, []);
    const slugs = rels.map(r => r.slug);
    expect(slugs).toContain('paradox_symposium_whirling_rake');
    expect(slugs).toContain('surging_ducking_paradox_torque');
    expect(slugs).not.toContain(CAROUSEL); // never itself
    // Each carries a plain-words reason and a canonical detail URL.
    for (const r of rels) {
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.detailHref).toBe(`/freestyle/tricks/${r.slug}`);
    }
    const psw = rels.find(r => r.slug === 'paradox_symposium_whirling_rake');
    expect(psw!.reason).toMatch(/Whirling Rake terminal/i);
  });

  it('Big Apple Sauce receives its curated Torque-family relatives', () => {
    const rels = buildStructuralRelatives(bigAppleSauce, ALL, []);
    const slugs = rels.map(r => r.slug);
    expect(slugs).toContain('surging_ducking_paradox_torque');
    expect(slugs).toContain('spinning_miraging_symposium_torque');
    expect(slugs).not.toContain('big_apple_sauce');
    expect(rels.every(r => r.reason.length > 0)).toBe(true);
  });

  it('drops a curated target that is not an active row rather than fabricating it', () => {
    // Only Carousel + one of its two curated targets are present.
    const rels = buildStructuralRelatives(carousel, [carousel, pswRake], []);
    expect(rels.map(r => r.slug)).toEqual(['paradox_symposium_whirling_rake']);
  });

  it('surfaces the labelled outside-source note for Carousel, and none for an ordinary trick', () => {
    const notes = observationalNotesFor(CAROUSEL);
    expect(notes.length).toBe(1);
    expect(notes[0].name).toMatch(/Blender/i);
    expect(notes[0].note).toMatch(/Cheese Processor/i);
    expect(observationalNotesFor('paradox_symposium_whirling_rake')).toEqual([]);
  });
});

describe('buildStructuralRelatives — ranked engine for ordinary pages', () => {
  const current = row('spinning_whirl', '3', 'compound', 'whirl', 'whirl');
  const gyroWhirl = row('gyro_whirl', '4', 'compound', 'whirl', 'whirl');     // same base
  const unrelated = row('head_stall', '2', 'surface', 'head_stall', 'head_stall'); // no relation
  const modifier  = row('spinning', '1', 'modifier', 'spinning', 'spinning'); // modifier kind
  const operator  = row('atomic', '1', 'set', 'atomic', 'atomic');            // operator kind
  const pending   = row('surging', '2', 'compound', 'surging', 'surging');    // pending-review kind
  const rows = [current, gyroWhirl, unrelated, modifier, operator, pending];
  const links = [{ trick_slug: 'spinning_whirl', modifier_slug: 'spinning' }];

  it('ranks a same-base sibling with a plain-words reason', () => {
    const rels = buildStructuralRelatives(current, rows, links);
    const gyro = rels.find(r => r.slug === 'gyro_whirl');
    expect(gyro).toBeDefined();
    expect(gyro!.reason).toMatch(/base/i);
  });

  it('excludes self, unrelated tricks, modifiers, operators, and pending rows', () => {
    const slugs = buildStructuralRelatives(current, rows, links).map(r => r.slug);
    expect(slugs).not.toContain('spinning_whirl'); // self
    expect(slugs).not.toContain('head_stall');     // below threshold
    expect(slugs).not.toContain('spinning');       // modifier
    expect(slugs).not.toContain('atomic');         // operator
    expect(slugs).not.toContain('surging');        // pending-review
  });

  it('does not pad to a fixed count when only one relative qualifies', () => {
    const rels = buildStructuralRelatives(current, rows, links);
    expect(rels.length).toBe(1);
  });

  it('returns an empty list when nothing meets the threshold', () => {
    const lonely = row('sole_stall', '2', 'surface', 'sole_stall', 'sole_stall');
    const rels = buildStructuralRelatives(lonely, [lonely, unrelated], []);
    expect(rels).toEqual([]);
  });

  it('rejects a weak operator-overlap-only candidate below the threshold', () => {
    // Shares exactly one operator, different base and family: not a relative.
    const cur  = row('a_x', '2', 'compound', 'aa', 'fa');
    const weak = row('b_x', '2', 'compound', 'bb', 'fb');
    const links = [
      { trick_slug: 'a_x', modifier_slug: 'x' },
      { trick_slug: 'b_x', modifier_slug: 'x' },
    ];
    expect(buildStructuralRelatives(cur, [cur, weak], links)).toEqual([]);
  });

  it('rejects a spurious one-operator match when the ADD gap is too large for one operator', () => {
    // Same family, one link-set difference, but a 3-ADD gap: the link data is
    // incomplete, so the "one operator" claim would be misleading.
    const cur  = row('spin_whirl', '2', 'compound', 'whirl_a', 'whirl');
    const far  = row('pixie_paradon', '5', 'compound', 'whirl_b', 'whirl');
    const links = [
      { trick_slug: 'spin_whirl', modifier_slug: 'spinning' },
      { trick_slug: 'pixie_paradon', modifier_slug: 'spinning' },
      { trick_slug: 'pixie_paradon', modifier_slug: 'pixie' },
    ];
    // shared spinning, one extra (pixie) => symDiff 1, but ADD gap 3 => rejected
    // from the one-operator tier; same-family still applies as a weaker reason.
    const rels = buildStructuralRelatives(cur, [cur, far], links);
    const match = rels.find(r => r.slug === 'pixie_paradon');
    expect(match?.reason ?? '').not.toMatch(/One operator/);
  });

  it('produces each reason category with an accurate label', () => {
    const cur          = row('cur',  '3', 'compound', 'base_a', 'fam_x');  // mods p,q
    const sameBaseOne  = row('sib1', '4', 'compound', 'base_a', 'fam_x');  // same base, +1 op (r)
    const sameBaseMany = row('sib2', '6', 'compound', 'base_a', 'fam_x');  // same base, +3 ops
    const familyOnly   = row('famonly', '9', 'compound', 'base_c', 'fam_x'); // same family, other base
    const overlap      = row('ovl', '5', 'compound', 'base_d', 'fam_z');   // 2 shared ops, other base+family
    const links = [
      { trick_slug: 'cur', modifier_slug: 'p' }, { trick_slug: 'cur', modifier_slug: 'q' },
      { trick_slug: 'sib1', modifier_slug: 'p' }, { trick_slug: 'sib1', modifier_slug: 'q' }, { trick_slug: 'sib1', modifier_slug: 'r' },
      { trick_slug: 'sib2', modifier_slug: 'p' }, { trick_slug: 'sib2', modifier_slug: 'q' }, { trick_slug: 'sib2', modifier_slug: 'r' }, { trick_slug: 'sib2', modifier_slug: 's' }, { trick_slug: 'sib2', modifier_slug: 't' },
      { trick_slug: 'famonly', modifier_slug: 'a' }, { trick_slug: 'famonly', modifier_slug: 'b' }, { trick_slug: 'famonly', modifier_slug: 'c' },
      { trick_slug: 'ovl', modifier_slug: 'p' }, { trick_slug: 'ovl', modifier_slug: 'q' }, { trick_slug: 'ovl', modifier_slug: 'w1' }, { trick_slug: 'ovl', modifier_slug: 'w2' },
    ];
    const rels = buildStructuralRelatives(cur, [cur, sameBaseOne, sameBaseMany, familyOnly, overlap], links);
    const by = (slug: string) => rels.find(r => r.slug === slug)?.reason ?? '';
    // A one-operator delta is only claimed on the same base.
    expect(by('sib1')).toMatch(/same .* base, one operator more: r/i);
    expect(by('sib2')).toMatch(/same .* base, more operators/i);
    expect(by('famonly')).toMatch(/family/i);
    expect(by('ovl')).toMatch(/^Shares/);
  });

  it('never reads two family-less tricks as "Same family"', () => {
    // Both have an empty trick_family (the Blink case); one has no base either.
    const a = row('fa', '2', 'compound', '', '');
    const b = row('fb', '5', 'compound', 'paradon', '');
    const links = [{ trick_slug: 'fa', modifier_slug: 'x' }, { trick_slug: 'fb', modifier_slug: 'y' }];
    expect(buildStructuralRelatives(a, [a, b], links)).toEqual([]);
  });
});

describe('buildStructuralAbout — high-confidence fallback only', () => {
  const established = (op: string) => op === 'spinning';
  const whirl = row('whirl', '1', 'core', 'whirl', 'whirl');

  it('generates a one-line reading for a single established-operator compound', () => {
    const cur = row('spinning_whirl', '2', 'compound', 'whirl', 'whirl');
    const links = [{ trick_slug: 'spinning_whirl', modifier_slug: 'spinning' }];
    expect(buildStructuralAbout(cur, [cur, whirl], links, established))
      .toBe('Spinning Whirl builds on Whirl, adding the spinning operator.');
  });

  it('suppresses when the base is missing', () => {
    const cur = row('spinning_ghost', '2', 'compound', 'ghost', 'ghost');
    const links = [{ trick_slug: 'spinning_ghost', modifier_slug: 'spinning' }];
    expect(buildStructuralAbout(cur, [cur], links, established)).toBeNull();
  });

  it('suppresses when the added operator is unresolved', () => {
    const cur = row('muted_whirl', '2', 'compound', 'whirl', 'whirl');
    const links = [{ trick_slug: 'muted_whirl', modifier_slug: 'muted' }];
    expect(buildStructuralAbout(cur, [cur, whirl], links, established)).toBeNull();
  });

  it('suppresses a multi-operator (multi-phase) stack', () => {
    const cur = row('spinning_gyro_whirl', '3', 'compound', 'whirl', 'whirl');
    const links = [
      { trick_slug: 'spinning_gyro_whirl', modifier_slug: 'spinning' },
      { trick_slug: 'spinning_gyro_whirl', modifier_slug: 'gyro' },
    ];
    expect(buildStructuralAbout(cur, [cur, whirl], links, established)).toBeNull();
  });

  it('suppresses a tautological sentence that would repeat the trick name', () => {
    const base = { ...row('base_x', '1', 'core', 'base_x', 'fam'), canonical_name: 'whirl' } as typeof whirl;
    const cur  = { ...row('other', '2', 'compound', 'base_x', 'fam'), canonical_name: 'whirl' } as typeof whirl;
    const links = [{ trick_slug: 'other', modifier_slug: 'spinning' }];
    expect(buildStructuralAbout(cur, [cur, base], links, established)).toBeNull();
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
