/**
 * Trick-detail About fallback and structurally-related-tricks rendering.
 *
 *   - A compound with no usable database description opens with its build path
 *     and no generated sentence in place of a description.
 *   - A thin / placeholder database description is never displayed publicly, and
 *     nothing generated stands in for it (accurate silence over generic filler).
 *   - A family-null trick with no structural relationship renders no
 *     Structurally related tricks section.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedStagedOperatorsAndModifiers } from '../fixtures/stagedOperators';
import { insertFreestyleTrick, insertFreestyleTrickModifier, insertFreestyleTrickModifierLink } from '../fixtures/factories';

const { dbPath } = setTestEnv('3231');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

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

  // The operators and the placed modifiers the pages link, as the rebuild seeds them.
  seedStagedOperatorsAndModifiers(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('trick-detail About fallback + relatives', () => {
  // Defect caught: a page with no stored description opens with a sentence
  // assembled from its parts, which repeats the build path beside it.
  it('opens a description-less compound with its build path and no generated sentence', async () => {
    const res = await page('/freestyle/tricks/spinning_whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-build-path');
    expect(res.text).not.toContain('data-structural-about');
    expect(res.text).not.toContain('builds on');
  });

  it('no longer renders a separate Structural Neighbors block (consolidated into Structurally related tricks)', async () => {
    const res = await page('/freestyle/tricks/spinning_whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-section="structural-neighbors"');
    expect(res.text).not.toContain('Structural Neighbors');
  });

  it('never displays a thin placeholder description and adds no generated filler when unqualified', async () => {
    const res = await page('/freestyle/tricks/popular_thing');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Popular freestyle trick.');
    expect(res.text).not.toContain('data-structural-about');
  });

  it('renders no Structurally related tricks section for a family-null trick with no relatives', async () => {
    const res = await page('/freestyle/tricks/lonely_null');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Structurally related tricks');
  });
});
