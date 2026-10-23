/**
 * Rendered-style rules over a capture of a page as the browser drew it.
 *
 * The in-page script `renderedStyle.browser.js` records every element's box,
 * a fixed list of computed properties and a few page facts; nothing in this
 * file touches a browser, so every rule is a pure function over that record
 * and is unit-tested on synthetic captures. The same capture feeds three
 * callers: the rendered-style browser spec (check mode), the `npm run style`
 * CLI (check, judge, diff) and Claude sessions measuring a page through the
 * Playwright MCP browser. Rules exist only here, never in the page, so a
 * threshold has one home.
 *
 * Each rule names the design requirement it enforces in plain words. Numbers
 * come from the site standard: nothing below 0.9rem (14.4px at the 16px
 * root), a 55ch prose measure, a 24x24 minimum target, 4.5:1 text contrast
 * (3:1 for large text), phone fit at 390px, and a spacing rhythm of 4, 8, 12,
 * 16, 24 and 32px (24px at most on a phone).
 */

export const CAPTURE_SCHEMA = 1 as const;

/**
 * The computed properties every element records, in a fixed order. The
 * browser script carries its own copy because it cannot import this module;
 * a unit test runs the script and fails if the two lists differ.
 */
export const STYLE_PROPS = [
  'display',
  'visibility',
  'opacity',
  'position',
  'overflow-x',
  'color',
  'background-color',
  'background-image',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'text-decoration-line',
  'text-transform',
  'white-space',
  'overflow-wrap',
  'max-width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-left-color',
  'border-top-left-radius',
  'box-shadow',
  'flex-direction',
  'grid-template-columns',
  'row-gap',
  'column-gap',
  'list-style-type',
  'clip-path',
] as const;

export type StyleProp = (typeof STYLE_PROPS)[number];

/** Root custom properties resolved at capture time, used by the grey-text rules. */
export const DEFAULT_TOKENS = ['--text', '--text-muted', '--text-subtle', '--bg', '--primary-ink', '--secondary', '--border'] as const;

export interface Rect { x: number; y: number; w: number; h: number }

export interface ElementRecord {
  /** Index in document order; `parent` points at another record or is null for children of body. */
  i: number;
  parent: number | null;
  /** Stable identity across two captures: tag, sorted classes and nth among same-signature siblings, from body down. */
  key: string;
  tag: string;
  cls: string;
  attrs: {
    hidden?: true;
    /** A disclosure showing its content; a closed one still lays that content out off screen. */
    open?: true;
    ariaHidden?: true;
    disabled?: true;
    href?: true;
    role?: string;
    /** The aria-live politeness, lowercased; a live region announces messages. */
    live?: string;
    tabindex?: string;
    type?: string;
    /** True when aria-label or an aria-labelledby target supplies a non-empty name. */
    named?: true;
  };
  rect: Rect;
  /** Present only on an element whose content overflows it horizontally. */
  scroll?: { sw: number; cw: number };
  /** The element's own direct text, whitespace-collapsed, first 200 characters. */
  ownText: string;
  /** Length of the element's own direct text before truncation. */
  textLen: number;
  /** Form fields only: a label or aria-labelledby target that is painted and carries text. */
  visibleLabel?: boolean;
  /** Width in px of the digit zero in this element's font; recorded when its whole text, descendants included, is prose length. */
  chPx?: number;
  /** Indices into `Capture.strings`, aligned with `Capture.styleProps`. */
  styles: number[];
}

export interface Capture {
  schema: typeof CAPTURE_SCHEMA;
  url: string;
  /** The view that rendered the page, read from the development-only response header; null when unknown. */
  template: string | null;
  viewport: { width: number; height: number };
  page: { scrollWidth: number; clientWidth: number; scrollHeight: number };
  tokens: Record<string, string>;
  styleProps: string[];
  strings: string[];
  elements: ElementRecord[];
  truncated: boolean;
}

export type RuleId =
  | 'capture-truncated'
  | 'box-outside-viewport'
  | 'page-overflow'
  | 'scroll-box-unlabelled'
  | 'scroll-box-disallowed'
  | 'table-overflows-container'
  | 'table-columns-misaligned'
  | 'tap-target-small'
  | 'text-below-ramp'
  | 'heading-not-outranking'
  | 'prose-too-wide'
  | 'prose-muted'
  | 'text-subtle-used'
  | 'contrast-low'
  | 'link-no-cue-in-prose'
  | 'fieldset-bordered'
  | 'hidden-but-displayed'
  | 'field-without-visible-label'
  | 'empty-state-leaks-code'
  | 'spacing-off-rhythm'
  // Findings the browser check adds beside the rules: something the browser
  // refused or reported while the page loaded, a URL that rendered another view
  // than the one it was meant to measure, and an axe violation by rule id.
  | 'page-problem'
  | 'wrong-view'
  | `axe-${string}`;

export interface Finding {
  rule: RuleId;
  template: string | null;
  url: string;
  viewport: number;
  selector: string;
  measured: string;
}

export interface RuleContext {
  /** Database table names; a member-facing message naming one leaks internals. */
  tableNames: ReadonlySet<string>;
}

type Applies = 'phone' | 'desktop' | 'any';

export interface Rule {
  id: RuleId;
  applies: Applies;
  /** The design requirement the rule enforces, in plain words. */
  requirement: string;
  check(view: CaptureView, ctx: RuleContext): Array<{ el: ElementRecord | null; measured: string }>;
}

// ── Colour maths ──────────────────────────────────────────────────────────

export interface Rgba { r: number; g: number; b: number; a: number }

/**
 * Parses the colour forms a browser's computed style produces, plus hex, which
 * is how a root custom property reads back as authored; null for anything else.
 */
