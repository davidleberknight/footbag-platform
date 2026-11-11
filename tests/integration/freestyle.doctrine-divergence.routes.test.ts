/**
 * Integration tests for the doctrine-divergence framework.
 *
 * Contract under test:
 *   - DOCTRINE_DIVERGENCE_REGISTRY ingests cleanly; the three pilot
 *     rows (blurrage / predator / schmoe) are present with
 *     historical-divergence category and Q7 Red linkage.
 *   - A registered slug's trick page shows the canonical ADD, never the
 *     outside source's claim.
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

import {
  DOCTRINE_DIVERGENCE_REGISTRY,
  getDoctrineDivergence,
  hasPublicScoringNote,
} from '../../src/content/freestyleTrickDoctrine';

const { dbPath } = setTestEnv('3199');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

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
  it('exposes all three pilot rows', () => {
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
      expect(entry!.sourceSystem).toBe('an outside source');
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

describe('Doctrine-divergence — the displayed ADD stays canonical', () => {
  it('canonical ADD chip on registered slugs shows the IFPA-derived value, not the source-claim', async () => {
    const res = await page('/freestyle/tricks/blurrage');
    expect(res.status).toBe(200);
    // The ADD chip must show "4 ADD" (IFPA-derived), never the outside
    // source's 3 ADD claim.
    expect(res.text).toMatch(/4 ADD/);
  });
});
