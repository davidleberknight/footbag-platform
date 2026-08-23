/**
 * Member link help-request lifecycle: a member with no surfaced candidate asks
 * for the link through the identity-link category of the contact form, which is
 * the one category an administrator answers by applying a link; the request
 * lands in the admin work queue (one open item per member, with admin-alerts
 * fan-out and a submitted audit event); an admin approves it, which applies the
 * legacy link with admin-vetted evidence and resolves the item atomically, or
 * rejects it with a required reason. Failed approvals (bad target) leave the
 * queue item open. Submission is rate-limited per member. Whether the request
 * is a conflict dispute is detected from the records, never declared.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson, insertAuditEntry, insertWorkQueueItem, createTestSessionJwt } from '../fixtures/factories';

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

function slugFor(memberId: string): string {
  const row = db.prepare('SELECT slug FROM members WHERE id = ?').get(memberId) as
    | { slug: string }
    | undefined;
  return String(row?.slug ?? memberId);
}

/**
 * The member's one route to an administrator once signing up is behind them.
 * Claiming closes with the onboarding wizard, so the identity-link category of
 * the contact form is what raises the link-help item an administrator resolves
 * by applying the link.
 */
function askAdminToLink(memberId: string, statement: string) {
  return request(createApp())
    .post(`/members/${slugFor(memberId)}/contact-admin`)
    .set('Cookie', cookieFor(memberId))
    .type('form')
    .send({ category: 'identity_link_issue', message: statement });
}

function openItems(memberId: string): Array<Record<string, unknown>> {
  return db.prepare(`
    SELECT * FROM work_queue_items
    WHERE entity_id = ? AND task_type = 'member_link_help_request'
    ORDER BY created_at
  `).all(memberId) as Array<Record<string, unknown>>;
}

