/**
 * GET /freestyle/tricks/:slug — detail-page echoes of the browse systems.
 *
 * A trick's detail page should explain why it appears in each browse surface.
 * Four additive surfaces are pinned here:
 *   1. Related Tricks carry a plain-words reason per row (same family / shares a
 *      modifier / structural ancestor), driven by the relating rule.
 *   2. "Modifiers on this trick" lists every modifier link with its browse
 *      cluster, and renders for a one-modifier trick (no three-link gate).
 *   3. A classified modifier shows its Movement System axis as a deep-link plus
 *      a composition gloss; an unclassified modifier shows the cluster only.
 *   4. A branch-family trick echoes its parent root ("Also a member of: Osis
 *      family"); a root-family trick shows no such note.
 * No trick_family data is written; all surfaces derive from reversible content maps.
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
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3561');

let createApp: Awaited<ReturnType<typeof importApp>>;

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
    // Whirl family (a root) + the modifier-bearing target — drives W2/W3 + W4 negative.
    t('whirl', 'whirl', 'dex'),
    t('paradox-whirl', 'whirl'),
    // Mirage family + a trick carrying an unclassified modifier.
    t('mirage', 'mirage', 'dex'),
    t('blurry-mirage', 'mirage'),
  ]) insertFreestyleTrick(db, r);

  // paradox: classified under the Entry Topologies axis, with a composition gloss.
  insertFreestyleTrickModifier(db, { slug: 'paradox', modifier_name: 'Paradox', modifier_type: 'body' });
  insertFreestyleTrickModifierLink(db, 'paradox-whirl', 'paradox');
  // blurry: a registered modifier with no Movement System axis and no gloss.
  insertFreestyleTrickModifier(db, { slug: 'blurry', modifier_name: 'Blurry', modifier_type: 'body' });
  insertFreestyleTrickModifierLink(db, 'blurry-mirage', 'blurry');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(slug: string): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

describe('W1 — Related Tricks split into labeled relationship groups', () => {
  it('groups a same-family neighbour and a shared-modifier neighbour under their labels', async () => {
    const html = await page('paradox-torque');
    expect(html).toContain('related-group-label');
    // torque is the same family; paradox-whirl shares the paradox prefix —
    // now rendered as labeled relationship groups, not per-row reasons.
    expect(html).toContain('Same family');
    expect(html).toContain('Shares a modifier');
  });
});

describe('W2/W3 — "Modifiers on this trick" block', () => {
  it('renders for a one-modifier trick (no three-link gate) with cluster + axis + gloss', async () => {
    const html = await page('paradox-whirl');
    expect(html).toContain('Modifiers on this trick');
    expect(html).toContain('trick-modifier-name');
    expect(html).toContain('>Paradox<');
    expect(html).toContain('trick-modifier-cluster');
    // Movement System axis deep-link for a classified modifier.
    expect(html).toContain('/freestyle/tricks?view=movement-system#movement-axis-entry-topology');
    expect(html).toContain('Entry Topologies');
    // Composition gloss line present.
    expect(html).toContain('trick-modifier-gloss');
  });

  it('shows the cluster but no axis link or gloss for an unclassified modifier', async () => {
    const html = await page('blurry-mirage');
    expect(html).toContain('Modifiers on this trick');
    expect(html).toContain('>Blurry<');
    expect(html).toContain('trick-modifier-cluster');
    // blurry has no Movement System axis and no gloss.
    expect(html).not.toContain('movement-axis-');
    expect(html).not.toContain('trick-modifier-gloss');
  });

  it('omits the block entirely for a trick with no modifier links', async () => {
    const html = await page('whirl');
    expect(html).not.toContain('Modifiers on this trick');
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
