/**
 * Every rendered-style rule goes red on a planted defect and stays green on
 * its corrected twin, over synthetic captures, so a layout check that passes
 * in the browser spec is evidence rather than a rule that can never fire. The
 * colour maths is pinned to known WCAG ratios, because every contrast and
 * grey-text verdict rests on it.
 */
import { describe, it, expect } from 'vitest';
import {
  CaptureView,
  composite,
  contrastRatio,
  evaluate,
  normalizeColor,
  layoutShiftNote,
  parseColor,
  RULES,
  tableNamesFromSchema,
  type Capture,
  type FocusRecord,
  type ElementRecord,
  type RuleId,
  type StyleProp,
} from '../e2e/helpers/renderedStyle';
import { buildCapture, el, type NodeSpec } from '../fixtures/renderedStyleCapture';

const NO_TABLES = { tableNames: new Set<string>() };
const PHONE = 390;
const DESKTOP = 1280;

function hits(capture: Capture, rule: RuleId, ctx = NO_TABLES) {
  return evaluate(capture, ctx, new Set([rule]));
}

const LONG = 'A sentence of running prose that is long enough to count as body text on the page. '.repeat(3);

describe('colour maths', () => {
  it('computes WCAG ratios the contrast verdicts rest on', () => {
    // Wrong maths would pass grey text that readers cannot read, or fail body text that is fine.
    const white = parseColor('rgb(255, 255, 255)')!;
    expect(contrastRatio(parseColor('rgb(0, 0, 0)')!, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor('rgb(51, 51, 51)')!, white)).toBeCloseTo(12.63, 2);
    // The link green against body text: the reason a prose link needs its underline.
    expect(contrastRatio(parseColor('rgb(14, 128, 80)')!, parseColor('rgb(51, 51, 51)')!)).toBeCloseTo(2.54, 2);
  });

  it('composites a translucent layer over what is beneath it', () => {
    // Without compositing, text on a translucent panel would be judged against the wrong colour.
    const c = composite(parseColor('rgba(0, 0, 0, 0.5)')!, parseColor('rgb(255, 255, 255)')!);
    expect(c.r).toBeCloseTo(127.5, 5);
    expect(c.a).toBe(1);
  });

  it('reads the modern space-separated form and treats two spellings of one colour as equal', () => {
    // A diff that saw a respelled colour as a change would bury real changes in noise.
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(normalizeColor('rgb(51, 51, 51)')).toBe(normalizeColor('rgba(51,51,51,1)'));
    expect(parseColor('linear-gradient(red, blue)')).toBeNull();
  });

  it('reads hex, the form a root token comes back in, as the same colour the computed style reports', () => {
    // A grey-text rule comparing a hex token to an rgb() computed colour would never match, and never fire.
    expect(normalizeColor('#666666')).toBe(normalizeColor('rgb(102, 102, 102)'));
    expect(normalizeColor('#666')).toBe(normalizeColor('rgb(102, 102, 102)'));
    expect(parseColor('#0e805080')?.a).toBeCloseTo(0.5, 2);
  });
});

describe('box-outside-viewport', () => {
  it('reports only the innermost element past the edge, and excuses one inside a contained scroll box', () => {
    // An element past the phone edge is clipped or forces a sideways scroll; naming its parent instead hides the cause.
    const red = buildCapture(el('div', { rect: { w: 600 } }, el('span', { rect: { w: 600 }, text: 'wide' })), { width: PHONE });
    const found = hits(red, 'box-outside-viewport');
    expect(found.map((f) => f.selector)).toEqual(['body>div>span']);

    const green = buildCapture(
      el('div', { rect: { w: PHONE }, style: { 'overflow-x': 'auto' } }, el('table', { rect: { w: 600 } })),
      { width: PHONE },
    );
    expect(hits(green, 'box-outside-viewport')).toEqual([]);
  });

  it('reports a row cut off by a clipping ancestor, which a reader cannot scroll to', () => {
    // A clipped row looks tidy and hides its end; only a scroll container makes the overflow reachable.
    const clipped = buildCapture(
      el('div', { rect: { w: PHONE }, style: { 'overflow-x': 'hidden' } }, el('article', { rect: { w: 600 }, text: 'long row' })),
      { width: PHONE },
    );
    expect(hits(clipped, 'box-outside-viewport').map((f) => f.selector)).toEqual(['body>div>article']);
  });

  it('leaves an element parked off the left edge alone', () => {
    // The skip link sits off-screen at rest by design; flagging it would make the rule cry wolf on every page.
    const parked = buildCapture(el('a', { rect: { x: -9999, w: 100 }, style: { display: 'block' }, attrs: { href: true } }), { width: PHONE });
    expect(hits(parked, 'box-outside-viewport')).toEqual([]);
  });
});

describe('page-overflow', () => {
  it('reports a page wider than the phone and names a culprit, only at phone width', () => {
    // A page that scrolls sideways on a phone hides content off the right edge.
    const tree = el('div', { rect: { w: 600 } });
    const red = buildCapture(tree, { width: PHONE, page: { scrollWidth: 600, clientWidth: PHONE } });
    const found = hits(red, 'page-overflow');
    expect(found).toHaveLength(1);
    expect(found[0].measured).toContain('body>div');

    expect(hits(buildCapture(el('div'), { width: PHONE }), 'page-overflow')).toEqual([]);
    expect(hits(buildCapture(tree, { width: DESKTOP, page: { scrollWidth: 1400, clientWidth: DESKTOP } }), 'page-overflow')).toEqual([]);
  });
});

describe('scroll boxes', () => {
  const wrapper = (attrs: ElementRecord['attrs'], child = el('table', { rect: { w: 700 } })) =>
    buildCapture(
      el('div', { rect: { w: PHONE }, style: { 'overflow-x': 'auto' }, scroll: { sw: 700, cw: PHONE }, attrs }, child),
      { width: PHONE },
    );

  it('requires a scrolling box to be keyboard-focusable and named', () => {
    // A keyboard user cannot scroll a box they cannot focus, and a screen reader announces an unnamed region as nothing.
    expect(hits(wrapper({}), 'scroll-box-unlabelled')).toHaveLength(1);
    expect(hits(wrapper({ tabindex: '0' }), 'scroll-box-unlabelled')).toHaveLength(1);
    expect(hits(wrapper({ tabindex: '0', role: 'region', named: true }), 'scroll-box-unlabelled')).toEqual([]);
  });

  it('requires a scrolling box to be a region, so its name is announced', () => {
    // A screen reader announces an aria-label only on an element with a role; on a bare div the name is silently dropped.
    expect(hits(wrapper({ tabindex: '0', named: true }), 'scroll-box-unlabelled')).toHaveLength(1);
  });

  it('allows a scrolling box only around a table or preformatted text', () => {
    // A list or paragraph in a sideways scroller is content cut off on a phone that should have wrapped.
    expect(hits(wrapper({ tabindex: '0', named: true }, el('ul', { rect: { w: 700 } })), 'scroll-box-disallowed')).toHaveLength(1);
    expect(hits(wrapper({ tabindex: '0', named: true }), 'scroll-box-disallowed')).toEqual([]);
  });

  it('allows a table, a text area or preformatted text that is itself the scrolling box', () => {
    // Flagging these would report the site's own standard treatments as defects, burying the real ones.
    const self = (tag: string, style: Partial<Record<StyleProp, string>> = {}) => buildCapture(
      el(tag, { rect: { w: PHONE }, style: { 'overflow-x': 'auto', ...style }, scroll: { sw: 700, cw: PHONE }, text: 'wide' }),
      { width: PHONE },
    );
    expect(hits(self('table'), 'scroll-box-disallowed')).toEqual([]);
    expect(hits(self('textarea'), 'scroll-box-disallowed')).toEqual([]);
    expect(hits(self('div', { 'white-space': 'pre' }), 'scroll-box-disallowed')).toEqual([]);
    expect(hits(self('div'), 'scroll-box-disallowed')).toHaveLength(1);
  });
});

