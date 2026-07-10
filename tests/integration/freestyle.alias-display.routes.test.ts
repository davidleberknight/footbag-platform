/**
 * Alias visibility: the alias_display gate and the active-target rule.
 *
 * An alias carries a semantic class (alias_type) and a separate public-display
 * gate (alias_display). Public "Also called" display shows only alias_display=1
 * rows. Search and redirect ignore the display gate but resolve only to active
 * tricks: a non-display alias (technical, typo) still finds and redirects to its
 * trick, while an alias pointing at an inactive trick never publicly redirects or
 * surfaces. Common display aliases keep displaying, searching, and redirecting.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3997');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Active trick with a displayed common alias and a hidden technical alias.
  insertFreestyleTrick(db, {
    slug: 'legover',
    canonical_name: 'legover',
    adds: '2',
    base_trick: 'legover',
    trick_family: 'legover',
    category: 'dex',
    review_status: 'expert_reviewed',
    is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  });
  // An inactive trick, and a suppressed alias pointing at it.
  insertFreestyleTrick(db, {
    slug: 'old_inactive',
    canonical_name: 'old inactive',
    adds: '2',
    base_trick: 'old_inactive',
    trick_family: 'legover',
    category: 'dex',
    review_status: 'pending',
    is_active: 0,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  });

  // display=1 common alias (shows, searches, redirects)
  insertFreestyleTrickAlias(db, 'leggymcshow', 'legover', 'Leggy McShow',
    { alias_type: 'common', alias_display: 1 });
  // display=0 technical alias (search + redirect only, never shown)
  insertFreestyleTrickAlias(db, 'lgvrtech', 'legover', 'LGVR-HIDDEN',
    { alias_type: 'technical', alias_display: 0 });
  // display=0 suppressed alias pointing at an inactive trick (never public)
  insertFreestyleTrickAlias(db, 'oldsuppressed', 'old_inactive', 'Old Suppressed Name',
    { alias_type: 'suppressed', alias_display: 0 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('freestyle alias display gate + active-target rule', () => {
  it('displays a display=1 alias but hides a display=0 alias in "Also called"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/legover');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Leggy McShow');       // alias_display=1 shows
    expect(res.text).not.toContain('LGVR-HIDDEN');     // alias_display=0 hidden
  });

  it('resolves a display=0 alias in search when the target is active', async () => {
    const res = await request(await createApp()).get('/freestyle/search?q=LGVR-HIDDEN');
    expect(res.status).toBe(200);
    expect(res.text).toContain('legover');             // the hidden alias still finds its trick
  });

  it('does not surface an inactive target in search', async () => {
    const res = await request(await createApp()).get('/freestyle/search?q=Old Suppressed Name');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('old_inactive');    // inactive target never surfaces
  });

  it('301-redirects a display=0 alias to its active canonical trick', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/lgvrtech');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/legover');
  });

  it('does not public-redirect an alias whose target is inactive (404, never a 301 to a non-public page)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/oldsuppressed');
    expect(res.status).toBe(404);
    expect(res.headers.location).toBeUndefined();
  });

  it('preserves the existing common alias: displays, searches, and redirects', async () => {
    const detail = await request(await createApp()).get('/freestyle/tricks/legover');
    expect(detail.text).toContain('Leggy McShow');
    const search = await request(await createApp()).get('/freestyle/search?q=Leggy McShow');
    expect(search.text).toContain('legover');
    const redirect = await request(await createApp()).get('/freestyle/tricks/leggymcshow');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe('/freestyle/tricks/legover');
  });
});
