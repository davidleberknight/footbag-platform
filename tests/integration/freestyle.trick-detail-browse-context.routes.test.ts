/**
 * GET /freestyle/tricks/:slug — detail-page echoes of the browse systems.
 *
 * A trick's detail page should explain why it appears in each browse surface.
 * Two surfaces are pinned here:
 *   1. Same-family and shared-modifier relating stays with the Family ladder,
 *      out of Related Tricks.
 *   2. A branch-family trick echoes its parent root ("Also a member of: Osis
 *      family"); a root-family trick shows no such note.
 * No trick_family data is written; all surfaces derive from reversible content maps.
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
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3561');

let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

const t = (
  slug: string,
  trick_family: string,
  category: 'dex' | 'compound' = 'compound',
) => ({ slug, canonical_name: slug.replace(/-/g, ' '), trick_family, base_trick: trick_family, category, adds: '4', is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const r of [
    // Torque family (branch of osis) + member — drives W1 + W4.
    t('torque', 'torque', 'dex'),
    t('paradox-torque', 'torque'),
    // Whirl family (a root) + a member — drives the W4 negative.
    t('whirl', 'whirl', 'dex'),
    t('paradox-whirl', 'whirl'),
  ]) insertFreestyleTrick(db, r);

  insertFreestyleTrickModifier(db, { slug: 'paradox', modifier_name: 'Paradox', modifier_type: 'body' });
  insertFreestyleTrickModifierLink(db, 'paradox-whirl', 'paradox');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(slug: string): Promise<string> {
  const res = await getPage(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

describe('W1 — same-family and shared-modifier relating owned by the Family ladder', () => {
  it('does not render Same-family / Shares-a-modifier groups in Related Tricks', async () => {
    const html = await page('paradox-torque');
    // Same-family relating is owned by the Family ladder; the shared-modifier
    // and same-family groups do not appear in the Related Tricks section.
    expect(html).not.toContain('Same family');
    expect(html).not.toContain('Shares a modifier');
    // The canonical same-family relating still surfaces via the Family ladder.
    expect(html).toContain('content-section trick-family-lineage');
  });
});

describe('W4 — branch-family tricks echo their parent root', () => {
  it('a torque-family trick shows "Also a member of: Osis family"', async () => {
    const html = await page('paradox-torque');
    expect(html).toContain('trick-also-family');
    expect(html).toContain('Also a member of');
    expect(html).toContain('href="/freestyle/tricks?family=osis"');
    expect(html).toContain('Osis family');
  });

  it('a root-family trick shows no additional-family note', async () => {
    const html = await page('paradox-whirl');
    expect(html).not.toContain('trick-also-family');
  });
});
