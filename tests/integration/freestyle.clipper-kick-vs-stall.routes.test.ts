/**
 * Clipper kick vs clipper stall: the two are separate canonical records with
 * distinct routes, and the 1-ADD clipper page describes a kick, never a stall.
 *
 * Guards the correction that removed stall instructional wording from the
 * clipper (kick) page:
 *   - /freestyle/tricks/clipper describes a cross-body inside-foot kick
 *   - it carries none of the removed stall-instruction phrases (cushion the
 *     bag, settle the bag, a flat catching surface, learn the inside stall
 *     first)
 *   - /freestyle/tricks/clipper_stall still describes the delay
 *   - the two routes and their aliases resolve to distinct records
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3390');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Clipper: the 1-ADD cross-body inside-foot kick. Content mirrors the
  // corrected curated values.
  insertFreestyleTrick(db, {
    slug: 'clipper', canonical_name: 'clipper', adds: '1',
    base_trick: 'clipper', trick_family: 'clipper', category: 'body',
    description:
      'A cross-body inside-foot kick: the inside surface of the foot strikes the footbag with the kicking leg swung behind and across the support leg, without stalling the bag.',
    execution_summary:
      'Use the inside surface of the kicking foot: swing the kicking leg behind and across the support leg and strike the bag with that surface, without catching or delaying it.',
    review_status: 'curated', is_active: 1,
  });

  // Clipper stall: the separate 2-ADD delay. Its content is unaffected.
  insertFreestyleTrick(db, {
    slug: 'clipper_stall', canonical_name: 'clipper stall', adds: '2',
    base_trick: 'clipper_stall', trick_family: 'clipper_stall', category: 'surface',
    description: 'Catch the bag on your foot held across your body, sole turned inward.',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // Aliases resolve to their own record: "clipper kick" to the kick, "clipper
  // delay" to the stall.
  insertFreestyleTrickAlias(db, 'clipper_kick', 'clipper', 'clipper kick');
  insertFreestyleTrickAlias(db, 'clipper_delay', 'clipper_stall', 'clipper delay');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Clipper (kick) page describes a kick', () => {
  it('renders the kick reading and action', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/cross-body inside-foot kick/);
    expect(res.text).toMatch(/strikes the footbag with the kicking leg/);
  });

  it('carries no stall-specific instructional wording', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper');
    expect(res.text).not.toMatch(/cushion the bag/i);
    expect(res.text).not.toMatch(/settles? the bag/i);
    expect(res.text).not.toMatch(/a flat (inside|catching) surface/i);
    expect(res.text).not.toMatch(/learn the inside stall first/i);
    expect(res.text).not.toMatch(/the balance the stall needs/i);
  });

  it('does not bleed the clipper stall delay content onto the kick page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper');
    expect(res.text).not.toMatch(/sole turned inward/i);
  });
});

describe('Clipper stall page remains the delay', () => {
  it('still describes the across-body delay', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper_stall');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/sole turned inward/i);
    expect(res.text).not.toMatch(/cross-body inside-foot kick/);
  });
});

describe('Clipper kick and clipper stall are distinct records and routes', () => {
  it('resolves both routes to their own record', async () => {
    const app = await createApp();
    const kick = await request(app).get('/freestyle/tricks/clipper');
    const stall = await request(app).get('/freestyle/tricks/clipper_stall');
    expect(kick.status).toBe(200);
    expect(stall.status).toBe(200);
    // Distinct ADD values surface on their respective pages.
    expect(kick.text).toMatch(/\b1\s*ADD\b/i);
    expect(stall.text).toMatch(/\b2\s*ADD\b/i);
  });

  it('maps the two aliases to distinct trick records', async () => {
    const check = new BetterSqlite3(dbPath, { readonly: true });
    const rows = check.prepare(
      `SELECT alias_slug, trick_slug FROM freestyle_trick_aliases
       WHERE alias_slug IN ('clipper_kick', 'clipper_delay')
       ORDER BY alias_slug`,
    ).all() as Array<{ alias_slug: string; trick_slug: string }>;
    check.close();
    expect(rows).toEqual([
      { alias_slug: 'clipper_delay', trick_slug: 'clipper_stall' },
      { alias_slug: 'clipper_kick', trick_slug: 'clipper' },
    ]);
  });
});
