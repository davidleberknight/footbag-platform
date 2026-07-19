/**
 * Unit tests for buildRelatedTricks.
 *
 * Verifies the deterministic Related-Tricks selection contract:
 *   - R1 (same family) > R2 (modifier-prefix) > R3 (grandparent)
 *   - R3 gates on R1+R2 < 6 AND no duplicate
 *   - within each rule group, ADD-bucket round-robin sampling (low/mid/high mixed)
 *   - max 8 results total
 *   - public-surface invariant: modifier-category rows excluded
 */
import { describe, it, expect } from 'vitest';
import { FreestyleTrickRow } from '../../src/db/db';
import { buildRelatedTricks, buildNextTricks, buildPreviousTricks, buildRelativeSideVariants, operatorCrossLinkFor, baseAtomCrossLinkFor } from '../../src/services/freestyleRelatedTricks';

describe('atom <-> operator cross-links (bidirectional)', () => {
  it('maps each base atom to its operator', () => {
    expect(operatorCrossLinkFor('spin')).toBe('spinning');
    expect(operatorCrossLinkFor('whirl')).toBe('whirling');
    expect(operatorCrossLinkFor('swirl')).toBe('swirling');
    expect(operatorCrossLinkFor('mirage')).toBe('miraging');
    expect(operatorCrossLinkFor('illusion')).toBe('illusioning');
    expect(operatorCrossLinkFor('barrage')).toBe('barraging');
  });
  it('maps each operator back to its base atom (inverse)', () => {
    expect(baseAtomCrossLinkFor('spinning')).toBe('spin');
    expect(baseAtomCrossLinkFor('whirling')).toBe('whirl');
    expect(baseAtomCrossLinkFor('swirling')).toBe('swirl');
    expect(baseAtomCrossLinkFor('miraging')).toBe('mirage');
    expect(baseAtomCrossLinkFor('illusioning')).toBe('illusion');
    expect(baseAtomCrossLinkFor('barraging')).toBe('barrage');
  });
  it('returns null for concepts with no counterpart', () => {
    expect(operatorCrossLinkFor('butterfly')).toBeNull();
    expect(operatorCrossLinkFor('spinning')).toBeNull();
    expect(baseAtomCrossLinkFor('spin')).toBeNull();
    expect(baseAtomCrossLinkFor('ducking')).toBeNull();
  });
});

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
    description:    null,
    aliases_json:   null,
    notation:       null,
    sort_order:     0,
  };
}