describe('table-overflows-container', () => {
  it('reports a table wider than its column at desktop width', () => {
    // A desktop table spilling out of its column overlaps the sidebar or forces a scroll on a wide screen.
    const table = (w: number) => buildCapture(el('div', { rect: { w: 800 } }, el('table', { rect: { w } })), { width: DESKTOP });
    expect(hits(table(900), 'table-overflows-container')).toHaveLength(1);
    expect(hits(table(800), 'table-overflows-container')).toEqual([]);
  });

  it('allows a wide table inside the labelled scroll wrapper, and only that one', () => {
    // A wide admin table scrolls inside its wrapper by design; one that a keyboard
    // reader cannot reach or name must still be reported.
    const wrapped = (attrs: ElementRecord['attrs']) => buildCapture(
      el('div', { cls: 'records-table-wrap', attrs, rect: { w: 800 } }, el('table', { rect: { w: 900 } })),
      { width: DESKTOP },
    );
    expect(hits(wrapped({ tabindex: '0', role: 'region', named: true }), 'table-overflows-container')).toEqual([]);
    expect(hits(wrapped({ tabindex: '0', role: 'region' }), 'table-overflows-container')).toHaveLength(1);
    expect(hits(wrapped({ role: 'region', named: true }), 'table-overflows-container')).toHaveLength(1);
  });
});

describe('table-columns-misaligned', () => {
  // Cells laid out the way a browser draws them: each spec is [x, width], and a
  // row with fewer cells than the table has columns is padded at its trailing edge.
  const cells = (tag: string, specs: Array<[number, number]>) =>
    specs.map(([x, w]) => el(tag, { rect: { x, w }, style: { display: 'table-cell' } }));
  const table = (head: Array<[number, number]>, body: Array<[number, number]>) =>
    buildCapture(el('table', { rect: { w: 300 } },
      el('thead', {}, el('tr', {}, ...cells('th', head))),
      el('tbody', {}, el('tr', {}, ...cells('td', body)))), { width: PHONE });
  const THREE: Array<[number, number]> = [[0, 100], [100, 100], [200, 100]];

  it('reports a header row a column short of its data, as when one header is hidden by position', () => {
    // Every header after the hidden one sits over the wrong column, so a phone reader takes a holder for a score.
    expect(hits(table([[0, 100], [100, 100]], THREE), 'table-columns-misaligned')).toHaveLength(1);
  });

  it('reports data cells hidden under a header that is still drawn', () => {
    // The reverse slip: a column's data hidden while its header stays leaves the last header over nothing.
    expect(hits(table(THREE, [[0, 100], [100, 100]]), 'table-columns-misaligned')).toHaveLength(1);
  });

  it('passes an aligned table and a header that spans two columns', () => {
    // A rule that flagged a spanning header would put every grouped-column table in the baseline as noise.
    expect(hits(table(THREE, THREE), 'table-columns-misaligned')).toEqual([]);
    expect(hits(table([[0, 200], [200, 100]], THREE), 'table-columns-misaligned')).toEqual([]);
  });

  it('ignores a header cell that is not drawn when its data cells are not drawn either', () => {
    // Hiding a whole column on phones is allowed; only a header and its data hidden apart misalign.
    const hidden = el('th', { style: { display: 'none' }, rect: { w: 0 } });
    const hiddenTd = el('td', { style: { display: 'none' }, rect: { w: 0 } });
    const capture = buildCapture(el('table', { rect: { w: 200 } },
      el('thead', {}, el('tr', {}, ...cells('th', [[0, 100]]), hidden, ...cells('th', [[100, 100]]))),
      el('tbody', {}, el('tr', {}, ...cells('td', [[0, 100]]), hiddenTd, ...cells('td', [[100, 100]])))), { width: PHONE });
    expect(hits(capture, 'table-columns-misaligned')).toEqual([]);
  });
});

describe('tap-target-small', () => {
  const pair = (gap: number) =>
    buildCapture(
      [el('button', { rect: { x: 0, w: 20, h: 20 }, text: 'A' }), el('button', { rect: { x: 20 + gap, w: 20, h: 20 }, text: 'B' })],
      { width: PHONE },
    );

  it('reports a control under 24px that crowds a neighbour, and not one with clear space', () => {
    // A thumb aimed at a small crowded control hits its neighbour instead.
    expect(hits(pair(1), 'tap-target-small').length).toBeGreaterThan(0);
    expect(hits(pair(40), 'tap-target-small')).toEqual([]);
  });

  it('exempts a link inside a sentence', () => {
    // WCAG excepts inline links; flagging every prose link would drown the real findings.
    const prose = buildCapture(
      el('p', { text: LONG },
        el('a', { rect: { x: 0, w: 30, h: 18 }, attrs: { href: true }, text: 'one' }),
        el('a', { rect: { x: 31, w: 30, h: 18 }, attrs: { href: true }, text: 'two' })),
      { width: PHONE },
    );
    expect(hits(prose, 'tap-target-small')).toEqual([]);
  });

  it('judges inline links that sit in no sentence, such as a bare row of links', () => {
    // A row of small links outside any prose is a cluster of tap targets, not text, and a thumb hits the wrong one.
    const row = buildCapture(
      el('div', {},
        el('a', { rect: { x: 0, w: 20, h: 18 }, attrs: { href: true }, text: 'one' }),
        el('a', { rect: { x: 21, w: 20, h: 18 }, attrs: { href: true }, text: 'two' })),
      { width: PHONE },
    );
    expect(hits(row, 'tap-target-small')).toHaveLength(2);
  });

  it('exempts links set in a line of words, such as two names joined by a slash in a table cell', () => {
    // "Alice / Bob" wrapping in a narrow cell is text whose line height sizes the links, which WCAG excepts.
    const pair = buildCapture(
      el('td', { text: '/' },
        el('a', { rect: { x: 0, y: 0, w: 60, h: 17 }, attrs: { href: true }, text: 'Alice' }),
        el('a', { rect: { x: 0, y: 17, w: 60, h: 17 }, attrs: { href: true }, text: 'Bob' })),
      { width: PHONE },
    );
    expect(hits(pair, 'tap-target-small')).toEqual([]);
  });

  it('measures clear space as the 24px circle, so a neighbour only at the diagonal corner does not crowd', () => {
    // A square zone reaches corners the WCAG circle does not, flagging controls that meet the spacing exception.
    const diagonal = buildCapture(
      [el('button', { rect: { x: 0, y: 0, w: 20, h: 20 }, text: 'A' }), el('button', { rect: { x: 21, y: 21, w: 30, h: 30 }, text: 'B' })],
      { width: PHONE },
    );
    expect(hits(diagonal, 'tap-target-small')).toEqual([]);
  });

  it('reports two small controls whose circles overlap, though neither circle reaches the other control', () => {
    // Two undersized targets 20px apart centre to centre leave less than 24px each, which is the case WCAG fails.
    const close = buildCapture(
      [el('button', { rect: { x: 0, w: 10, h: 10 }, text: 'A' }), el('button', { rect: { x: 20, w: 10, h: 10 }, text: 'B' })],
      { width: PHONE },
    );
    expect(hits(close, 'tap-target-small')).toHaveLength(2);
  });
});

