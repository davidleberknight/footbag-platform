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
import { CAPTURE_SCHEMA, CaptureView, STYLE_PROPS, type Capture } from '../e2e/helpers/renderedStyle';

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

  it('keys elements by tag, sorted classes and position among look-alike siblings, from body down', async () => {
    // Keys that changed with class order, or with a sibling of a different kind, would make every diff report the whole
    // page as replaced. A look-alike sibling inserted earlier does shift the keys after it; the diff reports that as added.
    document.body.innerHTML =
      '<main><div class="b a">1</div><div class="a b">2</div><div>3</div><script>1</script><svg><g></g></svg></main>';
    const cap = await measure();
    expect(cap.elements.map((e) => e.key)).toEqual([
      'body>main:nth(1)',
      'body>main:nth(1)>div.a.b:nth(1)',
      'body>main:nth(1)>div.a.b:nth(2)',
      'body>main:nth(1)>div:nth(1)',
      'body>main:nth(1)>svg:nth(1)',
    ]);
    expect(cap.elements[1].parent).toBe(0);
  });

  it('records the attributes the rules decide on, including whether a region has a name', async () => {
    // A scroll wrapper whose aria-label went unrecorded would be reported unlabelled on every page.
    document.body.innerHTML =
      '<div id="w" tabindex="0" role="region" aria-label="Results"></div>' +
      '<div id="u" aria-labelledby="missing"></div>' +
      '<input type="Checkbox" disabled hidden><a href="/x">x</a><a>y</a>';
    const [w, u, input, link, bare] = (await measure()).elements;
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
    expect(cap.tokens).toEqual({ '--text-muted': '#666666' });
    expect(cap.template).toBe('synthetic/page');
  });
});
