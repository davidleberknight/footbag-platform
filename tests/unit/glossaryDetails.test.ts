/**
 * Unit tests for the glossary deep-link opener at
 * src/public/js/glossary-details.js.
 *
 * The glossary presents its content as collapsible chapters (<details>). Content
 * inside a closed <details> is not rendered, so a deep link to an id inside a
 * collapsed chapter would land on hidden content. The script opens every
 * <details> ancestor of the URL-fragment target (including nested chapters) and
 * scrolls to it, on load and on hashchange, and no-ops off the glossary page.
 *
 * happy-dom is not a real browser, but the script only reads location.hash and
 * toggles <details>.open on DOM nodes, which are fully observable here.
 */
// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../src/public/js/glossary-details.js',
);
const SCRIPT_SRC = fs.readFileSync(SCRIPT_PATH, 'utf8');

/** Evaluate the vanilla browser IIFE against the current happy-dom globals. */
function runScript(): void {
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT_SRC)();
}

function setHash(hash: string): void {
  window.location.hash = hash;
}

beforeAll(() => {
  // happy-dom may not implement scrollIntoView; the script calls it after opening.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  // Attach the script's load/hashchange listeners once, with the guard satisfied.
  document.body.innerHTML = '<div class="glossary-page"></div>';
  runScript();
});

beforeEach(() => {
  setHash('');
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('glossary-details.js — deep-link opener', () => {
  it('opens a collapsed chapter whose content is the fragment target, on load', () => {
    document.body.innerHTML = `
      <div class="glossary-page">
        <details class="glossary-topic" id="chapter-x">
          <summary>Chapter X</summary>
          <section id="section-x"><p>content</p></section>
        </details>
      </div>`;
    setHash('#section-x');
    window.dispatchEvent(new Event('DOMContentLoaded'));

    const chapter = document.getElementById('chapter-x') as HTMLDetailsElement;
    expect(chapter.open).toBe(true);
  });

  it('opens every nested <details> ancestor of the target', () => {
    document.body.innerHTML = `
      <div class="glossary-page">
        <details class="glossary-topic" id="chapter-outer">
          <summary>Outer</summary>
          <details class="glossary-core-atom-collapsible" id="inner">
            <summary>Inner</summary>
            <dt id="deep-target">deep</dt>
          </details>
        </details>
      </div>`;
    setHash('#deep-target');
    window.dispatchEvent(new Event('DOMContentLoaded'));

    expect((document.getElementById('chapter-outer') as HTMLDetailsElement).open).toBe(true);
    expect((document.getElementById('inner') as HTMLDetailsElement).open).toBe(true);
  });

  it('opens the newly-referenced chapter on hashchange', () => {
    document.body.innerHTML = `
      <div class="glossary-page">
        <details id="chapter-a"><summary>A</summary><p id="a">a</p></details>
        <details id="chapter-b"><summary>B</summary><p id="b">b</p></details>
      </div>`;
    setHash('#b');
    window.dispatchEvent(new Event('hashchange'));

    expect((document.getElementById('chapter-b') as HTMLDetailsElement).open).toBe(true);
  });

  it('does nothing and does not throw when the fragment target is absent', () => {
    document.body.innerHTML = `
      <div class="glossary-page">
        <details id="chapter-a"><summary>A</summary><p id="a">a</p></details>
      </div>`;
    setHash('#no-such-id');
    expect(() => window.dispatchEvent(new Event('DOMContentLoaded'))).not.toThrow();
    expect((document.getElementById('chapter-a') as HTMLDetailsElement).open).toBe(false);
  });

  it('is inert off the glossary page (guard: no listeners attached without .glossary-page)', () => {
    document.body.innerHTML = '<div><details id="d"><summary>d</summary></details></div>';
    const spy = vi.spyOn(window, 'addEventListener');
    runScript();
    const events = spy.mock.calls.map((c) => c[0]);
    expect(events).not.toContain('hashchange');
    expect(events).not.toContain('DOMContentLoaded');
  });
});