describe('closed disclosures', () => {
  it('judges nothing a closed disclosure hides, and judges the same content once it is open', () => {
    // The browser still lays hidden content out, so a closed panel's wide table would be reported as overflowing a phone it never appears on.
    const page = (open: boolean) => buildCapture(
      el('details', { rect: { w: PHONE, h: 40 }, attrs: open ? { open: true } : {} },
        el('summary', { rect: { w: PHONE, h: 40 }, text: 'Show the table' }),
        el('table', { rect: { y: 40, w: 600, h: 100 } }),
      ),
      { width: PHONE },
    );
    expect(hits(page(false), 'box-outside-viewport')).toEqual([]);
    expect(hits(page(true), 'box-outside-viewport').map((f) => f.selector)).toEqual(['body>details>table']);
  });
});

describe('display:contents wrappers', () => {
  it('still judges what sits inside a wrapper that draws no box of its own', () => {
    // The header navigation is display:contents; treating its 0x0 box as hiding its links exempted them from every rule.
    const nav = buildCapture(
      // overflow on a contents element clips nothing, because it has no box to clip to.
      el('nav', { style: { display: 'contents', 'overflow-x': 'hidden' }, rect: { w: 0, h: 0 } }, el('a', { attrs: { href: true }, style: { display: 'block', 'font-size': '11px' }, text: 'Clubs' })),
    );
    expect(hits(nav, 'text-below-ramp')).toHaveLength(1);
  });
});

describe('text-below-ramp', () => {
  it('reports text below 0.9rem', () => {
    // Text under 14.4px is hard to read for the older and low-vision readers the site serves.
    const sized = (px: string) => buildCapture(el('span', { text: 'tiny', style: { 'font-size': px } }));
    expect(hits(sized('12px'), 'text-below-ramp')).toHaveLength(1);
    expect(hits(sized('14.4px'), 'text-below-ramp')).toEqual([]);
  });

  it('judges the text a form control shows, which is not text of its own', () => {
    // A field or picker left at the browser's 13.33px default is the smallest text on its page, yet carries no text node.
    const control = (tag: string, type?: string, px = '13.33px') =>
      buildCapture(el(tag, { attrs: type ? { type } : {}, style: { 'font-size': px } }));
    expect(hits(control('input', 'text'), 'text-below-ramp')).toHaveLength(1);
    expect(hits(control('input', 'file'), 'text-below-ramp')).toHaveLength(1);
    expect(hits(control('select'), 'text-below-ramp')).toHaveLength(1);
    expect(hits(control('textarea'), 'text-below-ramp')).toHaveLength(1);
    expect(hits(control('button'), 'text-below-ramp')).toHaveLength(1);
    expect(hits(control('input', 'text', '14.4px'), 'text-below-ramp')).toEqual([]);
    expect(hits(control('input', 'checkbox'), 'text-below-ramp')).toEqual([]);
    expect(hits(control('input', 'hidden'), 'text-below-ramp')).toEqual([]);
  });
});

describe('heading-not-outranking', () => {
  it('reports a heading no larger than the body text beneath it', () => {
    // A heading the same size as the prose does not read as a heading, so the page has no visible structure.
    const page = (px: string) =>
      buildCapture(el('main', {}, el('h2', { text: 'Results', style: { 'font-size': px } }), el('p', { text: LONG })));
    expect(hits(page('16px'), 'heading-not-outranking')).toHaveLength(1);
    expect(hits(page('24px'), 'heading-not-outranking')).toEqual([]);
  });
});

describe('grey text', () => {
  it('reports running prose in the muted grey', () => {
    // Grey body text is read less and trusted less; grey is reserved for metadata.
    const para = (color: string) => buildCapture(el('p', { text: LONG, style: { color } }));
    expect(hits(para('rgb(102, 102, 102)'), 'prose-muted')).toHaveLength(1);
    expect(hits(para('rgb(51, 51, 51)'), 'prose-muted')).toEqual([]);
  });

  it('lets long metadata stay grey on its own metadata class, and nothing else', () => {
    // A source note or byline may be long and grey; prose merely sitting inside
    // a metadata block is still prose a reader has to read.
    const grey = { color: 'rgb(102, 102, 102)' };
    for (const cls of ['source-note', 'set-detail-citation', 'form-hint', 'card-meta']) {
      expect(hits(buildCapture(el('p', { cls, text: LONG, style: grey })), 'prose-muted'), cls).toEqual([]);
    }
    expect(hits(buildCapture(el('p', { cls: 'section-desc', text: LONG, style: grey })), 'prose-muted')).toHaveLength(1);
    expect(hits(buildCapture(el('div', { cls: 'card-meta' }, el('p', { text: LONG, style: grey }))), 'prose-muted')).toHaveLength(1);
  });

  it('reports the subtle grey on text and not on an element without text', () => {
    // The subtle grey is below 4.5:1 on white, so any text in it fails readers.
    expect(hits(buildCapture(el('span', { text: 'source', style: { color: 'rgb(138, 138, 138)' } })), 'text-subtle-used')).toHaveLength(1);
    expect(hits(buildCapture(el('hr', { style: { color: 'rgb(138, 138, 138)' } })), 'text-subtle-used')).toEqual([]);
  });
});

describe('contrast-low', () => {
  it('holds normal text to 4.5:1 and large text to 3:1', () => {
    // Low-contrast text is unreadable for low-vision readers and on a phone in sunlight.
    const text = (px: string) => buildCapture(el('p', { text: 'Grey', style: { color: 'rgb(148, 148, 148)', 'font-size': px } }));
    expect(hits(text('16px'), 'contrast-low')).toHaveLength(1);
    expect(hits(text('24px'), 'contrast-low')).toEqual([]);
  });

  it('judges text against the composited background, and skips text over a gradient', () => {
    // Grey text that just passes on white fails on a faint tint; ignoring the tint would pass it.
    const grey = el('span', { text: 'Meta', style: { color: 'rgb(118, 118, 118)' } });
    expect(hits(buildCapture(el('div', {}, grey)), 'contrast-low')).toEqual([]);
    const onTint = buildCapture(el('div', { style: { 'background-color': 'rgba(0, 0, 0, 0.1)' } }, grey));
    expect(hits(onTint, 'contrast-low')).toHaveLength(1);
    const onGradient = buildCapture(
      el('div', { style: { 'background-image': 'linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))' } },
        el('span', { text: 'Join', style: { color: 'rgb(255, 255, 255)' } })),
    );
    expect(hits(onGradient, 'contrast-low')).toEqual([]);
  });

  it('skips text no reader sees: faded fully out, or hidden from assistive technology as decoration', () => {
    // Judging invisible text, or a decorative separator dot, reports defects a visitor never meets.
    const faint = { color: 'rgb(200, 200, 200)' };
    expect(hits(buildCapture(el('span', { text: 'Grey', style: faint })), 'contrast-low')).toHaveLength(1);
    expect(hits(buildCapture(el('span', { text: 'Grey', style: { ...faint, opacity: '0' } })), 'contrast-low')).toEqual([]);
    expect(hits(buildCapture(el('div', { style: { opacity: '0' } }, el('span', { text: 'Grey', style: faint }))), 'contrast-low')).toEqual([]);
    expect(hits(buildCapture(el('span', { text: '·', attrs: { ariaHidden: true }, style: faint })), 'contrast-low')).toEqual([]);
    expect(hits(buildCapture(el('div', { attrs: { ariaHidden: true } }, el('span', { text: 'Grey', style: faint }))), 'contrast-low')).toEqual([]);
  });
});

