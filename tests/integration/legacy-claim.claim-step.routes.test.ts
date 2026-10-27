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
let anchorLimit: number;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  const { readIntConfig } = await import('../../src/services/configReader');
  anchorLimit = readIntConfig('declared_anchor_rate_limit_max_per_member', 10);
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

function heldStep(memberId: string): { claim?: unknown; audit?: Array<{ actionType: string; metadata?: Record<string, unknown> }> } {
  const row = db.prepare(
    `SELECT answer_json FROM member_onboarding_tasks WHERE member_id = ? AND task_type = 'legacy_claim'`,
  ).get(memberId) as { answer_json: string | null } | undefined;
  return row?.answer_json ? JSON.parse(row.answer_json) : {};
}

function heldClaimJson(memberId: string): string | null {
  const claim = heldStep(memberId).claim;
  return claim === undefined ? null : JSON.stringify({ claim });
}

// A prospective member's claim evidence waits on their claim-step row, never in
// the audit log, until the transaction that makes them a member writes it.
function heldAudit(memberId: string, actionType: string): Array<{ metadata?: Record<string, unknown> }> {
  return (heldStep(memberId).audit ?? []).filter((e) => e.actionType === actionType);
}

// A registrant who confirms a claim is still a prospective member, so the
// claim is held on their own claim-step row and nothing shared changes: no
// link, no claimed marker on the old account, no tier grant and no claim
// ledger row. Anything landing early would hand someone else's account and
// honors to a person who has not finished joining.
function expectClaimHeld(memberId: string, target: { accountId: string | null; recordId: string | null }): void {
  expect(links(memberId)).toEqual({ legacy_member_id: null, historical_person_id: null });
  if (target.accountId !== null) {
    expect(count(`SELECT COUNT(*) AS n FROM legacy_members
                  WHERE legacy_member_id = ? AND claimed_by_member_id IS NOT NULL`, target.accountId)).toBe(0);
  }
  expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants
                WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'`, memberId)).toBe(0);
  expect(count(`SELECT COUNT(*) AS n FROM audit_entries
                WHERE entity_id = ? AND action_type IN ('claim.legacy_account', 'claim.historical_person')`, memberId)).toBe(0);
  expect(count(`SELECT COUNT(*) AS n FROM member_onboarding_tasks
                WHERE member_id = ? AND task_type = 'legacy_claim' AND state = 'completed'`, memberId)).toBe(1);
  expect(JSON.parse(heldClaimJson(memberId) ?? 'null')?.claim?.target).toEqual(target);
}

// A refused claim leaves the step as it was: no claim held for completion to
// write, and the step still waiting for an answer. A prospective member's
// links stay empty even after an accepted claim, so they cannot show this.
function expectNothingHeld(memberId: string): void {
  expect(heldClaimJson(memberId)).toBeNull();
  expect(count(`SELECT COUNT(*) AS n FROM member_onboarding_tasks
                WHERE member_id = ? AND task_type = 'legacy_claim' AND state = 'completed'`, memberId)).toBe(0);
}

