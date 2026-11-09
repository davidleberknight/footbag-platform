/**
 * Integration tests for GET /freestyle/modifier/:slug.
 *
 * Verifies:
 *   - Every teaching page shows its own definition, a progression numbered from
 *     an anchor on step 1, resolved links for each step and example, related
 *     concepts, its own Concepts link and a breadcrumb, within its page budget
 *   - /freestyle/modifier/garbage-slug returns 404
 *   - The legacy mechanical-lead layout is not rendered
 *   - Route ordering: /freestyle/modifier/X does NOT collide with
 *     /freestyle/tricks/:slug
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Handlebars from 'handlebars';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';
import { getTier1OperatorDefinition } from '../../src/content/freestyleOperatorReference';
import { conceptsHrefForTerm } from '../../src/services/conceptsAnchors';

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const TEACHING_SLUGS = ['spinning', 'paradox', 'ducking', 'diving', 'symposium', 'gyro', 'tapping', 'inspinning'];

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

  // Symposium concept-first page uses underscore slugs.
  insertFreestyleTrick(db, { slug: 'symposium_mirage',    canonical_name: 'symposium mirage',    adds: '3', base_trick: 'mirage',    trick_family: 'mirage',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium_whirl',     canonical_name: 'symposium whirl',     adds: '4', base_trick: 'whirl',     trick_family: 'whirl',   category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium_torque',    canonical_name: 'symposium torque',    adds: '5', base_trick: 'torque',    trick_family: 'torque',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium_eggbeater', canonical_name: 'symposium eggbeater', adds: '4', base_trick: 'eggbeater', trick_family: 'legover', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'witchdoctor',         canonical_name: 'witchdoctor',         adds: '6', base_trick: 'whirl',     trick_family: 'whirl',   category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/modifier/spinning — happy path', () => {
  // Defect caught: the teaching page carries no hashtag, while the stub and the
  // operators index show the modifier's role-aware tag, so the same modifier
  // reads with an identity on one surface and none on another.
  it('carries the role-aware operator hashtag in its media line', async () => {
    const res = await page('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    const mediaLine = res.text.match(/<p class="media-line"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(mediaLine).toContain('#operator_spinning');
  });
});

describe('GET /freestyle/modifier/paradox — happy path', () => {
  it('carries the prominent working-model caveat: our consistent reading, not universal community consensus', async () => {
    const res = await page('/freestyle/modifier/paradox');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/working model this encyclopedia uses for consistent notation and indexing/);
    // The caveat is paradox-specific; pages whose doctrine is settled carry none.
    const spinning = await page('/freestyle/modifier/spinning');
    expect(spinning.text).not.toContain('working model this encyclopedia uses');
  });
});

describe('GET /freestyle/modifier/:slug — every teaching page shows its own content', () => {
  // Each case names every miss, so one broken field does not hide the others.

  // Defect caught: a page losing its definition, looking one up under the wrong
  // modifier, or showing another modifier's page.
  it('teaches each modifier from its own definition, under its own title', async () => {
    const problems: string[] = [];
    for (const slug of TEACHING_SLUGS) {
      const res = await page(`/freestyle/modifier/${slug}`);
      expect(res.status, slug).toBe(200);
      expect(res.text, slug).not.toContain('The body and the motion');
      const definition = /aria-label="What it is">\s*<div class="section-heading"><h2>What it is<\/h2><\/div>\s*<p>([^<]*)<\/p>/.exec(res.text)?.[1]?.trim() ?? '';
      if (!definition) problems.push(`${slug}: empty definition`);
      const tier1 = getTier1OperatorDefinition(slug);
      if (tier1 && definition !== Handlebars.escapeExpression(tier1.definition)) {
        problems.push(`${slug}: definition differs from the operator reference`);
      }
      if (!res.text.includes(`<h1>${slug.charAt(0).toUpperCase()}${slug.slice(1)}`)) {
        problems.push(`${slug}: wrong title`);
      }
    }
    expect(problems).toEqual([]);
  });

  // Defect caught: a step or example whose slug no longer resolves turning from a
  // link into plain text, steps misnumbered, or the anchor on the wrong step.
  it('numbers the progression from an anchor on step 1 and links every step and example', async () => {
    const problems: string[] = [];
    for (const slug of TEACHING_SLUGS) {
      const { text } = await page(`/freestyle/modifier/${slug}`);
      const steps = [...text.matchAll(/<li class="progression-step( is-anchor)?" id="modifier-step-(\d+)-/g)];
      const numbers = steps.map(m => Number(m[2]));
      if (numbers.length === 0 || numbers.some((n, i) => n !== i + 1)) problems.push(`${slug}: steps numbered ${numbers.join(',')}`);
      const anchors = steps.filter(m => m[1]).map(m => m[2]);
      if (anchors.join() !== '1') problems.push(`${slug}: anchor on step ${anchors.join(',')}`);
      if (!text.includes('<a class="step-name" href') || text.includes('<span class="step-name"')) problems.push(`${slug}: unlinked step`);
      if (!text.includes('<a class="cross-base-name" href') || text.includes('<span class="cross-base-name"')) problems.push(`${slug}: unlinked example`);
    }
    expect(problems).toEqual([]);
  });

  // Defect caught: the related list emptied, every page linking one Concepts term,
  // or a page losing the breadcrumb that is its only way back up.
  it('gives each page related concepts, its own Concepts link and a breadcrumb to Freestyle', async () => {
    const problems: string[] = [];
    for (const slug of TEACHING_SLUGS) {
      const { text } = await page(`/freestyle/modifier/${slug}`);
      if (!/<span class="related-name">[^<]+<\/span>: [^<\s]/.test(text)) problems.push(`${slug}: no related concepts`);
      if (!text.includes(`href="${conceptsHrefForTerm(slug)}"`)) problems.push(`${slug}: wrong Concepts link`);
      if (!/class="breadcrumb"[\s\S]*?href="\/freestyle">Freestyle</.test(text)) problems.push(`${slug}: no breadcrumb`);
    }
    expect(problems).toEqual([]);
  });
});

describe('GET /freestyle/modifier/:slug — page budget', () => {
  // Defect caught: a teaching page regrows into the long reference it was cut
  // from, so a newcomer has to scroll past notation essays to reach the examples.
  it('keeps every teaching page under 600 words and at most 6 sections', async () => {
    for (const slug of TEACHING_SLUGS) {
      const res = await page(`/freestyle/modifier/${slug}`);
      expect(res.status, slug).toBe(200);
      const main = res.text.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';
      expect(main.match(/<h2[\s>]/g)?.length ?? 0, `${slug} sections`).toBeLessThanOrEqual(6);
      const words = main.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      expect(words, `${slug} words`).toBeLessThan(600);
    }
  });
});

describe('GET /freestyle/modifier/:slug — 404 paths', () => {
  it('returns 404 for unknown slug', async () => {
    const res = await page('/freestyle/modifier/garbage-slug');
    expect(res.status).toBe(404);
  });
});

describe('GET /freestyle/modifier/:slug — route ordering', () => {
  it('does not collide with /freestyle/tricks/:slug', async () => {
    // Sanity: the modifier route is registered before the trick-detail route
    // in publicRoutes.ts.
    const res = await page('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    // The page does NOT use trick-shell.hbs
    expect(res.text).not.toContain('trick-shell');
    expect(res.text).toContain('symbolic-modifier-family');
  });
});

describe('GET /freestyle/modifier/:slug — first-class sets redirect to the Set Encyclopedia', () => {
  // Stepping has an authored set page; swirling is a route-migrated first-class
  // set. Both resolve to their set page, never a modifier stub. Whirling is a
  // body modifier, not a set, so its modifier page renders (covered with the
  // role-aware hashtags).
  for (const slug of ['stepping', 'swirling']) {
    it(`permanently redirects /freestyle/modifier/${slug} to /freestyle/sets/${slug}`, async () => {
      const res = await page(`/freestyle/modifier/${slug}`);
      expect(res.status).toBe(301);
      expect(res.headers['location']).toBe(`/freestyle/sets/${slug}`);
    });
  }
});
