/**
 * Browse-shell top-nav consistency guard.
 *
 * The view-toggle nav (`<nav class="trick-view-toggle">`) is a single shared
 * template block rendered identically on every browse view. The dictionary
 * offers exactly four views, all in one row, with no "Other views" control.
 * This test pins that consistency so a future change can't reintroduce a
 * per-view nav variant, reorder the items, or bring a further view back.
 *
 * Canonical structure (one source of truth in tricks.hbs):
 *   By ADD · By family · By set · By modifier
 *
 * "By set" and "By modifier" are distinct views and their labels never
 * collapse onto one view. A request for any other view value renders the
 * default By ADD view.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3526');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // One active trick so each view renders a normal page; the nav itself is
  // static (not data-dependent).
  insertFreestyleTrick(db, { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', notation: 'MIRAGE', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// view param → expected active label.
const VIEWS: Array<[string, string]> = [
  ['add', 'By ADD'],
  ['family', 'By family'],
  ['set', 'By set'],
  ['modifier', 'By modifier'],
];

// View values the dictionary no longer offers; each renders the default view.
const REMOVED_VIEWS = ['movement-system', 'topology', 'dex-count', 'component', 'category'];

const CANONICAL_ORDER = [
  'By ADD',
  'By family',
  'By set',
  'By modifier',
];

function navBlock(html: string): string {
  const m = html.match(/<nav class="trick-view-toggle".*?<\/nav>/s);
  expect(m, 'trick-view-toggle nav not found').not.toBeNull();
  return m![0];
}

// Ordered item labels: each item is either an active <span> or a link <a>.
// Items may carry other attributes (a title explaining the axis), so the
// match is on the element and its label, not on an exact attribute string.
function navLabels(nav: string): string[] {
  return Array.from(
    nav.matchAll(/<(?:span[^>]*class="trick-view-toggle-active"|a[^>]*href="[^"]*")[^>]*>([^<]+)<\/(?:span|a)>/g),
    m => m[1].trim(),
  ).filter(l => l !== '·');
}

async function fetchNav(view: string): Promise<string> {
  const res = await page(`/freestyle/tricks?view=${view}`);
  expect(res.status).toBe(200);
  return navBlock(res.text);
}

describe('Browse-shell nav — consistency across the four views', () => {
  it('all four views render the same nav labels in the same canonical order', async () => {
    for (const [view] of VIEWS) {
      const labels = navLabels(await fetchNav(view));
      expect(labels, `${view} nav order`).toEqual(CANONICAL_ORDER);
    }
  });

  it('the nav carries no "Other views" control', async () => {
    for (const [view] of VIEWS) {
      const nav = await fetchNav(view);
      expect(nav, `${view} nav has no disclosure`).not.toContain('<details');
      expect(nav).not.toContain('Other views');
    }
  });

  it('an empty set or modifier view says so in plain words, naming no database table', async () => {
    // The fixture's one trick carries no modifier link, so both views are empty.
    const modifier = await page('/freestyle/tricks?view=modifier');
    expect(modifier.text).toContain('No tricks are listed by modifier yet.');
    const set = await page('/freestyle/tricks?view=set');
    expect(set.text).toContain('No tricks are listed by set yet.');
    for (const html of [modifier.text, set.text]) {
      expect(html).not.toContain('freestyle_trick_modifier_links');
    }
  });

  it('a removed view value renders the default By ADD view', async () => {
    for (const view of REMOVED_VIEWS) {
      const nav = await fetchNav(view);
      const active = nav.match(/<span[^>]*class="trick-view-toggle-active"[^>]*>([^<]+)<\/span>/);
      expect(active?.[1].trim(), `?view=${view} falls back to By ADD`).toBe('By ADD');
      expect(navLabels(nav), `?view=${view} nav order`).toEqual(CANONICAL_ORDER);
    }
  });

  it('each view marks the correct active nav item', async () => {
    for (const [view, activeLabel] of VIEWS) {
      const nav = await fetchNav(view);
      const active = nav.match(/<span[^>]*class="trick-view-toggle-active"[^>]*>([^<]+)<\/span>/);
      expect(active, `${view} has an active nav item`).not.toBeNull();
      expect(active![1].trim(), `${view} active label`).toBe(activeLabel);
      // Exactly one active item per view.
      const activeCount = (nav.match(/trick-view-toggle-active/g) ?? []).length;
      expect(activeCount, `${view} has exactly one active nav item`).toBe(1);
      // A screen reader hears which view is current only through aria-current,
      // carried by the same single active item.
      expect(nav, `${view} active item is announced as current`)
        .toMatch(/<span[^>]*aria-current="page"[^>]*class="trick-view-toggle-active"/);
      expect((nav.match(/aria-current="page"/g) ?? []).length, `${view} has exactly one current item`).toBe(1);
    }
  });

  it('"By set" and "By modifier" stay two distinct entries with their own views, and no legacy label returns', async () => {
    const LEGACY_LABELS = [/>By category</, />By component</, />By topology</, />Topology</];
    for (const [view] of VIEWS) {
      const nav = await fetchNav(view);
      expect(nav, `${view} nav includes "By modifier"`).toContain('By modifier');
      expect(nav, `${view} nav includes "By set"`).toContain('By set');
      // "By set" resolves to ?view=set only, never to the modifier view.
      expect(nav).not.toMatch(/href="\/freestyle\/tricks\?view=modifier"[^>]*>By set</);
      if (view !== 'set') {
        expect(nav, `${view} nav links By set to ?view=set`).toMatch(/href="\/freestyle\/tricks\?view=set"[^>]*>By set</);
      }
      for (const legacy of LEGACY_LABELS) {
        expect(nav, `${view} nav must not contain a legacy label ${legacy}`).not.toMatch(legacy);
      }
    }
  });
});
