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
import { buildRelatedTricks } from '../../src/services/freestyleRelatedTricks';

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
