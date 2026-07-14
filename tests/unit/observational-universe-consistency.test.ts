import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  OBSERVATIONAL_UNIVERSE,
  OBSERVATIONAL_UNIVERSE_STATS as STATS,
  EMERGING_QUESTIONS,
  EMERGING_DECISION_GROUPS,
  EXTERNAL_ADJUDICATIONS,
} from '../../src/content/freestyleObservationalUniverse';

// Drift guard for the generated Emerging Vocabulary data spine: the
// six-dimension lifecycle model (object type, evidence, blocker, owner,
// publication state, public section), the question and decision registries,
// identity-level duplicate grouping, and the canonical/alias suppression
// chain. A regeneration that violates any invariant fails here. No DB needed.

const OBJECT_TYPES = new Set([
  'complete-trick', 'set-operator', 'modifier', 'terminal-contact',
  'generic-term', 'observational-name', 'source-fragment', 'malformed',
]);
const EVIDENCE_STATES = new Set([
  'exact-notation', 'verified-footage', 'authoritative-prose',
  'derivable-notation', 'partial-structure', 'compositional-name-only',
  'folk-name-only', 'contradictory', 'none', 'not-applicable',
]);
const OWNERS = new Set(['mechanical', 'james', 'james+dave', 'james+red', 'evidence', 'none']);
const SECTIONS = new Set(['decide', 'ruling', 'evidence', 'archive']);
const PUBLICATION_STATES = new Set([
  'already-represented', 'not-a-trick', 'doctrine-blocked', 'evidence-pending',
  'adjudication-pending', 'observational', 'rejected',
]);
const QUESTION_IDS = new Set(EMERGING_QUESTIONS.map(q => q.id));
const DECISION_IDS = new Set(EMERGING_DECISION_GROUPS.map(g => g.id));
const primaries = OBSERVATIONAL_UNIVERSE.filter(r => r.groupPrimary);

describe('lifecycle model: every row carries valid orthogonal dimensions', () => {
  it('object type, evidence state, owner, section, and publication state are enumerated values', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      expect(OBJECT_TYPES.has(r.objectType), `${r.name}: objectType "${r.objectType}"`).toBe(true);
      expect(EVIDENCE_STATES.has(r.evidenceState), `${r.name}: evidenceState "${r.evidenceState}"`).toBe(true);
      expect(OWNERS.has(r.owner), `${r.name}: owner "${r.owner}"`).toBe(true);
      expect(SECTIONS.has(r.publicSection), `${r.name}: publicSection "${r.publicSection}"`).toBe(true);
      expect(PUBLICATION_STATES.has(r.publicationState), `${r.name}: publicationState "${r.publicationState}"`).toBe(true);
    }
  });

  it('every blocker is a registered question, a decision group, source-recovery, or empty', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      const ok = r.blockerId === '' || r.blockerId === 'source-recovery'
        || QUESTION_IDS.has(r.blockerId) || DECISION_IDS.has(r.blockerId);
      expect(ok, `${r.name}: blocker "${r.blockerId}" is not registered`).toBe(true);
    }
  });

  it('a doctrine-blocked row always references an open registered question', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      if (r.publicationState !== 'doctrine-blocked') continue;
      expect(QUESTION_IDS.has(r.blockerId), `${r.name}: doctrine block without a question id`).toBe(true);
      const q = EMERGING_QUESTIONS.find(x => x.id === r.blockerId)!;
      expect(q.status.toLowerCase().startsWith('answered'),
        `${r.name}: gated by closed question ${q.id}`).toBe(false);
    }
  });

  it('a non-trick object never appears as an unresolved trick candidate', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      if (['set-operator', 'modifier', 'terminal-contact', 'generic-term'].includes(r.objectType)) {
        expect(r.publicSection, `${r.name}: non-trick object in "${r.publicSection}"`).toBe('archive');
      }
      if (r.objectType === 'malformed' || r.objectType === 'source-fragment') {
        expect(r.publicationState, `${r.name}: fragment not rejected`).toBe('rejected');
      }
    }
  });

  it('parser diagnostics never determine lifecycle: an active-section row is placed by its blocker or owner, not its failure class', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      if (r.publicSection === 'ruling') {
        expect(/^Q\d\d$/.test(r.blockerId), `${r.name}: ruling row without question id`).toBe(true);
      }
      if (r.publicSection === 'decide') {
        expect(r.owner, `${r.name}: decide row not curator-owned`).toBe('james');
      }
      if (r.publicSection === 'evidence') {
        expect(r.blockerId, `${r.name}: evidence row without source-recovery blocker`).toBe('source-recovery');
      }
    }
  });
});

