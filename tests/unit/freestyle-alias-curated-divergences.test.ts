/**
 * The five aliases whose publication state is set against their class on purpose.
 *
 * Every other curated override agrees with the state its class implies, so these
 * five are the whole evidence that the two are separate judgements rather than
 * one judgement stored twice. Each was ruled individually, and the reasons are
 * specific: two are community nicknames a reader can reconstruct from the
 * canonical name, one is held pending doctrine, one names a narrower move than
 * the trick it points at, and one is a structural reading published because the
 * page would be poorer without it.
 *
 * They are pinned here because a later change that quietly brought them into
 * line with their classes would look like tidying and would silently reverse
 * five decisions. Anything moving them has to say so.
 *
 * The reasons are asserted as present, not as exact text. Rewording a ruling is
 * a curator's business; leaving one unexplained is not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const OVERRIDES = join(REPO_ROOT, 'freestyle', 'inputs', 'base_dictionary', 'alias_overrides.csv');
const INTERPRETATIONS = join(REPO_ROOT, 'src', 'content', 'freestyleTrickInterpretations.ts');

/** The publication state a class implies when nobody has ruled otherwise. */
const NICKNAME_CLASS = 'common';
const defaultDisplayFor = (aliasType: string): number => (aliasType === NICKNAME_CLASS ? 1 : 0);

interface Override {
  aliasSlug: string;
  action: string;
  aliasType: string;
  aliasDisplay: number;
  note: string;
}

/**
 * The curated overrides, parsed far enough for this file's purpose.
 *
 * The note is a quoted free-text field carrying commas, so the split has to
 * respect quoting: a naive comma split would truncate every reason and make the
 * "carries a reason" assertions pass on fragments.
 */
function overrides(): Override[] {
  const text = readFileSync(OVERRIDES, 'utf8');
  const rows: Override[] = [];
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === ',' && !quoted) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const [aliasSlug, action, aliasType, aliasDisplay, ...rest] = cells;
    rows.push({
      aliasSlug, action, aliasType,
      aliasDisplay: Number(aliasDisplay),
      note: rest.join(',').trim(),
    });
  }
  return rows;
}

const retypes = () => overrides().filter(o => o.action === 'retype');
const diverging = () => retypes().filter(o => o.aliasDisplay !== defaultDisplayFor(o.aliasType));

/** What was ruled, and the shape of each ruling. */
const RULED = [
  { slug: 'big_applesauce',           type: 'common',     display: 0 },
  { slug: 'frigidosis',               type: 'common',     display: 0 },
  { slug: 'infinity',                 type: 'common',     display: 0 },
  { slug: 'whirlwalk',                type: 'common',     display: 0 },
  { slug: 'reverse_around_the_world', type: 'structural', display: 1 },
];

describe('the curated overrides that diverge from their class', () => {
  it('are exactly the five that were ruled', () => {
    expect(diverging().map(o => o.aliasSlug).sort()).toEqual(RULED.map(r => r.slug).sort());
  });

  it.each(RULED)('keeps $slug as ruled', ({ slug, type, display }) => {
    const row = retypes().find(o => o.aliasSlug === slug);
    expect(row, `${slug} has lost its curated override`).toBeDefined();
    expect(row!.aliasType, `${slug} was reclassified`).toBe(type);
    expect(row!.aliasDisplay, `${slug} changed publication state`).toBe(display);
  });

  it.each(RULED)('records why $slug diverges', ({ slug }) => {
    // An unexplained exception is the failure the editor requirement exists to
    // prevent; these predate it and must not become the counterexample.
    const row = retypes().find(o => o.aliasSlug === slug);
    expect((row?.note ?? '').length, `${slug} carries no reason`).toBeGreaterThan(20);
  });

  it('leaves every other override agreeing with its class', () => {
    const rest = retypes().filter(o => !RULED.some(r => r.slug === o.aliasSlug));
    const disagreeing = rest.filter(o => o.aliasDisplay !== defaultDisplayFor(o.aliasType));
    expect(disagreeing.map(o => o.aliasSlug)).toEqual([]);
  });
});

describe('the name that points at a narrower move than its trick', () => {
  it('stays a community nickname and stays unpublished', () => {
    // Infinity names the clipper-set form of Butterfly rather than Butterfly at
    // large, so publishing it beside Butterfly would assert an equivalence that
    // is not one. Whether its class should change is a separate doctrine
    // question and is deliberately not settled by this file.
    const row = retypes().find(o => o.aliasSlug === 'infinity');
    expect(row!.aliasType).toBe('common');
    expect(row!.aliasDisplay).toBe(0);
  });

  it('is explained to readers on the trick it points at, since the alias line cannot', () => {
    // The ruling's other half. Hiding the alias is only defensible because the
    // page says what the name means instead; if this prose goes, the hiding
    // becomes an unexplained omission.
    const prose = readFileSync(INTERPRETATIONS, 'utf8');
    expect(prose).toContain('Infinity');
    expect(prose).toContain('clipper-set butterfly');
  });
});
