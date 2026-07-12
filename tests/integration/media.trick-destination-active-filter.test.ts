/**
 * The media-card ontology cross-link resolver (resolveTrickTags) must surface
 * only active tricks as destinations. An inactive or pending trick's tag
 * resolves to nothing, so no media card renders a destination chip whose
 * /freestyle/tricks/<slug> link would 404 against the active-only detail route.
 *
 * Pins both resolution branches against the active filter: the exact-slug match
 * and the alias-to-canonical join.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3140');
let resolveTrickTags: typeof import('../../src/db/db')['resolveTrickTags'];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'active_dest_trick',   canonical_name: 'Active Dest Trick',   adds: '3', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'inactive_dest_trick', canonical_name: 'Inactive Dest Trick', adds: '3', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'alias_target_active',   canonical_name: 'Alias Target Active',   adds: '3', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'alias_target_inactive', canonical_name: 'Alias Target Inactive', adds: '3', is_active: 0 });
  insertFreestyleTrickAlias(db, 'alias_to_active',   'alias_target_active',   'Alias To Active');
  insertFreestyleTrickAlias(db, 'alias_to_inactive', 'alias_target_inactive', 'Alias To Inactive');
  db.close();
  resolveTrickTags = (await import('../../src/db/db')).resolveTrickTags;
});

afterAll(() => cleanupTestDb(dbPath));

describe('resolveTrickTags — only active tricks resolve to a destination', () => {
  it('resolves an active trick by its exact slug', () => {
    expect(resolveTrickTags(['active_dest_trick']).map(r => r.matched)).toContain('active_dest_trick');
  });

  it('omits an inactive trick (exact-slug branch)', () => {
    expect(resolveTrickTags(['inactive_dest_trick'])).toEqual([]);
  });

  it('resolves an alias whose canonical trick is active', () => {
    const res = resolveTrickTags(['alias_to_active']);
    expect(res.map(r => r.matched)).toContain('alias_to_active');
    expect(res.find(r => r.matched === 'alias_to_active')?.canonicalSlug).toBe('alias_target_active');
  });

  it('omits an alias whose canonical trick is inactive (alias-join branch)', () => {
    expect(resolveTrickTags(['alias_to_inactive'])).toEqual([]);
  });

  it('a mixed batch returns only the active destinations', () => {
    const matched = resolveTrickTags(
      ['active_dest_trick', 'inactive_dest_trick', 'alias_to_active', 'alias_to_inactive'],
    ).map(r => r.matched).sort();
    expect(matched).toEqual(['active_dest_trick', 'alias_to_active']);
  });
});
