/**
 * The Share Media form's live gallery preview (src/public/js/share-media.js)
 * shows the address and hashtags a named gallery will be saved with, and
 * records them in the hidden preview field the server checks. With the chip
 * field, a hashtag still being typed sits in the chip box until it becomes a
 * chip; the chip script adds it on submit, so the preview counts it too, or
 * the page shows one set of hashtags and the server saves another.
 */
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SHARE_SRC = fs.readFileSync(path.resolve(__dirname, '../../src/public/js/share-media.js'), 'utf8');
const FOLD_SRC = fs.readFileSync(path.resolve(__dirname, '../../src/public/js/fold-token.js'), 'utf8');
const TABLE: { map: Record<string, string> } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../src/public/js/latin-ascii.json'), 'utf8'),
);

const DATA = {
  galleryIdPrefix: 'gallery_dave_',
  automaticTag: '#by_dave',
  takenIds: [],
  takenRefused: false,
  personalGalleryId: 'gallery_dave_personal_gallery',
  maxFiles: 4,
  fileBytes: 25 * 1024 * 1024,
  totalBytes: 50 * 1024 * 1024,
};

// The page as the chip script leaves it: the named input holds the finished
// chips, and the chip box holds what is still being typed.
function mount(chips: string, typing: string): { name: HTMLInputElement; token: HTMLInputElement } {
  document.body.innerHTML = `
    <form data-share-form>
      <input type="hidden" name="tags" value="${chips}">
      <div class="tag-chip-input-container"><input type="text" class="tag-chip-input-field" value="${typing}"></div>
      <input type="text" name="galleryName" data-share-gallery-name>
      <div data-share-preview hidden></div>
      <input type="hidden" name="galleryPreview" value="" data-share-preview-token>
    </form>
    <script type="application/json" id="share-media-data">${JSON.stringify(DATA)}</script>`;
  // eslint-disable-next-line no-new-func
  new Function(FOLD_SRC)();
  (window as unknown as { footbagFold: { useTable(m: Record<string, string>): void } }).footbagFold.useTable(TABLE.map);
  // eslint-disable-next-line no-new-func
  new Function(SHARE_SRC)();
  return {
    name: document.querySelector('[data-share-gallery-name]') as HTMLInputElement,
    token: document.querySelector('[data-share-preview-token]') as HTMLInputElement,
  };
}

async function typeName(field: HTMLInputElement, value: string): Promise<void> {
  // The script attaches its listeners once the fold library says it is ready.
  await (window as unknown as { footbagFold: { ready: Promise<unknown> } }).footbagFold.ready;
  await Promise.resolve();
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  // It refreshes the preview on a zero-delay timer after each edit.
  vi.runAllTimers();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('share-media.js gallery preview', () => {
  // Defect caught: a hashtag typed but not yet a chip is left out, so the
  // preview says the name's hashtag is used and the server, which saves the
  // typed one, sends the member back to confirm a gallery they never saw.
  it('counts a hashtag still being typed in the chip box', async () => {
    const page = mount('', '#funky');
    await typeName(page.name, 'funky footbags');
    expect(page.token.value).toBe('gallery_dave_funky_footbags #by_dave #funky');
  });

  // Defect caught: an unfinished hashtag with capitals is previewed as typed,
  // but the chip script lowercases it on submit, so the server's preview
  // differs and the member is sent back to confirm and choose photos again.
  it('folds a hashtag still being typed the way the chip script commits it', async () => {
    const page = mount('', 'Zurich Trip');
    await typeName(page.name, 'Travel');
    expect(page.token.value).toBe('gallery_dave_travel #by_dave #zurich_trip');
  });

  // Defect caught: finished chips and the one being typed are not both kept.
  it('keeps finished chips ahead of the one being typed', async () => {
    const page = mount('#first', 'second');
    await typeName(page.name, 'Two Tags');
    expect(page.token.value).toBe('gallery_dave_two_tags #by_dave #first #second');
  });

  // Defect caught: several hashtags still in the chip box are previewed as one
  // merged hashtag, while the chip script sends them as several.
  it('splits text still being typed at each #, as the chip script does on submit', async () => {
    const page = mount('', '#chinlone #club_wellington');
    await typeName(page.name, 'Travel');
    expect(page.token.value).toBe('gallery_dave_travel #by_dave #chinlone #club_wellington');
  });

  // Defect caught: words typed without a # in the plain field are previewed as
  // several hashtags, while the server saves them as one.
  it('keeps words typed without a # together as one hashtag', async () => {
    const page = mount('footbag chin lone', '');
    await typeName(page.name, 'Travel');
    expect(page.token.value).toBe('gallery_dave_travel #by_dave #footbag_chin_lone');
  });

  // Defect caught: with nothing typed, the name's hashtag is not used.
  it('uses the hashtag made from the name when none is given', async () => {
    const page = mount('', '');
    await typeName(page.name, 'Funky Footbags');
    expect(page.token.value).toBe('gallery_dave_funky_footbags #by_dave #Funky_Footbags');
  });
});

describe('share-media.js per-photo captions', () => {
  // Defect caught: photos chosen under one file name (a phone browser names
  // each image.jpg) get caption boxes sharing one field name, so the server
  // keeps only the last caption and gives it to every photo.
  it('names each photo\'s caption box by the photo\'s place in the selection', () => {
    document.body.innerHTML = `
      <form data-share-form>
        <input type="file" name="photoFiles" multiple data-share-files>
        <div data-share-shared-caption><textarea name="caption"></textarea></div>
        <div data-share-captions></div>
      </form>
      <script type="application/json" id="share-media-data">${JSON.stringify(DATA)}</script>`;
    // eslint-disable-next-line no-new-func
    new Function(FOLD_SRC)();
    // eslint-disable-next-line no-new-func
    new Function(SHARE_SRC)();
    const input = document.querySelector('[data-share-files]') as HTMLInputElement;
    const chosen = [new File(['a'], 'image.jpg', { type: 'image/jpeg' }), new File(['b'], 'image.jpg', { type: 'image/jpeg' })];
    Object.defineProperty(input, 'files', { value: chosen, configurable: true });
    input.dispatchEvent(new Event('change'));
    const names = Array.from(document.querySelectorAll('[data-share-captions] textarea')).map((t) => t.getAttribute('name'));
    expect(names).toEqual(chosen.map((_, i) => `caption_for:${i}`));
  });
});
