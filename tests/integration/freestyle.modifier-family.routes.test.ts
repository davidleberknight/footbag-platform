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

  // Gyro concept-first page uses underscore slugs (matching the real DB).
  insertFreestyleTrick(db, { slug: 'gyro_mirage',          canonical_name: 'gyro mirage',          adds: '3', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'gyro_whirl',           canonical_name: 'gyro whirl',           adds: '4', base_trick: 'whirl',   trick_family: 'whirl',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'gyro_eggbeater',       canonical_name: 'gyro eggbeater',       adds: '4', base_trick: 'eggbeater', trick_family: 'eggbeater', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'gyro_symposium_mirage', canonical_name: 'gyro symposium mirage', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'gyro_symposium_whirl',  canonical_name: 'gyro symposium whirl',  adds: '5', base_trick: 'whirl',  trick_family: 'whirl',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mobius',               canonical_name: 'mobius',               adds: '5', base_trick: 'torque',  trick_family: 'torque',  category: 'compound' });

  // Diving concept-first page (sister of ducking) uses underscore slugs.
  insertFreestyleTrick(db, { slug: 'diving_butterfly',       canonical_name: 'diving butterfly',       adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'diving_whirl',           canonical_name: 'diving whirl',           adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'darkwalk',               canonical_name: 'darkwalk',               adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'diving_mirage',          canonical_name: 'diving mirage',          adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'diving_drifter',         canonical_name: 'diving drifter',         adds: '4', base_trick: 'drifter',   trick_family: 'drifter',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'stepping_diving_mirage', canonical_name: 'stepping diving mirage', adds: '4', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tapping_diving_mirage',  canonical_name: 'tapping diving mirage',  adds: '4', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });

  // Tapping concept-first page (a dexterity-tap operator) uses underscore slugs.
  insertFreestyleTrick(db, { slug: 'tapping_butterfly',       canonical_name: 'tapping butterfly',       adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tapping_whirl',           canonical_name: 'tapping whirl',           adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tapping_double_leg_over', canonical_name: 'tapping double leg over', adds: '4', base_trick: 'double-leg-over', trick_family: 'double_leg_over', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tapping_mirage',          canonical_name: 'tapping mirage',          adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tapping_clipper',         canonical_name: 'tapping clipper',         adds: '3', base_trick: 'clipper',   trick_family: 'clipper',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tapping_legover',         canonical_name: 'tapping legover',         adds: '3', base_trick: 'legover',   trick_family: 'legover',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tapping_drifter',         canonical_name: 'tapping drifter',         adds: '4', base_trick: 'drifter',   trick_family: 'drifter',   category: 'compound' });

  // Inspinning concept-first page (closely related rotational operator) uses underscore slugs.
  insertFreestyleTrick(db, { slug: 'inspinning_mirage',         canonical_name: 'inspinning mirage',         adds: '3', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'inspinning_clipper',        canonical_name: 'inspinning clipper',        adds: '3', base_trick: 'clipper', trick_family: 'clipper', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'inspinning_legover',        canonical_name: 'inspinning legover',        adds: '3', base_trick: 'legover', trick_family: 'legover', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'inspinning_butterfly',      canonical_name: 'inspinning butterfly',      adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'inspinning_paradox_mirage', canonical_name: 'inspinning paradox mirage', adds: '4', base_trick: 'mirage',  trick_family: 'mirage',  category: 'compound' });

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
    expect(res.text).toMatch(/closely related rotational operators/);
    expect(res.text).not.toMatch(/rotational family/);
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

describe('GET /freestyle/modifier/diving — sister operator of ducking', () => {
  it('renders page title and subtitle (over-the-bag framing, complement of ducking)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/diving');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Diving');
    expect(res.text).toMatch(/body operator/);
    expect(res.text).toMatch(/the bag passes over the player/);
  });

  it('renders the concept-first sections, parallel to ducking', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/diving');
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
  });

  it('teaches DIVE [BOD], the same notation as ducking, differing only in path', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/diving');
    expect(res.text).toContain('DIVE [BOD]');
    expect(res.text).toMatch(/comes from the body movement itself, not from a dexterity, a delay, or a body relationship/);
    expect(res.text).toMatch(/shares this notation with ducking/);
  });

  it('renders the defining distinction and the diving-vs-ducking confusion', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/diving');
    expect(res.text).toContain('Diving vs ducking');
    expect(res.text).toContain('Diving operator vs the ducking-family sets');
    expect(res.text).toContain('Diving vs alpine');
    expect(res.text).toContain('Body event vs dexterity');
    expect(res.text).toContain('Diving does not replace the base trick');
    expect(res.text).toMatch(/the bag passes over the player/);
  });

  it('renders progression with anchor on butterfly, landing on the Pixie Diving Butterfly (darkwalk)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/diving');
    expect(res.text).toContain('modifier-step-1-butterfly');
    expect(res.text).toContain('modifier-step-2-diving_butterfly');
    expect(res.text).toContain('modifier-step-3-diving_whirl');
    expect(res.text).toContain('modifier-step-4-darkwalk');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders representative examples as clickable links, including the Alpine Tap pattern', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/diving');
    expect(res.text).toContain('href="/freestyle/tricks/diving_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/diving_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/diving_drifter"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_diving_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/tapping_diving_mirage"');
    for (const cat of ['Basic dex', 'Whirl family', 'Cross-body', 'Multiple operators', 'Alpine pattern (folk naming)']) {
      expect(res.text).toContain(cat);
    }
  });

  it('renders related concepts including ducking (the sister) and the shared family', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/diving');
    expect(res.text).toContain('related-modifiers-list');
    for (const name of ['ducking', 'zulu', 'weaving', 'alpine', 'spinning', 'paradox', 'symposium']) {
      expect(res.text).toContain(name);
    }
  });
});

