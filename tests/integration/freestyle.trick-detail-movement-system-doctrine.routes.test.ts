/**
 * Trick-detail Movement-system row doctrine.
 *
 * Miraging is descriptive mirage-family language for the inward standalone
 * movement, not a launch set,
 * so a Miraging trick page must NOT render the "Set / Uptime Systems"
 * movement-system row (that row is derived from the set-uptime axis, and
 * miraging was removed from it). The corrected Miraging modifier row still
 * carries the doctrine. A confirmed set (atomic) still renders the row, so the
 * axis edit did not over-remove.
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

const { dbPath } = setTestEnv('3617');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertFreestyleTrickModifier(db, { slug: 'miraging', modifier_name: 'miraging', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'atomic',   modifier_name: 'atomic',   add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set' });

  // Base tricks referenced by the compounds.
  insertFreestyleTrick(db, { slug: 'pickup',    canonical_name: 'pickup',    adds: '2', base_trick: 'pickup',    trick_family: 'pickup',    category: 'dex', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'eclipse',   canonical_name: 'eclipse',   adds: '3', base_trick: 'eclipse',   trick_family: 'clipper_stall', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'butterfly', canonical_name: 'butterfly', adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', is_active: 1 });

  // Miraging-named compounds (historical names retained).
  insertFreestyleTrick(db, { slug: 'miraging_pickup',  canonical_name: 'miraging pickup',  adds: '3', base_trick: 'pickup',    trick_family: 'pickup',    category: 'compound', operational_notation: 'SET > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'miraging_eclipse', canonical_name: 'miraging eclipse', adds: '4', base_trick: 'eclipse',   trick_family: 'clipper_stall', category: 'compound', operational_notation: 'SET > OP IN [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'miraging_pickup',  'miraging');
  insertFreestyleTrickModifierLink(db, 'miraging_eclipse', 'miraging');

  // Confirmed-set control: an atomic-modified trick keeps the set-uptime row.
  insertFreestyleTrick(db, { slug: 'atomic_butterfly', canonical_name: 'atomic butterfly', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: 'TOE > OP OUT [DEX] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'atomic_butterfly', 'atomic');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function trick(slug: string): Promise<{ status: number; text: string }> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  return { status: res.status, text: res.text };
}

describe('GET /freestyle/tricks/:slug — Miraging pages drop the stale set-uptime movement-system row', () => {
  it('miraging_pickup does not render the "Set / Uptime Systems" movement-system row', async () => {
    const { status, text } = await trick('miraging_pickup');
    expect(status).toBe(200);
    expect(text).not.toContain('Set / Uptime Systems');
  });

  it('miraging_eclipse does not render the "Set / Uptime Systems" movement-system row', async () => {
    const { status, text } = await trick('miraging_eclipse');
    expect(status).toBe(200);
    expect(text).not.toContain('Set / Uptime Systems');
  });

  it('miraging pages still carry the corrected Miraging modifier row (descriptive standalone movement, not a launch set)', async () => {
    for (const slug of ['miraging_pickup', 'miraging_eclipse']) {
      const { text } = await trick(slug);
      expect(text, slug).toMatch(/mirage-family language/i);
      expect(text, slug).toMatch(/not a launch set/i);
    }
  });

  it('a confirmed-set (atomic) trick still renders the "Set / Uptime Systems" movement-system row', async () => {
    const { status, text } = await trick('atomic_butterfly');
    expect(status).toBe(200);
    expect(text).toContain('Set / Uptime Systems');
  });
});