describe('link-no-cue-in-prose', () => {
  const linkIn = (block: string, style: Partial<Record<StyleProp, string>>) =>
    buildCapture(el(block, { text: LONG }, el('a', { attrs: { href: true }, text: 'link', style: { color: 'rgb(14, 128, 80)', ...style } })));

  it('reports a prose link marked by colour alone, and accepts an underlined one', () => {
    // The link green is 2.54:1 against body text, so a colour-blind reader cannot find an unmarked link.
    expect(hits(linkIn('p', {}), 'link-no-cue-in-prose')).toHaveLength(1);
    expect(hits(linkIn('p', { 'text-decoration-line': 'underline' }), 'link-no-cue-in-prose')).toEqual([]);
  });

  it('leaves a link whose context signals it, such as a list item', () => {
    // Navigation and link lists drop the resting underline by design.
    expect(hits(linkIn('li', {}), 'link-no-cue-in-prose')).toEqual([]);
  });

  it('leaves a link that is only an image, which has no text for an underline to mark', () => {
    // An image link in a paragraph is found by its picture; reporting it buries the text links that need a cue.
    const imageLink = buildCapture(el('p', { text: LONG },
      el('a', { attrs: { href: true }, style: { color: 'rgb(14, 128, 80)' } }, el('img', { rect: { w: 40, h: 40 } }))));
    expect(hits(imageLink, 'link-no-cue-in-prose')).toEqual([]);
  });
});

describe('form rules', () => {
  it('reports a fieldset still drawing a border', () => {
    // The browser's notched fieldset border belongs to no surface on the site.
    const fs = (w: string, s: string) =>
      buildCapture(el('fieldset', { style: { 'border-top-width': w, 'border-top-style': s } }));
    expect(hits(fs('2px', 'groove'), 'fieldset-bordered')).toHaveLength(1);
    expect(hits(fs('0px', 'none'), 'fieldset-bordered')).toEqual([]);
  });

  it('reports an element marked hidden that a stylesheet rule still draws', () => {
    // A display rule outranking the hidden attribute shows content the page meant to withhold.
    expect(hits(buildCapture(el('div', { attrs: { hidden: true } })), 'hidden-but-displayed')).toHaveLength(1);
    expect(hits(buildCapture(el('div', { attrs: { hidden: true }, style: { display: 'none' } })), 'hidden-but-displayed')).toEqual([]);
  });

  it('reports a field with no visible label, and leaves hidden inputs alone', () => {
    // A field labelled only by its placeholder loses its label as soon as the reader types.
    expect(hits(buildCapture(el('input', { attrs: { type: 'text' }, visibleLabel: false })), 'field-without-visible-label')).toHaveLength(1);
    expect(hits(buildCapture(el('input', { attrs: { type: 'text' }, visibleLabel: true })), 'field-without-visible-label')).toEqual([]);
    expect(hits(buildCapture(el('input', { attrs: { type: 'hidden' } })), 'field-without-visible-label')).toEqual([]);
  });

  it('accepts a named field in a search form beside its submit button, and nothing looser', () => {
    // The search-box pattern is labelled by its button and its accessible name; requiring more would flag every
    // search box, while accepting an unnamed field or a form with no button would pass a field nobody can identify.
    const search = (fieldAttrs: ElementRecord['attrs'], formAttrs: ElementRecord['attrs'], withButton = true) =>
      buildCapture(el('form', { attrs: formAttrs },
        el('input', { attrs: { type: 'text', ...fieldAttrs }, visibleLabel: false }),
        ...(withButton ? [el('button', { attrs: { type: 'submit' }, text: 'Search' })] : [])));
    expect(hits(search({ named: true }, { role: 'search' }), 'field-without-visible-label')).toEqual([]);
    expect(hits(search({ named: true }, {}), 'field-without-visible-label')).toHaveLength(1);
    expect(hits(search({}, { role: 'search' }), 'field-without-visible-label')).toHaveLength(1);
    expect(hits(search({ named: true }, { role: 'search' }, false), 'field-without-visible-label')).toHaveLength(1);
  });
});

describe('empty-state-leaks-code', () => {
  const ctx = { tableNames: tableNamesFromSchema('CREATE TABLE member_tier_grants (id TEXT);\nCREATE TABLE IF NOT EXISTS members (id TEXT);') };

  it('reports a message naming a database table, and not a plain sentence', () => {
    // A member reading "no member_tier_grants rows" sees the site's internals instead of an explanation.
    const msg = (text: string) => buildCapture(el('p', { cls: 'empty-state', text }));
    expect(hits(msg('No member_tier_grants rows.'), 'empty-state-leaks-code', ctx)).toHaveLength(1);
    expect(hits(msg('No members have joined yet.'), 'empty-state-leaks-code', ctx)).toEqual([]);
  });

  it('scans alert, status and live regions, which carry messages without a message class', () => {
    // A refusal rendered in a bare role="alert" box that names a table would leak internals unnoticed.
    const region = (attrs: ElementRecord['attrs']) =>
      buildCapture(el('div', { attrs, text: 'No member_tier_grants rows.' }));
    expect(hits(region({ role: 'alert' }), 'empty-state-leaks-code', ctx)).toHaveLength(1);
    expect(hits(region({ role: 'status' }), 'empty-state-leaks-code', ctx)).toHaveLength(1);
    expect(hits(region({ live: 'polite' }), 'empty-state-leaks-code', ctx)).toHaveLength(1);
    expect(hits(region({ live: 'off' }), 'empty-state-leaks-code', ctx)).toEqual([]);
    expect(hits(region({ role: 'region' }), 'empty-state-leaks-code', ctx)).toEqual([]);
  });

  it('counts only compound table names as leaks', () => {
    // A one-word table such as "members" is ordinary English; treating it as a leak would flag every friendly sentence.
    expect([...ctx.tableNames]).toEqual(['member_tier_grants']);
  });
});

