/**
 * High Plains Drifter and Toe Double Drifter are the clipper-set and toe-set cells
 * of one double-drifter structure, so both preserve the drifter's defining inward
 * OP-side lead dexterity: a double drifter is an opposite-side inward dex then a
 * same-side inward dex onto a clipper, and only the set surface differs. The lead
 * must not flatten to the same side.
 *
 * Pixie Paradon is not a paradon: the paradon family is defined by its clipper
 * terminal, but Pixie Paradon resolves on a toe delay, so its paradon family
 * assignment is cleared and left blank pending a separate identity/name question.
 *
 * These pin the curator rulings in the committed correction source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CORR = readFileSync(
  join(process.cwd(), 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
);

// The `new_value` (fourth CSV field) of a slug's field correction. Notation and
// the null-clear sentinel carry no commas, so a comma-delimited capture is safe.
function correctionValue(slug: string, field: string): string {
  const m = CORR.match(new RegExp(`^${slug},${field},[^,]*,([^,]+),`, 'm'));
  if (!m) throw new Error(`no ${field} correction found for ${slug}`);
  return m[1];
}

describe('the two double-drifter cells preserve the drifter lead relationship', () => {
  const hpd = correctionValue('high-plains-drifter', 'operational_notation');
  const tdd = correctionValue('toe-double-drifter', 'operational_notation');

  it('High Plains Drifter leads with the drifter opposite-side inward dex, not the same side', () => {
    expect(hpd).toBe('CLIP > OP IN [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]');
    expect(hpd).not.toMatch(/^CLIP > SAME IN/);
  });

  it('Toe Double Drifter leads with the same drifter opposite-side inward dex', () => {
    expect(tdd).toBe('TOE > OP IN [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]');
  });

  it('both share one double-drifter core, differing only in set surface', () => {
    const core = (n: string) => n.replace(/^(CLIP|TOE)/, 'SET');
    expect(core(hpd)).toBe(core(tdd));
    expect(core(hpd)).toBe('SET > OP IN [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]');
  });
});

describe('Pixie Paradon is not a paradon', () => {
  it('clears its paradon family assignment via a null-clear correction', () => {
    // The loader nulls a relationship column when the correction value is the
    // backslash-N sentinel; blank would be skipped.
    expect(correctionValue('pixie_paradon', 'trick_family')).toBe('\\N');
  });
});
