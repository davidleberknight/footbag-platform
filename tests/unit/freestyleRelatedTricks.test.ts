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
import { buildRelatedTricks, buildNextTricks, buildPreviousTricks } from '../../src/services/freestyleRelatedTricks';

function row(
  slug: string,
  adds: string,
  category: string,
  base_trick: string,
  trick_family: string,
): FreestyleTrickRow {
  return {
    slug,
    canonical_name: slug.replace(/-/g, ' '),
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
  row('paradox-mirage',  '3', 'compound', 'mirage', 'mirage'),
  row('smear',           '3', 'compound', 'mirage', 'mirage'),
  row('atom-smasher',    '4', 'compound', 'mirage', 'mirage'),
  row('blur',            '4', 'compound', 'mirage', 'mirage'),
  row('fury',            '4', 'compound', 'mirage', 'mirage'),

  // osis family
  row('osis',            '3', 'compound', 'osis',   'osis'),
  row('blender',         '4', 'compound', 'osis',   'osis'),
  row('ducking-osis',    '4', 'compound', 'osis',   'osis'),
  row('spinning-osis',   '4', 'compound', 'osis',   'osis'),
  row('stepping-osis',   '4', 'compound', 'osis',   'osis'),
  row('torque',          '4', 'compound', 'osis',   'osis'),
  row('barraging-osis',  '5', 'compound', 'osis',   'osis'),

  // torque family (grandchildren of osis via torque)
  row('paradox-torque',  '5', 'compound', 'torque', 'torque'),
  row('mobius',          '5', 'compound', 'torque', 'torque'),
  row('atomic-torque',   '6', 'compound', 'torque', 'torque'),
  row('blurry-torque',   '6', 'compound', 'torque', 'torque'),
  row('spinning-torque', '6', 'compound', 'torque', 'torque'),

  // whirl family — full set, will exercise the cap
  row('whirl',                    '3', 'dex',      'whirl', 'whirl'),
  row('rev-up',                   '3', 'dex',      'whirl', 'whirl'),
  row('rev-whirl',                '3', 'dex',      'whirl', 'whirl'),
  row('ducking-whirl',            '4', 'compound', 'whirl', 'whirl'),
  row('paradox-whirl',            '4', 'compound', 'whirl', 'whirl'),
  row('stepping-whirl',           '4', 'compound', 'whirl', 'whirl'),
  row('symposium-whirl',          '4', 'compound', 'whirl', 'whirl'),
  row('tapping-whirl',            '4', 'compound', 'whirl', 'whirl'),
  row('blurry-whirl',             '5', 'compound', 'whirl', 'whirl'),
  row('paradox-symposium-whirl',  '5', 'compound', 'whirl', 'whirl'),
  row('spinning-whirl',           '5', 'compound', 'whirl', 'whirl'),
  row('tomahawk',                 '5', 'compound', 'whirl', 'whirl'),
  row('spinning-symposium-whirl', '6', 'compound', 'whirl', 'whirl'),

  // butterfly family — only the atomic-prefix sibling needed for atomic-torque R2
  row('atomic-butterfly', '4', 'compound', 'butterfly', 'butterfly'),

  // cross-family modifier-prefix peers for paradox-mirage's R2
  row('paradox-blender', '5', 'compound', 'blender', 'blender'),
  row('paradox-drifter', '4', 'compound', 'drifter', 'drifter'),

  // modifier-category row that MUST be excluded from any related list
  row('paradox', 'modifier', 'modifier', 'paradox', 'paradox'),
];

function pick(slug: string): FreestyleTrickRow {
  const r = FIXTURE.find(x => x.slug === slug);
  if (!r) throw new Error(`fixture missing slug: ${slug}`);
  return r;
}

describe('buildRelatedTricks — worked examples', () => {
  it('mirage: 5 results, all R1, no cap', () => {
    const result = buildRelatedTricks(pick('mirage'), FIXTURE);
    expect(result.map(r => r.slug)).toEqual([
      'paradox-mirage', 'atom-smasher', 'smear', 'blur', 'fury',
    ]);
    expect(result.every(r => r.rule === 'family')).toBe(true);
  });

  it('whirl: 8 results capped, all R1, ADD-bucket round-robin', () => {
    const result = buildRelatedTricks(pick('whirl'), FIXTURE);
    expect(result.map(r => r.slug)).toEqual([
      'rev-up',
      'ducking-whirl',
      'blurry-whirl',
      'spinning-symposium-whirl',
      'rev-whirl',
      'paradox-whirl',
      'paradox-symposium-whirl',
      'stepping-whirl',
    ]);
    expect(result.every(r => r.rule === 'family')).toBe(true);
    expect(result.length).toBe(8);
  });

  it('atomic-torque: R1 → R2 → R3 ordering with R3 gate firing', () => {
    const result = buildRelatedTricks(pick('atomic-torque'), FIXTURE);
    expect(result.map(r => `${r.rule}:${r.slug}`)).toEqual([
      'family:mobius',
      'family:blurry-torque',
      'family:paradox-torque',
      'family:spinning-torque',
      'modifier-prefix:atomic-butterfly',
      'grandparent:osis',
    ]);
  });
});

describe('buildRelatedTricks — rule contracts', () => {
  it('excludes modifier-category rows', () => {
    // current trick: paradox-mirage. Modifier 'paradox' has slug=paradox,
    // would match R2's "starts with paradox-" check on a hyphen split? No —
    // 'paradox' has no hyphen, so the prefix isn't "paradox-". But the
    // category=modifier filter must still exclude it from any other rule too.
    const result = buildRelatedTricks(pick('paradox-mirage'), FIXTURE);
    expect(result.find(r => r.slug === 'paradox')).toBeUndefined();
    expect(result.every(r => r.slug !== 'paradox')).toBe(true);
  });

  it('R3 gate: skips when R1+R2 >= 6', () => {
    // paradox-torque: R1 (family=torque) yields mobius/blurry-torque/atomic-torque/spinning-torque = 4
    // R2 (paradox- prefix, family != torque) yields paradox-mirage, paradox-blender, paradox-drifter,
    //    paradox-whirl, paradox-symposium-whirl = 5 → R1+R2 = 9 → R3 must be skipped
    const result = buildRelatedTricks(pick('paradox-torque'), FIXTURE);
    expect(result.find(r => r.rule === 'grandparent')).toBeUndefined();
    expect(result.length).toBe(8);  // capped
  });

  it('R3 contributes at most one result and only when not already included', () => {
    const result = buildRelatedTricks(pick('atomic-torque'), FIXTURE);
    const r3 = result.filter(r => r.rule === 'grandparent');
    expect(r3.length).toBe(1);
    expect(r3[0]!.slug).toBe('osis');
  });

  it('hashtag derivation matches slugToHashtag (hyphens stripped, # prefix)', () => {
    const result = buildRelatedTricks(pick('atomic-torque'), FIXTURE);
    const map = Object.fromEntries(result.map(r => [r.slug, r.hashtag]));
    expect(map['mobius']).toBe('#mobius');
    expect(map['atomic-butterfly']).toBe('#atomicbutterfly');
    expect(map['blurry-torque']).toBe('#blurrytorque');
    expect(map['osis']).toBe('#osis');
  });

  it('detailHref points to /freestyle/tricks/:slug', () => {
    const result = buildRelatedTricks(pick('mirage'), FIXTURE);
    expect(result[0]!.detailHref).toBe('/freestyle/tricks/paradox-mirage');
  });

  it('does not include the current trick in its own related list', () => {
    const result = buildRelatedTricks(pick('whirl'), FIXTURE);
    expect(result.find(r => r.slug === 'whirl')).toBeUndefined();
  });

  it('paradox-mirage: R1 + R2 mix, R1 first then R2', () => {
    const result = buildRelatedTricks(pick('paradox-mirage'), FIXTURE);
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

describe('buildNextTricks — Option (b) per-bucket sampling', () => {
  it('mirage: takes 2 from ADD=3 + 2 from ADD=4 (per-bucket cap drops fury)', () => {
    const result = buildNextTricks(pick('mirage'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '3:paradox-mirage',
      '3:smear',
      '4:atom-smasher',
      '4:blur',
    ]);
    // fury(4) is dropped by the per-bucket cap of 2
    expect(result.find(r => r.slug === 'fury')).toBeUndefined();
  });

  it('osis: 4-ADD bucket capped at 2, 5-ADD bucket surfaces (higher tier visible)', () => {
    const result = buildNextTricks(pick('osis'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '4:blender',
      '4:ducking-osis',
      '5:barraging-osis',
    ]);
    expect(result.find(r => r.slug === 'spinning-osis')).toBeUndefined();  // dropped from 4-bucket
    expect(result.find(r => r.slug === 'barraging-osis')).toBeDefined();   // 5-tier visible
  });

  it('whirl: full spread 4 → 5 → 6 ADD visible, capped at 5 total', () => {
    const result = buildNextTricks(pick('whirl'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '4:ducking-whirl',
      '4:paradox-whirl',
      '5:blurry-whirl',
      '5:paradox-symposium-whirl',
      '6:spinning-symposium-whirl',
    ]);
    expect(result.length).toBe(5);
  });

  it('only includes same-family rows (no cross-family progression)', () => {
    // mirage's Next Tricks must not include any whirl/osis/torque rows
    const result = buildNextTricks(pick('mirage'), FIXTURE);
    expect(result.every(r => r.slug !== 'whirl')).toBe(true);
    expect(result.every(r => !r.slug.endsWith('-whirl'))).toBe(true);
    expect(result.every(r => r.slug !== 'osis')).toBe(true);
    expect(result.every(r => !r.slug.endsWith('-torque'))).toBe(true);
  });

  it('only includes higher-ADD rows (excludes equal/lower)', () => {
    // From paradox-mirage (3 ADD), eligible are atom-smasher(4), blur(4), fury(4)
    // — NOT mirage(2) or smear(3, equal)
    const result = buildNextTricks(pick('paradox-mirage'), FIXTURE);
    expect(result.find(r => r.slug === 'mirage')).toBeUndefined();   // 2 ADD, lower
    expect(result.find(r => r.slug === 'smear')).toBeUndefined();    // 3 ADD, equal
    expect(result.map(r => r.slug)).toEqual(['atom-smasher', 'blur']);
  });

  it('returns empty when current row is the highest-ADD in its family', () => {
    // spinning-symposium-whirl is the only 6-ADD whirl-family entry
    const result = buildNextTricks(pick('spinning-symposium-whirl'), FIXTURE);
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
    expect(first.slug).toBe('paradox-mirage');
    expect(first.canonicalName).toBe('paradox mirage');
    expect(first.hashtag).toBe('#paradoxmirage');
    expect(first.adds).toBe('3');
    expect(first.detailHref).toBe('/freestyle/tricks/paradox-mirage');
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
      '3:paradox-mirage',
      '3:smear',
      '2:mirage',
    ]);
  });

  it('spinning-whirl: family base "whirl" surfaces first within ADD=3 bucket', () => {
    const result = buildPreviousTricks(pick('spinning-whirl'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '4:ducking-whirl',
      '4:paradox-whirl',
      '3:whirl',     // ← family-base tiebreaker promotes this above rev-up/rev-whirl alphabetically
      '3:rev-up',
    ]);
    // The base trick MUST appear despite alphabetic order putting rev-* first
    expect(result.find(r => r.slug === 'whirl')).toBeDefined();
  });

  it('atomic-torque (6 ADD): only same-family lower-ADD entries (no torque ancestor)', () => {
    const result = buildPreviousTricks(pick('atomic-torque'), FIXTURE);
    expect(result.map(r => `${r.adds}:${r.slug}`)).toEqual([
      '5:mobius',
      '5:paradox-torque',
    ]);
    // torque has trick_family='osis' (different family) → must NOT appear
    expect(result.find(r => r.slug === 'torque')).toBeUndefined();
    // osis (the structural ancestor) must NOT appear here either
    expect(result.find(r => r.slug === 'osis')).toBeUndefined();
  });

  it('only includes same-family rows', () => {
    const result = buildPreviousTricks(pick('spinning-whirl'), FIXTURE);
    expect(result.every(r => !r.slug.includes('osis'))).toBe(true);
    expect(result.every(r => !r.slug.includes('torque'))).toBe(true);
    expect(result.every(r => !r.slug.includes('mirage'))).toBe(true);
  });

  it('only includes lower-ADD rows (excludes equal/higher)', () => {
    // blur (4 ADD): siblings at 4 ADD (atom-smasher, fury) must NOT appear
    const result = buildPreviousTricks(pick('blur'), FIXTURE);
    expect(result.find(r => r.slug === 'atom-smasher')).toBeUndefined();
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
    const result = buildPreviousTricks(pick('spinning-whirl'), FIXTURE);
    const add3 = result.filter(r => r.adds === '3');
    expect(add3).toHaveLength(2);
    expect(add3.map(r => r.slug)).toEqual(['whirl', 'rev-up']);
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
    expect(first.slug).toBe('paradox-mirage');
    expect(first.canonicalName).toBe('paradox mirage');
    expect(first.hashtag).toBe('#paradoxmirage');
    expect(first.adds).toBe('3');
    expect(first.detailHref).toBe('/freestyle/tricks/paradox-mirage');
  });
});
