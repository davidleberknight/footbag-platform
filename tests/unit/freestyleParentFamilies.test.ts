/**
 * Unit tests for the parent-family skeleton registry
 * (src/content/freestyleParentFamilies.ts) plus its companion route-out set
 * in freestyleFamilyOverrides.ts.
 *
 * The registry is the reversible content map that drives the Family-view
 * taxonomy: 8 canonical parent anchors, approved child→parent folds, and the
 * "Whirl / Swirl" display override. Route-outs (modifier ecosystems,
 * alternative surfaces, foundational surfaces, multi-bag/kick primitives) are
 * expressed as RETIRED_FAMILIES. These are long-term contracts; a change here
 * reshapes the public Family browse surface.
 */
import { describe, it, expect } from 'vitest';

import {
  PARENT_FAMILY_OF_LABEL,
  PARENT_FAMILY_ORDER,
  PARENT_FAMILY_DISPLAY,
  resolveParentFamily,
  isParentFamily,
} from '../../src/content/freestyleParentFamilies';
import { isRetiredFamily } from '../../src/content/freestyleFamilyOverrides';

describe('parent-family registry — the 8 canonical anchors', () => {
  it('lists exactly the 8 approved parent anchors in order', () => {
    expect(PARENT_FAMILY_ORDER).toEqual([
      'mirage',
      'illusion',
      'butterfly',
      'legover',
      'pickup',
      'whirl',
      'osis',
      'around-the-world',
    ]);
  });

  it('isParentFamily is true for each anchor, false otherwise', () => {
    for (const slug of PARENT_FAMILY_ORDER) {
      expect(isParentFamily(slug), `${slug} should be a parent`).toBe(true);
    }
    for (const notParent of ['torque', 'swirl', 'pixie', 'toe-stall', 'eclipse', 'drifter']) {
      expect(isParentFamily(notParent), `${notParent} should NOT be a parent`).toBe(false);
    }
  });

  it('every parent resolves to itself (parents are not folded)', () => {
    for (const slug of PARENT_FAMILY_ORDER) {
      expect(resolveParentFamily(slug)).toBe(slug);
    }
  });

  it('whirl carries the combined "Whirl / Swirl" display name; other parents use the default resolver', () => {
    expect(PARENT_FAMILY_DISPLAY.get('whirl')).toBe('Whirl / Swirl');
    for (const slug of PARENT_FAMILY_ORDER) {
      if (slug !== 'whirl') {
        expect(PARENT_FAMILY_DISPLAY.get(slug)).toBeUndefined();
      }
    }
  });
});

describe('parent-family registry — approved child folds (R5)', () => {
  const folds: Array<[string, string]> = [
    ['swirl', 'whirl'],
    ['twirl', 'whirl'],
    ['rev-whirl', 'whirl'],
    ['whirling-swirl', 'whirl'],
    ['torque', 'osis'],
    ['blender', 'osis'],
    ['mobius', 'osis'],
    ['double-leg-over', 'legover'],
    ['guay', 'legover'],
    ['eggbeater', 'legover'],
    ['double-pickup', 'pickup'],
    ['atw', 'around-the-world'],
    ['double-around-the-world', 'around-the-world'],
    ['paradox-mirage', 'mirage'],
    ['paradox-illusion', 'mirage'],
  ];

  it.each(folds)('child label %s folds into parent %s', (child, parent) => {
    expect(resolveParentFamily(child)).toBe(parent);
    expect(PARENT_FAMILY_OF_LABEL.get(child)).toBe(parent);
  });

  it('every fold target is one of the 8 canonical parents', () => {
    for (const target of PARENT_FAMILY_OF_LABEL.values()) {
      expect(PARENT_FAMILY_ORDER).toContain(target);
    }
  });
});

describe('parent-family registry — deferred labels are untouched (R6)', () => {
  // Deferred labels have NO parent entry and are NOT retired: they keep
  // rendering as their own family until the full ruling pass.
  const deferred = ['eclipse', 'drifter', 'reverse-drifter', 'butterfly-swirl', 'orbit', 'double-over-down', 'barfly', 'flail'];

  it.each(deferred)('deferred label %s resolves to itself and is not a parent', (slug) => {
    expect(resolveParentFamily(slug)).toBe(slug);
    expect(isParentFamily(slug)).toBe(false);
  });

  it.each(deferred)('deferred label %s is NOT routed out (not retired)', (slug) => {
    expect(isRetiredFamily(slug)).toBe(false);
  });
});

describe('route-outs — retired from the Family view (R2/R3/R4/R7)', () => {
  it.each([
    // Modifier ecosystems
    'pixie', 'fairy', 'atomic', 'quantum', 'surging', 'terrage', 'spyro', 'pogo', 'rooted', 'sailing', 'shooting', 'furious',
    // Alternative surfaces
    'cross-body-sole-stall', 'sole-stall', 'heel-stall', 'sole-kick', 'inside-stall', 'outside-stall',
    'head-stall', 'neck-stall', 'shoulder-stall', 'forehead-stall', 'cloud-stall', 'cloud-kick',
    'knee-stall', 'dragonfly-kick', 'flying-inside', 'flying-outside',
    // Foundational surfaces
    'toe-stall', 'clipper-stall', 'clipper',
    // Multi-bag / kick primitives
    '2-bag-juggling', '3-bag-juggling', 'spin', 'double-spin', 'double-knee', 'knee-clipper',
  ])('route-out label %s is retired', (slug) => {
    expect(isRetiredFamily(slug)).toBe(true);
  });

  it('no canonical parent is accidentally retired', () => {
    for (const parent of PARENT_FAMILY_ORDER) {
      expect(isRetiredFamily(parent), `${parent} must not be retired`).toBe(false);
    }
  });

  it('no child fold target is retired (children survive by folding into a live parent)', () => {
    for (const target of PARENT_FAMILY_OF_LABEL.values()) {
      expect(isRetiredFamily(target)).toBe(false);
    }
  });
});
