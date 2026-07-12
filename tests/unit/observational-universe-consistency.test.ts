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

  // ---- Nine-state ladder guards ----
  // The generator stamps every row with exactly one evState; the stats block
  // carries the per-state counts and the progress metric. A regeneration (or
  // hand edit) that breaks the partition or the arithmetic fails here.
  const LADDER = [
    'ready', 'authoring', 'doctrine', 'governance', 'identification',
    'parser', 'undefined_operator', 'folk', 'alias',
  ];

  it('every row carries one of the nine ladder states, a holdKind, and a flags array', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      expect(LADDER.includes(r.evState), `unknown evState "${r.evState}" on ${r.slug}`).toBe(true);
      expect(typeof r.holdKind).toBe('string');
      expect(r.holdKind.length).toBeGreaterThan(0);
      expect(Array.isArray(r.flags)).toBe(true);
    }
  });

  it('STATS.evStates matches the row-derived counts and partitions the universe', () => {
    let sum = 0;
    for (const s of LADDER) {
      const derived = OBSERVATIONAL_UNIVERSE.filter(r => r.evState === s).length;
      expect(STATS.evStates[s], `evStates.${s} disagrees with the rows`).toBe(derived);
      sum += derived;
    }
    expect(sum).toBe(OBSERVATIONAL_UNIVERSE.length);
  });

  it('an alias-bucket row is always in the alias state, and vice versa', () => {
    for (const r of OBSERVATIONAL_UNIVERSE) {
      const isArchive = ALIAS.has(r.intakeBucket);
      expect(r.evState === 'alias', `${r.slug}: alias state and archive bucket must coincide`)
        .toBe(isArchive);
    }
  });

  it('STATS.evProgress is (ready + authoring) over the non-alias universe, pct rounded', () => {
    const ready = OBSERVATIONAL_UNIVERSE.filter(r => r.evState === 'ready').length;
    const authoring = OBSERVATIONAL_UNIVERSE.filter(r => r.evState === 'authoring').length;
    const alias = OBSERVATIONAL_UNIVERSE.filter(r => r.evState === 'alias').length;
    expect(STATS.evProgress.numerator).toBe(ready + authoring);
    expect(STATS.evProgress.denominator).toBe(OBSERVATIONAL_UNIVERSE.length - alias);
    expect(STATS.evProgress.pct).toBe(
      Math.round((100 * STATS.evProgress.numerator) / STATS.evProgress.denominator));
  });
});

// A name whose trick is already published must not also sit on the Emerging
// Vocabulary surface, even when the observational name carries a folk-nickname
// suffix, an abbreviation, or a parenthetical folk name. The gate resolves each
// of those forms to its canonical/alias slug and drops the row. The one form it
// must never resolve away is a side configuration: a same-side / far / near
// positional variant is a distinct trick and stays on the surface unless it has
// its own explicit equivalence alias.
describe('emerging vocabulary: published names are gated, positional variants are kept', () => {
  const has = (name: string) => OBSERVATIONAL_UNIVERSE.some(r => r.name === name);

  it('gates a name carrying a folk-nickname suffix (resolves to the published base)', () => {
    // "Nuclear Drifter (69)" is nuclear_drifter; "Shooting Barfly (Porn Star)" is
    // shooting_barfly. The folk nickname in parentheses is decoration, not identity.
    expect(has('Nuclear Drifter (69)')).toBe(false);
    expect(has('Shooting Barfly (Porn Star)')).toBe(false);
  });

  it('gates an abbreviation form that expands to a published trick', () => {
    // DLO expands to double_leg_over: "Nuclear DLO (Terminator)" is
    // nuclear_double_leg_over, "Spinning DLO" is spinning_double_leg_over.
    expect(has('Nuclear DLO (Terminator)')).toBe(false);
    expect(has('Spinning DLO')).toBe(false);
    expect(has('Tapping DLO')).toBe(false);
  });

  it('keeps a parenthetical folk name that is itself the published canonical/alias, flagged as alias for the request-time gate', () => {
    // The universe is a pure corpus artifact that carries every documented name,
    // including one that resolves to a published canonical or alias. Such a row is
    // flagged evState 'alias' and dropped from the rendered surface at request time,
    // not removed from the corpus. "Gyro Torque (Mobius)" resolves through the
    // gyro_torque alias to mobius; "Atomic Mirage (Atom Smasher)" resolves to
    // atom_smasher.
    const aliasFlagged = (name: string) =>
      OBSERVATIONAL_UNIVERSE.some(r => r.name === name && r.evState === 'alias');
    expect(aliasFlagged('Gyro Torque (Mobius)')).toBe(true);
    expect(aliasFlagged('Atomic Mirage (Atom Smasher)')).toBe(true);
  });

  it('keeps a same-side positional variant that has no explicit equivalence alias', () => {
    // The base exists (nuclear_guay, shooting_clipper) but there is no ss-form
    // alias, so the side configuration is a distinct trick and must stay.
    expect(has('Nuclear ss Guay')).toBe(true);
    expect(has('Shooting ss Clipper')).toBe(true);
  });

  it('keeps a positional variant even when its base IS published (never collapses to the base)', () => {
    // fairy_double_leg_over is a published trick, but "Fairy DLO (ss)" is its
    // same-side variant: the parenthetical positional marker is kept, not stripped,
    // so the row is never folded into the base.
    expect(has('Fairy DLO (ss)')).toBe(true);
  });
});