// Answer the last onboarding step through the wizard, which completes
// onboarding and so writes every held answer.
async function finishOnboarding(memberId: string): Promise<void> {
  const res = await post('/register/wizard/club_affiliations/none', memberId, {});
  expect(res.status).toBe(303);
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
    expectClaimHeld(m, { accountId: account, recordId: record });

    await finishOnboarding(m);
    expect(links(m)).toEqual({ legacy_member_id: account, historical_person_id: record });

    const [claimRow] = auditRows(m, 'claim.legacy_account');
    const meta = JSON.parse(claimRow.metadata_json) as Record<string, unknown>;
    expect(meta.evidence_strength).toBe('currently_controls_modern_email_matching_legacy');
    expect(meta.evidence).toMatchObject({
      account_id: account, record_id: record, curated_pair: true, corroborated: true,
      written_strength: 'currently_controls_modern_email_matching_legacy',
    });
    expect(claimRow.metadata_json.toLowerCase()).not.toContain(sn.toLowerCase());
    expect(claimRow.metadata_json).not.toContain('1975-06-12');
    expect(claimRow.metadata_json).not.toContain(email);
  });

  // Defect caught: an account found through a declared old address is
  // recorded as proven control of a mailbox nobody proved.
  it('records the weakest evidence strength for an account reached through a declared old address', async () => {
    const sn = surname();
    const old = `cs-old-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Bea ${sn}`, legacy_email2: old });
    const m = registrant({ real_name: `Bea ${sn}` });
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: old });

    const res = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(res.status).toBe(303);
    expectClaimHeld(m, { accountId: account, recordId: null });
    await finishOnboarding(m);
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
    expectNothingHeld(m);
    // The refusal is held while they are not a member, then written once they are.
    expect(auditRows(m, 'claim.refused')).toHaveLength(0);
    expect(heldAudit(m, 'claim.refused')).toHaveLength(1);
    await post(`${CLAIM_STEP}/continue-without-linking`, m, { no_link_answer: 'cannot_find_it' });
    await finishOnboarding(m);
    const refused = auditRows(m, 'claim.refused');
    expect(refused).toHaveLength(1);
    expect(JSON.parse(refused[0].metadata_json)).toMatchObject({ account_id: account, refusal: 'uncorroborated' });
    expect(JSON.parse(refused[0].metadata_json).held_at).toEqual(expect.any(String));
    expect(heldStep(m)).toEqual({});
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
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expectClaimHeld(m, { accountId: null, recordId: record });
    await finishOnboarding(m);
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
    expectClaimHeld(m, { accountId: account, recordId: null });
    await finishOnboarding(m);
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
    expectNothingHeld(m);
  });

  // Defect caught: a prospective member's claim evidence is lost, reordered or
  // misdated on its way to the audit log: holding a later claim overwrites the
  // rows held before it, a later hold keeps only itself, the rows are written
  // in the wrong order, or held_at records completion instead of the act.
  it('writes every held evidence row at completion, in the order and with the time they happened', async () => {
    const sn = surname();
    const email = `cs-evidence-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Ada ${sn}`, legacy_email: email });
    const m = registrant({ real_name: `Ada ${sn}`, login_email: email });

    expect((await post(`${CLAIM_STEP}/anchors/add`, m, { anchorType: 'former_surname', anchorValue: `Old${sn}` })).status).toBe(303);
    expect((await post(`${CLAIM_STEP}/claim`, m, { accountId: 'lm-does-not-exist', recordId: '' })).status).toBe(422);
    expect((await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' })).status).toBe(303);
    expect(heldAudit(m, 'legacy.anchor_declared')).toHaveLength(1);
    expect(heldAudit(m, 'claim.refused')).toHaveLength(1);
    const beforeFinish = new Date().toISOString();

    await finishOnboarding(m);
    // ordering-is-the-contract: rows are written in the order the acts happened.
    const rows = db.prepare(
      `SELECT action_type, metadata_json FROM audit_entries
        WHERE entity_id = ? AND action_type IN ('legacy.anchor_declared', 'claim.refused', 'claim.legacy_account')
        ORDER BY rowid`,
    ).all(m) as Array<{ action_type: string; metadata_json: string }>;
    expect(rows.map((r) => r.action_type)).toEqual(['legacy.anchor_declared', 'claim.refused', 'claim.legacy_account']);
    for (const r of rows.slice(0, 2)) {
      expect(JSON.parse(r.metadata_json).held_at < beforeFinish, `${r.action_type} held_at`).toBe(true);
    }
    expect(links(m).legacy_member_id).toBe(account);
    expect(heldStep(m)).toEqual({});
  });

  // Defect caught: when the claim step is the last one answered and nothing
  // else is held, the held answer row is never written, so the one record that
  // the member could not find their old account is lost.
  it('writes the held answer when the claim step is the step that completes onboarding', async () => {
    const m = registrant({ real_name: `Ida ${surname()}` });
    insertOnboardingTask(db, m, 'club_affiliations', 'completed');
    const res = await post(`${CLAIM_STEP}/continue-without-linking`, m, { no_link_answer: 'cannot_find_it' });
    expect(res.status).toBe(303);
    expect(auditRows(m, 'wizard.legacy_claim.cannot_find_record')).toHaveLength(1);
    expect(heldStep(m)).toEqual({});
  });

  // Defect caught: a double click after a claim was accepted shows a refusal,
  // holds the claim a second time, or writes the claim and its tier grant
  // twice when onboarding completes.
  it('treats a repeated claim after success as the success it already was', async () => {
    const sn = surname();
    const email = `cs-twice-${sn}@example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Eli ${sn}`, legacy_email: email });
    const m = registrant({ real_name: `Eli ${sn}`, login_email: email });

    const first = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    expect(first.status).toBe(303);
    const heldAfterFirst = heldClaimJson(m);
    const second = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: '' });
    // The repeat lands exactly where the first claim did.
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    // The repeat holds nothing new: the held claim is still the first press's.
    expect(heldClaimJson(m)).toBe(heldAfterFirst);
    expectClaimHeld(m, { accountId: account, recordId: null });

    await finishOnboarding(m);
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
    const heldAfterFirst = heldClaimJson(m);
    const second = await post(path, m, {});
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(heldClaimJson(m)).toBe(heldAfterFirst);
    expectClaimHeld(m, { accountId: null, recordId: record });

    await finishOnboarding(m);
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
    expect(heldAudit(m, 'legacy.anchor_declared')).toHaveLength(1);
    expect(auditRows(m, 'legacy.anchor_declared')).toHaveLength(0);
  });
});