function mailTo(memberId: string): Array<{ subject: string; body_text: string | null }> {
  return db.prepare(`
    SELECT subject, body_text FROM outbox_emails
    WHERE recipient_member_id = ?
    ORDER BY created_at, id
  `).all(memberId) as Array<{ subject: string; body_text: string | null }>;
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
  it('raises the link-help item from the identity-link contact category, with audit + dedupe onto the open item', async () => {
    const memberId = seedRequester();
    const res = await askAdminToLink(memberId, 'I competed at Worlds 2003 as Helper.');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${slugFor(memberId)}/contact-admin`);

    const items = openItems(memberId);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('open');
    expect(items[0].queue_category).toBe('membership');
    const payload = JSON.parse(String(items[0].reason_text)) as Record<string, unknown>;
    expect(payload.statement).toBe('I competed at Worlds 2003 as Helper.');
    expect(payload.is_dispute).toBe(false);
    expect(audits(memberId, 'support.help_request_submitted')).toHaveLength(1);

    // Re-submit collapses onto the open item rather than stacking a second.
    const again = await askAdminToLink(memberId, 'Second message.');
    expect(again.status).toBe(303);
    expect(openItems(memberId)).toHaveLength(1);
  });

  it('leaves every other contact category on the contact-request queue', async () => {
    // Only the identity-link category is answered by applying a link, so it is
    // the only one that leaves the ordinary contact queue.
    const memberId = seedRequester();
    const res = await request(createApp())
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'tier_status_question', message: 'Is my Tier 2 recorded?' });
    expect(res.status).toBe(303);
    expect(openItems(memberId)).toHaveLength(0);

    const contactRows = db.prepare(`
      SELECT id FROM work_queue_items
      WHERE entity_id = ? AND task_type = 'member_contact_request'
    `).all(memberId) as Array<Record<string, unknown>>;
    expect(contactRows).toHaveLength(1);
    expect(audits(memberId, 'support.contact_request_submitted')).toHaveLength(1);
    expect(audits(memberId, 'support.help_request_submitted')).toHaveLength(0);
  });

  it('classifies a request as a dispute from the records, not from anything the member declares', async () => {
    // The member never says "this is a dispute": the form carries no such
    // control. The platform detects that another account already holds a record
    // this member's own surname reaches, and binds the dispute to those records
    // so a later admin revert can only touch what was actually detected.
    const holderId = seedRequester();
    const requesterId = seedRequester('Detected Conflict');
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-detected-dispute', person_name: 'Held Conflict', hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, holderId);

    await askAdminToLink(requesterId, 'One of those records is mine.');

    const payload = JSON.parse(String(openItems(requesterId)[0].reason_text)) as Record<string, unknown>;
    expect(payload.is_dispute).toBe(true);
    expect(payload.disputed_historical_person_ids).toContain(personId);
    expect((payload.disputed_record_holders as Record<string, string>)[personId]).toBe(holderId);
  });

  it('adding detail after a dispute does not withdraw the dispute', async () => {
    // A later submission collapses onto the same open item. Treating it as a
    // withdrawal would blank the record set an administrator's revert is bound
    // to, leaving a dispute that can never be resolved. The flag and the records
    // carry forward even once the conflict itself is gone.
    const holderId = seedRequester();
    const requesterId = seedRequester('Persisting Dispute');
    const personId = insertHistoricalPerson(db, {
      person_id: 'hp-persisting-dispute', person_name: 'Held Dispute', hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, holderId);

    await askAdminToLink(requesterId, 'One of those records is mine.');
    const disputed = JSON.parse(String(openItems(requesterId)[0].reason_text)) as Record<string, unknown>;
    expect(disputed.is_dispute).toBe(true);

    // The holder walks away from the record, so detection would now find
    // nothing; the standing dispute must survive that.
    db.prepare('UPDATE members SET historical_person_id = NULL WHERE id = ?').run(holderId);
    await askAdminToLink(requesterId, 'Here is more detail about which one.');

    const items = openItems(requesterId);
    expect(items).toHaveLength(1);
    const after = JSON.parse(String(items[0].reason_text)) as Record<string, unknown>;
    expect(after.statement).toBe('Here is more detail about which one.');
    expect(after.is_dispute).toBe(true);
    // The dispute pair marks the transition, so re-filing does not stack a copy.
    expect(audits(requesterId, 'claim.dispute_opened')).toHaveLength(1);
  });

  it("keeps the member's own words out of the append-only audit ledger", async () => {
    // The audit ledger is trigger-protected append-only and exempt from PII
    // purge, so member-authored free text lives only in the mutable work-queue
    // row; the audit row carries linkage and the dispute flag.
    const memberId = seedRequester();
    const res = await askAdminToLink(
      memberId, 'These tournament results are mine, I was oldhandle@old.example.com.',
    );
    expect(res.status).toBe(303);

    const item = openItems(memberId)[0];
    const payload = JSON.parse(String(item.reason_text)) as Record<string, unknown>;
    expect(String(payload.statement)).toContain('oldhandle@old.example.com');

    const submitted = audits(memberId, 'support.help_request_submitted');
    expect(submitted).toHaveLength(1);
    const metadata = JSON.parse(String(submitted[0].metadata_json)) as Record<string, unknown>;
    expect(metadata.work_queue_item_id).toBe(item.id);
    expect(metadata.is_dispute).toBe(false);
    expect(metadata).not.toHaveProperty('statement');
    expect(String(submitted[0].metadata_json)).not.toContain('oldhandle');
  });

  it('rejects an empty message with an inline 422 and raises nothing', async () => {
    const memberId = seedRequester();
    const res = await askAdminToLink(memberId, '   ');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Message is required');
    expect(openItems(memberId)).toHaveLength(0);
  });

  it('counts against the same three open requests as any other kind the member raised', async () => {
    // The cap is on what the member asked of an administrator, whichever queue
    // the answer comes back through. Routing identity-link requests to their own
    // task type must not hand the member a fourth slot.
    const memberId = seedRequester();
    for (let i = 0; i < 3; i += 1) {
      insertWorkQueueItem(db, {
        entity_id: memberId, task_type: 'member_contact_request', status: 'open',
      });
    }
    const res = await askAdminToLink(memberId, 'And now my records, please.');
    expect(res.status).toBe(429);
    expect(res.text).toContain('already have 3 open requests');
    expect(openItems(memberId)).toHaveLength(0);
  });

  it('an open link request occupies one of the three, blocking a further contact request', async () => {
    // The reverse direction of the rule above. An open link-help row has to take
    // a slot from the ordinary contact form too, or the cap is three plus one.
    const memberId = seedRequester();
    await askAdminToLink(memberId, 'My records, please.');
    for (let i = 0; i < 2; i += 1) {
      insertWorkQueueItem(db, {
        entity_id: memberId, task_type: 'member_contact_request', status: 'open',
      });
    }
    const res = await request(createApp())
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'tier_status_question', message: 'And my tier?' });
    expect(res.status).toBe(429);
    expect(res.text).toContain('already have 3 open requests');
  });

  it('frees a slot as each request is answered', async () => {
    // An answered request is no longer waiting on an administrator, so it must
    // stop occupying a slot; counting resolved rows would cap a member for life.
    const memberId = seedRequester();
    await askAdminToLink(memberId, 'My records, please.');
    insertWorkQueueItem(db, {
      entity_id: memberId, task_type: 'member_contact_request', status: 'open',
    });
    insertWorkQueueItem(db, {
      entity_id: memberId, task_type: 'member_contact_request', status: 'resolved',
    });
    insertWorkQueueItem(db, {
      entity_id: memberId, task_type: 'member_contact_request', status: 'dismissed',
    });
    const res = await request(createApp())
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'tier_status_question', message: 'Two open, so there is room.' });
    expect(res.status).toBe(303);
  });

  it('lets a member at the cap correct the link request they already have open', async () => {
    // A second identity-link submission replaces the payload on the open row
    // rather than opening another, so it cannot push them past the cap. Refusing
    // it would strand a member at the cap who came back to correct the one
    // request an administrator most needs to understand.
    const memberId = seedRequester();
    await askAdminToLink(memberId, 'First attempt at explaining.');
    for (let i = 0; i < 2; i += 1) {
      insertWorkQueueItem(db, {
        entity_id: memberId, task_type: 'member_contact_request', status: 'open',
      });
    }
    const res = await askAdminToLink(memberId, 'Clearer explanation of the same thing.');
    expect(res.status).toBe(303);
    const items = openItems(memberId);
    expect(items).toHaveLength(1);
    const payload = JSON.parse(String(items[0].reason_text)) as Record<string, unknown>;
    expect(payload.statement).toBe('Clearer explanation of the same thing.');
  });

  it('never counts work the platform raised about the member', async () => {
    // Those items are not the member's to clear, so counting them would let a
    // run of payment tasks silence someone who has asked for nothing.
    // Two of the member's own slots are already spent, so the third is the only
    // one left: if a single platform-raised row were counted, this would be
    // refused.
    const memberId = seedRequester();
    for (const taskType of ['unattributed_refund', 'partial_refund_review', 'auto_link_match_review']) {
      insertWorkQueueItem(db, { entity_id: memberId, task_type: taskType, status: 'open' });
    }
    for (let i = 0; i < 2; i += 1) {
      insertWorkQueueItem(db, {
        entity_id: memberId, task_type: 'member_contact_request', status: 'open',
      });
    }
    const res = await askAdminToLink(memberId, 'None of that queue was mine.');
    expect(res.status).toBe(303);
    expect(openItems(memberId)).toHaveLength(1);
  });

  it('is refused to a registrant who has not finished signing up', async () => {
    // Writing to an administrator is a member capability: the surface an
    // administrator answers on is member-only, so a request filed by someone
    // still signing up could never be answered.
    _n += 1;
    const pendingId = `lh-pending-${_n}`;
    insertMember(db, {
      id: pendingId, slug: `lh_pending_${_n}`, login_email: `${pendingId}@example.com`,
      onboarding: 'none',
    });
    const res = await request(createApp())
      .post(`/members/${slugFor(pendingId)}/contact-admin`)
      .set('Cookie', cookieFor(pendingId))
      .type('form')
      .send({ category: 'identity_link_issue', message: 'Let me in.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
    expect(openItems(pendingId)).toHaveLength(0);
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
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'These records are mine.' });
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

  it('tells the member their records were linked', async () => {
    // Submitting the form promises a reply. This is the one contact category
    // answered by applying a link rather than by writing back, so without this
    // the member is told to expect an answer and never gets one.
    const memberId = seedRequester();
    insertLegacyMember(db, {
      legacy_member_id: `LM-${memberId}`, legacy_email: `${memberId}@old.example.com`,
      real_name: 'Old Self', display_name: 'Old Self',
    });
    await askAdminToLink(memberId, 'These records are mine.');
    const item = openItems(memberId)[0];
    const before = mailTo(memberId).length;

    await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/approve`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_legacy_member_id: `LM-${memberId}` });

    const sent = mailTo(memberId).slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('your records are now linked');
  });

  it('tells the member a refused request was refused, and why', async () => {
    // A refusal the member cannot see the reason for leaves them with no way to
    // answer it. The administrator's reason travels, the way the ordinary
    // contact-request resolution reply already carries its note.
    const memberId = seedRequester();
    await askAdminToLink(memberId, 'I think these are mine.');
    const item = openItems(memberId)[0];
    const before = mailTo(memberId).length;

    await request(createApp())
      .post(`/admin/work-queue/${item.id}/link-help/reject`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'The competition record names a different player.' });

    const sent = mailTo(memberId).slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('no link was applied');
    expect(String(sent[0].body_text)).toContain('names a different player');
    // The member's own words stay out of the reply, matching the contact-request
    // resolution email, which never echoes the request back.
    expect(String(sent[0].body_text)).not.toContain('I think these are mine');
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
    const statement =
      'My childhood mailbox private.mailbox@example.com was mine alone, ask Vouching Person.';
    await askAdminToLink(memberId, statement);
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
    for (const secret of [statement, 'private.mailbox@example.com', 'Vouching Person']) {
      expect(recorded).not.toContain(secret);
    }
    // The decision itself is still reconstructable from the row.
    expect(JSON.parse(String(rows[0].metadata_json)).work_queue_item_id).toBe(item.id);
  });

  it('approve with an unknown target leaves the item open and surfaces the error', async () => {
    const memberId = seedRequester();
    await request(createApp())
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'Mine.' });
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
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'The competition record is mine.' });
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
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'Mine.' });
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
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'That record is mine.' });
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
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'Mine too.' });
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
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ category: 'identity_link_issue', message: 'Render me.' });

    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Member link help request');
    expect(res.text).toContain('Render me.');
    expect(res.text).toContain('/link-help/approve');
    expect(res.text).toContain('/link-help/reject');
  });

  it('puts the evidence behind the decision on the card, in words rather than codes', async () => {
    // Without this an administrator adjudicates on what the member typed and
    // nothing else. The ledger is the only place a past attempt survives: the
    // claim may since have been reverted, and a refused one wrote no other row.
    const memberId = seedRequester('Rex Refused');
    // A refused attempt the member made while still signing up. Seeded on the
    // ledger rather than replayed through the claim route, because that route
    // closes the moment onboarding completes and filing a help request needs a
    // member: the two cannot both be true of one live request. What the block
    // promises is to render what the ledger holds, which is what this pins.
    db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1983-06-01', memberId);
    insertLegacyMember(db, { legacy_member_id: 'lm-evidence-refused' });
    db.prepare('UPDATE legacy_members SET birth_date = ? WHERE legacy_member_id = ?')
      .run('1971-12-25', 'lm-evidence-refused');
    insertHistoricalPerson(db, {
      person_id: 'hp-evidence-refused',
      person_name: 'Other Personsson',
      legacy_member_id: 'lm-evidence-refused',
    });
    insertAuditEntry(db, {
      action_type: 'claim.historical_person_blocked',
      actor_type: 'member',
      actor_member_id: memberId,
      entity_id: memberId,
      metadata: {
        person_id: 'hp-evidence-refused',
        person_name: 'Other Personsson',
        reason: 'surname_mismatch',
        dob_comparison: 'mismatch',
        assessment: 'contradicted',
      },
    });

    await request(createApp())
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form').send({ category: 'identity_link_issue', message: 'Please look at this.' });

    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('What This Member Has Already Tried');
    expect(res.text).toContain('Refused: the surname did not match');
    expect(res.text).toContain('Other Personsson');
    expect(res.text).toContain('Date of birth does not match the record');
    // Both dates stand beside the verdict. An administrator weighing a doubtful
    // claim is asking whether the platform's own comparison can be trusted, and
    // a verdict the platform computed cannot answer that; only the values can.
    expect(res.text).toContain('1983-06-01');
    expect(res.text).toContain('1971-12-25');
    // The outcome is stated, never the raw vocabulary the row stores.
    expect(res.text).not.toContain('no_legacy_account');
    expect(res.text).not.toContain('declared_anchor_only');
  });

  it('says so plainly when a member has attempted no claim at all', async () => {
    const memberId = seedRequester();
    await request(createApp())
      .post(`/members/${slugFor(memberId)}/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form').send({ category: 'identity_link_issue', message: 'Nothing tried yet.' });

    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(res.text).toContain('has not attempted a claim');
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
      .post(`/members/${slugFor('admin-lh')}/contact-admin`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ category: 'identity_link_issue', message:'I am the admin and these are mine.' });
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
      .post(`/members/${slugFor('admin-lh2')}/contact-admin`)
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: 'admin-lh2', role: 'admin' })}`)
      .type('form')
      .send({ category: 'identity_link_issue', message:'That record is mine, not theirs.' });
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
      .post(`/members/${slugFor(requesterId)}/contact-admin`)
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'Someone else holds my record.' });
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
      .post(`/members/${slugFor(requesterId)}/contact-admin`)
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'Dispute.' });
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
      .post(`/members/${slugFor(requesterId)}/contact-admin`)
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'Dispute.' });
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
      .post(`/members/${slugFor(requesterId)}/contact-admin`)
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'One of those is mine.' });

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
      .post(`/members/${slugFor(requesterId)}/contact-admin`)
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'That record is mine.' });

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
      .post(`/members/${slugFor(requesterId)}/contact-admin`)
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'Please help me link my records.' });
    await request(createApp())
      .post(`/members/${slugFor(requesterId)}/contact-admin`)
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'On reflection, that record is mine.' });

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
      .post(`/members/${slugFor(requesterId)}/contact-admin`)
      .set('Cookie', cookieFor(requesterId))
      .type('form')
      .send({ category: 'identity_link_issue', message:'That record is mine.' });
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
