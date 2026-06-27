/**
 * Integration tests for GET /freestyle/modifier/:slug.
 *
 * The spinning, paradox, and ducking modifier pages all ship and return 200;
 * any unknown slug returns 404.
 * Verifies:
 *   - /freestyle/modifier/spinning returns 200 with the teaching page
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

  // Spinning concept-first page uses underscore slugs (matching the real DB).
  insertFreestyleTrick(db, { slug: 'spinning_mirage',          canonical_name: 'spinning mirage',          adds: '3', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning_whirl',           canonical_name: 'spinning whirl',           adds: '4', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning_drifter',         canonical_name: 'spinning drifter',         adds: '4', base_trick: 'drifter', trick_family: 'drifter', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning_symposium_whirl', canonical_name: 'spinning symposium whirl', adds: '5', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound' });

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

  // Paradox concept-first page uses underscore slugs (matching the real DB) so
  // its representative examples are clickable.
  insertFreestyleTrick(db, { slug: 'paradox_mirage',          canonical_name: 'paradox mirage',          adds: '3', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox_whirl',           canonical_name: 'paradox whirl',           adds: '4', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox_drifter',         canonical_name: 'paradox drifter',         adds: '4', base_trick: 'drifter', trick_family: 'drifter', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox_symposium_whirl', canonical_name: 'paradox symposium whirl', adds: '5', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'food_processor',          canonical_name: 'food processor',          adds: '6', base_trick: 'blender', trick_family: 'blender', category: 'compound' });

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

  // Ducking concept-first page uses underscore slugs (matching the real DB).
  insertFreestyleTrick(db, { slug: 'ducking_mirage',                canonical_name: 'ducking mirage',                adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking_butterfly',             canonical_name: 'ducking butterfly',             adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking_whirl',                 canonical_name: 'ducking whirl',                 adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking_drifter',               canonical_name: 'ducking drifter',               adds: '4', base_trick: 'drifter',   trick_family: 'drifter',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mind_bender',                   canonical_name: 'mind bender',                   adds: '6', base_trick: 'blender',   trick_family: 'blender',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'gyro_ducking_symposium_torque', canonical_name: 'gyro ducking symposium torque', adds: '7', base_trick: 'torque',    trick_family: 'torque',    category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/modifier/spinning — happy path', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
  });

  it('renders page title and subtitle (structural framing, not "turning around")', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('Spinning');
    expect(res.text).toMatch(/body-rotation operator/);
    expect(res.text).toMatch(/the underlying dexterity unchanged/);
  });

  it('renders the concept-first sections, teaching the concept before execution', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('<h2>What it is</h2>');
    expect(res.text).toContain('<h2>Why it exists</h2>');
    expect(res.text).toContain('<h2>How it changes the base trick</h2>');
    expect(res.text).toContain('<h2>JOB notation</h2>');
    expect(res.text).toContain('<h2>Where it appears</h2>');
    expect(res.text).toContain('<h2>How it composes</h2>');
    expect(res.text).toContain('<h2>Representative examples</h2>');
    expect(res.text).toContain('<h2>Common confusions</h2>');
    expect(res.text).toContain('<h2>Related concepts</h2>');
    expect(res.text).toContain('<h2>Execution notes</h2>');
    expect(res.text.indexOf('<h2>What it is</h2>')).toBeLessThan(res.text.indexOf('<h2>Execution notes</h2>'));
    expect(res.text).not.toContain('The body and the motion');
  });

  it('teaches the SPIN [BOD] notation as a scored body event', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('SPIN [BOD]');
    expect(res.text).toContain('(back) SPIN [BOD]');
    expect(res.text).toMatch(/comes from the rotation itself, not from introducing another dexterity, delay, or body relationship/);
  });

  it('renders the required common confusions, framing gyro/inspinning as variants', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('Spinning vs gyro');
    expect(res.text).toContain('Spinning vs inspinning');
    expect(res.text).toContain('Rotation vs dexterity');
    expect(res.text).toContain('Body event vs body orientation');
    expect(res.text).toContain('Spinning does not replace the base trick');
    expect(res.text).toMatch(/members of one rotational family/);
    expect(res.text).not.toMatch(/half-rotation variant/);
  });

  it('renders progression chain with anchor flag on step 1 (underscore slugs, fixed order)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('modifier-step-1-whirl');
    expect(res.text).toContain('modifier-step-2-spinning_whirl');
    expect(res.text).toContain('modifier-step-3-spinning_symposium_whirl');
    expect(res.text).toContain('modifier-step-4-montage');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
    const idxWhirl   = res.text.indexOf('modifier-step-1-whirl');
    const idxSpin    = res.text.indexOf('modifier-step-2-spinning_whirl');
    const idxSymp    = res.text.indexOf('modifier-step-3-spinning_symposium_whirl');
    const idxMontage = res.text.indexOf('modifier-step-4-montage');
    expect(idxSpin).toBeGreaterThan(idxWhirl);
    expect(idxSymp).toBeGreaterThan(idxSpin);
    expect(idxMontage).toBeGreaterThan(idxSymp);
  });

  it('renders representative examples as clickable links, organized by category', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('href="/freestyle/tricks/spinning_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/spinning_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/spinning_drifter"');
    expect(res.text).toContain('href="/freestyle/tricks/spinning_symposium_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/montage"');
    for (const cat of ['Basic dex', 'Whirl family', 'Cross-body', 'Multiple operators', 'Advanced composition']) {
      expect(res.text).toContain(cat);
    }
  });

  it('renders related concepts including the directional variants and sibling rotations', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('related-modifiers-list');
    for (const name of ['gyro', 'inspinning', 'paradox', 'symposium', 'ducking', 'whirling', 'swirling']) {
      expect(res.text).toContain(name);
    }
  });

  it('disclaimer footer rendered', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.text).toContain('symbolic-layer-footer');
    expect(res.text).toMatch(/does not change the official IFPA family classifications/i);
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

  it('renders page title and subtitle (definition framing, not a formula)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('Paradox');
    expect(res.text).toMatch(/changes the relationship between the body, the support leg, and the dexterity/);
  });

  it('renders the concept-first sections, teaching the concept before execution', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('<h2>What it is</h2>');
    expect(res.text).toContain('<h2>Why it exists</h2>');
    expect(res.text).toContain('<h2>How it changes the base trick</h2>');
    expect(res.text).toContain('<h2>JOB notation</h2>');
    expect(res.text).toContain('<h2>Where it appears</h2>');
    expect(res.text).toContain('<h2>How it composes</h2>');
    expect(res.text).toContain('<h2>Representative examples</h2>');
    expect(res.text).toContain('<h2>Common confusions</h2>');
    expect(res.text).toContain('<h2>Related concepts</h2>');
    expect(res.text).toContain('<h2>Execution notes</h2>');
    // Definition precedes execution notes; not the legacy mechanical-lead layout.
    expect(res.text.indexOf('<h2>What it is</h2>')).toBeLessThan(res.text.indexOf('<h2>Execution notes</h2>'));
    expect(res.text).not.toContain('The body and the motion');
  });

  it('teaches the [PDX] notation and distinguishes it from [XBD] and [XDEX]', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('[PDX]');
    expect(res.text).toContain('[XBD]');
    expect(res.text).toContain('[XDEX]');
    // The entry formula appears only as the canonical example, with the mid-trick caveat.
    expect(res.text).toContain('CLIP &gt; OP IN [DEX]');
    expect(res.text).toMatch(/canonical paradox entry example/);
    expect(res.text).toMatch(/mid-trick/);
  });

  it('renders the required common confusions', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('Paradox vs cross-body ([XBD])');
    expect(res.text).toContain('Paradox vs X-Dex');
    expect(res.text).toContain('Paradox vs same-side and opposite-side');
    expect(res.text).toContain('The entry example is not the definition');
  });

  it('renders progression chain with anchor flag on mirage step (underscore slugs)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('modifier-step-1-mirage');
    expect(res.text).toContain('modifier-step-2-paradox_mirage');
    expect(res.text).toContain('modifier-step-3-paradox_whirl');
    expect(res.text).toContain('modifier-step-4-paradox_symposium_whirl');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders representative examples as clickable links, organized by category', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('href="/freestyle/tricks/paradox_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox_drifter"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox_symposium_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/food_processor"');
    for (const cat of ['Basic dex', 'Whirl family', 'Cross-body', 'Multiple operators', 'Advanced composition']) {
      expect(res.text).toContain(cat);
    }
  });

  it('renders related concepts cross-linking the canonical surfaces', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('related-modifiers-list');
    for (const name of ['symposium', 'atomic', 'miraging', 'nuclear', 'x-dex', 'cross-body delay', 'whirl', 'mirage']) {
      expect(res.text).toContain(name);
    }
  });

  it('disclaimer footer rendered', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.text).toContain('symbolic-layer-footer');
    expect(res.text).toMatch(/does not change the official IFPA family classifications/i);
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

  it('renders page title and subtitle (bag-path framing, not "lowering the head")', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('Ducking');
    expect(res.text).toMatch(/body operator/);
    expect(res.text).toMatch(/passes beneath the bag/);
  });

  it('renders the concept-first sections, teaching the concept before execution', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('<h2>What it is</h2>');
    expect(res.text).toContain('<h2>Why it exists</h2>');
    expect(res.text).toContain('<h2>How it changes the base trick</h2>');
    expect(res.text).toContain('<h2>JOB notation</h2>');
    expect(res.text).toContain('<h2>Where it appears</h2>');
    expect(res.text).toContain('<h2>How it composes</h2>');
    expect(res.text).toContain('<h2>Representative examples</h2>');
    expect(res.text).toContain('<h2>Common confusions</h2>');
    expect(res.text).toContain('<h2>Related concepts</h2>');
    expect(res.text).toContain('<h2>Execution notes</h2>');
    expect(res.text.indexOf('<h2>What it is</h2>')).toBeLessThan(res.text.indexOf('<h2>Execution notes</h2>'));
    expect(res.text).not.toContain('The body and the motion');
  });

  it('teaches the DUCK [BOD] notation as a scored body event, not merely a head movement', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('DUCK [BOD]');
    expect(res.text).toMatch(/comes from the body movement itself, not from a dexterity, a delay, or a body relationship/);
    expect(res.text).toMatch(/merely a head movement/);
  });

  it('renders the required common confusions, with the ducking family doctrine', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('Ducking vs diving');
    expect(res.text).toContain('Ducking operator vs zulu and weaving sets');
    expect(res.text).toContain('Ducking vs alpine');
    expect(res.text).toContain('Body event vs dexterity');
    expect(res.text).toContain('Ducking does not replace the base trick');
    // Zulu/weaving are launch sets whose launch incorporates ducking; Alpine is a naming convention.
    expect(res.text).toMatch(/launch sets whose launch incorporates the ducking body movement/);
    expect(res.text).toMatch(/Alpine is not another body operator/);
  });

  it('renders progression chain with anchor flag on butterfly step (underscore slugs)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('modifier-step-1-butterfly');
    expect(res.text).toContain('modifier-step-2-ducking_butterfly');
    expect(res.text).toContain('modifier-step-3-ducking_whirl');
    expect(res.text).toContain('modifier-step-4-phoenix');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders representative examples as clickable links, including a folk Alpine pattern', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('href="/freestyle/tricks/ducking_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/ducking_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/ducking_drifter"');
    expect(res.text).toContain('href="/freestyle/tricks/mind_bender"');
    expect(res.text).toContain('href="/freestyle/tricks/gyro_ducking_symposium_torque"');
    for (const cat of ['Basic dex', 'Whirl family', 'Cross-body', 'Multiple operators', 'Alpine pattern (folk naming)']) {
      expect(res.text).toContain(cat);
    }
  });

  it('renders related concepts including the ducking family and Alpine as a folk label', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('related-modifiers-list');
    for (const name of ['diving', 'zulu', 'weaving', 'alpine', 'spinning', 'paradox', 'symposium']) {
      expect(res.text).toContain(name);
    }
  });

  it('disclaimer footer rendered', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.text).toContain('symbolic-layer-footer');
    expect(res.text).toMatch(/does not change the official IFPA family classifications/i);
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

describe('GET /freestyle/modifier/symposium — concept-first frozen template', () => {
  it('renders the concept-first sections, teaching the concept before execution', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/symposium');
    expect(res.status).toBe(200);
    // Concept-first section order: definition before execution.
    expect(res.text).toContain('<h2>What it is</h2>');
    expect(res.text).toContain('<h2>Why it exists</h2>');
    expect(res.text).toContain('<h2>How it changes the base trick</h2>');
    expect(res.text).toContain('<h2>JOB notation</h2>');
    expect(res.text).toContain('<h2>Where it appears</h2>');
    expect(res.text).toContain('<h2>How it composes</h2>');
    expect(res.text).toContain('<h2>Representative examples</h2>');
    expect(res.text).toContain('<h2>Related concepts</h2>');
    expect(res.text).toContain('<h2>Execution notes</h2>');
    // Definition appears before the execution notes in the document.
    expect(res.text.indexOf('<h2>What it is</h2>')).toBeLessThan(res.text.indexOf('<h2>Execution notes</h2>'));
    // It does NOT use the legacy mechanical-lead layout.
    expect(res.text).not.toContain('The body and the motion');
  });
});
