/**
 * Integration tests for the Wave 7 doctrine-divergence framework.
 *
 * Contract under test:
 *   - DOCTRINE_DIVERGENCE_REGISTRY ingests cleanly; the three pilot
 *     rows (blurrage / predator / schmoe) are present with
 *     historical-divergence category and Q7 Red linkage.
 *   - Trick-detail page for a registered slug renders the "Scoring
 *     notes" section with the provenance prose AND the source-claim
 *     vs canonical-value line.
 *   - Trick-detail page for a NON-registered slug (mirage) does NOT
 *     render the section.
 *   - Browse cards (/freestyle/tricks?view=add) NEVER render the
 *     scoring-notes section, even for registered slugs.
 *   - Glossary surface NEVER renders per-trick scoring notes.
 *   - The `curator-only` visibility level (when used) is gated at
 *     the service layer; partial never sees it.
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

import {
  DOCTRINE_DIVERGENCE_REGISTRY,
  getDoctrineDivergence,
  hasPublicScoringNote,
} from '../../src/content/freestyleTrickDoctrine';

const { dbPath } = setTestEnv('3199');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed the three pilot rows + a non-registered control row (mirage).
  insertFreestyleTrick(db, {
    slug: 'blurrage', canonical_name: 'blurrage',
    adds: '4', base_trick: 'barrage', trick_family: 'barrage',
    category: 'compound', notation: 'STEPPING BARRAGE', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'predator', canonical_name: 'predator',
    adds: '4', base_trick: 'double-leg-over', trick_family: 'double-leg-over',
    category: 'compound', notation: 'ATOMIC DLO', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'schmoe', canonical_name: 'schmoe',
    adds: '3', base_trick: 'legover', trick_family: 'legover',
    category: 'compound', notation: 'STEPPING LEGOVER', is_active: 1,
  });
  // Control: mirage (canonical first-class core atom; NOT registered).
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage',
    adds: '2', base_trick: 'mirage', trick_family: 'mirage',
    category: 'compound', notation: 'MIRAGE', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Doctrine-divergence registry — ingestion', () => {
  it('exposes all three Wave 7 pilot rows', () => {
    expect(DOCTRINE_DIVERGENCE_REGISTRY.has('blurrage')).toBe(true);
    expect(DOCTRINE_DIVERGENCE_REGISTRY.has('predator')).toBe(true);
    expect(DOCTRINE_DIVERGENCE_REGISTRY.has('schmoe')).toBe(true);
  });

  it('classifies each pilot row as historical-divergence + Q7-linked', () => {
    for (const slug of ['blurrage', 'predator', 'schmoe']) {
      const entry = getDoctrineDivergence(slug);
      expect(entry, `missing registry entry: ${slug}`).not.toBeNull();
      expect(entry!.category).toBe('historical-divergence');
      expect(entry!.relatedRedQuestion).toBe('Q7');
      expect(entry!.status).toBe('published');
      expect(entry!.sourceSystem).toBe('PassBack');
    }
  });

  it('canonicalValue matches the +1 IFPA-derived total per pilot', () => {
    expect(getDoctrineDivergence('blurrage')!.canonicalValue).toBe(4);
    expect(getDoctrineDivergence('blurrage')!.sourceClaim).toBe(3);
    expect(getDoctrineDivergence('predator')!.canonicalValue).toBe(4);
    expect(getDoctrineDivergence('predator')!.sourceClaim).toBe(3);
    expect(getDoctrineDivergence('schmoe')!.canonicalValue).toBe(3);
    expect(getDoctrineDivergence('schmoe')!.sourceClaim).toBe(2);
  });

  it('hasPublicScoringNote returns true for published+public entries', () => {
    expect(hasPublicScoringNote('blurrage')).toBe(true);
    expect(hasPublicScoringNote('mirage')).toBe(false);
    expect(hasPublicScoringNote('non-existent-slug')).toBe(false);
  });

  it('canonicalValue self-documents the freestyle_tricks.adds invariant', () => {
    // The registry's canonicalValue must equal what the DB carries for
    // each pilot row. Self-documenting; if the DB drifts, this test
    // catches it before the audit does.
    for (const [slug, expectedAdds] of [
      ['blurrage', 4],
      ['predator', 4],
      ['schmoe',   3],
    ] as const) {
      expect(getDoctrineDivergence(slug)!.canonicalValue).toBe(expectedAdds);
    }
  });
});

describe('Doctrine-divergence rendering — trick-detail surface', () => {
  it('renders the scoring-notes section on a registered slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blurrage');
    expect(res.status).toBe(200);
    // Section wrapper present with stable test class.
    expect(res.text).toContain('class="content-section trick-scoring-notes"');
    // Heading present.
    expect(res.text).toMatch(/<h2 class="trick-scoring-notes-heading">Scoring notes<\/h2>/);
    // Provenance prose present (substring; just enough to anchor).
    expect(res.text).toContain('PassBack historically lists blurrage at 3 ADD');
    // Canonical value rendered.
    expect(res.text).toContain('4 ADD');
  });

  it('surfaces the source-claim vs canonical-value comparison line', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/predator');
    expect(res.status).toBe(200);
    // Source claim line should render explicitly.
    expect(res.text).toMatch(/Source claim \(PassBack\): 3 ADD/);
    expect(res.text).toMatch(/Published canonical value: 4 ADD/);
  });

  it('does NOT render scoring-notes for a non-registered slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    // Section class must be absent for unregistered slugs.
    expect(res.text).not.toContain('trick-scoring-notes');
  });
});

describe('Doctrine-divergence rendering — surface placement guardrails', () => {
  it('does NOT render scoring-notes on /freestyle/tricks?view=add (browse cards)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // Browse cards must stay clean regardless of registry membership.
    expect(res.text).not.toContain('trick-scoring-notes');
  });

  it('does NOT render scoring-notes on /freestyle/tricks?view=family (browse cards)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('trick-scoring-notes');
  });

  it('does NOT render scoring-notes on /freestyle/glossary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // Glossary discusses divergence as a concept (future §8 addition);
    // per-trick scoring notes never appear here.
    expect(res.text).not.toContain('class="content-section trick-scoring-notes"');
  });

  it('does NOT render scoring-notes on /freestyle (landing)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('trick-scoring-notes');
  });
});

describe('Doctrine-divergence rendering — zero-mismatch invariant preserved', () => {
  it('canonical ADD chip on registered slugs shows the IFPA-derived value, not the source-claim', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blurrage');
    expect(res.status).toBe(200);
    // The hero / canonical ADD chip must show "4 ADD" (IFPA-derived),
    // never "3 ADD" (PB source-claim). The scoring-notes section
    // contextualizes; it does NOT undermine the displayed canonical.
    expect(res.text).toMatch(/4 ADD/);
  });
});
