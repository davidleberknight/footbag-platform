/**
 * Cross-link resolution on freestyle dictionary surfaces: a cross-link is emitted
 * only when its target page actually resolves, so no surface renders a link that
 * 404s.
 *
 * Two paths are pinned:
 *   - Trick-detail "See also: <Operator> tricks": the base-atom-to-operator
 *     cross-link is suppressed when that operator has no modifier page (an
 *     operator retired as a scored modifier, e.g. illusioning), and still renders
 *     when the operator does have a page (the control).
 *   - Modifier-page "Related modifiers": a related system that is a canonical set
 *     with no modifier page links to its set-encyclopedia page, never to a dead
 *     /freestyle/modifier/<slug> URL. Zulu's related system (weaving) comes from
 *     the canonical-set content module.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickModifier } from '../fixtures/factories';

const { dbPath } = setTestEnv('3129');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // illusion: its atom-to-operator cross-link targets 'illusioning', which is not
  // a registered modifier (no page), so the cross-link must be suppressed.
  insertFreestyleTrick(db, {
    slug: 'illusion', canonical_name: 'illusion', adds: '2',
    trick_family: 'mirage', category: 'dex', review_status: 'expert_reviewed', is_active: 1,
  });
  // whirl: its cross-link targets 'whirling', which IS registered here, so the
  // cross-link must still render (the gate does not over-suppress).
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    trick_family: 'whirl', category: 'dex', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifier(db, { slug: 'whirling', modifier_name: 'whirling', add_bonus: 1, modifier_type: 'body' });

  // zulu: a ducking set registered as a body modifier, so its modifier page
  // renders; its related system (weaving) is read from the canonical-set content
  // module and is a canonical set with no modifier page here.
  insertFreestyleTrickModifier(db, { slug: 'zulu', modifier_name: 'zulu', add_bonus: 1, modifier_type: 'body' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('trick-detail operator cross-link resolves or is suppressed', () => {
  it('suppresses the cross-link to an operator with no modifier page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/illusion');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/freestyle/modifier/illusioning');
  });

  it('still renders the cross-link to an operator that has a page, pointing where its route lands', async () => {
    // Whirling's modifier route redirects to its set page, so the link goes
    // there directly rather than through the redirect.
    const res = await request(await createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/sets/whirling"');
    expect(res.text).not.toContain('href="/freestyle/modifier/whirling"');
  });
});

describe('modifier-page related systems link to a surface that exists', () => {
  it('links a set-only related system to its set page, never a dead modifier URL', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/zulu');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/freestyle/sets/weaving');
    expect(res.text).not.toContain('/freestyle/modifier/weaving');
  });
});
