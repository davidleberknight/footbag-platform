/**
 * GET /freestyle/tricks/:slug — structurally related tricks never repeat the
 * family ladder.
 *
 * A trick page carries same-family progression in its family ladder and
 * structural neighbours in their own section; the two are distinct sections
 * that do not duplicate one another. Seeded here: a trick in the whirl family,
 * a family peer sharing its operators (which the ranking would otherwise list),
 * and a neighbour in another family sharing the same operators.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3624');
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const CURRENT   = 'relatives_current';
const PEER      = 'relatives_family_peer';
const NEIGHBOUR = 'relatives_neighbour';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const trick = (slug: string, family: string, base: string, adds: string) =>
    insertFreestyleTrick(db, {
      slug, canonical_name: slug.replace(/_/g, ' '), trick_family: family,
      base_trick: base, category: 'compound', adds, is_active: 1,
    });
  trick(CURRENT, 'whirl', 'whirl', '4');
  trick(PEER, 'whirl', 'whirl', '5');
  trick(NEIGHBOUR, 'osis', 'osis', '5');
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'Spinning', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'ducking', modifier_name: 'Ducking', modifier_type: 'body' });
  for (const slug of [CURRENT, PEER, NEIGHBOUR]) {
    insertFreestyleTrickModifierLink(db, slug, 'spinning');
    insertFreestyleTrickModifierLink(db, slug, 'ducking');
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const sectionOf = (html: string, opener: RegExp): string | null => {
  const m = new RegExp(`${opener.source}([\\s\\S]*?)</section>`).exec(html);
  return m ? m[1]! : null;
};

describe('structurally related tricks on a trick page', () => {
  // Defect caught: a visitor sees the same trick twice on one page, once on the
  // family ladder and again as a "structurally related" trick, so the section
  // repeats same-family progression instead of naming a structural neighbour.
  it('lists the cross-family neighbour and never the family peer the ladder shows', async () => {
    const res = await page(`/freestyle/tricks/${CURRENT}`);
    expect(res.status).toBe(200);
    const ladder = sectionOf(res.text, /<section class="content-section trick-family-lineage">/);
    const similar = sectionOf(res.text, /<section class="content-section" data-section="similar-tricks">/);
    expect(ladder, 'family ladder').not.toBeNull();
    expect(ladder!).toContain(`/freestyle/tricks/${PEER}`);
    expect(similar, 'structurally related section').not.toBeNull();
    expect(similar!).toContain(`/freestyle/tricks/${NEIGHBOUR}`);
    expect(similar!).not.toContain(`/freestyle/tricks/${PEER}`);
  });
});
