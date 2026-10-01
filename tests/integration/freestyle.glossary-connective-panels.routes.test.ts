/**
 * Integration tests for the Freestyle Concepts reading spine and the
 * observational inside-stall case study near its end.
 *
 * Verifies the Concepts page keeps its section anchors in reading order, carries
 * no movement-topology panel section (the dictionary has no neighborhood view for
 * such panels to explain), and renders the inside-stall case study as an
 * explicitly observational, unsettled reading.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A small realistic pool so the Concepts page renders against populated
  // dictionary data. Dictionary slugs are the underscore canonical form.
  const tricks = [
    { slug: 'paradox_mirage',    adds: '3', base: 'mirage'    },
    { slug: 'paradox_whirl',     adds: '4', base: 'whirl'     },
    { slug: 'matador',           adds: '5', base: 'butterfly' },
    { slug: 'montage',           adds: '7', base: 'whirl'     },
    { slug: 'ducking_whirl',     adds: '4', base: 'whirl'     },
    { slug: 'phoenix',           adds: '5', base: 'butterfly' },
    { slug: 'spinning_whirl',    adds: '4', base: 'whirl'     },
    { slug: 'whirl',             adds: '3', base: 'whirl'     },
    { slug: 'smear',             adds: '3', base: 'mirage'    },
    { slug: 'dimwalk',           adds: '4', base: 'butterfly' },
  ];
  for (const t of tricks) {
    insertFreestyleTrick(db, {
      slug:           t.slug,
      canonical_name: t.slug.replace(/[-_]/g, ' '),
      adds:           t.adds,
      base_trick:     t.base,
      trick_family:   t.base,
      category:       'compound',
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/concepts — reading spine', () => {
  it('opens with the Movement Basics intro and keeps the reference sections', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/the language of freestyle footbag/);
    expect(res.text).toMatch(/Movement Basics/);
    expect(res.text).toMatch(/ADD Accounting/);
    expect(res.text).toMatch(/ADD \(Additional Degree of Difficulty\)/);
    expect(res.text).toContain('id="section-sources"');
  });

  it('carries no movement-topology panel section', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).not.toContain('id="connective-panels"');
    expect(res.text).not.toContain('glossary-connective-panel');
    expect(res.text).not.toMatch(/Family &amp; Topology Concepts/);
  });

  it('renders the Concepts section spine in reading order', async () => {
    // Section anchors in reading order: the Foundations spine (ending in
    // Modifiers) precedes the major topics (Families, then Notation, then
    // Composition, then the reference and history tail). Section ids are unique,
    // so monotonic ordering on the anchors is a robust spine check.
    const res = await page('/freestyle/concepts');
    const orderedAnchors = [
      'id="section-core-concepts"',
      'id="section-surfaces"',
      'id="section-dexterities"',
      'id="section-timing-sets"',
      'id="section-modifiers"',
      'id="section-families"',
      'id="section-notation"',
      'id="section-add-accounting"',
      'id="section-composition"',
      'id="section-run-architecture"',
      'id="inside-clipper-neighborhood"',
      'id="section-advanced-reference"',
      'id="section-community"',
      'id="section-historical"',
      'id="section-sources"',
    ];
    let lastIdx = -1;
    for (const anchor of orderedAnchors) {
      const idx = res.text.indexOf(anchor);
      expect(idx, `anchor ${anchor} not in monotonic order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });
});

describe('GET /freestyle/concepts — inside-stall stationary-transition case study', () => {
  it('renders the case-study section heading + anchor', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="inside-clipper-neighborhood"');
    expect(res.text).toMatch(/inside-stall stationary-transition neighborhood/i);
  });

  it('renders all four neighborhood tricks with detail-page links', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('href="/freestyle/tricks/wrap"');
    expect(res.text).toContain('href="/freestyle/tricks/walk_over"');
    expect(res.text).toContain('href="/freestyle/tricks/hop_over"');
    expect(res.text).toContain('href="/freestyle/tricks/eclipse"');
    // step-over is an alias of walk-over, surfaced as text, never its own link.
    expect(res.text).not.toContain('href="/freestyle/tricks/step-over"');
    expect(res.text).not.toContain('href="/freestyle/tricks/step_over"');
  });

  it('is badged observational and disclaims canonical-family change', async () => {
    const res = await page('/freestyle/concepts');
    const start = res.text.indexOf('id="inside-clipper-neighborhood"');
    const end = res.text.indexOf('id="section-advanced-reference"');
    const slice = res.text.substring(start, end);
    expect(slice).toMatch(/movement-neighborhood lens/i);
    expect(slice).toMatch(/each anchor\s+their own family/i);
  });

  it('renders eclipse as an explicitly unsettled reading (alignment-rule guard)', async () => {
    // The observational case study must NOT harden eclipse's decomposition into a
    // canonical claim, and must not contradict the detail page's op_notation / ADD.
    const res = await page('/freestyle/concepts');
    const start = res.text.indexOf('id="inside-clipper-neighborhood"');
    const end = res.text.indexOf('id="section-advanced-reference"');
    const slice = res.text.substring(start, end);
    expect(slice).toMatch(/doctrinally unsettled/i);
    expect(slice).toMatch(/commonly interpreted as symposium/i);
  });
});
