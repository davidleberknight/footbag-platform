/**
 * /freestyle/sets/:slug — Set detail page (Phase B of the set-system
 * refactor, 2026-05-25).
 *
 * Pins:
 *   - 200 status on known canonical-set slugs (pixie, blurry, surging)
 *   - 404 on unknown slugs (anti-enumeration)
 *   - Detail page renders: name, hashtag, formula, movement explanation,
 *     equivalence readings (when present), derived/related systems,
 *     example tricks section (empty-state OR populated), cross-links,
 *     source provenance, audit-status (when present)
 *   - Cross-links resolve to expected URLs (set hub, compositional hub,
 *     Movement Systems set axis, flat reference, operators page when
 *     applicable)
 *   - /freestyle/sets (no slug) renders the Set Encyclopedia (200; promoted from 301 in 2026-05-25 polish)
 *   - /freestyle/sets/reference renders the flat Holden reference (200,
 *     not the redirect)
 *   - /freestyle/moves 301-redirects to /freestyle/sets/reference
 *   - Set Hub now shows "View set details →" link (no Phase A placeholder)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickModifier, insertFreestyleTrickModifierLink } from '../fixtures/factories';

const { dbPath } = setTestEnv('3221');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed one canonical trick linked to the pixie modifier so the pixie set
  // detail page renders a populated exampleTricks section in tests.
  insertFreestyleTrickModifier(db, {
    slug: 'pixie', modifier_name: 'pixie', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set', notes: '',
  });
  insertFreestyleTrick(db, {
    slug: 'pixie-mirage', canonical_name: 'pixie mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    operational_notation: 'TOE > SAME IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'pixie-mirage', 'pixie');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/sets/:slug — set detail page', () => {
  it('returns 200 for a canonical-set slug (pixie)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown slug (anti-enumeration)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/this-is-not-a-real-set');
    expect(res.status).toBe(404);
  });

  it('renders the display name and #<slug>-set hashtag in the header', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('Pixie');
    expect(res.text).toContain('#pixie-set');
  });

  it('renders the formula as a code block', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('class="set-detail-formula"');
    expect(res.text).toContain('TOE &gt; SAME IN [DEX] &gt;');
  });

  it('renders the movement explanation', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toMatch(/Toe set, then a same-side inward dex/);
  });

  it('renders derived systems as anchor links to /freestyle/sets/<slug>', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    // pixie lists terraging, sailing, etc. as derived
    expect(res.text).toMatch(/href="\/freestyle\/sets\/terraging"/);
  });

  it('renders related systems for sets that have them', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    // pixie's related: fairy
    expect(res.text).toMatch(/href="\/freestyle\/sets\/fairy"/);
  });

  it('renders source provenance label', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('set-card-source--platform-tracked');
    expect(res.text).toContain('Platform-tracked');
  });

  it('renders audit-status label for sets that carry one (atomic = partial)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic');
    expect(res.text).toContain('set-card-audit--partial');
  });

  it('renders the conflict audit label for surging', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/surging');
    expect(res.text).toContain('set-card-audit--conflict');
    expect(res.text).toContain('Documented disagreement');
  });

  it('renders the holden-only audit label and dashed-border style for bubba', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/bubba');
    expect(res.text).toContain('set-card-audit--holden-only');
    expect(res.text).toContain('set-card-source--holden-only');
  });

  it('renders example-tricks section populated when modifier-link rows exist', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('class="set-detail-trick-list"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/pixie-mirage"/);
  });

  it('renders example-tricks empty state for holden-only sets with no modifier registry', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/bubba');
    expect(res.text).toContain('set-detail-examples-section--empty');
    expect(res.text).toContain('No canonical tricks currently link this set');
  });

  it('renders cross-links to set hub, compositional hub, movement-system axis, and flat reference', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    // Handlebars HTML-encodes `=` in interpolated href values (?view=sets → ?view&#x3D;sets);
    // browsers decode entities in href values so the link works. Match either form.
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view(?:=|&#x3D;)sets"/);
    expect(res.text).toContain('href="/freestyle/compositional-sets#single-dex-primitives"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view(?:=|&#x3D;)movement-system#movement-axis-set-uptime"/);
    expect(res.text).toContain('href="/freestyle/sets/reference"');
  });

  it('renders the operator-reference cross-link for sets with a registered modifier', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('href="/freestyle/operators#pixie"');
  });

  it('does NOT render the operator-reference cross-link for holden-only sets without a modifier', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/bubba');
    expect(res.text).not.toContain('href="/freestyle/operators#bubba"');
  });

  it('renders the component-mechanics not-a-set reminder', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('Component mechanics');
    expect(res.text).toContain('are body modifiers, not sets');
  });

  it('uses the subtype label as eyebrow text', async () => {
    const pixieRes = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(pixieRes.text).toContain('True core sets');
    const blurryRes = await request(await createApp()).get('/freestyle/sets/blurry');
    expect(blurryRes.text).toContain('Composite / derived sets');
  });
});

describe('routing migration — /freestyle/sets and /freestyle/moves', () => {
  it('/freestyle/sets renders the Set Encyclopedia directly (promoted from 301 redirect 2026-05-25)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Set Encyclopedia');
    expect(res.text).toContain('class="wrapper sets-encyclopedia"');
  });

  it('/freestyle/sets/reference renders the flat Holden reference table directly', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/reference');
    expect(res.status).toBe(200);
    // The flat-reference table content lives in freestyle/moves.hbs
    expect(res.text).toContain('Set Notation');   // page heading region
  });

  it('/freestyle/moves still 301-redirects (now → /freestyle/sets/reference)', async () => {
    const res = await request(await createApp()).get('/freestyle/moves');
    expect(res.status).toBe(301);
    expect(res.header.location).toBe('/freestyle/sets/reference');
  });
});

describe('Set Hub — Phase B activation of detail-page links', () => {
  it('Set Hub cards now render "View set details" links, NOT the Phase A placeholder', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('set-card-detail-link');
    expect(res.text).toContain('View set details');
    expect(res.text).not.toContain('Detail page coming in Phase B.');
    // Spot-check that a detail-href resolves to /freestyle/sets/<slug>
    expect(res.text).toMatch(/href="\/freestyle\/sets\/pixie"/);
  });
});