describe('spacing-off-rhythm', () => {
  // Two paragraphs stacked with the given gap between them.
  const pair = (gap: number, width = DESKTOP) => buildCapture(el('main', { rect: { h: 200 } },
    el('p', { rect: { y: 0, h: 20 }, text: 'First block' }),
    el('p', { rect: { y: 20 + gap, h: 20 }, text: 'Second block' }),
  ), { width });

  it('reports a gap between steps, a zero gap and one past the widest step, and accepts a step', () => {
    // A gap of 20px or 0px is the drift the rhythm exists to remove: blocks read as crowded or as pasted together.
    expect(hits(pair(20), 'spacing-off-rhythm').map((f) => f.measured)).toEqual(['20px below p']);
    expect(hits(pair(0), 'spacing-off-rhythm')).toHaveLength(1);
    expect(hits(pair(48), 'spacing-off-rhythm')).toHaveLength(1);
    expect(hits(pair(16), 'spacing-off-rhythm')).toEqual([]);
    expect(hits(pair(16.8), 'spacing-off-rhythm')).toEqual([]);
  });

  it('holds a phone to the narrower set, where the widest step steps down', () => {
    // A 32px gap on a phone leaves the screen reading as half empty.
    expect(hits(pair(32), 'spacing-off-rhythm')).toEqual([]);
    expect(hits(pair(32, PHONE), 'spacing-off-rhythm')).toHaveLength(1);
    expect(hits(pair(24, PHONE), 'spacing-off-rhythm')).toEqual([]);
  });

  it('measures what is drawn, so an invisible wrapper\'s padding counts as the space a reader sees', () => {
    // Judging the wrapper's box would pass a 16px margin plus 10px of padding that reads as a 26px gap.
    const c = buildCapture(el('main', { rect: { h: 200 } },
      el('p', { rect: { y: 0, h: 20 }, text: 'Before' }),
      el('div', { rect: { y: 36, h: 40 } }, el('p', { rect: { y: 46, h: 20 }, text: 'Inside a padded wrapper' })),
    ));
    expect(hits(c, 'spacing-off-rhythm').map((f) => f.measured)).toEqual(['26px below p']);
  });

  it('judges the space inside a filled box, and not inside a box drawn only by a divider line', () => {
    // A card whose padding drifts to 18px sits beside 16px cards and reads as a different component.
    const card = (inset: number, style: NodeSpec['style']) => buildCapture(el('main', { rect: { h: 300 } },
      el('div', { rect: { y: 0, h: 20 + inset * 2 }, style }, el('p', { rect: { y: inset, h: 20 }, text: 'Card text' })),
    ));
    const filled = { 'background-color': 'rgb(255, 255, 255)' };
    expect(hits(card(18, filled), 'spacing-off-rhythm').map((f) => f.measured)).toEqual(['18px inside the top edge', '18px inside the bottom edge']);
    expect(hits(card(16, filled), 'spacing-off-rhythm')).toEqual([]);
    const divider = { 'border-top-width': '1px', 'border-top-style': 'solid' };
    expect(hits(card(18, divider), 'spacing-off-rhythm')).toEqual([]);
  });

  it('lets a stretched column pin its last item to the bottom, and nothing else', () => {
    // Cards in one row keep their buttons aligned; the gap above the button grows with the tallest card by design.
    const column = (parentDisplay: string) => buildCapture(el('main', { rect: { h: 300 }, style: { display: parentDisplay } },
      el('div', { rect: { y: 0, h: 120 }, style: { display: 'flex', 'flex-direction': 'column' } },
        el('p', { rect: { y: 0, h: 20 }, text: 'Card text' }),
        el('button', { rect: { y: 60, h: 30 }, text: 'Open' }),
      ),
    ));
    expect(hits(column('grid'), 'spacing-off-rhythm')).toEqual([]);
    expect(hits(column('block'), 'spacing-off-rhythm').map((f) => f.measured)).toEqual(['40px below p']);
  });

  it('measures a heading that wraps a link by its line, not by the tighter box of the link', () => {
    // A link's box sits a few pixels inside its line, which would report a 16px card padding as 19px.
    const c = buildCapture(el('main', { rect: { h: 300 } },
      el('div', { rect: { y: 0, h: 58 }, style: { 'background-color': 'rgb(255, 255, 255)' } },
        el('h3', { rect: { y: 16, h: 26 } }, el('a', { rect: { y: 19, h: 20 }, text: 'Card title' })),
      ),
    ));
    expect(hits(c, 'spacing-off-rhythm')).toEqual([]);
  });

  it('leaves the rows of a wrapping row or a multi-column grid alone, and a picture filling its frame', () => {
    // A wrapped chip or a grid cell under a taller neighbour is a new row, and a full-bleed image has no padding to judge.
    const wrapped = buildCapture(el('main', { rect: { h: 100 }, style: { display: 'flex', 'flex-direction': 'row' } },
      el('span', { rect: { y: 0, h: 20 }, style: { display: 'block' }, text: 'Chip one' }),
      el('span', { rect: { y: 50, h: 20 }, style: { display: 'block' }, text: 'Chip two' }),
    ));
    expect(hits(wrapped, 'spacing-off-rhythm')).toEqual([]);
    const tile = buildCapture(el('main', { rect: { h: 200 } },
      el('div', { rect: { y: 0, h: 120 }, style: { 'background-color': 'rgb(255, 255, 255)' } }, el('img', { rect: { y: 0, h: 120 } })),
    ));
    expect(hits(tile, 'spacing-off-rhythm')).toEqual([]);
  });

  it('lets a card in a row stretch below its content, but not run its content into its edge', () => {
    // Cards in one grid row share the tallest card's height, so a shorter card's bottom space grows by design.
    const row = (bottomInset: number) => buildCapture(el('main', { rect: { h: 300 }, style: { display: 'grid', 'grid-template-columns': '300px 300px' } },
      el('div', { rect: { y: 0, h: 36 + bottomInset }, style: { 'background-color': 'rgb(255, 255, 255)' } },
        el('p', { rect: { y: 16, h: 20 }, text: 'Short card' }),
      ),
    ));
    expect(hits(row(50), 'spacing-off-rhythm')).toEqual([]);
    expect(hits(row(0), 'spacing-off-rhythm').map((f) => f.measured)).toEqual(['0px inside the bottom edge']);
  });

  it('ignores what a closed disclosure hides, and judges what an open one shows', () => {
    // Hidden content laid out under a closed summary is not on screen, so it has no gap a reader sees.
    // A closed disclosure stretched by its grid row still holds its hidden content inside its box.
    const disclosure = (open: boolean) => buildCapture(el('main', { rect: { h: 300 } },
      el('details', { rect: { y: 0, h: 120 }, attrs: open ? { open: true } : {} },
        el('summary', { rect: { y: 0, h: 20 }, text: 'Show more' }),
        el('p', { rect: { y: 20, h: 20 }, text: 'Revealed text' }),
      ),
    ));
    expect(hits(disclosure(false), 'spacing-off-rhythm')).toEqual([]);
    expect(hits(disclosure(true), 'spacing-off-rhythm').map((f) => f.measured)).toEqual(['0px below summary']);
    // Hidden content nested deeper than the disclosure's own children is just as hidden.
    const nested = buildCapture(el('main', { rect: { h: 300 } },
      el('details', { rect: { y: 0, h: 20 } },
        el('summary', { rect: { y: 0, h: 20 }, text: 'Show more' }),
        el('div', { rect: { y: 20, h: 60 } },
          el('p', { rect: { y: 20, h: 20 }, text: 'Hidden one' }),
          el('p', { rect: { y: 40, h: 20 }, text: 'Hidden two' }),
        ),
      ),
    ));
    expect(hits(nested, 'spacing-off-rhythm')).toEqual([]);
  });

  it('measures a text block by the lines inside its padding when it draws no box', () => {
    // An unboxed summary padded 12px reads as 12px further from the line above, not as touching it.
    const c = buildCapture(el('main', { rect: { h: 300 } },
      el('p', { rect: { y: 0, h: 20 }, text: 'Before' }),
      el('div', { rect: { y: 20, h: 44 }, style: { 'padding-top': '12px', 'padding-bottom': '12px' }, text: 'Padded line' }),
    ));
    expect(hits(c, 'spacing-off-rhythm')).toEqual([]);
  });

  it('accepts a panel hung without a top edge from the tab bar above it, and not two boxes merely touching', () => {
    // Tabs and their panel are one control drawn in two parts; two cards touching are two blocks with no gap.
    const pair = (lowerTop: string) => buildCapture(el('main', { rect: { h: 300 } },
      el('div', { rect: { y: 0, h: 40 }, style: { 'border-bottom-width': '2px', 'border-bottom-style': 'solid' } },
        el('span', { rect: { y: 0, h: 38 }, style: { display: 'block' }, text: 'Photo' }),
      ),
      el('div', { rect: { y: 40, h: 100 }, style: { 'background-color': 'rgb(255, 255, 255)', 'border-top-width': lowerTop, 'border-top-style': 'solid' } },
        el('p', { rect: { y: 56, h: 20 }, text: 'Panel' }),
      ),
    ));
    expect(hits(pair('0px'), 'spacing-off-rhythm').filter((f) => f.measured.includes('below'))).toEqual([]);
    expect(hits(pair('1px'), 'spacing-off-rhythm').filter((f) => f.measured.includes('below')).map((f) => f.measured)).toEqual(['0px below div']);
  });

  it('measures a checkbox that hangs below its label line, not just the line', () => {
    // A form ending in a checkbox would otherwise read 4px further from the next block than it is.
    const c = buildCapture(el('main', { rect: { h: 300 } },
      el('label', { rect: { y: 0, h: 24 }, style: { display: 'block' } },
        el('input', { rect: { y: 4, h: 24 }, attrs: { type: 'checkbox' }, style: { display: 'inline-block' } }),
        el('span', { rect: { y: 2, h: 20 }, text: 'Show my email' }),
      ),
      el('p', { rect: { y: 44, h: 20 }, text: 'Next block' }),
    ));
    expect(hits(c, 'spacing-off-rhythm')).toEqual([]);
  });

  it('leaves blocks set side by side alone', () => {
    // Two columns in one row have no vertical gap between them to judge.
    const c = buildCapture(el('main', { rect: { h: 100 } },
      el('p', { rect: { x: 0, y: 0, w: 200, h: 20 }, text: 'Left' }),
      el('p', { rect: { x: 220, y: 5, w: 200, h: 20 }, text: 'Right' }),
    ));
    expect(hits(c, 'spacing-off-rhythm')).toEqual([]);
  });
});

