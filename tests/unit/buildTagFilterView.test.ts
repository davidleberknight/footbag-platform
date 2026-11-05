/**
 * The "Suggested in these results" chips of the editable hashtag filter.
 *
 * A suggestion exists to narrow the current results. The curated opt-in is an
 * ordinary hashtag, so it follows the same rule as every co-occurring tag: it
 * is offered only when some, but not all, of the results carry it. A chip
 * carries the hashtag and its submit value, and no count.
 */
import { describe, it, expect } from 'vitest';
import { buildTagFilterView } from '../../src/services/mediaService';

const base = {
  basePath: '/media/browse',
  contextTags: [{ normalized: '#clipper', display: '#clipper' }],
  contextInUrl: true,
  includeTags: [],
  excludeTags: [],
  candidates: [{ normalized: '#tutorial', display: '#tutorial', count: 1 }],
};

describe('buildTagFilterView: the curated suggestion', () => {
  it('is not offered when every result is already curated', () => {
    // A visitor picking it would see the same results again.
    const view = buildTagFilterView({ ...base, setSize: 1, curatedCount: 1 });
    expect(view?.suggestions.map((s) => s.value) ?? []).not.toContain('curated');
  });

  it('is offered first when only some results are curated, carrying no count', () => {
    // Without it, a visitor could not narrow a mixed set to curator clips.
    const view = buildTagFilterView({ ...base, setSize: 3, curatedCount: 2 });
    expect(view?.suggestions[0]?.value).toBe('curated');
    for (const chip of view?.suggestions ?? []) {
      expect(Object.keys(chip).sort(), `chip ${chip.value}`).toEqual(['display', 'value']);
    }
  });
});
