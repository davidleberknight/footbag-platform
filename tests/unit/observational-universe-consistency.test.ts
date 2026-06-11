import { describe, it, expect } from 'vitest';
import {
  OBSERVATIONAL_UNIVERSE,
  OBSERVATIONAL_UNIVERSE_STATS as STATS,
} from '../../src/content/freestyleObservationalUniverse';

// Drift guard for the generated Emerging Vocabulary snapshot. The per-section
// counts the page renders (ready / frontier / doctrine / folk / parser) are
// computed live from the array, so they cannot drift from it. The stat that CAN
// drift is the aggregate `total`, which must equal the row count, and every row
// must carry a section and intakeBucket. A regeneration that left the stats block
// inconsistent with the array (or a hand edit) fails here. No DB needed.
const KNOWN_SECTIONS = new Set(['ready', 'frontier', 'doctrine', 'folk', 'parser']);

describe('observational universe snapshot internal consistency', () => {
  it('STATS.total equals the number of rows in the array', () => {
    expect(STATS.total).toBe(OBSERVATIONAL_UNIVERSE.length);
  });

  it('every row has a known section and a non-empty intakeBucket', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      expect(KNOWN_SECTIONS.has(r.section), `unknown section "${r.section}" on ${r.slug}`).toBe(true);
      expect(typeof r.intakeBucket).toBe('string');
      expect(r.intakeBucket.length).toBeGreaterThan(0);
    }
  });

  // ---- Universe accounting guards ----
  // The five sections partition the universe; Alias/Duplicate is a cross-cutting
  // layer inside those sections, never a sixth summable bucket. These guards stop
  // the double-count proven in the reconciliation (summing the buckets over-counts
  // by the alias rows that sit in ready/frontier).
  const ALIAS = new Set(['alias', 'duplicate_variant']);

  it('section rows partition the universe: their sum equals OBSERVATIONAL_UNIVERSE.length', () => {
    const sectionSum = [...KNOWN_SECTIONS].reduce(
      (n, s) => n + OBSERVATIONAL_UNIVERSE.filter(r => r.section === s).length,
      0,
    );
    expect(sectionSum).toBe(OBSERVATIONAL_UNIVERSE.length);
  });

  it('alias/duplicate is a cross-cutting layer fully inside the sections (never added to section counts)', () => {
    const aliasRows = OBSERVATIONAL_UNIVERSE.filter(r => ALIAS.has(r.intakeBucket));
    // Every alias row already carries a section, so it is already counted in a
    // section total; adding the alias archive on top would double-count it.
    for (const r of aliasRows) {
      expect(KNOWN_SECTIONS.has(r.section), `alias row ${r.slug} has no section`).toBe(true);
    }
  });
});
