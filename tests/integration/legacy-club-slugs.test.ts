import { describe, it, expect } from 'vitest';
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

const KNOWN_DUPLICATES: Record<string, string> = {
  '1488489195': '1042652245',
  'zion-fr':    '944090321',
  '1422386831': 'memphis',
  '1320083231': '1379698765',
};

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

describe('known duplicate merges', () => {
  it('4 duplicate pairs are defined', () => {
    expect(Object.keys(KNOWN_DUPLICATES)).toHaveLength(4);
  });

  it('each duplicate B key maps to a different A key', () => {
    const aKeys = new Set(Object.values(KNOWN_DUPLICATES));
    expect(aKeys.size).toBe(4);
  });

  it('no B key appears as an A key (no circular references)', () => {
    for (const bKey of Object.keys(KNOWN_DUPLICATES)) {
      expect(Object.values(KNOWN_DUPLICATES)).not.toContain(bKey);
    }
  });

  it('duplicate B keys are skipped during slug generation', () => {
    const seen = new Set<string>();
    const clubs = [
      { key: '1042652245', name: 'Les Pieds a Gilles', country: 'Switzerland', city: 'Lausanne' },
      { key: '1488489195', name: 'Les Pieds a Gilles', country: 'Switzerland', city: 'Lausanne' },
      { key: '944090321', name: '1. Rien N\'est Hacky', country: 'France', city: 'Paris' },
      { key: 'zion-fr', name: 'RNH Footbag', country: 'France', city: 'Paris' },
    ];

    const generatedTags: string[] = [];
    for (const club of clubs) {
      if (club.key in KNOWN_DUPLICATES) continue;
      const tag = makeTagNormalized(club.name, club.country, club.city, seen);
      seen.add(tag);
      generatedTags.push(tag);
    }

    expect(generatedTags).toHaveLength(2);
  });
});
