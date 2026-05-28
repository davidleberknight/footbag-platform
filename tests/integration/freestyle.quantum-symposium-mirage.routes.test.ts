/**
 * Pre-Adrian deferred-candidate promotion slice (2026-05-26) —
 * quantum-symposium-mirage.
 *
 * 4 ADD = quantum(+1) + symposium-mirage(3). FB.org-confirmed JOB
 * from fborg-4add.txt. Promoted under the modern "Quantum" naming
 * per Red pt2 retirement of the "toe-" prefix; the folk-name
 * "Backside Symposium Toe Blur" is wired as a pure S3 alias.
 *
 * Mirrors the toe-blur ≡ quantum-mirage / toe-blizzard ≡ quantum-illusion
 * pattern established in earlier slices.
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

const { dbPath } = setTestEnv('3180');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'quantum-symposium-mirage',
    canonical_name: 'quantum symposium mirage',
    adds: '4', base_trick: 'mirage', trick_family: 'mirage',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
    aliases_json: '["backside symposium toe blur"]',
  });
  // Mirror loader 19's alias-table side effect
  const insertAlias = db.prepare(`
    INSERT INTO freestyle_trick_aliases
      (alias_slug, alias_text, trick_slug, alias_type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertAlias.run('backside-symposium-toe-blur', 'backside symposium toe blur', 'quantum-symposium-mirage', 'common', new Date().toISOString());
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_FORMULAS_SPRINT_1 — quantum-symposium-mirage entry', () => {
  it('overlay carries FB.org-confirmed JOB + 4 ADD + quantum-symposium derivation', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'quantum-symposium-mirage');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(4);
    expect(entry?.baseAdd).toBe(2);
    expect(entry?.base).toBe('mirage');
    expect(entry?.operationalNotation).toBe('TOE > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/Backside Symposium Toe Blur/i);
    expect(entry?.provenance ?? '').toMatch(/Red pt2/i);
  });
});

describe('quantum-symposium-mirage detail page — first-class JOB + ADD', () => {
  it('/freestyle/tricks/quantum-symposium-mirage renders 4 ADD + (no plant while) pre-state + symposium body fusion', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/quantum-symposium-mirage');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">4 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    expect(res.text).toMatch(/class="op-token[^"]*pre-state[^"]*"[^>]*>\(no plant while\)</);
    for (const token of ['TOE', 'OP', 'IN', '[DEX]', '[BOD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('detail page surfaces "backside symposium toe blur" as folk-name alias in S3 "Also known as"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/quantum-symposium-mirage');
    expect(res.text).toContain('Also known as');
    expect(res.text).toMatch(/backside symposium toe blur/i);
  });

  it('browse card renders JOB + ADD inline (not "notation pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="quantum-symposium-mirage"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-job-value">/);
    expect(card).not.toContain('notation pending');
  });
});
