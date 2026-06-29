/**
 * Technique Notes disclosure on the trick-detail page.
 *
 * Execution, Learning Notes, and Prerequisites are grouped into a single
 * compact disclosure, collapsed by default so the page does not grow. The
 * block sits below the canonical reference material, stays distinct from the
 * canonical About explanation, and renders only when the trick has at least
 * one of the three instructional fields. A trick with none renders no block.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3421');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage',
    trick_family: 'mirage', category: 'dex',
    operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
    description: 'The canonical About explanation for mirage.',
    execution_summary: 'Set the bag straight up and carry the dex leg over it.',
    learning_notes: 'Set straight, not arced.',
    prerequisite_notes: 'Repeatable toe delays on both feet.',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'dyno', canonical_name: 'dyno', adds: '3', base_trick: 'dyno',
    trick_family: 'dyno', category: 'dex',
    operational_notation: 'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    description: 'A trick with no instructional prose.',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Technique Notes disclosure', () => {
  it('renders one collapsed disclosure grouping the three instructional parts', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);

    // a single disclosure, collapsed by default (no open attribute)
    expect(res.text).toContain('class="trick-technique-collapsible"');
    expect(res.text).toMatch(/<details class="trick-technique-collapsible"(?![^>]*\bopen\b)/);
    expect(res.text).toContain('<summary>Technique Notes</summary>');

    // the three parts are sub-blocks, not standalone full-width sections
    expect(res.text).toContain('>Execution</h3>');
    expect(res.text).toContain('>Learning Notes</h3>');
    expect(res.text).toContain('>Before You Try This</h3>');
    expect(res.text).not.toMatch(/<h2[^>]*>\s*Execution\s*</i);
    expect(res.text).not.toMatch(/<h2[^>]*>\s*Learning notes\s*</i);

    // content is present
    expect(res.text).toContain('carry the dex leg over it');
    expect(res.text).toContain('Repeatable toe delays');

    // coexists with, and stays distinct from, the canonical About explanation
    expect(res.text).toContain('The canonical About explanation for mirage.');
  });

  it('renders no Technique Notes block when the trick has no instructional prose', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/dyno');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('trick-technique-collapsible');
    expect(res.text).not.toContain('<summary>Technique Notes</summary>');
  });
});
