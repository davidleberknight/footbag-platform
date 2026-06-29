/**
 * Unit tests for src/content/freestyleEquivalenceTopology.ts.
 *
 * The module is the Phase 1 pilot of the equivalence-topology layer
 * (alternate-derivation entries for tricks whose canonical reading
 * admits a structurally distinct path). Tests pin schema invariants
 * + content membership so a future inadvertent edit fails loudly.
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
  'doctrine-gated',
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

  it('canonical-primary + alternate-equivalent breakdown totals agree within each entry', () => {
    // Arithmetic-convergence invariant: paths whose role makes a
    // CURRENT structural claim (canonical-primary, alternate-equivalent)
    // MUST evaluate to the same total. Paths with role 'historical',
    // 'doctrine-locked-alternate', or 'deprecated' may carry naïve /
    // superseded breakdowns that don't converge — those readings are
    // preserved as pedagogical/historical context, not competing claims.
    const totalPattern = /=\s*(\d+)\s*ADD\s*$/i;
    const convergingRoles: ReadonlySet<DerivationRole> = new Set([
      'canonical-primary',
      'alternate-equivalent',
    ]);
    for (const entry of EQUIVALENCE_TOPOLOGY) {
      const totals = entry.derivations
        .filter(p => convergingRoles.has(p.role) && p.addBreakdown)
        .map(p => {
          const m = totalPattern.exec(p.addBreakdown ?? '');
          return m ? Number(m[1]) : null;
        })
        .filter((n): n is number => n !== null);
      if (totals.length < 2) continue;
      const first = totals[0];
      for (const t of totals.slice(1)) {
        expect(t, `${entry.slug} converging-role breakdowns disagree (${first} vs ${t})`).toBe(first);
      }
    }
  });
});

describe('freestyleEquivalenceTopology — ratified membership', () => {
  it('flurry entry is present and ratified', () => {
    const flurry = getEquivalenceTopologyFor('flurry');
    expect(flurry).not.toBeNull();
    expect(flurry?.slug).toBe('flurry');
    expect(flurry?.pattern).toBe('modifier-stack-vs-paradox-stack');
    expect(flurry?.curatorConfirmPending).toBe(false);
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

  it('witchdoctor entry is present and ratified', () => {
    const witchdoctor = getEquivalenceTopologyFor('witchdoctor');
    expect(witchdoctor).not.toBeNull();
    expect(witchdoctor?.slug).toBe('witchdoctor');
    expect(witchdoctor?.pattern).toBe('flat-stack-vs-composite-base');
    expect(witchdoctor?.curatorConfirmPending).toBe(false);
  });

  it('witchdoctor canonical-primary is the composite-base reading (Red 2026-05-20)', () => {
    const witchdoctor = getEquivalenceTopologyFor('witchdoctor');
    expect(witchdoctor?.derivations[0].role).toBe('canonical-primary');
    expect(witchdoctor?.derivations[0].reading).toBe('atom-smasher + symposium');
  });

  it('witchdoctor alternate flat-stack is role=historical (naïve undercount preserved for pedagogy)', () => {
    const witchdoctor = getEquivalenceTopologyFor('witchdoctor');
    expect(witchdoctor?.derivations[1].role).toBe('historical');
    expect(witchdoctor?.derivations[1].reading).toBe('atomic symposium mirage');
  });
});

describe('freestyleEquivalenceTopology — accessor functions', () => {
  it('getEquivalenceTopologyFor returns null for unknown slug', () => {
    expect(getEquivalenceTopologyFor('not-a-real-trick')).toBeNull();
    expect(getEquivalenceTopologyFor('')).toBeNull();
  });

  it('getRatifiedEquivalenceTopology excludes all curatorConfirmPending entries', () => {
    const ratified = getRatifiedEquivalenceTopology();
    for (const entry of ratified) {
      expect(entry.curatorConfirmPending, `${entry.slug} should not be pending`).toBe(false);
    }
  });

  it('getRatifiedEquivalenceTopology surfaces both flurry and witchdoctor', () => {
    const slugs = getRatifiedEquivalenceTopology().map(e => e.slug);
    expect(slugs).toContain('flurry');
    expect(slugs).toContain('witchdoctor');
  });
});
