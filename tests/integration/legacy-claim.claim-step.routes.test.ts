/**
 * The claim step's own answers, through HTTP: claiming a card, claiming under
 * the surname a card carries, the two non-claiming answers, the one
 * last attempt with its date-of-birth correction, and the refusals.
 *
 * Every claim re-checks the member's own evidence inside its transaction, so a
 * card the server would not accept never links anything, and every refusal
 * reads the same. Each case seeds surnames no other case uses, because the
 * name key scans every account and record in the database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertOnboardingTask,
  insertMemberDeclaredAnchor,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4377');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const NO_LONGER_AVAILABLE = 'This record is no longer available to claim.';
const CLAIM_STEP = '/register/wizard/legacy_claim';

// A surname no other case uses: letters only, so the name fold keeps it whole.
let seq = 0;
function surname(): string {
  seq += 1;
  let n = seq;
  let s = '';
  while (n > 0) { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return `Zw${s}ek`;
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

/** A registrant on the claim step: personal details on file, claim pending. */
function registrant(o: Parameters<typeof insertMember>[1]): string {
  const id = insertMember(db, { onboarding: 'none', birth_date: '1975-06-12', ...o });
  insertOnboardingTask(db, id, 'personal_details', 'completed');
  return id;
}

function links(memberId: string): { legacy_member_id: string | null; historical_person_id: string | null } {
  return db.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?')
    .get(memberId) as { legacy_member_id: string | null; historical_person_id: string | null };
}

function auditRows(memberId: string, actionType: string): Array<{ metadata_json: string }> {
  return db.prepare('SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ?')
    .all(memberId, actionType) as Array<{ metadata_json: string }>;
}

function count(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

function post(path: string, memberId: string, body: Record<string, string>) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId)).type('form').send(body);
}

function page(memberId: string) {
  return request(createApp()).get(CLAIM_STEP).set('Cookie', cookieFor(memberId));
}

