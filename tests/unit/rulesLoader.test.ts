import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadRulePages,
  listRulePages,
  getRulePage,
  listGroupedByCategory,
  _resetRulesCache,
} from '../../src/lib/rulesLoader';

describe('rules MD loader', () => {
  beforeEach(() => {
    _resetRulesCache();
  });

  it('discovers the X-Square discipline file in ifpa/rules/', () => {
    const groups = listGroupedByCategory();
    const xSquare = groups.find((g) => g.category === 'x-square');
    expect(xSquare).toBeDefined();
    expect(xSquare!.label).toBe('X-Square');
  });

  // Defect caught: a rules file whose discipline the index order does not name
  // vanishes from the rules index and the sitemap while its pages still serve.
  it('groups every discipline the rules files declare', () => {
    const declared = new Set(listRulePages().map((p) => p.category));
    const grouped = new Set(listGroupedByCategory().map((g) => g.category));
    expect(grouped).toEqual(declared);
  });

  it('splits the X-Square file into one rule page per H1', () => {
    const all = listRulePages().filter((p) => p.category === 'x-square');
    const slugs = all.map((p) => p.slug);
    expect(slugs).toContain('2-square');
    expect(slugs).toContain('4-square');
  });

  it('exposes verbatim 2-Square text from the source', () => {
    const page = getRulePage('x-square', '2-square');
    expect(page).toBeDefined();
    expect(page!.title).toBe('2-Square');
    expect(page!.bodyHtml).toContain('Game is to 11, must win by 2 points');
    expect(page!.bodyHtml).toContain('Rally Scoring');
    expect(page!.bodyHtml).toContain('it&#39;s okay to HAVE FUN!');
  });

  it('exposes verbatim 4-Square text from the source', () => {
    const page = getRulePage('x-square', '4-square');
    expect(page).toBeDefined();
    expect(page!.title).toBe('4-Square');
    expect(page!.bodyHtml).toContain('GOLDEN RULES');
    expect(page!.bodyHtml).toContain('TOO MUCH VOTING IS NO FUN!');
  });

  it('attaches discipline-level metadata to every rule page', () => {
    for (const page of listRulePages().filter((p) => p.category === 'x-square')) {
      expect(page.authority).toBe('IFPA');
      expect(page.effective).toBe('2020');
      expect(page.parentHref).toBe('/x-square');
      expect(page.parentLabel).toBe('X-Square');
    }
  });

  it('returns undefined for an unknown discipline or slug', () => {
    expect(getRulePage('x-square', 'no-such-rule')).toBeUndefined();
    expect(getRulePage('not-a-category', '2-square')).toBeUndefined();
  });

  it('caches: a second call returns the same Map instance until reset', () => {
    const a = loadRulePages();
    const b = loadRulePages();
    expect(a).toBe(b);
    _resetRulesCache();
    const c = loadRulePages();
    expect(c).not.toBe(a);
  });
});