describe('two members claiming one account', () => {
  // Defect caught: two members racing for one account both link it, the
  // loser keeps a partial claim or a tier grant, or the loser's dropped claim
  // goes unrecorded so neither they nor an operator can learn it never landed.
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
    // Neither is a member yet, so neither claim is written and neither sees the
    // other's: both are accepted and held.
    expect([ra.status, rb.status]).toEqual([303, 303]);
    expectClaimHeld(a, { accountId: account, recordId: null });
    expectClaimHeld(b, { accountId: account, recordId: null });

    // Whoever finishes onboarding first lands the claim; the other's held
    // claim is refused at completion and dropped on the record.
    await Promise.all([finishOnboarding(a), finishOnboarding(b)]);
    expect(count('SELECT COUNT(*) AS n FROM members WHERE legacy_member_id = ?', account)).toBe(1);
    const winner = [a, b].find((id) => links(id).legacy_member_id === account)!;
    const loser = winner === a ? b : a;
    expect(links(loser).legacy_member_id).toBeNull();
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants
                  WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'`, loser)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM legacy_members
                  WHERE legacy_member_id = ? AND claimed_by_member_id = ?`, account, winner)).toBe(1);
    // One wizard.complete row per member, so the only row is the completion.
    const completion = (id: string) => {
      const rows = auditRows(id, 'wizard.complete');
      expect(rows).toHaveLength(1);
      return JSON.parse(rows[0].metadata_json) as { claim_not_applied: boolean };
    };
    expect(completion(winner).claim_not_applied).toBe(false);
    expect(auditRows(winner, 'wizard.held_answer.dropped')).toHaveLength(0);
    expect(completion(loser).claim_not_applied).toBe(true);
    const dropped = auditRows(loser, 'wizard.held_answer.dropped')
      .map((r) => JSON.parse(r.metadata_json) as Record<string, unknown>);
    expect(dropped).toEqual([{ task_type: 'legacy_claim', answer_kind: 'claim', reason: 'claim_refused' }]);
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

describe('two members claiming one competition record', () => {
  // Defect caught: two people signing up under one name both confirm the
  // same competition record and both end up holding it, or the one who
  // finishes second keeps a partial link, or never learns and no operator can
  // see that their claim did not land.
  it('lets exactly the first to finish signing up hold it, and records the other as not applied', async () => {
    const sn = surname();
    const record = insertHistoricalPerson(db, { person_name: `Ivo ${sn}` });
    const first = registrant({ real_name: `Ivo ${sn}` });
    const second = registrant({ real_name: `Ivo ${sn}` });
    const path = `/history/${record}/claim/confirm`;

    // Neither is a member yet, so neither claim is written and both are held.
    const [ra, rb] = await Promise.all([post(path, first, {}), post(path, second, {})]);
    expect([ra.status, rb.status]).toEqual([303, 303]);
    expectClaimHeld(first, { accountId: null, recordId: record });
    expectClaimHeld(second, { accountId: null, recordId: record });

    await finishOnboarding(first);
    await finishOnboarding(second);

    expect(count('SELECT COUNT(*) AS n FROM members WHERE historical_person_id = ?', record)).toBe(1);
    expect(links(first).historical_person_id).toBe(record);
    expect(links(second)).toEqual({ legacy_member_id: null, historical_person_id: null });
    expect(auditRows(first, 'claim.historical_person')).toHaveLength(1);
    expect(auditRows(second, 'claim.historical_person')).toHaveLength(0);

    const completion = (id: string) => {
      const rows = auditRows(id, 'wizard.complete');
      expect(rows).toHaveLength(1);
      return JSON.parse(rows[0].metadata_json) as { claim_not_applied: boolean };
    };
    expect(completion(first).claim_not_applied).toBe(false);
    expect(auditRows(first, 'wizard.held_answer.dropped')).toHaveLength(0);
    expect(completion(second).claim_not_applied).toBe(true);
    const dropped = auditRows(second, 'wizard.held_answer.dropped')
      .map((r) => JSON.parse(r.metadata_json) as Record<string, unknown>);
    expect(dropped).toEqual([{ task_type: 'legacy_claim', answer_kind: 'claim', reason: 'claim_refused' }]);
    expect(heldClaimJson(second)).toBeNull();
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
    expectClaimHeld(m, { accountId: account, recordId: null });
    expect(JSON.parse(heldClaimJson(m)!).claim.withSurname).toBe(true);

    await finishOnboarding(m);
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

describe('a differing-surname candidate only a declared old address reaches', () => {
  /** An old account and its linked record under `before`, carrying `old` as its address. */
  function seedOldAccount(first: string, before: string, old: string): { account: string; record: string } {
    const account = insertLegacyMember(db, { real_name: `${first} ${before}`, legacy_email: old });
    const record = insertHistoricalPerson(db, { person_name: `${first} ${before}`, legacy_member_id: account });
    return { account, record };
  }

  function claimState(memberId: string, account: string) {
    return {
      links: links(memberId),
      grants: count(`SELECT COUNT(*) AS n FROM member_tier_grants
                     WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'`, memberId),
      accountClaimed: count(`SELECT COUNT(*) AS n FROM legacy_members
                             WHERE legacy_member_id = ? AND claimed_by_member_id IS NOT NULL`, account),
      formerSurnames: count(`SELECT COUNT(*) AS n FROM member_declared_anchors
                             WHERE member_id = ? AND anchor_type = 'former_surname'`, memberId),
    };
  }

  // Defect caught: anyone who types someone's old address is shown that
  // person's card, learns the surname on it, and takes the account and its
  // tier with the one-step surname claim; or a crafted post of that claim
  // succeeds although no card offered it.
  it('shows no card for it, and refuses a crafted surname claim of it with nothing claimed', async () => {
    const now = surname();
    const before = surname();
    const old = `cs-unproven-${before}@old.example.com`.toLowerCase();
    const { account, record } = seedOldAccount('Ike', before, old);
    const m = registrant({ real_name: `Ike ${now}` });
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: old });

    const view = await page(m);
    expect(view.status).toBe(200);
    expect(view.text).not.toContain(before);
    expect(view.text).not.toContain(`value="${account}"`);
    expect(view.text).not.toContain('action="/register/wizard/legacy_claim/claim-with-surname"');

    const crafted = await post(`${CLAIM_STEP}/claim-with-surname`, m, { accountId: account, recordId: record });
    expect(crafted.status).toBe(422);
    expect(crafted.text).toContain(NO_LONGER_AVAILABLE);
    expect(claimState(m, account)).toEqual({
      links: { legacy_member_id: null, historical_person_id: null },
      grants: 0, accountClaimed: 0, formerSurnames: 0,
    });
    expect(auditRows(m, 'claim.legacy_account')).toHaveLength(0);
  });

  // Defect caught: hiding the declared-address case also hides the candidate
  // when the member's verified sign-in address reaches it too, so a member
  // whose name changed loses the one-step claim of their own account just
  // because they also declared an old address it carries.
  it('still offers the surname claim when the verified sign-in address reaches it as well', async () => {
    const now = surname();
    const before = surname();
    const login = `cs-both-${now}@example.com`.toLowerCase();
    const old = `cs-both-old-${before}@old.example.com`.toLowerCase();
    const account = insertLegacyMember(db, { real_name: `Jem ${before}`, legacy_email: login, legacy_email2: old });
    const m = registrant({ real_name: `Jem ${now}`, login_email: login });
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: old });

    const view = await page(m);
    expect(view.status).toBe(200);
    expect(view.text).toContain(`I Used the Surname ${before}`);

    const res = await post(`${CLAIM_STEP}/claim-with-surname`, m, { accountId: account, recordId: '' });
    expect(res.status).toBe(303);
    expectClaimHeld(m, { accountId: account, recordId: null });

    await finishOnboarding(m);
    expect(claimState(m, account)).toEqual({
      links: { legacy_member_id: account, historical_person_id: null },
      grants: 1, accountClaimed: 1, formerSurnames: 1,
    });
  });

  // Defect caught: the administrator's candidate list shows an internal status
  // code instead of saying why the member could not claim the account, so the
  // administrator cannot tell a surname mismatch from a hidden candidate.
  it('labels a differing-surname candidate and a hidden one in words for the administrator', async () => {
    const { identityAccessService } = await import('../../src/services/identityAccessService');

    const nowA = surname();
    const beforeA = surname();
    const login = `cs-admin-${nowA}@example.com`.toLowerCase();
    const reached = insertLegacyMember(db, { real_name: `Lev ${beforeA}`, legacy_email: login });
    const a = registrant({ real_name: `Lev ${nowA}`, login_email: login });
    const labelA = identityAccessService.getLinkCandidatesForAdmin(a).legacyAccounts
      .find((c) => c.legacyMemberId === reached)?.statusLabel;
    expect(labelA).toBe('Reached, but the surname differs from the member\'s.');

    const nowB = surname();
    const beforeB = surname();
    const old = `cs-admin-old-${beforeB}@old.example.com`.toLowerCase();
    const { account } = seedOldAccount('Lev', beforeB, old);
    const b = registrant({ real_name: `Lev ${nowB}` });
    insertMemberDeclaredAnchor(db, { member_id: b, anchor_type: 'old_email', anchor_value: old });
    const labelB = identityAccessService.getLinkCandidatesForAdmin(b).legacyAccounts
      .find((c) => c.legacyMemberId === account)?.statusLabel;
    expect(labelB).toBe('Hidden from the member: only an old address they declared reaches it, and the surname differs.');
  });

  // Defect caught: a member who declares the surname they really used still
  // cannot see or claim their own account found through their old address.
  it('becomes an ordinary claimable card once the member declares that surname', async () => {
    const now = surname();
    const before = surname();
    const old = `cs-declared-${before}@old.example.com`.toLowerCase();
    const { account, record } = seedOldAccount('Kit', before, old);
    const m = registrant({ real_name: `Kit ${now}` });
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: old });

    const added = await post(`${CLAIM_STEP}/anchors/add`, m, { anchorType: 'former_surname', anchorValue: before });
    expect(added.status).toBe(303);

    const view = await page(m);
    expect(view.status).toBe(200);
    expect(view.text).toContain('action="/register/wizard/legacy_claim/claim"');
    expect(view.text).toContain(`value="${account}"`);
    expect(view.text).not.toContain('action="/register/wizard/legacy_claim/claim-with-surname"');

    const res = await post(`${CLAIM_STEP}/claim`, m, { accountId: account, recordId: record });
    expect(res.status).toBe(303);
    expectClaimHeld(m, { accountId: account, recordId: record });

    await finishOnboarding(m);
    expect(claimState(m, account)).toEqual({
      links: { legacy_member_id: account, historical_person_id: record },
      grants: 1, accountClaimed: 1, formerSurnames: 1,
    });
  });

  // Defect caught: rendering the claim step records something (an anchor, a
  // refusal, a claim or a ledger row), so merely looking at the cards changes
  // the member's evidence or history.
  it('showing the claim step writes nothing', async () => {
    const now = surname();
    const before = surname();
    const old = `cs-readonly-${before}@old.example.com`.toLowerCase();
    const { account } = seedOldAccount('Lev', before, old);
    const m = registrant({ real_name: `Lev ${now}` });
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: old });

    const snapshot = () => ({
      audits: count('SELECT COUNT(*) AS n FROM audit_entries WHERE actor_member_id = ? OR entity_id = ?', m, m),
      anchors: count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m),
      member: db.prepare('SELECT version, updated_at FROM members WHERE id = ?').get(m),
      task: db.prepare(`SELECT state, version FROM member_onboarding_tasks
                         WHERE member_id = ? AND task_type = 'legacy_claim'`).get(m) ?? null,
      claim: claimState(m, account),
    });
    const before1 = snapshot();
    const view = await page(m);
    expect(view.status).toBe(200);
    expect(snapshot()).toEqual(before1);
  });
});