describe('claiming a card', () => {
  // Defect caught: a corroborated old account is not claimed whole with the
  // record the pipeline linked to it, the step stays open, or the ledger lacks
  // the evidence block, or carries a name, a date of birth or an address.
  it('claims an account and its linked record in one step, at the tier its evidence proves', async () => {
    const sn = surname();
    const email = `cs-pair-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Ada ${sn}`, legacy_email: email, birth_date: '1975-06-12' });
    const record = insertHistoricalPerson(db, { person_name: `Ada ${sn}`, legacy_member_id: account });
    const m = registrant({ real_name: `Ada ${sn}`, login_email: email });

    const before = await page(m);
    expect(before.status).toBe(200);
    expect(before.text).toContain('action="/register/wizard/legacy_claim/claim"');

    const res = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: record });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expect(links(m)).toEqual({ legacy_member_id: account, historical_person_id: record });
    expect(count(`SELECT COUNT(*) AS n FROM member_onboarding_tasks
                  WHERE member_id = ? AND task_type = 'legacy_claim' AND state = 'completed'`, m)).toBe(1);

    const [claimRow] = auditRows(m, 'claim.legacy_account');
    const meta = JSON.parse(claimRow.metadata_json) as Record<string, unknown>;
    expect(meta.evidence_strength).toBe('currently_controls_modern_email_matching_legacy');
    expect(meta.evidence).toMatchObject({
      account_id: account, record_id: record, curated_pair: true, corroborated: true,
      written_tier: 'currently_controls_modern_email_matching_legacy',
    });
    expect(claimRow.metadata_json.toLowerCase()).not.toContain(sn.toLowerCase());
    expect(claimRow.metadata_json).not.toContain('1975-06-12');
    expect(claimRow.metadata_json).not.toContain(email);
  });

  // Defect caught: an account found through a declared old address is
  // recorded as proven control of a mailbox nobody proved.
  it('records the floor tier for an account reached through a declared old address', async () => {
    const sn = surname();
    const old = `cs-old-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Bea ${sn}`, legacy_email2: old });
    const m = registrant({ real_name: `Bea ${sn}` });
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: old });

    const res = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(res.status).toBe(303);
    expect(links(m).legacy_member_id).toBe(account);
    const meta = JSON.parse(auditRows(m, 'claim.legacy_account')[0].metadata_json) as Record<string, unknown>;
    expect(meta.evidence_strength).toBe('declared_anchor_only');
  });

  // Defect caught: an old account carrying an email nothing of the member's
  // matches is claimable by posting its ids, which would let anyone take a
  // legacy member's account by asserting a name.
  it('refuses an uncorroborated account found by name alone, uniformly, and records the refusal', async () => {
    const sn = surname();
    const account = insertLegacyMember(db, { real_name: `Cid ${sn}`, legacy_email: `cid-${sn}@old.example.com`.toLowerCase() });
    const m = registrant({ real_name: `Cid ${sn}` });

    const view = await page(m);
    expect(view.text).toContain(`Cid ${sn}`);
    expect(view.text).not.toContain('action="/register/wizard/legacy_claim/claim"');

    const res = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain(NO_LONGER_AVAILABLE);
    expect(links(m)).toEqual({ legacy_member_id: null, historical_person_id: null });
    const refused = auditRows(m, 'claim.refused');
    expect(refused).toHaveLength(1);
    expect(JSON.parse(refused[0].metadata_json)).toMatchObject({ account_id: account, refusal: 'uncorroborated' });
  });

  // Defect caught: a competition record reached by name, with an old account
  // the pipeline linked to it, renders with no claim control, so a member
  // cannot claim their own results; or it posts straight to the wizard claim
  // and skips the confirmation page's first-name warning.
  it('offers a name-matched record with a linked account through its confirmation page, claiming both', async () => {
    const sn = surname();
    const account = insertLegacyMember(db, { real_name: `Cal ${sn}` });
    const record = insertHistoricalPerson(db, { person_name: `Cal ${sn}`, legacy_member_id: account });
    const m = registrant({ real_name: `Cal ${sn}` });

    const view = await page(m);
    expect(view.status).toBe(200);
    expect(view.text).toContain(`href="/history/${record}/claim"`);
    expect(view.text).not.toContain('action="/register/wizard/legacy_claim/claim"');

    const res = await post(`/history/${record}/claim/confirm`, m, {});
    expect(res.status).toBe(303);
    expect(links(m)).toEqual({ legacy_member_id: account, historical_person_id: record });
    const meta = JSON.parse(auditRows(m, 'claim.legacy_account')[0].metadata_json) as Record<string, unknown>;
    expect(meta.evidence_strength).toBe('declared_anchor_only');
  });

  // Defect caught: an old account built from the site mirror (no email, no
  // date of birth) found by name shows no claim control, so its member can
  // never link it; or it is offered without the same-name caution.
  it('offers a mirror-built account found by name with its caution, and claims it', async () => {
    const sn = surname();
    const account = insertLegacyMember(db, { real_name: `Dov ${sn}` });
    const m = registrant({ real_name: `Dov ${sn}` });

    const view = await page(m);
    expect(view.status).toBe(200);
    expect(view.text).toContain('action="/register/wizard/legacy_claim/claim"');
    expect(view.text).toContain(`value="${account}"`);
    expect(view.text).toContain('This old account was found by name match');

    const res = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(res.status).toBe(303);
    expect(links(m).legacy_member_id).toBe(account);
    const meta = JSON.parse(auditRows(m, 'claim.legacy_account')[0].metadata_json) as Record<string, unknown>;
    expect(meta.evidence_strength).toBe('declared_anchor_only');
  });

  // Defect caught: a forged or unknown id gets an answer that differs from a
  // real refusal, which would let a member probe for ids.
  it('gives a forged id the same refusal and links nothing', async () => {
    const m = registrant({ real_name: `Dee ${surname()}` });
    const res = await post(`${CLAIM_STEP}/claim`, m, { accountId: 'lm-does-not-exist', recordId: 'hp-nope' });
    expect(res.status).toBe(422);
    expect(res.text).toContain(NO_LONGER_AVAILABLE);
    expect(links(m)).toEqual({ legacy_member_id: null, historical_person_id: null });
  });

  // Defect caught: a double click after a claim landed shows a refusal or
  // writes the claim and its tier grant twice.
  it('treats a repeated claim after success as the success it already was', async () => {
    const sn = surname();
    const email = `cs-twice-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Eli ${sn}`, legacy_email: email });
    const m = registrant({ real_name: `Eli ${sn}`, login_email: email });

    const first = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(first.status).toBe(303);
    const second = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    // The repeat lands exactly where the first claim did.
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(auditRows(m, 'claim.legacy_account')).toHaveLength(1);
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants
                  WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'`, m)).toBe(1);
    expect(auditRows(m, 'claim.refused')).toHaveLength(0);
  });

  // Defect caught: a record confirmation pressed twice answers the second
  // press with a refusal page and records a refused claim against the member.
  it('treats a repeated record confirmation after success as the success it already was', async () => {
    const sn = surname();
    const record = insertHistoricalPerson(db, { person_name: `Fen ${sn}` });
    const m = registrant({ real_name: `Fen ${sn}` });
    const path = `/history/${record}/claim/confirm`;
    const first = await post(path, m, {});
    expect(first.status).toBe(303);
    const second = await post(path, m, {});
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(auditRows(m, 'claim.historical_person')).toHaveLength(1);
    expect(auditRows(m, 'claim.refused')).toHaveLength(0);
  });

  // Defect caught: an old address or former surname added twice (a double
  // submit, a second tab) answers the second add with an error page.
  it('treats a repeated anchor add as the save it already was', async () => {
    const sn = surname();
    const m = registrant({ real_name: `Gus ${sn}` });
    const body = { anchorType: 'former_surname', anchorValue: `Old${sn}` };
    const first = await post(`${CLAIM_STEP}/anchors/add`, m, body);
    const second = await post(`${CLAIM_STEP}/anchors/add`, m, body);
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m)).toBe(1);
    expect(auditRows(m, 'legacy.anchor_declared')).toHaveLength(1);
  });
});

