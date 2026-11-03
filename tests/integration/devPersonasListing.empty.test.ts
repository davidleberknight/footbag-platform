/**
 * GET /dev/personas against a database holding no seeded persona.
 *
 * The page checks one thing, whether any persona is loaded. With none it says
 * so and offers nothing else: no persona cards, no Switch link, no refresh, no
 * real-member switch, because every one of them would lead nowhere. Once a
 * persona is seeded the full listing returns.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';

const { dbPath } = setTestEnv('4743');

// The /dev router mounts when footbagEnv is 'development' or 'staging'; pin it
// before importApp boots the frozen config singleton.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

// Every control the listing can offer, found by its target rather than its words.
const CONTROLS = [
  // Handlebars escapes '=' inside an attribute, so the marker stops before it.
  'href="/dev/switch?as',
  'action="/dev/personas/refresh"',
  'action="/dev/build-claim"',
  'class="card"',
];

describe('GET /dev/personas with no persona loaded', () => {
  it('shows only the empty state, then the full listing once a persona is seeded', async () => {
    // Broken, a tester on an unseeded database would be offered Switch links and
    // a refresh that all fail, instead of being told the data is missing.
    const empty = await request(createApp()).get('/dev/personas');
    expect(empty.status).toBe(200);
    expect(empty.text).toContain('class="empty-state"');
    for (const control of CONTROLS) {
      expect(empty.text, `unseeded page offers ${control}`).not.toContain(control);
    }

    // Positive control: one seeded catalog persona brings the listing and its
    // Switch back, so the absences above are the empty state's, not a broken page.
    const spec = CANONICAL_PERSONAS.find((p) => !p.blockedBy && p.tier === 'tier1');
    expect(spec, 'catalog has an unblocked Tier 1 persona').toBeDefined();
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    seedPersona(db, spec!);
    db.close();

    const loaded = await request(createApp()).get('/dev/personas');
    expect(loaded.status).toBe(200);
    expect(loaded.text).not.toContain('class="empty-state"');
    for (const control of CONTROLS) {
      expect(loaded.text, `seeded page lacks ${control}`).toContain(control);
    }
  });
});