export function parseColor(value: string): Rgba | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    const h = hex[1].length <= 4 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    const byte = (k: number) => parseInt(h.slice(k, k + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? byte(6) / 255 : 1 };
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (!m) return null;
  let a = 1;
  if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a };
}

/** Source-over compositing of `top` onto an opaque or translucent `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an opaque colour. */
export function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio between two opaque colours, 1 to 21. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Normalises any parseable colour to one spelling so two captures compare equal. */
export function normalizeColor(value: string): string {
  const c = parseColor(value);
  if (!c) return value;
  const round = (n: number) => Math.round(n);
  return `rgba(${round(c.r)},${round(c.g)},${round(c.b)},${Math.round(c.a * 1000) / 1000})`;
}

// ── Capture view: tree navigation and style access ───────────────────────

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

export class CaptureView {
  readonly capture: Capture;
  private readonly propIndex: Map<string, number>;
  private readonly children: number[][];

  constructor(capture: Capture) {
    if (capture.schema !== CAPTURE_SCHEMA) {
      throw new Error(`capture schema ${String(capture.schema)} is not the schema this helper reads (${CAPTURE_SCHEMA})`);
    }
    this.capture = capture;
    this.propIndex = new Map(capture.styleProps.map((p, i) => [p, i]));
    this.children = capture.elements.map(() => []);
    for (const el of capture.elements) {
      if (el.parent !== null) this.children[el.parent].push(el.i);
    }
  }

  get elements(): ElementRecord[] { return this.capture.elements; }
  get width(): number { return this.capture.viewport.width; }

  style(el: ElementRecord, prop: StyleProp): string {
    const idx = this.propIndex.get(prop);
    if (idx === undefined) return '';
    const s = el.styles[idx];
    return s === undefined ? '' : this.capture.strings[s] ?? '';
  }

  px(el: ElementRecord, prop: StyleProp): number {
    const n = parseFloat(this.style(el, prop));
    return Number.isFinite(n) ? n : 0;
  }

  parentOf(el: ElementRecord): ElementRecord | null {
    return el.parent === null ? null : this.capture.elements[el.parent];
  }

  *ancestors(el: ElementRecord): Generator<ElementRecord> {
    let p = this.parentOf(el);
    while (p) { yield p; p = this.parentOf(p); }
  }

  childrenOf(el: ElementRecord): ElementRecord[] {
    return this.children[el.i].map((i) => this.capture.elements[i]);
  }

  *descendants(el: ElementRecord): Generator<ElementRecord> {
    for (const c of this.childrenOf(el)) { yield c; yield* this.descendants(c); }
  }

  hasClass(el: ElementRecord, name: string): boolean {
    return el.cls.split(/\s+/).includes(name);
  }

  /** Rendered and painted: not display none, not visibility hidden, with area, and not the 1px visually-hidden pattern. */
  isPainted(el: ElementRecord): boolean {
    if (this.style(el, 'display') === 'none') return false;
    if (this.style(el, 'visibility') !== 'visible') return false;
    if (el.rect.w <= 1 || el.rect.h <= 1) return false;
    const clip = this.style(el, 'clip-path');
    if (clip.startsWith('inset(50%') || clip.startsWith('inset(100%')) return false;
    // A closed disclosure still lays out what it hides; only its summary is drawn.
    let child = el;
    for (const a of this.ancestors(el)) {
      if (a.tag === 'details' && !a.attrs.open && child.tag !== 'summary') return false;
      child = a;
    }
    for (const a of this.ancestors(el)) {
      const d = this.style(a, 'display');
      if (d === 'none') return false;
      // A display:contents ancestor has no box of its own (the site's header
      // navigation is one), and a collapsed ancestor that does not clip still
      // paints its overflowing children; neither hides what is inside it.
      if (d === 'contents') continue;
      if (a.rect.w <= 1 && a.rect.h <= 1 && this.style(a, 'overflow-x') !== 'visible') return false;
    }
    return true;
  }

  /** The nearest ancestor that draws a box, looking through display:contents wrappers. */
  boxParentOf(el: ElementRecord): ElementRecord | null {
    for (const a of this.ancestors(el)) if (this.style(a, 'display') !== 'contents') return a;
    return null;
  }

  isScrollBox(el: ElementRecord): boolean {
    const ox = this.style(el, 'overflow-x');
    return (ox === 'auto' || ox === 'scroll') && !!el.scroll && el.scroll.sw > el.scroll.cw + 1;
  }

  within(el: ElementRecord, tag: string): boolean {
    for (const a of this.ancestors(el)) if (a.tag === tag) return true;
    return false;
  }

  /** The opaque colour behind an element's text, or null when a gradient or image sits in the chain. */
  backgroundBehind(el: ElementRecord): Rgba | null {
    const layers: Rgba[] = [];
    for (const node of [el, ...this.ancestors(el)]) {
      if (this.style(node, 'background-image') !== 'none' && this.style(node, 'background-image') !== '') return null;
      const bg = parseColor(this.style(node, 'background-color'));
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 1) break;
      }
    }
    let acc: Rgba = WHITE;
    for (let k = layers.length - 1; k >= 0; k--) acc = composite(layers[k], acc);
    return acc;
  }

  /** The element's text colour composited over what is behind it, with inherited opacity applied. */
  textColor(el: ElementRecord, bg: Rgba): Rgba | null {
    const fg = parseColor(this.style(el, 'color'));
    if (!fg) return null;
    let alpha = fg.a;
    for (const node of [el, ...this.ancestors(el)]) {
      const o = parseFloat(this.style(node, 'opacity'));
      if (Number.isFinite(o)) alpha *= o;
    }
    return composite({ ...fg, a: alpha }, bg);
  }

  findingSelector(el: ElementRecord): string {
    return el.key.replace(/:nth\(\d+\)/g, '');
  }
}

// ── Rules ─────────────────────────────────────────────────────────────────