describe('contrast-low on form controls and page backgrounds', () => {
  it('judges the text a form control shows against the control\'s own background', () => {
    // A field whose typed value is pale grey on white would pass, because the control carries no text node of its own.
    const field = (color: string) => buildCapture(el('input', { attrs: { type: 'text' }, style: { color, 'background-color': 'rgb(255, 255, 255)' } }));
    expect(hits(field('rgb(190, 190, 190)'), 'contrast-low').map((f) => f.selector)).toEqual(['body>input']);
    expect(hits(field('rgb(51, 51, 51)'), 'contrast-low')).toEqual([]);
  });

  it('judges text with no background of its own against the page background, not an assumed white', () => {
    // Light text on a page that paints its body dark would be reported as failing, and dark text there would pass.
    const page = (bodyBackground: string) => buildCapture(el('p', { text: 'Footer line', style: { color: 'rgb(230, 230, 230)' } }), { page: { bodyBackground } });
    expect(hits(page('rgb(17, 17, 17)'), 'contrast-low')).toEqual([]);
    expect(hits(page('rgb(255, 255, 255)'), 'contrast-low')).toHaveLength(1);
  });
});

describe('contrast-unjudged', () => {
  it('reports text whose colour, or a background behind it, the check cannot read, and not readable colours', () => {
    // An oklch() or color-mix() colour skipped silently is text whose contrast nobody has measured.
    const text = (color: string, bg = 'rgba(0, 0, 0, 0)') =>
      buildCapture(el('div', { style: { 'background-color': bg } }, el('p', { text: 'Words', style: { color } })));
    expect(hits(text('oklch(0.6 0.1 200)'), 'contrast-unjudged').map((f) => f.measured)).toEqual(['cannot read oklch(0.6 0.1 200)']);
    expect(hits(text('rgb(51, 51, 51)', 'color-mix(in srgb, red 50%, white)'), 'contrast-unjudged')).toHaveLength(1);
    expect(hits(text('rgb(51, 51, 51)'), 'contrast-unjudged')).toEqual([]);
    // The same unreadable colour never also counts as a contrast failure.
    expect(hits(text('oklch(0.6 0.1 200)'), 'contrast-low')).toEqual([]);
  });
});

describe('text-overlaps', () => {
  const pair = (secondY: number, secondStyle: Partial<Record<StyleProp, string>> = {}) => buildCapture(el('div', { rect: { h: 200 } },
    el('p', { rect: { x: 0, y: 0, w: 300, h: 40 }, text: 'First line of text' }),
    el('p', { rect: { x: 0, y: secondY, w: 300, h: 40 }, text: 'Second line of text', style: secondStyle }),
  ));

  it('reports two blocks of text drawn over each other, and not two that only touch', () => {
    // Overlapping text is unreadable in both places; a reader sees neither line.
    expect(hits(pair(10), 'text-overlaps').map((f) => f.measured)).toEqual(['300x30px over p']);
    expect(hits(pair(39), 'text-overlaps')).toEqual([]);
    expect(hits(pair(40), 'text-overlaps')).toEqual([]);
  });

  it('leaves text inside other text alone, and a float whose neighbour wraps its lines around it', () => {
    // A heading's link sits inside the heading's box, and a paragraph's box runs under a float its lines avoid.
    const nested = buildCapture(el('h2', { rect: { h: 40 }, text: 'Heading' }, el('span', { rect: { h: 40 }, style: { display: 'block' }, text: 'inside' })));
    expect(hits(nested, 'text-overlaps')).toEqual([]);
    expect(hits(pair(10, { float: 'left' }), 'text-overlaps')).toEqual([]);
  });

  it('leaves inline words alone, whose line box spans the words beside them', () => {
    // A link wrapping onto a second line has a bounding box covering the words that follow it on that line.
    const inline = buildCapture(el('p', { rect: { h: 40 }, text: 'Words' },
      el('a', { rect: { x: 0, y: 0, w: 300, h: 40 }, attrs: { href: true }, text: 'a long link' }),
      el('em', { rect: { x: 100, y: 20, w: 50, h: 20 }, text: 'after' }),
    ));
    expect(hits(inline, 'text-overlaps')).toEqual([]);
  });
});

describe('text-clipped', () => {
  const box = (style: Partial<Record<StyleProp, string>>, scroll: { sw: number; cw: number; sh?: number; ch?: number }, text = 'A name too long for its box') =>
    buildCapture(el('div', { style, scroll, text }));

  it('reports text cut off at the side or the bottom with no ellipsis', () => {
    // A cut-off word or line reads as the whole of it; the reader never learns anything is missing.
    expect(hits(box({ 'overflow-x': 'hidden' }, { sw: 500, cw: 300 }), 'text-clipped')).toHaveLength(1);
    expect(hits(box({ 'overflow-y': 'clip' }, { sw: 300, cw: 300, sh: 90, ch: 40 }), 'text-clipped')).toHaveLength(1);
  });

  it('accepts a cut marked by an ellipsis or a line clamp, a scroll box, and a box that clips only a picture', () => {
    // These show the reader that more exists, let them reach it, or cut nothing anyone reads.
    expect(hits(box({ 'overflow-x': 'hidden', 'text-overflow': 'ellipsis' }, { sw: 500, cw: 300 }), 'text-clipped')).toEqual([]);
    expect(hits(box({ 'overflow-y': 'hidden', '-webkit-line-clamp': '2' }, { sw: 300, cw: 300, sh: 90, ch: 40 }), 'text-clipped')).toEqual([]);
    expect(hits(box({ 'overflow-x': 'auto' }, { sw: 500, cw: 300 }), 'text-clipped')).toEqual([]);
    expect(hits(box({ 'overflow-x': 'hidden' }, { sw: 500, cw: 300 }, ''), 'text-clipped')).toEqual([]);
  });
});

