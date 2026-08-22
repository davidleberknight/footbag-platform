import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The swirl-chain terminal-replacement convention is corroborated by four
// published compounds and applied to two further rows that were authored FROM
// the convention. A derived row conforming to the rule it was generated from is
// not evidence, so it must never enlarge the independent-exemplar count: a
// report that says six of six conform states something evidentially false.
//
// This guards that split. The classification below is the one the derivation
// doctrine records; the assertions check the doctrine and the row provenance
// still agree with it, so a derived row cannot be promoted into the independent
// set by editing one place alone.

type Evidence = 'independent' | 'derived';

const EXEMPLARS: readonly { slug: string; display: string; evidence: Evidence }[] = [
  { slug: 'butterfly_swirl',                display: 'Butterfly Swirl',                evidence: 'independent' },
  { slug: 'barfly_swirl',                   display: 'Barfly Swirl',                   evidence: 'independent' },
  { slug: 'paradon_swirl',                  display: 'Paradon Swirl',                  evidence: 'independent' },
  { slug: 'double_over_down_swirl',         display: 'Double Over Down Swirl',         evidence: 'independent' },
  { slug: 'dada_curve_swirl',               display: 'Dada Curve Swirl',               evidence: 'derived' },
  { slug: 'double_over_down_reverse_swirl', display: 'Double Over Down Reverse Swirl', evidence: 'derived' },
];

// The sentence every derived row carries in its provenance.
const NEVER_EVIDENCE = 'is never evidence for it';

const corrections = readFileSync(
  join(process.cwd(), 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

const independent = EXEMPLARS.filter(e => e.evidence === 'independent');
const derived = EXEMPLARS.filter(e => e.evidence === 'derived');

const correctionRow = (slug: string) =>
  corrections.find(l => l.startsWith(`${slug},operational_notation,,`));

/** The reporting shape: independent and derived are counted separately, never pooled. */
function evidenceReport(conforming: readonly string[]): string {
  const ind = independent.filter(e => conforming.includes(e.slug)).length;
  const der = derived.filter(e => conforming.includes(e.slug)).length;
  return `${ind}/${independent.length} independent exemplars pass; ${der}/${derived.length} derived rows conform`;
}

describe('swirl-chain terminal replacement: evidence provenance', () => {
  it('counts four independent exemplars and two derived rows', () => {
    expect(independent).toHaveLength(4);
    expect(derived).toHaveLength(2);
  });

  it('every derived row states in its provenance that it is not evidence', () => {
    for (const e of derived) {
      const row = correctionRow(e.slug);
      expect(row, `red_corrections row for ${e.slug}`).toBeDefined();
      expect(row!, `${e.display} must carry the not-evidence marker`).toContain(NEVER_EVIDENCE);
    }
  });

  it('no independent exemplar carries the not-evidence marker', () => {
    for (const e of independent) {
      const row = correctionRow(e.slug);
      if (row) expect(row).not.toContain(NEVER_EVIDENCE);
    }
  });

  it('a derived row conforming to the rule never enlarges the independent count', () => {
    const allConform = EXEMPLARS.map(e => e.slug);
    const report = evidenceReport(allConform);
    expect(report).toBe('4/4 independent exemplars pass; 2/2 derived rows conform');
    // The pooled figure is the one that would mislead a later audit.
    expect(report).not.toContain('6/6');
    expect(report).not.toContain(`${EXEMPLARS.length}/${EXEMPLARS.length}`);
  });

  it('reclassifying a derived row as independent is rejected by the provenance it carries', () => {
    // Simulates the silent-promotion failure: treat a derived row as independent
    // and the marker it carries contradicts the claim.
    for (const e of derived) {
      const row = correctionRow(e.slug)!;
      const promotedWouldBeValid = !row.includes(NEVER_EVIDENCE);
      expect(promotedWouldBeValid, `${e.display} cannot be promoted to independent`).toBe(false);
    }
  });
});
