// Hashtag derivation for clubs promoted from legacy candidates.
//
// A promoted club must receive the same hashtag form it would have received
// had the data pipeline pre-populated it, so promoted and pre-populated
// sibling clubs stay consistent: a city-first cascade with country and
// club-name fallbacks, then a numeric suffix. The pipeline de-collides
// against a batch-level set; here the caller supplies a live taken-check
// against the tags table instead. The slug rules (pre-NFKD letter map,
// accent folding, redundant-suffix stripping, primary-city extraction)
// must stay byte-compatible with the pipeline implementation; parity unit
// tests pin them against pipeline-derived fixtures.

import { createHash } from 'crypto';

/**
 * Deterministic club id for a promoted candidate. Must produce the same id
 * the data pipeline derives for the same legacy key, so a platform-promoted
 * club and a pipeline-pre-populated club for one candidate land on the
 * identical row, and concurrent promotions collide on the clubs primary key
 * instead of duplicating the club. Parity is pinned by a unit test.
 */
export function stableClubId(legacyClubKey: string): string {
  return 'club_' + createHash('sha1').update(legacyClubKey, 'utf8').digest('hex').slice(0, 24);
}

const PRE_NFKD_MAP: Record<string, string> = {
  'Ł': 'L', 'ł': 'l', 'Ø': 'O', 'ø': 'o', 'Đ': 'D', 'đ': 'd',
};

// Letters whose NFKD decomposition does not reach ASCII get mapped first,
// then accents fold via NFKD + combining-mark removal.
export function slugifyClubText(text: string): string {
  let t = (text ?? '').replace(/[ŁłØøĐđ]/g, (c) => PRE_NFKD_MAP[c]);
  t = t.normalize('NFKD').replace(/\p{M}/gu, '');
  t = t.toLowerCase();
  t = t.replace(/[^a-z0-9]+/g, '_');
  return t.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

// Suffixes that restate "footbag club" add no identity to a club hashtag;
// longest patterns first so compound forms strip whole.
const REDUNDANT_SUFFIXES = [
  '_de_footbag_net_club', '_de_footbag_club', '_de_footbag',
  '_footbag_net_club', '_hacky_sack_club', '_footbag_club', '_footbag',
  '_club', '_fc',
];

export function stripRedundantSuffix(slug: string): string {
  for (const suffix of REDUNDANT_SUFFIXES) {
    if (slug.endsWith(suffix)) {
      const trimmed = slug.slice(0, -suffix.length).replace(/^_+|_+$/g, '');
      if (trimmed) return trimmed;
    }
  }
  return slug;
}

function cleanClubName(name: string): string {
  let n = name.replace(/\s*\([^)]*\)\s*/g, ' ');
  n = n.replace(/^the\s+/i, '');
  return n.trim();
}

// Multi-city values ("Calgary / Edmonton", "X and Y") keep only the first
// city; parentheticals are dropped. Empty input yields ''.
export function extractPrimaryCity(city: string): string {
  if (!city || !city.trim()) return '';
  const cleaned = city.replace(/\s*\([^)]*\)\s*/g, ' ');
  const parts = cleaned.trim().split(/\s*\/\s*|\s+-\s+|\s+&\s+|\s+and\s+/i);
  return parts.length ? parts[0].trim() : '';
}

/**
 * Derive a unique `#club_{slug}` hashtag for a candidate being promoted.
 * City-first cascade: `#club_{city}`, `#club_{country}_{city}`,
 * `#club_{country}_{city}_{name}`; when the city is absent or equals the
 * country, the name leads: `#club_{name}`, `#club_{country}_{name}`.
 * The first candidate not taken wins; cascade exhaustion appends a
 * numeric suffix to the most specific form.
 */
export function deriveClubTag(
  name: string,
  country: string,
  city: string,
  isTaken: (tagNormalized: string) => boolean,
): string {
  const nameSlug = stripRedundantSuffix(slugifyClubText(cleanClubName(name)));
  const countrySlug = slugifyClubText(country);
  const citySlug = slugifyClubText(extractPrimaryCity(city));

  const candidates = (!citySlug || citySlug === countrySlug)
    ? [
        `#club_${nameSlug}`,
        `#club_${countrySlug}_${nameSlug}`,
      ]
    : [
        `#club_${citySlug}`,
        `#club_${countrySlug}_${citySlug}`,
        `#club_${countrySlug}_${citySlug}_${nameSlug}`,
      ];

  for (const candidate of candidates) {
    if (!isTaken(candidate)) return candidate;
  }
  const base = candidates[candidates.length - 1];
  let suffix = 2;
  while (isTaken(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}
