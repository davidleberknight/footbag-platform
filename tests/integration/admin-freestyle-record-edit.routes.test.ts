/**
 * Admin freestyle-record curation: GET /admin/freestyle/records, GET and POST
 * /admin/freestyle/records/:id/edit.
 *
 * An admin-only surface to browse the freestyle world-record rows (all rows,
 * including superseded and low-confidence ones the public records page hides) and
 * edit one record's fields. A save updates the row and appends one audit entry in
 * one transaction; validation failures re-render with the submitted values; the
 * pre-go-live persona guard refuses a seeded-persona admin. There is no add-new or
 * delete path on this surface. This suite pins the admin gate, the browse of all
 * statuses, the field display, the persisted save with its one audit row, the
 * validation rules, and the persona guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertFreestyleRecord, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3968');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000fe01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000fe02';
const PERSONA_ADMIN_ID = 'member_persona_fse_rec';
const PERSON_ID = 'hp-record-holder';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

// A complete valid edit body for save_ok. Individual tests override a field.
function validBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    recordType:    'trick_consecutive',
    personId:      '',
    displayName:   'Edited Holder',
    trickName:     'Edited Trick',
    sortName:      '',
    addsCount:     '',
    valueNumeric:  '42',
    valueText:     '',
    achievedDate:  '2024-05-01',
    datePrecision: 'day',
    source:        'passback',
    confidence:    'verified',
    videoUrl:      '',
    videoTimecode: '',
    notes:         '',
    supersededBy:  '',
    ...overrides,
  };
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fre_admin', display_name: 'FRE Admin', login_email: 'fre-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fre_member', display_name: 'FRE Member', login_email: 'fre-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fre_persona', display_name: 'FRE Persona', login_email: 'fre-persona@example.com', is_admin: 1 });

  insertHistoricalPerson(db, { person_id: PERSON_ID, person_name: 'Real Historical Holder' });

  // A person-linked record for the display test.
  insertFreestyleRecord(db, {
    id: 'rec_linked', record_type: 'trick_consecutive_dex', person_id: PERSON_ID, display_name: null,
    trick_name: 'Linked Trick', value_numeric: 12, confidence: 'probable', achieved_date: '2023-03-03',
  });
  // A superseded, provisional record: the admin browse must show it though the
  // public page hides it.
  insertFreestyleRecord(db, {
    id: 'rec_super', record_type: 'trick_consecutive', display_name: 'Retired Holder',
    trick_name: 'Retired Trick', value_numeric: 5, confidence: 'provisional', superseded_by: 'rec_linked',
  });
  // The row the successful-save test mutates.
  insertFreestyleRecord(db, {
    id: 'rec_save_ok', record_type: 'trick_consecutive', display_name: 'Save Holder',
    trick_name: 'Save Trick', value_numeric: 20, confidence: 'probable',
  });
  // The row the validation-failure tests target; never successfully saved.
  insertFreestyleRecord(db, {
    id: 'rec_guard', record_type: 'trick_consecutive', display_name: 'Guard Holder',
    trick_name: 'Guard Trick', value_numeric: 9, confidence: 'probable',
  });

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

function recordRow(id: string) {
  return db.prepare(
    'SELECT record_type, display_name, person_id, trick_name, value_numeric, confidence, superseded_by, updated_at FROM freestyle_records WHERE id = ?',
  ).get(id) as { record_type: string; display_name: string | null; person_id: string | null; trick_name: string | null; value_numeric: number | null; confidence: string; superseded_by: string | null; updated_at: string };
}
function auditRows(id: string) {
  return db.prepare(
    `SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'freestyle.record.updated'`,
  ).all(id) as { metadata_json: string }[];
}

describe('GET /admin/freestyle/records — admin gate + browse', () => {
  it('renders 200 for an admin and lists all rows including a superseded one', async () => {
    const res = await get('/admin/freestyle/records', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Real Historical Holder'); // resolved from person_id
    expect(res.text).toContain('Retired Holder');         // superseded row shown
    expect(res.text).toContain('Superseded');
  });

  it('redirects an unauthenticated visitor to login', async () => {
    const res = await get('/admin/freestyle/records');
    expect(res.status).toBe(302);
  });

  it('returns 403 for a non-admin member', async () => {
    const res = await get('/admin/freestyle/records', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/freestyle/records/:id/edit — field display', () => {
  it('renders the editable fields, resolving a linked person name', async () => {
    const res = await get('/admin/freestyle/records/rec_linked/edit', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Real Historical Holder');         // resolved holder
    expect(res.text).toContain(`value="${PERSON_ID}"`);           // raw person id field
    expect(res.text).toContain('value="Linked Trick"');
    expect(res.text).toContain('value="trick_consecutive_dex" selected'); // record-type select
    expect(res.text).toContain('value="probable" selected');      // confidence select
  });

  it('returns 404 for an unknown record id', async () => {
    const res = await get('/admin/freestyle/records/nope_missing/edit', admin());
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/freestyle/records/:id/edit — successful save', () => {
  it('persists the change, writes one audit row, stamps updated_at, and redirects', async () => {
    const res = await post('/admin/freestyle/records/rec_save_ok/edit', admin(),
      validBody({ trickName: 'Save Trick Edited', confidence: 'verified' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/records/rec_save_ok/edit?saved=1');

    const row = recordRow('rec_save_ok');
    expect(row.trick_name).toBe('Save Trick Edited');
    expect(row.confidence).toBe('verified');
    expect(row.value_numeric).toBe(42);
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    const audits = auditRows('rec_save_ok');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('trick_name');
    expect(audits[0].metadata_json).toContain('confidence');
  });

  it('shows the saved banner on the follow-up GET', async () => {
    const res = await get('/admin/freestyle/records/rec_save_ok/edit?saved=1', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saved.');
  });

  it('accepts a valid linked person id and clears the display name', async () => {
    const res = await post('/admin/freestyle/records/rec_save_ok/edit', admin(),
      validBody({ personId: PERSON_ID, displayName: '', trickName: 'Now Linked' }));
    expect(res.status).toBe(303);
    const row = recordRow('rec_save_ok');
    expect(row.person_id).toBe(PERSON_ID);
    expect(row.display_name).toBeNull();
  });
});

describe('POST /admin/freestyle/records/:id/edit — validation', () => {
  it('rejects a record type outside the existing types', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(), validBody({ recordType: 'made_up_type' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Record type must be');
    expect(recordRow('rec_guard').record_type).toBe('trick_consecutive');
  });

  it('rejects a confidence outside the allowed set', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(), validBody({ confidence: 'legendary' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Confidence must be');
  });

  it('rejects a bad date precision', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(), validBody({ datePrecision: 'fortnight' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Date precision must be');
  });

  it('rejects a malformed achieved date', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(), validBody({ achievedDate: 'May 2024' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Achieved date must be');
  });

  it('rejects a non-existent linked person id and preserves submitted values', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(),
      validBody({ personId: 'hp-does-not-exist', trickName: 'Kept Trick' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('No historical person');
    expect(res.text).toContain('Kept Trick'); // submitted value survives
  });

  it('rejects when neither a person id nor a display name is given', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(),
      validBody({ personId: '', displayName: '' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('linked person id or a display name');
  });

  it('rejects a superseded-by that points at the row itself', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(), validBody({ supersededBy: 'rec_guard' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('cannot supersede itself');
  });

  it('rejects a superseded-by that references no record', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(), validBody({ supersededBy: 'rec_ghost' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('No record has that id');
  });

  it('rejects a non-numeric value and writes nothing', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', admin(), validBody({ valueNumeric: 'lots' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Value must be');
    expect(recordRow('rec_guard').value_numeric).toBe(9);
    expect(auditRows('rec_guard')).toHaveLength(0);
  });

  it('returns 404 saving an unknown record id', async () => {
    const res = await post('/admin/freestyle/records/nope_missing/edit', admin(), validBody());
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/freestyle/records/:id/edit — write gate', () => {
  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, writing nothing', async () => {
    const member = await post('/admin/freestyle/records/rec_guard/edit', cookieFor(MEMBER_ID, 'member'), validBody({ trickName: 'Hijacked' }));
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/records/rec_guard/edit', undefined, validBody({ trickName: 'Hijacked' }));
    expect(anon.status).toBe(302);
    expect(recordRow('rec_guard').trick_name).toBe('Guard Trick');
  });

  it('refuses a seeded-persona admin (403) and writes nothing', async () => {
    const res = await post('/admin/freestyle/records/rec_guard/edit', cookieFor(PERSONA_ADMIN_ID, 'admin'), validBody({ trickName: 'Persona Trick' }));
    expect(res.status).toBe(403);
    expect(recordRow('rec_guard').trick_name).toBe('Guard Trick');
    expect(auditRows('rec_guard')).toHaveLength(0);
  });
});