describe('focus-not-visible', () => {
  const REST: Record<string, string> = {
    'outline-style': 'none', 'outline-width': '0px', 'outline-color': 'rgb(51, 51, 51)', 'box-shadow': '',
    'text-decoration-line': 'none', 'background-color': 'rgba(0, 0, 0, 0)', 'border-top-color': '', color: 'rgb(51, 51, 51)',
  };
  const focused = (styles: Record<string, string>, rect = { x: 0, y: 0, w: 300, h: 20 }) => {
    const c = buildCapture(el('a', { attrs: { href: true }, text: 'Clubs' }));
    const record: FocusRecord = { key: c.elements[0].key, rect, styles: { ...REST, ...styles } };
    return { ...c, focus: [record] };
  };

  it('reports a control whose focus draws nothing new', () => {
    // A keyboard reader tabbing through the page cannot tell where they are.
    expect(hits(focused({}), 'focus-not-visible').map((f) => f.selector)).toEqual(['body>a']);
  });

  it('accepts an outline, an underline, a shadow, a colour change or a box moving into view', () => {
    // Each of these shows the focused control; demanding one kind would fail the site's underline-on-focus links.
    for (const styles of [
      { 'outline-style': 'solid', 'outline-width': '2px' } as Record<string, string>,
      { 'text-decoration-line': 'underline' },
      { 'box-shadow': 'rgb(0, 0, 0) 0px 0px 0px 3px' },
      { 'background-color': 'rgb(238, 238, 255)' },
    ]) expect(hits(focused(styles), 'focus-not-visible'), JSON.stringify(styles)).toEqual([]);
    expect(hits(focused({}, { x: 0, y: 0, w: 120, h: 40 }), 'focus-not-visible')).toEqual([]);
  });

  it('accepts a field whose focus ring is drawn by the box around it, and nothing the box drew already', () => {
    // A tag field inside a chip box shows focus on the box (focus-within); the field itself draws nothing new.
    const c = buildCapture(el('div', { cls: 'chip-box', style: { 'box-shadow': 'none' } }, el('input', { attrs: { type: 'text' } })));
    const [box, input] = c.elements;
    const record = (boxShadow: string): FocusRecord => ({
      key: input.key, rect: input.rect, styles: { ...REST },
      ancestors: [{ key: box.key, styles: { ...REST, 'box-shadow': boxShadow } }],
    });
    expect(hits({ ...c, focus: [record('rgb(51, 102, 204) 0px 0px 0px 2px')] }, 'focus-not-visible')).toEqual([]);
    expect(hits({ ...c, focus: [record('none')] }, 'focus-not-visible')).toHaveLength(1);
  });

  it('does not count an outline the control already draws at rest', () => {
    // A border-like outline present before focus is not a focus indicator.
    const c = buildCapture(el('a', { attrs: { href: true }, text: 'Clubs', style: { 'outline-style': 'solid', 'outline-width': '1px' } }));
    const withFocus = { ...c, focus: [{ key: c.elements[0].key, rect: c.elements[0].rect, styles: { ...REST, 'outline-style': 'solid', 'outline-width': '1px' } }] };
    expect(hits(withFocus, 'focus-not-visible')).toHaveLength(1);
  });
});

describe('colour-off-palette', () => {
  const PALETTE = ['rgb(51, 51, 51)', 'rgb(255, 255, 255)', 'rgba(255, 255, 255, 0.85)'];

  it('reports text, a fill or a drawn border in a colour no token holds', () => {
    // A one-off colour is a parallel palette the token gate cannot see, such as a browser-default button.
    const text = buildCapture(el('p', { text: 'x', style: { color: 'rgb(1, 2, 3)' } }), { palette: PALETTE });
    const fill = buildCapture(el('div', { style: { 'background-color': 'rgb(239, 239, 239)' } }), { palette: PALETTE });
    const border = buildCapture(el('div', { style: { 'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': 'rgb(118, 118, 118)' } }), { palette: PALETTE });
    expect(hits(text, 'colour-off-palette').map((f) => f.measured)).toEqual(['color rgba(1,2,3,1) is no token']);
    expect(hits(fill, 'colour-off-palette')).toHaveLength(1);
    expect(hits(border, 'colour-off-palette')).toHaveLength(1);
  });

  it('accepts token colours, a translucent token, and colours nothing draws', () => {
    // An undrawn border's colour and an element without text's colour are never seen.
    const fine = buildCapture([
      el('p', { text: 'x', style: { color: '#333333', 'background-color': 'rgba(255, 255, 255, 0.85)' } }),
      el('div', { style: { color: 'rgb(1, 2, 3)', 'border-top-color': 'rgb(1, 2, 3)' } }),
    ], { palette: PALETTE });
    expect(hits(fine, 'colour-off-palette')).toEqual([]);
  });
});

describe('prose-leading-tight', () => {
  const para = (lineHeight: string) => buildCapture(el('p', { text: LONG, style: { 'line-height': lineHeight } }));

  it('reports prose set tighter than 1.4 times its type size, browser "normal" included', () => {
    // Crowded lines make a long paragraph hard to track from one line to the next.
    expect(hits(para('20px'), 'prose-leading-tight').map((f) => f.measured)).toEqual(['line height 1.25 times the type size']);
    expect(hits(para('normal'), 'prose-leading-tight')).toHaveLength(1);
  });

  it('accepts the site\'s body leading and short text', () => {
    // Body prose at 1.6 is the standard; a one-line label is not running prose.
    expect(hits(para('25.6px'), 'prose-leading-tight')).toEqual([]);
    expect(hits(para('22.4px'), 'prose-leading-tight')).toEqual([]);
    expect(hits(buildCapture(el('p', { text: 'Short.', style: { 'line-height': '16px' } })), 'prose-leading-tight')).toEqual([]);
  });
});

describe('image-unsized', () => {
  it('reports an image with no declared shape, and accepts one with width and height or an aspect ratio', () => {
    // An image with no declared shape takes no room until it loads, then pushes everything below it down.
    // The browser reports aspect-ratio "auto" whether or not the attributes are there, so the attributes decide.
    const img = (ratio: string, attrs: { sized?: true } = {}) => buildCapture(el('img', { rect: { w: 150, h: 150 }, attrs, style: { 'aspect-ratio': ratio } }));
    expect(hits(img('auto'), 'image-unsized')).toHaveLength(1);
    expect(hits(img('auto', { sized: true }), 'image-unsized')).toEqual([]);
    expect(hits(img('16 / 9'), 'image-unsized')).toEqual([]);
  });

  it('accepts an image whose frame fixes its shape: a tile with an aspect ratio, or a wrapper it is placed inside', () => {
    // A gallery tile or a 16:9 video frame keeps its size before the picture loads, so nothing below it moves.
    const inTile = buildCapture(el('a', { style: { display: 'block', 'aspect-ratio': '1 / 1' } }, el('img')));
    const placed = buildCapture(el('div', { style: { position: 'relative' } }, el('img', { style: { position: 'absolute' } })));
    // A video thumbnail sits in a link that is itself placed to fill the 16:9 frame.
    const inPlacedLink = buildCapture(el('div', { style: { 'aspect-ratio': '16 / 9', position: 'relative' } },
      el('a', { style: { display: 'block', position: 'absolute' } }, el('img'))));
    expect(hits(inTile, 'image-unsized')).toEqual([]);
    expect(hits(placed, 'image-unsized')).toEqual([]);
    expect(hits(inPlacedLink, 'image-unsized')).toEqual([]);
    // A frame that fixes nothing still leaves the image to push the page.
    expect(hits(buildCapture(el('a', { style: { display: 'block' } }, el('img'))), 'image-unsized')).toHaveLength(1);
  });
});

describe('layout-shift note', () => {
  it('names a page whose content jumped by more than 0.1 while loading, and not one that held still', () => {
    // Content moving under a reader's finger or eye makes them tap or read the wrong thing.
    const page = (layoutShift: number | null) => buildCapture(el('main'), { page: { layoutShift } });
    expect(layoutShiftNote(page(0.25))).toMatch(/^layout-shift score 0\.25 /);
    expect(layoutShiftNote(page(0.1))).toBeNull();
    expect(layoutShiftNote(page(null))).toBeNull();
  });

  it('never fails a check, because the score differs between two loads of one page', () => {
    // A score that decides pass or fail would make the whole-site check flaky.
    expect(evaluate(buildCapture(el('main'), { page: { layoutShift: 0.9 } }), NO_TABLES)).toEqual([]);
  });
});

