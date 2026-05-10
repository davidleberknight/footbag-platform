/**
 * Unit tests for shapeOperationalNotationDisplay (O1b).
 *
 * Pure-function tokenizer; no DB; no parser coupling. Validates token-role
 * classification per OPERATIONAL_NOTATION_GRAMMAR.md §2 and the warm-palette
 * cssRole mapping per RENDERING_SURFACE_PROPOSAL.md §3.
 */
import { describe, it, expect } from 'vitest';
import { shapeOperationalNotationDisplay } from '../../src/services/operationalNotationRendering';

describe('shapeOperationalNotationDisplay — null-safety + boundary cases', () => {
  it('returns null for null input', () => {
    expect(shapeOperationalNotationDisplay(null)).toBeNull();
  });
  it('returns null for undefined input', () => {
    expect(shapeOperationalNotationDisplay(undefined)).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(shapeOperationalNotationDisplay('')).toBeNull();
  });
  it('returns null for whitespace-only input', () => {
    expect(shapeOperationalNotationDisplay('   \n\t  ')).toBeNull();
  });
});

describe('shapeOperationalNotationDisplay — sequence operators', () => {
  it('classifies > as sequence_op-minor', () => {
    const out = shapeOperationalNotationDisplay('CLIP > TOE');
    expect(out!.tokens.find(t => t.text === '>')).toEqual(expect.objectContaining({
      role: 'sequence_op', cssRole: 'sequence-op-minor',
    }));
  });
  it('classifies >> as sequence_op-major (longer match wins)', () => {
    const out = shapeOperationalNotationDisplay('CLIP >> TOE');
    expect(out!.tokens.find(t => t.text === '>>')).toEqual(expect.objectContaining({
      role: 'sequence_op', cssRole: 'sequence-op-major',
    }));
    // Verify > is NOT also matched separately (no double-classification).
    expect(out!.tokens.filter(t => t.text === '>').length).toBe(0);
  });
  it('handles mixed > and >> in a single string', () => {
    const out = shapeOperationalNotationDisplay('CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]');
    const ops = out!.tokens.filter(t => t.role === 'sequence_op');
    expect(ops.map(t => t.text)).toEqual(['>', '>>', '>']);
  });
});

describe('shapeOperationalNotationDisplay — primary roles (saturated)', () => {
  it('classifies surface tokens (CLIP, TOE)', () => {
    const out = shapeOperationalNotationDisplay('CLIP > TOE');
    const surfaces = out!.tokens.filter(t => t.role === 'surface');
    expect(surfaces.map(t => t.text)).toEqual(['CLIP', 'TOE']);
    surfaces.forEach(t => expect(t.cssRole).toBe('surface'));
  });
  it('classifies body-action tokens (SPIN, DUCK, DIVE)', () => {
    const out = shapeOperationalNotationDisplay('CLIP >> SPIN [BOD] > DUCK [BOD] > DIVE [BOD]');
    const actions = out!.tokens.filter(t => t.role === 'body_action');
    expect(actions.map(t => t.text)).toEqual(['SPIN', 'DUCK', 'DIVE']);
    actions.forEach(t => expect(t.cssRole).toBe('body-action'));
  });
  it('fuses FRONT WHIRL into a single rotation_variant token', () => {
    const out = shapeOperationalNotationDisplay('OP FRONT WHIRL [DEX]');
    const rot = out!.tokens.find(t => t.role === 'rotation_variant');
    expect(rot).toEqual(expect.objectContaining({
      text: 'FRONT WHIRL', cssRole: 'rotation-variant',
    }));
  });
  it('fuses BACK SWIRL into a single rotation_variant token', () => {
    const out = shapeOperationalNotationDisplay('OP BACK SWIRL [DEX]');
    const rot = out!.tokens.find(t => t.role === 'rotation_variant');
    expect(rot).toEqual(expect.objectContaining({
      text: 'BACK SWIRL', cssRole: 'rotation-variant',
    }));
  });
  it('treats standalone WHIRL/SWIRL as rotation_variant (no preceding direction)', () => {
    const out = shapeOperationalNotationDisplay('WHIRL >> SWIRL');
    const rots = out!.tokens.filter(t => t.role === 'rotation_variant');
    expect(rots.map(t => t.text)).toEqual(['WHIRL', 'SWIRL']);
  });
  it('does NOT fuse FRONT/BACK with a non-rotation-noun follower', () => {
    // FRONT followed by IN (a direction, not WHIRL/SWIRL) — FRONT stays as direction.
    const out = shapeOperationalNotationDisplay('FRONT IN [DEX]');
    const front = out!.tokens.find(t => t.text === 'FRONT');
    expect(front!.role).toBe('direction');
    // No rotation_variant token should have been created.
    expect(out!.tokens.find(t => t.role === 'rotation_variant')).toBeUndefined();
  });
});

