/**
 * Integration tests for the decomposition table inside /freestyle/glossary
 * (Symbolic Composition section).
 *
 * The compact table replaces the former five-panel derivation atlas. It reads a
 * handful of named tricks as the operators + base they are built from, in two
 * registers: structural equivalence and educational approximation. The
 * `derivation-atlas` anchor is preserved for inbound deep-links; it lives inside
 * the Runs & Sequences chapter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3156');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

describe('GET /freestyle/glossary — decomposition table', () => {
  it('renders the decomposition table at the preserved derivation-atlas anchor', async () => {
    const html = await glossary();
    expect(html).toContain('id="derivation-atlas"');
    expect(html).toContain('Decomposition table');
  });

  it('reads the key tricks as their structural decompositions', async () => {
    const html = await glossary();
    expect(html).toContain('Quantum Osis');            // Torque
    expect(html).toContain('Whirling Osis');            // Blender
    expect(html).toContain('Gyro Quantum Osis');        // Mobius ladder
    expect(html).toContain('Stepping Butterfly');       // Ripwalk
    expect(html).toContain('Stepping Paradox Mirage');  // Blur
    expect(html).toContain('Reverse Swirling Osis');    // Twirl (structural)
  });

  it('distinguishes the structural-equivalence and educational-approximation registers', async () => {
    const html = await glossary();
    expect(html).toContain('&equiv;');
    expect(html).toContain('&asymp;');
    // The approximation row (Twirl) carries the movement-feel reading.
    expect(html).toContain('Swirl + Spin (movement feel)');
  });

  it('links each trick row to its detail page', async () => {
    const html = await glossary();
    for (const slug of ['torque', 'blender', 'mobius', 'ripwalk', 'blur', 'twirl']) {
      expect(html, `link ${slug}`).toContain(`href="/freestyle/tricks/${slug}"`);
    }
  });

  it('renders the decomposition table with its deep-link anchor and heading', async () => {
    const html = await glossary();
    // the table lives inside the Runs & Sequences chapter, reachable by its anchor
    expect(html).toContain('id="derivation-atlas"');
    expect(html).toContain('Decomposition table');
  });

  it('does not name individuals in the table section', async () => {
    const html = await glossary();
    const idx = html.indexOf('id="derivation-atlas"');
    expect(idx).toBeGreaterThan(0);
    // Scope to the table itself (heading + intro + rows).
    const tableEnd = html.indexOf('</table>', idx);
    expect(tableEnd).toBeGreaterThan(idx);
    const section = html.slice(idx, tableEnd);
    expect(section).not.toMatch(/\bRed\b/);
    expect(section).not.toMatch(/\bHusted\b/);
  });
});

describe('GET /freestyle/derivation-pilot — retired', () => {
  it('returns 404 (route removed; content now lives in the glossary)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/derivation-pilot');
    expect(res.status).toBe(404);
  });
});
