/**
 * Integration tests for member external links: validate-before-publish on the
 * profile edit POST, replace-all persistence, and safe display on the own and
 * public profile surfaces. A member may publish up to three links; each URL is
 * verified before it is stored, and labels render HTML-escaped.
 *
 * Accept-path URLs use literal public IPs so validation stays offline and
 * deterministic: a literal IP skips DNS resolution, and the stub reachability
 * and Safe Browsing adapters pass any non-flagged URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertMemberLink, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3199');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

// Valid public literal IPs (documentation/test ranges); none fall in a blocked
// SSRF range, so each validates fully offline.
const URL_A = 'https://93.184.216.34/';
const URL_B = 'https://198.51.100.7/';
const URL_C = 'https://203.0.113.9/';
const URL_D = 'https://192.0.2.5/';

const DISPLAY_ID   = 'mlink-display';
const DISPLAY_SLUG = 'mlink_display';
const VIEWER_ID    = 'mlink-viewer';
const VIEWER_SLUG  = 'mlink_viewer';

function cookie(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

let _seq = 0;
/** Seed a fresh, link-less member so each write test is isolated. */
function seedWriter(): { id: string; slug: string } {
  _seq += 1;
  const id = `mlink-writer-${_seq}`;
  const slug = `mlink_writer_${_seq}`;
  const db = new BetterSqlite3(dbPath);
  insertMember(db, { id, slug, login_email: `${id}@example.com`, display_name: 'Link Writer' });
  db.close();
  return { id, slug };
}

function readLinks(memberId: string): Array<Record<string, unknown>> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare('SELECT label, url, validated_at, sort_order FROM member_links WHERE member_id = ? ORDER BY sort_order')
    .all(memberId) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

function postEdit(slug: string, memberId: string, fields: Record<string, unknown>): request.Test {
  return request(createApp())
    .post(`/members/${slug}/edit`)
    .set('Cookie', cookie(memberId))
    .type('form')
    .send(fields);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: DISPLAY_ID, slug: DISPLAY_SLUG, login_email: 'disp@example.com', display_name: 'Display Member' });
  insertMember(db, { id: VIEWER_ID, slug: VIEWER_SLUG, login_email: 'view@example.com', display_name: 'Viewer Member' });
  insertMemberLink(db, DISPLAY_ID, { label: 'My Site', url: 'https://example.org/', sort_order: 0 });
  insertMemberLink(db, DISPLAY_ID, { label: 'Channel', url: 'https://example.net/', sort_order: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ── Validate-before-publish ───────────────────────────────────────────────────

describe('POST /members/:slug/edit — external links validation', () => {
  it('persists a valid link with its normalized URL and a validated-at stamp', async () => {
    const { id, slug } = seedWriter();
    const res = await postEdit(slug, id, { link_label: 'Homepage', link_url: URL_A });
    expect(res.status).toBe(303);

    const links = readLinks(id);
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe('Homepage');
    expect(links[0].url).toBe(URL_A);
    expect(links[0].validated_at).not.toBeNull();
    expect(links[0].sort_order).toBe(0);
  });

  it('rejects a disallowed scheme and writes no link', async () => {
    const { id, slug } = seedWriter();
    const res = await postEdit(slug, id, { link_label: 'Bad', link_url: 'javascript:alert(1)' });
    expect(res.status).toBe(422);
    expect(readLinks(id)).toHaveLength(0);
  });

  it('rejects a malformed URL and writes no link', async () => {
    const { id, slug } = seedWriter();
    const res = await postEdit(slug, id, { link_label: 'Broken', link_url: 'not a url' });
    expect(res.status).toBe(422);
    expect(readLinks(id)).toHaveLength(0);
  });

  it('rejects more than three links and writes none', async () => {
    const { id, slug } = seedWriter();
    const res = await postEdit(slug, id, {
      link_label: ['One', 'Two', 'Three', 'Four'],
      link_url:   [URL_A, URL_B, URL_C, URL_D],
    });
    expect(res.status).toBe(422);
    expect(readLinks(id)).toHaveLength(0);
  });

  it('rejects a URL submitted without a label', async () => {
    const { id, slug } = seedWriter();
    const res = await postEdit(slug, id, { link_label: '', link_url: URL_A });
    expect(res.status).toBe(422);
    expect(readLinks(id)).toHaveLength(0);
  });

  it('rejects a label submitted without a URL', async () => {
    const { id, slug } = seedWriter();
    const res = await postEdit(slug, id, { link_label: 'Lonely', link_url: '' });
    expect(res.status).toBe(422);
    expect(readLinks(id)).toHaveLength(0);
  });

  it('drops fully blank link rows and saves the rest', async () => {
    const { id, slug } = seedWriter();
    const res = await postEdit(slug, id, {
      link_label: ['Keep', '', ''],
      link_url:   [URL_A, '', ''],
    });
    expect(res.status).toBe(303);
    const links = readLinks(id);
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe('Keep');
  });

  it('replace-all: a later save supersedes the earlier link set', async () => {
    const { id, slug } = seedWriter();
    await postEdit(slug, id, { link_label: ['First', 'Second'], link_url: [URL_A, URL_B] });
    expect(readLinks(id)).toHaveLength(2);

    const res = await postEdit(slug, id, { link_label: 'Only', link_url: URL_C });
    expect(res.status).toBe(303);
    const links = readLinks(id);
    expect(links).toHaveLength(1);
    expect(links[0].label).toBe('Only');
    expect(links[0].url).toBe(URL_C);
  });
});

// ── Safe display ──────────────────────────────────────────────────────────────

describe('external links display', () => {
  it('own profile renders the member links', async () => {
    const res = await request(createApp())
      .get(`/members/${DISPLAY_SLUG}`)
      .set('Cookie', cookie(DISPLAY_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('My Site');
    expect(res.text).toContain('https://example.org/');
  });

  it('public profile renders links as safe external anchors', async () => {
    const res = await request(createApp())
      .get(`/members/${DISPLAY_SLUG}`)
      .set('Cookie', cookie(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('My Site');
    // The shared external-link helper enforces the safe-anchor contract.
    expect(res.text).toContain('rel="nofollow noopener noreferrer"');
  });

  it('edit form pre-fills existing links into the inputs', async () => {
    const res = await request(createApp())
      .get(`/members/${DISPLAY_SLUG}/edit`)
      .set('Cookie', cookie(DISPLAY_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="link_label"');
    expect(res.text).toContain('value="My Site"');
    expect(res.text).toContain('value="https://example.org/"');
  });

  it('HTML-escapes a malicious link label on render', async () => {
    const { id, slug } = seedWriter();
    await postEdit(slug, id, { link_label: '<script>alert(1)</script>', link_url: URL_A });

    const res = await request(createApp())
      .get(`/members/${slug}`)
      .set('Cookie', cookie(id));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