// Fixture mirrors the live dictionary subset relevant to the worked
// examples (mirage / osis / whirl / atomic-torque), plus a modifier
// row to verify exclusion.
const FIXTURE: FreestyleTrickRow[] = [
  // mirage family
  row('mirage',          '2', 'dex',      'mirage', 'mirage'),
  row('paradox_mirage',  '3', 'compound', 'mirage', 'mirage'),
  row('smear',           '3', 'compound', 'mirage', 'mirage'),
  row('atom_smasher',    '4', 'compound', 'mirage', 'mirage'),
  row('blur',            '4', 'compound', 'mirage', 'mirage'),
  row('fury',            '4', 'compound', 'mirage', 'mirage'),

  // osis family
  row('osis',            '3', 'compound', 'osis',   'osis'),
  row('blender',         '4', 'compound', 'osis',   'osis'),
  row('ducking_osis',    '4', 'compound', 'osis',   'osis'),
  row('spinning_osis',   '4', 'compound', 'osis',   'osis'),
  row('stepping_osis',   '4', 'compound', 'osis',   'osis'),
  row('torque',          '4', 'compound', 'osis',   'osis'),
  row('barraging_osis',  '5', 'compound', 'osis',   'osis'),

  // torque family (grandchildren of osis via torque)
  row('paradox_torque',  '5', 'compound', 'torque', 'torque'),
  row('mobius',          '5', 'compound', 'torque', 'torque'),
  row('atomic_torque',   '6', 'compound', 'torque', 'torque'),
  row('blurry_torque',   '6', 'compound', 'torque', 'torque'),
  row('spinning_torque', '6', 'compound', 'torque', 'torque'),

  // whirl family — full set, will exercise the cap
  row('whirl',                    '3', 'dex',      'whirl', 'whirl'),
  row('rev_up',                   '3', 'dex',      'whirl', 'whirl'),
  row('rev_whirl',                '3', 'dex',      'whirl', 'whirl'),
  row('ducking_whirl',            '4', 'compound', 'whirl', 'whirl'),
  row('paradox_whirl',            '4', 'compound', 'whirl', 'whirl'),
  row('stepping_whirl',           '4', 'compound', 'whirl', 'whirl'),
  row('symposium_whirl',          '4', 'compound', 'whirl', 'whirl'),
  row('tapping_whirl',            '4', 'compound', 'whirl', 'whirl'),
  row('blurry_whirl',             '5', 'compound', 'whirl', 'whirl'),
  row('paradox_symposium_whirl',  '5', 'compound', 'whirl', 'whirl'),
  row('spinning_whirl',           '5', 'compound', 'whirl', 'whirl'),
  row('tomahawk',                 '5', 'compound', 'whirl', 'whirl'),
  row('spinning_symposium_whirl', '6', 'compound', 'whirl', 'whirl'),

  // butterfly family — only the atomic-prefix sibling needed for atomic-torque R2
  row('atomic_butterfly', '4', 'compound', 'butterfly', 'butterfly'),

  // cross-family modifier-prefix peers for paradox-mirage's R2
  row('paradox_blender', '5', 'compound', 'blender', 'blender'),
  row('paradox_drifter', '4', 'compound', 'drifter', 'drifter'),

  // ── illusion family + sparse-family compounds (avalanche / spike-hammer)
  // for R4 (parent base trick) testing. avalanche's trick_family is its
  // own base_trick (paradox-illusion), which means R1 finds zero
  // siblings; R3 finds the grandparent (illusion); R4 (new) finds the
  // direct parent (paradox-illusion).
  row('illusion',         '2', 'dex',      'illusion',         'illusion'),
  row('paradox_illusion', '3', 'compound', 'illusion',         'illusion'),
  row('avalanche',        '5', 'compound', 'paradox_illusion', 'paradox_illusion'),

  // ── airborne contact-surface primitives (self-families) + a `double-*`
  // multiplier compound. Exercises the R2 modifier-prefix allowlist (double is
  // a multiplier, not a modifier) and the explicit neighborhood overlay.
  row('double_knee',     '1', 'body',     'double_knee',    'double_knee'),
  row('flying_inside',   '1', 'body',     'flying_inside',  'flying_inside'),
  row('flying_outside',  '1', 'body',     'flying_outside', 'flying_outside'),
  row('flying_clipper',  '2', 'body',     'clipper',        'clipper'),
  row('double_leg_over', '3', 'compound', 'legover',        'legover'),

  // ── surface stalls (self-families) for the mutual stall-neighborhood overlay.
  row('toe_stall',     '1', 'surface', 'toe_stall',     'toe_stall'),
  row('inside_stall',  '1', 'surface', 'inside_stall',  'inside_stall'),
  row('clipper_stall', '2', 'surface', 'clipper_stall', 'clipper_stall'),
  row('head_stall',    '1', 'surface', 'head_stall',    'head_stall'),
  row('neck_stall',    '1', 'surface', 'neck_stall',    'neck_stall'),

  // modifier-category row that MUST be excluded from any related list
  row('paradox', 'modifier', 'modifier', 'paradox', 'paradox'),
];

function pick(slug: string): FreestyleTrickRow {
  const r = FIXTURE.find(x => x.slug === slug);
  if (!r) throw new Error(`fixture missing slug: ${slug}`);
  return r;
}