describe('declaring an anchor', () => {
  const add = (memberId: string, anchorType: string, anchorValue: string) =>
    post(`${CLAIM_STEP}/anchors/add`, memberId, { anchorType, anchorValue });

  /** Spend all but one of the member's anchor-change slots on real adds. */
  async function spendAllButOne(memberId: string): Promise<void> {
    for (let i = 0; i < anchorLimit - 1; i++) {
      const res = await add(memberId, 'former_surname', surname());
      expect(res.status, `real add ${i + 1}`).toBe(303);
    }
  }

  // Defect caught: a double submit or a re-add of an anchor already on file
  // uses up the member's anchor allowance, so a member who resubmits is later
  // refused a genuine new anchor.
  it('spends no rate-limit slot re-adding an anchor already on file', async () => {
    const m = registrant({ real_name: `Mo ${surname()}` });
    const first = surname();
    expect((await add(m, 'former_surname', first)).status).toBe(303);
    await spendAllButOne(m);
    // The bucket now holds the limit: one more real add would be refused.
    for (const repeat of [first, ` ${first} `]) {
      expect((await add(m, 'former_surname', repeat)).status).toBe(303);
    }
    expect(count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m)).toBe(anchorLimit);
    expect(heldAudit(m, 'legacy.anchor_declared')).toHaveLength(anchorLimit);
    // A further genuine add is refused because the real adds filled the
    // bucket, not because the repeats did.
    const over = await add(m, 'former_surname', surname());
    expect(over.status).toBe(429);
  });

  // Defect caught: a blank, unknown-kind or refused submit uses up the
  // member's anchor allowance before it is refused.
  it('spends no rate-limit slot on a blank, unknown or over-long submit', async () => {
    const m = registrant({ real_name: `Ned ${surname()}` });
    await spendAllButOne(m);
    const refused = [
      await add(m, 'former_surname', '   '),
      await add(m, 'nickname', 'Whatever'),
      await add(m, 'former_surname', 'X'.repeat(36)),
    ];
    expect(refused.map((r) => r.status)).toEqual([422, 422, 422]);
    const last = await add(m, 'former_surname', surname());
    expect(last.status).toBe(303);
    expect(count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m)).toBe(anchorLimit);
  });

  // Defect caught: a former surname of any length is stored and matched, so
  // a member can save a 5000-character value, or a genuine surname at the
  // family-name limit is refused. The cap is the family-name cap (35
  // characters, the UK Government Data Standards person-name length the
  // registration form already holds a family name to).
  it('refuses a former surname longer than a family name may be, and stores nothing', async () => {
    const m = registrant({ real_name: `Ola ${surname()}` });
    for (const value of ['Y'.repeat(36), 'Y'.repeat(5000)]) {
      const res = await add(m, 'former_surname', value);
      expect(res.status, `${value.length} characters`).toBe(422);
      expect(res.text).toContain('Family name must be 35 characters or fewer.');
    }
    expect(count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m)).toBe(0);
    expect(auditRows(m, 'legacy.anchor_declared')).toHaveLength(0);

    const atLimit = await add(m, 'former_surname', 'Y'.repeat(35));
    expect(atLimit.status).toBe(303);
    expect(count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m)).toBe(1);
  });

  // Defect caught: an old email that is not an address at all is stored and
  // listed back to the member as a matching key that can never match.
  it('refuses an old email that is not a complete address, and stores nothing', async () => {
    const m = registrant({ real_name: `Ola ${surname()}` });
    for (const value of ['not-an-email', 'name@', 'name@example', 'two words@example.com']) {
      const res = await add(m, 'old_email', value);
      expect(res.status, value).toBe(422);
      expect(res.text).toContain('Enter a complete email address, such as name@example.com.');
    }
    expect(count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m)).toBe(0);
    expect(auditRows(m, 'legacy.anchor_declared')).toHaveLength(0);

    const valid = await add(m, 'old_email', 'Old.Name@Example.com');
    expect(valid.status).toBe(303);
    expect(count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?', m)).toBe(1);
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
    expect(heldAudit(m, 'wizard.legacy_claim.never_had_account')).toHaveLength(1);
    await finishOnboarding(m);
    const [answered] = auditRows(m, 'wizard.legacy_claim.never_had_account');
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
    expectClaimHeld(m, { accountId: account, recordId: null });

    // The held claim answers the last attempt, so the step closes at once.
    const closed = await page(m);
    expect(closed.status).toBe(303);
    expect(closed.headers.location).not.toBe(CLAIM_STEP);

    await finishOnboarding(m);
    expect(links(m).legacy_member_id).toBe(account);
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
    // A claim is held, not linked, while onboarding, so the refusal shows as
    // no held claim, and finishing onboarding lands nothing.
    expect(heldClaimJson(m)).toBeNull();
    await finishOnboarding(m);
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
    // Nothing is held either, which is where an accepted claim would be.
    expect(heldClaimJson(m)).toBeNull();
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
