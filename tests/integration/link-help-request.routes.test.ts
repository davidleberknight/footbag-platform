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
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}
function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: 'admin-lh', role: 'admin' })}`;
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
/** `realName` matters when the member files a DISPUTE: the service records the
 *  conflicting records it detects by surname at filing time, and the admin
 *  revert may only touch a record the dispute named. A requester whose surname
 *  matches nothing files a dispute that names no record. */
function seedRequester(realName?: string): string {
  _n += 1;
  const id = `lh-member-${_n}`;
  const name = realName ?? `Helper ${_n}`;
  insertMember(db, {
    id, slug: `lh_member_${_n}`, login_email: `${id}@example.com`,
    real_name: name, display_name: name,
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

  // The audit ledger is append-only and exempt from the PII purge, and resolving
  // overwrites the work-queue row that held the purgeable copy of what the member
  // wrote. Anything member-authored recorded here would outlive that member's own
  // erasure, and it renders on the audit page and in its exports.
  it.each([
    ['approve', 'support.help_request_approved'],
    ['reject',  'support.help_request_rejected'],
  ])('%s records no part of the member-authored payload in the audit ledger', async (action, actionType) => {
    const memberId = seedRequester();
    insertLegacyMember(db, {
      legacy_member_id: `LM-${memberId}`, legacy_email: `${memberId}@old.example.com`,
      real_name: 'Old Self', display_name: 'Old Self',
    });
    const statement = 'My childhood mailbox was mine alone.';
    const username  = 'oldhandle';
    const email     = 'private.mailbox@example.com';
    const vouchers  = 'Vouching Person, Second Voucher';
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        statement,
        claimed_legacy_username: username,
        claimed_legacy_email:    email,
        vouchers,
      });
    const item = openItems(memberId)[0];

    const res = action === 'approve'
      ? await request(createApp())
          .post(`/admin/work-queue/${item.id}/link-help/approve`)
          .set('Cookie', adminCookie()).type('form')
          .send({ target_legacy_member_id: `LM-${memberId}` })
      : await request(createApp())
          .post(`/admin/work-queue/${item.id}/link-help/reject`)
          .set('Cookie', adminCookie()).type('form')
          .send({ reason: 'No matching records found.' });
    expect(res.status).toBe(303);

    const rows = audits(memberId, actionType);
    expect(rows).toHaveLength(1);
    const recorded = `${String(rows[0].metadata_json)} ${String(rows[0].reason_text ?? '')}`;
    for (const secret of [statement, username, email, vouchers]) {
      expect(recorded).not.toContain(secret);
    }
    // The decision itself is still reconstructable from the row.
    expect(JSON.parse(String(rows[0].metadata_json)).work_queue_item_id).toBe(item.id);
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

/**
 * Separation of duties on the admin review actions.
 *
 * Any authenticated member can file a help request, including one who holds the
 * admin role. Without these guards an administrator files their own request and
 * then approves it, and because the approve path links with admin-vetted
 * evidence (which skips the surname gate by design) nothing at all stands
 * between that member and an unclaimed record. The dispute action is the other
 * half: it used to take the member to strip from the request body, bound to
 * nothing but the existence of an open dispute, so one request could revert the
 * claim of a member with no relationship to the dispute.
 */
describe('admin review: separation of duties', () => {
  it('refuses an approval by the administrator who filed the request, leaving the item open', async () => {
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ statement: 'I am the admin and these are mine.' });
    const item = openItems('admin-lh')[0];
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-self-approve', person_name: 'Somebody Else', hof_member: 1,
    });

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/approve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_historical_person_id: personId });

    expect(res.status).toBe(422);
    expect(openItems('admin-lh')[0].status).toBe('open');
    const self = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get('admin-lh') as Record<string, unknown>;
    expect(self.historical_person_id).toBeNull();
    expect(audits('admin-lh', 'support.help_request_approved')).toHaveLength(0);
  });

  it('refuses a dispute revert driven by the administrator who raised the dispute', async () => {
    // A second admin, so the first one's own item is the only thing under test.
    // Their surname matches the contested record, so the dispute they file names
    // it: without that the request is refused for naming an unrecorded record
    // and the separation-of-duties guard is never reached.
    insertMember(db, {
      id: 'admin-lh2', slug: 'admin_lh2', login_email: 'admin-lh2@example.com', is_admin: 1,
      real_name: 'Rival Name', display_name: 'Rival Name',
    });
    const holderId = seedRequester();
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-self-dispute', person_name: 'Contested Name', hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, holderId);

    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: 'admin-lh2', role: 'admin' })}`)
      .type('form')
      .send({ statement: 'That record is mine, not theirs.', is_dispute: '1' });
    const item = openItems('admin-lh2')[0];

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/dispute-revert`)
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: 'admin-lh2', role: 'admin' })}`)
      .type('form')
      .send({ target_historical_person_id: personId, reason: 'Upholding my own dispute.' });

    expect(res.status).toBe(422);
    const holder = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(holderId) as Record<string, unknown>;
    expect(holder.historical_person_id).toBe(personId);
    expect(audits(holderId, 'claim.revert_applied')).toHaveLength(0);
  });

  it('reverts the member who actually holds the disputed record, named by the record not by the caller', async () => {
    const holderId = seedRequester();
    // Same surname as the held record, which is what puts that record on the
    // requester's conflict card and therefore into the dispute they file.
    const requesterId = seedRequester('Other Record');
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-derived-holder', person_name: 'Held Record', hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, holderId);

    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ statement: 'Someone else holds my record.', is_dispute: '1' });
    const item = openItems(requesterId)[0];

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/dispute-revert`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_historical_person_id: personId, reason: 'Evidence favours the requester.' });

    expect(res.status).toBe(303);
    const holder = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(holderId) as Record<string, unknown>;
    expect(holder.historical_person_id).toBeNull();
    expect(audits(holderId, 'claim.revert_applied')).toHaveLength(1);
    // The requester is not linked by the revert; approving the item is the
    // separate second step, so their own record must be untouched here.
    const requester = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(requesterId) as Record<string, unknown>;
    expect(requester.historical_person_id).toBeNull();
  });

  it('cannot reach an unrelated member: the old holder-id body field is inert', async () => {
    const bystanderId = seedRequester();
    const requesterId = seedRequester();
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-bystander', person_name: 'Bystander Record', hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, bystanderId);

    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ statement: 'Dispute.', is_dispute: '1' });
    const item = openItems(requesterId)[0];

    // Exactly the payload that used to strip an arbitrary member's claim.
    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/dispute-revert`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ holder_member_id: bystanderId, reason: 'Naming the victim directly.' });

    expect(res.status).toBe(422);
    const bystander = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(bystanderId) as Record<string, unknown>;
    expect(bystander.historical_person_id).toBe(personId);
    expect(audits(bystanderId, 'claim.revert_applied')).toHaveLength(0);
  });

  // The record must be one the dispute named, which means it was held when the
  // dispute was filed. Losing its holder afterwards is the case this covers: the
  // revert reports there is nothing to undo and leaves the request open, rather
  // than reaching for whoever else the platform could find.
  it('reports nothing to revert when the disputed record has since been unheld', async () => {
    const holderId = seedRequester('Vacated Record');
    const requesterId = seedRequester('Claimant Record');
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-unheld', person_name: 'Vacated Record', hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, holderId);

    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ statement: 'Dispute.', is_dispute: '1' });
    const item = openItems(requesterId)[0];
    // The holder walks away from the record before an administrator gets to it.
    db.prepare('UPDATE members SET historical_person_id = NULL WHERE id = ?').run(holderId);

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/dispute-revert`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_historical_person_id: personId, reason: 'Nobody holds it now.' });

    expect(res.status).toBe(422);
    expect(openItems(requesterId)[0].status).toBe('open');
    // No forensic pair is written for a revert that did not happen.
    expect(audits(holderId, 'claim.dispute_opened')).toHaveLength(0);
    expect(audits(holderId, 'claim.revert_applied')).toHaveLength(0);
  });

  // The registration card shows at most five conflicting records so a common
  // surname cannot flood it. A filed dispute records the whole set, because that
  // set is what bounds the later revert: capping it would scan legacy accounts
  // first and leave every competition record out, refusing a revert on a record
  // genuinely in conflict.
  it('records every conflicting record on a dispute, past the number the card shows', async () => {
    const surname = 'Crowded';
    for (let i = 0; i < 6; i += 1) {
      const holder = seedRequester(`Legacy${i} ${surname}`);
      const legacyId = `LM-crowded-${i}`;
      insertLegacyMember(db, {
        legacy_member_id: legacyId, legacy_email: `crowded${i}@old.example.com`,
        real_name: `Legacy${i} ${surname}`, display_name: `Legacy${i} ${surname}`,
      });
      db.prepare(`UPDATE legacy_members
                  SET claimed_by_member_id = ?, claimed_at = '2026-01-01T00:00:00.000Z'
                  WHERE legacy_member_id = ?`).run(holder, legacyId);
      db.prepare('UPDATE members SET legacy_member_id = ? WHERE id = ?').run(legacyId, holder);
    }
    const hpHolder = seedRequester(`Person ${surname}`);
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-crowded', person_name: `Person ${surname}`, hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, hpHolder);

    const requesterId = seedRequester(`Rival ${surname}`);
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ statement: 'One of those is mine.', is_dispute: '1' });

    const payload = JSON.parse(String(openItems(requesterId)[0].reason_text)) as Record<string, unknown>;
    expect((payload.disputed_legacy_member_ids as string[]).length).toBeGreaterThan(5);
    expect(payload.disputed_historical_person_ids).toContain(personId);
  });

  // The revert accepts only a record the dispute named, and those ids live in
  // the stored payload. If the card does not show them the administrator has no
  // way to learn an id the action will accept, and the control cannot be used.
  it('shows the administrator the records the dispute named, so the revert can be used', async () => {
    const holderId = seedRequester('Listed Record');
    const requesterId = seedRequester('Rival Record');
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-listed', person_name: 'Listed Record', hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, holderId);

    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ statement: 'That record is mine.', is_dispute: '1' });

    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Records this dispute named when it was filed');
    expect(res.text).toContain(personId);
  });

  // A re-filed request collapses onto the row the member already has, so that
  // row must take the newer payload. Otherwise a member who first asks for help
  // and then disputes a record is left holding an item that is not a dispute,
  // and the revert refuses it forever.
  it('a request re-filed as a dispute becomes one, and the named record is revertible', async () => {
    const holderId = seedRequester('Second Thoughts');
    const requesterId = seedRequester('Rival Thoughts');
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-resubmit', person_name: 'Second Thoughts', hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, holderId);

    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ statement: 'Please help me link my records.' });
    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ statement: 'On reflection, that record is mine.', is_dispute: '1' });

    const items = openItems(requesterId);
    expect(items).toHaveLength(1);
    const payload = JSON.parse(String(items[0].reason_text)) as Record<string, unknown>;
    expect(payload.is_dispute).toBe(true);
    expect(payload.disputed_historical_person_ids).toContain(personId);

    const res = await request(createApp())
      .post(`/admin/work-queue/${items[0].id}/link-help/dispute-revert`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_historical_person_id: personId, reason: 'Dispute upheld.' });
    expect(res.status).toBe(303);
    const holder = db.prepare('SELECT historical_person_id FROM members WHERE id = ?')
      .get(holderId) as Record<string, unknown>;
    expect(holder.historical_person_id).toBeNull();
  });

  // A member can legitimately hold a legacy account and a separate historical
  // record. When only the historical record is disputed, upholding the dispute
  // must actually clear that record: leaving it on the member while stripping
  // something else undoes nothing the dispute was about.
  it('clears the disputed historical record even when the holder also holds an unrelated legacy account', async () => {
    const holderId = seedRequester('Double Holder');
    const requesterId = seedRequester('Rival Holder');
    insertLegacyMember(db, {
      legacy_member_id: 'LM-double', legacy_email: 'double@old.example.com',
      real_name: 'Unrelated Alias', display_name: 'Unrelated Alias',
    });
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-double', person_name: 'Double Holder', hof_member: 1,
    });
    db.prepare('UPDATE members SET legacy_member_id = ?, historical_person_id = ? WHERE id = ?')
      .run('LM-double', personId, holderId);
    db.prepare(`UPDATE legacy_members
                SET claimed_by_member_id = ?, claimed_at = '2026-01-01T00:00:00.000Z'
                WHERE legacy_member_id = ?`)
      .run(holderId, 'LM-double');

    await request(createApp())
      .post('/register/wizard/legacy_claim/help-request')
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ statement: 'That record is mine.', is_dispute: '1' });
    const item = openItems(requesterId)[0];

    const res = await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/dispute-revert`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_historical_person_id: personId, reason: 'Impersonation upheld.' });

    expect(res.status).toBe(303);
    const holder = db.prepare('SELECT historical_person_id FROM members WHERE id = ?')
      .get(holderId) as Record<string, unknown>;
    expect(holder.historical_person_id).toBeNull();
    expect(audits(holderId, 'claim.revert_applied')).toHaveLength(1);
  });
});