describe('buildRelatedTricks — modifier-prefix allowlist + neighborhood overlay', () => {
  it('does not prefix-match the non-modifier "double" across families', () => {
    // Under the old first-segment rule, double-leg-over pulled in every other
    // double-* slug (double-knee etc.); "double" is a multiplier, not a modifier.
    const slugs = buildRelatedTricks(pick('double_leg_over'), FIXTURE).map(r => r.slug);
    expect(slugs).not.toContain('double_knee');
  });

  it('double-knee surfaces its airborne contact neighbors, not unrelated double-* tricks', () => {
    const result = buildRelatedTricks(pick('double_knee'), FIXTURE);
    expect(result.map(r => `${r.rule}:${r.slug}`)).toEqual([
      'neighborhood:flying_inside',
      'neighborhood:flying_outside',
      'neighborhood:flying_clipper',
    ]);
  });

  it('foot stalls relate to each other as a neighborhood, not to body stalls', () => {
    const result = buildRelatedTricks(pick('toe_stall'), FIXTURE);
    expect(result.every(r => r.rule === 'neighborhood')).toBe(true);
    const slugs = result.map(r => r.slug);
    expect(slugs).toEqual(expect.arrayContaining(['inside_stall', 'clipper_stall']));
    expect(slugs).not.toContain('head_stall');
  });

  it('body stalls relate to each other, not across to the foot-stall group', () => {
    const slugs = buildRelatedTricks(pick('head_stall'), FIXTURE).map(r => r.slug);
    expect(slugs).toContain('neck_stall');
    expect(slugs).not.toContain('toe_stall');
  });
});

describe('buildRelatedTricks — worked examples', () => {
  it('mirage: 5 results, all R1, no cap', () => {
    const result = buildRelatedTricks(pick('mirage'), FIXTURE);
    expect(result.map(r => r.slug)).toEqual([
      'paradox_mirage', 'atom_smasher', 'smear', 'blur', 'fury',
    ]);
    expect(result.every(r => r.rule === 'family')).toBe(true);
  });

  it('whirl: 8 results capped, all R1, ADD-bucket round-robin', () => {
    const result = buildRelatedTricks(pick('whirl'), FIXTURE);
    expect(result.map(r => r.slug)).toEqual([
      'rev_up',
      'ducking_whirl',
      'blurry_whirl',
      'spinning_symposium_whirl',
      'rev_whirl',
      'paradox_whirl',
      'paradox_symposium_whirl',
      'stepping_whirl',
    ]);
    expect(result.every(r => r.rule === 'family')).toBe(true);
    expect(result.length).toBe(8);
  });

  it('atomic-torque: R1 → R2 → R3 → R4 ordering with R3/R4 both firing', () => {
    // 2026-05-26 polish: R4 (parent base trick) added. atomic-torque's
    // base_trick=torque is in the osis trick_family (not torque), so
    // R1 doesn't surface it; R4 now does.
    const result = buildRelatedTricks(pick('atomic_torque'), FIXTURE);
    expect(result.map(r => `${r.rule}:${r.slug}`)).toEqual([
      'family:mobius',
      'family:blurry_torque',
      'family:paradox_torque',
      'family:spinning_torque',
      'modifier-prefix:atomic_butterfly',
      'grandparent:osis',
      'parent:torque',
    ]);
  });
});

