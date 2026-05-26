/**
 * Eclipse intuition slice (2026-05-25).
 *
 * Adds movement-intuition prose for eclipse on the trick-detail page.
 * The prose surfaces the airborne-hop-over topology framing in
 * movement-language terms (jump-and-hover; held-delay leg-over
 * chassis lifted off the ground) without modifying notation, ADD
 * accounting, or any ontology field.
 *
 * Layer separation per freestyleTrickIntuition.ts JSDoc: editorial
 * prose only; renders between trick-about and trick-notation.
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
import { getTrickIntuition } from '../../src/content/freestyleTrickIntuition';

const { dbPath } = setTestEnv('3166');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug:                'eclipse',
    canonical_name:      'eclipse',
    adds:                '3',
    base_trick:          'eclipse',
    trick_family:        'eclipse',
    category:            'compound',
    review_status:       'expert_reviewed',
    is_active:           1,
    operational_notation: 'SET > (jump) [BOD] > SAME or OP INSIDE [DEL] > OP OUT [DEX] > (land)',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Eclipse intuition entry — content module', () => {
  it('TRICK_INTUITION_ENTRIES carries an eclipse entry with the airborne-hop-over framing', () => {
    const entry = getTrickIntuition('eclipse');
    expect(entry).not.toBeNull();
    expect(entry?.prose ?? '').toMatch(/jump.*support leg/i);
    expect(entry?.prose ?? '').toMatch(/held-delay leg-over chassis/i);
    expect(entry?.prose ?? '').toMatch(/hop-over/i);
    expect(entry?.attribution ?? '').toMatch(/Red pt1/i);
    expect(entry?.attribution ?? '').toMatch(/airborne hop-over topology/i);
  });

  it('eclipse intuition does NOT contain notation jargon (no [TOKEN] brackets, no ADD numbers as primary framing)', () => {
    const entry = getTrickIntuition('eclipse');
    // Bracketed token forms ([BOD] / [DEX] / [DEL]) belong in notation
    // layer; intuition prose should be readable without bracket vocab.
    expect(entry?.prose ?? '').not.toMatch(/\[BOD\]|\[DEX\]|\[DEL\]/);
  });
});

describe('Eclipse intuition rendering on /freestyle/tricks/eclipse', () => {
  it('detail page renders the "Movement intuition" section with the eclipse prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eclipse');
    expect(res.status).toBe(200);
    // The intuition partial renders a section heading "Movement intuition".
    expect(res.text).toMatch(/Movement intuition/i);
    // The signature framing phrases appear in the rendered HTML.
    expect(res.text).toMatch(/jump-and-hover/i);
    expect(res.text).toMatch(/held-delay leg-over chassis/i);
  });

  it('detail page preserves the existing 3 ADD chip + JOB tokens (intuition does NOT replace notation)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/eclipse');
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">3 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
  });
});
