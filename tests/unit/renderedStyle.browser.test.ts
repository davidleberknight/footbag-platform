/**
 * The in-page capture script records what the Node rules read, in the shape
 * they read it. It cannot import the rules module, so it carries its own copy
 * of the property list; a copy that drifted would shift every style value one
 * column and every rule would judge the wrong property without failing. Its
 * element keys must match the ones the synthetic captures use, or a diff
 * between a real capture and the rules' expectations would match nothing.
 *
 * happy-dom does no layout, so boxes, overflow and label visibility are proven
 * on planted pages in the browser; this file covers what layout does not decide.
 */
// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CAPTURE_SCHEMA, CaptureView, STYLE_PROPS, textHash, type Capture } from '../e2e/helpers/renderedStyle';
import { signatureOf } from '../fixtures/renderedStyleCapture';

const SCRIPT_SRC = fs.readFileSync(path.resolve(__dirname, '../e2e/helpers/renderedStyle.browser.js'), 'utf8');

type Measure = (opts?: { cap?: number; template?: string; tokens?: string[] }) => Promise<Capture>;
const measure = (opts?: Parameters<Measure>[0]) => (globalThis as unknown as { __footbagMeasure: Measure }).__footbagMeasure(opts);

beforeAll(() => {
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT_SRC)();
});