describe('buildRelatedTricks — rule contracts', () => {
  it('excludes modifier-category rows', () => {
    // current trick: paradox-mirage. Modifier 'paradox' has slug=paradox,
    // would match R2's "starts with paradox-" check on a hyphen split? No —
    // 'paradox' has no hyphen, so the prefix isn't "paradox-". But the
    // category=modifier filter must still exclude it from any other rule too.
    const result = buildRelatedTricks(pick('paradox_mirage'), FIXTURE);
    expect(result.find(r => r.slug === 'paradox')).toBeUndefined();
    expect(result.every(r => r.slug !== 'paradox')).toBe(true);
  });

  it('R3 gate: skips when R1+R2 >= 6', () => {
    // paradox-torque: R1 (family=torque) yields mobius/blurry-torque/atomic-torque/spinning-torque = 4
    // R2 (paradox- prefix, family != torque) yields paradox-mirage, paradox-blender, paradox-drifter,
    //    paradox-whirl, paradox-symposium-whirl = 5 → R1+R2 = 9 → R3 must be skipped
    const result = buildRelatedTricks(pick('paradox_torque'), FIXTURE);
    expect(result.find(r => r.rule === 'grandparent')).toBeUndefined();
    expect(result.length).toBe(8);  // capped
  });

  it('R3 contributes at most one result and only when not already included', () => {
    const result = buildRelatedTricks(pick('atomic_torque'), FIXTURE);
    const r3 = result.filter(r => r.rule === 'grandparent');
    expect(r3.length).toBe(1);
    expect(r3[0]!.slug).toBe('osis');
  });

  it('R4 (parent base trick): sparse-family compound surfaces both parent + grandparent', () => {
    // avalanche has trick_family = paradox-illusion (its own base_trick).
    // R1 (family=paradox-illusion) finds no other tricks (avalanche is the
    // only one in fixture). R3 finds the grandparent (illusion via
    // paradox-illusion → illusion). R4 finds the direct parent
    // (paradox-illusion). Pre-polish: 1 result; post-polish: 2 results.
    const result = buildRelatedTricks(pick('avalanche'), FIXTURE);
    expect(result.map(r => `${r.rule}:${r.slug}`)).toEqual([
      'grandparent:illusion',
      'parent:paradox_illusion',
    ]);
  });

  it('R4 does NOT duplicate when parent is already in R1 family list', () => {
    // For mirage-family compounds (paradox-mirage et al.) the parent is
    // already in the R1 result (same trick_family=mirage), so R4 must
    // skip to avoid duplication.
    const result = buildRelatedTricks(pick('atom_smasher'), FIXTURE);
    // atom-smasher's base_trick = mirage, same family. mirage IS in R1.
    // R4 should NOT add a second mirage entry.
    const mirageCount = result.filter(r => r.slug === 'mirage').length;
    expect(mirageCount).toBeLessThanOrEqual(1);
    // And the rule for mirage (if present) should be 'family', not 'parent'.
    const mirageEntry = result.find(r => r.slug === 'mirage');
    if (mirageEntry) expect(mirageEntry.rule).toBe('family');
  });

  it('hashtag derivation matches slugToHashtag (hyphens to underscores, # prefix)', () => {
    const result = buildRelatedTricks(pick('atomic_torque'), FIXTURE);
    const map = Object.fromEntries(result.map(r => [r.slug, r.hashtag]));
    expect(map['mobius']).toBe('#mobius');
    expect(map['atomic_butterfly']).toBe('#atomic_butterfly');
    expect(map['blurry_torque']).toBe('#blurry_torque');
    expect(map['osis']).toBe('#osis');
  });

  it('detailHref points to /freestyle/tricks/:slug', () => {
    const result = buildRelatedTricks(pick('mirage'), FIXTURE);
    expect(result[0]!.detailHref).toBe('/freestyle/tricks/paradox_mirage');
  });

  it('does not include the current trick in its own related list', () => {
    const result = buildRelatedTricks(pick('whirl'), FIXTURE);
    expect(result.find(r => r.slug === 'whirl')).toBeUndefined();
  });

  it('paradox-mirage: R1 + R2 mix, R1 first then R2', () => {
    const result = buildRelatedTricks(pick('paradox_mirage'), FIXTURE);
    // R1 family=mirage: mirage(2), smear(3), atom-smasher(4), blur(4), fury(4) = 5
    // R2 paradox-prefix, family != mirage: paradox-blender(5,blender), paradox-drifter(4,drifter) = 2
    //   (paradox-whirl etc. not in this fixture's R2 set; verified explicitly below)
    // R3 gate: R1+R2 = 7 >= 6 → R3 skipped (also no grandparent: mirage's base = mirage)
    const rules = result.map(r => r.rule);
    // R1 entries must all come before any R2 entry
    const lastFamilyIdx = rules.lastIndexOf('family');
    const firstPrefixIdx = rules.indexOf('modifier-prefix');
    expect(firstPrefixIdx).toBeGreaterThan(lastFamilyIdx);
    expect(result.find(r => r.rule === 'grandparent')).toBeUndefined();
  });

  it('returns empty when current row has no peers', () => {
    const lonely: FreestyleTrickRow = row('orphan', '1', 'dex', 'orphan', 'orphan');
    const result = buildRelatedTricks(lonely, [lonely]);
    expect(result).toEqual([]);
  });
});

