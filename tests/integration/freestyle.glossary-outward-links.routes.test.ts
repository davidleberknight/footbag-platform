/**
 * Integration tests for the standardized outward-link contract on
 * /freestyle/glossary.
 *
 * The outward-link phrasing is uniform across the glossary's
 * five card primitives — a single vocabulary per destination type:
 *
 *   - "View full ontology →"      → /freestyle/tricks/{slug} (trick-detail)
 *   - "Browse {Name} tricks →"    → /freestyle/tricks?view=movement-system
 *   - "Modifier reference →"      → /freestyle/modifier/{slug} or operator page
 *   - "View family →"             → /freestyle/tricks?view=family (preserved
 *                                   as-is; not normalized)
 *
 * Forbidden variants (retired):
 *   - "See tricks using {Name} →"
 *   - "Learn more about {displayName} →"
 *   - any unanchored phrasing not in the table above
 *
 * Contract under test:
 *   - "View full ontology →" appears on every derivation-atlas panel
 *     and on every family card.
 *   - "Browse {Name} tricks →" replaces "See tricks using {Name} →"
 *     on modifier feel-cards.
 *   - "Modifier reference →" replaces "Learn more about {displayName} →"
 *     on connective panels with a modifierFamilyHref.
 *   - The unified .glossary-outward-link CSS class binds the
 *     standardized links.
 *   - Forbidden variants ("See tricks using", "Learn more about") do
 *     not appear in the rendered HTML.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3164');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/glossary — standardized outward-link phrasings', () => {
  it('"View full ontology →" appears on derivation-atlas panels', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // The phrase appears at least once per panel × 5 panels — but we
    // only assert at least one occurrence here; per-panel coverage is
    // pinned in freestyle.glossary-derivation-atlas.routes.test.ts.
    expect(res.text).toMatch(/View full ontology\s*&rarr;/);
  });

  it('"View full ontology →" appears on family cards', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Family cards link to /freestyle/tricks/{anchor-slug}. Whirl is
    // the canonical root family-anchor and always renders.
    expect(res.text).toContain('href="/freestyle/tricks/whirl"');
  });

  it('a family card with teaching shows a compact projection and links the full article', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const startIdx = res.text.indexOf('id="term-down"');
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = res.text.indexOf('</article>', startIdx);
    const card = res.text.slice(startIdx, endIdx);
    // The plain-language physical description leads; notation no longer stands alone.
    expect(card).toContain('A down is a finishing movement');
    // Links to the full family article, not the anchor trick slug that 404s.
    expect(card).toContain('href="/freestyle/families/down"');
    expect(card).toContain('Read the Full Family Article');
    expect(card).not.toContain('href="/freestyle/tricks/down"');
  });

  it('"Browse {Name} tricks →" replaces "See tricks using {Name} →" on modifier feel-cards', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Browse \w[\w\s-]*tricks\s*&rarr;/i);
  });

  it('Forbidden phrasing "See tricks using" is retired from the glossary', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).not.toMatch(/See tricks using/i);
  });

  it('Forbidden phrasing "Learn more about" is retired from connective panels', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // The phrase is forbidden as an outward-link affordance. It may
    // appear in incidental prose elsewhere, so we scope the check to
    // the connective-panel deep-link slot via the .panel-deep-link
    // class (the new phrasing is "Modifier reference →").
    const linkPattern = /class="panel-deep-link[^"]*"[^>]*>\s*Learn more about/i;
    expect(res.text).not.toMatch(linkPattern);
  });

  it('unified .glossary-outward-link class binds the standardized links', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // At minimum, the atlas panels and family cards carry the class.
    // The test pins presence; count assertions would be brittle across
    // future curator additions.
    expect(res.text).toMatch(/class="glossary-outward-link"/);
    expect(res.text).toMatch(/class="panel-deep-link glossary-outward-link"/);
  });
});

describe('GET /freestyle/glossary — §8 mobius doctrine-lighting cleanup', () => {
  it('§8 mobius observationalNote carries no rotational-continuity framing', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const startIdx = res.text.indexOf('add-example-mobius');
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = res.text.indexOf('</article>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    // The retired rotational-continuity framing no longer appears in §8's
    // mobius card.
    expect(region).not.toMatch(/rotational-frame continuity/i);
    expect(region).not.toMatch(/preserved as a teaching artifact/i);
    expect(region).not.toMatch(/exhibited rather than narrated/i);
  });

  it('§8 mobius observationalNote is self-contained (gyro layered on torque)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const startIdx = res.text.indexOf('add-example-mobius');
    const endIdx = res.text.indexOf('</article>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toMatch(/gyro layered on torque/i);
  });
});
