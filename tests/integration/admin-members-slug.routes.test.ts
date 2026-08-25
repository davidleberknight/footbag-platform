/**
 * Correcting a member's profile URL from the administrator member record.
 *
 * The load-bearing case is what a slug drags behind it. Every upload a member
 * makes carries an uploader tag built from their profile URL, and their
 * galleries key their criteria on that tag, so a correction that moves the URL
 * and leaves the tag would silently empty their galleries and orphan their
 * media. That failure is invisible until a member notices their photos have
 * gone, which is why it is tested here rather than left to be discovered.
 *
 * Also covers the registration rules the corrected URL inherits, the collision
 * with another member's URL, and the reason and audit trail every correction
 * carries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertPersonaNamedGallery, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3435');

const ADMIN_ID = 'sl_admin';
const MOVER_ID = 'sl_mover';
const HOLDER_ID = 'sl_holder';
const PLAIN_ID = 'sl_plain';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function slugOf(memberId: string): string | null {
  return (db((conn) => conn.prepare(
    `SELECT slug FROM members WHERE id = ?`,
  ).get(memberId)) as { slug: string | null }).slug;
}

async function correctSlug(
  memberId: string, slug: string, reason = 'member asked for a readable address',
): Promise<{ status: number; text: string }> {
  const res = await request(createApp())
    .post(`/admin/members/${memberId}/slug/confirm`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ slug, reason });
  return { status: res.status, text: res.text };
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'sl_admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'sl-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: MOVER_ID, slug: 'member_a1b2c3d4', display_name: 'Mia Mover', real_name: 'Mia Mover',
    given_names: 'Mia', family_name: 'Mover', login_email: 'sl-mover@example.com',
  });
  insertMember(conn, {
    id: HOLDER_ID, slug: 'hattie_holder', display_name: 'Hattie Holder', real_name: 'Hattie Holder',
    given_names: 'Hattie', family_name: 'Holder', login_email: 'sl-holder@example.com',
  });
  insertMember(conn, {
    id: PLAIN_ID, slug: 'percy_plain', display_name: 'Percy Plain', real_name: 'Percy Plain',
    given_names: 'Percy', family_name: 'Plain', login_email: 'sl-plain@example.com',
  });

  // A gallery whose criteria tag is this member's uploader tag: exactly the
  // structure a correction has to carry with it.
  insertPersonaNamedGallery(conn, {
    galleryId: 'gallery_member_a1b2c3d4_highlights',
    ownerMemberId: MOVER_ID,
    ownerSlug: 'member_a1b2c3d4',
    name: 'Highlights',
  });

  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('correcting a profile URL', () => {
  it('moves the URL', async () => {
    const res = await correctSlug(MOVER_ID, 'mia_mover');
    expect(res.status).toBe(303);
    expect(slugOf(MOVER_ID)).toBe('mia_mover');
  });

  it('carries the uploader tag with it, so the galleries built on it still resolve', () => {
    // The tag row itself moved, keeping its id.
    const oldTag = db((conn) => conn.prepare(
      `SELECT id FROM tags WHERE tag_normalized = ?`,
    ).get('#by_member_a1b2c3d4')) as { id: string } | undefined;
    const newTag = db((conn) => conn.prepare(
      `SELECT id, tag_display FROM tags WHERE tag_normalized = ?`,
    ).get('#by_mia_mover')) as { id: string; tag_display: string } | undefined;

    expect(oldTag).toBeUndefined();
    expect(newTag).toBeDefined();
    expect(newTag!.tag_display).toBe('#by_mia_mover');

    // And the gallery still points at it, because the link is by tag id.
    const galleryTag = db((conn) => conn.prepare(
      `SELECT t.tag_normalized FROM member_galleries g
       JOIN member_gallery_tags gt ON gt.gallery_id = g.id
       JOIN tags t ON t.id = gt.tag_id
       WHERE g.owner_member_id = ?`,
    ).get(MOVER_ID)) as { tag_normalized: string } | undefined;
    expect(galleryTag?.tag_normalized).toBe('#by_mia_mover');
  });

  it('records the old and the new value with the reason', () => {
    const row = db((conn) => conn.prepare(
      `SELECT reason_text, metadata_json FROM audit_entries
       WHERE action_type = 'member.slug_corrected' AND entity_id = ?`,
    ).get(MOVER_ID)) as { reason_text: string; metadata_json: string };
    const meta = JSON.parse(row.metadata_json);

    expect(row.reason_text).toBe('member asked for a readable address');
    expect(meta.before).toBe('member_a1b2c3d4');
    expect(meta.after).toBe('mia_mover');
    expect(meta.uploader_tag_moved).toBe(true);
  });

  it('leaves the gallery identifier alone, since it was fixed when the gallery was made', () => {
    const gallery = db((conn) => conn.prepare(
      `SELECT id FROM member_galleries WHERE owner_member_id = ?`,
    ).get(MOVER_ID)) as { id: string };
    expect(gallery.id).toBe('gallery_member_a1b2c3d4_highlights');
  });

  it('refuses a URL another member already holds', async () => {
    const res = await correctSlug(PLAIN_ID, 'hattie_holder');
    expect(res.status).toBe(422);
    expect(slugOf(PLAIN_ID)).toBe('percy_plain');
  });

  it('holds the corrected URL to the rules registration applies', async () => {
    const refusals: Array<[string, string]> = [
      ['capitals and spaces',   'Percy Plain'],
      ['punctuation',           'percy-plain!'],
      ['a reserved site word',  'ifpa_plain'],
      ['not carrying the name', 'someone_else'],
      ['too short',             'p'],
    ];
    for (const [label, slug] of refusals) {
      const res = await correctSlug(PLAIN_ID, slug);
      expect(res.status, label).toBe(422);
    }
    expect(slugOf(PLAIN_ID)).toBe('percy_plain');
  });

  it('refuses a correction with no reason', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${PLAIN_ID}/slug/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ slug: 'percy_plainer', reason: '  ' });
    expect(res.status).toBe(422);
    expect(slugOf(PLAIN_ID)).toBe('percy_plain');
  });

  it('writes nothing when the URL is the one already held', async () => {
    const before = db((conn) => conn.prepare(
      `SELECT COUNT(*) AS c FROM audit_entries
       WHERE action_type = 'member.slug_corrected' AND entity_id = ?`,
    ).get(PLAIN_ID)) as { c: number };

    const res = await correctSlug(PLAIN_ID, 'percy_plain');
    expect(res.status).toBe(303);

    const after = db((conn) => conn.prepare(
      `SELECT COUNT(*) AS c FROM audit_entries
       WHERE action_type = 'member.slug_corrected' AND entity_id = ?`,
    ).get(PLAIN_ID)) as { c: number };
    expect(after.c).toBe(before.c);
  });

  it('warns on the confirmation that the old address stops working', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${PLAIN_ID}/slug`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ slug: 'percy_plainer', reason: 'member asked' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('lead nowhere');
  });
});
