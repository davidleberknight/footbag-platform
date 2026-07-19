/**
 * Record-to-trick linkage on the trick-detail page.
 *
 * Records link to tricks by trick_name. Two failure modes are pinned here:
 *   - a record named with a lexical variant ("2-Bag Juggle") whose slug is an
 *     alias of the canonical trick ("2-bag-juggling") must still list on the
 *     canonical page, and the alias URL 301-redirects to the canonical page
 *     (one canonical URL per trick; alias URLs never render a duplicate);
 *   - a record named with a redundant terminal side qualifier ("Pigbeater (ss)")
 *     resolves to its active base trick by normalizing the terminal "(ss)" away in
 *     the record-resolution path (same-side is implicit in the trick, so "(ss)" is
 *     redundant record-label notation); this normalization is record-scoped and does
 *     not touch the dictionary identity layer, which still preserves qualifiers.
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
  // the alias.
  insertFreestyleTrick(db, { slug: 'clipper_stall', canonical_name: 'clipper-stall', category: 'compound', adds: '1' });
  insertFreestyleTrickAlias(db, 'clipper_stall_ss', 'clipper_stall', 'clipper stall (ss)');
  insertFreestyleRecord(db, {
    trick_name:   'Clipper Stall (ss)',
    record_type:  'trick_consecutive',
    display_name: 'Qualifier Holder',
    value_numeric: 99,
  });

  // Redundant-qualifier case: a record named with a terminal "(ss)" whose base
  // trick is active and has NO "(ss)" alias. The record-resolution path normalizes
  // the terminal "(ss)" away, so the record lists on its base page purely by the
  // strip, not by any alias. This mirrors the world-record vocabulary where
  // "Pigbeater (ss)" is the pigbeater trick with same-side implicit.
  insertFreestyleTrick(db, { slug: 'pigbeater', canonical_name: 'pigbeater', category: 'compound', adds: '3' });
  insertFreestyleRecord(db, {
    trick_name:   'Pigbeater (ss)',
    record_type:  'trick_consecutive',
    display_name: 'Redundant-Qualifier Holder',
    value_numeric: 42,
  });

  // Either-side catch: the terminal delay is an ambiguous SAME/OP, so the trick
  // is genuinely caught on either side (osis is the canonical case). A record's
  // side qualifier must NOT surface in the hero subtitle, because it would
  // assert a single side the trick does not have.
  insertFreestyleTrick(db, {
    slug: 'either_catch', canonical_name: 'either-catch', category: 'compound', adds: '3',
    operational_notation: 'SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]',
  });
  insertFreestyleTrickAlias(db, 'either_catch_ss', 'either_catch', 'either catch (ss)');
  insertFreestyleRecord(db, {
    trick_name: 'Either Catch (ss)', sort_name: 'Either Catch (ss)',
    record_type: 'trick_consecutive', display_name: 'Either-Side Holder', value_numeric: 50,
  });

  // Resolved catch (OP CLIP): the side IS established, so the record's side
  // qualifier is real information and stays in the hero subtitle.
  insertFreestyleTrick(db, {
    slug: 'resolved_catch', canonical_name: 'resolved-catch', category: 'compound', adds: '3',
    operational_notation: 'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  });
  insertFreestyleTrickAlias(db, 'resolved_catch_ss', 'resolved_catch', 'resolved catch (ss)');
  insertFreestyleRecord(db, {
    trick_name: 'Resolved Catch (ss)', sort_name: 'Resolved Catch (ss)',
    record_type: 'trick_consecutive', display_name: 'Resolved-Side Holder', value_numeric: 50,
  });

  // A canonical trick can have a higher-value record whose name is a specific
  // variant's folk name, reachable through a curated alias (the op-side
  // "Infinity" for butterfly, matched via the infinity->butterfly alias). The
  // record must still list on the page, but the canonical name must title it: a
  // variant's name never retitles the base trick (not all butterflies are
  // infinities).
  insertFreestyleTrick(db, { slug: 'winged', canonical_name: 'winged', category: 'compound', adds: '3' });
  insertFreestyleTrickAlias(db, 'infinity_variant', 'winged', 'infinity variant');
  insertFreestyleRecord(db, {
    trick_name: 'Infinity Variant', record_type: 'trick_consecutive',
    display_name: 'Variant Holder', value_numeric: 200,
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

  it('the alias URL 2-bag-juggle 301-redirects to the canonical trick page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/2_bag_juggle');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/2_bag_juggling');
    const followed = await request(await createApp()).get(res.headers.location);
    expect(followed.status).toBe(200);
    expect(followed.text).toContain('Juggle Holder');
  });

  it('a record named with an (ss) qualifier lists on its base trick page via an alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/clipper_stall');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Qualifier Holder');
  });

  it('a record with a redundant terminal (ss) resolves to its active base trick by normalization, no alias needed', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/pigbeater');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Redundant-Qualifier Holder');
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

  it('drops the side qualifier from the hero subtitle when the catch is either-side (SAME/OP)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/either_catch');
    expect(res.status).toBe(200);
    // The record still links through (its holder is listed), but a trick caught
    // on either side has no single side to assert, so the subtitle never shows
    // "(ss)"/"(op)".
    expect(res.text).toContain('Either-Side Holder');
    expect(res.text).toContain('<h1>Either Catch</h1>');
    expect(res.text).not.toMatch(/hero-subtitle[^>]*>[^<]*\((?:ss|op)\)/);
  });

  it('keeps the side qualifier in the hero subtitle when the catch side is resolved', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/resolved_catch');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Resolved-Side Holder');
    expect(res.text).toContain('<h1>Resolved Catch</h1>');
    // The side is established, so it stays: real information, not jargon.
    expect(res.text).toMatch(/<p class="hero-subtitle">Resolved Catch \(ss\)<\/p>/);
  });

  it('titles a canonical page by its canonical name, not a higher-value variant record matched via an alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/winged');
    expect(res.status).toBe(200);
    // The variant record (higher value, matched through the alias) still lists...
    expect(res.text).toContain('Variant Holder');
    // ...but the canonical name titles the page, not the variant's folk name.
    expect(res.text).toContain('<h1>Winged</h1>');
    expect(res.text).not.toContain('<h1>Infinity Variant</h1>');
  });

  it('gives a record-only-video trick a plain hashtag, not a dead-end gallery link, while resolving the alias to canonical', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // 2-bag-juggling's record is named "2-Bag Juggle" (an alias) and carries a
    // video_url but no curated reference media. The alias resolves to the
    // canonical row, which classifies as record coverage — but a record's own
    // video is not a curated gallery item, so /media/browse?context= would open
    // an empty gallery. Its hashtag is therefore a plain token, not a link.
    const recordRows = res.text.match(/<article class="dict-[^>]*data-media-coverage="record"[^>]*>([\s\S]*?)<\/article>/g) || [];
    // Exactly one: clipper-stall's record has no video_url, so it earns no coverage.
    expect(recordRows.length).toBe(1);
    expect(recordRows[0]).not.toContain('hashtag--media');
    expect(recordRows[0]).not.toContain('href="/media/browse?context');
  });
});