describe('buildRelatedTricks — dex-kick group + kick/stall pairs (R0 overlay)', () => {
  // Local fixture: the seven 1-ADD dex-kicks plus the non-kick partners of the
  // four kick/stall counterpart pairs. Each kick sits in its own family/base,
  // so without the R0 neighborhood overlay nothing connects them.
  const KICKS: FreestyleTrickRow[] = [
    row('around_the_world_kick', '1', 'dex',      'around_the_world', 'around_the_world_kick'),
    row('pixie_kick',            '1', 'dex',      'pixie',            'pixie_kick'),
    row('fairy_kick',            '1', 'dex',      'fairy',            'fairy_kick'),
    row('orbit_kick',            '1', 'dex',      'orbit',            'orbit'),
    row('legover_kick',          '1', 'dex',      'legover',          'legover'),
    row('miraging_kick',         '1', 'dex',      'miraging_kick',    'miraging_kick'),
    row('illusioning_kick',      '1', 'dex',      'illusioning_kick', 'illusioning_kick'),
    row('clipper',               '1', 'body',     'clipper',          'clipper'),
    row('clipper_stall',         '2', 'surface',  'clipper_stall',    'clipper_stall'),
    row('around_the_world',      '2', 'dex',      'around_the_world', 'around_the_world'),
    row('mirage',                '2', 'dex',      'mirage',           'mirage'),
    row('butterfly',             '3', 'compound', 'butterfly',        'butterfly'),
    row('butterfly_kick',        '2', 'compound', 'butterfly',        'butterfly_kick'),
  ];
  const get = (slug: string): FreestyleTrickRow => {
    const r = KICKS.find(x => x.slug === slug);
    if (!r) throw new Error(`fixture missing: ${slug}`);
    return r;
  };

  it('the seven dex-kicks cross-reference one another as movement neighbours', () => {
    const slugs = buildRelatedTricks(get('illusioning_kick'), KICKS)
      .filter(r => r.rule === 'neighborhood').map(r => r.slug);
    expect(slugs).toEqual(expect.arrayContaining([
      'around_the_world_kick', 'pixie_kick', 'fairy_kick', 'orbit_kick',
      'legover_kick', 'miraging_kick',
    ]));
  });

  it('dex-kick group is mutual (pixie-kick surfaces illusioning-kick and the rest)', () => {
    const slugs = buildRelatedTricks(get('pixie_kick'), KICKS).map(r => r.slug);
    expect(slugs).toContain('illusioning_kick');
    expect(slugs).toContain('around_the_world_kick');
  });

  it('clipper and clipper-stall are reciprocal neighbours', () => {
    expect(buildRelatedTricks(get('clipper'), KICKS).map(r => r.slug)).toContain('clipper_stall');
    expect(buildRelatedTricks(get('clipper_stall'), KICKS).map(r => r.slug)).toContain('clipper');
  });

  it('a stalled trick now surfaces its kick variant (the previously-missing direction)', () => {
    expect(buildRelatedTricks(get('around_the_world'), KICKS).map(r => r.slug)).toContain('around_the_world_kick');
    expect(buildRelatedTricks(get('mirage'), KICKS).map(r => r.slug)).toContain('miraging_kick');
    expect(buildRelatedTricks(get('butterfly'), KICKS).map(r => r.slug)).toContain('butterfly_kick');
  });

  it('miraging-kick belongs to both the dex-kick group and the mirage pair', () => {
    const slugs = buildRelatedTricks(get('miraging_kick'), KICKS).map(r => r.slug);
    expect(slugs).toContain('mirage');                 // kick/stall pair
    expect(slugs).toContain('around_the_world_kick');  // dex-kick group
  });
});

