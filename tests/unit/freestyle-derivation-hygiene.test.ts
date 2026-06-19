import { describe, it, expect } from 'vitest';
import { RESOLVED_FORMULAS_SPRINT_1 } from '../../src/content/freestyleResolvedFormulas';

// The dictionary "ADD:" line renders the resolved-formula derivation field.
// That field is structural math only; explanatory prose belongs in the
// operator / provenance / description fields, not the ADD list field. These
// guards fail loudly if commentary is appended back into a derivation.
describe('Resolved-formula derivation hygiene', () => {
  it('the three cleaned derivations carry structural math only', () => {
    const bySlug = new Map(RESOLVED_FORMULAS_SPRINT_1.map(f => [f.slug, f.derivation]));
    expect(bySlug.get('around-the-world-kick')).toBe('dex(1) = 1 ADD');
    expect(bySlug.get('double-around-the-world-heel')).toBe('dex(2) + unusual-surface(1) + heel-stall(1) = 4 ADD');
    expect(bySlug.get('butterfly-kick')).toBe('bod(1) + dex(1) = 2 ADD');
  });

  it('no derivation carries a semicolon or em/en-dash clause', () => {
    // Semicolons and em/en dashes separate math from appended prose; the hyphen
    // in slugs like heel-stall is U+002D and is deliberately not matched here.
    const offenders = RESOLVED_FORMULAS_SPRINT_1
      .filter(f => /[;—–]/.test(f.derivation ?? ''))
      .map(f => `${f.slug}: ${f.derivation}`);
    expect(offenders).toEqual([]);
  });
});
