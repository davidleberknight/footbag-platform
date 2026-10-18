/**
 * The rendered-style diff reports exactly what a stylesheet change moved, and
 * the known-findings baseline lets the check spec fail on a new finding while
 * forcing the list to shrink as findings are fixed. A diff that reports noise
 * hides the real change; one that misses a change lets a refactor break a
 * layout unseen.
 */
import { describe, it, expect } from 'vitest';
import type { Finding } from '../e2e/helpers/renderedStyle';
import {
  compareToBaseline,
  diffCaptures,
  formatBaseline,
  formatBaselineEntries,
  isEmptyDiff,
  measuredKey,
  normalisePageProblem,
  parseBaseline,
  shrinkBaseline,
  summariseDiff,
  verdictIsClean,
} from '../e2e/helpers/renderedStyleDiff';
import { buildCapture, el } from '../fixtures/renderedStyleCapture';

const rows = (style: Record<string, string> = {}, rect = {}) =>
  buildCapture(el('table', {}, el('tr', { style, rect }), el('tr', { style, rect })));

describe('diffCaptures', () => {
  it('finds nothing between identical pages, or between two spellings of one colour', () => {
    // A dead-CSS deletion is proven safe only by an empty diff; noise would make that proof impossible.
    expect(isEmptyDiff(diffCaptures(rows(), rows()))).toBe(true);
    expect(isEmptyDiff(diffCaptures(rows({ color: 'rgb(51, 51, 51)' }), rows({ color: 'rgba(51,51,51,1)' })))).toBe(true);
  });

  it('ignores sub-pixel drift and reports a real change on every element it touched', () => {
    // A two-pixel padding change hidden by tolerance would let a spacing refactor shift a layout unseen.
    expect(isEmptyDiff(diffCaptures(rows({ 'padding-top': '8px' }), rows({ 'padding-top': '8.3px' })))).toBe(true);
    const d = diffCaptures(rows({ 'padding-top': '8px' }), rows({ 'padding-top': '10px' }));
    expect(d.restyled.map((c) => [c.key, c.prop, c.before, c.after])).toEqual([
      ['body>table:nth(1)>tr:nth(1)', 'padding-top', '8px', '10px'],
      ['body>table:nth(1)>tr:nth(2)', 'padding-top', '8px', '10px'],
    ]);
    expect(summariseDiff(d)).toEqual(['body>table>tr: padding-top 8px -> 10px (x2)']);
  });

  it('reports a fade or an alpha change exactly, keeping rounding slack for pixel lengths only', () => {
    // A dead-CSS deletion that faded an element to 0.6 opacity must not pass as "no change".
    expect(diffCaptures(rows({ opacity: '1' }), rows({ opacity: '0.6' })).restyled).toHaveLength(2);
    expect(diffCaptures(rows({ 'background-color': 'rgba(0, 0, 0, 1)' }), rows({ 'background-color': 'rgba(0, 0, 0, 0.6)' })).restyled).toHaveLength(2);
  });

  it('reports a box that moved with no change of its own separately from a restyle', () => {
    // A row pushed down by a change above it must not read as the row itself being restyled.
    const d = diffCaptures(rows({}, { y: 0 }), rows({}, { y: 12 }));
    expect(d.restyled).toEqual([]);
    expect(d.moved).toHaveLength(2);
    // A restyled row that also grew is reported once, as the restyle that caused the move.
    const both = diffCaptures(rows({ 'padding-top': '8px' }, { h: 20 }), rows({ 'padding-top': '12px' }, { h: 24 }));
    expect(both.restyled).toHaveLength(2);
    expect(both.moved).toEqual([]);
  });

  it('reports elements added and removed by key', () => {
    // A refactor that drops a whole row must show up even though no property of a surviving element changed.
    const one = buildCapture(el('table', {}, el('tr')));
    const d = diffCaptures(rows(), one);
    expect(d.removed).toEqual(['body>table:nth(1)>tr:nth(2)']);
    expect(diffCaptures(one, rows()).added).toEqual(['body>table:nth(1)>tr:nth(2)']);
  });
});

const finding = (rule: Finding['rule'], template: string, viewport = 390): Finding =>
  ({ rule, template, url: '/x', viewport, selector: 'body>p', measured: '1' });

/** The measured-set a run records for views it rendered at both widths. */
const measured = (...templates: string[]) =>
  new Set(templates.flatMap((t) => [390, 1280, 0].map((w) => measuredKey(t, w))));