describe('buildNextTricks — Option (b) per-bucket sampling', () => {
  it('mirage: takes 2 from ADD=3 + 2 from ADD=4 (per-bucket cap drops fury)', () => {
    const result = buildNextTricks(pick('mirage'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '3:paradox_mirage',
      '3:smear',
      '4:atom_smasher',
      '4:blur',
    ]);
    // fury(4) is dropped by the per-bucket cap of 2
    expect(result.find(r => r.slug === 'fury')).toBeUndefined();
  });

  it('osis: 4-ADD bucket capped at 2, 5-ADD bucket surfaces (higher tier visible)', () => {
    const result = buildNextTricks(pick('osis'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '4:blender',
      '4:ducking_osis',
      '5:barraging_osis',
    ]);
    expect(result.find(r => r.slug === 'spinning_osis')).toBeUndefined();  // dropped from 4-bucket
    expect(result.find(r => r.slug === 'barraging_osis')).toBeDefined();   // 5-tier visible
  });

  it('whirl: full spread 4 → 5 → 6 ADD visible, capped at 5 total', () => {
    const result = buildNextTricks(pick('whirl'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '4:ducking_whirl',
      '4:paradox_whirl',
      '5:blurry_whirl',
      '5:paradox_symposium_whirl',
      '6:spinning_symposium_whirl',
    ]);
    expect(result.length).toBe(5);
  });

  it('only includes same-family rows (no cross-family progression)', () => {
    // mirage's Next Tricks must not include any whirl/osis/torque rows
    const result = buildNextTricks(pick('mirage'), FIXTURE);
    expect(result.every(r => r.slug !== 'whirl')).toBe(true);
    expect(result.every(r => !r.slug.endsWith('_whirl'))).toBe(true);
    expect(result.every(r => r.slug !== 'osis')).toBe(true);
    expect(result.every(r => !r.slug.endsWith('_torque'))).toBe(true);
  });

  it('only includes higher-ADD rows (excludes equal/lower)', () => {
    // From paradox-mirage (3 ADD), eligible are atom-smasher(4), blur(4), fury(4)
    // — NOT mirage(2) or smear(3, equal)
    const result = buildNextTricks(pick('paradox_mirage'), FIXTURE);
    expect(result.find(r => r.slug === 'mirage')).toBeUndefined();   // 2 ADD, lower
    expect(result.find(r => r.slug === 'smear')).toBeUndefined();    // 3 ADD, equal
    expect(result.map(r => r.slug)).toEqual(['atom_smasher', 'blur']);
  });

  it('returns empty when current row is the highest-ADD in its family', () => {
    // spinning-symposium-whirl is the only 6-ADD whirl-family entry
    const result = buildNextTricks(pick('spinning_symposium_whirl'), FIXTURE);
    expect(result).toEqual([]);
  });

  it('excludes modifier-category rows', () => {
    // 'paradox' modifier row exists in fixture; must never appear
    const result = buildNextTricks(pick('mirage'), FIXTURE);
    expect(result.find(r => r.slug === 'paradox')).toBeUndefined();
  });

  it('shape: each item exposes slug, canonicalName, hashtag, adds, detailHref', () => {
    const result = buildNextTricks(pick('mirage'), FIXTURE);
    const first = result[0]!;
    expect(first.slug).toBe('paradox_mirage');
    expect(first.canonicalName).toBe('paradox mirage');
    expect(first.hashtag).toBe('#paradox_mirage');
    expect(first.adds).toBe('3');
    expect(first.detailHref).toBe('/freestyle/tricks/paradox_mirage');
  });

  it('returns empty when current adds is non-numeric (e.g. modifier)', () => {
    const mod: FreestyleTrickRow = row('paradox', 'modifier', 'modifier', 'paradox', 'paradox');
    expect(buildNextTricks(mod, FIXTURE)).toEqual([]);
  });
});

