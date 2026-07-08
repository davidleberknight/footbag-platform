/**
 * ADD-analysis case-study trick links resolve to active pages or plain text.
 *
 * The PassBack-vs-IFPA disagreement rows are content-authored against IFPA
 * structural names. Three link states must hold on the rendered page:
 *
 *   1. a name whose canonical row is active links to its own page;
 *   2. a retired structural name whose row is inactive but whose name is an
 *      alias of an active folk-named canonical links straight to that active
 *      canonical page (the displayed name stays the structural one; internal
 *      links stay canonical with no redirect hop);
 *   3. a name that resolves nowhere active renders as plain text, never a dead
 *      link.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3978');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // State 1: a disagreement-row name seeded as an ACTIVE canonical.
  insertFreestyleTrick(db, {
    slug: 'stepping_legover', canonical_name: 'stepping legover', adds: '3',
    trick_family: 'legover', category: 'compound', is_active: 1,
  });
  // State 2: a disagreement-row name held INACTIVE, whose name is an alias of
  // an active folk-named canonical.
  insertFreestyleTrick(db, {
    slug: 'whirling_mirage', canonical_name: 'whirling mirage', adds: '3',
    trick_family: 'mirage', category: 'compound', is_active: 0,
  });
  insertFreestyleTrick(db, {
    slug: 'blaze', canonical_name: 'Blaze', adds: '3',
    trick_family: 'mirage', category: 'compound', is_active: 1,
  });
  insertFreestyleTrickAlias(db, 'whirling-mirage', 'blaze', 'whirling mirage');
  // State 3: barraging_whirl stays unseeded, so its name resolves nowhere active.
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/add-analysis — disagreement-row link resolution', () => {
  it('links an active referenced trick to its own page', async () => {
    const res = await request(await createApp()).get('/freestyle/add-analysis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks/stepping_legover"');
  });

  it('links an inactive-but-aliased structural name straight to the active canonical page', async () => {
    const res = await request(await createApp()).get('/freestyle/add-analysis');
    // Displayed as the structural name, linked to the folk-named canonical.
    expect(res.text).toContain('href="/freestyle/tricks/blaze">whirling mirage</a>');
    // Never linked to the inactive structural row, which would 404.
    expect(res.text).not.toContain('href="/freestyle/tricks/whirling_mirage"');
  });

  it('renders a nowhere-active referenced name as plain text', async () => {
    const res = await request(await createApp()).get('/freestyle/add-analysis');
    expect(res.text).toContain('barraging whirl');                              // the name is still shown
    expect(res.text).not.toContain('href="/freestyle/tricks/barraging_whirl"'); // but never as a link
  });
});
