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
  parseColor,
  tableNamesFromSchema,
  type Capture,
  type ElementRecord,
  type RuleId,
  type StyleProp,
} from '../e2e/helpers/renderedStyle';
import { buildCapture, el } from '../fixtures/renderedStyleCapture';

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

describe('prose-too-wide', () => {
  it('reports prose past the 55ch measure at desktop width only', () => {
    // A line far past the reading measure makes a reader lose their place on the return sweep.
    const para = (w: number, width = DESKTOP) => buildCapture(el('p', { text: LONG, chPx: 8, rect: { w } }), { width });
    expect(hits(para(600), 'prose-too-wide')).toHaveLength(1);
    expect(hits(para(440), 'prose-too-wide')).toEqual([]);
    expect(hits(para(600, PHONE), 'prose-too-wide')).toEqual([]);
  });
});

describe('grey text', () => {
  it('reports running prose in the muted grey', () => {
    // Grey body text is read less and trusted less; grey is reserved for metadata.
    const para = (color: string) => buildCapture(el('p', { text: LONG, style: { color } }));
    expect(hits(para('rgb(102, 102, 102)'), 'prose-muted')).toHaveLength(1);
    expect(hits(para('rgb(51, 51, 51)'), 'prose-muted')).toEqual([]);
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

  it('counts only compound table names as leaks', () => {
    // A one-word table such as "members" is ordinary English; treating it as a leak would flag every friendly sentence.
    expect([...ctx.tableNames]).toEqual(['member_tier_grants']);
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
