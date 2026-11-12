/**
 * Quantum-symposium-mirage canonical trick promotion: routes and rendering.
 * quantum-symposium-mirage.
 *
 * 4 ADD = quantum(+1) + symposium-mirage(3). FB.org-confirmed JOB
 * from fborg-4add.txt. Promoted under the modern "Quantum" naming
 * per Red's retirement of the "toe-" prefix; the folk-name
 * "Backside Symposium Toe Blur" is wired as a pure S3 alias.
 *
 * Mirrors the toe-blur ≡ quantum-mirage / toe-blizzard ≡ quantum-illusion
 * pattern established in earlier slices.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrickAlias } from '../fixtures/factories';
import { insertTrickAsRebuilt } from '../fixtures/stagedFormula';

const { dbPath } = setTestEnv('3180');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertTrickAsRebuilt(db, {
    slug: 'quantum_symposium_mirage',
    canonical_name: 'quantum symposium mirage',
    adds: '4', base_trick: 'mirage', trick_family: 'mirage',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'TOE > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',
    aliases_json: '["backside symposium toe blur"]',
  });
  // Mirror loader 19's alias-table side effect
  insertFreestyleTrickAlias(
    db, 'backside_symposium_toe_blur', 'quantum_symposium_mirage',
    'backside symposium toe blur',
    { alias_type: 'common', alias_origin_producer: 'expert-additions' },
  );
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));


describe('quantum-symposium-mirage detail page — first-class JOB + ADD', () => {
  it('/freestyle/tricks/quantum_symposium_mirage renders 4 ADD + (no plant while) pre-state + symposium body fusion', async () => {
    const res = await page('/freestyle/tricks/quantum_symposium_mirage');
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
    const res = await page('/freestyle/tricks/quantum_symposium_mirage');
    expect(res.text).toContain('Also known as');
    expect(res.text).toMatch(/backside symposium toe blur/i);
  });

  it('browse card renders JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="quantum_symposium_mirage"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-notation-value">/);
    expect(card).not.toContain('canonical decomposition pending');
  });
});
