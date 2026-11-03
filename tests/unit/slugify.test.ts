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
import { foldTypedHashtags, slugifyForTag, splitTypedHashtags, typedTag } from '../../src/services/slugify';

interface Probe { input: string; token: string }

const probes: Probe[] = JSON.parse(
  readFileSync(path.join(__dirname, '../fixtures/foldTokenProbes.json'), 'utf8'),
);
const table: { map: Record<string, string> } = JSON.parse(
  readFileSync(path.join(__dirname, '../../src/public/js/latin-ascii.json'), 'utf8'),
);

interface BrowserFold {
  slugify(text: string): string;
  typedTag(raw: string): string;
  splitHashtags(text: string): string[];
  useTable(map: Record<string, string>): void;
}

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

// What a person types until they commit it is one hashtag, and each '#' starts
// a new one; inside one hashtag, spaces and hyphens fold to underscores.
describe('a typed hashtag list', () => {
  const stored = (...texts: string[]) => foldTypedHashtags(...texts).map((t) => t.stored);

  // Defect caught: words typed without a '#' are saved as several hashtags, so
  // "footbag chin lone" lands as #footbag, #chin and #lone.
  it('keeps words typed without a # together as one hashtag', () => {
    expect(stored('footbag chin lone')).toEqual(['#footbag_chin_lone']);
    expect(stored('chin-lone')).toEqual(['#chin_lone']);
    expect(stored('Zoë Müller').map((t) => t.toLowerCase())).toEqual(['#zoe_muller']);
  });

  // Defect caught: a pasted "#a#b" is saved as one hashtag, or the chip field's
  // own "#a #b" value is merged into one on save.
  it('starts a new hashtag at every #, with or without a space before it', () => {
    expect(stored('#chinlone #club_wellington')).toEqual(['#chinlone', '#club_wellington']);
    expect(stored('#chinlone#club_wellington')).toEqual(['#chinlone', '#club_wellington']);
    expect(stored('footbag #club_wellington')).toEqual(['#footbag', '#club_wellington']);
  });

  it('makes nothing of empty text, a lone # or ##, and ignores outer spaces', () => {
    expect(stored('')).toEqual([]);
    expect(stored('#')).toEqual([]);
    expect(stored('##')).toEqual([]);
    expect(stored('   ')).toEqual([]);
    expect(stored('  #chinlone   #club_wellington  ')).toEqual(['#chinlone', '#club_wellington']);
    expect(stored('##freestyle')).toEqual(['#freestyle']);
  });

  // Defect caught: two spellings of one hashtag are both saved, so the item
  // carries it twice.
  it('keeps two spellings of one hashtag once, where first typed', () => {
    expect(stored('#Zürich #zurich')).toEqual(['#Zurich']);
  });

  // Defect caught: letters with no a to z form are folded away, so part of what
  // the person wrote silently disappears instead of the tag being refused by name.
  it('passes a hashtag with unconvertible letters on unfolded, so the tag rules refuse it by name', () => {
    expect(stored('#ok #tokyo東京')).toEqual(['#ok', '#tokyo東京']);
  });

  // Defect caught: two separately committed texts (a field and a player pick)
  // run together into one hashtag.
  it('never runs one committed text into the next', () => {
    expect(stored('footbag', 'chin lone')).toEqual(['#footbag', '#chin_lone']);
  });

  // Defect caught: a member is told a hashtag was changed when only the # was
  // added, or not told when the spaces were folded.
  it('keeps each hashtag as typed beside its stored form', () => {
    expect(foldTypedHashtags('footbag chin lone #Zoë')).toEqual([
      { typed: 'footbag chin lone', stored: '#footbag_chin_lone' },
      { typed: '#Zoë', stored: '#Zoe' },
    ]);
  });

  // Defect caught: the chip field splits typed text one way and the server
  // another, so the chips shown are not the hashtags saved.
  it('is split the same way in the browser script', () => {
    const fold = loadBrowserFold();
    for (const raw of ['footbag chin lone', '#chinlone #club_wellington', '#chinlone#club_wellington',
      '', '#', '##', '  #a   b #c ', 'footbag #club', '##freestyle']) {
      expect(fold.splitHashtags(raw), raw).toEqual(splitTypedHashtags(raw));
    }
    expect(splitTypedHashtags('  #a   b #c ')).toEqual(['#a   b', '#c']);
  });
});
