/**
 * Browse-shell top-nav consistency guard.
 *
 * The view-toggle nav (`<nav class="trick-view-toggle">`) is a single shared
 * template block rendered identically on every primary browse view. The
 * prominent row carries only the primary browse axes; the specialist views
 * live behind an "Other views" disclosure that renders open when the active
 * view is inside it. This test pins that consistency so a future change can't
 * reintroduce a per-view nav variant, reorder the items, or promote a
 * specialist view back into the prominent row.
 *
 * Canonical structure (one source of truth in tricks.hbs):
 *   Prominent: By ADD · By family · By set · By modifier
 *   Other views (disclosure): By movement system · Movement Neighborhoods ·
 *   By dex count
 *
 * Family, Set, and Modifier are the curated first-class browse axes and sit
 * in the prominent row; the disclosure carries the specialist / analytical
 * lenses. "By set" and "By modifier" are distinct views and their labels
 * never collapse onto one view.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3526');

let createApp: Awaited<ReturnType<typeof importApp>>;

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
  ['movement-system', 'By movement system'],
  ['topology', 'Movement Neighborhoods'],
  ['dex-count', 'By dex count'],
  ['modifier', 'By modifier'],
];

// The specialist views that live inside the "Other views" disclosure.
const OTHER_VIEWS = new Set(['movement-system', 'topology', 'dex-count']);

const CANONICAL_ORDER = [
  'By ADD',
  'By family',
  'By set',
  'By modifier',
  'By movement system',
  'Movement Neighborhoods',
  'By dex count',
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
  const res = await request(await createApp()).get(`/freestyle/tricks?view=${view}`);
  expect(res.status).toBe(200);
  return navBlock(res.text);
}

describe('Browse-shell nav — consistency across all six primary views', () => {
  it('all six views render the same nav labels in the same canonical order', async () => {
    for (const [view] of VIEWS) {
      const labels = navLabels(await fetchNav(view));
      expect(labels, `${view} nav order`).toEqual(CANONICAL_ORDER);
    }
  });

  it('the specialist views sit inside the "Other views" disclosure', async () => {
    for (const [view] of VIEWS) {
      const nav = await fetchNav(view);
      const details = nav.match(/<details class="trick-view-toggle-other"[^>]*>.*?<\/details>/s);
      expect(details, `${view} nav has the Other views disclosure`).not.toBeNull();
      expect(details![0]).toContain('<summary>Other views</summary>');
      // Every specialist label is inside the disclosure, and the two prominent
      // labels are outside it.
      const inside = details![0];
      for (const label of ['By movement system', 'Movement Neighborhoods', 'By dex count']) {
        expect(inside, `"${label}" lives inside the disclosure`).toContain(label);
      }
      const outside = nav.replace(inside, '');
      for (const label of ['By ADD', 'By family', 'By set', 'By modifier']) {
        expect(outside, `"${label}" stays in the prominent row`).toContain(label);
      }
      for (const label of ['By movement system', 'Movement Neighborhoods', 'By dex count']) {
        expect(outside, `"${label}" does not also render outside the disclosure`).not.toContain(label);
      }
    }
  });

  it('the disclosure renders open exactly when the active view lives inside it', async () => {
    for (const [view] of VIEWS) {
      const nav = await fetchNav(view);
      const isOpen = /<details class="trick-view-toggle-other" open>/.test(nav);
      expect(isOpen, `${view}: disclosure open state`).toBe(OTHER_VIEWS.has(view));
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