describe('GET /freestyle/modifier/tapping — a +1 midtime-body modifier (canonical doctrine)', () => {
  it('renders title and subtitle framing tapping as a +1 modifier that adds a quick tap', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/tapping');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tapping');
    expect(res.text).toMatch(/adds a quick tap ahead of the base/);
  });

  it('renders the concept-first sections', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/tapping');
    for (const h of ['What it is', 'Why it exists', 'How it changes the base trick', 'JOB notation',
      'Where it appears', 'How it composes', 'Representative examples', 'Common confusions',
      'Related concepts', 'Execution notes']) {
      expect(res.text).toContain(`<h2>${h}</h2>`);
    }
  });

  it('reconciles the tap: written as a toe-set dex, scored as a +1 modifier', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/tapping');
    expect(res.text).toMatch(/TOE &gt; OP OUT \[DEX\]/);
    expect(res.text).toMatch(/scored as a \+1 modifier on the trick, not as an extra dex folded into the base/);
    expect(res.text).toMatch(/tapping\(\+1\) \+ mirage\(2\)/);
  });

  it('teaches tapping as a +1 modifier and keeps the Holden set reading historical', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/tapping');
    expect(res.text).toContain('Is the tap a dexterity or a modifier?');
    expect(res.text).toContain('Tapping vs its Holden set reading');
    expect(res.text).toContain('Tapping vs slapping');
    expect(res.text).toContain('Tapping does not replace the base trick');
    expect(res.text).toMatch(/Atomic same-side/);
  });

  it('renders progression and clickable representative examples across families', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/tapping');
    expect(res.text).toContain('modifier-step-1-butterfly');
    expect(res.text).toContain('modifier-step-2-tapping_butterfly');
    expect(res.text).toContain('href="/freestyle/tricks/tapping_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/tapping_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/tapping_clipper"');
    expect(res.text).toContain('href="/freestyle/tricks/tapping_legover"');
    expect(res.text).toContain('href="/freestyle/tricks/tapping_drifter"');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders related concepts including the body-operator contrast and toe-set kin', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/tapping');
    expect(res.text).toContain('related-modifiers-list');
    for (const name of ['ducking', 'diving', 'slapping', 'quantum', 'atomic', 'stepping']) {
      expect(res.text).toContain(name);
    }
  });
});

