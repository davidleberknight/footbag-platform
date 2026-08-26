/**
 * A set page shows its formula, and most of those formulas are quoted from an
 * outside compilation rather than authored by the platform. Displayed under a
 * bare heading they read as the platform's own, which on one set actively
 * misleads: blazing shows the compilation's notation carrying a terminal-side
 * component while the platform has not ruled that side.
 *
 * So every displayed formula is attributed, and the attribution is derived from
 * the set's own citation rather than recorded a second time.
 *
 * The rule this suite exists to protect is which part of the citation the label
 * comes from. Blazing and flailing open their citations with the ruling that
 * settled their identity, while their formula is still the compilation's
 * notation. A label taken from the opening clause would credit the ruling for a
 * string it did not author, and on blazing it would read as the platform having
 * settled the open side question. The cases below pin that reasoning, not merely
 * today's output.
 */
import { describe, it, expect } from 'vitest';

import {
  CANONICAL_SETS,
  formulaSourceLabel,
  findCanonicalSetBySlug,
} from '../../src/content/freestyleCanonicalSets';

const HOLDEN = 'Holden compilation (2003)';
const PLATFORM_ENTRY = 'Platform entry-surface reference';
const CURATOR = 'Curator ruling';
const PLATFORM_TRACKED = 'Platform-tracked definition';
const FOOTBAGMOVES = 'Derived from FootbagMoves (single source)';

const withFormula = CANONICAL_SETS.filter((s) => s.formula.trim() !== '');
const withoutFormula = CANONICAL_SETS.filter((s) => s.formula.trim() === '');

const labelFor = (slug: string): string | null =>
  formulaSourceLabel(findCanonicalSetBySlug(slug)!);

describe('every displayed set formula says whose notation it is', () => {
  it('the formula-bearing cohort is the size the audit found', () => {
    expect(withFormula).toHaveLength(47);
    expect(withoutFormula.map((s) => s.slug).sort()).toEqual(['weaving', 'zulu']);
  });

  it('every formula-bearing set resolves a non-empty attribution', () => {
    const unattributed = withFormula
      .filter((s) => !(formulaSourceLabel(s) ?? '').trim())
      .map((s) => s.slug);
    expect(unattributed).toEqual([]);
  });

  it('the cohort splits into the sets that show a formula and the ones that teach it instead', () => {
    // A set with its own education block renders that block in place of the bare
    // Formula section, so its stored formula is never displayed and there is
    // nothing on the page to attribute. The attribution still derives for those
    // sets; it simply has no reader. Four of the six non-compilation sets sit
    // here, which is why the displayed defect was so concentrated on blazing.
    const EDUCATION_BACKED = [
      'atomic', 'fairy', 'floating', 'furious', 'nuclear', 'pixie',
      'quantum', 'stepping', 'surfing', 'swirling', 'warping', 'whirling',
    ];
    for (const slug of EDUCATION_BACKED) {
      const set = findCanonicalSetBySlug(slug)!;
      expect(set.formula.trim(), `${slug} should still carry a formula`).not.toBe('');
      expect(formulaSourceLabel(set), `${slug} should still derive a label`).toBeTruthy();
    }
    expect(withFormula.length - EDUCATION_BACKED.length).toBe(35);
  });

  it('a set with no formula attributes nothing rather than inventing a source', () => {
    // These two say their notation is pending. There is no string to attribute,
    // and claiming a source for an absent formula would be a claim about nothing.
    for (const set of withoutFormula) {
      expect(formulaSourceLabel(set), set.slug).toBeNull();
    }
  });

  it('every attribution is grounded in that set own citation', () => {
    // The label is a short form of something the citation already says, so each
    // one must be traceable back to a phrase in the citation it came from.
    const MARKERS: Record<string, string> = {
      [HOLDEN]: 'Holden compilation',
      [CURATOR]: 'curator-ruled',
      [PLATFORM_TRACKED]: 'Platform-tracked',
      [PLATFORM_ENTRY]: 'Platform entry-surface reference',
      [FOOTBAGMOVES]: 'FootbagMoves',
    };
    const ungrounded = withFormula
      .filter((s) => {
        const label = formulaSourceLabel(s)!;
        const marker = MARKERS[label];
        return !marker || !s.sourceCitation.includes(marker);
      })
      .map((s) => `${s.slug}: ${formulaSourceLabel(s)}`);
    expect(ungrounded).toEqual([]);
  });

  it('the attribution distribution is the one the audit established', () => {
    const counts = new Map<string, number>();
    for (const set of withFormula) {
      const label = formulaSourceLabel(set)!;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      [HOLDEN]: 41,
      [PLATFORM_ENTRY]: 2,
      [CURATOR]: 2,
      [PLATFORM_TRACKED]: 1,
      [FOOTBAGMOVES]: 1,
    });
  });
});