describe('shapeOperationalNotationDisplay — secondary roles (muted)', () => {
  it('classifies side tokens (SAME, OP)', () => {
    const out = shapeOperationalNotationDisplay('SAME OUT [DEX] > OP IN [DEX]');
    const sides = out!.tokens.filter(t => t.role === 'side');
    expect(sides.map(t => t.text)).toEqual(['SAME', 'OP']);
  });
  it('classifies direction tokens (IN, OUT, FRONT, BACK)', () => {
    // FRONT/BACK only classify as direction when NOT followed by WHIRL/SWIRL;
    // here we use OUT and IN which always classify as direction.
    const out = shapeOperationalNotationDisplay('SAME OUT > OP IN');
    const dirs = out!.tokens.filter(t => t.role === 'direction');
    expect(dirs.map(t => t.text)).toEqual(['OUT', 'IN']);
  });
});

describe('shapeOperationalNotationDisplay — component flags', () => {
  it('classifies all 6 component flags with per-flag cssRole granularity', () => {
    const out = shapeOperationalNotationDisplay('[DEX] [DEL] [BOD] [XBD] [PDX] [XDEX]');
    const flags = out!.tokens.filter(t => t.role === 'component_flag');
    expect(flags.map(t => t.text)).toEqual(['[DEX]', '[DEL]', '[BOD]', '[XBD]', '[PDX]', '[XDEX]']);
    expect(flags[0]!.cssRole).toBe('component-flag component-flag-dex');
    expect(flags[1]!.cssRole).toBe('component-flag component-flag-del');
    expect(flags[2]!.cssRole).toBe('component-flag component-flag-bod');
    expect(flags[3]!.cssRole).toBe('component-flag component-flag-xbd');
    expect(flags[4]!.cssRole).toBe('component-flag component-flag-pdx');
    expect(flags[5]!.cssRole).toBe('component-flag component-flag-xdex');
  });
  it('attaches per-flag tooltip labels', () => {
    const out = shapeOperationalNotationDisplay('[DEX] [PDX]');
    expect(out!.tokens[0]!.label).toBe('Dexterity component');
    expect(out!.tokens[1]!.label).toBe('Paradox component');
  });
});

describe('shapeOperationalNotationDisplay — pre-state flags', () => {
  it('classifies single-word pre-state flags', () => {
    const out = shapeOperationalNotationDisplay('(back) SPIN [BOD]');
    expect(out!.tokens[0]).toEqual(expect.objectContaining({
      text: '(back)', role: 'pre_state', label: 'Backward direction',
    }));
  });
  it('classifies multi-word pre-state flags including (no plant while)', () => {
    const out = shapeOperationalNotationDisplay('(no plant while) OP IN [DEX]');
    expect(out!.tokens[0]).toEqual(expect.objectContaining({
      text: '(no plant while)', role: 'pre_state',
      label: 'No support-leg plant during this segment',
    }));
  });
  it('classifies (rooted) with its specific tooltip', () => {
    const out = shapeOperationalNotationDisplay('(rooted) SAME IN [DEX]');
    expect(out!.tokens[0]!.label).toBe('Rooted / held; no plant');
  });
});

// ─── Worked-example anchors per O1b validation requirement ────────────