describe('two members claiming one account', () => {
  // Defect caught: two members racing for one account both link it, or the
  // loser keeps a partial claim or a tier grant.
  it('lets exactly one win when both post at once', async () => {
    const sn = surname();
    const email = `cs-race-${sn}@example.com`.toLowerCase();
    const old = `cs-race-old-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Fay ${sn}`, legacy_email: email, legacy_email2: old });
    const a = registrant({ real_name: `Fay ${sn}`, login_email: email });
    const b = registrant({ real_name: `Fay ${sn}` });
    insertMemberDeclaredAnchor(db, { member_id: b, anchor_type: 'old_email', anchor_value: old });

    const [ra, rb] = await Promise.all([
      post(`${CLAIM_STEP}/claim`, a, { accountId: account, recordId: '' }),
      post(`${CLAIM_STEP}/claim`, b, { accountId: account, recordId: '' }),
    ]);
    const winners = [ra, rb].filter((r) => r.status === 303);
    expect(winners).toHaveLength(1);
    const loser = ra.status === 303 ? b : a;
    expect(links(loser).legacy_member_id).toBeNull();
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants
                  WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'`, loser)).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM members WHERE legacy_member_id = ?', account)).toBe(1);
  });

  // Defect caught: a claim that passed its re-check and then lost the write
  // to a concurrent claimant leaves partial state, or tells the member nothing
  // about why the card they were just shown did not link.
  it('tells the member the account was claimed by another when the write loses after the re-check', async () => {
    const sn = surname();
    const email = `cs-lost-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Gus ${sn}`, legacy_email: email });
    const m = registrant({ real_name: `Gus ${sn}`, login_email: email });
    // The winner's link committed first, deterministically: the account row is
    // still unmarked, so the loser's re-check passes and its write meets the
    // one-holder index.
    const winner = insertMember(db, { real_name: `Gus ${sn}` });
    db.prepare('UPDATE members SET legacy_member_id = ? WHERE id = ?').run(account, winner);

    const res = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('already been claimed by another account');
    expect(links(m).legacy_member_id).toBeNull();
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants
                  WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'`, m)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM legacy_members
                  WHERE legacy_member_id = ? AND claimed_by_member_id IS NOT NULL`, account)).toBe(0);
  });
});

describe('claiming under the surname a card carries', () => {
  // Defect caught: a member whose name changed cannot claim their own old
  // account in one step, or the surname they used is not recorded, or it is
  // recorded as something other than the target's own surname.
  it('records the surname as a former surname and claims in one transaction', async () => {
    const now = surname();
    const before = surname();
    const email = `cs-sur-${now}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Hal ${before}`, legacy_email: email });
    const m = registrant({ real_name: `Hal ${now}`, login_email: email });

    const view = await page(m);
    expect(view.text).toContain(`I Used the Surname ${before}`);

    const res = await post(`${CLAIM_STEP}/claim-with-surname`, m, { accountId: account, recordId: '' });
    expect(res.status).toBe(303);
    expect(links(m).legacy_member_id).toBe(account);
    const anchors = db.prepare(
      `SELECT anchor_type, anchor_value FROM member_declared_anchors WHERE member_id = ?`,
    ).all(m);
    expect(anchors).toEqual([{ anchor_type: 'former_surname', anchor_value: before }]);
    expect(auditRows(m, 'legacy.anchor_declared')).toHaveLength(1);
  });

  // Defect caught: a surname claim the server refuses still leaves the
  // surname recorded against the member.
  it('adds no anchor when it refuses the claim', async () => {
    const m = registrant({ real_name: `Ida ${surname()}` });
    const res = await post(`${CLAIM_STEP}/claim-with-surname`, m, { accountId: 'lm-not-shown', recordId: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain(NO_LONGER_AVAILABLE);
    expect(count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m)).toBe(0);
  });
});

describe('the two non-claiming answers', () => {
  // Defect caught: a card offers a "This Is Not Me" control, so passing over
  // a card is a separate per-card answer rather than the step's one answer.
  it('are the only way past the cards: no card carries a decline control', async () => {
    const sn = surname();
    const record = insertHistoricalPerson(db, { person_name: `Joy ${sn}` });
    const m = registrant({ real_name: `Joy ${sn}` });
    const view = await page(m);
    expect(view.status).toBe(200);
    expect(view.text).toContain(`/history/${record}/claim`);
    expect(view.text).not.toContain('/register/wizard/legacy_claim/decline');
    expect(view.text).toContain('action="/register/wizard/legacy_claim/continue-without-linking"');
  });

  // Defect caught: answering "never had one" leaves the step pending, or
  // records nothing of the cards that were passed over.
  it('completes the step and records what was shown', async () => {
    const sn = surname();
    const record = insertHistoricalPerson(db, { person_name: `Max ${sn}` });
    const m = registrant({ real_name: `Max ${sn}` });

    const res = await post(`${CLAIM_STEP}/continue-without-linking`, m, { no_link_answer: 'never_had_one' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    const [answered] = auditRows(m, 'legacy.claim_step_answered');
    const meta = JSON.parse(answered.metadata_json) as { answer: string; shown: Array<{ record_id: string | null }> };
    expect(meta.answer).toBe('never_had_one');
    expect(meta.shown.map((s) => s.record_id)).toContain(record);
    expect(answered.metadata_json.toLowerCase()).not.toContain(sn.toLowerCase());
  });

  // Defect caught: a member who said they had an account and cannot find it
  // gets no last attempt, the corrected date does not re-run the match, or the
  // attempt stays open after it found their account.
  it('"cannot find it" opens one last attempt where a corrected date finds the account', async () => {
    const sn = surname();
    const account = insertLegacyMember(db, { real_name: `Nia ${sn}`, birth_date: '1984-03-09' });
    const m = registrant({ real_name: `Nia ${sn}`, birth_date: '1984-09-03' });

    const answered = await post(`${CLAIM_STEP}/continue-without-linking`, m, { no_link_answer: 'cannot_find_it' });
    expect(answered.status).toBe(303);
    expect(answered.headers.location).toContain(CLAIM_STEP);

    const attempt = await page(m);
    expect(attempt.status).toBe(200);
    expect(attempt.text).toContain('action="/register/wizard/legacy_claim/birth-date"');
    expect(attempt.text).not.toContain('action="/register/wizard/legacy_claim/claim"');

    const corrected = await post(`${CLAIM_STEP}/birth-date`, m, { birthDay: '9', birthMonth: '3', birthYear: '1984' });
    expect(corrected.status).toBe(303);
    const after = await page(m);
    expect(after.text).toContain('action="/register/wizard/legacy_claim/claim"');

    const claimed = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(claimed.status).toBe(303);
    expect(links(m).legacy_member_id).toBe(account);

    const closed = await page(m);
    expect(closed.status).toBe(303);
    expect(closed.headers.location).not.toBe(CLAIM_STEP);
  });

  // Defect caught: the date of birth can be changed without limit while
  // signing up, which turns it into a probe of old accounts; or re-entering
  // the same date uses up a change.
  it('caps date-of-birth changes during onboarding and does not count a re-entry', async () => {
    const m = registrant({ real_name: `Oda ${surname()}`, birth_date: '1970-02-02' });
    await post(`${CLAIM_STEP}/continue-without-linking`, m, { no_link_answer: 'cannot_find_it' });

    const change = (d: string) => post(`${CLAIM_STEP}/birth-date`, m, { birthDay: d, birthMonth: '2', birthYear: '1970' });
    expect((await change('3')).status).toBe(303);
    expect((await change('3')).status).toBe(303);
    expect((await change('4')).status).toBe(303);
    expect((await change('5')).status).toBe(303);
    const refused = await change('6');
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('cannot be changed again while you are signing up');

    const row = db.prepare(`SELECT m.birth_date, t.birth_date_changes
                              FROM members m JOIN member_onboarding_tasks t
                                ON t.member_id = m.id AND t.task_type = 'legacy_claim'
                             WHERE m.id = ?`).get(m) as { birth_date: string; birth_date_changes: number };
    expect(row).toEqual({ birth_date: '1970-02-05', birth_date_changes: 3 });
  });
});

describe('answers the step no longer takes', () => {
  // Defect caught: a claim or decline posted to a completed step with no last
  // attempt open still links or records something.
  it('refuses claim-step writes once the step is answered without a last attempt', async () => {
    const sn = surname();
    const email = `cs-done-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Pip ${sn}`, legacy_email: email });
    const m = registrant({ real_name: `Pip ${sn}`, login_email: email });
    await post(`${CLAIM_STEP}/continue-without-linking`, m, { no_link_answer: 'never_had_one' });

    const claim = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(claim.status).toBe(303);
    expect(links(m).legacy_member_id).toBeNull();
  });

  // Defect caught: a claim runs before the date of birth the matching depends
  // on is on file.
  it('refuses claim-step writes while personal details are outstanding', async () => {
    const sn = surname();
    const email = `cs-pre-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Quin ${sn}`, legacy_email: email });
    const m = insertMember(db, { real_name: `Quin ${sn}`, login_email: email, onboarding: 'none' });

    const claim = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(claim.status).toBe(303);
    expect(links(m).legacy_member_id).toBeNull();
  });

  // Defect caught: claim attempts are unlimited, so a member can script
  // claims across many ids.
  it('rate-limits claim attempts and answers 429 with Retry-After', async () => {
    const m = registrant({ real_name: `Rae ${surname()}` });
    let res = await post(`${CLAIM_STEP}/claim`, m, { accountId: 'lm-rl-0', recordId: '' });
    for (let i = 1; i < 6 && res.status !== 429; i++) {
      res = await post(`${CLAIM_STEP}/claim`, m, { accountId: `lm-rl-${i}`, recordId: '' });
    }
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});