const TEXT_FLOOR_PX = 14.35; // 0.9rem at the 16px root, less rounding slack
const TARGET_MIN_PX = 24;
const MEASURE_CH = 55.5;
const PROSE_MIN_CHARS = 120;
const PROSE_TAGS = new Set(['p', 'li', 'dd', 'blockquote']);
const FIELD_TAGS = new Set(['input', 'select', 'textarea']);
const UNLABELLED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
// Input types that draw no text of their own, so their font size shows nothing.
const TEXTLESS_INPUT_TYPES = new Set(['hidden', 'checkbox', 'radio', 'range', 'color', 'image']);
const MESSAGE_CLASSES = ['empty-state', 'form-notice', 'form-error-banner', 'form-success-banner', 'notice'];
// The standard's metadata treatments, which may stay grey at any length:
// source and provenance notes, citations, form hints and card bylines.
const METADATA_CLASSES = ['source-note', 'set-detail-citation', 'form-hint', 'card-meta'];

/** A scroll box the standard allows: keyboard-focusable, a region, and named. */
function isSanctionedScrollRegion(el: ElementRecord): boolean {
  return el.attrs.tabindex === '0' && el.attrs.role === 'region' && !!el.attrs.named;
}

/** Carries a message to the reader: a message class, or an alert, status or live region. */
function isMessage(v: CaptureView, el: ElementRecord): boolean {
  if (MESSAGE_CLASSES.some((c) => v.hasClass(el, c))) return true;
  if (el.attrs.role === 'alert' || el.attrs.role === 'status') return true;
  return !!el.attrs.live && el.attrs.live !== 'off';
}

function isInteractive(el: ElementRecord): boolean {
  if (el.tag === 'a') return !!el.attrs.href;
  if (el.tag === 'button' || el.tag === 'select' || el.tag === 'textarea' || el.tag === 'summary') return true;
  if (el.tag === 'input') return el.attrs.type !== 'hidden';
  if (el.attrs.role === 'button' || el.attrs.role === 'link') return true;
  return false;
}

/** A form control's value, options or label are text the reader sees, though the control has no text node of its own. */
function showsControlText(el: ElementRecord): boolean {
  if (el.tag === 'input') return !TEXTLESS_INPUT_TYPES.has(el.attrs.type ?? 'text');
  return el.tag === 'select' || el.tag === 'textarea' || el.tag === 'button';
}

/** Hidden from assistive technology as decoration, itself or through an ancestor. */
function ariaHidden(v: CaptureView, el: ElementRecord): boolean {
  return !!el.attrs.ariaHidden || [...v.ancestors(el)].some((a) => a.attrs.ariaHidden);
}

/** Faded fully out, itself or through an ancestor, so no reader sees it. */
function fullyTransparent(v: CaptureView, el: ElementRecord): boolean {
  return [el, ...v.ancestors(el)].some((n) => v.style(n, 'opacity') === '0');
}

/**
 * A field named by aria-label in a search form that carries its own submit
 * button: the button labels the field beside it, the accepted pattern for a
 * search box.
 */
function namedSearchField(v: CaptureView, el: ElementRecord): boolean {
  if (!el.attrs.named) return false;
  const form = [...v.ancestors(el)].find((a) => a.tag === 'form');
  if (!form || form.attrs.role !== 'search') return false;
  return [...v.descendants(form)].some((d) =>
    (d.tag === 'button' && (d.attrs.type ?? 'submit') === 'submit') || (d.tag === 'input' && d.attrs.type === 'submit'));
}