describe('buildPreviousTricks — Option (b) sampling, DESC flatten, family-base tiebreaker', () => {
  it('blur (4 ADD): closest 3-ADD bucket first, then 2-ADD base', () => {
    const result = buildPreviousTricks(pick('blur'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '3:paradox_mirage',
      '3:smear',
      '2:mirage',
    ]);
  });

  it('spinning-whirl: family base "whirl" surfaces first within ADD=3 bucket', () => {
    const result = buildPreviousTricks(pick('spinning_whirl'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '4:ducking_whirl',
      '4:paradox_whirl',
      '3:whirl',     // ← family-base tiebreaker promotes this above rev-up/rev-whirl alphabetically
      '3:rev_up',
    ]);
    // The base trick MUST appear despite alphabetic order putting rev-* first
    expect(result.find(r => r.slug === 'whirl')).toBeDefined();
  });

  it('atomic-torque (6 ADD): only same-family lower-ADD entries (no torque ancestor)', () => {
    const result = buildPreviousTricks(pick('atomic_torque'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '5:mobius',
      '5:paradox_torque',
    ]);
    // torque has trick_family='osis' (different family) → must NOT appear
    expect(result.find(r => r.slug === 'torque')).toBeUndefined();
    // osis (the structural ancestor) must NOT appear here either
    expect(result.find(r => r.slug === 'osis')).toBeUndefined();
  });

  it('only includes same-family rows', () => {
    const result = buildPreviousTricks(pick('spinning_whirl'), FIXTURE);
    expect(result.every(r => !r.slug.includes('osis'))).toBe(true);
    expect(result.every(r => !r.slug.includes('torque'))).toBe(true);
    expect(result.every(r => !r.slug.includes('mirage'))).toBe(true);
  });

  it('only includes lower-ADD rows (excludes equal/higher)', () => {
    // blur (4 ADD): siblings at 4 ADD (atom-smasher, fury) must NOT appear
    const result = buildPreviousTricks(pick('blur'), FIXTURE);
    expect(result.find(r => r.slug === 'atom_smasher')).toBeUndefined();
    expect(result.find(r => r.slug === 'fury')).toBeUndefined();
  });

  it('returns empty when current row is the lowest-ADD in its family', () => {
    // mirage (2 ADD) is the lowest in mirage family
    const result = buildPreviousTricks(pick('mirage'), FIXTURE);
    expect(result).toEqual([]);
  });

  it('excludes modifier-category rows', () => {
    const result = buildPreviousTricks(pick('blur'), FIXTURE);
    expect(result.find(r => r.slug === 'paradox')).toBeUndefined();
  });

  it('respects per-bucket cap of 2 even when family base is present', () => {
    // For spinning-whirl: ADD=3 bucket has 3 candidates [rev-up, rev-whirl, whirl]
    // With family-base tiebreaker: whirl, rev-up, rev-whirl → take 2 → whirl, rev-up
    const result = buildPreviousTricks(pick('spinning_whirl'), FIXTURE);
    const add3 = result.filter(r => r.adds === '3');
    expect(add3).toHaveLength(2);
    expect(add3.map(r => r.slug)).toEqual(['whirl', 'rev_up']);
  });

  it('caps total at 5 (DESC flatten preserves closest-easier-first ordering)', () => {
    // Construct a synthetic case: many candidates across many ADD tiers
    const synthetic: FreestyleTrickRow[] = [
      row('big',    '7', 'compound', 'big', 'big'),
      ...['a','b','c'].map(s => row(`big-${s}-6`, '6', 'compound', 'big', 'big')),
      ...['a','b','c'].map(s => row(`big-${s}-5`, '5', 'compound', 'big', 'big')),
      ...['a','b','c'].map(s => row(`big-${s}-4`, '4', 'compound', 'big', 'big')),
    ];
    const result = buildPreviousTricks(synthetic[0]!, synthetic);
    expect(result).toHaveLength(5);
    // Order: 6-bucket(2), 5-bucket(2), 4-bucket(1, cap hit)
    expect(result.map(r => r.adds)).toEqual(['6', '6', '5', '5', '4']);
  });

  it('shape: each item exposes slug, canonicalName, hashtag, adds, detailHref', () => {
    const result = buildPreviousTricks(pick('blur'), FIXTURE);
    const first = result[0]!;
    expect(first.slug).toBe('paradox_mirage');
    expect(first.canonicalName).toBe('paradox mirage');
    expect(first.hashtag).toBe('#paradox_mirage');
    expect(first.adds).toBe('3');
    expect(first.detailHref).toBe('/freestyle/tricks/paradox_mirage');
  });
});