describe('the label follows the source of the formula, not the lead of the citation', () => {
  it('blazing credits the compilation, not the ruling its citation opens with', () => {
    const blazing = findCanonicalSetBySlug('blazing')!;
    // The citation opens with the ruling. Taking that opening clause would put a
    // ruling's name above a side component the ruling explicitly did not settle.
    expect(blazing.sourceCitation.startsWith('Red ruling')).toBe(true);
    expect(labelFor('blazing')).toBe(HOLDEN);
    expect(labelFor('blazing')).not.toMatch(/Red/);
  });

  it('flailing credits the compilation for the same reason', () => {
    const flailing = findCanonicalSetBySlug('flailing')!;
    expect(flailing.sourceCitation.startsWith('Red ruling')).toBe(true);
    expect(labelFor('flailing')).toBe(HOLDEN);
    expect(labelFor('flailing')).not.toMatch(/Red/);
  });

  it('blazing keeps the compilation formula and the unsettled side alongside it', () => {
    const blazing = findCanonicalSetBySlug('blazing')!;
    expect(blazing.formula).toBe('CLIP > OP IN [DEX] > (op side component)');
    // The attribution exists so this side component cannot read as a platform
    // ruling; the prose beside it must go on saying the relation is open.
    expect(blazing.movementExplanation).toMatch(/side relation is not settled/);
  });
});

describe('the sets whose formulas are not the compilation are not labelled as if they were', () => {
  it('the platform entry surfaces credit the platform', () => {
    expect(labelFor('toe')).toBe(PLATFORM_ENTRY);
    expect(labelFor('clipper')).toBe(PLATFORM_ENTRY);
  });

  it('the curator-ruled composites credit the curator', () => {
    expect(labelFor('floating')).toBe(CURATOR);
    expect(labelFor('warping')).toBe(CURATOR);
  });

  it('furious credits the platform definition its citation states', () => {
    expect(labelFor('furious')).toBe(PLATFORM_TRACKED);
    expect(findCanonicalSetBySlug('furious')!.sourceCitation)
      .toMatch(/Platform-tracked as the two-dex set/);
  });

  it('surfing credits the single outside source it was derived from', () => {
    expect(labelFor('surfing')).toBe(FOOTBAGMOVES);
  });

  it('an ordinary compilation-cited set credits the compilation', () => {
    expect(labelFor('pixie')).toBe(HOLDEN);
  });

  it('none of the six non-compilation sets falls back to the compilation', () => {
    for (const slug of ['toe', 'clipper', 'floating', 'warping', 'furious', 'surfing']) {
      expect(labelFor(slug), slug).not.toBe(HOLDEN);
    }
  });
});

describe('attribution changes no formula', () => {
  it('every formula string is exactly what it was', () => {
    // Spot-pinned across the attribution forms. The provenance treatment is
    // presentational, so a moved formula would mean the slice did something else.
    const PINNED: Record<string, string> = {
      blazing:  'CLIP > OP IN [DEX] > (op side component)',
      flailing: 'SET > (no plant while) OP OUT [BOD] [DEX] >',
      toe:      'TOE >',
      clipper:  'CLIP >',
      furious:  'CLIP > OP IN [DEX] > SAME IN [DEX] >',
      surfing:  'TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] > OP OUT [DEX] >',
      floating: 'Quantum Symposium Quantum',
      warping:  'TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX]',
      pixie:    'TOE > SAME IN [DEX] >',
    };
    for (const [slug, formula] of Object.entries(PINNED)) {
      expect(findCanonicalSetBySlug(slug)!.formula, slug).toBe(formula);
    }
  });

  it('a formula-bearing set whose citation names no source is refused, not defaulted', () => {
    // The dangerous default would be the compilation, since it is the common case.
    const orphan = { ...findCanonicalSetBySlug('pixie')!, sourceCitation: 'No provenance recorded.' };
    expect(() => formulaSourceLabel(orphan)).toThrow(/names no source for it/);
  });
});
