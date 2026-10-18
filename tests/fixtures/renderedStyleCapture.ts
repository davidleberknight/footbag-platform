/**
 * Builds synthetic rendered-style captures for unit tests of the rules and the
 * diff, so a rule is proven red and green without a browser. Every element
 * starts from the computed values an unstyled block of body text has on this
 * site (body colour #333 on white, 16px, weight 400, no borders), and a test
 * overrides only what its case is about.
 */
import {
  CAPTURE_SCHEMA, STYLE_PROPS,
  type Capture, type ElementRecord, type Rect, type StyleProp,
} from '../e2e/helpers/renderedStyle';

export interface NodeSpec {
  tag: string;
  cls?: string;
  rect?: Partial<Rect>;
  style?: Partial<Record<StyleProp, string>>;
  attrs?: ElementRecord['attrs'];
  text?: string;
  chPx?: number;
  scroll?: { sw: number; cw: number };
  visibleLabel?: boolean;
  children?: NodeSpec[];
}

const INLINE_TAGS = new Set(['a', 'span', 'strong', 'em', 'code', 'label']);

function defaults(tag: string): Record<StyleProp, string> {
  const base = Object.fromEntries(STYLE_PROPS.map((p) => [p, ''])) as Record<StyleProp, string>;
  return {
    ...base,
    display: INLINE_TAGS.has(tag) ? 'inline' : 'block',
    visibility: 'visible',
    opacity: '1',
    position: 'static',
    'overflow-x': 'visible',
    color: 'rgb(51, 51, 51)',
    'background-color': 'rgba(0, 0, 0, 0)',
    'background-image': 'none',
    'font-size': '16px',
    'font-weight': '400',
    'text-decoration-line': 'none',
    'border-top-width': '0px',
    'border-right-width': '0px',
    'border-bottom-width': '0px',
    'border-left-width': '0px',
    'border-top-style': 'none',
    'border-right-style': 'none',
    'border-bottom-style': 'none',
    'border-left-style': 'none',
    'clip-path': 'none',
  };
}

export function el(tag: string, opts: Omit<NodeSpec, 'tag' | 'children'> = {}, ...children: NodeSpec[]): NodeSpec {
  return { tag, ...opts, children };
}

export interface CaptureOptions {
  width?: number;
  height?: number;
  url?: string;
  template?: string | null;
  page?: Partial<Capture['page']>;
  tokens?: Record<string, string>;
  truncated?: boolean;
}

export function buildCapture(roots: NodeSpec | NodeSpec[], opts: CaptureOptions = {}): Capture {
  const width = opts.width ?? 1280;
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const intern = (s: string) => {
    let k = stringIndex.get(s);
    if (k === undefined) { k = strings.length; strings.push(s); stringIndex.set(s, k); }
    return k;
  };
  const elements: ElementRecord[] = [];

  const visit = (spec: NodeSpec, parent: ElementRecord | null, segment: string) => {
    const style = { ...defaults(spec.tag), ...spec.style };
    const text = (spec.text ?? '').replace(/\s+/g, ' ').trim();
    const rec: ElementRecord = {
      i: elements.length,
      parent: parent ? parent.i : null,
      key: `${parent ? parent.key : 'body'}>${segment}`,
      tag: spec.tag,
      cls: spec.cls ?? '',
      attrs: spec.attrs ?? {},
      rect: { x: 0, y: 0, w: 300, h: 20, ...spec.rect },
      ownText: text.slice(0, 200),
      textLen: text.length,
      styles: STYLE_PROPS.map((p) => intern(style[p])),
    };
    if (spec.scroll) rec.scroll = spec.scroll;
    if (spec.chPx !== undefined) rec.chPx = spec.chPx;
    if (spec.visibleLabel !== undefined) rec.visibleLabel = spec.visibleLabel;
    elements.push(rec);
    visitChildren(spec.children ?? [], rec);
  };

  const visitChildren = (specs: NodeSpec[], parent: ElementRecord | null) => {
    const seen = new Map<string, number>();
    for (const spec of specs) {
      const sig = [spec.tag, ...(spec.cls ?? '').split(/\s+/).filter(Boolean).sort()].join('.');
      const nth = (seen.get(sig) ?? 0) + 1;
      seen.set(sig, nth);
      visit(spec, parent, `${sig}:nth(${nth})`);
    }
  };

  visitChildren(Array.isArray(roots) ? roots : [roots], null);
  return {
    schema: CAPTURE_SCHEMA,
    url: opts.url ?? '/synthetic',
    template: opts.template === undefined ? 'synthetic/page' : opts.template,
    viewport: { width, height: opts.height ?? 800 },
    page: { scrollWidth: width, clientWidth: width, scrollHeight: 800, ...opts.page },
    tokens: opts.tokens ?? { '--text': '#333333', '--text-muted': '#666666', '--text-subtle': '#8a8a8a' },
    styleProps: [...STYLE_PROPS],
    strings,
    elements,
    truncated: opts.truncated ?? false,
  };
}