function largeText(v: CaptureView, el: ElementRecord): boolean {
  const size = v.px(el, 'font-size');
  const weight = parseInt(v.style(el, 'font-weight'), 10) || 400;
  return size >= 24 || (size >= 18.66 && weight >= 700);
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function centre(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** The 24px circle centred on `small` reaches into `other`'s box. */
function circleTouches(small: Rect, other: Rect): boolean {
  const c = centre(small);
  const dx = c.x - Math.max(other.x, Math.min(c.x, other.x + other.w));
  const dy = c.y - Math.max(other.y, Math.min(c.y, other.y + other.h));
  return dx * dx + dy * dy < (TARGET_MIN_PX / 2) ** 2;
}

/** The 24px circles centred on two small controls overlap. */
function circlesOverlap(a: Rect, b: Rect): boolean {
  const ca = centre(a);
  const cb = centre(b);
  return (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2 < TARGET_MIN_PX ** 2;
}

/** An inline element whose block carries words of its own, so it is set in a line of running text rather than standing alone. */
function inSentence(v: CaptureView, el: ElementRecord): boolean {
  const block = [...v.ancestors(el)].find((a) => v.style(a, 'display') !== 'inline');
  return !!block && block.textLen > 0;
}

// Notation and literal text, read symbol by symbol rather than as sentences.
const LITERAL_TAGS = new Set(['code', 'kbd', 'samp']);

/** The text of an element and of the inline words set in its lines, such as links and emphasis; literal text does not count. */
function flowTextLen(v: CaptureView, el: ElementRecord): number {
  let n = el.textLen;
  for (const c of v.childrenOf(el)) {
    if (v.style(c, 'display') === 'inline' && !LITERAL_TAGS.has(c.tag)) n += flowTextLen(v, c);
  }
  return n;
}

function overflowCulprits(v: CaptureView): ElementRecord[] {
  const out: ElementRecord[] = [];
  const width = v.width;
  for (const el of v.elements) {
    if (!v.isPainted(el)) continue;
    const right = el.rect.x + el.rect.w;
    if (right <= 0) continue; // parked off the left edge on purpose, such as the skip link at rest
    if (right <= width + 1 && el.rect.x >= -1) continue;
    // Only a scroll container inside the screen excuses content past the edge,
    // because a reader can scroll to it there. A clipping ancestor does not:
    // what it cuts off is unreachable, which is the defect itself.
    let excused = false;
    for (const a of v.ancestors(el)) {
      if (a.tag === 'body' || a.tag === 'html') break;
      const ox = v.style(a, 'overflow-x');
      if (ox === 'auto' || ox === 'scroll') {
        const aRight = a.rect.x + a.rect.w;
        if (aRight <= width + 1 && a.rect.x >= -1) { excused = true; break; }
      }
    }
    if (!excused) out.push(el);
  }
  const reported = new Set(out.map((e) => e.i));
  return out.filter((el) => {
    for (const d of v.descendants(el)) if (reported.has(d.i)) return false;
    return true;
  });
}

// The spacing steps a gap may land on; a phone drops the widest. The slack
// absorbs a 1px border correction and sub-pixel rounding.
const SPACING_STEPS = [4, 8, 12, 16, 24, 32];
const PHONE_SPACING_MAX = 24;
const SPACING_SLACK_PX = 1.5;
// Elements that draw something with no text node of their own.
const DRAWN_TAGS = new Set(['img', 'svg', 'video', 'iframe', 'canvas', 'hr', 'table', 'input', 'select', 'textarea', 'button', 'progress', 'meter']);
const OUT_OF_FLOW = new Set(['absolute', 'fixed']);

/** Draws its own box: a fill, a border, or a shadow. */
function paintsBox(v: CaptureView, el: ElementRecord): boolean {
  const bg = parseColor(v.style(el, 'background-color'));
  if (bg && bg.a > 0) return true;
  const image = v.style(el, 'background-image');
  if (image !== '' && image !== 'none') return true;
  const shadow = v.style(el, 'box-shadow');
  if (shadow !== '' && shadow !== 'none') return true;
  return (['top', 'right', 'bottom', 'left'] as const)
    .some((s) => v.px(el, `border-${s}-width`) > 0 && !['none', 'hidden'].includes(v.style(el, `border-${s}-style`)));
}

/** Draws a closed box around what it holds: a fill, a shadow or a border on every side, not a lone divider line. */
function encloses(v: CaptureView, el: ElementRecord): boolean {
  const bg = parseColor(v.style(el, 'background-color'));
  if (bg && bg.a > 0) return true;
  const image = v.style(el, 'background-image');
  if (image !== '' && image !== 'none') return true;
  const shadow = v.style(el, 'box-shadow');
  if (shadow !== '' && shadow !== 'none') return true;
  return (['top', 'right', 'bottom', 'left'] as const)
    .every((s) => v.px(el, `border-${s}-width`) > 0 && !['none', 'hidden'].includes(v.style(el, `border-${s}-style`)));
}

/** Children in flow, looking through wrappers that draw no box of their own. */
function flowChildren(v: CaptureView, el: ElementRecord): ElementRecord[] {
  const out: ElementRecord[] = [];
  for (const c of v.childrenOf(el)) {
    if (v.style(c, 'display') === 'contents') out.push(...flowChildren(v, c));
    else if (!OUT_OF_FLOW.has(v.style(c, 'position'))) out.push(c);
  }
  return out;
}

/**
 * A block that sets text in lines, such as a heading wrapping a link: the line
 * height spaces what is inside it, so its lines are what the reader sees, not
 * the tighter boxes of the words.
 */
function holdsLines(v: CaptureView, el: ElementRecord): boolean {
  if (v.style(el, 'display').startsWith('inline')) return false;
  const kids = flowChildren(v, el).filter((c) => v.isPainted(c));
  return kids.some((c) => v.style(c, 'display') === 'inline')
    || (kids.length > 0 && kids.every((c) => v.style(c, 'display').startsWith('inline')));
}

/** The box inside the padding: where the lines of an unboxed text block start and end. */
function contentBox(v: CaptureView, el: ElementRecord): Rect {
  const top = v.px(el, 'padding-top') + v.px(el, 'border-top-width');
  const bottom = v.px(el, 'padding-bottom') + v.px(el, 'border-bottom-width');
  return { x: el.rect.x, y: el.rect.y + top, w: el.rect.w, h: Math.max(0, el.rect.h - top - bottom) };
}

/** The lower box has no top edge of its own and hangs from the edge the upper one draws: one control in two parts. */
function joined(v: CaptureView, upper: ElementRecord, lower: ElementRecord): boolean {
  const edge = (el: ElementRecord, side: 'top' | 'bottom') =>
    v.px(el, `border-${side}-width`) > 0 && !['none', 'hidden'].includes(v.style(el, `border-${side}-style`));
  const hung = (el: ElementRecord): boolean => {
    if (edge(el, 'top')) return false;
    if (paintsBox(v, el)) return true;
    const first = flowChildren(v, el).find((c) => v.isPainted(c));
    return !!first && hung(first);
  };
  return edge(upper, 'bottom') && hung(lower);
}

/** Lays its children out in a row that wraps, or in several grid columns, so one item stacked over another is a new row, not a gap. */
function laysOutRows(v: CaptureView, el: ElementRecord): boolean {
  const display = v.style(el, 'display');
  if (/flex$/.test(display)) return !v.style(el, 'flex-direction').startsWith('column');
  if (/grid$/.test(display)) return v.style(el, 'grid-template-columns').trim().split(/\s+(?![^(]*\))/).length > 1;
  return false;
}

/**
 * What a reader sees of an element: its own box where it draws one, otherwise
 * the union of what its children draw, so an invisible wrapper's padding or an
 * empty div never counts as space. Null when nothing is drawn.
 */
function inkOf(v: CaptureView, el: ElementRecord, memo: Map<number, Rect | null>): Rect | null {
  const known = memo.get(el.i);
  if (known !== undefined) return known;
  let ink: Rect | null = null;
  if (v.isPainted(el) || v.style(el, 'display') === 'contents') {
    if (DRAWN_TAGS.has(el.tag) || paintsBox(v, el)) ink = el.rect;
    // Lines of text, plus any control or image set in them, which can hang
    // past the line box, as a checkbox does below its label.
    else if (el.textLen > 0 || holdsLines(v, el)) {
      ink = unionOf([contentBox(v, el), ...[...v.descendants(el)].filter((d) => DRAWN_TAGS.has(d.tag) && v.isPainted(d)).map((d) => d.rect)]);
    }
    // A row of items, such as a bar of links, spans its items' own boxes,
    // padding included; the text inside each one does not mark the row's edges.
    else if (laysOutRows(v, el)) ink = unionOf(flowChildren(v, el).filter((c) => v.isPainted(c)).map((c) => c.rect));
    else ink = unionOf(flowChildren(v, el).map((c) => inkOf(v, c, memo)));
  }
  memo.set(el.i, ink);
  return ink;
}

/** The smallest box holding every given box; null when there are none. */
function unionOf(rects: Array<Rect | null>): Rect | null {
  let out: Rect | null = null;
  for (const r of rects) {
    if (!r) continue;
    if (!out) { out = r; continue; }
    const x = Math.min(out.x, r.x);
    const y = Math.min(out.y, r.y);
    out = { x, y, w: Math.max(out.x + out.w, r.x + r.w) - x, h: Math.max(out.y + out.h, r.y + r.h) - y };
  }
  return out;
}

function offRhythm(gap: number, width: number): boolean {
  const steps = width <= 480 ? SPACING_STEPS.filter((s) => s <= PHONE_SPACING_MAX) : SPACING_STEPS;
  return !steps.some((s) => Math.abs(gap - s) <= SPACING_SLACK_PX);
}

function bodyProseSize(v: CaptureView): number {
  const counts = new Map<number, number>();
  for (const el of v.elements) {
    if (el.tag !== 'p' || el.textLen < 40 || !v.isPainted(el)) continue;
    const s = v.px(el, 'font-size');
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best = 16;
  let bestCount = 0;
  for (const [size, n] of counts) if (n > bestCount) { best = size; bestCount = n; }
  return best;
}

export const RULES: readonly Rule[] = [
  {
    id: 'box-outside-viewport',
    applies: 'any',
    requirement: 'Content fits the screen without a sideways scroll; an element past the edge is clipped or unreachable.',
    check(v) {
      return overflowCulprits(v).map((el) => ({
        el,
        measured: `right edge ${fmt(el.rect.x + el.rect.w)}px past a ${v.width}px viewport`,
      }));
    },
  },
  {
    id: 'page-overflow',
    applies: 'phone',
    requirement: 'The page body never scrolls sideways on a phone.',
    check(v) {
      const { scrollWidth, clientWidth } = v.capture.page;
      if (scrollWidth <= clientWidth + 1) return [];
      const culprits = overflowCulprits(v).slice(0, 3).map((e) => v.findingSelector(e));
      return [{ el: null, measured: `document ${scrollWidth}px wide in ${clientWidth}px${culprits.length ? `; culprits: ${culprits.join(' | ')}` : ''}` }];
    },
  },
  {
    id: 'scroll-box-unlabelled',
    applies: 'phone',
    requirement: 'A horizontally scrolling box is keyboard-focusable, a region, and has an accessible name.',
    check(v) {
      return v.elements
        .filter((el) => v.isPainted(el) && v.isScrollBox(el))
        .filter((el) => !isSanctionedScrollRegion(el))
        .map((el) => ({ el, measured: `tabindex=${el.attrs.tabindex ?? 'none'} role=${el.attrs.role ?? 'none'} named=${el.attrs.named ? 'yes' : 'no'}` }));
    },
  },
  {
    id: 'scroll-box-disallowed',
    applies: 'phone',
    requirement: 'Only wide tables and fixed-width preformatted text scroll inside a box.',
    check(v) {
      return v.elements
        .filter((el) => v.isPainted(el) && v.isScrollBox(el))
        // A table or text area that scrolls itself, and preformatted text in
        // any element, are the treatments the standard allows.
        .filter((el) => !['pre', 'table', 'textarea'].includes(el.tag) && !v.style(el, 'white-space').startsWith('pre'))
        .filter((el) => {
          for (const d of v.descendants(el)) if (d.tag === 'table' || d.tag === 'pre') return false;
          return true;
        })
        .map((el) => ({ el, measured: `content ${el.scroll?.sw}px in a ${el.scroll?.cw}px box` }));
    },
  },
  {
    id: 'table-overflows-container',
    applies: 'desktop',
    requirement: 'A table fits its column at desktop width, unless it scrolls inside the standard\'s labelled table wrapper.',
    check(v) {
      const out: Array<{ el: ElementRecord; measured: string }> = [];
      for (const el of v.elements) {
        if (el.tag !== 'table' || !v.isPainted(el)) continue;
        // A wide admin table may scroll inside the one wrapper the standard
        // names, provided a keyboard reader can reach and name it.
        const wrap = [...v.ancestors(el)].find((a) => v.hasClass(a, 'records-table-wrap'));
        if (wrap && isSanctionedScrollRegion(wrap)) continue;
        const container = v.boxParentOf(el);
        if (!container) continue;
        const room = container.rect.w;
        if (el.rect.w > room + 1) out.push({ el, measured: `table ${fmt(el.rect.w)}px in a ${fmt(room)}px container` });
      }
      return out;
    },
  },
  {
    id: 'table-columns-misaligned',
    applies: 'any',
    requirement: 'A table\'s header row spans the same columns as its data rows, so every header sits over its own data.',
    check(v) {
      // Hiding a header cell without its data cells (or the reverse) leaves one
      // row a column short, and the table pads the short row at its trailing
      // edge. Comparing the outer edges of the two rows' painted cells catches
      // it whatever the column count, and a header spanning columns still
      // covers the same edges.
      const cellsOf = (row: ElementRecord) =>
        v.childrenOf(row).filter((c) => (c.tag === 'th' || c.tag === 'td') && v.isPainted(c));
      const edges = (cells: ElementRecord[]) => ({
        left: Math.min(...cells.map((c) => c.rect.x)),
        right: Math.max(...cells.map((c) => c.rect.x + c.rect.w)),
      });
      const out: Array<{ el: ElementRecord; measured: string }> = [];
      for (const table of v.elements) {
        if (table.tag !== 'table' || !v.isPainted(table)) continue;
        const sections = v.childrenOf(table);
        const paintedRows = (tag: string) =>
          sections.filter((s) => s.tag === tag).flatMap((s) => v.childrenOf(s))
            .filter((r) => r.tag === 'tr' && v.isPainted(r) && cellsOf(r).length > 0);
        const headRow = paintedRows('thead').at(-1);
        const bodyRow = paintedRows('tbody')[0];
        if (!headRow || !bodyRow) continue;
        const head = edges(cellsOf(headRow));
        const body = edges(cellsOf(bodyRow));
        if (Math.abs(head.left - body.left) > 1 || Math.abs(head.right - body.right) > 1) {
          out.push({ el: table, measured: `header cells span ${fmt(head.left)}-${fmt(head.right)}px, data cells ${fmt(body.left)}-${fmt(body.right)}px` });
        }
      }
      return out;
    },
  },
  {
    id: 'tap-target-small',
    applies: 'phone',
    requirement: 'A control is at least 24 by 24 CSS pixels, or has 24px of clear space; inline links in a sentence are exempt.',
    check(v) {
      const targets = v.elements.filter((el) => isInteractive(el) && v.isPainted(el));
      const small = (el: ElementRecord) => el.rect.w < TARGET_MIN_PX || el.rect.h < TARGET_MIN_PX;
      const out: Array<{ el: ElementRecord; measured: string }> = [];
      for (const el of targets) {
        if (el.tag === 'a' && v.style(el, 'display') === 'inline' && inSentence(v, el)) continue;
        if (el.tag === 'input' && (el.attrs.type === 'checkbox' || el.attrs.type === 'radio') && el.visibleLabel) continue;
        if (!small(el)) continue;
        // WCAG's spacing exception: a 24px circle on the small control's centre
        // touches no other control and no other small control's circle.
        const crowded = targets.some((o) => o !== el
          && (circleTouches(el.rect, o.rect) || (small(o) && circlesOverlap(el.rect, o.rect)))
          && !isAncestorOf(v, o, el) && !isAncestorOf(v, el, o));
        if (!crowded) continue;
        out.push({ el, measured: `${fmt(el.rect.w)}x${fmt(el.rect.h)}px` });
      }
      return out;
    },
  },
  {
    id: 'text-below-ramp',
    applies: 'any',
    requirement: 'No text renders below 0.9rem.',
    check(v) {
      return v.elements
        .filter((el) => (el.textLen > 0 || showsControlText(el)) && v.isPainted(el) && v.px(el, 'font-size') < TEXT_FLOOR_PX)
        .map((el) => ({ el, measured: `${fmt(v.px(el, 'font-size'))}px` }));
    },
  },
  {
    id: 'heading-not-outranking',
    applies: 'any',
    requirement: 'A section heading is larger than the body text beneath it.',
    check(v) {
      const body = bodyProseSize(v);
      const out: Array<{ el: ElementRecord; measured: string }> = [];
      for (const el of v.elements) {
        if (!/^h[1-3]$/.test(el.tag) || !v.within(el, 'main') || !v.isPainted(el)) continue;
        const size = v.px(el, 'font-size');
        if (size <= body) out.push({ el, measured: `${el.tag} ${fmt(size)}px against ${fmt(body)}px body text` });
      }
      return out;
    },
  },
  {
    id: 'prose-too-wide',
    applies: 'desktop',
    requirement: 'Running prose is capped at the 55ch reading measure.',
    check(v) {
      // The line runs inside the padding and border, so that is the width a reader's eye travels.
      const lineWidth = (el: ElementRecord) => el.rect.w
        - v.px(el, 'padding-left') - v.px(el, 'padding-right')
        - v.px(el, 'border-left-width') - v.px(el, 'border-right-width');
      return v.elements
        .filter((el) => PROSE_TAGS.has(el.tag) && !!el.chPx && v.isPainted(el) && flowTextLen(v, el) >= PROSE_MIN_CHARS)
        .filter((el) => !v.within(el, 'table') && !v.within(el, 'pre'))
        .filter((el) => lineWidth(el) > MEASURE_CH * (el.chPx as number) + 1)
        .map((el) => ({ el, measured: `${fmt(lineWidth(el) / (el.chPx as number))}ch` }));
    },
  },
  {
    id: 'prose-muted',
    applies: 'any',
    requirement: 'Grey is for metadata only; running prose takes the body colour.',
    check(v) {
      const muted = [v.capture.tokens['--text-muted'], v.capture.tokens['--text-subtle']]
        .filter((t): t is string => !!t)
        .map(normalizeColor);
      if (muted.length === 0) return [];
      return v.elements
        .filter((el) => PROSE_TAGS.has(el.tag) && el.textLen >= 80 && v.isPainted(el) && !v.within(el, 'figcaption'))
        .filter((el) => !METADATA_CLASSES.some((c) => v.hasClass(el, c)))
        .filter((el) => muted.includes(normalizeColor(v.style(el, 'color'))))
        .map((el) => ({ el, measured: `${el.textLen} characters in ${normalizeColor(v.style(el, 'color'))}` }));
    },
  },
  {
    id: 'text-subtle-used',
    applies: 'any',
    requirement: 'The subtle grey colours borders and icons only, never text.',
    check(v) {
      const subtle = v.capture.tokens['--text-subtle'];
      if (!subtle) return [];
      const target = normalizeColor(subtle);
      return v.elements
        .filter((el) => el.textLen > 0 && v.isPainted(el) && normalizeColor(v.style(el, 'color')) === target)
        .map((el) => ({ el, measured: target }));
    },
  },
  {
    id: 'contrast-low',
    applies: 'any',
    requirement: 'Text meets 4.5:1 contrast against what is behind it (3:1 for large text).',
    check(v) {
      const out: Array<{ el: ElementRecord; measured: string }> = [];
      for (const el of v.elements) {
        if (el.textLen === 0 || !v.isPainted(el)) continue;
        if (el.attrs.disabled || [...v.ancestors(el)].some((a) => a.attrs.disabled)) continue;
        if (ariaHidden(v, el) || fullyTransparent(v, el)) continue;
        const bg = v.backgroundBehind(el);
        if (!bg) continue; // a gradient or image sits behind the text; not judged here
        const fg = v.textColor(el, bg);
        if (!fg) continue;
        const ratio = contrastRatio(fg, bg);
        const need = largeText(v, el) ? 3 : 4.5;
        if (ratio < need) out.push({ el, measured: `${fmt(ratio)}:1 (needs ${need}:1)` });
      }
      return out;
    },
  },
  {
    id: 'link-no-cue-in-prose',
    applies: 'any',
    requirement: 'A link inside a paragraph carries a cue besides colour: an underline, a border, or 3:1 contrast with the text around it.',
    check(v) {
      const out: Array<{ el: ElementRecord; measured: string }> = [];
      for (const el of v.elements) {
        if (el.tag !== 'a' || !el.attrs.href || !v.isPainted(el) || v.hasClass(el, 'btn')) continue;
        // An image-only link has no text for an underline to mark.
        if (el.textLen === 0 && ![...v.descendants(el)].some((d) => d.textLen > 0)) continue;
        const block = [...v.ancestors(el)].find((a) => v.style(a, 'display') !== 'inline');
        if (!block || (block.tag !== 'p' && block.tag !== 'blockquote')) continue;
        if (v.style(el, 'text-decoration-line').includes('underline')) continue;
        if (v.px(el, 'border-bottom-width') > 0 && v.style(el, 'border-bottom-style') !== 'none') continue;
        const bg = v.backgroundBehind(block) ?? WHITE;
        const linkC = v.textColor(el, bg);
        const textC = v.textColor(block, bg);
        const ratio = linkC && textC ? contrastRatio(linkC, textC) : 0;
        if (ratio >= 3) continue;
        out.push({ el, measured: `no underline; ${fmt(ratio)}:1 against surrounding text` });
      }
      return out;
    },
  },
  {
    id: 'fieldset-bordered',
    applies: 'any',
    requirement: 'A fieldset groups fields without the browser\'s default border.',
    check(v) {
      const sides = ['top', 'right', 'bottom', 'left'] as const;
      return v.elements
        .filter((el) => el.tag === 'fieldset' && v.isPainted(el))
        .filter((el) => sides.some((s) => v.px(el, `border-${s}-width`) > 0 && !['none', 'hidden'].includes(v.style(el, `border-${s}-style`))))
        .map((el) => ({ el, measured: `border ${v.style(el, 'border-top-width')} ${v.style(el, 'border-top-style')}` }));
    },
  },
  {
    id: 'hidden-but-displayed',
    applies: 'any',
    requirement: 'An element marked hidden is not drawn; no stylesheet rule outranks the attribute.',
    check(v) {
      return v.elements
        .filter((el) => el.attrs.hidden && v.style(el, 'display') !== 'none' && el.rect.w > 0 && el.rect.h > 0)
        .map((el) => ({ el, measured: `display ${v.style(el, 'display')}, ${fmt(el.rect.w)}x${fmt(el.rect.h)}px` }));
    },
  },
  {
    id: 'field-without-visible-label',
    applies: 'any',
    requirement: 'Every form field has a visible label; a placeholder or aria-label alone is not one, except on a search box beside its submit button.',
    check(v) {
      return v.elements
        .filter((el) => FIELD_TAGS.has(el.tag) && !(el.tag === 'input' && UNLABELLED_INPUT_TYPES.has(el.attrs.type ?? 'text')))
        .filter((el) => v.isPainted(el) && el.visibleLabel !== true && !namedSearchField(v, el))
        .map((el) => ({ el, measured: `${el.tag}${el.attrs.type ? `[type=${el.attrs.type}]` : ''} with no visible label` }));
    },
  },
  {
    id: 'empty-state-leaks-code',
    applies: 'any',
    requirement: 'An empty state or message reads as a plain sentence and never names a database table.',
    check(v, ctx) {
      const out: Array<{ el: ElementRecord; measured: string }> = [];
      for (const el of v.elements) {
        if (!isMessage(v, el) || !v.isPainted(el)) continue;
        const parts = [el.ownText];
        for (const d of v.descendants(el)) if (!['code', 'kbd', 'pre'].includes(d.tag)) parts.push(d.ownText);
        const words = parts.join(' ').match(/[a-z][a-z0-9_]*/g) ?? [];
        const leaked = words.find((w) => ctx.tableNames.has(w));
        if (leaked) out.push({ el, measured: `names table ${leaked}` });
      }
      return out;
    },
  },
  {
    id: 'spacing-off-rhythm',
    applies: 'any',
    requirement: 'Every gap between two stacked blocks, and the space inside a drawn box, is a spacing step (4, 8, 12, 16, 24 or 32px; 24px at most on a phone): never zero, never larger, never in between.',
    check(v) {
      const memo = new Map<number, Rect | null>();
      const out: Array<{ el: ElementRecord; measured: string }> = [];
      for (const box of v.elements) {
        if (!v.isPainted(box) || box.tag === 'head') continue;
        if (['table', 'pre', 'svg', 'select', 'button'].some((t) => box.tag === t || v.within(box, t))) continue;
        if (v.style(box, 'display').startsWith('inline') || holdsLines(v, box)) continue;
        // A word or link inside a run of text sits on a line, which the line
        // height spaces; only boxes that start a line of their own are blocks.
        const kids = flowChildren(v, box)
          .filter((c) => v.style(c, 'display') !== 'inline')
          .map((c) => ({ c, ink: inkOf(v, c, memo) }))
          .filter((k): k is { c: ElementRecord; ink: Rect } => k.ink !== null);
        const rows = laysOutRows(v, box);
        // A column stretched to its row's height, such as a card in a grid,
        // pins its last item to the bottom so actions line up across the row;
        // the gap above that item then grows with the tallest neighbour.
        const parent = v.boxParentOf(box);
        const stretched = v.style(box, 'display') === 'flex' && v.style(box, 'flex-direction') === 'column'
          && !!parent && /^(grid|flex)$/.test(v.style(parent, 'display'));
        for (let k = 1; k < kids.length && !rows; k++) {
          const a = kids[k - 1].ink;
          const b = kids[k].ink;
          const stacked = b.y >= a.y + a.h - 0.5 && b.x < a.x + a.w && a.x < b.x + b.w;
          if (!stacked) continue;
          const gap = b.y - (a.y + a.h);
          if (stretched && k === kids.length - 1 && gap >= SPACING_STEPS[0] - SPACING_SLACK_PX) continue;
          // A box drawn without a top edge, hung from the one above it, is the
          // second half of one joined control, such as a tab panel under its tabs.
          if (Math.abs(gap) <= SPACING_SLACK_PX && joined(v, kids[k - 1].c, kids[k].c)) continue;
          if (offRhythm(gap, v.width)) out.push({ el: kids[k].c, measured: `${fmt(gap)}px below ${v.findingSelector(kids[k - 1].c).split('>').pop()}` });
        }
        // Space inside a drawn box, from its edge to what it holds.
        if (kids.length === 0 || box.textLen > 0 || DRAWN_TAGS.has(box.tag) || !encloses(v, box)) continue;
        const first = kids.reduce((m, k) => (k.ink.y < m.ink.y ? k : m));
        const last = kids.reduce((m, k) => (k.ink.y + k.ink.h > m.ink.y + m.ink.h ? k : m));
        const top = first.ink.y - box.rect.y - v.px(box, 'border-top-width');
        const bottom = box.rect.y + box.rect.h - v.px(box, 'border-bottom-width') - (last.ink.y + last.ink.h);
        // An image, video or filled panel running to the box's edge is a full
        // bleed, and content past the edge is clipped or scrolled; neither is spacing.
        const judged = (inset: number, edge: ElementRecord) =>
          inset >= -0.5 && !(inset <= SPACING_SLACK_PX && (DRAWN_TAGS.has(edge.tag) || encloses(v, edge)));
        if (judged(top, first.c) && offRhythm(top, v.width)) out.push({ el: box, measured: `${fmt(top)}px inside the top edge` });
        // A box in a row or grid stretches to its tallest neighbour, so only
        // its top inset is set by spacing; below its content it can only be
        // judged for touching the edge.
        const inRow = !!parent && laysOutRows(v, parent);
        const bottomOff = inRow ? bottom < SPACING_STEPS[0] - SPACING_SLACK_PX : offRhythm(bottom, v.width);
        if (judged(bottom, last.c) && bottomOff) out.push({ el: box, measured: `${fmt(bottom)}px inside the bottom edge` });
      }
      return out;
    },
  },
];

function isAncestorOf(v: CaptureView, maybeAncestor: ElementRecord, el: ElementRecord): boolean {
  for (const a of v.ancestors(el)) if (a === maybeAncestor) return true;
  return false;
}

function appliesAt(applies: Applies, width: number): boolean {
  if (applies === 'any') return true;
  if (applies === 'phone') return width <= 480;
  return width >= 1024;
}

/** Runs every rule that applies at the capture's width and returns its findings. */
export function evaluate(capture: Capture, ctx: RuleContext, only?: ReadonlySet<RuleId>): Finding[] {
  const v = new CaptureView(capture);
  const base = { template: capture.template, url: capture.url, viewport: capture.viewport.width };
  const findings: Finding[] = [];
  if (capture.truncated) {
    findings.push({ ...base, rule: 'capture-truncated', selector: 'body', measured: `${capture.elements.length} elements recorded before the cap` });
  }
  for (const rule of RULES) {
    if (only && !only.has(rule.id)) continue;
    if (!appliesAt(rule.applies, capture.viewport.width)) continue;
    for (const hit of rule.check(v, ctx)) {
      findings.push({ ...base, rule: rule.id, selector: hit.el ? v.findingSelector(hit.el) : 'document', measured: hit.measured });
    }
  }
  return findings;
}

/** Reads the table names a member-facing message must never show, from the schema text. */
export function tableNamesFromSchema(schemaSql: string): Set<string> {
  const names = new Set<string>();
  for (const m of schemaSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-z][a-z0-9_]*)["`]?/gi)) {
    // A single English word ("members", "events") reads as prose; only a compound name is a leak.
    if (m[1].includes('_')) names.add(m[1].toLowerCase());
  }
  return names;
}

export function formatFinding(f: Finding): string {
  return `${f.template ?? f.url} @${f.viewport} ${f.rule} ${f.selector}: ${f.measured}`;
}
