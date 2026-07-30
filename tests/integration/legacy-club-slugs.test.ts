import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { slugifyForTag } from '../../src/services/slugify';

/**
 * Replicate the Python pipeline's city-first cascade logic in TypeScript.
 * Must produce identical slugs for any given (name, country, city) triple.
 */

const REDUNDANT_SUFFIXES = [
  '_de_footbag_net_club', '_de_footbag_club', '_de_footbag',
  '_footbag_net_club', '_hacky_sack_club', '_footbag_club', '_footbag',
  '_club', '_fc',
];

function stripRedundantSuffix(slug: string): string {
  for (const suffix of REDUNDANT_SUFFIXES) {
    if (slug.endsWith(suffix)) {
      const trimmed = slug.slice(0, -suffix.length).replace(/^_|_$/g, '');
      if (trimmed) return trimmed;
    }
  }
  return slug;
}

function cleanClubName(name: string): string {
  let cleaned = name.replace(/\s*\([^)]*\)\s*/g, ' ');
  cleaned = cleaned.replace(/^the\s+/i, '');
  return cleaned.trim();
}

function extractPrimaryCity(city: string): string {
  if (!city || !city.trim()) return '';
  let c = city.replace(/\s*\([^)]*\)\s*/g, ' ');
  const parts = c.split(/\s*[/\-&]\s*|\s+and\s+/i);
  return (parts[0] || '').trim();
}

