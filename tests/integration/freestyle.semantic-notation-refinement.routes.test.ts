/**
 * Integration tests for the semantic-notation refinement slice
 * (2026-05-23). Two surfaces under test:
 *
 *   1. Description column refinement (Part 1):
 *      - Primitive trick whose DB description literally repeats the
 *        operational notation → description suppressed from render.
 *      - Compound trick with curator-authored override → DB
 *        description replaced with the override prose.
 *      - Trick with genuine prose description → passes through
 *        unchanged.
 *
 *   2. Reverse-pair transform overlay (Part 2):
 *      - The five canonical reverse-pair slugs (illusion, pickup,
 *        rev-whirl, rev-swirl, orbit) render the Transform line +
 *        rev(0) explainer + base-trick cross-link.
 *      - A non-reverse-pair slug does NOT render the section.
 *      - Locked rev(0) explainer wording asserted verbatim (catches
 *        future drift before it ships).
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

const { dbPath } = setTestEnv('3205');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Primitive trick where description literally repeats notation — the
  // redundancy gate should suppress the description from render.
  insertFreestyleTrick(db, {
    slug: 'illusion', canonical_name: 'illusion',
    adds: '2', base_trick: 'illusion', trick_family: 'illusion',
    category: 'compound', notation: '[set] > leggy out dex > op toe',
    description: '[set] > leggy out dex > op toe',
    is_active: 1,
  });

  // The base trick for illusion's transform cross-link.
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage',
    adds: '2', base_trick: 'mirage', trick_family: 'mirage',
    category: 'compound', notation: '[set] > hippy in dex > op toe',
    description: '[set] > hippy in dex > op toe',
    is_active: 1,
  });

  // Compound trick with curator-authored override — DB description
  // should be replaced with the override prose.
  insertFreestyleTrick(db, {
    slug: 'double_legover', canonical_name: 'double legover',
    adds: '3', base_trick: 'legover', trick_family: 'legover',
    category: 'compound', notation: '[set] > leggy out dex > leggy out dex > ss toe',
    description: 'two consecutive leggy out dex steps',  // pre-existing DB prose
    is_active: 1,
  });

  // Trick with genuine prose description (no override, no redundancy)
  // — passes through unchanged.
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl',
    adds: '3', base_trick: 'whirl', trick_family: 'whirl',
    category: 'compound', notation: '[set] > leggy in dex > ss clipper',
    description: 'A rotational dex with the leg circling cross-body to a clipper stall.',
    is_active: 1,
  });

  // Second reverse-pair trick to verify the transform list isn't
  // illusion-specific.
  insertFreestyleTrick(db, {
    slug: 'orbit', canonical_name: 'orbit',
    adds: '2', base_trick: 'around_the_world', trick_family: 'around_the_world',
    category: 'compound', notation: 'toe > ss(midtime) out dex > ss toe',
    description: 'toe > ss(midtime) out dex > ss toe',
    is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'around_the_world', canonical_name: 'around the world',
    adds: '2', base_trick: 'around_the_world', trick_family: 'around_the_world',
    category: 'compound', notation: 'toe > ss(midtime) in dex > ss toe',
    description: 'toe > ss(midtime) in dex > ss toe',
    is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Part 1 — description column refinement', () => {
  it('suppresses the description when it literally repeats the notation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/illusion');
    expect(res.status).toBe(200);
    // The redundant DB description should NOT render as the trick-description
    // paragraph. The notation itself still renders elsewhere on the page;
    // the about block just doesn't echo it.
    // illusion's DB description ('[set] > leggy out dex > op toe') equals
    // its notation; the trick-description <p> should be absent.
    expect(res.text).not.toMatch(/<p class="trick-description">\[set\] &gt; leggy out dex &gt; op toe<\/p>/);
  });

  it('replaces the description with the curator override on compound tricks', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/double_legover');
    expect(res.status).toBe(200);
    // The override prose renders; the pre-existing DB description does NOT.
    expect(res.text).toMatch(/mirage \+ legover chain/);
    expect(res.text).toMatch(/two consecutive in-direction dex steps from a single set/);
    expect(res.text).not.toMatch(/two consecutive leggy out dex steps/);
  });

  it('passes genuine prose descriptions through unchanged', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/A rotational dex with the leg circling cross-body to a clipper stall\./);
  });
});

describe('Part 2 — reverse-pair transform overlay', () => {
  it('renders the transform section on illusion with the ALT formula + explainer', async () => {
    // 2026-05-23 curator-rendered-output audit (2nd pass): the ALT
    // formula was re-added to trick-transform.hbs as a labeled "ALT"
    // <dl> row so non-first-class rev(0) entries surface the ALT
    // formula visibly without needing the Notation Summary card. The
    // section still carries the rev(0) explainer + base cross-link.
    const res = await request(createApp()).get('/freestyle/tricks/illusion');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-transform"');
    // The transform section carries an ALT-labeled <dl> row with the
    // full reverse-pair formula.
    const tfStart = res.text.indexOf('class="content-section trick-transform"');
    expect(tfStart).toBeGreaterThan(0);
    const tfEnd = res.text.indexOf('</section>', tfStart);
    const tf = res.text.slice(tfStart, tfEnd);
    expect(tf).toMatch(/<dt>ALT<\/dt>/);
    expect(tf).toMatch(/rev\(0\)\s*\+\s*mirage\(2\)/);
  });

  it('renders the locked rev(0) explainer on illusion (drift guard)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/illusion');
    expect(res.status).toBe(200);
    // Verbatim assertion on the locked operator explainer. Any wording
    // change to the rev(0) framing must surface here before shipping.
    expect(res.text).toMatch(/where rev\(0\) reverses the in.{0,4}out dex direction/);
    expect(res.text).toMatch(/Hippy \/ leggy notation supplements are stylistic/);
  });

  it('cross-links the base trick on illusion (mirage)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/illusion');
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\/mirage">mirage<\/a>/);
  });

  it('renders the transform section on orbit (rev(0) + around-the-world)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/orbit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-transform"');
    expect(res.text).toMatch(/rev\(0\) \+ around-the-world/);
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\/around_the_world">around-the-world<\/a>/);
  });

  it('does NOT render the transform section on a non-reverse-pair trick (whirl)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-transform"');
  });

  it('does NOT render the transform section on the BASE trick (mirage; not the reverse)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    // Transforms render on the REVERSE side only — mirage is the base, not the reverse.
    expect(res.text).not.toContain('class="content-section trick-transform"');
  });
});

describe('Cross-cutting: REV_ZERO_EXPLAINER source-of-truth', () => {
  it('illusion and orbit render the same rev(0) explainer (single source of truth)', async () => {
    const illusionRes = await request(createApp()).get('/freestyle/tricks/illusion');
    const orbitRes    = await request(createApp()).get('/freestyle/tricks/orbit');
    // Extract the explainer paragraph from each; both should match the same locked string.
    const illusionMatch = illusionRes.text.match(/<p class="trick-transform-explainer">([\s\S]*?)<\/p>/);
    const orbitMatch    = orbitRes.text.match(/<p class="trick-transform-explainer">([\s\S]*?)<\/p>/);
    expect(illusionMatch, 'illusion should render the explainer').not.toBeNull();
    expect(orbitMatch,    'orbit should render the explainer').not.toBeNull();
    // The explainer up to the cross-link prefix should be identical
    // across both pages — the base-trick name differs after that.
    const illusionExplainer = illusionMatch![1].split('Cross-link:')[0];
    const orbitExplainer    = orbitMatch![1].split('Cross-link:')[0];
    expect(illusionExplainer.trim()).toBe(orbitExplainer.trim());
  });
});