describe('renderedStyle.browser.js', () => {
  it('records the same property list, in the same order, as the rules read', async () => {
    // A drifted list would hand every rule the wrong property's value without any error.
    document.body.innerHTML = '<p>x</p>';
    const cap = await measure();
    expect(cap.styleProps).toEqual([...STYLE_PROPS]);
    expect(cap.schema).toBe(CAPTURE_SCHEMA);
    expect(() => new CaptureView(cap)).not.toThrow();
  });

  it('keys elements by tag, sorted classes, a hash of their own text and position among look-alikes, from body down', async () => {
    // Keys that changed with class order, or with a sibling of a different kind, would make every diff report the whole
    // page as replaced. Keys that differ from the synthetic captures' would make every rule test judge a shape no page has.
    document.body.innerHTML =
      '<main><div class="b a">1</div><div class="a b">1</div><div>3</div><script>1</script><svg><g></g></svg></main>';
    const cap = await measure();
    const div = (cls: string, text: string, nth: number) => `body>main:nth(1)>${signatureOf({ tag: 'div', cls, text })}:nth(${nth})`;
    expect(cap.elements.map((e) => e.key)).toEqual([
      'body>main:nth(1)',
      div('a b', '1', 1),
      div('a b', '1', 2),
      div('', '3', 1),
      'body>main:nth(1)>svg:nth(1)',
    ]);
    expect(cap.elements[1].key).toContain(`~${textHash('1')}`);
    expect(cap.elements[1].parent).toBe(0);
  });

  it('keeps an element\'s key when a sibling with other text is inserted before it, or a state class is toggled', async () => {
    // A positional key would report every row after an inserted one as changed, burying the one real difference in a diff.
    const keyOf = (cap: Capture, text: string) => cap.elements.find((e) => e.ownText === text)?.key;
    document.body.innerHTML = '<ul><li>Beta</li><li class="is-open">Gamma</li></ul>';
    const before = await measure();
    document.body.innerHTML = '<ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>';
    const after = await measure();
    expect(keyOf(after, 'Beta')).toBe(keyOf(before, 'Beta'));
    expect(keyOf(after, 'Gamma')).toBe(keyOf(before, 'Gamma'));
  });

  it('keys an element by its id in place of its classes and position', async () => {
    // An id is the one identity a page promises to keep; keying past it ties the key to markup that may move.
    document.body.innerHTML = '<div><p class="x">a</p><p id="lead" class="y">b</p></div>';
    const keys = (await measure()).elements.map((e) => e.key);
    expect(keys).toContain('body>div:nth(1)>p#lead:nth(1)');
  });

  it('finds the focused element under the same key the capture gave it', async () => {
    // A focus record keyed differently from the capture would match no element, and the focus check would judge nothing.
    document.body.innerHTML = '<nav><a href="/a">A</a><a href="/b" class="is-current">B</a></nav>';
    const keys = (await measure()).elements.map((e) => e.key);
    (document.querySelectorAll('a')[1] as HTMLElement).focus();
    const state = (globalThis as unknown as { __footbagFocusState: () => { key: string; ancestors: Array<{ key: string }> } | null }).__footbagFocusState();
    expect(state?.key).toBe(keys[2]);
    // The box around a control is read too, under its capture key, since it may draw the indicator through focus-within.
    expect(state?.ancestors.map((a) => a.key)).toEqual([keys[0]]);
    (document.activeElement as HTMLElement).blur();
    expect((globalThis as unknown as { __footbagFocusState: () => unknown }).__footbagFocusState()).toBeNull();
  });

  it('records the attributes the rules decide on, including whether a region has a name', async () => {
    // A scroll wrapper whose aria-label went unrecorded would be reported unlabelled on every page.
    document.body.innerHTML =
      '<div id="w" tabindex="0" role="region" aria-label="Results"></div>' +
      '<div id="u" aria-labelledby="missing"></div>' +
      '<input type="Checkbox" disabled hidden><a href="/x">x</a><a>y</a>' +
      '<details open><summary>s</summary></details><details><summary>t</summary></details>' +
      '<div aria-live="Polite">m</div>';
    const [w, u, input, link, bare, opened, , closed, , live] = (await measure()).elements;
    // A live region left unrecorded is a message the code-leak check never reads.
    expect(live.attrs.live).toBe('polite');
    // A closed disclosure recorded as open would have its hidden content judged as if a reader saw it.
    expect(opened.attrs.open).toBe(true);
    expect(closed.attrs.open).toBeUndefined();
    expect(w.attrs).toEqual({ tabindex: '0', role: 'region', named: true });
    expect(u.attrs.named).toBeUndefined();
    expect(input.attrs).toMatchObject({ type: 'checkbox', disabled: true, hidden: true });
    expect('visibleLabel' in input).toBe(true);
    expect(link.attrs.href).toBe(true);
    expect(bare.attrs.href).toBeUndefined();
  });

  it('stops at the cap and says so, rather than returning a partial page as if it were whole', async () => {
    // A long results page cut off silently would pass the rules on the rows that happened to be recorded.
    document.body.innerHTML = '<ul>' + '<li>r</li>'.repeat(50) + '</ul>';
    const cap = await measure({ cap: 10 });
    expect(cap.elements).toHaveLength(10);
    expect(cap.truncated).toBe(true);
  });

  it('interns repeated style values and reads the requested root tokens', async () => {
    // Without interning a large page's capture balloons; without tokens the grey-text rules have nothing to compare.
    document.documentElement.style.setProperty('--text-muted', '#666666');
    document.body.innerHTML = '<p>a</p><p>b</p>';
    const cap = await measure({ template: 'synthetic/page', tokens: ['--text-muted', '--absent'] });
    expect(cap.elements[0].styles).toEqual(cap.elements[1].styles);
    expect(cap.tokens['--text-muted']).toMatch(/^(#666666|rgb\(102, 102, 102\))$/);
    expect(cap.tokens['--absent']).toBeUndefined();
    expect(cap.template).toBe('synthetic/page');
  });

  it('counts a label parked off the screen, or clipped to nothing, as no visible label', async () => {
    // The visually-hidden label pattern would otherwise read as a visible one, and a field labelled only for
    // screen readers would pass the visible-label rule.
    document.body.innerHTML =
      '<label for="a">Name</label><input id="a">' +
      '<label for="b" class="parked">Town</label><input id="b">' +
      '<label for="c" class="clipped">Club</label><input id="c">';
    const box = (left: number) => ({ left, right: left + 80, top: 0, bottom: 20, width: 80, height: 20, x: left, y: 0 });
    const [shown, parked, clipped] = Array.from(document.querySelectorAll('label')) as HTMLElement[];
    // happy-dom does no layout and computes no default visibility, so the boxes and visibility are planted.
    for (const [label, left] of [[shown, 0], [parked, -9999], [clipped, 0]] as const) {
      label.style.visibility = 'visible';
      label.getBoundingClientRect = () => box(left) as DOMRect;
      label.getClientRects = () => [box(left)] as unknown as DOMRectList;
    }
    clipped.style.setProperty('clip-path', 'inset(50%)');
    const fields = (await measure()).elements.filter((e) => e.tag === 'input');
    expect(fields.map((f) => f.visibleLabel)).toEqual([true, false, false]);
  });

  it('records whether an image carries both width and height attributes', async () => {
    // The browser reports an attribute-sized image's aspect ratio as "auto", so without this every sized image reads as unsized.
    document.body.innerHTML = '<img width="40" height="40" alt="a"><img width="40" alt="b"><img alt="c">';
    expect((await measure()).elements.map((e) => e.attrs.sized ?? false)).toEqual([true, false, false]);
  });

  it('records the page backgrounds behind everything else', async () => {
    // Contrast judged against an assumed white would pass light text on a page that paints itself dark.
    document.body.style.backgroundColor = 'rgb(17, 17, 17)';
    document.body.innerHTML = '<p>a</p>';
    const cap = await measure();
    expect(cap.page.bodyBackground).toBe('rgb(17, 17, 17)');
    expect('htmlBackground' in cap.page).toBe(true);
    document.body.style.backgroundColor = '';
  });
});