/**
 * One planted defect per rule, with the element it must name. A rule that
 * fires on the wrong element sends whoever fixes it to the wrong place; a rule
 * with no planted case here could stop firing without any test noticing.
 */
const PLANTED: Record<string, () => { capture: Capture; selectors: string[]; ctx?: { tableNames: Set<string> } }> = {
  'box-outside-viewport': () => ({ capture: buildCapture(el('div', { rect: { w: 600 } }, el('span', { rect: { w: 600 }, text: 'wide' })), { width: PHONE }), selectors: ['body>div>span'] }),
  'page-overflow': () => ({ capture: buildCapture(el('div'), { width: PHONE, page: { scrollWidth: 500 } }), selectors: ['document'] }),
  'scroll-box-unlabelled': () => ({ capture: buildCapture(el('div', { rect: { w: PHONE }, style: { 'overflow-x': 'auto' }, scroll: { sw: 600, cw: PHONE } }, el('table', { rect: { w: 600 } })), { width: PHONE }), selectors: ['body>div'] }),
  'scroll-box-disallowed': () => ({ capture: buildCapture(el('div', { rect: { w: PHONE }, style: { 'overflow-x': 'auto' }, scroll: { sw: 600, cw: PHONE } }, el('p', { text: 'x' })), { width: PHONE }), selectors: ['body>div'] }),
  'table-overflows-container': () => ({ capture: buildCapture(el('div', { rect: { w: 300 } }, el('table', { rect: { w: 600 } }))), selectors: ['body>div>table'] }),
  'table-columns-misaligned': () => ({
    capture: buildCapture(el('table', {},
      el('thead', {}, el('tr', {}, el('th', { rect: { x: 0, w: 100 }, text: 'Name' }))),
      el('tbody', {}, el('tr', {}, el('td', { rect: { x: 0, w: 100 }, text: 'a' }), el('td', { rect: { x: 100, w: 100 }, text: 'b' }))),
    )),
    selectors: ['body>table'],
  }),
  'tap-target-small': () => ({
    capture: buildCapture(el('div', {},
      el('a', { rect: { x: 0, y: 0, w: 10, h: 10 }, attrs: { href: true }, style: { display: 'inline-block' }, text: 'a' }),
      el('a', { rect: { x: 15, y: 0, w: 10, h: 10 }, attrs: { href: true }, style: { display: 'inline-block' }, text: 'b' }),
    ), { width: PHONE }),
    selectors: ['body>div>a', 'body>div>a'],
  }),
  'text-below-ramp': () => ({ capture: buildCapture(el('p', { text: 'small', style: { 'font-size': '12px' } })), selectors: ['body>p'] }),
  'heading-not-outranking': () => ({ capture: buildCapture(el('main', {}, el('h2', { text: 'Heading' }), el('p', { text: LONG }))), selectors: ['body>main>h2'] }),
  'prose-muted': () => ({ capture: buildCapture(el('p', { text: LONG, style: { color: 'rgb(102, 102, 102)' } })), selectors: ['body>p'] }),
  'text-subtle-used': () => ({ capture: buildCapture(el('span', { text: 'x', style: { color: 'rgb(138, 138, 138)' } })), selectors: ['body>span'] }),
  'contrast-low': () => ({ capture: buildCapture(el('p', { text: 'pale', style: { color: 'rgb(200, 200, 200)' } })), selectors: ['body>p'] }),
  'link-no-cue-in-prose': () => ({ capture: buildCapture(el('p', { text: 'See' }, el('a', { attrs: { href: true }, text: 'here', style: { color: 'rgb(14, 128, 80)' } }))), selectors: ['body>p>a'] }),
  'fieldset-bordered': () => ({ capture: buildCapture(el('fieldset', { style: { 'border-top-width': '2px', 'border-top-style': 'groove' } })), selectors: ['body>fieldset'] }),
  'hidden-but-displayed': () => ({ capture: buildCapture(el('div', { attrs: { hidden: true } })), selectors: ['body>div'] }),
  'field-without-visible-label': () => ({ capture: buildCapture(el('input', { visibleLabel: false })), selectors: ['body>input'] }),
  'empty-state-leaks-code': () => ({ capture: buildCapture(el('div', { cls: 'empty-state', text: 'No member_profiles rows' })), selectors: ['body>div.empty-state'], ctx: { tableNames: new Set(['member_profiles']) } }),
  'spacing-off-rhythm': () => ({
    capture: buildCapture(el('div', { rect: { h: 100 } },
      el('p', { rect: { y: 0, h: 20 }, text: 'One' }),
      el('p', { rect: { y: 30, h: 20 }, text: 'Two' }),
    )),
    selectors: ['body>div>p'],
  }),
  'contrast-unjudged': () => ({ capture: buildCapture(el('p', { text: 'x', style: { color: 'oklch(0.6 0.1 200)' } })), selectors: ['body>p'] }),
  'text-overlaps': () => ({
    capture: buildCapture(el('div', { rect: { h: 100 } },
      el('p', { rect: { y: 0, h: 40 }, text: 'One' }),
      el('p', { rect: { y: 10, h: 40 }, text: 'Two' }),
    )),
    selectors: ['body>div>p'],
  }),
  'text-clipped': () => ({ capture: buildCapture(el('div', { text: 'long', style: { 'overflow-x': 'hidden' }, scroll: { sw: 500, cw: 300 } })), selectors: ['body>div'] }),
  'focus-not-visible': () => {
    const c = buildCapture(el('nav', {}, el('a', { attrs: { href: true }, text: 'Go' })));
    const a = c.elements[1];
    const styles = Object.fromEntries(['outline-style', 'outline-width', 'outline-color', 'box-shadow', 'text-decoration-line', 'background-color', 'border-top-color', 'color']
      .map((p) => [p, new CaptureView(c).style(a, p as StyleProp)]));
    return { capture: { ...c, focus: [{ key: a.key, rect: a.rect, styles }] }, selectors: ['body>nav>a'] };
  },
  'colour-off-palette': () => ({ capture: buildCapture(el('p', { text: 'x', style: { color: 'rgb(1, 2, 3)' } }), { palette: ['rgb(51, 51, 51)'] }), selectors: ['body>p'] }),
  'prose-leading-tight': () => ({ capture: buildCapture(el('p', { text: LONG, style: { 'line-height': '18px' } })), selectors: ['body>p'] }),
  'image-unsized': () => ({ capture: buildCapture(el('img')), selectors: ['body>img'] }),
};

describe('every rule fires on a planted defect and names the element it found', () => {
  it('has a planted defect for every rule, and none for a rule that no longer exists', () => {
    // A new rule with no planted case could ship never firing; a stale entry here would hide that the rule was removed.
    expect(Object.keys(PLANTED).sort()).toEqual(RULES.map((r) => r.id).sort());
  });

  it.each(RULES.map((r) => r.id))('%s', (id) => {
    const { capture, selectors, ctx } = PLANTED[id]();
    expect(hits(capture, id, ctx ?? NO_TABLES).map((f) => f.selector)).toEqual(selectors);
  });
});

describe('evaluate', () => {
  it('reports a truncated capture so a partial page is never judged clean', () => {
    // A page past the element cap would otherwise pass on the elements that happened to be recorded.
    expect(evaluate(buildCapture(el('div'), { truncated: true }), NO_TABLES).map((f) => f.rule)).toContain('capture-truncated');
  });

  it('refuses a capture written under another schema', () => {
    // Rules reading a capture with shifted fields would judge the wrong numbers silently.
    const stale = { ...buildCapture(el('div')), schema: 99 } as unknown as Capture;
    expect(() => new CaptureView(stale)).toThrow(/schema/);
  });
});
