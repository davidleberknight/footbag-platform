/**
 * Integration tests for the structural and membership surfaces on trick-detail
 * pages.
 *
 * Verifies:
 *   - The structural-fact block carries family base and modifier rows only:
 *     no movement-system or movement-neighborhood row, since the dictionary
 *     offers no view either would link into
 *   - No trick page links to a dictionary view that no longer exists
 *   - The standalone Component-memberships panel is retired; per-modifier
 *     linkage is owned by the Modifiers section
 *   - A trick with nothing to show renders no membership panels
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3099');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

// A link into any dictionary view outside the four the dictionary offers.
const REMOVED_VIEW_LINK = /\/freestyle\/tricks\?view=(?!add\b|family\b|set\b|modifier\b)[a-z-]+/;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertFreestyleTrickModifier(db, { slug: 'pixie',     modifier_name: 'pixie',     modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'symposium', modifier_name: 'symposium', modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'ducking',   modifier_name: 'ducking',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'spinning',  modifier_name: 'spinning',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'paradox',   modifier_name: 'paradox',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });

  // Mirage: a base with no modifier links.
  insertFreestyleTrick(db, {
    slug:                 'mirage',
    canonical_name:       'mirage',
    adds:                 '2',
    base_trick:           'mirage',
    trick_family:         'mirage',
    category:             'compound',
    operational_notation: '[set] > op in dex > op toe',
  });

  // Whirl: a base with no modifier links.
  insertFreestyleTrick(db, {
    slug:                 'whirl',
    canonical_name:       'whirl',
    adds:                 '3',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > in dex > ss clipper',
  });

  // Ducking-whirl: one body modifier on a whirl base.
  insertFreestyleTrick(db, {
    slug:                 'ducking-whirl',
    canonical_name:       'ducking whirl',
    adds:                 '4',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > duck > in dex > ss clipper',
  });
  insertFreestyleTrickModifierLink(db, 'ducking-whirl', 'ducking', 1);

  // Phoenix: a set and a body modifier on a butterfly base.
  insertFreestyleTrick(db, {
    slug:                 'phoenix',
    canonical_name:       'phoenix',
    adds:                 '5',
    base_trick:           'butterfly',
    trick_family:         'butterfly',
    category:             'compound',
    operational_notation: '[clip] > pixie > duck > butterfly wing > ss clipper',
  });
  insertFreestyleTrickModifierLink(db, 'phoenix', 'pixie',   1);
  insertFreestyleTrickModifierLink(db, 'phoenix', 'ducking', 2);

  // Montage: a deep compound with four modifier links, the case that used to
  // carry every movement-system and neighborhood row at once.
  insertFreestyleTrick(db, {
    slug:                 'montage',
    canonical_name:       'montage',
    adds:                 '7',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > spinning > duck > paradox symposium whirl > ss clipper',
  });
  insertFreestyleTrickModifierLink(db, 'montage', 'spinning',  1);
  insertFreestyleTrickModifierLink(db, 'montage', 'ducking',   2);
  insertFreestyleTrickModifierLink(db, 'montage', 'paradox',   3);
  insertFreestyleTrickModifierLink(db, 'montage', 'symposium', 4);

  // Lone-trick: no modifier links and a base outside any family grouping.
  insertFreestyleTrick(db, {
    slug:                 'lone-trick',
    canonical_name:       'lone trick',
    adds:                 '2',
    base_trick:           'clipper-stall',
    trick_family:         'clipper-stall',
    category:             'compound',
    operational_notation: '[clip] > toe',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const FIXTURE_SLUGS = ['mirage', 'whirl', 'ducking-whirl', 'phoenix', 'montage', 'lone-trick'];

function structuralBlock(html: string): string {
  const start = html.indexOf('trick-structural-facts"');
  if (start === -1) return '';
  return html.slice(start, html.indexOf('</section>', start));
}

describe('trick-detail — structural facts carry family base and modifiers only', () => {
  it('montage lists its modifiers and no movement-system or neighborhood row', async () => {
    const res = await page('/freestyle/tricks/montage');
    expect(res.status).toBe(200);
    const block = structuralBlock(res.text);
    expect(block).toContain('<dt>Modifiers</dt>');
    expect(block).toContain('href="/freestyle/modifier/paradox"');
    expect(block).not.toMatch(/Movement system/i);
    expect(block).not.toMatch(/Movement neighborhood/i);
  });

  it('carries no observational badge, since no observational row remains', async () => {
    const res = await page('/freestyle/tricks/montage');
    expect(structuralBlock(res.text)).not.toContain('symbolic-layer-badge');
  });

  it('no fixture trick page links into a dictionary view that no longer exists', async () => {
    for (const slug of FIXTURE_SLUGS) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status, slug).toBe(200);
      expect(res.text, `${slug} links to a removed view`).not.toMatch(REMOVED_VIEW_LINK);
    }
  });
});

// The standalone Component-memberships panel is retired; per-modifier
// linkage is owned by the Modifiers section.
describe('trick-detail — component-memberships panel retired', () => {
  it('mirage renders no Component-memberships panel', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.text).not.toContain('Component memberships');
  });

  it('ducking-whirl renders no Component-memberships panel; modifiers owned by the Modifiers section', async () => {
    const res = await page('/freestyle/tricks/ducking-whirl');
    expect(res.text).not.toContain('Component memberships');
    expect(res.text).toContain('Modifiers on this trick');
  });

  it('phoenix renders no Component-memberships panel; modifiers owned by the Modifiers section', async () => {
    const res = await page('/freestyle/tricks/phoenix');
    expect(res.text).not.toContain('Component memberships');
    expect(res.text).toContain('Modifiers on this trick');
  });
});

describe('trick-detail — empty memberships', () => {
  it('a trick with nothing to show renders no membership panels', async () => {
    const res = await page('/freestyle/tricks/lone-trick');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('trick-semantic-memberships');
    expect(res.text).not.toContain('Topology memberships');
    expect(res.text).not.toContain('Component memberships');
  });
});
