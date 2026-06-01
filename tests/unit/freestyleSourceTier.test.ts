/**
 * Unit tests for the SOURCE_TIER taxonomy registry.
 *
 * Pins the per-source tier membership so future taxonomy edits go through
 * explicit code review. The map is the single source of truth consulted by
 * both the trick-detail Reference Media split (Tutorials vs Demos) and the
 * dictionary-index "Tutorial available" / "Demo only" / "No video yet" badge.
 *
 * The SOURCE_TIER map is the single source of truth for Tutorial vs
 * Demonstration classification. Taxonomy changes require explicit review
 * because they affect badge presentation on the trick-detail Reference
 * Media split and the dictionary-index tier indicators.
 */
import { describe, it, expect } from 'vitest';
import { SOURCE_TIER, tierOf } from '../../src/services/freestyleService';

describe('SOURCE_TIER taxonomy', () => {
  it('classifies the canonical tutorial sources', () => {
    expect(SOURCE_TIER.tt_youtube).toBe('TUTORIAL');
    expect(SOURCE_TIER.footbagspot_tutorials).toBe('TUTORIAL');
    expect(SOURCE_TIER.polini_pointers).toBe('TUTORIAL');
    expect(SOURCE_TIER.footbag_foundations).toBe('TUTORIAL');
    expect(SOURCE_TIER.everything_footbag).toBe('TUTORIAL');
    expect(SOURCE_TIER.passback_basics).toBe('TUTORIAL');
  });

  it('holds anz_trikz and footbagspot_passback at TUTORIAL pending Phase 2d per-clip review', () => {
    // Mixed-character corpora; blanket reclass would lose real instructional
    // clips. Per-clip override support is required before reclassification.
    expect(SOURCE_TIER.anz_trikz).toBe('TUTORIAL');
    expect(SOURCE_TIER.footbagspot_passback).toBe('TUTORIAL');
  });

  it('classifies shred_global as DEMONSTRATION (Phase 2b reclassification)', () => {
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

  it('exposes exactly the 13 known sources', () => {
    // Guard against silent additions/removals. Adding a new source MUST
    // come with an explicit tier assignment and an updated count here.
    expect(Object.keys(SOURCE_TIER).sort()).toEqual([
      'anz_trikz',
      'everything_footbag',
      'flipsider_footbag',
      'footbag_finland',
      'footbag_foundations',
      'footbagspot_passback',
      'footbagspot_tutorials',
      'passback_basics',
      'passback_demos',
      'passback_records',
      'polini_pointers',
      'shred_global',
      'tt_youtube',
    ]);
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
