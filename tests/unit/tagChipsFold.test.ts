/**
 * The hashtag chip field at src/public/js/tag-chips.js folds what a member types
 * by the site's one rule, so the chip shows the hashtag the server will store,
 * and says under the field what folding did.
 *
 * The line under the field exists, empty and announced, before any text is put
 * in it, because a screen reader announces a live region's change only when the
 * region was already there. It speaks only of a chip actually added.
 */
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TOKEN_RULES } from '../../src/services/typedTokenRules';

const CHIPS_SRC = fs.readFileSync(path.resolve(__dirname, '../../src/public/js/tag-chips.js'), 'utf8');
const FOLD_SRC = fs.readFileSync(path.resolve(__dirname, '../../src/public/js/fold-token.js'), 'utf8');
const TABLE: { map: Record<string, string> } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../src/public/js/latin-ascii.json'), 'utf8'),
);

interface Field {
  text: HTMLInputElement;
  hidden: HTMLInputElement;
  note: HTMLElement;
  chips(): string[];
}

function mount(opts: { tableLoaded?: boolean; value?: string } = {}): Field {
  document.body.innerHTML = `
    <form><input type="text" id="tags" name="tags" value="${opts.value ?? ''}" data-tag-chips></form>`;
  // eslint-disable-next-line no-new-func
  new Function(FOLD_SRC)();
  if (opts.tableLoaded !== false) {
    (window as unknown as { footbagFold: { useTable(m: Record<string, string>): void } })
      .footbagFold.useTable(TABLE.map);
  }
  // eslint-disable-next-line no-new-func
  new Function(CHIPS_SRC)();
  return {
    text: document.getElementById('tags') as HTMLInputElement,
    hidden: document.querySelector('input[type="hidden"][name="tags"]') as HTMLInputElement,
    note: document.querySelector('[data-fold-note]') as HTMLElement,
    chips: () => Array.from(document.querySelectorAll('.tag-chip-input-chip')).map((c) => c.getAttribute('data-tag') ?? ''),
  };
}

function type(field: Field, value: string): void {
  field.text.value = value;
  field.text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('tag-chips.js folding', () => {
  // Without the announcer in place first, a screen-reader user hears nothing
  // when the line appears.
  it('places an empty announced line under the field before anything is typed', () => {
    const field = mount();
    expect(field.note).not.toBeNull();
    expect(field.note.getAttribute('aria-live')).toBe('polite');
    expect(field.note.textContent).toBe('');
    expect(field.text.getAttribute('aria-describedby') ?? '').toContain(field.note.id);
  });

  // A chip showing a different token than the server stores would mislead the member.
  it('turns a typed accented, hyphenated hashtag into its folded chip and names both forms', () => {
    const field = mount();
    type(field, '#Zoë-Müller');
    expect(field.chips()).toEqual(['zoe_muller']);
    expect(field.hidden.value).toBe('#zoe_muller');
    expect(field.note.textContent).toContain('#zoe_muller');
    expect(field.note.textContent).toContain('Zoë-Müller');
  });

  it('says nothing for a hashtag typed clean, and clears the line when a chip is removed', () => {
    const field = mount();
    type(field, 'Zoë');
    expect(field.note.textContent).not.toBe('');
    type(field, 'plain');
    expect(field.note.textContent).toBe('');
    type(field, 'Müller');
    expect(field.note.textContent).not.toBe('');
    (document.querySelector('.tag-chip-input-chip-remove') as HTMLButtonElement).click();
    expect(field.note.textContent).toBe('');
  });

  it('adds no second chip for a hashtag already there in another spelling', () => {
    const field = mount();
    type(field, 'zoe_muller');
    type(field, 'Zoë Müller');
    expect(field.chips()).toEqual(['zoe_muller']);
  });

  // The server refuses such a hashtag; a chip would promise a save that fails.
  it('refuses a hashtag with letters that have no a to z form, keeping the text', () => {
    const field = mount();
    type(field, '#tokyo東京');
    expect(field.chips()).toEqual([]);
    expect(field.text.value).toBe('#tokyo東京');
    expect(field.note.textContent).toContain('tokyo東京');
  });

  it(`stops at the server's ${TOKEN_RULES.tagsPerItem} hashtags with a line, adding no more`, () => {
    const field = mount();
    for (let i = 0; i < TOKEN_RULES.tagsPerItem; i++) type(field, `count${i}`);
    expect(field.chips()).toHaveLength(TOKEN_RULES.tagsPerItem);
    expect(field.note.textContent).toBe('');
    type(field, 'onemore');
    expect(field.chips()).toHaveLength(TOKEN_RULES.tagsPerItem);
    expect(field.chips()).not.toContain('onemore');
    expect(field.note.textContent).not.toBe('');
  });

  // Before the letter table arrives the chip keeps the typed text and the server
  // folds on save, so no chip ever shows a fold the server would not make.
  it('folds nothing and writes no line while the letter table is not loaded', () => {
    const field = mount({ tableLoaded: false });
    type(field, '#Zoë-Müller');
    expect(field.chips()).toEqual(['Zoë-Müller']);
    expect(field.note.textContent).toBe('');
  });

  it('shows saved hashtags once each, with a single leading #', () => {
    const field = mount({ value: '#beach #Zoë' });
    expect(field.chips()).toEqual(['beach', 'zoe']);
    expect(field.hidden.value).toBe('#beach #zoe');
  });
});
