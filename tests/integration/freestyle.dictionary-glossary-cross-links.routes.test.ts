/**
 * Integration tests for navigation cross-links between the dictionary
 * surface and the glossary surface.
 *
 * Long-term contract pinned:
 *
 *   1. SemanticBrowseToken carries a `glossaryAnchor` field. Modifier-
 *      role tokens with a §6 modifier-feel-card map to
 *      `/freestyle/glossary#modifier-{slug}`; base-anchor-role tokens
 *      for known core atoms map to `/freestyle/glossary#term-{slug}`.
 *      Side-positional / unknown / unlisted slugs receive null and
 *      stay rendered as plain spans.
 *
 *   2. Each glossary §6 modifier-feel card carries a "See tricks using X
 *      →" deep-link to /freestyle/tricks?view=component#component-{slug}.
 *
 *   3. Freestyle heroes are breadcrumb + title + subhead only — no
 *      cross-link CTA inside the hero. The glossary body still
 *      references the trick dictionary in prose; in-content
 *      dictionary↔glossary linking is rebuilt separately.
 *
 * Four-layer compliance: glossaryAnchor is a NAVIGATION reference (layer
 * 3 → layer 4 jump), not a content collapse. Token text / role / slug
 * remain pure symbolic-decomposition content. CSS adds `.sem-token--linked`
 * class only when the anchor is set; non-linked tokens stay span elements.
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
import {
  shapeSemanticNotation,
} from '../../src/services/semanticNotationRendering';

const { dbPath } = setTestEnv('3100');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed a whirl-family compound whose chain reading uses modifiers
  // and a base-anchor — the rendered card must wrap both in anchor links.
  // blurry-whirl is the rendering target because it remains non-first-
  // class (composite-modifier compound; blurry → stepping+paradox
  // expansion isn't supported at the parser layer per Red ruling).
  // Non-first-class compounds preserve their tautological chain readings,
  // so blurry-whirl's "blurry whirl" reading still renders with linked
  // tokens. paradox-whirl + spinning-whirl are in
  // FIRST_CLASS_TIER_2; their tautological chains
  // are suppressed (the first-class summary row carries the structural
  // decomposition instead). They remain seeded for the resolver-level
  // tests below which exercise pure text-to-token resolution and are
  // independent of rendering.
  insertFreestyleTrick(db, {
    slug:           'paradox-whirl',
    canonical_name: 'paradox whirl',
    trick_family:   'whirl',
    category:       'compound',
    adds:           '4',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'spinning-whirl',
    canonical_name: 'spinning whirl',
    trick_family:   'whirl',
    category:       'compound',
    adds:           '4',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'blurry-whirl',
    canonical_name: 'blurry whirl',
    trick_family:   'whirl',
    category:       'compound',
    adds:           '5',
    is_active:      1,
  });
  // The base anchor for the family.
  insertFreestyleTrick(db, {
    slug:           'whirl',
    canonical_name: 'whirl',
    trick_family:   'whirl',
    category:       'dex',
    adds:           '3',
    is_active:      1,
  });
  // ripwalk is seeded as the rendering-target for the linked-
  // token assertions below. ripwalk's chain reading "stepping butterfly"
  // is non-tautological with the canonical name, so it survives the
  // universal tautological-reading filter and exercises the linked-
  // token render contract.
  insertFreestyleTrick(db, {
    slug:           'ripwalk',
    canonical_name: 'ripwalk',
    trick_family:   'butterfly',
    category:       'compound',
    adds:           '4',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'butterfly',
    canonical_name: 'butterfly',
    trick_family:   'butterfly',
    category:       'dex',
    adds:           '3',
    is_active:      1,
  });
  // Third butterfly member so the family clears the family-view three-member
  // minimum and the ripwalk card below renders.
  insertFreestyleTrick(db, {
    slug:           'parkwalk',
    canonical_name: 'parkwalk',
    trick_family:   'butterfly',
    category:       'compound',
    adds:           '5',
    is_active:      1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('SemanticBrowseToken.glossaryAnchor — resolver behavior', () => {
  it('emits modifier-anchor URL for modifier-role tokens with a §6 card', () => {
    const tokens = shapeSemanticNotation('paradox whirl');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.text).toBe('paradox');
    expect(tokens[0]!.role).toBe('modifier');
    expect(tokens[0]!.glossaryAnchor).toBe('/freestyle/glossary#modifier-paradox');
  });

  it('emits term-anchor URL for base-anchor tokens with a §5 entry', () => {
    const tokens = shapeSemanticNotation('paradox whirl');
    expect(tokens[1]!.text).toBe('whirl');
    expect(tokens[1]!.role).toBe('base-anchor');
    expect(tokens[1]!.glossaryAnchor).toBe('/freestyle/glossary#term-whirl');
  });

  it('returns null for side-positional tokens', () => {
    const tokens = shapeSemanticNotation('stepping near butterfly');
    // [stepping (modifier), near (side-positional), butterfly (base-anchor)]
    expect(tokens[1]!.text).toBe('near');
    expect(tokens[1]!.role).toBe('side-positional');
    expect(tokens[1]!.glossaryAnchor).toBeNull();
  });

  it('returns null for unknown tokens', () => {
    const tokens = shapeSemanticNotation('zorglub whirl');
    expect(tokens[0]!.text).toBe('zorglub');
    expect(tokens[0]!.role).toBe('unknown');
    expect(tokens[0]!.glossaryAnchor).toBeNull();
  });

  it('returns null for registered modifier roles WITHOUT a feel card (e.g. gyro)', () => {
    // gyro is in the MODIFIERS registry but has no §6 modifier-feel card,
    // so the resolver intentionally returns null rather than emit a dead
    // anchor.
    const tokens = shapeSemanticNotation('gyro torque');
    expect(tokens[0]!.text).toBe('gyro');
    expect(tokens[0]!.role).toBe('modifier');
    expect(tokens[0]!.glossaryAnchor).toBeNull();
  });
});

describe('Trick-card rendering — tokens wrap in anchor links when glossaryAnchor is set', () => {
  // ripwalk is the rendering target: paradox-whirl is in
  // FIRST_CLASS_TIER_2, which suppresses its tautological chain
  // reading on the rendered card, and blurry-whirl's tautological
  // chain "blurry whirl" is suppressed by the universal tautological
  // filter. ripwalk's chain reading "stepping butterfly" survives the
  // filter and exercises the SemanticBrowseToken anchor-link
  // contract this describe block validates.
  it('renders the stepping token as an anchor on the ripwalk card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    const card = res.text.match(
      /data-trick-slug="ripwalk"[\s\S]*?<\/article>/,
    );
    expect(card).not.toBeNull();
    expect(card![0]).toMatch(
      /<a class="sem-token[^"]*sem-token--linked"[^>]*href="\/freestyle\/glossary#[^"]+"[^>]*>stepping<\/a>/,
    );
  });

  it('renders the butterfly token as an anchor on the ripwalk card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const card = res.text.match(
      /data-trick-slug="ripwalk"[\s\S]*?<\/article>/,
    );
    expect(card).not.toBeNull();
    expect(card![0]).toMatch(
      /<a class="sem-token[^"]*sem-token--linked"[^>]*href="\/freestyle\/glossary#[^"]+"[^>]*>butterfly<\/a>/,
    );
  });

  it('preserves data-token-slug on linked tokens', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const card = res.text.match(
      /data-trick-slug="ripwalk"[\s\S]*?<\/article>/,
    );
    expect(card).not.toBeNull();
    expect(card![0]).toMatch(
      /<a class="sem-token[^"]*sem-token--linked"[^>]*data-token-slug="butterfly"[^>]*>butterfly<\/a>/,
    );
  });

  it('renders linked tokens identically in ADD view (registry density)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const card = res.text.match(
      /data-trick-slug="ripwalk"[\s\S]*?<\/article>/,
    );
    expect(card).not.toBeNull();
    expect(card![0]).toMatch(
      /<a class="sem-token[^"]*sem-token--linked"[^>]*>stepping<\/a>/,
    );
    expect(card![0]).toMatch(
      /<a class="sem-token[^"]*sem-token--linked"[^>]*>butterfly<\/a>/,
    );
  });
});

describe('Glossary §6 modifier cards — "See tricks using X" deep-links', () => {
  it('renders a tricks-link footer on every set-modifier card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // Each modifier card carries the tricks-link paragraph; spot-check the four
    // most pedagogically central ones. The movement-system view groups by axis,
    // so there is no per-modifier anchor; every card's browse link lands on the
    // view itself.
    for (const slug of ['pixie', 'atomic', 'paradox', 'symposium']) {
      expect(
        res.text,
        `glossary modifier card for '${slug}' missing tricks-link footer`,
      ).toContain('href="/freestyle/tricks?view=movement-system"');
    }
  });

  it('renders the tricks-link class wrapper on the footer paragraph', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('class="glossary-modifier-card-tricks-link"');
  });

  it('preserves the modifier-pixie deep-link anchor, cross-linked to its set definition', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    // Pixie is set vocabulary, defined in the Timing & Sets chapter. Its feel
    // card moved there, but the modifier-pixie anchor that dictionary tokens
    // deep-link to survives as a thin cross-link so those deep links resolve.
    expect(res.text).toContain('id="modifier-pixie"');
    const stub = res.text.match(/id="modifier-pixie"[^>]*href="([^"]+)"/);
    expect(stub).not.toBeNull();
    expect(stub![1]).toBe('#section-timing-sets');
  });
});

describe('Freestyle heroes carry no cross-link CTA clutter', () => {
  it('glossary hero no longer carries a hero-cross-link CTA', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="hero-cross-link"');
  });

  it('trick-dictionary hero no longer carries a hero-cross-link CTA', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="hero-cross-link"');
  });

  it('the glossary still cross-references the trick dictionary in its body', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/tricks"');
  });
});
