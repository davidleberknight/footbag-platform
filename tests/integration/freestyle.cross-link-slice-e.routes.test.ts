/**
 * Integration tests for Slice E of the 2026-05 dictionary/glossary
 * normalization plan — navigation cross-links between the dictionary
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
 *   3. /freestyle/glossary hero carries a "Browse the trick dictionary →"
 *      CTA; /freestyle/tricks hero carries a "Learn the language →" CTA.
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

  // Seed a butterfly-family compound whose chain reading uses modifiers
  // and a base-anchor — the rendered card must wrap both in anchor links.
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
  // The base anchor for the family.
  insertFreestyleTrick(db, {
    slug:           'whirl',
    canonical_name: 'whirl',
    trick_family:   'whirl',
    category:       'dex',
    adds:           '3',
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
  it('renders the paradox token as an anchor to /freestyle/glossary#modifier-paradox', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    const card = res.text.match(
      /data-trick-slug="paradox-whirl"[\s\S]*?<\/article>/,
    );
    expect(card).not.toBeNull();
    // The paradox token renders as <a class="sem-token sem-token--modifier
    // sem-token--linked" href="/freestyle/glossary#modifier-paradox" ...>
    expect(card![0]).toMatch(
      /<a class="sem-token sem-token--modifier sem-token--linked"[^>]*href="\/freestyle\/glossary#modifier-paradox"[^>]*>paradox<\/a>/,
    );
  });

  it('renders the whirl token as an anchor to /freestyle/glossary#term-whirl', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const card = res.text.match(
      /data-trick-slug="paradox-whirl"[\s\S]*?<\/article>/,
    );
    expect(card).not.toBeNull();
    expect(card![0]).toMatch(
      /<a class="sem-token sem-token--base-anchor sem-token--linked"[^>]*href="\/freestyle\/glossary#term-whirl"[^>]*>whirl<\/a>/,
    );
  });

  it('preserves data-token-slug and isFamilyAnchor on linked tokens', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const card = res.text.match(
      /data-trick-slug="paradox-whirl"[\s\S]*?<\/article>/,
    );
    expect(card).not.toBeNull();
    // The whirl token is the family anchor in view=family — must carry
    // data-anchor="true" alongside the new href.
    expect(card![0]).toMatch(
      /<a class="sem-token sem-token--base-anchor sem-token--linked"[^>]*data-anchor="true"[^>]*data-token-slug="whirl"[^>]*>whirl<\/a>/,
    );
  });

  it('renders linked tokens identically in ADD view (registry density)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    const card = res.text.match(
      /data-trick-slug="paradox-whirl"[\s\S]*?<\/article>/,
    );
    expect(card).not.toBeNull();
    // ADD view passes no group anchor, so isFamilyAnchor=false; but the
    // glossaryAnchor still resolves and the token still renders as <a>.
    expect(card![0]).toMatch(
      /<a class="sem-token sem-token--modifier sem-token--linked"[^>]*href="\/freestyle\/glossary#modifier-paradox"[^>]*>paradox<\/a>/,
    );
    expect(card![0]).toMatch(
      /<a class="sem-token sem-token--base-anchor sem-token--linked"[^>]*href="\/freestyle\/glossary#term-whirl"[^>]*>whirl<\/a>/,
    );
  });
});

describe('Glossary §6 modifier cards — "See tricks using X" deep-links', () => {
  it('renders a tricks-link footer on every set-modifier card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // Each of the 13 modifier cards carries the new tricks-link paragraph;
    // spot-check the four most pedagogically central ones.
    //
    // 2026-05-18 Component View soft retirement: cross-links re-pointed
    // from ?view=component#component-{slug} to
    // ?view=movement-system#movement-{slug}. Movement System is the
    // canonical modifier-grouped browse surface; Component View remains
    // bookmark-accessible but no longer reached from new on-site links.
    for (const slug of ['pixie', 'atomic', 'paradox', 'symposium']) {
      expect(
        res.text,
        `glossary modifier card for '${slug}' missing tricks-link footer`,
      ).toContain(`href="/freestyle/tricks?view=movement-system#movement-${slug}"`);
    }
  });

  it('renders the tricks-link class wrapper on the footer paragraph', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('class="glossary-modifier-card-tricks-link"');
  });

  it('positions the tricks-link footer INSIDE each modifier card article', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    // The card for #modifier-pixie contains the tricks-link footer with
    // the matching Movement System deep-link (post-soft-retirement).
    const cardRegion = res.text.match(
      /id="modifier-pixie"[\s\S]*?<\/article>/,
    );
    expect(cardRegion).not.toBeNull();
    expect(cardRegion![0]).toContain('href="/freestyle/tricks?view=movement-system#movement-pixie"');
  });
});

describe('Page-hero cross-link CTAs', () => {
  it('renders "Browse the trick dictionary →" CTA on the glossary hero', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="hero-cross-link"');
    expect(res.text).toMatch(
      /<a href="\/freestyle\/tricks">Browse the trick dictionary &rarr;<\/a>/,
    );
  });

  it('renders "Learn the language →" CTA on the trick-dictionary hero', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="hero-cross-link"');
    expect(res.text).toMatch(
      /<a href="\/freestyle\/glossary">Learn the language &rarr;<\/a>/,
    );
  });
});
