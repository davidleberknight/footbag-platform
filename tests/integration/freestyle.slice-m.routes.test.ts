/**
 * Integration tests for four freestyle browse behaviors.
 *
 *   1. Derived-branch families — torque + blender each render as their own
 *      top-level family section (derived branches that resolve to themselves),
 *      with their members (mobius / paradox-torque under torque,
 *      paradox-blender / mind-bender under blender) folded in. They do NOT
 *      fold invisibly into osis. drifter renders as its own family, with
 *      high-plains-drifter re-bucketed in via the family override.
 *
 *   2. Clipper-Stall family retirement — Family View no longer renders
 *      an id="family-clipper-stall" section. The clipper-stall row
 *      itself remains visible in the ADD view. ducking-clipper /
 *      spinning-clipper / reaper / high-plains-drifter no longer
 *      surface under a clipper-stall heading.
 *
 *   3. Paradox modifier-composition gloss — Movement System view
 *      renders the curator-authored italic gloss in the paradox group;
 *      other modifier groups (pixie / atomic / spinning / ducking)
 *      render WITHOUT the gloss.
 *
 *   4. Unresolved-compound pill — cards for curator-flagged folk-
 *      derived slugs (rev-up / reaper / surreal / montage /
 *      surgery) render the "decomposition under review" pill;
 *      other cards do not.
 *
 * The fixture covers each behavior plus enough comparison rows to assert both
 * "renders" and "does not render".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

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

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifiers used by the Movement System view.
  insertFreestyleTrickModifier(db, { slug: 'paradox',  modifier_name: 'paradox',  modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'pixie',    modifier_name: 'pixie',    modifier_type: 'set'  });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'spinning', modifier_type: 'body' });
  // atomic is in the Movement System axis but has NO entry in
  // MODIFIER_COMPOSITION_GLOSSES; its group is the canary that the gloss row
  // is suppressed for un-glossed modifiers.
  insertFreestyleTrickModifier(db, { slug: 'atomic',   modifier_name: 'atomic',   modifier_type: 'set'  });

  // ── Osis row (single member; osis family does not render on its own here) ─
  insertFreestyleTrick(db, { slug: 'osis',    canonical_name: 'osis',    adds: '3', base_trick: 'osis', trick_family: 'osis', category: 'base' });

  // ── Torque family (derived branch; anchors its own family) ─────────────
  // torque carries trick_family='torque' and renders its own family section.
  insertFreestyleTrick(db, { slug: 'torque',         canonical_name: 'torque',         adds: '4', base_trick: 'osis',   trick_family: 'torque', category: 'compound', operational_notation: '[set] > paradox > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'mobius',         canonical_name: 'mobius',         adds: '5', base_trick: 'torque', trick_family: 'mobius', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-torque', canonical_name: 'paradox torque', adds: '5', base_trick: 'torque', trick_family: 'torque', category: 'compound' });

  // ── Blender family (derived branch; anchors its own family) ────────────
  insertFreestyleTrick(db, { slug: 'blender',         canonical_name: 'blender',        adds: '4', base_trick: 'osis',    trick_family: 'blender', category: 'compound', operational_notation: '[set] > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'paradox-blender', canonical_name: 'paradox blender', adds: '5', base_trick: 'blender', trick_family: 'blender', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mind-bender',     canonical_name: 'mind bender',    adds: '6', base_trick: 'blender', trick_family: 'blender', category: 'compound' });

  // ── Clipper-Stall lineage rows (family retired from the Family View) ───
  insertFreestyleTrick(db, { slug: 'clipper-stall',     canonical_name: 'Clipper Stall',     adds: '2', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'base' });
  insertFreestyleTrick(db, { slug: 'drifter',           canonical_name: 'drifter',           adds: '3', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'compound', operational_notation: 'CLIP >> OP IN [DEX] > SAME CLIP [XBD] [DEL]' });
  insertFreestyleTrick(db, { slug: 'ducking-clipper',   canonical_name: 'ducking clipper',   adds: '3', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-clipper',  canonical_name: 'spinning clipper',  adds: '3', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'reaper',            canonical_name: 'reaper',            adds: '3', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'high-plains-drifter', canonical_name: 'high-plains-drifter', adds: '4', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'compound' });

  // ── Drifter-family branch ──────────────────────────────────────────────
  insertFreestyleTrick(db, { slug: 'paradox-drifter', canonical_name: 'paradox drifter', adds: '4', base_trick: 'drifter', trick_family: 'drifter', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'smoke',           canonical_name: 'smoke',           adds: '4', base_trick: 'drifter', trick_family: 'drifter', category: 'compound' });

  // ── Whirl-family rows used by Movement System view ─────────────────────
  insertFreestyleTrick(db, { slug: 'whirl',          canonical_name: 'whirl',          adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'base' });
  insertFreestyleTrick(db, { slug: 'paradox-whirl',  canonical_name: 'paradox whirl',  adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });

  // ── Curator-flagged unresolved-compound pilot rows ─────────────────────
  // Each row in this set should render the pending-decomposition pill.
  insertFreestyleTrick(db, { slug: 'rev-up',     canonical_name: 'rev up',     adds: '3', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tomahawk',   canonical_name: 'tomahawk',   adds: '5', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'surreal',    canonical_name: 'surreal',    adds: '6', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'montage',    canonical_name: 'montage',    adds: '7', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'surgery',    canonical_name: 'surgery',    adds: '6', base_trick: 'rev-whirl', trick_family: 'rev-whirl', category: 'compound' });
  // reaper is also unresolved + already inserted above.

  // Atomic-axis fixture (so the atomic group renders — needed by the
  // un-glossed-modifier suppression test).
  insertFreestyleTrick(db, { slug: 'atom-smasher', canonical_name: 'atom smasher', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });

  // ── Modifier links — enough to populate Movement System pilot groups ──
  insertFreestyleTrickModifierLink(db, 'torque',         'paradox',  1);
  insertFreestyleTrickModifierLink(db, 'paradox-torque', 'paradox',  1);
  insertFreestyleTrickModifierLink(db, 'paradox-blender','paradox',  1);
  insertFreestyleTrickModifierLink(db, 'paradox-whirl',  'paradox',  1);
  insertFreestyleTrickModifierLink(db, 'paradox-drifter','paradox',  1);
  insertFreestyleTrickModifierLink(db, 'spinning-whirl', 'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'atom-smasher',   'atomic',   1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. Derived-branch families render as their own family parents
// ─────────────────────────────────────────────────────────────────────────

function familySection(html: string, slug: string): string {
  const start = html.indexOf(`id="family-${slug}"`);
  if (start < 0) return '';
  const end = html.indexOf('<section', start + 1);
  return end > -1 ? html.substring(start, end) : html.substring(start);
}

describe('Family view — torque + blender render as their own family parents', () => {
  it('torque renders as its own top-level family with its members folded in', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="family-torque"');
    const section = familySection(res.text, 'torque');
    for (const slug of ['torque', 'mobius', 'paradox-torque']) {
      expect(section, `${slug} should render in the torque family`).toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('blender renders as its own top-level family with its members folded in', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('id="family-blender"');
    const section = familySection(res.text, 'blender');
    for (const slug of ['blender', 'paradox-blender', 'mind-bender']) {
      expect(section, `${slug} should render in the blender family`).toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('every torque + blender member also appears in the osis section (a branch is contained in its root)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    // torque and blender are derived branches of osis, so every member of
    // either branch is also a member of osis and renders in the osis section
    // as well as in its own branch section.
    expect(res.text).toContain('id="family-osis"');
    const osis = familySection(res.text, 'osis');
    for (const slug of ['osis', 'torque', 'mobius', 'paradox-torque', 'blender', 'paradox-blender', 'mind-bender']) {
      expect(osis, `${slug} should also appear in the osis section`).toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('the torque + blender members do not render as their own top-level families', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    for (const slug of ['mobius', 'paradox-torque', 'paradox-blender', 'mind-bender']) {
      expect(res.text).not.toContain(`id="family-${slug}"`);
    }
  });

  it('drifter family renders with drifter as its anchor + high-plains-drifter re-bucketed in', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('id="family-drifter"');
    const section = familySection(res.text, 'drifter');
    expect(section).toContain('data-trick-slug="drifter"');
    expect(section).toContain('data-trick-slug="high-plains-drifter"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Clipper-Stall family retirement
// ─────────────────────────────────────────────────────────────────────────

describe('Clipper-Stall family retirement (Family View)', () => {
  it('Family View no longer renders id="family-clipper-stall"', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).not.toContain('id="family-clipper-stall"');
  });

  it('ducking-clipper / spinning-clipper / reaper / clipper-stall do not appear in any Family-View section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    // The clipper-stall ROW (anchor) — singleton in its bucket and the
    // bucket is retired — must not surface inside any family section.
    // Since the test seed has no other 'clipper' family rows, the
    // entire family-view should be clipper-stall-free.
    const sectionsStart = res.text.indexOf('class="content-section trick-family-group');
    const sectionsEnd   = res.text.indexOf('<p class="source-note"');
    if (sectionsStart > -1 && sectionsEnd > sectionsStart) {
      const familyArea = res.text.substring(sectionsStart, sectionsEnd);
      expect(familyArea).not.toContain('data-trick-slug="clipper-stall"');
      expect(familyArea).not.toContain('data-trick-slug="ducking-clipper"');
      expect(familyArea).not.toContain('data-trick-slug="spinning-clipper"');
      expect(familyArea).not.toContain('data-trick-slug="reaper"');
    }
  });

  it('the clipper-stall row + retired members remain visible in the ADD view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-trick-slug="clipper-stall"');
    expect(res.text).toContain('data-trick-slug="ducking-clipper"');
    expect(res.text).toContain('data-trick-slug="spinning-clipper"');
    expect(res.text).toContain('data-trick-slug="reaper"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Paradox modifier-composition gloss (Movement System view)
// ─────────────────────────────────────────────────────────────────────────

describe('Paradox composition gloss (Movement System view)', () => {
  it('paradox group renders the curator-authored italic composition gloss', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.status).toBe(200);
    expect(res.text).toContain('movement-group-composition-gloss');
    // Verify the curator content appears under the paradox group anchor.
    const start = res.text.indexOf('id="movement-paradox"');
    expect(start).toBeGreaterThan(-1);
    const end = res.text.indexOf('<section', start + 1);
    const slice = end > -1 ? res.text.substring(start, end) : res.text.substring(start);
    expect(slice).toMatch(/PDX \+ base/);
    expect(slice).toMatch(/entry topology/);
  });

  it('un-glossed modifier groups DO NOT render a composition gloss row', async () => {
    // paradox + spinning + ducking + symposium + stepping + pixie are all
    // curator-authored glosses. atomic is in the Movement System axis but
    // has NO gloss entry — its group is the canary verifying the gloss row
    // suppresses cleanly when null.
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    const atomicStart = res.text.indexOf('id="movement-atomic"');
    expect(atomicStart, 'atomic group should be present in the rendered view').toBeGreaterThan(-1);
    const atomicEnd = res.text.indexOf('<section', atomicStart + 1);
    const slice = atomicEnd > -1 ? res.text.substring(atomicStart, atomicEnd) : res.text.substring(atomicStart);
    expect(slice).not.toContain('movement-group-composition-gloss');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Unresolved-compound pill (dictionary trick cards)
// ─────────────────────────────────────────────────────────────────────────

describe('Unresolved-compound pill', () => {
  it('renders the pending pill on each curator-flagged folk-derived row (shared-card view)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    // For each unresolved slug seeded into the fixture, the rendered
    // card must carry the pending-pill marker. tomahawk is not in
    // UNRESOLVED_COMPOUNDS (its decomposition is settled), so it is
    // excluded here.
    for (const slug of ['rev-up', 'reaper', 'surreal', 'montage', 'surgery']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx, `${slug} card should render`).toBeGreaterThan(-1);
      // Look for the pending-pill class within a short window after the
      // card's data-trick-slug attribute (well under one card's length).
      const window = res.text.substring(idx, idx + 4000);
      expect(window, `${slug} should carry the pending pill`).toContain('class="dict-trick-row-pending"');
    }
  });

  it('does NOT render the pill on non-flagged rows', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    // Sanity rows that should NOT carry the pill. tomahawk is explicitly
    // included to verify it is absent from UNRESOLVED_COMPOUNDS.
    for (const slug of ['whirl', 'paradox-whirl', 'osis', 'torque', 'blender', 'drifter', 'tomahawk']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx, `${slug} card should render`).toBeGreaterThan(-1);
      // Window from this card's start up to the next card (cheaper than
      // a full parse): the pill must not appear inside it.
      const nextCard = res.text.indexOf('data-trick-slug=', idx + 1);
      const upper = nextCard > -1 ? nextCard : idx + 4000;
      const window = res.text.substring(idx, upper);
      expect(window, `${slug} should not carry the pending pill`).not.toContain('class="dict-trick-row-pending"');
    }
  });

  it('renders the pill text "decomposition under review" in italics', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toMatch(/<span class="dict-trick-row-pending"[^>]*><em>decomposition under review<\/em><\/span>/);
  });
});
