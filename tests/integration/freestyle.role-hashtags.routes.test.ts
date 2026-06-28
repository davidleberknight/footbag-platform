/**
 * Role-aware hashtags + modifier/operator routing.
 *
 * Modifiers and operators live in freestyle_tricks for decomposition and ADD
 * math, but they are not tricks. These tests pin the contract that:
 *   - a concept's hashtag is rendered from its role, never blindly from its slug:
 *     a trick is a bare tag, a set is #set_, an operator is #operator_;
 *   - the curator role override wins over the stored modifier_type, so whirling
 *     reads #set_whirling though its modifier_type is body;
 *   - the trick-detail route redirects a modifier/operator row to its operator
 *     page, while set primitives (dual-role pixie/fairy) still render as tricks;
 *   - trick search excludes modifier/operator rows but keeps sets and tricks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickModifier } from '../fixtures/factories';

const { dbPath } = setTestEnv('3214');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifier registry: a body modifier (spinning), a body modifier the curator
  // pins as a set (whirling), and two set primitives (pixie, atomic). These
  // drive the operators-index hashtags.
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'Spinning', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'whirling', modifier_name: 'Whirling', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'pixie',    modifier_name: 'Pixie',    add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set'  });
  insertFreestyleTrickModifier(db, { slug: 'atomic',   modifier_name: 'Atomic',   add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set'  });

  // freestyle_tricks rows. A modifier-category row (spinning) for the redirect +
  // search exclusion; set-category rows (pixie dual-role, atomic set-only) for
  // the trick-surface hashtag; a normal compound trick for search inclusion.
  insertFreestyleTrick(db, { slug: 'spinning',          canonical_name: 'spinning',          category: 'modifier' });
  insertFreestyleTrick(db, { slug: 'pixie',             canonical_name: 'pixie',             category: 'set' });
  insertFreestyleTrick(db, { slug: 'atomic',            canonical_name: 'atomic',            category: 'set' });
  insertFreestyleTrick(db, { slug: 'spinning-butterfly', canonical_name: 'spinning butterfly', category: 'compound', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Slice one operator row's markup out of the flat operators-index HTML.
function operatorRow(html: string, slug: string): string {
  const start = html.indexOf(`id="operator-${slug}"`);
  if (start < 0) return '';
  const next = html.indexOf('id="operator-', start + 1);
  return html.slice(start, next < 0 ? start + 1200 : next);
}

describe('GET /freestyle/operators — role-aware hashtags', () => {
  it('renders a modifier as #operator_, never a bare trick tag', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(operatorRow(res.text, 'spinning')).toContain('#operator_spinning');
    expect(operatorRow(res.text, 'spinning')).not.toContain('>#spinning<');
  });

  it('does not list set primitives, so their #set_ hashtags are not on this page', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.text).not.toContain('#set_pixie');
    expect(res.text).not.toContain('#set_atomic');
  });
});

describe('GET /freestyle/modifier/:slug — stub hashtag', () => {
  it('renders the role-aware hashtag on a stub (atomic set → #set_atomic)', async () => {
    // atomic is a set with no authored teaching page, so its modifier route
    // still resolves to a data-driven stub (unlike pixie, which now redirects
    // to its set-encyclopedia page).
    const res = await request(await createApp()).get('/freestyle/modifier/atomic');
    expect(res.status).toBe(200);
    expect(res.text).toContain('#set_atomic');
  });

  it('honors the curator role override: whirling is a first-class set, so its modifier route redirects to the set page', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/whirling');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/whirling');
  });
});

describe('GET /freestyle/tricks/:slug — modifier/operator redirect', () => {
  it('redirects a modifier-category row to its operator page (301)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/spinning');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/modifier/spinning');
  });

  it('does NOT redirect a set primitive — pixie still renders as a trick (dual-role)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/pixie');
    expect(res.status).toBe(200);
    // On the trick surface, the dual-role concept shows its bare trick tag.
    expect(res.text).toContain('#pixie');
  });

  it('shows a set-only concept its set tag on the trick surface (atomic → #set_atomic)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atomic');
    expect(res.status).toBe(200);
    expect(res.text).toContain('#set_atomic');
  });
});

describe('GET /freestyle/search — excludes modifier/operator rows', () => {
  it('returns tricks but not modifier rows', async () => {
    const res = await request(await createApp()).get('/freestyle/search?q=spin');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/freestyle/tricks/spinning-butterfly');
    // The modifier-category "spinning" row must not appear as a search result.
    expect(res.text).not.toContain('/freestyle/tricks/spinning"');
  });

  it('keeps set primitives in search (pixie is a dual-role trick)', async () => {
    const res = await request(await createApp()).get('/freestyle/search?q=pixie');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/freestyle/tricks/pixie');
  });
});
