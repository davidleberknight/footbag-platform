/**
 * The one folding rule that makes every slug and hashtag body, on the server and in the
 * browser. Both read the same committed table and must give the token the shared probe
 * list names for every input, so a preview never shows something other than what is
 * stored, and the pipeline's own test holds its copy to the same list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { slugifyForTag, typedTag } from '../../src/services/slugify';

interface Probe { input: string; token: string }

const probes: Probe[] = JSON.parse(
  readFileSync(path.join(__dirname, '../fixtures/foldTokenProbes.json'), 'utf8'),
);
const table: { map: Record<string, string> } = JSON.parse(
  readFileSync(path.join(__dirname, '../../src/public/js/latin-ascii.json'), 'utf8'),
);

interface BrowserFold { slugify(text: string): string; typedTag(raw: string): string; useTable(map: Record<string, string>): void }

function loadBrowserFold(): BrowserFold {
  const code = readFileSync(path.join(__dirname, '../../src/public/js/fold-token.js'), 'utf8');
  const sandbox: { window: { footbagFold?: BrowserFold }; Promise: PromiseConstructor } = { window: {}, Promise };
  vm.runInNewContext(code, sandbox);
  const fold = sandbox.window.footbagFold!;
  fold.useTable(table.map);
  return fold;
}

describe('the one folding rule', () => {
  it('gives every probe its expected token on the server', () => {
    const wrong = probes.filter((p) => slugifyForTag(p.input) !== p.token)
      .map((p) => `${p.input} -> ${slugifyForTag(p.input)} (expected ${p.token})`);
    expect(wrong).toEqual([]);
  });

  it('gives every probe the same token in the browser script as on the server', () => {
    const fold = loadBrowserFold();
    const wrong = probes.filter((p) => fold.slugify(p.input) !== p.token)
      .map((p) => `${p.input} -> ${fold.slugify(p.input)} (expected ${p.token})`);
    expect(wrong).toEqual([]);
  });

  // Every letter-producing entry of the standard table is applied, not only the
  // handful the probe list names: a dropped table read would pass the probes that
  // decompose but fail here.
  it('applies every letter mapping of the standard table', () => {
    const wrong = Object.entries(table.map)
      .filter(([, out]) => /[A-Za-z0-9]/.test(out))
      .filter(([ch, out]) => slugifyForTag(`a${ch}b`) !== slugifyForTag(`a${out}b`))
      .map(([ch]) => ch);
    expect(wrong).toEqual([]);
  });
});

describe('a typed hashtag', () => {
  it('keeps one leading #, folds the body, and is empty when nothing folds', () => {
    expect(typedTag('#Zoë-Müller')).toBe('#zoe_muller');
    expect(typedTag('Zoë-Müller')).toBe('#zoe_muller');
    expect(typedTag('##freestyle')).toBe('#freestyle');
    expect(typedTag('#日本語')).toBe('');
    expect(typedTag('#')).toBe('');
  });

  it('is the same in the browser script', () => {
    const fold = loadBrowserFold();
    for (const raw of ['#Zoë-Müller', 'Zoë-Müller', '##freestyle', '#日本語', '#']) {
      expect(fold.typedTag(raw), raw).toBe(typedTag(raw));
    }
  });
});
