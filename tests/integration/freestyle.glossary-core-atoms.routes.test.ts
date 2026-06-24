/**
 * Integration tests for the §1 Core trick atoms band on GET /freestyle/glossary.
 *
 * The band renders the curator-authored CORE_ATOM_EDUCATIONAL cards. Each card
 * carries two distinct movement layers: `lead` (what the movement physically IS)
 * and `movementIntuition` (the embodied coaching cue — what it FEELS like to
 * perform). This suite locks in that the intuition layer is shaped through the
 * view-model and rendered, distinct from the descriptive lead. Cards come from
 * the static content module, so they render independent of fixture data.
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

const { dbPath } = setTestEnv('3561');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Glossary §1 — core trick atoms band', () => {
  it('renders the core trick atoms band with atom cards', async () => {
    const html = await glossary();
    expect(html).toContain('id="core-trick-atoms"');
    expect(html).toContain('id="atom-toe_stall"');
    expect(html).toContain('id="atom-osis"');
  });

  it('renders the embodied "Feels like" intuition cue, distinct from the lead', async () => {
    const html = await glossary();
    // The osis card carries a known intuition cue; assert it renders inside
    // that card's intuition slot (not the descriptive lead).
    const osis = html.match(/id="atom-osis"[\s\S]*?<\/article>/);
    expect(osis, 'osis atom card').not.toBeNull();
    expect(osis![0]).toContain('class="glossary-core-atom-intuition"');
    expect(osis![0]).toContain('Feels like');
    expect(osis![0]).toMatch(/Blind faith in your set/);
  });

  it('shapes the intuition line for every atom card (all cards wired through)', async () => {
    const html = await glossary();
    const cardCount      = (html.match(/class="glossary-core-atom-card"/g) ?? []).length;
    const intuitionCount = (html.match(/class="glossary-core-atom-intuition"/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(0);
    expect(intuitionCount).toBe(cardCount);
  });
});
