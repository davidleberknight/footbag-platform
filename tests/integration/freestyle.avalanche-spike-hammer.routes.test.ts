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
import { insertFreestyleTrick } from '../fixtures/factories';
import { RESOLVED_FORMULAS_SPRINT_1 } from '../../src/content/freestyleResolvedFormulas';

const { dbPath } = setTestEnv('3178');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'avalanche',
    canonical_name: 'avalanche',
    adds: '5', base_trick: 'paradox-illusion', trick_family: 'paradox-illusion',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
    aliases_json: '["stepping ducking paradox illusion"]',
  });
  insertFreestyleTrick(db, {
    slug: 'spike_hammer',
    canonical_name: 'spike hammer',
    adds: '5', base_trick: 'paradox-mirage', trick_family: 'paradox-mirage',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
    aliases_json: '["stepping ducking paradox mirage"]',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_FORMULAS_SPRINT_1 — avalanche + spike-hammer entries', () => {
  it('avalanche carries FB.org-confirmed JOB with OP OUT [PDX] [DEX] (illusion base)', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'avalanche');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.base).toBe('paradox-illusion');
    expect(entry?.operationalNotation).toBe('CLIP > OP IN [DEX] > DUCK [BOD] > OP OUT [PDX] [DEX] > OP TOE [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/Stepping Ducking Paradox Illusion/i);
    expect(entry?.provenance ?? '').toMatch(/structural\s+twin\s+of\s+spike-hammer/i);
  });

  it('spike-hammer carries FB.org-confirmed JOB with OP IN [PDX] [DEX] (mirage base)', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'spike_hammer');
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.base).toBe('paradox-mirage');
    expect(entry?.operationalNotation).toBe('CLIP > OP IN [DEX] > DUCK [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]');
    expect(entry?.provenance ?? '').toMatch(/structural\s+twin\s+of\s+avalanche/i);
  });

  it('both entries share an identical modifier stack and differ only in the dex direction', () => {
    const av = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'avalanche');
    const sh = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'spike_hammer');
    expect(av?.totalAdd).toBe(sh?.totalAdd);
    // Both share "OP IN [DEX] > DUCK [BOD]" prefix and "OP TOE [DEL]" tail.
    expect(av?.operationalNotation ?? '').toContain('OP IN [DEX] > DUCK [BOD]');
    expect(sh?.operationalNotation ?? '').toContain('OP IN [DEX] > DUCK [BOD]');
    expect(av?.operationalNotation ?? '').toContain('OP TOE [DEL]');
    expect(sh?.operationalNotation ?? '').toContain('OP TOE [DEL]');
    // Difference: OP OUT (avalanche/illusion) vs OP IN (spike-hammer/mirage)
    expect(av?.operationalNotation ?? '').toContain('OP OUT [PDX]');
    expect(sh?.operationalNotation ?? '').toContain('OP IN [PDX]');
  });
});

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
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    for (const slug of ['avalanche', 'spike_hammer']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx).toBeGreaterThan(-1);
      const articleOpen = res.text.lastIndexOf('<article', idx);
      const articleClose = res.text.indexOf('</article>', idx);
      const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
      expect(card).toMatch(/class="dict-trick-row-job-value">/);
      expect(card).not.toContain('canonical decomposition pending');
    }
  });
});
