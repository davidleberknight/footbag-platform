/**
 * Clipper-terminal matrix doctrine.
 *
 * Whirl, Reverse Whirl, Swirl, and Reverse Swirl form one 2x2 matrix: which leg
 * performs the dexterity (OP or SAME) crossed with which direction it circles
 * (IN or OUT). All four share a flexible SET entry and a clipper terminal
 * ([XBD] [DEL]) and score 3 ADD. BACK SWIRL is retired as a dexterity token:
 * the swirl-motion dex is SAME OUT and the reverse-swirl dex is SAME IN, written
 * in the ordinary IN/OUT vocabulary.
 *
 * The snapshot fixture mirrors the built canonical database, so these
 * assertions pin the canonical data itself, and the hand-authored core-trick
 * specification is separately pinned equal to it so public rendering can never
 * come from a contradictory hand-authored formula.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_TRICK_SPEC } from '../../src/content/freestyleLandingContent';

interface SnapshotTrick {
  slug: string;
  adds: string | null;
  operational_notation: string | null;
}

const snapshot = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/fixtures/freestyleDictionarySnapshot.json'), 'utf8',
)) as { tricks: SnapshotTrick[] };

const bySlug = new Map(snapshot.tricks.map(t => [t.slug, t]));
const notation = (slug: string): string => {
  const row = bySlug.get(slug);
  expect(row, `snapshot row for ${slug}`).toBeDefined();
  return row!.operational_notation ?? '';
};

const MATRIX = {
  whirl:     'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',
  rev_whirl: 'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  swirl:     'SET > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]',
  rev_swirl: 'SET > SAME IN [DEX] > SAME CLIP [XBD] [DEL]',
} as const;

// Every row the matrix migration re-derived; each must keep bracket-count == ADD.
const MIGRATED_SLUGS = [
  'atomic_reverse_swirl', 'atomic_swirl', 'barfly_swirl',
  'barraging_barfly_swirl', 'barraging_butterfly_swirl', 'big_papa_smurf',
  'bling_blang', 'blurry_whirling_swirl', 'butterfly_swirl',
  'diving_reverse_swirl', 'diving_swirl', 'double_over_down_swirl',
  'ducking_butterfly_swirl', 'fairy_butterfly_swirl', 'fairy_reverse_swirl',
  'fairy_ripstein', 'fairy_swirl', 'fairy_swirling_swirl',
  'gyro_butterfly_swirl', 'gyro_symposium_swirl', 'gyro_whirling_swirl',
  'hop_over_swirl', 'paradon_swirl', 'paradox_whirling_swirl',
  'pixie_butterfly_swirl', 'pixie_ducking_butterfly_swirl', 'pixie_paradon',
  'pixie_reverse_swirl', 'pixie_swirl', 'pixie_symposium_whirling_swirl',
  'pogo_paradox_whirling_swirl', 'pogo_whirling_swirl', 'quantum_butterfly_swirl',
  'rev_swirl', 'rev_whirl', 'reverse_swirling_blender',
  'reverse_swirling_osis', 'reverse_swirling_paradox_symposium_whirl', 'reverse_swirling_paradox_torque',
  'reverse_swirling_pickup', 'reverse_swirling_symposium_mirage', 'ripstein',
  'spinning_butterfly_swirl', 'spinning_reverse_swirl', 'spinning_swirl',
  'spinning_symposium_swirl', 'spinning_symposium_whirling_swirl', 'spinning_whirling_swirl',
  'spinning_whirling_symposium_swirl', 'stepping_butterfly_swirl', 'stepping_ducking_butterfly_swirl',
  'stepping_reverse_swirl', 'stepping_swirl', 'stepping_whirling_swirl',
  'swirl', 'swirling_butterfly', 'swirling_mirage',
  'swirling_paradox_mirage', 'swirling_paradox_symposium_whirl', 'swirling_reverse_swirl',
  'swirling_swirl', 'swirling_symposium_whirl', 'swirling_whirl',
  'swirling_whirling_swirl', 'swirlwind', 'symposium_reverse_swirling_pickup',
  'symposium_reverse_whirling_swirl', 'symposium_swirl', 'symposium_whirling_swirl',
  'tapping_whirling_swirl', 'toe_symposium_swirl', 'toe_whirling_swirl',
  'triple_swirl', 'whirling_swirl',
] as const;

// Blink is a documented notation exception: a toe-terminal trick whose dex
// path the leg-by-direction vocabulary cannot yet express without colliding
// with an existing toe-matrix trick. It does not contradict or belong to the
// clipper-terminal matrix; its token awaits a future path-vocabulary ruling.
const DOCUMENTED_EXCEPTIONS = new Set(['blink']);

const bracketCount = (n: string): number =>
  (n.match(/\[(DEX|BOD|DEL|XBD|PDX|UNS|XDEX)\]/g) ?? []).length;

describe('clipper-terminal matrix — the four canonical formulas', () => {
  for (const [slug, expected] of Object.entries(MATRIX)) {
    it(`${slug} carries its exact matrix formula`, () => {
      expect(notation(slug)).toBe(expected);
      expect(bySlug.get(slug)!.adds).toBe('3');
    });
  }
});

describe('clipper-terminal matrix — axis relationships', () => {
  const parse = (n: string) => {
    const m = n.match(/^SET > (SAME|OP) (IN|OUT) \[DEX\] > (SAME|OP) CLIP \[XBD\] \[DEL\]$/);
    expect(m, `matrix-shaped notation: ${n}`).not.toBeNull();
    return { leg: m![1], direction: m![2], terminalSide: m![3] };
  };

  it('whirl and reverse whirl preserve the leg (OP) and reverse the direction', () => {
    const w = parse(notation('whirl'));
    const rw = parse(notation('rev_whirl'));
    expect(w.leg).toBe('OP');
    expect(rw.leg).toBe('OP');
    expect(w.direction).not.toBe(rw.direction);
  });

  it('swirl and reverse swirl preserve the leg (SAME) and reverse the direction', () => {
    const s = parse(notation('swirl'));
    const rs = parse(notation('rev_swirl'));
    expect(s.leg).toBe('SAME');
    expect(rs.leg).toBe('SAME');
    expect(s.direction).not.toBe(rs.direction);
  });

  it('whirl and swirl differ by dexing leg, each pairing with its own direction-reversal sibling', () => {
    const w = parse(notation('whirl'));
    const s = parse(notation('swirl'));
    expect(w.leg).not.toBe(s.leg);
    // The four cells are all distinct: leg x direction covers the grid exactly once.
    const cells = ['whirl', 'rev_whirl', 'swirl', 'rev_swirl']
      .map(slug => { const p = parse(notation(slug)); return `${p.leg}/${p.direction}`; });
    expect(new Set(cells).size).toBe(4);
  });

  it('all four share the clipper terminal, with the terminal side matching the dexing leg', () => {
    for (const slug of ['whirl', 'rev_whirl', 'swirl', 'rev_swirl']) {
      const p = parse(notation(slug));
      expect(p.terminalSide).toBe(p.leg);
    }
  });
});

describe('clipper-terminal matrix — BACK SWIRL retirement', () => {
  it('no active operational notation retains BACK SWIRL (blink is the documented exception)', () => {
    const carriers = snapshot.tricks
      .filter(t => (t.operational_notation ?? '').includes('BACK SWIRL'))
      .map(t => t.slug)
      .filter(s => !DOCUMENTED_EXCEPTIONS.has(s));
    expect(carriers).toEqual([]);
  });

  it('every migrated row keeps bracket-count equal to its ADD', () => {
    for (const slug of MIGRATED_SLUGS) {
      const row = bySlug.get(slug);
      expect(row, `snapshot row for ${slug}`).toBeDefined();
      expect(String(bracketCount(row!.operational_notation ?? '')), slug).toBe(String(row!.adds));
    }
  });
});

describe('clipper-terminal matrix — hand-authored spec agrees with canonical data', () => {
  it('every core-trick spec formula equals the canonical database value where the database carries bracket form', () => {
    for (const spec of CORE_TRICK_SPEC) {
      const row = bySlug.get(spec.slug);
      if (!row?.operational_notation) continue;
      // Legacy lowercase rows (the two stall atoms) predate the bracket
      // migration; the spec supplies their canonical bracket display.
      if (!/\[(DEX|BOD|DEL|XBD)\]/.test(row.operational_notation)) continue;
      expect(spec.operationalNotation, spec.slug).toBe(row.operational_notation);
    }
  });
});
