/**
 * Avalanche, spike, and hammer canonical trick promotion: routes and rendering.
 * avalanche + spike-hammer. Structural twins: both 5 ADD, identical
 * 3-operator modifier stack (stepping + ducking + paradox-X), differ
 * only in the base atom (illusion vs mirage).
 *
 * Both folk-names compress a 3-operator-stack reading into a single
 * word — textbook examples of the glossary §composition "Structural
 * compression" doctrine. JOBs FB.org-confirmed verbatim from
 * paradoxMoves.txt.
 *
 * JOB difference: dex direction after DUCK [BOD] is OP OUT [PDX] [DEX]
 * for illusion (avalanche), OP IN [PDX] [DEX] for mirage (spike-hammer).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertTrickAsRebuilt } from '../fixtures/stagedFormula';

const { dbPath } = setTestEnv('3178');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertTrickAsRebuilt(db, {
    slug: 'avalanche',
    operational_notation: 'CLIP > OP IN [DEX] > DUCK [BOD] > SAME OUT [PDX] [DEX] > OP TOE [DEL]',
    canonical_name: 'avalanche',
    adds: '5', base_trick: 'paradox-illusion', trick_family: 'paradox-illusion',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    aliases_json: '["stepping ducking paradox illusion"]',
  });
  insertTrickAsRebuilt(db, {
    slug: 'spike_hammer',
    operational_notation: 'CLIP > OP IN [DEX] > DUCK [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]',
    canonical_name: 'spike hammer',
    adds: '5', base_trick: 'paradox-mirage', trick_family: 'paradox-mirage',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    aliases_json: '["stepping ducking paradox mirage"]',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));


describe('Avalanche + spike-hammer detail pages — first-class JOB + ADD', () => {
  it('/freestyle/tricks/avalanche renders 5 ADD + full token set + folk-name alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/avalanche');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    for (const token of ['CLIP', 'OP', 'IN', '[DEX]', 'DUCK', '[BOD]', 'OUT', '[PDX]', 'TOE', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
    // Folk-name alias surfaces in "Also known as"
    expect(res.text).toMatch(/stepping ducking paradox illusion/i);
  });

  it('/freestyle/tricks/spike-hammer renders 5 ADD + same tokens (different dex direction) + folk-name alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/spike_hammer');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    for (const token of ['CLIP', 'OP', 'IN', '[DEX]', 'DUCK', '[BOD]', '[PDX]', 'TOE', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
    // Folk-name alias surfaces in "Also known as"
    expect(res.text).toMatch(/stepping ducking paradox mirage/i);
  });
});

describe('Avalanche + spike-hammer browse rendering — FIRST_CLASS_TIER_2', () => {
  it('both browse cards render JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    for (const slug of ['avalanche', 'spike_hammer']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx).toBeGreaterThan(-1);
      const articleOpen = res.text.lastIndexOf('<article', idx);
      const articleClose = res.text.indexOf('</article>', idx);
      const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
      expect(card).toMatch(/class="dict-trick-row-notation-value">/);
      expect(card).not.toContain('canonical decomposition pending');
    }
  });
});
