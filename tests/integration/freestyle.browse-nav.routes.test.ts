/**
 * Browse-shell top-nav consistency guard.
 *
 * The view-toggle nav (`<nav class="trick-view-toggle">`) is a single shared
 * template block rendered identically on every primary browse view. This test
 * pins that consistency so a future change can't reintroduce a per-view nav
 * variant, reorder the items, or revert "By modifier" to the old "By set".
 *
 * Canonical order (one source of truth in tricks.hbs):
 *   By ADD · By family · By movement system · Movement Neighborhoods ·
 *   By dex count · By modifier
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
  ['movement-system', 'By movement system'],
  ['topology', 'Movement Neighborhoods'],
  ['dex-count', 'By dex count'],
  ['sets', 'By modifier'],
];

const CANONICAL_ORDER = [
  'By ADD',
  'By family',
  'By movement system',
  'Movement Neighborhoods',
  'By dex count',
  'By modifier',
];

function navBlock(html: string): string {
  const m = html.match(/<nav class="trick-view-toggle".*?<\/nav>/s);
  expect(m, 'trick-view-toggle nav not found').not.toBeNull();
  return m![0];
}

// Ordered item labels: each item is either an active <span> or a link <a>.
function navLabels(nav: string): string[] {
  return Array.from(
    nav.matchAll(/<(?:span class="trick-view-toggle-active"|a href="[^"]*")>([^<]+)<\/(?:span|a)>/g),
    m => m[1].trim(),
  );
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

  it('each view marks the correct active nav item', async () => {
    for (const [view, activeLabel] of VIEWS) {
      const nav = await fetchNav(view);
      const active = nav.match(/<span class="trick-view-toggle-active">([^<]+)<\/span>/);
      expect(active, `${view} has an active nav item`).not.toBeNull();
      expect(active![1].trim(), `${view} active label`).toBe(activeLabel);
      // Exactly one active item per view.
      const activeCount = (nav.match(/trick-view-toggle-active/g) ?? []).length;
      expect(activeCount, `${view} has exactly one active nav item`).toBe(1);
    }
  });

  it('nav uses "By modifier" wording, never the old "By set"', async () => {
    for (const [view] of VIEWS) {
      const nav = await fetchNav(view);
      expect(nav, `${view} nav includes "By modifier"`).toContain('By modifier');
      expect(nav, `${view} nav must not say "By set"`).not.toMatch(/>By set</);
    }
  });

  it('no view renders a unique or legacy nav variant', async () => {
    // Same separator count (5 between 6 items) and no retired labels anywhere.
    const LEGACY_LABELS = [/>By set</, />By category</, />By component</, />By topology</, />Topology</];
    for (const [view] of VIEWS) {
      const nav = await fetchNav(view);
      const sepCount = (nav.match(/class="trick-view-toggle-sep"/g) ?? []).length;
      expect(sepCount, `${view} separator count`).toBe(CANONICAL_ORDER.length - 1);
      for (const legacy of LEGACY_LABELS) {
        expect(nav, `${view} nav must not contain a legacy label ${legacy}`).not.toMatch(legacy);
      }
    }
  });
});
