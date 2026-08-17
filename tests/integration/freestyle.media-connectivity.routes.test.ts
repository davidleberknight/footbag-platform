/**
 * Media connectivity: the family-detail and set-detail pages surface the media
 * the platform already owns, one member trick at a time. A family member (or set
 * example trick) that has curated reference media renders a gallery link to
 * /media/browse?context=<slug>; a member without media renders no link.
 *
 * Neither page promotes one member's gallery as the family's or the set's own
 * clip. The media hashtag vocabulary is trick-scoped, so no family-level or
 * set-level gallery exists to link to, and a page-level "watch a clip" link
 * could only borrow one arbitrary member's gallery and mislabel it.
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
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  insertTtLesson,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3202');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const curator = insertMember(db, { id: 'member-conn-sys', slug: 'conn_system', is_system: 1, display_name: 'Footbag Hacky' });

  // Whirl family: the anchor plus one covered member and one uncovered member.
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', trick_family: 'whirl', category: 'core', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'paradox_whirl', canonical_name: 'paradox whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'spinning_whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', is_active: 1 });
  insertTtLesson(db, { uploader_member_id: curator, ttNumber: 810, trickSlug: 'paradox_whirl', videoId: 'pw-1', lessonTitle: 'Paradox Whirl' });

  // Atomic set: one example trick (modifier-linked) with a curated clip.
  insertFreestyleTrickModifier(db, { slug: 'atomic', modifier_name: 'atomic', add_bonus: 1, modifier_type: 'set' });
  insertFreestyleTrick(db, { slug: 'atomic_mirage', canonical_name: 'atomic mirage', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'atomic_mirage', 'atomic');
  insertTtLesson(db, { uploader_member_id: curator, ttNumber: 811, trickSlug: 'atomic_mirage', videoId: 'am-1', lessonTitle: 'Atomic Mirage' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Family detail surfaces its members\' media', () => {
  it('renders a gallery link for a covered member and none for an uncovered one', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.status).toBe(200);
    const html = res.text;
    // Per-member gallery link (Handlebars escapes '=' to &#x3D;).
    expect(html).toContain('/media/browse?context&#x3D;paradox_whirl');
    // The uncovered member renders no gallery link.
    expect(html).not.toContain('/media/browse?context&#x3D;spinning_whirl');
  });

  it('promotes no single member gallery as the family\'s own clip', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    const html = res.text;
    expect(html).not.toContain('Watch a clip from this family');
    // The invented coverage vocabulary reached a visitor only here.
    expect(html).not.toContain('Tutorial available');
    expect(html).not.toContain('Demo available');
  });
});

describe('Set detail surfaces its example tricks\' media', () => {
  it('renders a gallery link for a covered example trick', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/media/browse?context&#x3D;atomic_mirage');
  });

  it('promotes no single example gallery as the set\'s own clip', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic');
    const html = res.text;
    expect(html).not.toContain('Watch a clip from this set');
    expect(html).not.toContain('Tutorial available');
    expect(html).not.toContain('Demo available');
  });
});
