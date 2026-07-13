/**
 * Set-role doctrine in the operator authority.
 *
 * A set realization integrates a dex into the bag's launch; a standalone
 * realization performs the movement independently after the launch. Canonical
 * set-versus-standalone identity follows structural role, not execution timing.
 * This suite pins that the canonical operator authority defines Atomic and
 * Quantum by set role, keeps Miraging and Illusioning off the launch-set and
 * scored-operator surfaces, preserves the accurate uptime / midtime / downtime
 * timing vocabulary, and changes no difficulty or notation output.
 */
import { describe, it, expect } from 'vitest';
import {
  getOperatorReferenceEntry,
  OPERATOR_REFERENCE_ENTRIES,
} from '../../src/content/freestyleOperatorReference';
import { MOVEMENT_SYSTEM_AXES } from '../../src/content/freestyleMovementSystems';

const atomic   = getOperatorReferenceEntry('atomic')!;
const miraging = getOperatorReferenceEntry('miraging')!;
const barraging = getOperatorReferenceEntry('barraging')!;
const whirling = getOperatorReferenceEntry('whirling')!;
const nuclear  = getOperatorReferenceEntry('nuclear')!;

describe('Atomic and Quantum are defined by set role', () => {
  it('Atomic is the outward movement pattern realized with a set role', () => {
    expect(atomic.oneLineMeaning).toMatch(/realized with a set role/i);
    expect(atomic.lineageNote).toMatch(/Atomic is the outward movement pattern realized with a set role/i);
  });

  it('Quantum is named as the same inward movement realized with a set role', () => {
    // Quantum's set-role identity is carried on the miraging authority entry,
    // which contrasts the standalone name against the set realization.
    expect(miraging.oneLineMeaning).toMatch(/Quantum is the same inward movement pattern realized with a set role/i);
  });
});

describe('Miraging and Illusioning are not launch sets or reusable scored operators', () => {
  it('Miraging is standalone language, not a launch set and not a scored operator', () => {
    expect(miraging.oneLineMeaning).toMatch(/not a scored, formula-bearing operator/i);
    expect(miraging.oneLineMeaning).toMatch(/not a launch set/i);
    expect(miraging.lineageNote).toMatch(/standalone inward-movement language, not a launch set/i);
  });

  it('Illusioning is standalone-movement language on the atomic entry, not the set', () => {
    expect(atomic.lineageNote).toMatch(/Illusioning is descriptive standalone-movement language/i);
    expect(atomic.lineageNote).toMatch(/not the set and not an equivalent name for Atomic/i);
  });

  it('no operator authority entry presents "uptime" as the reason something is a set', () => {
    for (const e of OPERATOR_REFERENCE_ENTRIES) {
      expect(e.oneLineMeaning, e.slug).not.toMatch(/uptime set/i);
      expect(e.lineageNote, e.slug).not.toMatch(/uptime set/i);
    }
  });
});

describe('Valid execution-timing vocabulary is preserved', () => {
  it('uptime still describes when a whirling dex occurs', () => {
    expect(whirling.oneLineMeaning).toMatch(/performed during uptime/i);
  });

  it('downtime still describes the motion nuclear folds in', () => {
    expect(nuclear.oneLineMeaning).toMatch(/downtime illusioning dex/i);
  });

  it('midtime remains a movement-system axis', () => {
    const keys = MOVEMENT_SYSTEM_AXES.map(a => a.axisKey);
    expect(keys).toContain('midtime-body');
  });
});

describe('No difficulty or notation output changed', () => {
  it('Atomic still contributes +1 with its TOE > OP OUT [DEX] form and separate [XDEX]', () => {
    expect(atomic.oneLineMeaning).toContain('+1');
    expect(atomic.oneLineMeaning).toContain('TOE > OP OUT [DEX]');
    expect(atomic.oneLineMeaning).toContain('[XDEX]');
  });

  it('Furious still contributes +2 with its two-in-direction-dex form', () => {
    expect(barraging.oneLineMeaning).toContain('+2 ADD');
    expect(barraging.oneLineMeaning).toContain('CLIP > OP IN [DEX] > SAME IN [DEX]');
  });
});
