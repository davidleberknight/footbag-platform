/**
 * `?view=sets` — Set Hub (Phase A of the set-system refactor, 2026-05-25).
 *
 * Pins:
 *   - Six subtype sections render (true-core, composite-derived, rotational,
 *     whirl-swirl, uns, rooted-antisymposium) when their content arrays are
 *     non-empty
 *   - Cards carry hashtag (#<slug>-set), formula, movement explanation,
 *     source label, derived/related-system links
 *   - Audit status renders when present (aligned / partial / conflict /
 *     holden-only)
 *   - Alt-surfaces are NOT inside the set hub (no surface trick rows; no
 *     "Alternate-surface systems" cohort heading) but the cross-link aside
 *     IS rendered pointing to Movement Systems
 *   - "By set" toggle marker shows active state; Operators & Modifiers NOT
 *     in the toggle nav
 *   - Movement System + Movement Neighborhoods views show their exploratory
 *     status labels (kept from the prior slice)
 *
 * No seeded modifier-link data: the Set Hub renders entirely from the
 * canonical-set content module (freestyleCanonicalSets.ts), not from the
 * dictionary's modifier_links. The test exercises the production content.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3219');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks?view=sets — Set Hub (Phase A)', () => {
  it('returns 200', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
  });

  it('renders "By set" as active in the toggle bar', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('<span class="trick-view-toggle-active">By set</span>');
  });

  it('renders ALL SIX subtype section headings', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('>True core sets<');
    expect(res.text).toContain('>Composite / derived sets<');
    expect(res.text).toContain('>Rotational set systems<');
    expect(res.text).toContain('>Whirl / swirl-derived systems<');
    expect(res.text).toContain('>UNS sets (unusual non-standard entry)<');
    expect(res.text).toContain('>Rooted / antisymposium systems<');
  });

  it('renders one section per subtype with a stable anchor id', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('id="set-subtype-true-core"');
    expect(res.text).toContain('id="set-subtype-composite-derived"');
    expect(res.text).toContain('id="set-subtype-rotational"');
    expect(res.text).toContain('id="set-subtype-whirl-swirl"');
    expect(res.text).toContain('id="set-subtype-uns"');
    expect(res.text).toContain('id="set-subtype-rooted-antisymposium"');
  });

  it('renders canonical set cards with #<slug>-set hashtags', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Spot-check across subtypes — at least one card per subtype carries a
    // hashtag-set chip
    expect(res.text).toContain('#pixie-set');
    expect(res.text).toContain('#blurry-set');
    expect(res.text).toContain('#surging-set');
    expect(res.text).toContain('#whirling-set');
    expect(res.text).toContain('#finchy-set');
    expect(res.text).toContain('#zoid-set');
  });

  it('renders set formula as a code block on each card', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('TOE &gt; SAME IN [DEX] &gt;');         // pixie
    expect(res.text).toContain('CLIP &gt; OP IN [DEX] &gt; OP OUT [DEX] &gt;'); // blurry
  });

  it('renders the movement explanation prose on each card', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Stable substrings from the canonical-set entries
    expect(res.text).toMatch(/Toe set, then a same-side inward dex/);   // pixie
    expect(res.text).toMatch(/Stepping Paradox/);                       // blurry
  });

  it('renders source provenance label on every card', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('set-card-source--platform-tracked');
    expect(res.text).toContain('set-card-source--holden-only');
    expect(res.text).toContain('Platform-tracked');
    expect(res.text).toContain('Holden-only');
  });

  it('renders audit-status label when present', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // aligned (pixie), partial (atomic), conflict (surging), holden-only (bubba)
    expect(res.text).toContain('set-card-audit--aligned');
    expect(res.text).toContain('set-card-audit--partial');
    expect(res.text).toContain('set-card-audit--conflict');
    expect(res.text).toContain('set-card-audit--holden-only');
  });

  it('Phase B: live detail-page links render (no Phase A placeholder)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('set-card-detail-link');
    expect(res.text).toContain('View set details');
    expect(res.text).not.toContain('Detail page coming in Phase B.');
    expect(res.text).toMatch(/href="\/freestyle\/sets\/pixie"/);
  });

  it('alt-surfaces tricks (sole / cloud / head / etc.) are NOT rendered on the set hub', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).not.toContain('id="set-subtype-surface"');
    expect(res.text).not.toContain('>Alternate-surface systems<');
    expect(res.text).not.toContain('id="sets-surface"');
  });

  it('alt-surfaces cross-link aside IS rendered and points to Movement Systems', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('sets-alt-surfaces-cross-link');
    expect(res.text).toContain('Looking for alternate surfaces?');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
    expect(res.text).toContain('View alternative surfaces on Movement Systems');
  });

  it('renders the total-set count in the intro strip', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // 43 canonical sets total: 8 true-core + 11 composite + 9 rotational + 8 whirl/swirl + 5 uns + 2 rooted
    expect(res.text).toMatch(/<strong>43<\/strong> canonical sets across 6 subtypes/);
  });

  it('derived-systems cross-link uses #set-<slug> anchor href', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // pixie lists terraging as a derived system
    expect(res.text).toMatch(/href="#set-terraging"/);
    // stepping lists blurry as a derived system
    expect(res.text).toMatch(/href="#set-blurry"/);
  });
});

describe('GET /freestyle/tricks (other views) — toggle wiring', () => {
  it('"By set" link appears in the toggle on other views as a hyperlink', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('href="/freestyle/tricks?view=sets"');
    expect(res.text).toContain('>By set</a>');
  });

  it('Operators & Modifiers NOT in the toggle row', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const navStart = res.text.indexOf('class="trick-view-toggle"');
    const navEnd = res.text.indexOf('</nav>', navStart);
    const nav = res.text.substring(navStart, navEnd);
    expect(nav).not.toContain('href="/freestyle/operators"');
  });

  it('Operators & Modifiers stays reachable via the toggle aside', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('trick-view-toggle-aside');
    expect(res.text).toContain('href="/freestyle/operators"');
  });

  it('Movement System view shows exploratory label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('browse-view-status-label');
    expect(res.text).toContain('Exploratory / pedagogical');
  });

  it('Movement Neighborhoods view shows exploratory label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('browse-view-status-label');
    expect(res.text).toContain('Exploratory / pedagogical');
  });
});