function makeTagNormalized(
  name: string,
  country: string,
  city: string,
  seen: Set<string>,
): string {
  const nameSlug = stripRedundantSuffix(slugifyForTag(cleanClubName(name)));
  const countrySlug = slugifyForTag(country);
  const primaryCity = extractPrimaryCity(city);
  const citySlug = slugifyForTag(primaryCity);

  let candidates: string[];
  if (!citySlug || citySlug === countrySlug) {
    candidates = [
      `#club_${nameSlug}`,
      `#club_${countrySlug}_${nameSlug}`,
    ];
  } else {
    candidates = [
      `#club_${citySlug}`,
      `#club_${countrySlug}_${citySlug}`,
      `#club_${countrySlug}_${citySlug}_${nameSlug}`,
    ];
  }

  for (const c of candidates) {
    if (!seen.has(c)) return c;
  }

  const base = candidates[candidates.length - 1];
  let suffix = 2;
  while (seen.has(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DUPLICATE_OVERRIDES = path.join(
  REPO_ROOT, 'legacy_data', 'overrides', 'club_duplicates.csv',
);

// The curator's duplicate adjudication is read here rather than restated. A
// second copy of it is exactly how a pair declared once fails to reach a loader:
// the retired Caracas club stayed publicly listed because a loader carried its
// own hardcoded list that never gained that pair.
function loadDuplicatePairs(): Array<{ keep: string; drop: string }> {
  const [, ...lines] = fs.readFileSync(DUPLICATE_OVERRIDES, 'utf8').split('\n');
  const pairs: Array<{ keep: string; drop: string }> = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    // The two keys are the leading fields and never contain a comma, so the
    // quoted reason that follows them needs no CSV parser here.
    const [keep, drop] = line.split(',');
    if (keep?.trim() && drop?.trim()) pairs.push({ keep: keep.trim(), drop: drop.trim() });
  }
  return pairs;
}

const DUPLICATE_PAIRS = loadDuplicatePairs();
const DROPPED_KEYS = new Set(DUPLICATE_PAIRS.map((p) => p.drop));

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_]*[a-z0-9]$/;

describe('legacy club slug generation (city-first cascade)', () => {
  it('city-first: single club in a city gets #club_{city}', () => {
    const seen = new Set<string>();
    const tag = makeTagNormalized('Denver Footbag Club', 'USA', 'Denver', seen);
    expect(tag).toBe('#club_denver');
  });

  it('city-first: collision cascades to #club_{country}_{city}', () => {
    const seen = new Set(['#club_portland']);
    const tag = makeTagNormalized('Rose City Footbag', 'USA', 'Portland', seen);
    expect(tag).toBe('#club_usa_portland');
  });

  it('city-first: second collision cascades to #club_{country}_{city}_{name}', () => {
    const seen = new Set(['#club_portland', '#club_usa_portland']);
    const tag = makeTagNormalized('Rose City Footbag', 'USA', 'Portland', seen);
    expect(tag).toBe('#club_usa_portland_rose_city');
  });

  it('fallback: empty city uses name-based slug', () => {
    const seen = new Set<string>();
    const tag = makeTagNormalized('Bow No Bones', 'UK', '', seen);
    expect(tag).toBe('#club_bow_no_bones');
  });

  it('fallback: city equals country uses name-based slug', () => {
    const seen = new Set<string>();
    const tag = makeTagNormalized('Footbag Empire', 'Russia', 'Russia', seen);
    expect(tag).toBe('#club_footbag_empire');
  });

  it('multi-city: extracts first token', () => {
    expect(extractPrimaryCity('Seattle/Olympia')).toBe('Seattle');
    expect(extractPrimaryCity('Medellin - Bogota')).toBe('Medellin');
    expect(extractPrimaryCity('Hollola & Lahti')).toBe('Hollola');
    expect(extractPrimaryCity('Austin and Statewide')).toBe('Austin');
    expect(extractPrimaryCity('St. Louis - (Kirkwood Area)')).toBe('St. Louis');
  });

  it('L-stroke cities produce correct slugs', () => {
    const seen = new Set<string>();
    const tag = makeTagNormalized('Łódź Footbag Club', 'Poland', 'Łódź', seen);
    expect(tag).toBe('#club_lodz');
  });

  it('O-stroke cities produce correct slugs', () => {
    const seen = new Set<string>();
    const tag = makeTagNormalized('Ørsted Footbag', 'Denmark', 'Ørsted', seen);
    expect(tag).toBe('#club_orsted');
  });

  it('D-stroke cities produce correct slugs', () => {
    const seen = new Set<string>();
    const tag = makeTagNormalized('Đakovo Footbag', 'Croatia', 'Đakovo', seen);
    expect(tag).toBe('#club_dakovo');
  });

  it('redundant suffixes are stripped from name slugs', () => {
    const seen = new Set<string>();
    const tag = makeTagNormalized('Austin Footbag Club', 'USA', '', seen);
    expect(tag).toBe('#club_austin');
  });

  it('numeric suffix as last resort', () => {
    const seen = new Set([
      '#club_caracas',
      '#club_venezuela_caracas',
      '#club_venezuela_caracas_test',
    ]);
    const tag = makeTagNormalized('Test', 'Venezuela', 'Caracas', seen);
    expect(tag).toBe('#club_venezuela_caracas_test_2');
  });
});

describe('slug format validation', () => {
  it('all generated slugs satisfy the format contract', () => {
    const testCases: Array<{ name: string; country: string; city: string }> = [
      { name: 'Denver Footbag', country: 'USA', city: 'Denver' },
      { name: 'Helsinki Hacky Sack Club', country: 'Finland', city: 'Helsinki' },
      { name: 'Łódź Freestyle', country: 'Poland', city: 'Łódź' },
      { name: 'München Footbag', country: 'Germany', city: 'München' },
      { name: 'São Paulo FC', country: 'Brazil', city: 'São Paulo' },
      { name: 'Bow No Bones', country: 'UK', city: '' },
      { name: 'Footbag Empire', country: 'Russia', city: 'Russia' },
      { name: 'Rain City Shred', country: 'USA', city: 'Seattle/Olympia' },
      { name: 'TSB The Shred Brothers', country: 'Bulgaria', city: 'Sofia - Pernik - Varna' },
    ];

    const seen = new Set<string>();
    const violations: string[] = [];

    for (const tc of testCases) {
      const tag = makeTagNormalized(tc.name, tc.country, tc.city, seen);
      seen.add(tag);
      const slug = tag.slice('#club_'.length);

      if (!tag.startsWith('#club_')) {
        violations.push(`${tc.name}: missing #club_ prefix: ${tag}`);
      }
      if (!SLUG_PATTERN.test(slug)) {
        violations.push(`${tc.name}: slug '${slug}' fails pattern check`);
      }
      if (/__/.test(slug)) {
        violations.push(`${tc.name}: slug '${slug}' has consecutive underscores`);
      }
      if (tag.length > 100) {
        violations.push(`${tc.name}: tag '${tag}' exceeds 100 chars (${tag.length})`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('slugs are unique across the batch', () => {
    const testCases = [
      { name: 'Club A', country: 'USA', city: 'Portland' },
      { name: 'Club B', country: 'USA', city: 'Portland' },
      { name: 'Club C', country: 'USA', city: 'Portland' },
      { name: 'Club D', country: 'USA', city: 'Denver' },
      { name: 'Club E', country: 'Canada', city: 'Portland' },
    ];

    const seen = new Set<string>();
    const tags: string[] = [];
    for (const tc of testCases) {
      const tag = makeTagNormalized(tc.name, tc.country, tc.city, seen);
      seen.add(tag);
      tags.push(tag);
    }

    const unique = new Set(tags);
    expect(unique.size).toBe(tags.length);
  });
});

describe('curator duplicate adjudication', () => {
  it('the override file declares at least one pair, so the readers have something to honour', () => {
    expect(DUPLICATE_PAIRS.length).toBeGreaterThan(0);
  });

  it('every retired key is retired exactly once', () => {
    expect(DROPPED_KEYS.size).toBe(DUPLICATE_PAIRS.length);
  });

  it('no retired key is also a kept key, so no merge chains or cycles exist', () => {
    const keptKeys = new Set(DUPLICATE_PAIRS.map((p) => p.keep));
    for (const dropped of DROPPED_KEYS) {
      expect(keptKeys).not.toContain(dropped);
    }
  });

  it('a retired key never yields a club tag, so the kept row keeps the city slug', () => {
    const seen = new Set<string>();
    const clubs = [
      { key: '1042652245', name: 'Les Pieds a Gilles', country: 'Switzerland', city: 'Lausanne' },
      { key: '1488489195', name: 'Les Pieds a Gilles', country: 'Switzerland', city: 'Lausanne' },
      { key: '944090321', name: '1. Rien N\'est Hacky', country: 'France', city: 'Paris' },
      { key: 'zion-fr', name: 'RNH Footbag', country: 'France', city: 'Paris' },
    ];

    const generatedTags: string[] = [];
    for (const club of clubs) {
      if (DROPPED_KEYS.has(club.key)) continue;
      const tag = makeTagNormalized(club.name, club.country, club.city, seen);
      seen.add(tag);
      generatedTags.push(tag);
    }

    expect(generatedTags).toEqual(['#club_lausanne', '#club_paris']);
  });
});
