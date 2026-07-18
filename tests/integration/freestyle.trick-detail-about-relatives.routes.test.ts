/**
 * Trick-detail About fallback and structurally-related-tricks rendering.
 *
 *   - A single established-operator compound with no usable database description
 *     renders the high-confidence generated About line (base + operator).
 *   - A thin / placeholder database description is never displayed publicly, and
 *     a page that does not qualify for the generated fallback shows no About prose
 *     at all (accurate silence over generic filler).
 *   - A family-null trick with no structural relationship renders no
 *     Structurally related tricks section.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickModifier, insertFreestyleTrickModifierLink } from '../fixtures/factories';

const { dbPath } = setTestEnv('3231');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Base atom + a single-established-operator compound (spinning is Tier-1).
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'spinning', modifier_type: 'body' });
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '1', base_trick: 'whirl', trick_family: 'whirl' });
  insertFreestyleTrick(db, { slug: 'spinning_whirl', canonical_name: 'spinning whirl', adds: '2', base_trick: 'whirl', trick_family: 'whirl' });
  insertFreestyleTrickModifierLink(db, 'spinning_whirl', 'spinning');

  // A placeholder-description trick with no operator links: description is
  // suppressed and it does not qualify for the generated fallback.
  insertFreestyleTrick(db, {
    slug: 'popular_thing', canonical_name: 'popular thing', adds: '2',
    base_trick: 'whirl', trick_family: 'whirl', description: 'Popular freestyle trick.',
  });

  // A family-null trick with nothing structurally related.
  insertFreestyleTrick(db, { slug: 'lonely_null', canonical_name: 'lonely null', adds: '2', base_trick: 'lonely_null', trick_family: null });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('trick-detail About fallback + relatives', () => {
  it('renders the high-confidence generated About for a single established-operator compound', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/spinning_whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-structural-about');
    expect(res.text).toContain('Spinning Whirl builds on Whirl, adding the spinning operator.');
  });

  it('no longer renders a separate Structural Neighbors block (consolidated into Structurally related tricks)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/spinning_whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-section="structural-neighbors"');
    expect(res.text).not.toContain('Structural Neighbors');
  });

  it('never displays a thin placeholder description and adds no generated filler when unqualified', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/popular_thing');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Popular freestyle trick.');
    expect(res.text).not.toContain('data-structural-about');
  });

  it('renders no Structurally related tricks section for a family-null trick with no relatives', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/lonely_null');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Structurally related tricks');
  });
});