describe('shapeOperationalNotationDisplay — Barfly worked example', () => {
  // Barfly seed: CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]
  const out = shapeOperationalNotationDisplay(
    'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
  );

  it('produces the expected role sequence for Barfly', () => {
    const sequence = out!.tokens.map(t => `${t.role}:${t.text}`);
    expect(sequence).toEqual([
      'surface:CLIP',
      'sequence_op:>>',
      'side:SAME',
      'direction:OUT',
      'component_flag:[DEX]',
      'sequence_op:>',
      'side:SAME',
      'direction:OUT',
      'component_flag:[DEX]',
      'sequence_op:>',
      'side:OP',
      'surface:CLIP',
      'component_flag:[DEL]',
      'component_flag:[XBD]',
    ]);
  });

  it('renders 14 tokens for Barfly (no merge across operators)', () => {
    expect(out!.tokens.length).toBe(14);
  });

  it('Barfly preserves the >> major boundary distinct from > minor', () => {
    const ops = out!.tokens.filter(t => t.role === 'sequence_op');
    expect(ops.map(t => t.cssRole)).toEqual([
      'sequence-op-major',  // >>
      'sequence-op-minor',  // >
      'sequence-op-minor',  // >
    ]);
  });
});

describe('shapeOperationalNotationDisplay — Blur worked example', () => {
  // Blur seed: CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]
  const out = shapeOperationalNotationDisplay(
    'CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]',
  );

  it('produces the expected role sequence for Blur', () => {
    const sequence = out!.tokens.map(t => `${t.role}:${t.text}`);
    expect(sequence).toEqual([
      'surface:CLIP',
      'sequence_op:>',
      'side:OP',
      'direction:IN',
      'component_flag:[DEX]',
      'sequence_op:>>',
      'side:OP',
      'direction:IN',
      'component_flag:[DEX]',
      'component_flag:[PDX]',
      'sequence_op:>',
      'side:OP',
      'surface:TOE',
      'component_flag:[DEL]',
    ]);
  });

  it('Blur PDX flag receives the violet micro-distinguisher cssRole', () => {
    const pdx = out!.tokens.find(t => t.text === '[PDX]');
    expect(pdx!.cssRole).toBe('component-flag component-flag-pdx');
    expect(pdx!.label).toBe('Paradox component');
  });

  it('Blur has two distinct dex segments separated by >> (matches the IFPA Stepping-Paradox-Mirage reading)', () => {
    // The two-dex-with-PDX-on-segment-2 structure is the operational
    // signature that aligns with pt10's reading of blur as Stepping
    // Paradox Mirage; see OPERATIONAL_NOTATION_GRAMMAR §5.1.
    const ops = out!.tokens.filter(t => t.role === 'sequence_op');
    expect(ops.find(t => t.text === '>>')).toBeDefined();
    const dexFlags = out!.tokens.filter(t => t.text === '[DEX]');
    expect(dexFlags.length).toBe(2);
  });
});

describe('shapeOperationalNotationDisplay — convention drift case (ALL-CAPS+brackets)', () => {
  // The "Stepping Ducking PS Whirl" row in the FM sample uses the same
  // ALL-CAPS+brackets convention proposed in RENDERING_SURFACE_PROPOSAL §4
  // (i.e. matches IFPA's NOTATION_STYLE_GUIDE). Tokenizer must handle it
  // identically to the lowercase-bracket FM default.
  const out = shapeOperationalNotationDisplay(
    'CLIP > OP IN [DEX] > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]',
  );
  it('parses cleanly with no unknown tokens', () => {
    const unknowns = out!.tokens.filter(t => t.role === 'unknown');
    expect(unknowns).toEqual([]);
  });
  it('classifies DUCK as body_action and (no plant while) as pre_state', () => {
    const duck = out!.tokens.find(t => t.text === 'DUCK');
    expect(duck!.role).toBe('body_action');
    const noPlant = out!.tokens.find(t => t.text === '(no plant while)');
    expect(noPlant!.role).toBe('pre_state');
  });
});

describe('shapeOperationalNotationDisplay — fallthrough behavior', () => {
  it('classifies words outside the closed vocabulary as unknown (pass-through)', () => {
    const out = shapeOperationalNotationDisplay('FRIGIDOSIS > SAME IN [DEX]');
    const frig = out!.tokens.find(t => t.text === 'FRIGIDOSIS');
    expect(frig!.role).toBe('unknown');
    expect(frig!.cssRole).toBe('unknown');
  });
  it('preserves source order across the entire token stream', () => {
    const raw = '(back) SPIN [BOD] >> OP IN [DEX] [PDX]';
    const out = shapeOperationalNotationDisplay(raw);
    // Reconstruct from tokens — text values in order should rebuild close to source.
    const reconstructed = out!.tokens.map(t => t.text).join(' ');
    expect(reconstructed).toBe(raw);
  });
});
