/**
 * Unit tests for src/content/freestyleEquivalenceTopology.ts.
 *
 * The module is the Phase 1 pilot of the equivalence-topology layer
 * (alternate-derivation entries for tricks whose canonical reading
 * admits a structurally distinct path). Tests pin schema invariants
 * + content membership so a future inadvertent edit fails loudly.
 *
 * Design doc:
 *   exploration/equivalence-topology-phase-1-2026-05-21/DESIGN.md
 */
import { describe, it, expect } from 'vitest';
import {
  EQUIVALENCE_TOPOLOGY,
  getEquivalenceTopologyFor,
  getRatifiedEquivalenceTopology,
  type DerivationRole,
  type DerivationSource,
  type DerivationStatus,
  type EquivalencePattern,
} from '../../src/content/freestyleEquivalenceTopology';

const VALID_ROLES: ReadonlySet<DerivationRole> = new Set<DerivationRole>([
  'canonical-primary',
  'alternate-equivalent',
  'historical',
  'doctrine-locked-alternate',
  'deprecated',
]);

const VALID_SOURCES: ReadonlySet<DerivationSource> = new Set<DerivationSource>([
  'curator-derived',
  'historical',
  'community',
  'structural',
]);

const VALID_STATUSES: ReadonlySet<DerivationStatus> = new Set<DerivationStatus>([
  'pending-curator',
  'confirmed',
  'wave-2-gated',
  'doctrine-locked',
]);

const VALID_PATTERNS: ReadonlySet<EquivalencePattern> = new Set<EquivalencePattern>([
  'modifier-stack-vs-paradox-stack',
  'flat-stack-vs-composite-base',
  'folk-name-vs-structural',
  'rotational-reinterpretation',
  'hidden-component',
]);

describe('freestyleEquivalenceTopology — schema invariants', () => {
  it('exposes a non-empty readonly entries array (Phase 1 pilot)', () => {
    expect(EQUIVALENCE_TOPOLOGY.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty slug + displayName + summary', () => {
    for (const entry of EQUIVALENCE_TOPOLOGY) {
      expect(entry.slug, 'slug must be non-empty').toMatch(/^[a-z][a-z0-9-]*$/);
      expect(entry.displayName.length, `${entry.slug} displayName`).toBeGreaterThan(0);
      expect(entry.summary.length, `${entry.slug} summary`).toBeGreaterThan(0);
    }
  });

  it('every entry has a recognised pattern label', () => {
    for (const entry of EQUIVALENCE_TOPOLOGY) {
      expect(VALID_PATTERNS.has(entry.pattern), `${entry.slug} pattern ${entry.pattern}`).toBe(true);
    }
  });

  it('every entry carries at least two derivation paths (otherwise no topology)', () => {
    for (const entry of EQUIVALENCE_TOPOLOGY) {
      expect(entry.derivations.length, `${entry.slug} derivations.length`).toBeGreaterThanOrEqual(2);
    }
  });

  it('index 0 of every entry is canonical-primary (forever-rule)', () => {
    for (const entry of EQUIVALENCE_TOPOLOGY) {
      expect(entry.derivations[0].role, `${entry.slug} derivations[0].role`).toBe('canonical-primary');
    }
  });

  it('every derivation path has valid role / source / status enums', () => {
    for (const entry of EQUIVALENCE_TOPOLOGY) {
      for (const [i, path] of entry.derivations.entries()) {
        const where = `${entry.slug}.derivations[${i}]`;
        expect(VALID_ROLES.has(path.role), `${where}.role ${path.role}`).toBe(true);
        expect(VALID_SOURCES.has(path.source), `${where}.source ${path.source}`).toBe(true);
        expect(VALID_STATUSES.has(path.status), `${where}.status ${path.status}`).toBe(true);
        expect(path.reading.length, `${where}.reading`).toBeGreaterThan(0);
      }
    }
  });

  it('slug uniqueness — each slug appears at most once', () => {
    const seen = new Set<string>();
    for (const entry of EQUIVALENCE_TOPOLOGY) {
      expect(seen.has(entry.slug), `duplicate slug: ${entry.slug}`).toBe(false);
      seen.add(entry.slug);
    }
  });

  it('addBreakdown values inside one entry are arithmetically consistent', () => {
    // Each entry's derivation paths represent the SAME canonical ADD via
    // different structural decompositions. When breakdowns are present
    // they should each evaluate to the same total. Parse the trailing
    // "= N ADD" segment; mismatches mean the entry is broken.
    const totalPattern = /=\s*(\d+)\s*ADD\s*$/i;
    for (const entry of EQUIVALENCE_TOPOLOGY) {
      const totals = entry.derivations
        .filter(p => p.addBreakdown)
        .map(p => {
          const m = totalPattern.exec(p.addBreakdown ?? '');
          return m ? Number(m[1]) : null;
        })
        .filter((n): n is number => n !== null);
      if (totals.length < 2) continue;
      const first = totals[0];
      for (const t of totals.slice(1)) {
        expect(t, `${entry.slug} addBreakdown totals disagree (${first} vs ${t})`).toBe(first);
      }
    }
  });
});

describe('freestyleEquivalenceTopology — Phase 1 pilot membership', () => {
  it('flurry entry is present', () => {
    const flurry = getEquivalenceTopologyFor('flurry');
    expect(flurry).not.toBeNull();
    expect(flurry?.slug).toBe('flurry');
    expect(flurry?.pattern).toBe('modifier-stack-vs-paradox-stack');
  });

  it('flurry pilot ships pending curator confirmation (Phase 1 contract)', () => {
    const flurry = getEquivalenceTopologyFor('flurry');
    expect(flurry?.curatorConfirmPending).toBe(true);
  });

  it('flurry has exactly two derivation paths: canonical-primary + alternate-equivalent', () => {
    const flurry = getEquivalenceTopologyFor('flurry');
    expect(flurry?.derivations.length).toBe(2);
    expect(flurry?.derivations[0].role).toBe('canonical-primary');
    expect(flurry?.derivations[1].role).toBe('alternate-equivalent');
  });

  it('flurry canonical-primary reading is barraging legover', () => {
    const flurry = getEquivalenceTopologyFor('flurry');
    expect(flurry?.derivations[0].reading).toBe('barraging legover');
  });

  it('flurry alternate reading is paradox-stack', () => {
    const flurry = getEquivalenceTopologyFor('flurry');
    expect(flurry?.derivations[1].reading).toBe('paradox + paradox legover');
  });
});

describe('freestyleEquivalenceTopology — accessor functions', () => {
  it('getEquivalenceTopologyFor returns null for unknown slug', () => {
    expect(getEquivalenceTopologyFor('not-a-real-trick')).toBeNull();
    expect(getEquivalenceTopologyFor('')).toBeNull();
  });

  it('getRatifiedEquivalenceTopology excludes all curatorConfirmPending entries (Phase 1: returns empty)', () => {
    // Phase 1 ships one pending entry; no public surface should consume
    // pending entries. The ratified projection is empty until the
    // curator flips the flag.
    const ratified = getRatifiedEquivalenceTopology();
    for (const entry of ratified) {
      expect(entry.curatorConfirmPending, `${entry.slug} should not be pending`).toBe(false);
    }
  });
});
