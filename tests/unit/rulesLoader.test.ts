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

  it('discovers the sideline category file in ifpa/rules/', () => {
    const groups = listGroupedByCategory();
    const sideline = groups.find((g) => g.category === 'sideline');
    expect(sideline).toBeDefined();
    expect(sideline!.label).toBe('Sideline');
  });

  it('splits the sideline file into one rule page per H1', () => {
    const all = listRulePages().filter((p) => p.category === 'sideline');
    const slugs = all.map((p) => p.slug);
    expect(slugs).toContain('2-square');
    expect(slugs).toContain('4-square');
  });

  it('exposes verbatim 2-Square text from the source', () => {
    const page = getRulePage('sideline', '2-square');
    expect(page).toBeDefined();
    expect(page!.title).toBe('2-Square');
    expect(page!.bodyHtml).toContain('Game is to 11, must win by 2 points');
    expect(page!.bodyHtml).toContain('Rally Scoring');
    expect(page!.bodyHtml).toContain('it&#39;s okay to HAVE FUN!');
  });

  it('exposes verbatim 4-Square text from the source', () => {
    const page = getRulePage('sideline', '4-square');
    expect(page).toBeDefined();
    expect(page!.title).toBe('4-Square');
    expect(page!.bodyHtml).toContain('GOLDEN RULES');
    expect(page!.bodyHtml).toContain('TOO MUCH VOTING IS NO FUN!');
  });

  it('attaches category-level metadata to every rule page', () => {
    for (const page of listRulePages().filter((p) => p.category === 'sideline')) {
      expect(page.authority).toBe('IFPA');
      expect(page.effective).toBe('2020');
      expect(page.parentHref).toBe('/sideline');
      expect(page.parentLabel).toBe('Sideline');
    }
  });

  it('returns undefined for an unknown category or slug', () => {
    expect(getRulePage('sideline', 'no-such-rule')).toBeUndefined();
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
