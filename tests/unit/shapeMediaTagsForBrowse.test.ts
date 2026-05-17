/**
 * Unit tests for shapeMediaTagsForBrowse.
 *
 * The helper turns raw `#`-prefixed tag strings into ordered, classified
 * MediaTagDisplay chips for the visible hashtag layer on curated freestyle
 * media. Suppression policy + kind classification + ordering are all asserted
 * here so future taxonomy edits go through explicit review.
 */
import { describe, it, expect } from 'vitest';
import { shapeMediaTagsForBrowse } from '../../src/services/freestyleService';

describe('shapeMediaTagsForBrowse — suppression policy', () => {
  it('drops universally-noisy tags (#trick, #unavailable_embed)', () => {
    const out = shapeMediaTagsForBrowse(['#whirl', '#trick', '#unavailable_embed']);
    expect(out.map(t => t.display)).toEqual(['#whirl']);
  });

  it('drops #freestyle on freestyle-only surfaces (default)', () => {
    const out = shapeMediaTagsForBrowse(['#freestyle', '#whirl']);
    expect(out.map(t => t.display)).toEqual(['#whirl']);
  });

  it('keeps #freestyle on cross-discipline surfaces', () => {
    const out = shapeMediaTagsForBrowse(
      ['#freestyle', '#whirl'],
      { surfaceContext: 'cross-discipline' },
    );
    expect(out.map(t => t.display)).toContain('#freestyle');
  });

  it('skips empty / whitespace / non-hashtag tokens', () => {
    const out = shapeMediaTagsForBrowse(['', '   ', 'plain-word', '#whirl']);
    expect(out.map(t => t.display)).toEqual(['#whirl']);
  });

  it('de-duplicates repeated tags', () => {
    const out = shapeMediaTagsForBrowse(['#whirl', '#whirl', '#whirl']);
    expect(out).toHaveLength(1);
  });
});

describe('shapeMediaTagsForBrowse — kind classification', () => {
  it('classifies known source tags', () => {
    const tag = shapeMediaTagsForBrowse(['#footbag_hof_archive'])[0];
    expect(tag.kind).toBe('source');
  });

  it('classifies `#by_*` as creator', () => {
    const tag = shapeMediaTagsForBrowse(['#by_jay7bah'])[0];
    expect(tag.kind).toBe('creator');
  });

  it('classifies content-type tags', () => {
    expect(shapeMediaTagsForBrowse(['#tutorial'])[0].kind).toBe('content-type');
    expect(shapeMediaTagsForBrowse(['#demo'])[0].kind).toBe('content-type');
  });

  it('classifies `#event_*` as event', () => {
    expect(shapeMediaTagsForBrowse(['#event_2026_san_marino'])[0].kind).toBe('event');
  });

  it('classifies quality tags', () => {
    expect(shapeMediaTagsForBrowse(['#curated'])[0].kind).toBe('quality');
  });

  it('classifies discipline tags on cross-discipline surfaces', () => {
    const out = shapeMediaTagsForBrowse(
      ['#net'],
      { surfaceContext: 'cross-discipline' },
    );
    expect(out[0].kind).toBe('discipline');
  });

  it('defaults unknown `#*` tags to trick (catch-all)', () => {
    expect(shapeMediaTagsForBrowse(['#whirl'])[0].kind).toBe('trick');
    expect(shapeMediaTagsForBrowse(['#some-unseen-tag'])[0].kind).toBe('trick');
  });
});

describe('shapeMediaTagsForBrowse — kind precedence ordering', () => {
  it('orders chips by kind precedence: trick → source → creator → content-type → event → discipline → quality', () => {
    const out = shapeMediaTagsForBrowse(
      [
        '#curated',                  // quality
        '#by_jay7bah',               // creator
        '#footbag_hof_archive',      // source
        '#whirl',                    // trick
        '#event_2026_san_marino',    // event
        '#tutorial',                 // content-type
      ],
      { surfaceContext: 'cross-discipline' },
    );
    expect(out.map(t => t.kind)).toEqual([
      'trick', 'source', 'creator', 'content-type', 'event', 'quality',
    ]);
  });

  it('within a kind, sorts alphabetically by display string', () => {
    const out = shapeMediaTagsForBrowse(['#zoo', '#alpha', '#mango']);
    expect(out.map(t => t.display)).toEqual(['#alpha', '#mango', '#zoo']);
  });

  it('returns an empty array for an empty input', () => {
    expect(shapeMediaTagsForBrowse([])).toEqual([]);
  });
});
