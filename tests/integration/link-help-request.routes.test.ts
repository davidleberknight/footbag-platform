/**
 * Member link help-request lifecycle: a member with no surfaced candidate
 * submits structured evidence from the wizard; the request lands in the
 * admin work queue (one open item per member, with admin-alerts fan-out and
 * a submitted audit event); an admin approves it, which applies the legacy
 * link with admin-vetted evidence and resolves the item atomically, or
 * rejects it with a required reason. Failed approvals (bad target) leave
 * the queue item open. Submission is rate-limited per member.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3089');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: 'admin-lh', slug: 'admin_lh', login_email: 'admin-lh@example.com', is_admin: 1,
  });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}
function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: 'admin-lh', role: 'admin' })}`;
}

function openItems(memberId: string): Array<Record<string, unknown>> {
  return db.prepare(`
    SELECT * FROM work_queue_items
    WHERE entity_id = ? AND task_type = 'member_link_help_request'
    ORDER BY created_at
  `).all(memberId) as Array<Record<string, unknown>>;
}

function audits(memberId: string, actionType: string): Array<Record<string, unknown>> {
  return db.prepare(`
    SELECT metadata_json, reason_text FROM audit_entries
    WHERE entity_id = ? AND action_type = ?
  `).all(memberId, actionType) as Array<Record<string, unknown>>;
}

let _n = 0;
function seedRequester(): string {
  _n += 1;
  const id = `lh-member-${_n}`;
  insertMember(db, {
    id, slug: `lh_member_${_n}`, login_email: `${id}@example.com`,
    real_name: `Helper ${_n}`, display_name: `Helper ${_n}`,
  });
  return id;
}

describe('member intake', () => {
  it('submits structured evidence to the work queue with audit + dedupe onto the open item', async () => {
    const memberId = seedRequester();
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        statement: 'I competed at Worlds 2003 as Helper.',
        claimed_legacy_username: 'helper99',
        claimed_legacy_email: 'helper99@old.example.com',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('help_request=sent');

    const items = openItems(memberId);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('open');
    expect(items[0].queue_category).toBe('membership');
    const payload = JSON.parse(String(items[0].reason_text)) as Record<string, unknown>;
    expect(payload.claimed_legacy_username).toBe('helper99');
    expect(payload.is_dispute).toBe(false);
    expect(audits(memberId, 'support.help_request_submitted')).toHaveLength(1);

    // Re-submit collapses onto the open item.
    const again = await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: 'Second message.' });
    expect(again.status).toBe(303);
    expect(openItems(memberId)).toHaveLength(1);
  });

  it('keeps the claimed legacy identifiers out of the append-only audit ledger', async () => {
    // The audit ledger is trigger-protected append-only and exempt from PII
    // purge, so the raw claimed email/username must live only in the mutable
    // work-queue row; the audit row carries linkage and the dispute flag.
    const memberId = seedRequester();
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        statement: 'These tournament results are mine.',
        claimed_legacy_username: 'oldhandle',
        claimed_legacy_email: 'oldhandle@old.example.com',
      });
    expect(res.status).toBe(303);

    const item = openItems(memberId)[0];
    const payload = JSON.parse(String(item.reason_text)) as Record<string, unknown>;
    expect(payload.claimed_legacy_email).toBe('oldhandle@old.example.com');

    const submitted = audits(memberId, 'support.help_request_submitted');
    expect(submitted).toHaveLength(1);
    const metadata = JSON.parse(String(submitted[0].metadata_json)) as Record<string, unknown>;
    expect(metadata.work_queue_item_id).toBe(item.id);
    expect(metadata.is_dispute).toBe(false);
    expect(metadata).not.toHaveProperty('claimed_legacy_email');
    expect(metadata).not.toHaveProperty('claimed_legacy_username');
    expect(String(submitted[0].metadata_json)).not.toContain('oldhandle');
  });

  it('rejects an empty statement with an inline 422', async () => {
    const memberId = seedRequester();
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: '   ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('describe the records');
    expect(openItems(memberId)).toHaveLength(0);
  });
});

describe('member factory historical-person linkage', () => {
  it('insertMember with an unseen historical_person_id auto-creates the historical_persons row', () => {
    _n += 1;
    const memberId = `lh-hp-fact-${_n}`;
    insertMember(db, {
      id: memberId, slug: `lh_hp_fact_${_n}`,
      login_email: `${memberId}@example.com`, historical_person_id: `hp-fact-${_n}`,
    });
    const hp = db.prepare('SELECT person_id FROM historical_persons WHERE person_id = ?')
      .get(`hp-fact-${_n}`) as Record<string, unknown> | undefined;
    expect(hp?.person_id).toBe(`hp-fact-${_n}`);
  });
});

describe('admin review', () => {
  it('approve applies the legacy link with admin-vetted evidence and resolves the item', async () => {
    const memberId = seedRequester();
    insertLegacyMember(db, {
      legacy_member_id: `LM-${memberId}`, legacy_email: `${memberId}@old.example.com`,
      real_name: 'Old Self', display_name: 'Old Self',
    });
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: 'These records are mine.' });
    const item = openItems(memberId)[0];

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/approve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_legacy_member_id: `LM-${memberId}` });
    expect(res.status).toBe(303);

    const mem = db.prepare('SELECT legacy_member_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(mem.legacy_member_id).toBe(`LM-${memberId}`);

    const resolved = openItems(memberId)[0];
    expect(resolved.status).toBe('resolved');
    expect(resolved.decision_label).toBe('approved');

    const approveAudits = audits(memberId, 'support.help_request_approved');
    expect(approveAudits).toHaveLength(1);
    expect(JSON.parse(String(approveAudits[0].metadata_json)).evidence_strength).toBe('admin_vetted_evidence');

    const claimAudits = audits(memberId, 'claim.legacy_account');
    expect(claimAudits).toHaveLength(1);
    expect(JSON.parse(String(claimAudits[0].metadata_json)).evidence_strength).toBe('admin_vetted_evidence');
  });

  it('approve with an unknown target leaves the item open and surfaces the error', async () => {
    const memberId = seedRequester();
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: 'Mine.' });
    const item = openItems(memberId)[0];

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/approve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_legacy_member_id: 'LM-does-not-exist' });
    expect(res.status).toBe(422);
    expect(openItems(memberId)[0].status).toBe('open');
  });

  it('approve links a historical-person record; admin vetting bypasses the surname gate', async () => {
    const memberId = seedRequester();
    // The requester's surname does not match the record: a self-serve claim
    // would be blocked by the surname gate, and the admin path is the designed
    // recovery, so the fixture exercises exactly that mismatch.
    const personId = insertHistoricalPerson(db, {
      person_id: `hp-${memberId}`, person_name: 'Different Surname', hof_member: 1,
    });
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: 'The competition record is mine.' });
    const item = openItems(memberId)[0];

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/approve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_historical_person_id: personId });
    expect(res.status).toBe(303);

    const mem = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(mem.historical_person_id).toBe(personId);

    const resolved = openItems(memberId)[0];
    expect(resolved.status).toBe('resolved');
    expect(resolved.decision_label).toBe('approved');

    const approveAudits = audits(memberId, 'support.help_request_approved');
    expect(approveAudits).toHaveLength(1);
    const metadata = JSON.parse(String(approveAudits[0].metadata_json)) as Record<string, unknown>;
    expect(metadata.historical_person_id).toBe(personId);
    expect(metadata.evidence_strength).toBe('admin_vetted_evidence');
  });

  it('approve requires exactly one target: both or neither is a 422 and the item stays open', async () => {
    const memberId = seedRequester();
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: 'Mine.' });
    const item = openItems(memberId)[0];

    const neither = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/approve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(neither.status).toBe(422);
    expect(neither.text).toContain('exactly one link target');

    const both = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/approve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_legacy_member_id: 'LM-x', target_historical_person_id: 'hp-x' });
    expect(both.status).toBe(422);
    expect(both.text).toContain('exactly one link target');

    expect(openItems(memberId)[0].status).toBe('open');
  });

  it('approve of a historical person already claimed by another member leaves the item open', async () => {
    const memberId = seedRequester();
    const personId = insertHistoricalPerson(db, {
      person_id: `hp-held-${memberId}`, person_name: 'Held Record',
    });
    _n += 1;
    insertMember(db, {
      id: `lh-holder-${_n}`, slug: `lh_holder_${_n}`,
      login_email: `lh-holder-${_n}@example.com`, historical_person_id: personId,
    });

    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: 'That record is mine.' });
    const item = openItems(memberId)[0];

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/approve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_historical_person_id: personId });
    expect(res.status).toBe(422);
    expect(openItems(memberId)[0].status).toBe('open');
    const mem = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(mem.historical_person_id).toBeNull();
  });

  it('reject requires a reason, resolves the item, and writes the rejected audit event', async () => {
    const memberId = seedRequester();
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: 'Mine too.' });
    const item = openItems(memberId)[0];

    const missingReason = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/reject`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: '' });
    expect(missingReason.status).toBe(422);

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/reject`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'No matching records found.' });
    expect(res.status).toBe(303);

    expect(openItems(memberId)[0].status).toBe('resolved');
    expect(openItems(memberId)[0].decision_label).toBe('rejected');
    expect(audits(memberId, 'support.help_request_rejected')).toHaveLength(1);
  });

  it('the work-queue page renders the structured payload and the approve/reject forms', async () => {
    const memberId = seedRequester();
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ statement: 'Render me.', claimed_legacy_username: 'renderme' });

    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Member link help request');
    expect(res.text).toContain('Render me.');
    expect(res.text).toContain('renderme');
    expect(res.text).toContain('/link-help/approve');
    expect(res.text).toContain('/link-help/reject');
  });
});
