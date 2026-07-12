/**
 * Admin dictionary provenance-source registry: GET and POST /admin/freestyle/sources.
 *
 * The admin-only surface that lists the freestyle trick-dictionary provenance
 * sources and creates a new one, so post-cutover media and assertions can cite a
 * new source. The curator supplies the permanent primary-key id (shape-validated
 * and unique); the source type is one of the documented values; the label and an
 * ISO-8601 UTC retrieval timestamp are required (the timestamp is never silently
 * defaulted); url and notes are optional. Creation is one transaction with one
 * audit entry behind the admin and pre-go-live persona guards. This suite pins the
 * admin gate, the listing, successful creation with its audit row, the optional
 * fields, every validation rejection (duplicate id, malformed id, invalid type,
 * missing required fields, malformed timestamp) with rollback, the persona refusal,
 * and that a newly created source appears immediately in the trick attach-source
 * selector. Editing, deletion, and merging are out of scope and not exercised.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickSource,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3972');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000000s1';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000000s2';
const PERSONA_ADMIN_ID = 'member_persona_fss_src';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

// A complete, valid create body. Each test overrides one field to exercise a
// single path, and uses a distinct id so the successful creates stay isolated.
function validBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id:          'new-source-ok',
    sourceType:  'curated',
    sourceLabel: 'A New Curated Source',
    retrievedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fss_admin', display_name: 'FSS Admin', login_email: 'fss-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fss_member', display_name: 'FSS Member', login_email: 'fss-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fss_persona', display_name: 'FSS Persona', login_email: 'fss-persona@example.com', is_admin: 1 });

  // A pre-existing registry source (for the listing and duplicate-id tests) and an
  // active trick (for the attach-source selector appearance test).
  insertFreestyleTrickSource(db, { id: 'existing-src', source_type: 'scraped', source_label: 'Existing Scrape Source' });
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'Whirl', adds: '2',
    trick_family: 'whirl', base_trick: 'whirl', category: 'dex',
    review_status: 'expert_reviewed', is_active: 1,
  });

  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

async function get(path: string, cookie?: string) {
  const req = request(await createApp()).get(path);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

async function post(path: string, cookie: string | undefined, body: Record<string, string>) {
  const req = request(await createApp()).post(path).type('form').send(body);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

function sourceRow(id: string) {
  return db.prepare(
    'SELECT id, source_type, source_label, source_url, retrieved_at, notes FROM freestyle_trick_sources WHERE id = ?',
  ).get(id) as { id: string; source_type: string; source_label: string; source_url: string | null; retrieved_at: string; notes: string | null } | undefined;
}

function createdAudits(id: string) {
  return db.prepare(
    `SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'freestyle.trick_source.created'`,
  ).all(id) as { metadata_json: string }[];
}

describe('GET /admin/freestyle/sources — admin gate and listing', () => {
  it('renders 200 for an admin, labeled as the dictionary provenance registry', async () => {
    const res = await get('/admin/freestyle/sources', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dictionary Provenance Source Creation');
    expect(res.text).toContain('not the separate media-source registry');
  });

  it('redirects an unauthenticated visitor to login', async () => {
    const res = await get('/admin/freestyle/sources');
    expect(res.status).toBe(302);
  });

  it('returns 403 for a non-admin member', async () => {
    const res = await get('/admin/freestyle/sources', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });

  it('lists existing sources and offers only the four documented types', async () => {
    const res = await get('/admin/freestyle/sources', admin());
    expect(res.text).toContain('existing-src');
    expect(res.text).toContain('Existing Scrape Source');
    expect(res.text).toContain('value="curated"');
    expect(res.text).toContain('value="scraped"');
    expect(res.text).toContain('value="expert"');
    expect(res.text).toContain('value="imported"');
    expect(res.text).not.toContain('value="bogus"');
  });

  it('explains that the id is a permanent identifier', async () => {
    const res = await get('/admin/freestyle/sources', admin());
    expect(res.text).toContain('permanent referenced identifier');
    expect(res.text).toContain('cannot be renamed');
  });
});

describe('POST /admin/freestyle/sources — successful creation', () => {
  it('creates a source with the required fields, writes one audit row, and redirects', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: 'created-basic' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/sources');

    const row = sourceRow('created-basic');
    expect(row).toBeDefined();
    expect(row!.source_type).toBe('curated');
    expect(row!.source_label).toBe('A New Curated Source');
    expect(row!.retrieved_at).toBe('2026-05-01T00:00:00.000Z');
    expect(row!.source_url).toBeNull();   // optional, unset
    expect(row!.notes).toBeNull();        // optional, unset

    const audits = createdAudits('created-basic');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('created-basic');
    expect(audits[0].metadata_json).toContain('curated');
    expect(audits[0].metadata_json).toContain('A New Curated Source');
  });

  it('persists the optional url and notes when supplied', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({
      id: 'created-full', sourceUrl: 'http://example.test/src', notes: 'A note about this source.',
    }));
    expect(res.status).toBe(303);
    const row = sourceRow('created-full');
    expect(row!.source_url).toBe('http://example.test/src');
    expect(row!.notes).toBe('A note about this source.');
  });

  it('accepts an id with digits, hyphens, and underscores', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: 'anz_trikz-2026' }));
    expect(res.status).toBe(303);
    expect(sourceRow('anz_trikz-2026')).toBeDefined();
  });
});

describe('POST /admin/freestyle/sources — validation and rollback', () => {
  it('rejects a duplicate id with 422 and writes nothing', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: 'existing-src' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already exists');
    // The pre-existing row is untouched, and no create audit was written for it.
    expect(sourceRow('existing-src')!.source_label).toBe('Existing Scrape Source');
    expect(createdAudits('existing-src')).toHaveLength(0);
  });

  it('rejects a malformed id (uppercase, edge punctuation, spaces, dots) with 422 and writes nothing', async () => {
    for (const badId of ['Upper-Case', '-leading', 'trailing_', 'has space', 'has.dot', 'a/b']) {
      const res = await post('/admin/freestyle/sources', admin(), validBody({ id: badId }));
      expect(res.status).toBe(422);
      expect(res.text).toContain('lowercase letters, digits, hyphens, and underscores');
      expect(sourceRow(badId)).toBeUndefined();
    }
  });

  it('rejects an empty id with 422', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: '   ' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Source ID is required.');
  });

  it('rejects a source type outside the documented set with 422 and writes nothing', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: 'bad-type', sourceType: 'bogus' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a source type from the list.');
    expect(sourceRow('bad-type')).toBeUndefined();
  });

  it('rejects a missing label with 422 and preserves the submitted id', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: 'no-label', sourceLabel: '  ' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Source label is required.');
    expect(res.text).toContain('no-label');   // submitted value survives the re-render
    expect(sourceRow('no-label')).toBeUndefined();
  });

  it('rejects a missing retrieval timestamp with 422 and writes nothing', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: 'no-ts', retrievedAt: '' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('retrieval timestamp is required');
    expect(sourceRow('no-ts')).toBeUndefined();
  });

  it('rejects a malformed retrieval timestamp (date only) with 422', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: 'bad-ts', retrievedAt: '2026-05-01' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('ISO-8601 UTC');
    expect(sourceRow('bad-ts')).toBeUndefined();
  });

  it('rejects a timestamp that matches the shape but is not a real date', async () => {
    const res = await post('/admin/freestyle/sources', admin(), validBody({ id: 'unreal-ts', retrievedAt: '2026-13-45T00:00:00.000Z' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('ISO-8601 UTC');
    expect(sourceRow('unreal-ts')).toBeUndefined();
  });
});

describe('POST /admin/freestyle/sources — write gate and persona guard', () => {
  it('returns 403 for a non-admin and 302 for an anonymous visitor, writing nothing', async () => {
    const member = await post('/admin/freestyle/sources', cookieFor(MEMBER_ID, 'member'), validBody({ id: 'member-blocked' }));
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/sources', undefined, validBody({ id: 'anon-blocked' }));
    expect(anon.status).toBe(302);
    expect(sourceRow('member-blocked')).toBeUndefined();
    expect(sourceRow('anon-blocked')).toBeUndefined();
  });

  it('refuses a seeded-persona admin with 403 and writes nothing', async () => {
    const res = await post('/admin/freestyle/sources', cookieFor(PERSONA_ADMIN_ID, 'admin'), validBody({ id: 'persona-blocked' }));
    expect(res.status).toBe(403);
    expect(sourceRow('persona-blocked')).toBeUndefined();
    expect(createdAudits('persona-blocked')).toHaveLength(0);
  });
});

describe('a created source is immediately available in the trick attach-source selector', () => {
  it('offers a newly created source on the trick edit page', async () => {
    const created = await post('/admin/freestyle/sources', admin(), validBody({
      id: 'selector-src', sourceLabel: 'Selector Source',
    }));
    expect(created.status).toBe(303);

    const editPage = await get('/admin/freestyle/tricks/whirl/edit', admin());
    expect(editPage.status).toBe(200);
    expect(editPage.text).toContain('value="selector-src"');   // attachable in the source select
    expect(editPage.text).toContain('Selector Source');
  });
});
