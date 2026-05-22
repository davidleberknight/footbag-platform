/**
 * Integration tests for GET /freestyle/modifier/:slug.
 *
 * Pilot scope: spinning modifier only (paradox / ducking remain 404).
 * Verifies:
 *   - /freestyle/modifier/spinning returns 200 with the teaching page
 *   - /freestyle/modifier/paradox returns 404 (not shipped this phase)
 *   - /freestyle/modifier/ducking returns 404
 *   - /freestyle/modifier/garbage-slug returns 404
 *   - Six teaching sections all render (mechanical lead / anchor / diagram /
 *     confusions / progression / cross-base / related modifiers)
 *   - Coach-tone phrases present in mechanical-lead prose
 *   - "The same idea on other bases" framing used (not "Related tricks")
 *   - Diagram placeholder rendered as accessible image-role
 *   - Observational-layer badge + footer rendered
 *   - Progression first step marked as anchor
 *   - Cross-base examples link to detail pages when slug is pilot
 *   - Glossary link present
 *   - Route ordering: /freestyle/modifier/X does NOT collide with
 *     /freestyle/tricks/:slug
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

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed the progression chain on whirl
  insertFreestyleTrick(db, { slug: 'whirl',                    canonical_name: 'whirl',                    adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl',           canonical_name: 'spinning whirl',           adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-symposium-whirl', canonical_name: 'spinning symposium whirl', adds: '5', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'montage',                  canonical_name: 'montage',                  adds: '7', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });

  // Seed cross-base examples
  insertFreestyleTrick(db, { slug: 'spinning-osis',    canonical_name: 'spinning osis',    adds: '4', base_trick: 'osis',          trick_family: 'osis',          category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-torque',  canonical_name: 'spinning torque',  adds: '5', base_trick: 'torque',        trick_family: 'torque',        category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-clipper', canonical_name: 'spinning clipper', adds: '3', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spender',          canonical_name: 'spender',          adds: '6', base_trick: 'blender',       trick_family: 'blender',       category: 'compound' });
  insertFreestyleTrick(db, { slug: 'surge',            canonical_name: 'surge',            adds: '5', base_trick: 'mirage',        trick_family: 'mirage',        category: 'compound' });

  // Paradox progression + cross-base seeds
  insertFreestyleTrick(db, { slug: 'mirage',                  canonical_name: 'mirage',                  adds: '2', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-mirage',          canonical_name: 'paradox mirage',          adds: '3', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-whirl',           canonical_name: 'paradox whirl',           adds: '4', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-symposium-whirl', canonical_name: 'paradox symposium whirl', adds: '5', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-drifter',         canonical_name: 'paradox drifter',         adds: '4', base_trick: 'drifter', trick_family: 'drifter', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-blender',         canonical_name: 'paradox blender',         adds: '5', base_trick: 'blender', trick_family: 'blender', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-torque',          canonical_name: 'paradox torque',          adds: '5', base_trick: 'torque',  trick_family: 'torque',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'blur',                    canonical_name: 'blur',                    adds: '4', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'fury',                    canonical_name: 'fury',                    adds: '5', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });

  // Ducking progression + cross-base seeds
  insertFreestyleTrick(db, { slug: 'butterfly',        canonical_name: 'butterfly',        adds: '3', base_trick: 'butterfly',     trick_family: 'butterfly',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-butterfly', canonical_name: 'ducking butterfly', adds: '4', base_trick: 'butterfly',     trick_family: 'butterfly',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-whirl',     canonical_name: 'ducking whirl',     adds: '4', base_trick: 'whirl',         trick_family: 'whirl',         category: 'compound' });
  insertFreestyleTrick(db, { slug: 'phoenix',           canonical_name: 'phoenix',           adds: '5', base_trick: 'butterfly',     trick_family: 'butterfly',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-clipper',   canonical_name: 'ducking clipper',   adds: '3', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-osis',      canonical_name: 'ducking osis',      adds: '4', base_trick: 'osis',          trick_family: 'osis',          category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mullet',            canonical_name: 'mullet',            adds: '6', base_trick: 'whirl',         trick_family: 'whirl',         category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mind-bender',       canonical_name: 'mind bender',       adds: '6', base_trick: 'torque',        trick_family: 'torque',        category: 'compound' });
  insertFreestyleTrick(db, { slug: 'hatchet',           canonical_name: 'hatchet',           adds: '5', base_trick: 'whirl',         trick_family: 'whirl',         category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/modifier/spinning — happy path', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
  });

  it('renders page title and subtitle', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('Spinning');
    expect(res.text).toMatch(/full-body rotation that carries through the dex moment/);
  });

  it('renders all six teaching sections', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    // 1. Mechanical lead
    expect(res.text).toContain('The body and the motion');
    expect(res.text).toMatch(/Where the motion lives/);
    expect(res.text).toMatch(/When it happens/);
    expect(res.text).toMatch(/What good execution feels like/);
    expect(res.text).toMatch(/What goes wrong/);
    // 2. Anchor sentence
    expect(res.text).toContain('anchor-sentence');
    // 2.5. Diagram placeholder
    expect(res.text).toContain('diagram-placeholder');
    expect(res.text).toMatch(/Diagram planned/);
    // 3. Common confusions
    expect(res.text).toContain('Common confusions');
    expect(res.text).toContain('Spinning vs gyro');
    expect(res.text).toContain('Spinning vs inspin');
    // 4. Progression
    expect(res.text).toMatch(/Progression on whirl/);
    // 5. Cross-base (the agreed phrasing)
    expect(res.text).toContain('The same idea on other bases');
    // 6. Related modifiers
    expect(res.text).toContain('Related modifiers');
  });

  it('uses coach-tone phrases (not engineering-manual phrasing)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    // Spot-check key coach-tone phrases from the authored content
    expect(res.text).toMatch(/carrying the bag through the rotation rather than chasing it/i);
    expect(res.text).toMatch(/There is one motion, not two/);
    expect(res.text).toMatch(/the body opens away from the bag/);
    expect(res.text).toMatch(/path early/);
  });

  it('uses "The same idea on other bases" framing, not "Related tricks"', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('The same idea on other bases');
    // Page must NOT use the old taxonomy framing
    expect(res.text).not.toMatch(/<h2>Related Tricks<\/h2>/);
    expect(res.text).not.toMatch(/<h2>Family Variants<\/h2>/);
    expect(res.text).not.toMatch(/<h2>Modifier Applications<\/h2>/);
  });

  it('renders progression chain with anchor flag on step 1', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('modifier-step-1-whirl');
    expect(res.text).toContain('modifier-step-2-spinning-whirl');
    expect(res.text).toContain('modifier-step-3-spinning-symposium-whirl');
    expect(res.text).toContain('modifier-step-4-montage');
    // Anchor class applies once
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders progression steps in fixed order', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    const idxWhirl   = res.text.indexOf('modifier-step-1-whirl');
    const idxSpin    = res.text.indexOf('modifier-step-2-spinning-whirl');
    const idxSymp    = res.text.indexOf('modifier-step-3-spinning-symposium-whirl');
    const idxMontage = res.text.indexOf('modifier-step-4-montage');
    expect(idxWhirl).toBeGreaterThan(-1);
    expect(idxSpin).toBeGreaterThan(idxWhirl);
    expect(idxSymp).toBeGreaterThan(idxSpin);
    expect(idxMontage).toBeGreaterThan(idxSymp);
  });

  it('renders cross-base examples with detail links and base labels', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('href="/freestyle/tricks/spinning-osis"');
    expect(res.text).toContain('href="/freestyle/tricks/spinning-torque"');
    expect(res.text).toContain('href="/freestyle/tricks/spinning-clipper"');
    expect(res.text).toContain('href="/freestyle/tricks/spender"');
    expect(res.text).toContain('href="/freestyle/tricks/surge"');
    expect(res.text).toContain('on osis base');
    expect(res.text).toContain('on torque base');
    expect(res.text).toContain('on mirage base');
  });

  it('renders related modifiers list', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('related-modifiers-list');
    expect(res.text).toContain('gyro');
    expect(res.text).toContain('inspinning');
    expect(res.text).toContain('paradox');
    expect(res.text).toContain('symposium');
  });

  it('observational-layer footer rendered', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text.toLowerCase()).toContain('observational');
    expect(res.text).toContain('symbolic-layer-footer');
    expect(res.text).toMatch(/does not change canonical IFPA family classifications/i);
  });

  it('renders glossary link deep-linking to the §13 spinning connective panel', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('href="/freestyle/glossary#glossary-panel-spinning"');
  });

  it('breadcrumb back to /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toMatch(/href="\/freestyle">Freestyle</);
  });
});

describe('GET /freestyle/modifier/paradox — happy path', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.status).toBe(200);
  });

  it('renders page title and subtitle', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('Paradox');
    expect(res.text).toMatch(/hip pivot between two dexes/);
  });

  it('renders all six teaching sections', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('The body and the motion');
    expect(res.text).toContain('anchor-sentence');
    expect(res.text).toContain('diagram-placeholder');
    expect(res.text).toContain('Common confusions');
    expect(res.text).toContain('Paradox vs xdex');
    expect(res.text).toContain('Paradox vs symposium');
    expect(res.text).toContain('Paradox vs spinning');
    expect(res.text).toMatch(/Progression on mirage/);
    expect(res.text).toContain('The same idea on other bases');
    expect(res.text).toContain('Related modifiers');
  });

  it('uses coach-tone phrases (not engineering-manual phrasing)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toMatch(/in the gap/i);
    expect(res.text).toMatch(/leaves and returns to the same foot/i);
    expect(res.text).toMatch(/two distinct contact moments/i);
  });

  it('renders progression chain with anchor flag on mirage step', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('modifier-step-1-mirage');
    expect(res.text).toContain('modifier-step-2-paradox-mirage');
    expect(res.text).toContain('modifier-step-3-paradox-whirl');
    expect(res.text).toContain('modifier-step-4-paradox-symposium-whirl');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders cross-base examples including folk-name compounds (blur, fury)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('href="/freestyle/tricks/paradox-drifter"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox-blender"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox-torque"');
    expect(res.text).toContain('href="/freestyle/tricks/blur"');
    expect(res.text).toContain('href="/freestyle/tricks/fury"');
  });

  it('renders related modifiers list with xdex / symposium / atomic / stepping', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('related-modifiers-list');
    expect(res.text).toContain('xdex');
    expect(res.text).toContain('symposium');
    expect(res.text).toContain('atomic');
    expect(res.text).toContain('stepping');
  });

  it('observational-layer footer rendered', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text.toLowerCase()).toContain('observational');
    expect(res.text).toContain('symbolic-layer-footer');
  });

  it('renders cross-link footer to walking-progression and /freestyle/learn', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('symbolic-crosslinks');
    expect(res.text).toContain('href="/freestyle/progression/walking-family"');
    expect(res.text).toContain('href="/freestyle/learn"');
  });
});

describe('GET /freestyle/modifier/ducking — happy path', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.status).toBe(200);
  });

  it('renders page title and subtitle', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('Ducking');
    expect(res.text).toMatch(/head dip that lets the bag pass around the neck/);
  });

  it('renders all six teaching sections', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('The body and the motion');
    expect(res.text).toContain('anchor-sentence');
    expect(res.text).toContain('diagram-placeholder');
    expect(res.text).toContain('Common confusions');
    expect(res.text).toContain('The four head-motion siblings');
    expect(res.text).toContain('Ducking vs other body modifiers');
    expect(res.text).toContain('Ducking as a hidden modifier');
    expect(res.text).toMatch(/Progression on butterfly/);
    expect(res.text).toContain('The same idea on other bases');
    expect(res.text).toContain('Related modifiers');
  });

  it('renders the 2×2 head-motion family explanation', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    // The "=" character in the source prose renders as &#x3D; via Handlebars escaping;
    // assert on the descriptive phrases on either side instead of the literal equals sign.
    expect(res.text).toMatch(/Weaving.*head toward bag, bag same side/i);
    expect(res.text).toMatch(/Diving.*head over and under bag, bag same side/i);
    expect(res.text).toMatch(/Zulu.*head over and under bag, bag opposite/i);
  });

  it('uses coach-tone phrases (not engineering-manual phrasing)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toMatch(/passes around the neck/i);
    expect(res.text).toMatch(/dips out of the bag/i);
    expect(res.text).toMatch(/has to be local to the head/i);
  });

  it('renders progression chain with anchor flag on butterfly step', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('modifier-step-1-butterfly');
    expect(res.text).toContain('modifier-step-2-ducking-butterfly');
    expect(res.text).toContain('modifier-step-3-ducking-whirl');
    expect(res.text).toContain('modifier-step-4-phoenix');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders cross-base examples including folk-name compounds (phoenix-already-progression, mullet, mind-bender, hatchet)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('href="/freestyle/tricks/ducking-clipper"');
    expect(res.text).toContain('href="/freestyle/tricks/ducking-osis"');
    expect(res.text).toContain('href="/freestyle/tricks/mullet"');
    expect(res.text).toContain('href="/freestyle/tricks/mind-bender"');
    expect(res.text).toContain('href="/freestyle/tricks/hatchet"');
  });

  it('renders related modifiers list with weaving / diving / zulu / alpine', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('related-modifiers-list');
    expect(res.text).toContain('weaving');
    expect(res.text).toContain('diving');
    expect(res.text).toContain('zulu');
    expect(res.text).toContain('alpine');
  });

  it('observational-layer footer rendered', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text.toLowerCase()).toContain('observational');
    expect(res.text).toContain('symbolic-layer-footer');
  });

  it('renders cross-link footer to walking-progression and /freestyle/learn', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('symbolic-crosslinks');
    expect(res.text).toContain('href="/freestyle/progression/walking-family"');
    expect(res.text).toContain('href="/freestyle/learn"');
  });
});

describe('GET /freestyle/modifier/:slug — 404 paths', () => {
  it('returns 404 for unknown slug', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/garbage-slug');
    expect(res.status).toBe(404);
  });
});

describe('GET /freestyle/modifier/:slug — route ordering', () => {
  it('does not collide with /freestyle/tricks/:slug', async () => {
    // Sanity: the modifier route is registered before the trick-detail route
    // in publicRoutes.ts.
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    // The page does NOT use trick-shell.hbs
    expect(res.text).not.toContain('trick-shell');
    expect(res.text).toContain('symbolic-modifier-family');
  });
});