describe('GET /freestyle/modifier/inspinning — closely related rotational operator (finishes the trio)', () => {
  it('renders title and forward-rotation subtitle', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/inspinning');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Inspinning');
    expect(res.text).toMatch(/rotational operator/);
    expect(res.text).toMatch(/chest passing the bag first/);
  });

  it('renders the concept-first sections', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/inspinning');
    for (const h of ['What it is', 'Why it exists', 'How it changes the base trick', 'JOB notation',
      'Where it appears', 'How it composes', 'Representative examples', 'Common confusions',
      'Related concepts', 'Execution notes']) {
      expect(res.text).toContain(`<h2>${h}</h2>`);
    }
  });

  it('teaches SPIN [BOD] as the shared rotational token, distinguished by direction', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/inspinning');
    expect(res.text).toContain('SPIN [BOD]');
    expect(res.text).toMatch(/the chest passes the bag first, where spinning by default passes the back first/);
  });

  it('uses "closely related rotational operators" framing, never "rotational family"', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/inspinning');
    expect(res.text).toMatch(/closely related rotational operators/);
    expect(res.text).not.toMatch(/rotational family/);
    expect(res.text).toContain('Inspinning vs spinning');
    expect(res.text).toContain('Inspinning vs gyro');
    expect(res.text).toContain('Inspinning does not replace the base trick');
  });

  it('renders progression and clickable representative examples across families', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/inspinning');
    expect(res.text).toContain('modifier-step-1-mirage');
    expect(res.text).toContain('modifier-step-2-inspinning_mirage');
    expect(res.text).toContain('href="/freestyle/tricks/inspinning_clipper"');
    expect(res.text).toContain('href="/freestyle/tricks/inspinning_legover"');
    expect(res.text).toContain('href="/freestyle/tricks/inspinning_butterfly"');
    expect(res.text).toContain('href="/freestyle/tricks/inspinning_paradox_mirage"');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders related concepts including spinning and gyro (the rotational trio)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/inspinning');
    expect(res.text).toContain('related-modifiers-list');
    for (const name of ['spinning', 'gyro', 'paradox', 'symposium', 'ducking', 'whirling', 'swirling']) {
      expect(res.text).toContain(name);
    }
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

describe('GET /freestyle/modifier/gyro — concept-first (Tier-1, closely related rotational operators)', () => {
  it('renders page title and subtitle (structural rotational framing)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/gyro');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Gyro');
    expect(res.text).toMatch(/rotational operator/);
    expect(res.text).toMatch(/changes the body.{0,8}orientation during a trick/);
  });

  it('renders the full 11-section concept-first template, concept before execution', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/gyro');
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

  it('teaches SPIN [BOD] and the gyro-vs-spinning orientation distinction', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/gyro');
    expect(res.text).toContain('SPIN [BOD]');
    // Gyro flips the leading dex to SAME where spinning leaves it OP.
    expect(res.text).toMatch(/gyro mirage reads SAME IN \[DEX\] where spinning mirage reads OP IN \[DEX\]/);
  });

  it('frames gyro/spinning/inspinning as closely related rotational operators', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/gyro');
    expect(res.text).toContain('Gyro vs spinning');
    expect(res.text).toContain('Gyro vs inspinning');
    expect(res.text).toContain('Rotation vs dexterity');
    expect(res.text).toContain('Gyro does not replace the base trick');
    // The dex-less collapse is a highlighted structural insight in How it composes,
    // not a common confusion.
    expect(res.text).not.toContain('Gyro and spinning collapse on a dex-less base');
    expect(res.text).toMatch(/closely related rotational operators/);
    expect(res.text).toMatch(/gyro and spinning resolve to the same structure/);
  });

  it('renders progression with anchor on whirl (underscore slugs)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/gyro');
    expect(res.text).toContain('modifier-step-1-whirl');
    expect(res.text).toContain('modifier-step-2-gyro_whirl');
    expect(res.text).toContain('modifier-step-3-gyro_symposium_whirl');
    expect(res.text).toContain('modifier-step-4-gyro_ducking_symposium_torque');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders representative examples as clickable links, organized by category', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/gyro');
    expect(res.text).toContain('href="/freestyle/tricks/gyro_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/gyro_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/gyro_eggbeater"');
    expect(res.text).toContain('href="/freestyle/tricks/gyro_symposium_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/mobius"');
    for (const cat of ['Basic dex', 'Whirl family', 'Cross-body', 'Multiple operators', 'Recognizable named trick']) {
      expect(res.text).toContain(cat);
    }
  });

  it('renders related concepts including the closely related rotational operators', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/gyro');
    expect(res.text).toContain('related-modifiers-list');
    for (const name of ['spinning', 'inspinning', 'paradox', 'symposium', 'ducking', 'whirling', 'swirling']) {
      expect(res.text).toContain(name);
    }
  });
});

describe('GET /freestyle/modifier/stepping — a set, taught in the Set Encyclopedia', () => {
  it('permanently redirects the modifier route to the set page (a set is a launch, not a modifier)', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/stepping');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/stepping');
  });
});
