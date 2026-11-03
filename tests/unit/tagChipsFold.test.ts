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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// What a person types until they commit it is one hashtag, and each '#' starts
// a new one, the rule the server applies to the same text.
describe('tag-chips.js hashtag boundaries', () => {
  // Typing asks the server for suggestions; nothing here is about them.
  class SilentRequest {
    open(): void { /* never answered */ }
    setRequestHeader(): void { /* never answered */ }
    send(): void { /* never answered */ }
  }
  beforeEach(() => { vi.stubGlobal('XMLHttpRequest', SilentRequest); });
  afterEach(() => { vi.unstubAllGlobals(); });

  // Defect caught: before the letter table arrives, the words of one hashtag
  // are run together, so "footbag chin lone" is saved as #footbagchinlone.
  it('joins the words of one hashtag with underscores while the letter table is not loaded', () => {
    const field = mount({ tableLoaded: false });
    type(field, 'footbag chin lone');
    expect(field.chips()).toEqual(['footbag_chin_lone']);
  });

  function key(field: Field, k: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    field.text.dispatchEvent(e);
    return e;
  }
  function input(field: Field, value: string): void {
    field.text.value = value;
    field.text.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Defect caught: a pasted "#a #b" becomes one chip #a_b, so the item is saved
  // with a hashtag the member never meant.
  it('makes a chip of each # in the text when Enter is pressed', () => {
    for (const typed of ['#chinlone #club_wellington', '#chinlone#club_wellington']) {
      const field = mount();
      type(field, typed);
      expect(field.chips(), typed).toEqual(['chinlone', 'club_wellington']);
      expect(field.hidden.value, typed).toBe('#chinlone #club_wellington');
      expect(field.text.value, typed).toBe('');
    }
  });

  // Defect caught: words typed without a # are split into several chips.
  it('makes one chip of words typed without a #', () => {
    const field = mount();
    type(field, 'footbag chin lone');
    expect(field.chips()).toEqual(['footbag_chin_lone']);
  });

  // Defect caught: a space ends the hashtag, so "footbag chin lone" can never be typed.
  it('commits nothing on a space', () => {
    const field = mount();
    field.text.value = 'footbag';
    const e = key(field, ' ');
    expect(e.defaultPrevented).toBe(false);
    expect(field.chips()).toEqual([]);
    expect(field.text.value).toBe('footbag');
  });

  // Defect caught: Tab past a refused hashtag is swallowed, so a keyboard user
  // cannot leave the field until they fix it.
  it('commits on Tab and lets focus move on, even past a refused hashtag', () => {
    const field = mount();
    field.text.value = '#chinlone';
    expect(key(field, 'Tab').defaultPrevented).toBe(true);
    expect(field.chips()).toEqual(['chinlone']);
    field.text.value = '#tokyo東京';
    expect(key(field, 'Tab').defaultPrevented).toBe(false);
    expect(field.text.value).toBe('#tokyo東京');
  });

  // Defect caught: a second hashtag typed after the first is merged into it.
  it('commits the text before a newly typed # and leaves the box holding the #', () => {
    const field = mount();
    input(field, '#chinlone');
    expect(field.chips()).toEqual([]);
    input(field, '#chinlone#');
    expect(field.chips()).toEqual(['chinlone']);
    expect(field.text.value).toBe('#');
  });

  it('starts nothing for a # typed first in an empty box', () => {
    const field = mount();
    input(field, '#');
    expect(field.chips()).toEqual([]);
    expect(field.text.value).toBe('#');
  });

  // Defect caught: a paste of several hashtags leaves them all in the box as one.
  it('turns a pasted list into chips, leaving the last in the box until Enter', () => {
    const field = mount();
    input(field, '#chinlone #club_wellington #footbag chin lone');
    expect(field.chips()).toEqual(['chinlone', 'club_wellington']);
    expect(field.text.value).toBe('#footbag chin lone');
    type(field, field.text.value);
    expect(field.chips()).toEqual(['chinlone', 'club_wellington', 'footbag_chin_lone']);
  });

  // Defect caught: a refused hashtag takes the good ones down with it, or is lost.
  it('keeps a refused hashtag in the box while the others become chips', () => {
    const field = mount();
    type(field, '#chinlone #tokyo東京');
    expect(field.chips()).toEqual(['chinlone']);
    expect(field.text.value).toBe('#tokyo東京');
    expect(field.note.textContent).toContain('tokyo東京');
  });

  // Defect caught: text typed but not committed is submitted as one merged
  // hashtag, or split at its spaces.
  it('splits text left in the box on submit by the same rule', () => {
    for (const [typed, want] of [
      ['#chinlone #club_wellington', ['chinlone', 'club_wellington']],
      ['#chinlone#club_wellington', ['chinlone', 'club_wellington']],
      ['footbag chin lone', ['footbag_chin_lone']],
    ] as const) {
      const field = mount();
      field.text.value = typed;
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      expect(field.chips(), typed).toEqual(want);
      expect(field.hidden.value, typed).toBe(want.map((t) => `#${t}`).join(' '));
    }
  });

  // Defect caught: a form re-shown with the typed text splits it into one chip per word.
  it('reads a field filled with typed text by the same rule', () => {
    const field = mount({ value: 'footbag chin lone #club_wellington' });
    expect(field.chips()).toEqual(['footbag_chin_lone', 'club_wellington']);
  });
});

describe('tag-chips.js standard-hashtag offer', () => {
  // Each request the script opens, answered by the case when it chooses.
  class HeldRequest {
    static opened: HeldRequest[] = [];
    status = 0;
    responseText = '';
    onload: (() => void) | null = null;
    open(): void { HeldRequest.opened.push(this); }
    setRequestHeader(): void { /* headers are not under test */ }
    send(): void { /* answered later by answer() */ }
    answer(body: unknown): void {
      this.status = 200;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    }
  }
  const HIT = [{ normalized: '#event_2026_worlds', display: '#event_2026_worlds', name: 'Worlds 2026' }];

  function mountEntry(): Field {
    document.body.innerHTML = `
      <form><input type="text" id="tags" name="tags" value="" data-tag-chips data-tag-entry></form>`;
    // eslint-disable-next-line no-new-func
    new Function(FOLD_SRC)();
    (window as unknown as { footbagFold: { useTable(m: Record<string, string>): void } })
      .footbagFold.useTable(TABLE.map);
    // eslint-disable-next-line no-new-func
    new Function(CHIPS_SRC)();
    return {
      text: document.getElementById('tags') as HTMLInputElement,
      hidden: document.querySelector('input[type="hidden"][name="tags"]') as HTMLInputElement,
      note: document.querySelector('[data-fold-note]') as HTMLElement,
      chips: () => Array.from(document.querySelectorAll('.tag-chip-input-chip')).map((c) => c.getAttribute('data-tag') ?? ''),
    };
  }

  beforeEach(() => {
    HeldRequest.opened = [];
    vi.stubGlobal('XMLHttpRequest', HeldRequest);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Defect caught: an answer arriving after its hashtag was removed still
  // offers to swap a hashtag the member no longer has.
  it('offers the swap for a hashtag still there, and ignores a late answer for one removed', () => {
    const field = mountEntry();
    type(field, 'worlds');
    type(field, 'gone');
    const [forWorlds, forGone] = HeldRequest.opened;
    const goneChip = document.querySelector('.tag-chip-input-chip[data-tag="gone"]') as HTMLElement;
    (goneChip.querySelector('.tag-chip-input-chip-remove') as HTMLButtonElement).click();
    forGone.answer(HIT);
    forWorlds.answer(HIT);
    expect(document.querySelector('[data-did-you-mean="gone"]')).toBeNull();
    expect(document.querySelector('[data-did-you-mean="worlds"]')).not.toBeNull();
  });
});
