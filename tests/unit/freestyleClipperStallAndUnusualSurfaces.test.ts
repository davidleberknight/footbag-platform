/**
 * Clipper-stall ADD and the unusual-surface vocabulary.
 *
 * Clipper stall is a cross-body surface: its total is xbody(1) + stall(1) = 2,
 * so it is NOT a 1-ADD stall example, while toe stall (a single same-side stall)
 * stays 1. The authoritative operational notation for the two atoms carries
 * scoring brackets that reconcile with those ADD values.
 *
 * Thigh Catch and Pincher / Squeeze are unusual catching surfaces held as a
 * delay; both are named in the unusual-surface component class.
 */
import { describe, it, expect } from 'vitest';
import { countScoringBrackets } from '../../src/lib/freestyleNotation';
import { FREESTYLE_ADD_ANALYSIS_CONTENT } from '../../src/content/freestyleAddAnalysisContent';

describe('clipper-stall vs toe-stall ADD in the ADD-analysis content', () => {
  const stallComponent = FREESTYLE_ADD_ANALYSIS_CONTENT.componentClasses.find(c =>
    c.componentClass.startsWith('Stall:'),
  )!;
  const toeExample = FREESTYLE_ADD_ANALYSIS_CONTENT.workedExamples.find(w =>
    w.trickSlug === 'toe_stall',
  )!;

  it('does not list clipper-stall as a 1-ADD stall example, but keeps toe-stall at 1 ADD', () => {
    expect(stallComponent.contribution).toBe('1 ADD');
    expect(stallComponent.example).not.toMatch(/clipper-stall/);
    expect(stallComponent.example).toMatch(/toe-stall/);
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
});
