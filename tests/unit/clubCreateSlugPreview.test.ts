/**
 * Unit tests for the club-creation hashtag suggestion at
 * src/public/js/club-create.js.
 *
 * When the member leaves the city field, the script fills the hashtag field
 * from the city. The server saves whatever the field holds, so the suggestion
 * must follow the server's own tag slug rule: a suggestion that differs from it
 * becomes the club's permanent hashtag and address.
 */
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { slugifyForTag } from '../../src/services/slugify';

const SCRIPT_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../src/public/js/club-create.js'),
  'utf8',
);
// The page loads the shared folding script and its table before club-create.js.
const FOLD_SRC = fs.readFileSync(path.resolve(__dirname, '../../src/public/js/fold-token.js'), 'utf8');
const TABLE: { map: Record<string, string> } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../src/public/js/latin-ascii.json'), 'utf8'),
);

function mountForm(slugValue = ''): { city: HTMLInputElement; slug: HTMLInputElement } {
  document.body.innerHTML = `
    <input id="city" type="text" value="">
    <input id="slug" type="text" value="${slugValue}">`;
  // eslint-disable-next-line no-new-func
  new Function(FOLD_SRC)();
  (window as unknown as { footbagFold: { useTable(m: Record<string, string>): void } }).footbagFold.useTable(TABLE.map);
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT_SRC)();
  return {
    city: document.getElementById('city') as HTMLInputElement,
    slug: document.getElementById('slug') as HTMLInputElement,
  };
}

function leaveCity(city: HTMLInputElement, value: string): void {
  city.value = value;
  city.dispatchEvent(new Event('blur'));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('club-create.js hashtag suggestion', () => {
  it('suggests exactly what the server would derive from the city, accents and all', () => {
    const cities = ['Zürich', 'Kraków', 'São Paulo', 'Łódź', 'Ørestad', 'Đà Nẵng', 'St. Louis', 'Denver'];
    for (const cityName of cities) {
      const { city, slug } = mountForm();
      leaveCity(city, cityName);
      expect(slug.value, `suggestion for ${cityName}`).toBe(slugifyForTag(cityName));
    }
  });

  it('leaves a hashtag the member typed alone', () => {
    const { city, slug } = mountForm('my_own_tag');
    leaveCity(city, 'Zürich');
    expect(slug.value).toBe('my_own_tag');
  });

  it('folds a typed hashtag on leaving the field', () => {
    const { slug } = mountForm();
    slug.value = 'Zürich-Nord';
    slug.dispatchEvent(new Event('blur'));
    expect(slug.value).toBe('zurich_nord');
  });

  // Folding would drop the letters and fix a club hashtag the creator did not type.
  it('leaves a typed hashtag with letters that have no a to z form as typed', () => {
    const { slug } = mountForm();
    slug.value = 'tokyo_東京';
    slug.dispatchEvent(new Event('blur'));
    expect(slug.value).toBe('tokyo_東京');
  });
});