describe('identity grouping: one public entity per identity', () => {
  it('every identity group has exactly one primary, and non-primaries fold into alsoRecordedAs', () => {
    const byKey = new Map<string, typeof OBSERVATIONAL_UNIVERSE[number][]>();
    for (const r of OBSERVATIONAL_UNIVERSE) {
      const list = byKey.get(r.identityKey) ?? [];
      list.push(r);
      byKey.set(r.identityKey, list);
    }
    for (const [key, members] of byKey) {
      const prim = members.filter(m => m.groupPrimary);
      expect(prim.length, `identity "${key}" has ${prim.length} primaries`).toBe(1);
      const others = members.filter(m => !m.groupPrimary).map(m => m.name).sort();
      expect([...prim[0]!.alsoRecordedAs].sort()).toEqual(others);
      for (const m of members.filter(x => !x.groupPrimary)) {
        expect(m.alsoRecordedAs.length, `${m.name}: non-primary carries alsoRecordedAs`).toBe(0);
      }
    }
  });

  it('a duplicated identity never renders twice (the blurry twin pairs share one primary)', () => {
    const twins = OBSERVATIONAL_UNIVERSE.filter(r =>
      r.name === 'Blurry Mirage' || r.name === 'Blurry Mirage (Blur)');
    expect(twins.length).toBe(2);
    expect(new Set(twins.map(t => t.identityKey)).size).toBe(1);
    expect(twins.filter(t => t.groupPrimary).length).toBe(1);
  });

  it('genuinely distinct identities stay separate (positional parentheticals never fold)', () => {
    const plain = OBSERVATIONAL_UNIVERSE.find(r => r.name === 'Symple Swirl (same side)');
    const far = OBSERVATIONAL_UNIVERSE.find(r => r.name === 'Symple Swirl (far)');
    expect(plain && far && plain.identityKey !== far.identityKey,
      'same-side and far configurations must remain distinct identities').toBe(true);
  });
});

describe('canonical/alias suppression: published identities never render as backlog', () => {
  // Mirror of the generator's comparison keys against the committed canonical
  // and alias sources; a live match may only sit in the archive or ride the
  // blurry name-form question (Q01), never plain backlog.
  it('a row resolving to a live identity is archived or carries the name-form question', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      if (!/^(canonical|alias):/.test(r.resolvedTarget) || r.resolutionConflict) continue;
      const ok = r.publicSection === 'archive' || r.blockerId === 'Q01';
      expect(ok, `${r.name}: resolves to ${r.resolvedTarget} but sits in ${r.publicSection}/${r.blockerId}`).toBe(true);
    }
  });

  it('a primary displayed name matching a live canonical is suppressed (Stepping DDD = blurrier)', () => {
    const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === 'Stepping DDD (Blurrier)')!;
    expect(row.publicationState).toBe('already-represented');
    expect(row.resolvedTarget).toContain('blurrier');
  });

  it('a parenthetical folk name matching a live canonical is suppressed (Quantanamera)', () => {
    const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === 'Slapping Weaving Butterfly (Quantanamera)')!;
    expect(row.publicationState).toBe('already-represented');
    expect(row.resolvedTarget).toContain('quantanamera');
  });

  it('a parenthetical folk name matching a live alias is suppressed (Grifter)', () => {
    const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === 'Illusioning Clipper (Grifter)')!;
    expect(row.publicationState).toBe('already-represented');
    expect(row.resolvedTarget).toContain('reverse_drifter');
  });

  it('multiple folk names resolving to one target suppress together (the blurry canonical twins ride Q01 as name-form questions)', () => {
    for (const name of ['Blurry Butterfly (Ripwalk)', 'Blurry Mirage (Blur)', 'Blurry Illusion (Blizzard)', 'Blurry Eggbeater (Bed Wetter)', 'Blurry Barrage (Blurrage)']) {
      const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === name)!;
      expect(row.blockerId, `${name} must ride the blurry name-form question`).toBe('Q01');
      expect(/^(canonical|alias):/.test(row.resolvedTarget), `${name} must carry its published target`).toBe(true);
    }
  });

  it('conflicting parenthetical resolutions are surfaced for adjudication, never silently suppressed', () => {
    const conflicted = OBSERVATIONAL_UNIVERSE.filter(r => r.resolutionConflict);
    for (const r of conflicted) {
      expect(r.resolvedTarget).toContain(';');
    }
    const warned = STATS.reconciliationWarnings['conflicting-parenthetical-resolutions'] ?? 0;
    expect(warned).toBe(conflicted.length);
  });

  it('a bare operator/set name never enters an active section (object guard on Nuclear)', () => {
    const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === 'Nuclear')!;
    expect(row.objectType).toBe('set-operator');
    expect(row.publicSection).toBe('archive');
  });
});

describe('operator-registry precedence over stale ledger labels', () => {
  it('no doctrine-gated row names an operator the registry defines', () => {
    expect(STATS.reconciliationWarnings['registry-defines-gated-operator'] ?? 0).toBe(0);
  });

  it('the registry-defined-operator compounds are decide-batch members until authored, then suppressed as represented', () => {
    for (const name of ['Railing Butterfly', 'Surfing Osis', 'Splicing Paradox Mirage', 'Floating Mirage']) {
      const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === name);
      if (!row) continue;   // dropped by the canonical gate: the compound is authored
      const pending = row.publicSection === 'decide' && row.blockerId === 'D2';
      const authored = row.publicationState === 'already-represented' && row.resolvedTarget !== '';
      expect(pending || authored, `${name}: neither pending D2 nor authored (${row.publicSection}/${row.blockerId})`).toBe(true);
    }
  });
});

