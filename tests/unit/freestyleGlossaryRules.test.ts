/**
 * The rules every A to Z glossary entry meets, shared by the glossary editor and
 * the rebuild seeder: one entry per slug and per term, no alias that is another
 * entry's term or another entry's alias, and a deeper link that is a path on this
 * site carried together with its label.
 */
import { describe, it, expect } from 'vitest';
import { glossaryProblems, isSitePath, type GlossaryRuleInput } from '../../src/services/freestyleGlossaryRules';

const entry = (slug: string, o: Partial<GlossaryRuleInput> = {}): GlossaryRuleInput => ({
  slug, term: slug.replace(/-/g, ' '), aliases: [], moreHref: null, moreLabel: null, ...o,
});
const fieldsOf = (entries: GlossaryRuleInput[]) => glossaryProblems(entries).map((p) => `${p.slug}:${p.field}`);

describe('glossaryProblems', () => {
  // Defect caught: a sound glossary is refused, so the seeder stops every rebuild.
  it('finds nothing in a sound glossary, including an alias that only recases its own term', () => {
    expect(glossaryProblems([
      entry('add', { term: 'ADD', aliases: ['add', 'adds'] }),
      entry('run', { moreHref: '/freestyle/combo-analysis', moreLabel: 'Combo analysis' }),
    ])).toEqual([]);
  });

  // Defect caught: one alias shown under two entries, which reads as one word
  // with two meanings the glossary never meant.
  it('refuses an alias two entries both claim', () => {
    expect(fieldsOf([entry('near', { aliases: ['ss'] }), entry('same-side', { aliases: ['SS'] })]))
      .toEqual(['same-side:aliases']);
  });

  // Defect caught: an alias that is another entry's term, a duplicate entry in disguise.
  it('refuses an alias that is another entry\'s term, in any capitals', () => {
    expect(fieldsOf([entry('trick'), entry('move', { aliases: ['TRICK'] })])).toEqual(['move:aliases']);
  });

  // Defect caught: two entries at one anchor, or one term listed twice.
  it('refuses a repeated slug and a repeated term', () => {
    expect(fieldsOf([entry('fill'), entry('fill', { term: 'Other' })])).toEqual(['fill:slug']);
    expect(fieldsOf([entry('fill', { term: 'Fill' }), entry('filler', { term: 'fill' })])).toEqual(['filler:term']);
  });

  // Defect caught: a slug that cannot be an anchor.
  it.each(['Fill', 'fill_er', 'fill--er', '-fill', 'fill-', ''])('refuses the slug %j', (slug) => {
    expect(fieldsOf([entry(slug, { term: 'x' })])).toEqual([`${slug}:slug`]);
  });

  // Defect caught: a link drawn with no label, or a link that leaves the site.
  it('refuses a link without its label and a link off the site', () => {
    expect(fieldsOf([entry('a', { moreHref: '/freestyle' })])).toEqual(['a:moreHref']);
    expect(fieldsOf([entry('b', { moreLabel: 'Freestyle' })])).toEqual(['b:moreHref']);
    expect(fieldsOf([entry('c', { moreHref: 'https://example.com', moreLabel: 'x' })])).toEqual(['c:moreHref']);
  });
});

describe('isSitePath', () => {
  // Defect caught: a protocol-relative or spaced link passes as a site path.
  it('accepts a site path and refuses everything else', () => {
    expect(isSitePath('/freestyle/concepts#section-surfaces')).toBe(true);
    for (const bad of ['//example.com', 'freestyle', 'https://example.com', '/a b', '']) {
      expect(isSitePath(bad), bad).toBe(false);
    }
  });
});