describe('baseline', () => {
  it('rejects a malformed line rather than reading it as no findings', () => {
    // A typo that silently emptied the baseline would turn every known finding into a CI failure, or worse, hide a line.
    expect(() => parseBaseline('contrast-low\tclubs/detail\t390')).toThrow(/line 1/);
    expect(parseBaseline('# known\n\ncontrast-low\tclubs/detail\t390\t2\n')).toEqual([
      { rule: 'contrast-low', template: 'clubs/detail', viewport: 390, max: 2 },
    ]);
  });

  it('fails on a new finding and on a count above the listed maximum', () => {
    // A regression on a page with known findings must not hide behind the ones already listed.
    const base = parseBaseline('contrast-low\tclubs/detail\t390\t1\n');
    const visited = measured('clubs/detail', 'events/index');
    const v = compareToBaseline(
      [finding('contrast-low', 'clubs/detail'), finding('contrast-low', 'clubs/detail'), finding('text-below-ramp', 'events/index')],
      base,
      visited,
    );
    expect(v.unexpected.map((f) => f.rule)).toEqual(['text-below-ramp']);
    expect(v.exceeded.map((e) => e.count)).toEqual([2]);
    expect(verdictIsClean(v)).toBe(false);
  });

  it('reports a fixed finding as progress, never as a failure, and only for pages the run visited', () => {
    // Failing a run because someone fixed a defect would punish the fix; a filtered run must not call every other line stale.
    const base = parseBaseline('contrast-low\tclubs/detail\t390\t2\ncontrast-low\tevents/index\t390\t1\n');
    const v = compareToBaseline([finding('contrast-low', 'clubs/detail')], base, measured('clubs/detail'));
    expect(v.stale.map((s) => [s.entry.template, s.count])).toEqual([['clubs/detail', 1]]);
    expect(verdictIsClean(v)).toBe(true);
  });

  it('keeps the lines of a width that failed to render, even when the other width was measured', () => {
    // A page that failed only at phone width would otherwise read as every phone finding fixed, and lose those lines.
    const base = parseBaseline('contrast-low\tclubs/detail\t390\t2\ncontrast-low\tclubs/detail\t1280\t2\n');
    const desktopOnly = new Set([measuredKey('clubs/detail', 1280), measuredKey('clubs/detail', 0)]);
    const found = [finding('contrast-low', 'clubs/detail', 1280), finding('contrast-low', 'clubs/detail', 1280)];
    const { entries, changes } = shrinkBaseline(base, found, desktopOnly, new Set(['clubs/detail']));
    expect(entries.map((e) => `${e.viewport}:${e.max}`)).toEqual(['390:2', '1280:2']);
    expect(changes).toEqual([]);
  });

  it('tightens itself to what a run found, without ever loosening', () => {
    // A baseline that needed a manual rewrite after every fix would go stale, letting fixed defects come back unnoticed.
    const base = parseBaseline([
      'contrast-low\tclubs/detail\t390\t3', // found once now: lowered
      'prose-muted\tclubs/detail\t390\t1', // found none now: removed
      'contrast-low\tevents/index\t390\t1', // not visited by this run: kept
      'contrast-low\told/page\t390\t4', // view deleted from disk: removed
      'text-below-ramp\tclubs/detail\t390\t1', // found more often: kept at its limit, the check fails it
    ].join('\n'));
    const findings = [finding('contrast-low', 'clubs/detail'), finding('text-below-ramp', 'clubs/detail'), finding('text-below-ramp', 'clubs/detail')];
    const { entries, changes } = shrinkBaseline(base, findings, measured('clubs/detail'), new Set(['clubs/detail', 'events/index']));
    expect(formatBaselineEntries(entries)).toBe([
      'contrast-low\tclubs/detail\t390\t1',
      'contrast-low\tevents/index\t390\t1',
      'text-below-ramp\tclubs/detail\t390\t1',
      '',
    ].join('\n'));
    expect(changes).toHaveLength(3);
  });

  it('always fails a page that rendered the wrong view, and refuses to record one as known', () => {
    // A REACH URL that drifted to another page would otherwise be listed once and then
    // pass forever, while the view it was meant to measure goes unmeasured.
    const wrong = finding('wrong-view', 'net/teams', 390);
    const listed = parseBaseline('wrong-view\tnet/teams\t390\t1\n');
    expect(compareToBaseline([wrong], listed, measured('net/teams')).unexpected).toEqual([wrong]);
    expect(() => formatBaseline([wrong, finding('contrast-low', 'a')])).toThrow(/net\/teams.*wrong view/);
  });

  it('reads a page problem by its path, so the count cannot vary with the server port', () => {
    // The same failed request seen on two ports would read as two different problems.
    const origin = 'http://127.0.0.1:3300';
    expect(normalisePageProblem(`404 for ${origin}/media-store/a.jpg`, origin)).toBe('404 for /media-store/a.jpg');
    expect(normalisePageProblem(`request failed: ${origin}/x?y=1 (net::ERR_ABORTED)`, origin))
      .toBe('request failed: /x?y=1 (net::ERR_ABORTED)');
  });

  it('writes a baseline that reads back to the same counts', () => {
    // A regenerated baseline that parsed differently would fail the run that just wrote it.
    const fs = [finding('contrast-low', 'a'), finding('contrast-low', 'a'), finding('page-overflow', 'b')];
    const v = compareToBaseline(fs, parseBaseline(formatBaseline(fs)), measured('a', 'b'));
    expect(verdictIsClean(v)).toBe(true);
  });
});
