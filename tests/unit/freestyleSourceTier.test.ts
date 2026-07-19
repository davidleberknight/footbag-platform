/**
 * Registry invariants for the media-source label and tier maps.
 *
 * SOURCE_TIER (Tutorial vs Demonstration vs Record) and SOURCE_LABELS (friendly
 * display name) are the single sources of truth consulted by the trick-detail
 * Reference Media split and the dictionary-index tier badge. Every source that
 * active curated freestyle media actually uses must be registered in BOTH maps,
 * so no in-use source falls back to a raw key or to an inconsistent default tier.
 *
 * The coverage invariant derives its source keys from the committed curated media
 * sidecars under every curated freestyle_ directory (the freestyle reference-
 * media domain these registries govern), not from a hand-written list that can
 * drift the same way the maps do. The individual-shred gallery
 * (curated/individual_shred/, source bap_individual_shred) is a separate media
 * domain and is intentionally out of scope for these freestyle registries.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { SOURCE_TIER, SOURCE_LABELS, tierOf, type MediaTier } from '../../src/services/freestyleService';

const VALID_TIERS: ReadonlySet<string> = new Set<MediaTier>(['TUTORIAL', 'DEMONSTRATION', 'RECORD']);
const CURATED_ROOT = path.join(__dirname, '../../curated');

// Distinct non-null source keys used by active curated freestyle media, derived
// from the committed sidecars under every curated freestyle_ directory.
function activeFreestyleSourceKeys(): string[] {
  const keys = new Set<string>();
  for (const dir of readdirSync(CURATED_ROOT)) {
    if (!dir.startsWith('freestyle_')) continue;
    for (const file of readdirSync(path.join(CURATED_ROOT, dir))) {
      if (!file.endsWith('.meta.json')) continue;
      const meta = JSON.parse(
        readFileSync(path.join(CURATED_ROOT, dir, file), 'utf8'),
      ) as { sourceId?: string | null };
      if (meta.sourceId) keys.add(meta.sourceId);
    }
  }
  return [...keys].sort();
}

const FREESTYLE_SOURCE_KEYS = activeFreestyleSourceKeys();

describe('active freestyle media source coverage (data-derived)', () => {
  it('derives a non-empty set of in-use freestyle source keys, including passback_tutorials', () => {
    expect(FREESTYLE_SOURCE_KEYS.length).toBeGreaterThan(0);
    expect(FREESTYLE_SOURCE_KEYS).toContain('passback_tutorials');
    // The individual-shred gallery source is a separate domain, not a freestyle
    // reference-media source, so it never enters this invariant.
    expect(FREESTYLE_SOURCE_KEYS).not.toContain('bap_individual_shred');
  });

  it.each(FREESTYLE_SOURCE_KEYS)('source "%s" has a non-empty public label from the registry', (key) => {
    const label = SOURCE_LABELS[key];
    expect(label, `${key} is missing from SOURCE_LABELS`).toBeTruthy();
    expect(typeof label).toBe('string');
    expect(label).not.toBe(key);                          // not the raw source key
    expect(label.toLowerCase()).not.toContain('unknown'); // not a generic fallback
  });

  it.each(FREESTYLE_SOURCE_KEYS)('source "%s" has a valid tier from the registry', (key) => {
    const tier = SOURCE_TIER[key];
    expect(tier, `${key} is missing from SOURCE_TIER`).toBeTruthy();
    expect(VALID_TIERS.has(tier)).toBe(true);
    expect(tierOf(key)).toBe(tier);                       // resolves via the shared registry, not a fallback
  });
});

describe('PassBack Tutorials source registration', () => {
  it('has the intended friendly label', () => {
    expect(SOURCE_LABELS.passback_tutorials).toBe('PassBack Tutorials');
  });

  it('has the intended tier (TUTORIAL — explicit teaching content, matching passback_basics)', () => {
    expect(SOURCE_TIER.passback_tutorials).toBe('TUTORIAL');
    expect(tierOf('passback_tutorials')).toBe('TUTORIAL');
  });
});

describe('SOURCE_TIER taxonomy', () => {
  it('classifies the canonical tutorial sources', () => {
    expect(SOURCE_TIER.tt_youtube).toBe('TUTORIAL');
    expect(SOURCE_TIER.footbagspot_tutorials).toBe('TUTORIAL');
    expect(SOURCE_TIER.polini_pointers).toBe('TUTORIAL');
    expect(SOURCE_TIER.footbag_foundations).toBe('TUTORIAL');
    expect(SOURCE_TIER.everything_footbag).toBe('TUTORIAL');
    expect(SOURCE_TIER.passback_basics).toBe('TUTORIAL');
  });

  it('holds anz_trikz and footbagspot_passback at TUTORIAL pending per-clip review', () => {
    // Mixed-character corpora; blanket reclass would lose real instructional
    // clips. Per-clip override support is required before reclassification.
    expect(SOURCE_TIER.anz_trikz).toBe('TUTORIAL');
    expect(SOURCE_TIER.footbagspot_passback).toBe('TUTORIAL');
  });

  it('classifies shred_global as DEMONSTRATION', () => {
    // Every shred_global entry is a single-trick showcase, not instructional
    // content, so it belongs in DEMONSTRATION rather than TUTORIAL.
    expect(SOURCE_TIER.shred_global).toBe('DEMONSTRATION');
  });

  it('classifies the demonstration-only sources', () => {
    expect(SOURCE_TIER.footbag_finland).toBe('DEMONSTRATION');
    expect(SOURCE_TIER.flipsider_footbag).toBe('DEMONSTRATION');
    expect(SOURCE_TIER.passback_demos).toBe('DEMONSTRATION');
  });

  it('classifies passback_records as RECORD (excluded from Tutorial/Demo split)', () => {
    expect(SOURCE_TIER.passback_records).toBe('RECORD');
  });
});

describe('tierOf()', () => {
  it('returns the mapped tier for known sources', () => {
    expect(tierOf('tt_youtube')).toBe('TUTORIAL');
    expect(tierOf('shred_global')).toBe('DEMONSTRATION');
    expect(tierOf('passback_records')).toBe('RECORD');
  });

  it('returns null for null or undefined', () => {
    expect(tierOf(null)).toBeNull();
    expect(tierOf(undefined)).toBeNull();
  });

  it('returns null for unknown source ids', () => {
    expect(tierOf('not_a_real_source')).toBeNull();
    expect(tierOf('')).toBeNull();
  });
});
