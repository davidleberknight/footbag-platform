/**
 * Shape + invariant tests for the curated media taxonomy registry.
 *
 * The registry is declarative data with no consumers yet, so these guard the
 * vocabulary contract future consumers (validator, coverage metrics, media
 * strips) will rely on — especially the firewall invariant that no media
 * relationship type is ever an ontology claim, and that the linkage-prefix
 * and utility-tag vocabularies stay coherent with the live media-tag rules.
 */
import { describe, it, expect } from 'vitest';
import {
  UTILITY_EXACT_TAGS,
  REQUIRED_SIDECAR_UTILITY_TAGS,
  MEDIA_KINDS,
  LINKAGE_NAMESPACES,
  CURATED_REVIEW_STATES,
  MEDIA_RELATION_TYPES,
  type MediaTeachingIntent,
} from '../../src/content/freestyleMediaTaxonomy';

const TEACHING_INTENTS: readonly MediaTeachingIntent[] = [
  'instructional',
  'demonstration',
  'analysis',
  'archival',
];

describe('freestyleMediaTaxonomy — utility tags', () => {
  it('mirrors the live media-tag invariant frozenset exactly', () => {
    // Drift guard: this must stay in lockstep with the validator's UTILITY_EXACT.
    expect([...UTILITY_EXACT_TAGS].sort()).toEqual(
      ['curated', 'freestyle', 'passback_records', 'trick', 'tricks_of_the_trade'].sort(),
    );
  });

  it('required sidecar utility tags are a subset of the exact set', () => {
    for (const t of REQUIRED_SIDECAR_UTILITY_TAGS) {
      expect(UTILITY_EXACT_TAGS).toContain(t);
    }
  });

  it('all utility tags are lowercase and contain no leading #', () => {
    for (const t of UTILITY_EXACT_TAGS) {
      expect(t).toBe(t.toLowerCase());
      expect(t.startsWith('#')).toBe(false);
    }
  });
});

describe('freestyleMediaTaxonomy — media kinds', () => {
  it('keys are unique, lowercase, and contain no spaces or #', () => {
    const keys = MEDIA_KINDS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) {
      expect(k).toBe(k.toLowerCase());
      expect(k).not.toMatch(/[\s#]/);
    }
  });

  it('every kind declares a recognized teaching intent and a description', () => {
    for (const kind of MEDIA_KINDS) {
      expect(TEACHING_INTENTS).toContain(kind.teachingIntent);
      expect(kind.label.length).toBeGreaterThan(0);
      expect(kind.description.length).toBeGreaterThan(0);
    }
  });
});

describe('freestyleMediaTaxonomy — linkage namespaces', () => {
  it('prefixes are unique, lowercase, and end with a single underscore', () => {
    const prefixes = LINKAGE_NAMESPACES.map((n) => n.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const p of prefixes) {
      expect(p).toBe(p.toLowerCase());
      expect(p.endsWith('_')).toBe(true);
      expect(p).not.toMatch(/[\s#-]/); // snake_case, not hyphenated
    }
  });

  it('the validator-recognized linkage prefixes are set_, operator_, and family_', () => {
    // Drift guard: must stay in lockstep with the entity-linkage prefixes the
    // media-tag invariant accepts. operator_ is the canonical operator/modifier
    // form; there is no modifier_ prefix.
    const recognized = LINKAGE_NAMESPACES.filter((n) => n.validatorRecognized);
    expect(recognized.map((n) => n.prefix).sort()).toEqual(['family_', 'operator_', 'set_']);
  });
});

describe('freestyleMediaTaxonomy — curated review states', () => {
  it('declares the three trust-ladder states in order', () => {
    expect(CURATED_REVIEW_STATES.map((s) => s.state)).toEqual([
      'unverified-curated',
      'curated',
      'expert-reviewed',
    ]);
  });
});

describe('freestyleMediaTaxonomy — relationship types', () => {
  it('declares the five minimal relations, keys unique', () => {
    const keys = MEDIA_RELATION_TYPES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(
      ['components-covered', 'demonstrates', 'exemplar-of', 'progression-step', 'teaches'].sort(),
    );
  });

  it('FIREWALL: no relation type ever implies an ontology claim', () => {
    for (const rel of MEDIA_RELATION_TYPES) {
      expect(rel.impliesOntologyClaim).toBe(false);
    }
  });

  it('every relation has at least one allowed target', () => {
    for (const rel of MEDIA_RELATION_TYPES) {
      expect(rel.allowedTargets.length).toBeGreaterThan(0);
    }
  });
});