describe('buildRelativeSideVariants', () => {
  // base + same-side + far trio, plus an unrelated trick that must not be pulled in.
  const TRIO: FreestyleTrickRow[] = [
    row('butterfly', '3', 'compound', 'butterfly', 'butterfly'),
    row('butterfly_same_side', '3', 'compound', 'butterfly', 'butterfly'),
    row('far_butterfly', '3', 'compound', 'butterfly', 'butterfly'),
    row('clipper', '2', 'compound', 'clipper', 'clipper'),
  ];

  it('groups base / same-side / far siblings sharing a stem, ordered base → same-side → far', () => {
    const result = buildRelativeSideVariants(pick2('butterfly', TRIO), TRIO);
    expect(result).not.toBeNull();
    expect(result!.variants.map(v => v.slug)).toEqual([
      'butterfly', 'butterfly_same_side', 'far_butterfly',
    ]);
    expect(result!.variants.map(v => v.side)).toEqual(['base', 'same-side', 'far']);
    expect(result!.variants.map(v => v.sideLabel)).toEqual([
      'Base', 'Same-side variant', 'Far variant',
    ]);
    expect(result!.glossaryHref).toBe('/freestyle/glossary#term-same-side');
  });

  it('marks the current trick and never pulls in an unrelated stem', () => {
    const result = buildRelativeSideVariants(pick2('far_butterfly', TRIO), TRIO);
    expect(result!.variants.find(v => v.slug === 'far_butterfly')!.isCurrent).toBe(true);
    expect(result!.variants.find(v => v.slug === 'butterfly')!.isCurrent).toBe(false);
    expect(result!.variants.some(v => v.slug === 'clipper')).toBe(false);
  });

  it('handles the infix same-side form (surging-same-side-osis ↔ surging-osis)', () => {
    const rows: FreestyleTrickRow[] = [
      row('surging_osis', '4', 'compound', 'osis', 'osis'),
      row('surging_same_side_osis', '5', 'compound', 'osis', 'osis'),
    ];
    const result = buildRelativeSideVariants(pick2('surging_same_side_osis', rows), rows);
    expect(result!.variants.map(v => v.slug)).toEqual(['surging_osis', 'surging_same_side_osis']);
    expect(result!.variants.map(v => v.side)).toEqual(['base', 'same-side']);
  });

  it('returns null for a trick with no relative-side sibling', () => {
    expect(buildRelativeSideVariants(pick2('clipper', TRIO), TRIO)).toBeNull();
  });

  it('returns null when a lone qualified slug has no base or contrasting sibling', () => {
    const rows: FreestyleTrickRow[] = [row('far_dyno', '3', 'compound', 'dyno', 'dyno')];
    expect(buildRelativeSideVariants(rows[0]!, rows)).toBeNull();
  });

  it('excludes modifier-category rows from the group', () => {
    const rows: FreestyleTrickRow[] = [
      row('butterfly', '3', 'compound', 'butterfly', 'butterfly'),
      row('far_butterfly', '3', 'modifier', 'butterfly', 'butterfly'),
    ];
    expect(buildRelativeSideVariants(rows[0]!, rows)).toBeNull();
  });
});

function pick2(slug: string, rows: FreestyleTrickRow[]): FreestyleTrickRow {
  const r = rows.find(x => x.slug === slug);
  if (!r) throw new Error(`fixture missing ${slug}`);
  return r;
}
