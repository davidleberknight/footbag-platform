/**
 * Record-to-trick linkage on the trick-detail page.
 *
 * Records link to tricks by trick_name. Two failure modes are pinned here:
 *   - a record named with a lexical variant ("2-Bag Juggle") whose slug is an
 *     alias of the canonical trick ("2-bag-juggling") must still list on the
 *     canonical page, and the alias URL must render the canonical page;
 *   - a record named with a side qualifier ("Clipper Stall (ss)") keeps the
 *     qualifier in its slug (clipper-stall-ss) and lists on its base trick page
 *     through an alias, not through a lexical strip.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias, insertFreestyleRecord } from '../fixtures/factories';

const { dbPath } = setTestEnv('3175');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Juggle case: canonical trick + the digit-juggle alias + a record spelled
  // with that variant.
  insertFreestyleTrick(db, { slug: '2_bag_juggling', canonical_name: '2-bag-juggling', category: 'multi-bag', adds: '2' });
  insertFreestyleTrickAlias(db, '2_bag_juggle', '2_bag_juggling', '2 bag juggle');
  insertFreestyleRecord(db, {
    trick_name:   '2-Bag Juggle',
    record_type:  'trick_consecutive_juggle',
    display_name: 'Juggle Holder',
    value_numeric: 25,
    video_url:    'https://youtu.be/XeJHACfaU2Q?t=103',
  });

  // Qualifier case: the slugifier preserves "(ss)" -> clipper-stall-ss, which is
  // wired as an alias of clipper-stall, so the record resolves to its base through
  // the alias (the new identity model), not through a lexical strip.
  insertFreestyleTrick(db, { slug: 'clipper_stall', canonical_name: 'clipper-stall', category: 'compound', adds: '1' });
  insertFreestyleTrickAlias(db, 'clipper_stall_ss', 'clipper_stall', 'clipper stall (ss)');
  insertFreestyleRecord(db, {
    trick_name:   'Clipper Stall (ss)',
    record_type:  'trick_consecutive',
    display_name: 'Qualifier Holder',
    value_numeric: 99,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Record-to-trick linkage', () => {
  it('the canonical 2-bag-juggling page lists its 2-Bag Juggle record', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/2_bag_juggling');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Juggle Holder');
  });

  it('the alias URL 2-bag-juggle resolves to the canonical trick page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/2_bag_juggle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Juggle Holder');
  });

  it('a record named with an (ss) qualifier lists on its base trick page via an alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper_stall');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Qualifier Holder');
  });

  it('the hero title and breadcrumb strip the side qualifier, showing the plain trick name', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper_stall');
    expect(res.status).toBe(200);
    // The matched record name "Clipper Stall (ss)" supplies the page title; the
    // hero h1 shows the plain name, not the structural side qualifier (the slug
    // and record lookups still keep it).
    expect(res.text).toContain('<h1>Clipper Stall</h1>');
    expect(res.text).not.toContain('<h1>Clipper Stall (ss)</h1>');
  });

  it('the dictionary badges a record-only-video trick as "Record video", resolving the alias to canonical', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // 2-bag-juggling's record is named "2-Bag Juggle" (an alias) and carries a
    // video_url, with no reference media: the canonical row must still badge.
    expect(res.text).toContain('Record video');
    // Exactly one: clipper-stall's record has no video_url, so it earns no badge.
    expect((res.text.match(/Record video/g) || []).length).toBe(1);
  });
});
