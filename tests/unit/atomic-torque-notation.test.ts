import { describe, it, expect } from 'vitest';
import { RESOLVED_FORMULAS_SPRINT_1 } from '../../src/content/freestyleResolvedFormulas';

/**
 * Atomic Torque execution notation. atomic-torque carries no DB
 * operational_notation and a name-only Movement-notation, so its Execution
 * notation must come from the RESOLVED_FORMULAS overlay (the resolver's
 * second lookup tier). The notation follows the same atomic chassis as its
 * published siblings (atomic-blender / atomic-butterfly / atomic-drifter):
 * a leading TOE > OP OUT [DEX] before the base body. ADD must equal the
 * scoring-bracket count: atomic(+1) + torque(4) = 5.
 */
const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]/g;

describe('atomic-torque execution notation (RESOLVED_FORMULAS overlay)', () => {
  const entry = RESOLVED_FORMULAS_SPRINT_1.find(f => f.slug === 'atomic-torque');

  it('has an entry with the atomic chassis operationalNotation', () => {
    expect(entry).toBeDefined();
    expect(entry!.operationalNotation).toBe(
      'TOE > OP OUT [DEX] > OP IN [DEX] > (back or front) SPIN [BOD] > OP CLIP [XBD] [DEL]',
    );
  });

  it('opens on the atomic outward-uptime dex and closes on the torque terminal', () => {
    expect(entry!.operationalNotation!.startsWith('TOE > OP OUT [DEX]')).toBe(true);
    expect(entry!.operationalNotation!.trimEnd().endsWith('OP CLIP [XBD] [DEL]')).toBe(true);
  });

  it('scoring-bracket count equals the ADD (atomic(+1) + torque(4) = 5)', () => {
    expect(entry!.totalAdd).toBe(5);
    expect((entry!.operationalNotation!.match(ADD_TOKEN) ?? []).length).toBe(5);
  });
});
