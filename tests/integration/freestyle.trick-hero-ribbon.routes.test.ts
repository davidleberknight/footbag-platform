/**
 * Trick-detail hero contract (GET /freestyle/tricks/:slug).
 *
 * The hero carries identity only: the h1 trick name (with any display side
 * qualifier stripped). The taxonomy ribbon (hashtag / family / ADD chips)
 * renders in the page body, below the hero, never inside it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3142');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'mirage',
    canonical_name: 'Mirage',
    adds: '2',
    notation: 'MIRAGE',
    description: 'core mirage',
    sort_order: 10,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — hero identity + body taxonomy ribbon', () => {
  it('renders the plain trick name in the hero h1', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Mirage</h1>');
  });

  it('renders the taxonomy ribbon in the page body, after the hero, not inside it', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    const heroTitleIdx = res.text.indexOf('<h1>Mirage</h1>');
    const shellIdx     = res.text.indexOf('class="wrapper trick-shell"');
    const ribbonIdx    = res.text.indexOf('class="trick-hero-meta-ribbon"');

    expect(heroTitleIdx).toBeGreaterThan(-1);
    expect(shellIdx).toBeGreaterThan(-1);
    expect(ribbonIdx).toBeGreaterThan(-1);

    // The hero (everything before the body wrapper) does NOT carry the ribbon.
    expect(res.text.slice(0, shellIdx)).not.toContain('trick-hero-meta-ribbon');
    // The h1 sits in the hero (before the body); the ribbon sits in the body.
    expect(heroTitleIdx).toBeLessThan(shellIdx);
    expect(ribbonIdx).toBeGreaterThan(shellIdx);
    // The ADD chip rides the ribbon.
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">2 ADD<\/span>/);
  });
});
