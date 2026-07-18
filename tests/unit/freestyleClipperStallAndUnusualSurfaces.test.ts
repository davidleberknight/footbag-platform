/**
 * Clipper-stall ADD correction and the unusual-surface vocabulary.
 *
 * Clipper stall is a cross-body surface: its total is xbody(1) + stall(1) = 2,
 * so it is NOT a 1-ADD stall example, while toe stall (a single same-side stall)
 * stays 1. The ADD-analysis explanation must show why the two differ. The
 * authoritative operational notation for the two atoms carries scoring brackets
 * that reconcile with those ADD values.
 *
 * Thigh Catch and Pincher / Squeeze are unusual catching surfaces held as a
 * delay; both appear in the unusual-surface teaching directory.
 */
import { describe, it, expect } from 'vitest';
import { countScoringBrackets } from '../../src/lib/freestyleNotation';
import { FREESTYLE_ADD_ANALYSIS_CONTENT } from '../../src/content/freestyleAddAnalysisContent';
import { ALTERNATIVE_SURFACES } from '../../src/content/freestyleAlternativeSurfaces';

describe('clipper-stall vs toe-stall ADD in the ADD-analysis content', () => {
  const stallComponent = FREESTYLE_ADD_ANALYSIS_CONTENT.componentClasses.find(c =>
    c.componentClass.startsWith('Stall:'),
  )!;
  const clipperExample = FREESTYLE_ADD_ANALYSIS_CONTENT.workedExamples.find(w =>
    w.trickSlug === 'clipper_stall',
  )!;
  const toeExample = FREESTYLE_ADD_ANALYSIS_CONTENT.workedExamples.find(w =>
    w.trickSlug === 'toe_stall',
  )!;

  it('does not list clipper-stall as a 1-ADD stall example, but keeps toe-stall', () => {
    expect(stallComponent.contribution).toBe('1 ADD');
    expect(stallComponent.example).not.toMatch(/clipper-stall/);
    expect(stallComponent.example).toMatch(/toe-stall/);
  });

  it('scores clipper-stall as 2 ADD and explains why it differs from toe stall', () => {
    expect(clipperExample.addLabel).toBe('2 ADD');
    expect(clipperExample.derivation).toBe('xbody(1) + stall(1) = 2 ADD');
    expect(clipperExample.whyNote).toMatch(/toe stall/i);
    expect(clipperExample.whyNote).toMatch(/cross(-| )body|\[XBD\]/i);
    expect(toeExample.addLabel).toBe('1 ADD');
  });
});

describe('authoritative stall op-notation reconciles bracket count with ADD', () => {
  it('toe stall is one scoring bracket (1 ADD)', () => {
    expect(countScoringBrackets('SET > SAME TOE [DEL]')).toBe(1);
  });
  it('clipper stall is two scoring brackets (2 ADD)', () => {
    expect(countScoringBrackets('SET > OP CLIP [XBD] [DEL]')).toBe(2);
  });
});

describe('unusual-surface vocabulary includes thigh and pincher', () => {
  it('the ADD-analysis unusual-surface example lists thigh and pincher', () => {
    const unusual = FREESTYLE_ADD_ANALYSIS_CONTENT.componentClasses.find(c =>
      c.componentClass.startsWith('Unusual surface:'),
    )!;
    expect(unusual.example).toMatch(/thigh/i);
    expect(unusual.example).toMatch(/pincher/i);
  });

  it('the alternative-surfaces directory lists thigh catch and squeeze together', () => {
    const group = ALTERNATIVE_SURFACES.groups.find(g => g.slug === 'thigh-and-pincher');
    expect(group).toBeDefined();
    expect(group!.tricks).toContain('thigh_catch');
    expect(group!.tricks).toContain('squeeze');
  });
});
