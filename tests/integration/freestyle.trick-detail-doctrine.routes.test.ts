/**
 * Trick-detail opening and lineage doctrine tests.
 *
 * Pins:
 *   - Placeholder-description suppressor: literal "X-modified Y." and
 *     "Popular freestyle trick." descriptions are suppressed; a real
 *     description renders
 *   - The build path is a line inside the opening About section; the
 *     "vs parent" delta is dropped where the build path already lists the
 *     same operators
 *   - Shell ordering: the opening About section sits above the
 *     structural-facts block
 *   - The family-lineage heading reads "Family" only on an official Family
 *     Parent
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

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

const { dbPath } = setTestEnv('3222');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

// The opening section carries no heading of its own; its accessible name is
// its stable locator.
const ABOUT = 'aria-label="About this trick"';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    description: "Toe-set dex'd outside the supporting leg, recaught on the setting toe (in-to-out dex).",
    operational_notation: 'TOE > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox_mirage', canonical_name: 'paradox mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    description: 'Paradox-modified mirage.',
    operational_notation: 'CLIP > SAME OUT [PDX] [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'plain_tier_c_trick', canonical_name: 'plain tier c trick', adds: '4',
    base_trick: 'plain_tier_c_trick', trick_family: null, category: 'compound',
    description: 'A descriptive trick description that is not a placeholder.',
    operational_notation: 'CLIP > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'blur', canonical_name: 'blur', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    description: 'Blurry-modified mirage.',
    operational_notation: 'CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'ripstein', canonical_name: 'ripstein', adds: '4',
    base_trick: null, trick_family: 'ripstein', category: 'compound',
    description: 'Popular freestyle trick.',
    operational_notation: 'CLIP >> SAME OUT [DEX] >> SAME OUT [DEX] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // blur = mirage + blurry, so its build path renders.
  insertFreestyleTrickModifier(db, { slug: 'blurry', modifier_name: 'blurry', modifier_type: 'body' });
  insertFreestyleTrickModifierLink(db, 'blur', 'blurry');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Placeholder-description suppressor', () => {
  it('paradox-mirage (DB description: "Paradox-modified mirage.") suppresses the literal description', async () => {
    const res = await page('/freestyle/tricks/paradox_mirage');
    expect(res.text).not.toMatch(/<p class="trick-description">Paradox-modified mirage\.<\/p>/);
  });

  it('ripstein suppresses the "Popular freestyle trick." DB placeholder', async () => {
    const res = await page('/freestyle/tricks/ripstein');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/<p class="trick-description">Popular freestyle trick\.<\/p>/);
  });

  it('mirage (non-placeholder description) DOES render the literal description', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.text).toContain('Toe-set dex&#x27;d outside the supporting leg');
  });

  it('plain-tier-c-trick (non-placeholder description) DOES render the literal description', async () => {
    const res = await page('/freestyle/tricks/plain_tier_c_trick');
    expect(res.text).toContain('A descriptive trick description that is not a placeholder.');
  });
});

describe('Shell ordering — the opening sits above the structural facts', () => {
  // Defect caught: a reader meeting the filing vocabulary before the plain
  // words saying what the trick is.
  it('on a derivative, the About section comes before the structural-facts block', async () => {
    const res = await page('/freestyle/tricks/paradox_mirage');
    const aboutIdx  = res.text.indexOf(ABOUT);
    const structIdx = res.text.indexOf('class="content-section trick-structural-facts"');
    expect(aboutIdx).toBeGreaterThan(-1);
    expect(structIdx).toBeGreaterThan(aboutIdx);
  });
});

// The build path renders in the About section as a data-build-path line for
// modifier-composed compounds. The "vs parent" delta is suppressed when a build
// path exists, because the build path already lists the same operators. Atoms
// and link-less tricks carry neither.
describe('Build path and parent delta', () => {
  it('blur (mirage + blurry) suppresses the parent-delta line because the build path already lists the modifier', async () => {
    const res = await page('/freestyle/tricks/blur');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-intuition-delta');
  });

  it('blur renders the build-path line inside the About section', async () => {
    const res = await page('/freestyle/tricks/blur');
    const aboutStart = res.text.indexOf(ABOUT);
    const about = res.text.slice(aboutStart, res.text.indexOf('</section>', aboutStart));
    expect(about).toContain('data-build-path');
    // Title-cased base chain; the equals sign renders HTML-escaped.
    expect(about).toMatch(/Mirage .* \+ blurry &#x3D; Blur/);
  });

  it('mirage (atom, no modifier links) renders neither the delta nor the build-path line', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.text).not.toContain('data-intuition-delta');
    expect(res.text).not.toContain('data-build-path');
  });
});

describe('Family-lineage heading is "Family" only for official Family Parents', () => {
  it('an official Family Parent (mirage) labels its lineage section "Family"', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-family-lineage"');
    expect(res.text).toMatch(/<h2>[^<]*\bFamily<\/h2>/);
  });

  it('a non-parent trick (paradox-mirage) labels its lineage section "Related", never "Family"', async () => {
    const res = await page('/freestyle/tricks/paradox_mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-family-lineage"');
    expect(res.text).toMatch(/<h2>[^<]*\bRelated<\/h2>/);
    expect(res.text).not.toMatch(/<h2>[^<]*\bFamily<\/h2>/);
  });
});
