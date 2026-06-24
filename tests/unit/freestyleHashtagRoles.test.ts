/**
 * Shape + invariant tests for the dual-role hashtag registry.
 *
 * The registry is declarative data with no consumers yet, so these guard the
 * contract a future hashtag-form shaper and the media-tag bare-token guard will
 * rely on: that role drives hashtag form (not row type), that the bare namespace
 * stays reserved for trick-role concepts, and that the dual-role membership
 * stays conservative — pixie and fairy only, with toe and clipper deliberately
 * excluded until their trick-versus-set split is decided.
 */
import { describe, it, expect } from 'vitest';
import {
  DUAL_ROLE_REGISTRY,
  getDeclaredRoles,
  declaresRole,
  declaresTrickRole,
  type HashtagRole,
} from '../../src/content/freestyleHashtagRoles';

const ROLE_VOCABULARY: readonly HashtagRole[] = ['trick', 'set', 'operator', 'family'];

describe('freestyleHashtagRoles — registry membership', () => {
  it('lists exactly pixie and fairy as dual-role concepts', () => {
    expect(Object.keys(DUAL_ROLE_REGISTRY).sort()).toEqual(['fairy', 'pixie']);
  });

  it('declares pixie and fairy as both trick and set', () => {
    expect([...DUAL_ROLE_REGISTRY.pixie].sort()).toEqual(['set', 'trick']);
    expect([...DUAL_ROLE_REGISTRY.fairy].sort()).toEqual(['set', 'trick']);
  });

  it('does not list set-only or operator-only concepts', () => {
    for (const slug of ['atomic', 'quantum', 'furious', 'blurry', 'nuclear', 'stepping', 'symposium', 'paradox']) {
      expect(getDeclaredRoles(slug)).toBeUndefined();
    }
  });

  it('does not list toe or clipper (the deferred trick-versus-set question)', () => {
    expect(getDeclaredRoles('toe')).toBeUndefined();
    expect(getDeclaredRoles('clipper')).toBeUndefined();
  });

  it('every declared role is a member of the role vocabulary', () => {
    for (const roles of Object.values(DUAL_ROLE_REGISTRY)) {
      for (const role of roles) {
        expect(ROLE_VOCABULARY).toContain(role);
      }
    }
  });
});

describe('freestyleHashtagRoles — accessors', () => {
  it('declaresRole reflects the registry for dual-role concepts', () => {
    expect(declaresRole('pixie', 'set')).toBe(true);
    expect(declaresRole('pixie', 'trick')).toBe(true);
    expect(declaresRole('fairy', 'set')).toBe(true);
  });

  it('declaresRole is false for single-role concepts and unknown slugs', () => {
    expect(declaresRole('atomic', 'set')).toBe(false);
    expect(declaresRole('whirl', 'trick')).toBe(false);
    expect(declaresRole('not-a-real-slug', 'trick')).toBe(false);
  });

  it('declaresTrickRole re-opens the bare namespace only for dual-role tricks', () => {
    expect(declaresTrickRole('pixie')).toBe(true);
    expect(declaresTrickRole('fairy')).toBe(true);
    // Set-only / operator-only concepts and bases keep the bare namespace closed
    // here; a structural trick gets its bare tag from the consumer, not this file.
    expect(declaresTrickRole('atomic')).toBe(false);
    expect(declaresTrickRole('quantum')).toBe(false);
    expect(declaresTrickRole('whirl')).toBe(false);
  });
});
