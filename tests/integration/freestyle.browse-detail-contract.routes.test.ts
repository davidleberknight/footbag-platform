/**
 * Regression-pinning suite: Browse / Detail presentation contract.
 *
 * Pins the long-term contract between browse-surface and detail-surface
 * rendering. The contract:
 *
 *   - Browse cards (any ?view=… on /freestyle/tricks and observational
 *     /freestyle/observational) must NEVER render an ALT row, the
 *     "Scoring notes" heading, or source-claim divergence prose.
 *     These belong only on /freestyle/tricks/:slug detail pages.
 *
 *   - Detail pages MAY render an ALT row when the trick is one of the
 *     5 curator-locked rev(0)-paired entries (rev-whirl, rev-swirl,
 *     illusion, pickup, orbit). Pinning a positive case (rev-whirl)
 *     guards against accidental removal of the ALT layer.
 *
 * This contract is currently in force (the ALT row is gated to the
 * trick-transform partial, detail-only). The suite is
 * a regression guard: a future shaping helper or partial refactor that
 * accidentally surfaces ALT / scoring divergence on a browse view will
 * fail one of these assertions.
 *
 * Each assertion is a curl-grade HTML check, not an internal-contract
 * check. The suite tolerates implementation refactors that preserve
 * rendered output.
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

const { dbPath } = setTestEnv('3214');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Atom + base coverage so browse views have content to render.
  insertFreestyleTrick(db, {
    slug: 'toe-stall', canonical_name: 'toe stall', adds: '1',
    base_trick: 'toe-stall', trick_family: 'toe-stall', category: 'surface',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    notation: 'MIRAGE',
    operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'dex',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // rev-whirl is a curator-locked rev(0)-paired entry — its detail page
  // renders the ALT row via trick-transform.hbs. Positive-control case.
  insertFreestyleTrick(db, {
    slug: 'rev-whirl', canonical_name: 'rev whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    notation: 'REV WHIRL',
    operational_notation: 'CLIP > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ── Browse surfaces: no ALT row leakage ──────────────────────────────────

describe('Browse contract: ALT row never appears on browse surfaces', () => {
  const BROWSE_ROUTES = [
    '/freestyle/tricks?view=add',
    '/freestyle/tricks?view=family',
    '/freestyle/tricks?view=movement-system',
    '/freestyle/tricks?view=topology',
    '/freestyle/observational',
  ];

  for (const route of BROWSE_ROUTES) {
    it(`${route}: no ALT dt and no transform overlay`, async () => {
      const res = await request(await createApp()).get(route);
      expect(res.status).toBe(200);
      // The ALT row uses <dt>ALT</dt> in trick-transform.hbs.
      // Pin against that literal pattern.
      expect(res.text).not.toContain('<dt>ALT</dt>');
      // The transform partial is gated by aria-label.
      expect(res.text).not.toContain('aria-label="ALT formula (reverse-pair interpretation)"');
    });
  }
});

// ── Browse surfaces: no scoring-divergence prose leakage ─────────────────

describe('Browse contract: scoring notes never appear on browse surfaces', () => {
  const BROWSE_ROUTES = [
    '/freestyle/tricks?view=add',
    '/freestyle/tricks?view=family',
    '/freestyle/tricks?view=movement-system',
    '/freestyle/tricks?view=topology',
    '/freestyle/observational',
  ];

  for (const route of BROWSE_ROUTES) {
    it(`${route}: no Scoring notes heading and no Source claim prose`, async () => {
      const res = await request(await createApp()).get(route);
      expect(res.status).toBe(200);
      // The scoring-notes partial uses a "Scoring notes" h-element on
      // public visibility. The advanced-collapsible variant uses the
      // same heading text.
      expect(res.text).not.toContain('Scoring notes');
      // The source-claim divergence line uses a "Source claim (" prefix.
      expect(res.text).not.toContain('Source claim (');
      // Published canonical value comparison is detail-only prose.
      expect(res.text).not.toContain('Published canonical value:');
    });
  }
});

// ── Detail page: positive control on ALT row ─────────────────────────────

describe('Detail contract: ALT row DOES render on rev(0)-paired tricks', () => {
  it('/freestyle/tricks/rev-whirl: ALT row is present (trick-transform overlay)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/rev-whirl');
    expect(res.status).toBe(200);
    // The trick-transform partial section renders with the dedicated
    // aria-label and the ALT dt.
    expect(res.text).toContain('aria-label="ALT formula (reverse-pair interpretation)"');
    expect(res.text).toContain('<dt>ALT</dt>');
  });
});
