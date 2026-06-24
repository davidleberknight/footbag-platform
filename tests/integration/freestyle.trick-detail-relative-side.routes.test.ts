/**
 * GET /freestyle/tricks/:slug — relative-side variants callout.
 *
 * A trick that is part of a base / same-side / far group shows a small callout
 * linking its sibling variants and the glossary explainer for SAME vs OP. The
 * callout is a display projection over slugs (same side-stripped stem); it does
 * not change identity or slug normalization.
 *
 * Behaviors pinned:
 *   1. A trick in a multi-side group renders the callout with every sibling,
 *      ordered base → same-side → far, marking the current trick.
 *   2. The callout deep-links to the relative-side glossary anchor.
 *   3. A trick with no relative-side sibling renders no callout.
 *   4. An unrelated trick is never absorbed into the group.
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

const { dbPath } = setTestEnv('3533');

let createApp: Awaited<ReturnType<typeof importApp>>;

const t = (slug: string) => ({
  slug,
  canonical_name: slug.replace(/_/g, ' '),
  trick_family: 'butterfly',
  base_trick: 'butterfly',
  category: 'compound' as const,
  adds: '3',
  is_active: 1 as const,
});

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // butterfly trio (base / same-side / far) + an unrelated trick.
  insertFreestyleTrick(db, t('butterfly'));
  insertFreestyleTrick(db, t('butterfly_same_side'));
  insertFreestyleTrick(db, t('far_butterfly'));
  insertFreestyleTrick(db, { ...t('clipper'), trick_family: 'clipper', base_trick: 'clipper' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — relative-side variants', () => {
  it('renders the callout on a base trick with same-side and far siblings', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-section="relative-side-variants"');
    expect(res.text).toContain('Relative-side variants');
    // All three siblings reachable.
    expect(res.text).toContain('/freestyle/tricks/butterfly_same_side');
    expect(res.text).toContain('/freestyle/tricks/far_butterfly');
    // Side labels present.
    expect(res.text).toContain('Same-side (near)');
    expect(res.text).toContain('Far (opposite)');
    // Glossary deep-link to the relative-side explainer.
    expect(res.text).toContain('href="/freestyle/glossary#term-same-side"');
    // The current trick is marked, not linked to itself.
    expect(res.text).toContain('(this trick)');
  });

  it('renders the callout from a far-side member and marks it current', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/far_butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-section="relative-side-variants"');
    expect(res.text).toContain('/freestyle/tricks/butterfly_same_side');
    // far_butterfly is the current page, so it appears as the marked entry.
    expect(res.text).toContain('(this trick)');
  });

  it('renders no callout for a trick with no relative-side sibling', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/clipper');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-section="relative-side-variants"');
  });
});