describe('curator decision groups', () => {
  it('the seven decision-group metas exist and member counts match the data', () => {
    const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const primaryKeys = new Set(primaries.map(r => key(r.name)));
    const byId = new Map(EMERGING_DECISION_GROUPS.map(g => [g.id, g]));
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'A0']) {
      expect(byId.has(id), `decision group ${id} missing from the registry`).toBe(true);
      const g = byId.get(id)!;
      const derived = primaries.filter(r => r.blockerId === id).length
        + Object.values(EXTERNAL_ADJUDICATIONS)
            .filter(x => x.blockerId === id && !primaryKeys.has(key(x.name))).length;
      expect(g.memberCount, `member count for ${id}`).toBe(derived);
    }
  });

  it('Nuclear ss Reverse Guay resolved to nuclear_rev_guay (distributive default)', () => {
    const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === 'Nuclear ss Reverse Guay')!;
    expect(row.publicationState).toBe('already-represented');
    expect(row.resolvedTarget).toContain('nuclear_rev_guay');
  });

  it('the six down-family folk positional names resolved to their grid cells', () => {
    for (const [name, cell] of [
      ['Clipper far Double Down', 'down_double_down'], ['Clipper near Double Down', 'barfly'],
      ['Toe far Double Down', 'paradon'], ['Toe near Double Down', 'double_over_down'],
      ['Toe set os Double Over Down', 'paradon'], ['Clipper set ss Double Over Down', 'barfly'],
    ] as const) {
      const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === name)!;
      expect(row.publicationState, name).toBe('already-represented');
      expect(row.resolvedTarget, name).toContain(cell);
    }
  });

  it('the Pixie near Double Down hold stands: never resolved to the three-dex pixie_double_over_down', () => {
    const row = OBSERVATIONAL_UNIVERSE.find(r => r.name === 'Pixie near Double Down')!;
    expect(row.resolvedTarget).not.toContain('pixie_double_over_down');
    const held = row.publicSection === 'decide' && row.blockerId === 'D1';
    const traced = row.publicationState === 'already-represented' && row.resolvedTarget.includes('pixie_over_down');
    expect(held || traced, `hold or exact-match trace only (${row.publicSection}/${row.resolvedTarget})`).toBe(true);
  });

  it('a decide-section row is never a promoted identity', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      if (r.publicSection !== 'decide') continue;
      expect(/^(canonical|alias):/.test(r.resolvedTarget) && !r.resolutionConflict,
        `${r.name}: decide row resolves to ${r.resolvedTarget}`).toBe(false);
    }
  });
});

describe('question registry integrity', () => {
  it('exactly the fourteen registered questions exist', () => {
    expect(EMERGING_QUESTIONS.length).toBe(14);
    expect(EMERGING_QUESTIONS.map(q => q.id)).toEqual(
      Array.from({ length: 14 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`));
  });

  it('unlock counts match the gated primaries plus externals-only adjudications (no double-count)', () => {
    const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const primaryKeys = new Set(primaries.map(r => key(r.name)));
    for (const q of EMERGING_QUESTIONS) {
      const gated = primaries.filter(r => r.blockerId === q.id).length
        + Object.values(EXTERNAL_ADJUDICATIONS)
            .filter(x => x.blockerId === q.id && !primaryKeys.has(key(x.name))).length;
      expect(q.unlockCount, `unlock count for ${q.id}`).toBe(gated);
    }
  });
});

describe('generated stats partition the data', () => {
  it('STATS.total equals the row count and identityCount equals the primary count', () => {
    expect(STATS.total).toBe(OBSERVATIONAL_UNIVERSE.length);
    expect(STATS.identityCount).toBe(primaries.length);
  });

  it('publicSections, ownerCounts, and publicationStates partition the primaries', () => {
    for (const [dim, counts] of [
      ['publicSection', STATS.publicSections],
      ['owner', STATS.ownerCounts],
      ['publicationState', STATS.publicationStates],
    ] as const) {
      let sum = 0;
      for (const [value, n] of Object.entries(counts)) {
        const derived = primaries.filter(r => String(r[dim]) === value).length;
        expect(n, `${dim}=${value}`).toBe(derived);
        sum += n;
      }
      expect(sum).toBe(primaries.length);
    }
  });

  it('the old nine-state ladder fields are gone from rows and stats', () => {
    const row = OBSERVATIONAL_UNIVERSE[0] as unknown as Record<string, unknown>;
    expect(row['evState']).toBeUndefined();
    expect(row['holdKind']).toBeUndefined();
    const stats = STATS as unknown as Record<string, unknown>;
    expect(stats['evStates']).toBeUndefined();
    expect(stats['evProgress']).toBeUndefined();
  });
});
