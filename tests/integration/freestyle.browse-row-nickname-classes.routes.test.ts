/**
 * Browse-row nicknames: only the community-nickname class reaches a browse row.
 *
 * An alias carries a semantic class (alias_type) and a public-display state
 * (alias_display). A browse row prints only a shown community nickname beside a
 * trick name. An abbreviation, a hidden decomposition, a same-side marker and a
 * misspelling all resolve in search and none of them appear beside the name.
 *
 * A shown structural name (a genuine decomposition name of the same movement)
 * belongs on the trick's own page, not beside its name on the list; that is
 * asserted here too, on both pages, so the rule is pinned in both directions.
 *
 * These assertions read the rendered page rather than the table, because a table
 * assertion passes while a service fallback quietly republishes what curation
 * turned off.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

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

const { dbPath } = setTestEnv('4072');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertFreestyleTrick(db, {
    slug: 'nickname_host',
    canonical_name: 'nickname host',
    adds: '3',
    base_trick: 'nickname_host',
    trick_family: 'legover',
    category: 'dex',
    review_status: 'expert_reviewed',
    is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  });
  insertFreestyleTrick(db, {
    slug: 'exception_host',
    canonical_name: 'exception host',
    adds: '3',
    base_trick: 'exception_host',
    trick_family: 'legover',
    category: 'dex',
    review_status: 'expert_reviewed',
    is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  });

  // The nickname class: a name the community says, displayed.
  insertFreestyleTrickAlias(db, 'silo_name', 'nickname_host', 'Silo Name',
    { alias_type: 'common', alias_display: 1 });

  // One alias per non-nickname class, each search-only.
  insertFreestyleTrickAlias(db, 'nh_abbrev', 'nickname_host', 'NH Abbrev',
    { alias_type: 'technical', alias_display: 0 });
  insertFreestyleTrickAlias(db, 'stepping_nickname_host', 'nickname_host', 'Stepping Nickname Host',
    { alias_type: 'structural', alias_display: 0 });
  insertFreestyleTrickAlias(db, 'nickname_host_same_side', 'nickname_host', 'Nickname Host Same Side',
    { alias_type: 'positional', alias_display: 0 });
  insertFreestyleTrickAlias(db, 'nicknme_host', 'nickname_host', 'Nicknme Host',
    { alias_type: 'typo', alias_display: 0 });

  // A shown structural name: on the trick's page, never on its browse row.
  insertFreestyleTrickAlias(db, 'reverse_exception_host', 'exception_host', 'Reverse Exception Host',
    { alias_type: 'structural', alias_display: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks — which alias classes reach a browse row', () => {
  it('shows the community nickname beside the trick name', async () => {
    const res = await page('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Silo Name');
  });

  it('never shows an abbreviation', async () => {
    const res = await page('/freestyle/tricks');
    expect(res.text).not.toContain('NH Abbrev');
  });

  it('never shows a decomposition used as a name', async () => {
    const res = await page('/freestyle/tricks');
    expect(res.text).not.toContain('Stepping Nickname Host');
  });

  it('never shows a same-side or opposite-side marker', async () => {
    const res = await page('/freestyle/tricks');
    expect(res.text).not.toContain('Nickname Host Same Side');
  });

  it('never shows a misspelling', async () => {
    const res = await page('/freestyle/tricks');
    expect(res.text).not.toContain('Nicknme Host');
  });

  // Defect caught: a structural name printed in quotes beside the trick on the
  // list, where a reader takes it for a community nickname.
  it('keeps a shown structural name off the browse row', async () => {
    const res = await page('/freestyle/tricks');
    expect(res.text).toContain('exception host');
    expect(res.text).not.toContain('Reverse Exception Host');
  });

  // Defect caught: a trick's genuine structural name searchable but missing from
  // its own page.
  it('shows that structural name on the trick page', async () => {
    const res = await page('/freestyle/tricks/exception_host');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Reverse Exception Host');
  });
});

describe('GET /freestyle/search — every class still resolves', () => {
  it('finds the trick from an abbreviation the browse row hides', async () => {
    const res = await page('/freestyle/search?q=NH Abbrev');
    expect(res.status).toBe(200);
    expect(res.text).toContain('nickname_host');
  });

  it('finds the trick from a misspelling the browse row hides', async () => {
    const res = await page('/freestyle/search?q=Nicknme Host');
    expect(res.status).toBe(200);
    expect(res.text).toContain('nickname_host');
  });
});
