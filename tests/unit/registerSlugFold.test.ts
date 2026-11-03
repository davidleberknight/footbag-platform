/**
 * The profile URL field on registration (src/public/js/register-defaults.js)
 * folds a typed URL by the site's one rule, so the member sees the permanent URL
 * the server will store, and says under the field what changed. A URL holding
 * letters with no a to z form is left as typed, for the server to refuse.
 */
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { slugifyForTag } from '../../src/services/slugify';

const SCRIPT_SRC = fs.readFileSync(path.resolve(__dirname, '../../src/public/js/register-defaults.js'), 'utf8');
const FOLD_SRC = fs.readFileSync(path.resolve(__dirname, '../../src/public/js/fold-token.js'), 'utf8');
const TABLE: { map: Record<string, string> } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../src/public/js/latin-ascii.json'), 'utf8'),
);

interface Form {
  form: HTMLFormElement;
  given: HTMLInputElement;
  family: HTMLInputElement;
  slug: HTMLInputElement;
  note: HTMLElement;
}

function mount(tableLoaded = true): Form {
  document.body.innerHTML = `
    <form>
      <input id="givenNames"><input id="familyName"><input id="displayName">
      <input id="slug" name="slug">
    </form>`;
  // eslint-disable-next-line no-new-func
  new Function(FOLD_SRC)();
  if (tableLoaded) {
    (window as unknown as { footbagFold: { useTable(m: Record<string, string>): void } })
      .footbagFold.useTable(TABLE.map);
  }
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT_SRC)();
  return {
    form: document.querySelector('form') as HTMLFormElement,
    given: document.getElementById('givenNames') as HTMLInputElement,
    family: document.getElementById('familyName') as HTMLInputElement,
    slug: document.getElementById('slug') as HTMLInputElement,
    note: document.querySelector('[data-fold-note]') as HTMLElement,
  };
}

function leave(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('blur'));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('register-defaults.js profile URL folding', () => {
  it('places an empty announced line under the URL field before anything is typed', () => {
    const f = mount();
    expect(f.note).not.toBeNull();
    expect(f.note.getAttribute('aria-live')).toBe('polite');
    expect(f.note.textContent).toBe('');
    expect(f.slug.getAttribute('aria-describedby') ?? '').toContain(f.note.id);
  });

  // A suggestion that differs from the server's fold would become the member's
  // permanent address without their seeing it.
  it('suggests from the name exactly what the server derives, with no line', () => {
    const f = mount();
    f.given.value = 'Zoë';
    leave(f.family, 'Müller');
    expect(f.slug.value).toBe(slugifyForTag('Zoë Müller'));
    expect(f.note.textContent).toBe('');
  });

  it('folds a typed URL on leaving the field and names the folded URL', () => {
    const f = mount();
    leave(f.slug, 'Zoë-Müller');
    expect(f.slug.value).toBe('zoe_muller');
    expect(f.note.textContent).toContain('zoe_muller');
    leave(f.slug, 'plain_url');
    expect(f.note.textContent).toBe('');
  });

  // Enter submits without leaving the field: the fold must still show first.
  it('holds back a submit that folding changed, and lets the folded value through', () => {
    const f = mount();
    f.slug.value = 'Zoë Müller';
    const first = new Event('submit', { cancelable: true });
    f.form.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(f.slug.value).toBe('zoe_muller');
    const second = new Event('submit', { cancelable: true });
    f.form.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  // Folding would drop the letters and give an address the member did not type.
  it('leaves a typed URL with letters that have no a to z form as typed', () => {
    const f = mount();
    leave(f.slug, 'kenji_日本');
    expect(f.slug.value).toBe('kenji_日本');
    expect(f.note.textContent).toBe('');
  });

  it('suggests and folds nothing while the letter table is not loaded', () => {
    const f = mount(false);
    f.given.value = 'Zoë';
    leave(f.family, 'Müller');
    expect(f.slug.value).toBe('');
    leave(f.slug, 'Zoë-Müller');
    expect(f.slug.value).toBe('Zoë-Müller');
  });
});
