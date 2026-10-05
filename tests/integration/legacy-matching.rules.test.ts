/**
 * The legacy matching rules, one case per rule.
 *
 * The claim step decides which old accounts and competition records a member
 * reaches, by which keys, and what they may do with each. Every rule is checked
 * against a real database seeded through the factories, through the matching
 * service's own entry points. Each case uses surnames no other case uses,
 * because the name key scans every account and record in the database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertMemberDeclaredAnchor,
  insertLegacyClaimDecline,
  insertGivenNameVariant,
  insertNameVariant,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4371');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/legacyMatchingService').legacyMatchingService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let rules: typeof import('../../src/services/legacyMatchingService').legacyMatchingRules;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let fold: typeof import('../../src/services/nameUtils');

beforeAll(async () => {
  db = createTestDb(dbPath);
  const mod = await import('../../src/services/legacyMatchingService');
  svc = mod.legacyMatchingService;
  rules = mod.legacyMatchingRules;
  fold = await import('../../src/services/nameUtils');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

// A surname no other case uses: letters only, so the fold keeps it whole.
let seq = 0;
function surname(): string {
  seq += 1;
  let n = seq;
  let s = '';
  while (n > 0) { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return `Qx${s}vor`;
}

function evidenceFor(memberId: string) {
  const ev = svc.readMemberEvidence(memberId);
  if (!ev) throw new Error(`no evidence for ${memberId}`);
  return ev;
}

function matchFor(memberId: string) {
  return svc.match(evidenceFor(memberId));
}

function candidateFor(memberId: string, target: { accountId?: string; recordId?: string }) {
  return matchFor(memberId).candidates.find((c) =>
    (target.accountId !== undefined && c.accountId === target.accountId)
    || (target.recordId !== undefined && c.recordId === target.recordId));
}

describe('R1 email key', () => {
  // Defect caught: a member arriving under an old account's secondary address,
  // or under a declared old address, is not matched to their own account; or an
  // unverified sign-in address is trusted as a key.
  it('matches the verified login email and each declared old email against all three slots', () => {
    const sn = surname();
    const login = `r1-login-${sn}@example.com`.toLowerCase();
    const old = `r1-old-${sn}@example.com`.toLowerCase();
    const a2 = insertLegacyMember(db, { real_name: `Ann ${sn}`, legacy_email2: login });
    const a3 = insertLegacyMember(db, { real_name: `Ann ${sn}`, legacy_email3: old });
    const m = insertMember(db, { real_name: `Ann ${sn}`, login_email: login });
    const anchorId = insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: old });

    const c2 = candidateFor(m, { accountId: a2 });
    expect(c2?.hits).toContainEqual({ key: 'email', side: 'account', address: { kind: 'login' }, slot: 2 });
    const c3 = candidateFor(m, { accountId: a3 });
    expect(c3?.hits).toContainEqual({ key: 'email', side: 'account', address: { kind: 'old', anchorId }, slot: 3 });

    const unverified = insertMember(db, {
      real_name: `Cid ${surname()}`, login_email: `r1-unv-${sn}@example.com`, email_verified_at: null,
    });
    insertLegacyMember(db, { real_name: `Cid ${surname()}`, legacy_email: `r1-unv-${sn}@example.com`.toLowerCase() });
    expect(matchFor(unverified).candidates.some((c) => c.hits.some((h) => h.key === 'email'))).toBe(false);
  });
});

describe('R2 ambiguous address', () => {
  // Defect caught: an address two old accounts share hands the member one of
  // them, or the ambiguity is hidden from the administrator.
  it('produces no hit and reports the address with the number of accounts', () => {
    const sn = surname();
    const shared = `r2-${sn}@example.com`.toLowerCase();
    const a = insertLegacyMember(db, { real_name: `Ben ${surname()}`, legacy_email: shared });
    const b = insertLegacyMember(db, { real_name: `Ben ${surname()}`, legacy_email2: shared });
    const m = insertMember(db, { real_name: `Ben ${sn}`, login_email: shared });
    const result = matchFor(m);
    expect(result.candidates.find((c) => c.accountId === a || c.accountId === b)).toBeUndefined();
    expect(result.ambiguousAddresses).toEqual([{ address: { kind: 'login' }, accountCount: 2 }]);
  });
});

describe('R3 name key', () => {
  // Defect caught: a middle name blocks a match, a maiden name kept as a middle
  // name is not found, a nickname or curated variant is missed, or a different
  // first name with the same surname is taken for the member.
  it('agrees on the first name and a shared surname word group, exact or variant', () => {
    const s1 = surname();
    const s2 = surname();
    const s3 = surname();
    const m = insertMember(db, { real_name: `Brenda ${s1}` });
    const exact = insertHistoricalPerson(db, { person_name: `Brenda Marie ${s1}` });
    const otherFirst = insertHistoricalPerson(db, { person_name: `Alice ${s1}` });
    expect(candidateFor(m, { recordId: exact })?.hits)
      .toContainEqual({ key: 'name', side: 'record', basis: { kind: 'current' }, match: 'exact' });
    expect(candidateFor(m, { recordId: otherFirst })).toBeUndefined();

    const lisa = insertMember(db, { real_name: `Lisa ${s2} Jones${s2}` });
    const middle = insertHistoricalPerson(db, { person_name: `Lisa ${s2}` });
    expect(candidateFor(lisa, { recordId: middle })?.hits)
      .toContainEqual({ key: 'name', side: 'record', basis: { kind: 'middle' }, match: 'variant', via: 'middle_name' });

    insertGivenNameVariant(db, { short_form_normalized: 'bobbo', long_form_normalized: 'robbertus' });
    const bob = insertMember(db, { real_name: `Bobbo ${s3}` });
    const robert = insertLegacyMember(db, { real_name: `Robbertus ${s3}` });
    expect(candidateFor(bob, { accountId: robert })?.hits)
      .toContainEqual({ key: 'name', side: 'account', basis: { kind: 'current' }, match: 'variant', via: 'nickname' });

    const s4 = surname();
    const s5 = surname();
    insertNameVariant(db, {
      canonical_normalized: `kim ${s4}`.toLowerCase(), variant_normalized: `kimberly ${s5}`.toLowerCase(),
    });
    const kim = insertMember(db, { real_name: `Kim ${s4}` });
    const variantRecord = insertHistoricalPerson(db, { person_name: `Kimberly ${s5}` });
    const hit = candidateFor(kim, { recordId: variantRecord })?.hits.find((h) => h.key === 'name');
    expect(hit).toMatchObject({ key: 'name', match: 'variant', via: 'name_variant' });
  });

  // Defect caught: a declared former surname does not reach a record under it.
  it('adds each declared former surname to the member side', () => {
    const now = surname();
    const before = surname();
    const m = insertMember(db, { real_name: `Jane ${now}` });
    const anchorId = insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'former_surname', anchor_value: before });
    const rec = insertHistoricalPerson(db, { person_name: `Jane ${before}` });
    expect(candidateFor(m, { recordId: rec })?.hits)
      .toContainEqual({ key: 'name', side: 'record', basis: { kind: 'former', anchorId }, match: 'exact' });
  });
});

describe('R4 surname plus date of birth', () => {
  // Defect caught: an account under a different first name is never found by
  // its exact date, or a placeholder date reaches strangers.
  it('reaches an account by surname and an exact non-placeholder date only', () => {
    const sn = surname();
    const acct = insertLegacyMember(db, { real_name: `Robert ${sn}`, birth_date: '1975-06-12' });
    const m = insertMember(db, { real_name: `Xavi ${sn}`, birth_date: '1975-06-12' });
    expect(candidateFor(m, { accountId: acct })?.hits)
      .toContainEqual({ key: 'surname_dob', side: 'account', basis: { kind: 'current' } });

    const sp = surname();
    const placeholder = insertLegacyMember(db, { real_name: `Robert ${sp}`, birth_date: '1980-01-01' });
    const p = insertMember(db, { real_name: `Xavi ${sp}`, birth_date: '1980-01-01' });
    expect(candidateFor(p, { accountId: placeholder })).toBeUndefined();
  });
});

describe('R5 units', () => {
  // Defect caught: an account and its linked record appear as two cards, or a
  // claim through one half leaves the other behind.
  it('yields one candidate for an account and its linked record, reached through either half', () => {
    const sn = surname();
    const email = `r5-${sn}@example.com`.toLowerCase();
    const acct = insertLegacyMember(db, { real_name: `Dora ${sn}`, legacy_email: email });
    const rec = insertHistoricalPerson(db, { person_name: `Dora ${sn}`, legacy_member_id: acct });
    const m = insertMember(db, { real_name: `Dora ${sn}`, login_email: email });
    const matching = matchFor(m).candidates.filter((c) => c.accountId === acct || c.recordId === rec);
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({ accountId: acct, recordId: rec, curatedPair: true });
    expect(matching[0].hits.map((h) => h.side).sort()).toEqual(['account', 'account', 'record']);
  });
});

describe('R6 surname fold', () => {
  // Defect caught: the same surname spelt with an accent, a special letter, a
  // hyphen, an apostrophe, a suffix or a quoted nickname fails to match.
  it('folds both sides the same way', () => {
    expect(fold.foldNameWords('José "Pepe" Ó\'Brien-Sørensen Jr.')).toEqual(['jose', 'obrien', 'sorensen']);
    expect(fold.foldNameWords('Łukasz Straße Æble Œuvre Đorđe Þór III')).toEqual(['lukasz', 'strasse', 'aeble', 'oeuvre', 'dorde', 'thor']);
    expect(fold.nameMatchParts('J. Robert Smith')).toEqual({ first: 'robert', later: ['smith'] });
    // A name that is an initial and a surname keeps the initial, or it would
    // have no surname for the rule to compare.
    expect(fold.nameMatchParts('J Smith')).toEqual({ first: 'j', later: ['smith'] });
  });
});

describe('R7 surname rule', () => {
  // Defect caught: the username on an old account passes the surname rule, a
  // pair fails although one half carries the member's surname, or a surname of
  // several words passes on one of its words alone.
  it('uses real names, passes a pair on either half, and needs whole word groups', () => {
    const sn = surname();
    const m = insertMember(db, { real_name: `Eve ${sn}` });
    const ev = evidenceFor(m);
    expect(svc.surnamePasses(ev, `Eve ${sn}`)).toEqual({ passes: true, basis: { kind: 'current' } });
    expect(svc.surnamePasses(ev, `Eve Other${sn}`).passes).toBe(false);

    const email = `r7-${sn}@example.com`.toLowerCase();
    const acct = insertLegacyMember(db, { real_name: `Eve Username${sn}`, display_name: `Eve ${sn}`, legacy_email: email });
    const memberWithEmail = insertMember(db, { real_name: `Eve ${sn}`, login_email: email });
    // The account half alone fails on its real name even though its display name carries the surname.
    expect(candidateFor(memberWithEmail, { accountId: acct })?.surname.passes).toBe(false);
    const rec = insertHistoricalPerson(db, { person_name: `Eve ${sn}`, legacy_member_id: acct });
    expect(candidateFor(memberWithEmail, { accountId: acct })?.surname)
      .toMatchObject({ passes: true, side: 'record' });

    const multi = surname();
    const f = insertMember(db, { real_name: `Fay ${surname()}` });
    insertMemberDeclaredAnchor(db, { member_id: f, anchor_type: 'former_surname', anchor_value: `van ${multi}` });
    const fev = evidenceFor(f);
    expect(svc.surnamePasses(fev, `Fay van ${multi}`).passes).toBe(true);
    expect(svc.surnamePasses(fev, `Fay ${multi}`).passes).toBe(false);
    void rec;
  });

  // Defect caught: a surname particle shared by unrelated families makes one
  // person's record claimable by another on name alone.
  it('never passes on a surname particle alone', () => {
    const own = surname();
    const other = surname();
    const m = insertMember(db, { real_name: `Maria de ${own}` });
    const ev = evidenceFor(m);
    expect(svc.surnamePasses(ev, `Maria de ${other}`).passes).toBe(false);
    expect(svc.surnamePasses(ev, `Maria de ${own}`).passes).toBe(true);
    const rec = insertHistoricalPerson(db, { person_name: `Maria de ${other}` });
    expect(candidateFor(m, { recordId: rec })).toBeUndefined();
  });
});

describe('R8 name agreement', () => {
  // Defect caught: the evidence block overstates or understates how well the
  // name agreed.
  it('reports exact, variant, surname only or none', () => {
    expect(rules.nameAgreement([{ key: 'name', side: 'record', basis: null, match: 'exact' }], true)).toBe('exact');
    expect(rules.nameAgreement([{ key: 'name', side: 'record', basis: null, match: 'variant' }], true)).toBe('variant');
    expect(rules.nameAgreement([], true)).toBe('surname_only');
    expect(rules.nameAgreement([], false)).toBe('none');
  });
});

describe('R9 date of birth', () => {
  // Defect caught: a placeholder date corroborates a stranger's account, or an
  // absent date is recorded as a mismatch.
  it('treats placeholder dates as no evidence and records absences as such', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    expect(rules.isPlaceholderBirthDate('1929-12-31', now)).toBe(true);
    expect(rules.isPlaceholderBirthDate('1990-01-01', now)).toBe(true);
    expect(rules.isPlaceholderBirthDate('2021-06-15', now)).toBe(true);
    expect(rules.isPlaceholderBirthDate('2021-06-14', now)).toBe(false);
    expect(rules.isPlaceholderBirthDate('1975-06-12', now)).toBe(false);
    const acct = (birth: string | null) => ({ birth_date: birth }) as never;
    expect(rules.dobComparison('1975-06-12', acct('1975-06-12'))).toBe('identical');
    expect(rules.dobComparison('1975-06-12', acct('1975-06-13'))).toBe('mismatch');
    expect(rules.dobComparison('1975-06-12', acct('1990-01-01'))).toBe('placeholder');
    expect(rules.dobComparison('1975-06-12', acct(null))).toBe('legacy_dob_absent');
    expect(rules.dobComparison('1975-06-12', null)).toBe('no_legacy_account');
  });
});

describe('R10 country', () => {
  // Defect caught: a member who moved country is shown a weaker match.
  it('is recorded only and never lowers confidence', () => {
    const sn = surname();
    const rec = insertHistoricalPerson(db, { person_name: `Gil ${sn}`, country: 'Canada' });
    const m = insertMember(db, { real_name: `Gil ${sn}`, country: 'France' });
    const c = candidateFor(m, { recordId: rec });
    expect(c?.country).toBe('mismatch');
    expect(c?.confidence).toBe('medium');
    expect(rules.countrySignal(' united  states', 'United States')).toBe('agree');
    expect(rules.countrySignal(null, 'Canada')).toBe('unknown');
  });
});

describe('R11 signals', () => {
  // Defect caught: a pipeline-linked pair reached by two different kinds of
  // evidence is not credited with the agreement.
  it('credits email, name, date and a pair reached by different key kinds', () => {
    const sn = surname();
    const email = `r11-${sn}@example.com`.toLowerCase();
    const acct = insertLegacyMember(db, { real_name: `Hal ${surname()}`, legacy_email: email, birth_date: '1970-03-04' });
    insertHistoricalPerson(db, { person_name: `Hal ${sn}`, legacy_member_id: acct });
    const m = insertMember(db, { real_name: `Hal ${sn}`, login_email: email, birth_date: '1970-03-04' });
    expect(candidateFor(m, { accountId: acct })?.signals.sort()).toEqual(['dob', 'email', 'name', 'pair']);
  });
});

describe('R12 corroboration', () => {
  // Defect caught: an old account becomes claimable on a name alone.
  it('requires an email or an identical date on the account half', () => {
    const unit = (accountId: string | null) => ({ accountId }) as never;
    expect(rules.corroborated(unit('a'), ['name'])).toBe(false);
    expect(rules.corroborated(unit('a'), ['email'])).toBe(true);
    expect(rules.corroborated(unit('a'), ['dob'])).toBe(true);
    expect(rules.corroborated(unit(null), ['email'])).toBe(false);
  });
});

describe('R13 confidence', () => {
  // Defect caught: a weak variant-only match is labelled as strong as an
  // agreeing email and date.
  it('is high on two signals, medium on one strong one, low on a variant alone', () => {
    expect(rules.confidence(['email', 'dob'], 'none')).toBe('high');
    expect(rules.confidence(['email'], 'none')).toBe('medium');
    expect(rules.confidence(['dob'], 'surname_only')).toBe('medium');
    expect(rules.confidence(['name'], 'exact')).toBe('medium');
    expect(rules.confidence(['name'], 'variant')).toBe('low');
  });
});

describe('R14 order', () => {
  // Defect caught: a weaker or unclaimable card is shown above the claimable,
  // stronger one, or the order shifts between renders.
  it('orders by status, confidence, identical date, signal count, then ids', () => {
    const base = { hits: [], tiedWith: 0, refusal: null, heldBy: null } as const;
    const mk = (id: string, status: string, confidence: string, dob = 'no_legacy_account', signals: string[] = ['name']) =>
      ({ ...base, accountId: id, recordId: null, status, confidence, dob, signals }) as never;
    const list = [
      mk('e', 'needs_admin', 'high'),
      mk('d', 'claimable', 'low'),
      mk('c', 'claimable', 'high', 'mismatch'),
      mk('b', 'claimable', 'high', 'identical'),
      mk('a', 'needs_former_surname', 'high'),
      mk('f', 'claimable', 'high', 'mismatch', ['name', 'email']),
    ];
    // ordering-is-the-contract: the order is what this rule decides.
    expect([...list].sort(rules.compareCandidates).map((c: { accountId: string }) => c.accountId))
      .toEqual(['b', 'f', 'c', 'd', 'a', 'e']);
  });
});

describe('R15 to R23 status', () => {
  // Defect caught: a candidate that must never be offered (held, deceased,
  // declined, already the member's, a second account or record, a nameless
  // stub) is offered; or an uncorroborated account or a surname that differs is
  // offered a claim control.
  it('applies the first matching row', () => {
    const sn = surname();
    const email = `r15-${sn}@example.com`.toLowerCase();
    const m = insertMember(db, { real_name: `Ivy ${sn}`, login_email: email, birth_date: '1966-07-08' });

    const mine = insertHistoricalPerson(db, { person_name: `Ivy ${sn}` });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(mine, m);
    expect(candidateFor(m, { recordId: mine })).toMatchObject({ status: 'hidden', refusal: 'already_mine' });

    const deceased = insertHistoricalPerson(db, { person_name: `Ivy ${sn}`, is_deceased: 1 });
    expect(candidateFor(m, { recordId: deceased })).toMatchObject({ status: 'hidden', refusal: 'deceased' });

    const other = insertMember(db, { real_name: `Zed ${surname()}` });
    const held = insertLegacyMember(db, {
      real_name: `Ivy ${sn}`, legacy_email2: email, claimed_by_member_id: other, claimed_at: '2026-01-01T00:00:00.000Z',
    });
    expect(candidateFor(m, { accountId: held })).toMatchObject({ status: 'hidden', refusal: 'held_by_other', heldBy: other });

    const stubEmail = `r18-${sn}@example.com`.toLowerCase();
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: stubEmail });
    const stub = insertLegacyMember(db, { real_name: null, display_name: `ivy${sn}`, legacy_email3: stubEmail });
    expect(candidateFor(m, { accountId: stub })).toMatchObject({ status: 'hidden', refusal: 'no_account_name' });

    const declined = insertHistoricalPerson(db, { person_name: `Ivy ${sn}` });
    insertLegacyClaimDecline(db, { member_id: m, historical_person_id: declined });
    // Already holding a record, so a second record is incompatible; the decline row wins first.
    expect(candidateFor(m, { recordId: declined })).toMatchObject({ status: 'hidden', refusal: 'declined' });

    const second = insertHistoricalPerson(db, { person_name: `Ivy ${sn}` });
    expect(candidateFor(m, { recordId: second })).toMatchObject({ status: 'hidden', refusal: 'incompatible_with_held' });

    const fresh = insertMember(db, { real_name: `Jon ${surname()}`, birth_date: '1960-02-03' });
    const sj = surname();
    db.prepare('UPDATE members SET real_name = ? WHERE id = ?').run(`Jon ${sj}`, fresh);
    const nameOnly = insertLegacyMember(db, { real_name: `Jon ${sj}` });
    expect(candidateFor(fresh, { accountId: nameOnly })).toMatchObject({ status: 'needs_admin', refusal: 'uncorroborated' });

    const married = surname();
    const freshEmail = `r22-${married}@example.com`.toLowerCase();
    const k = insertMember(db, { real_name: `Kay ${married}`, login_email: freshEmail });
    const maiden = surname();
    const differing = insertLegacyMember(db, { real_name: `Kay ${maiden}`, legacy_email: freshEmail });
    expect(candidateFor(k, { accountId: differing })).toMatchObject({
      status: 'needs_former_surname', refusal: 'surname_mismatch',
      surname: { passes: false, differingSurname: maiden },
    });

    const recOnly = insertHistoricalPerson(db, { person_name: `Kay ${married}` });
    expect(candidateFor(k, { recordId: recOnly })).toMatchObject({ status: 'claimable', refusal: null });
  });

  // Defect caught: declaring a surname makes an account claimable that nothing
  // but a name reached.
  it('checks corroboration before the surname rule', () => {
    const sn = surname();
    const m = insertMember(db, { real_name: `Lou ${sn}` });
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'former_surname', anchor_value: `Old${sn}` });
    const acct = insertLegacyMember(db, { real_name: `Lou Old${sn}` });
    expect(candidateFor(m, { accountId: acct })).toMatchObject({ status: 'needs_admin', refusal: 'uncorroborated' });
  });
});

describe('R24 evidence tier', () => {
  // Defect caught: a claim found through a declared old address is recorded as
  // proven control of the account's mailbox.
  it('is the modern-email tier only when the verified login email reached the account', () => {
    const sn = surname();
    const login = `r24-login-${sn}@example.com`.toLowerCase();
    const old = `r24-old-${sn}@example.com`.toLowerCase();
    const viaLogin = insertLegacyMember(db, { real_name: `May ${sn}`, legacy_email: login });
    const viaOld = insertLegacyMember(db, { real_name: `May ${sn}`, legacy_email: old });
    const m = insertMember(db, { real_name: `May ${sn}`, login_email: login });
    insertMemberDeclaredAnchor(db, { member_id: m, anchor_type: 'old_email', anchor_value: old });
    expect(svc.evidenceTier(candidateFor(m, { accountId: viaLogin })!)).toBe('currently_controls_modern_email_matching_legacy');
    expect(svc.evidenceTier(candidateFor(m, { accountId: viaOld })!)).toBe('declared_anchor_only');
  });
});

describe('R26 audit evidence', () => {
  // Defect caught: a name, a date of birth or a raw address is written to the
  // immutable ledger, or the block omits which address reached the account.
  it('carries keys, signals and keyed address hashes, never names, dates or addresses', () => {
    const sn = surname();
    const email = `r26-${sn}@example.com`.toLowerCase();
    const acct = insertLegacyMember(db, { real_name: `Ned ${sn}`, legacy_email: email, birth_date: '1971-09-10' });
    const m = insertMember(db, { real_name: `Ned ${sn}`, login_email: email, birth_date: '1971-09-10' });
    const ev = evidenceFor(m);
    const result = svc.match(ev);
    const c = result.candidates.find((x) => x.accountId === acct)!;
    const block = svc.auditEvidence(c, ev, svc.shownCandidates(result));
    const json = JSON.stringify(block);
    expect(json).not.toContain(sn.toLowerCase());
    expect(json.toLowerCase()).not.toContain(sn.toLowerCase());
    expect(json).not.toContain('1971-09-10');
    expect(json).not.toContain(email);
    expect(block).toMatchObject({
      account_id: acct, corroborated: true, dob_comparison: 'identical', confidence: 'high',
      proposed_tier: 'currently_controls_modern_email_matching_legacy',
    });
    const emailHit = (block.hits as Array<Record<string, unknown>>).find((h) => h.key === 'email');
    expect((emailHit?.address as { address_hash: string }).address_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(block.shown).toContainEqual({ account_id: acct, record_id: null, status: 'claimable' });
  });
});
