/**
 * Admin consecutive-kicks curation: GET /admin/freestyle/consecutive-records and
 * GET/POST /admin/freestyle/consecutive-records/:id/edit.
 *
 * An admin-only surface to browse consecutive-kicks records grouped by section and
 * division, and edit one row keyed on its stable surrogate id. A save updates the
 * row and appends one audit entry in one transaction; validation failures re-render
 * with submitted values; the display position must be a unique positive whole
 * number; the pre-go-live persona guard refuses a seeded-persona admin. There is no
 * add or remove path on this surface. This suite pins the admin gate, the grouped
 * browse, the field display, the persisted save with its one audit row, the
 * validation rules (including the unique display position), and the persona guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertConsecutiveKicksRecord, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3972');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000ck01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000ck02';
const PERSONA_ADMIN_ID = 'member_persona_ck_edit';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

// A full valid body for a given display position. Individual tests override a field.
function bodyFor(sortOrder: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    sortOrder,
    section:    'Highest Official Scores',
    subsection: 'Singles 20K+',
    division:   'Open Singles',
    year:       '2020',
    rank:       '1',
    player1:    'A Player',
    player2:    '',
    score:      '30000',
    note:       '',
    eventDate:  '2020-01-01',
    eventName:  'Test Event',
    location:   'Testville',
    ...overrides,
  };
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'ck_admin', display_name: 'CK Admin', login_email: 'ck-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'ck_member', display_name: 'CK Member', login_email: 'ck-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'ck_persona', display_name: 'CK Persona', login_email: 'ck-persona@example.com', is_admin: 1 });

  // Rows across sections/divisions for the grouped browse.
  insertConsecutiveKicksRecord(db, { id: 'ck_wr', sort_order: 401, section: 'Official World Records', subsection: 'Current', division: 'Open Singles', player_1: 'WR Holder', score: 50000 });
  insertConsecutiveKicksRecord(db, { id: 'ck_prog', sort_order: 501, section: 'World Record Progression', subsection: 'History', division: 'Women Singles', player_1: 'Prog Player', score: 40000 });
  // The row the successful-save test mutates.
  insertConsecutiveKicksRecord(db, { id: 'ck_save', sort_order: 101, section: 'Highest Official Scores', subsection: 'Singles 20K+', division: 'Open Singles', player_1: 'Save Player', score: 30000 });
  // The row the validation-failure tests target; never successfully saved.
  insertConsecutiveKicksRecord(db, { id: 'ck_guard', sort_order: 102, section: 'Highest Official Scores', subsection: 'Singles 20K+', division: 'Open Singles', player_1: 'Guard Player', score: 25000 });
  // Holds display position 999, so editing another row to 999 collides.
  insertConsecutiveKicksRecord(db, { id: 'ck_other', sort_order: 999, section: 'Highest Official Scores', subsection: 'Singles 20K+', division: 'Open Singles', player_1: 'Other Player', score: 20000 });

  createApp = await importApp();
});

afterAll(() => { db.close(); cleanupTestDb(dbPath); });

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

function ckRow(id: string) {
  return db.prepare(
    'SELECT sort_order, section, player_1, score, updated_at FROM consecutive_kicks_records WHERE id = ?',
  ).get(id) as { sort_order: number; section: string; player_1: string | null; score: number | null; updated_at: string };
}
function ckAudit(id: string) {
  return db.prepare(
    `SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'freestyle.consecutive_record.updated'`,
  ).all(id) as { metadata_json: string }[];
}

describe('GET /admin/freestyle/consecutive-records — admin gate + grouped browse', () => {
  it('renders 200 for an admin, grouped by section and division', async () => {
    const res = await get('/admin/freestyle/consecutive-records', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Official World Records');
    expect(res.text).toContain('World Record Progression');
    expect(res.text).toContain('Highest Official Scores');
    expect(res.text).toContain('Women Singles');   // division heading
    expect(res.text).toContain('WR Holder');        // a row's players
  });

  it('redirects an unauthenticated visitor to login', async () => {
    const res = await get('/admin/freestyle/consecutive-records');
    expect(res.status).toBe(302);
  });

  it('returns 403 for a non-admin member', async () => {
    const res = await get('/admin/freestyle/consecutive-records', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/freestyle/consecutive-records/:id/edit — field display', () => {
  it('renders the editable fields', async () => {
    const res = await get('/admin/freestyle/consecutive-records/ck_save/edit', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('value="101"');          // display position
    expect(res.text).toContain('value="Save Player"');
    expect(res.text).toContain('value="30000"');        // score
    expect(res.text).toContain('value="Open Singles"');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await get('/admin/freestyle/consecutive-records/nope_missing/edit', admin());
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/freestyle/consecutive-records/:id/edit — successful save', () => {
  it('persists the change, writes one audit row, stamps updated_at, and redirects', async () => {
    const res = await post('/admin/freestyle/consecutive-records/ck_save/edit', admin(),
      bodyFor('101', { player1: 'Save Player Edited', score: '31000' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/consecutive-records/ck_save/edit?saved=1');

    const row = ckRow('ck_save');
    expect(row.player_1).toBe('Save Player Edited');
    expect(row.score).toBe(31000);
    expect(row.sort_order).toBe(101);                    // keeping its own position is not a collision
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    const audits = ckAudit('ck_save');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('player_1');
    expect(audits[0].metadata_json).toContain('score');
  });

  it('shows the saved banner on the follow-up GET', async () => {
    const res = await get('/admin/freestyle/consecutive-records/ck_save/edit?saved=1', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saved.');
  });
});

describe('POST /admin/freestyle/consecutive-records/:id/edit — validation', () => {
  it('rejects an empty section, subsection, or division', async () => {
    const res = await post('/admin/freestyle/consecutive-records/ck_guard/edit', admin(), bodyFor('102', { section: '' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Section is required.');
    expect(ckRow('ck_guard').section).toBe('Highest Official Scores');
  });

  it('rejects a non-numeric score', async () => {
    const res = await post('/admin/freestyle/consecutive-records/ck_guard/edit', admin(), bodyFor('102', { score: 'lots' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Score must be');
  });

  it('rejects a display position below one', async () => {
    const res = await post('/admin/freestyle/consecutive-records/ck_guard/edit', admin(), bodyFor('0'));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Display position must be');
  });

  it('rejects a display position already used by another row, and writes nothing', async () => {
    // 999 is held by ck_other.
    const res = await post('/admin/freestyle/consecutive-records/ck_guard/edit', admin(), bodyFor('999', { player1: 'Kept Player' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already used by another row');
    expect(res.text).toContain('Kept Player');           // submitted value survives
    expect(ckRow('ck_guard').sort_order).toBe(102);       // unchanged
    expect(ckAudit('ck_guard')).toHaveLength(0);
  });

  it('returns 404 saving an unknown id', async () => {
    const res = await post('/admin/freestyle/consecutive-records/nope_missing/edit', admin(), bodyFor('5'));
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/freestyle/consecutive-records/:id/edit — write gate', () => {
  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, writing nothing', async () => {
    const member = await post('/admin/freestyle/consecutive-records/ck_guard/edit', cookieFor(MEMBER_ID, 'member'), bodyFor('102', { player1: 'Hijacked' }));
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/consecutive-records/ck_guard/edit', undefined, bodyFor('102', { player1: 'Hijacked' }));
    expect(anon.status).toBe(302);
    expect(ckRow('ck_guard').player_1).toBe('Guard Player');
  });

  it('refuses a seeded-persona admin (403) and writes nothing', async () => {
    const res = await post('/admin/freestyle/consecutive-records/ck_guard/edit', cookieFor(PERSONA_ADMIN_ID, 'admin'), bodyFor('102', { player1: 'Persona Player' }));
    expect(res.status).toBe(403);
    expect(ckRow('ck_guard').player_1).toBe('Guard Player');
    expect(ckAudit('ck_guard')).toHaveLength(0);
  });
});
