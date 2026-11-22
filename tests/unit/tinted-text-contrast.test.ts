/**
 * Text drawn on a light tint keeps 4.5:1 contrast against that tint.
 *
 * A colour can pass on the white page and fail on the faint grey or wash a
 * chip or notation panel lays under it, and the whole-site rendered-style
 * check only judges the states its seeded pages happen to render: neither a
 * linked move on the set page nor an unresolved notation token appears there.
 * So each pairing here is read from the stylesheet itself (the text rule's
 * colour, the panel rule's background, both resolved through the root tokens
 * and the tint laid over the white page) and judged by the same contrast
 * arithmetic the rendered check uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { composite, contrastRatio, parseColor, type Rgba } from '../e2e/helpers/renderedStyle';
import type { NotationRole } from '../../src/services/notationRendering';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STYLESHEET = path.join(REPO_ROOT, 'src', 'public', 'css', 'style.css');
const css = readFileSync(STYLESHEET, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const AA_BODY_TEXT = 4.5;

const rootTokens = new Map<string, string>();
for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
  for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) rootTokens.set(m[1], m[2].trim());
}

/** The value a rule with exactly this selector gives a property, with var() resolved. */
function ruleValue(selector: string, property: string): Rgba {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1];
  if (body === undefined) throw new Error(`no rule for ${selector}`);
  let value: string | undefined = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim();
  if (value === undefined) throw new Error(`${selector} sets no ${property}`);
  for (let i = 0; value.startsWith('var(') && i < 5; i++) {
    const name: string | undefined = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    value = name ? rootTokens.get(name) : undefined;
    if (value === undefined) throw new Error(`${selector} ${property} names an undefined token`);
  }
  const colour = parseColor(value);
  if (!colour) throw new Error(`${selector} ${property} is not a colour: ${value}`);
  return colour;
}

const PAIRINGS = [
  { what: 'a linked move on a set-page move chip', text: '.moves-tag a', panel: '.moves-tag' },
  { what: 'an unresolved notation token on the trick notation panel', text: '.notation-unresolved', panel: '.notation-display .notation-display-tokens' },
];

// The class suffix each notation role is drawn with on the trick notation
// panel. Keyed by the role type, so a role added to the renderer fails to
// compile here until its colour is judged too.
const NOTATION_ROLE_CLASSES: Record<NotationRole, string> = {
  core_family: 'core-family', set: 'set', rotation: 'rotation', modifier: 'modifier',
  delay_surface: 'delay-surface', unusual_surface: 'unusual-surface',
  directionality: 'directionality', body_component: 'body-component',
  footedness: 'footedness', multiplicity: 'multiplicity', suffix: 'suffix',
  unresolved: 'unresolved',
};

function ratioOn(text: string, panel: string): number {
  const background = composite(ruleValue(panel, 'background'), WHITE);
  return contrastRatio(composite(ruleValue(text, 'color'), background), background);
}

describe('text on a tinted panel', () => {
  it.each(PAIRINGS)('$what is readable at 4.5:1', ({ text, panel }) => {
    const ratio = ratioOn(text, panel);
    // Below 4.5:1 a reader with low vision cannot reliably read this text.
    expect(ratio, `${text} on ${panel}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_BODY_TEXT);
  });

  // Defect caught: a notation token the seeded pages never draw (a footedness,
  // direction or rotation word) set in a colour too faint to read on the
  // notation panel.
  it('every notation role is readable at 4.5:1 on the trick notation panel', () => {
    const panel = '.notation-display .notation-display-tokens';
    const faint = Object.values(NOTATION_ROLE_CLASSES)
      .map((suffix) => ({ text: `.notation-${suffix}`, ratio: ratioOn(`.notation-${suffix}`, panel) }))
      .filter(({ ratio }) => ratio < AA_BODY_TEXT)
      .map(({ text, ratio }) => `${text} ${ratio.toFixed(2)}:1`);
    expect(faint).toEqual([]);
  });
});
