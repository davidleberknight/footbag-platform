/**
 * Integration tests for the trick-detail movement-intuition enrichment.
 * Six curator-locked flagship pages (mirage, whirl, butterfly, osis,
 * illusion, mobius) render a "Movement intuition" section after the
 * Notation block (Notation -> Movement intuition -> About). All other
 * pages do NOT render the section.
 *
 * Wording is locked at the content-module layer; this test asserts
 * verbatim presence so future drift is caught before shipping.
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

const { dbPath } = setTestEnv('3207');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Six flagship slugs + one negative-control (whirling is a modifier-
  // family slug not in the intuition map).
  for (const seed of [
    { slug: 'mirage',    canonical_name: 'mirage',    adds: '2', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', notation: '[set] > hippy in dex > op toe', is_active: 1 },
    { slug: 'whirl',     canonical_name: 'whirl',     adds: '3', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', notation: '[set] > leggy in dex > ss clipper', is_active: 1 },
    { slug: 'butterfly', canonical_name: 'butterfly', adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', notation: '[set] > leggy out dex > op clip', is_active: 1 },
    { slug: 'osis',      canonical_name: 'osis',      adds: '3', base_trick: 'osis',      trick_family: 'osis',      category: 'compound', notation: '[set] > back spin bod > ss clip', is_active: 1 },
    { slug: 'illusion',  canonical_name: 'illusion',  adds: '2', base_trick: 'illusion',  trick_family: 'illusion',  category: 'compound', notation: '[set] > leggy out dex > op toe', is_active: 1 },
    { slug: 'mobius',    canonical_name: 'mobius',    adds: '5', base_trick: 'torque',    trick_family: 'torque',    category: 'compound', notation: '[clip] > spin bod > leggy in dex > spin bod > op clip', is_active: 1 },
    { slug: 'whirling',  canonical_name: 'whirling',  adds: 'modifier', base_trick: 'whirling', trick_family: 'whirl', category: 'modifier', notation: 'whirling', is_active: 1 },
    { slug: 'clipper_stall',    canonical_name: 'clipper stall',    adds: '2', base_trick: 'clipper_stall',    trick_family: 'clipper_stall',    category: 'surface', notation: 'SET > OP CLIP [XBD] [DEL]', is_active: 1 },
    { slug: 'around_the_world', canonical_name: 'around the world', adds: '2', base_trick: 'around_the_world', trick_family: 'around_the_world', category: 'dex',  notation: '[set] > dex > toe', is_active: 1 },
    { slug: 'orbit',            canonical_name: 'orbit',            adds: '2', base_trick: 'orbit',            trick_family: 'orbit',            category: 'dex',  notation: '[set] > dex > toe', is_active: 1 },
    { slug: 'pickup',           canonical_name: 'pickup',           adds: '2', base_trick: 'pickup',           trick_family: 'pickup',           category: 'dex',  notation: '[set] > op in dex > ss toe', is_active: 1 },
  ]) {
    insertFreestyleTrick(db, seed);
  }

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Movement intuition — flagship pages render the section', () => {
  it('mirage renders the section with prose', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/<h2>Movement intuition<\/h2>/);
    // Prose substring (whitespace tolerant; HTML may wrap).
    expect(res.text).toMatch(/swing the support leg from in to out over the footbag/);
  });

  it('whirl renders the section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/circle the footbag from the front up and over the footbag/);
  });

  it('butterfly renders the section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/butterfly');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/A leg over straight to a clipper delay/);
  });

  it('osis renders the section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Spin into a clipper delay/);
  });

  it('illusion renders the section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/illusion');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/a reverse miraging motion/);
  });

  it('clipper_stall renders the how-to intuition (foundation destination)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/clipper_stall');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/catching leg tucked behind the support leg/);
  });

  it('around_the_world renders the how-to intuition', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/around_the_world');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/circle one leg all the way around the bag/);
  });

  it('orbit renders the how-to intuition, anchored to around-the-world', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/orbit');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/the same circling motion as an around-the-world/);
  });

  it('pickup renders the how-to intuition (scoop from below)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/pickup');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/scooping it up from below/);
  });

  it('mobius renders the physical prose', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mobius');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/spin into a right-leg mirage/);
    // The verbose "structural reading is gyro torque" restatement is no longer
    // carried in the intuition prose (About and Equivalent readings own the
    // structure; the parent-delta relocation is covered in the doctrine suite).
    expect(res.text).not.toMatch(/structural reading is/);
  });
});

describe('Movement intuition — non-flagship pages omit the section', () => {
  it('whirling (a first-class set) redirects from the trick route to its set page, so the intuition section never renders', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirling');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/whirling');
  });
});

describe('Movement intuition — ordering invariant', () => {
  it('notation section renders BEFORE the intuition section on flagship pages', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    const intuitionIdx = res.text.indexOf('class="content-section trick-intuition"');
    const notationIdx  = res.text.indexOf('class="content-section notation-display"');
    expect(intuitionIdx).toBeGreaterThan(0);
    expect(notationIdx).toBeGreaterThan(0);
    expect(notationIdx).toBeLessThan(intuitionIdx);
  });
});
