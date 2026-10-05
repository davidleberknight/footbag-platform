/**
 * LegacyMatchingService -- the one place that decides which old footbag.org
 * accounts and competition records a member's own evidence reaches, and what
 * the claim step may do with each.
 *
 * Owns:
 *   - The matching keys: the member's verified login email and declared old
 *     emails against all three address slots of every old account; the name
 *     (first given name plus possible surnames, with curated nickname pairs and
 *     whole-name variant rows) against accounts and records alike; and the
 *     member's surname plus exact date of birth against old accounts. Old
 *     member ids, usernames and record aliases are not keys.
 *   - Units: an account and the record the pipeline linked to it are one
 *     candidate, reached through either half.
 *   - The surname rule and its basis (current surname, a middle name, or a
 *     declared former surname), the date-of-birth comparison with the legacy
 *     placeholder dates treated as no evidence, corroboration of an old
 *     account, confidence, the order cards are shown in, and each candidate's
 *     status: claimable, needing a former surname, needing an administrator,
 *     or hidden with the reason it is never offered.
 *   - The evidence tier a self-serve claim records, the re-check a claim runs
 *     inside its transaction, and the audit evidence block every claim-step
 *     write records.
 *
 * Does not own:
 *   - Any write. The claim transactions, declines, anchor additions and the
 *     wizard task state belong to IdentityAccessService and
 *     MemberOnboardingService, which call this module to decide and then write.
 *   - Rendering. The wizard and the administrator's views shape their own
 *     view-models from the candidates returned here.
 *
 * Required patterns:
 *   - Every rule is its own named function, so each is tested on its own and
 *     no other file computes a match, a confidence, corroboration or a surname
 *     result.
 *   - A name alone never makes an old account claimable: an account needs an
 *     email hit or an identical, non-placeholder date of birth.
 *   - The audit evidence block carries ids, keys, signals and outcomes only:
 *     never a name, a date of birth or a raw address. Addresses appear as
 *     login-or-anchor references plus a keyed hash.
 *   - Rendering writes nothing; the module only reads.
 *
 * Persistence: reads members, member_declared_anchors, legacy_claim_declines,
 * member_onboarding_tasks, legacy_members, historical_persons, name_variants
 * and given_name_variants. Writes nothing.
 *
 * Side effects: none.
 *
 * Service shape: singleton object.
 */
import {
  declaredAnchors,
  legacyClaim,
  legacyClaimDeclines,
  legacyMembers,
  memberOnboarding,
  nameVariants,
  type HistoricalPersonClaimRow,
  type LegacyClaimDeclineRow,
  type LegacyMemberRow,
} from '../db/db';
import { compareBirthDates, type RecordedBirthDateComparison } from '../lib/birthDate';
import { claimAddressHash } from '../lib/claimAddressHash';
import { foldNameWords, nameMatchParts, wordGroupIn, displaySurname } from './nameUtils';
import { normalizeForMatch, nicknameAlternates, wholeNameVariants } from './nameVariantsService';

// ── Types ───────────────────────────────────────────────────────────────────

export interface MemberEvidence {
  memberId: string;
  realName: string;
  firstGivenName: string;
  /** Folded later words of the member's name: family name and middle names. */
  possibleSurnames: string[];
  formerSurnames: Array<{ anchorId: string; value: string; key: string }>;
  /** Normalized, and present only when verified. */
  loginEmail: string | null;
  oldEmails: Array<{ anchorId: string; value: string }>;
  birthDate: string | null;
  dobChangesDuringOnboarding: number;
  country: string | null;
  heldAccountId: string | null;
  heldRecordId: string | null;
  declinedIds: ReadonlySet<string>;
}

export type SurnameBasis =
  | { kind: 'current' }
  | { kind: 'middle' }
  | { kind: 'former'; anchorId: string };

export type AddressRef = { kind: 'login' } | { kind: 'old'; anchorId: string };

export type KeyHit =
  | { key: 'email'; side: 'account'; address: AddressRef; slot: 1 | 2 | 3 }
  | {
      key: 'name';
      side: 'account' | 'record';
      /** Null for a whole-name variant row reached with no shared surname. */
      basis: SurnameBasis | null;
      match: 'exact' | 'variant';
      via?: 'name_variant' | 'nickname' | 'middle_name';
    }
  | { key: 'surname_dob'; side: 'account'; basis: SurnameBasis };

export type CandidateStatus = 'claimable' | 'needs_former_surname' | 'needs_admin' | 'hidden';

export type Refusal =
  | 'already_mine' | 'deceased' | 'held_by_other' | 'no_account_name'
  | 'declined' | 'incompatible_with_held'
  | 'surname_mismatch'
  | 'uncorroborated';

export type Confidence = 'high' | 'medium' | 'low';
export type Signal = 'email' | 'name' | 'dob' | 'pair';
export type CountrySignal = 'agree' | 'mismatch' | 'unknown';
export type DobOutcome = RecordedBirthDateComparison | 'placeholder';

export interface Candidate {
  accountId: string | null;
  recordId: string | null;
  curatedPair: boolean;
  hits: KeyHit[];
  surname: {
    passes: boolean;
    basis: SurnameBasis | null;
    side: 'account' | 'record' | null;
    /** The target's surname as it spells it, when the member's differs. */
    differingSurname: string | null;
  };
  corroborated: boolean;
  nameAgreement: 'exact' | 'variant' | 'surname_only' | 'none';
  dob: DobOutcome;
  country: CountrySignal;
  confidence: Confidence;
  signals: Signal[];
  tiedWith: number;
  status: CandidateStatus;
  refusal: Refusal | null;
  /** The member holding a half of this candidate; for the admin view only. */
  heldBy: string | null;
}

export interface MatchResult {
  candidates: Candidate[];
  ambiguousAddresses: Array<{ address: AddressRef; accountCount: number }>;
}

export type EvidenceTier = 'currently_controls_modern_email_matching_legacy' | 'declared_anchor_only';

// ── Member evidence ─────────────────────────────────────────────────────────

interface MemberMatchRow {
  id: string;
  real_name: string;
  login_email_normalized: string | null;
  email_verified_at: string | null;
  birth_date: string | null;
  country: string | null;
  legacy_member_id: string | null;
  historical_person_id: string | null;
}

/** Everything the matching reads about the member, or null for no live member. */
function readMemberEvidence(memberId: string): MemberEvidence | null {
  const m = legacyClaim.findMemberForMatch.get(memberId) as MemberMatchRow | undefined;
  if (!m) return null;
  const anchors = declaredAnchors.listByMember.all(memberId) as Array<{
    id: string; anchor_type: string; anchor_value: string;
  }>;
  const declines = legacyClaimDeclines.listByMember.all(memberId) as LegacyClaimDeclineRow[];
  const counters = memberOnboarding.findLegacyClaimCounters.get(memberId) as
    | { birth_date_changes: number | null } | undefined;
  const parts = nameMatchParts(m.real_name);
  const declinedIds = new Set<string>();
  for (const d of declines) {
    if (d.legacy_member_id) declinedIds.add(d.legacy_member_id);
    if (d.historical_person_id) declinedIds.add(d.historical_person_id);
  }
  return {
    memberId: m.id,
    realName: m.real_name,
    firstGivenName: parts.first,
    possibleSurnames: parts.later,
    formerSurnames: anchors
      .filter((a) => a.anchor_type === 'former_surname')
      .map((a) => ({ anchorId: a.id, value: a.anchor_value, key: foldNameWords(a.anchor_value).join(' ') }))
      .filter((f) => f.key !== ''),
    loginEmail: m.email_verified_at && m.login_email_normalized ? m.login_email_normalized : null,
    oldEmails: anchors
      .filter((a) => a.anchor_type === 'old_email')
      .map((a) => ({ anchorId: a.id, value: a.anchor_value.trim().toLowerCase() })),
    birthDate: m.birth_date,
    dobChangesDuringOnboarding: counters?.birth_date_changes ?? 0,
    country: m.country,
    heldAccountId: m.legacy_member_id,
    heldRecordId: m.historical_person_id,
    declinedIds,
  };
}

// ── R6, R7: surname ─────────────────────────────────────────────────────────

/**
 * R7. Passes when one of the member's possible surnames, or a declared former
 * surname, equals a whole word group among the target's possible surnames,
 * both sides folded the same way. The basis prefers the member's current
 * surname, then a middle name, then the first passing former surname.
 */
// Surname particles never count as a surname on their own: "de" or "van" is
// shared by unrelated families, so "Maria de Souza" must not reach "Maria de
// Silva" through it. A particle still matches as part of a whole multi-word
// former surname ("van der Berg").
const SURNAME_PARTICLES: ReadonlySet<string> = new Set([
  'de', 'da', 'das', 'do', 'dos', 'du', 'del', 'della', 'der', 'den', 'di', 'la', 'le',
  'van', 'von', 'ter', 'ten', 'st', 'y', 'e', 'al', 'el', 'bin', 'ben', 'mac',
]);

function isSurnameWord(word: string): boolean {
  return !SURNAME_PARTICLES.has(word);
}

function surnamePasses(
  evidence: MemberEvidence,
  targetName: string | null | undefined,
): { passes: boolean; basis: SurnameBasis | null } {
  const target = nameMatchParts(targetName).later;
  if (target.length === 0) return { passes: false, basis: null };
  const lastWord = evidence.possibleSurnames[evidence.possibleSurnames.length - 1];
  if (lastWord && isSurnameWord(lastWord) && target.includes(lastWord)) {
    return { passes: true, basis: { kind: 'current' } };
  }
  const middles = evidence.possibleSurnames.slice(0, -1).filter(isSurnameWord);
  if (middles.some((w) => target.includes(w))) return { passes: true, basis: { kind: 'middle' } };
  for (const former of evidence.formerSurnames) {
    const group = former.key.split(' ');
    if ((group.length > 1 || isSurnameWord(group[0])) && wordGroupIn(group, target)) {
      return { passes: true, basis: { kind: 'former', anchorId: former.anchorId } };
    }
  }
  return { passes: false, basis: null };
}

// ── R1, R2: email key ───────────────────────────────────────────────────────

interface EmailKeyResult {
  hits: Array<{ accountId: string; hit: Extract<KeyHit, { key: 'email' }> }>;
  ambiguous: Array<{ address: AddressRef; accountCount: number }>;
}

/**
 * R1 and R2. Each of the member's addresses against all three slots of every
 * account. An address reaching two or more accounts is no key at all: it is
 * reported for the administrator and produces no hit, because none of those
 * accounts may be assumed the member's.
 */
function emailKey(evidence: MemberEvidence): EmailKeyResult {
  const addresses: Array<{ value: string; ref: AddressRef }> = [];
  if (evidence.loginEmail) addresses.push({ value: evidence.loginEmail, ref: { kind: 'login' } });
  for (const old of evidence.oldEmails) {
    if (old.value) addresses.push({ value: old.value, ref: { kind: 'old', anchorId: old.anchorId } });
  }
  const out: EmailKeyResult = { hits: [], ambiguous: [] };
  for (const a of addresses) {
    const rows = legacyMembers.listByEmail.all(a.value, a.value, a.value) as Array<{
      legacy_member_id: string; slot: number;
    }>;
    const accounts = new Set(rows.map((r) => r.legacy_member_id));
    if (accounts.size > 1) {
      out.ambiguous.push({ address: a.ref, accountCount: accounts.size });
      continue;
    }
    for (const r of rows) {
      out.hits.push({
        accountId: r.legacy_member_id,
        hit: { key: 'email', side: 'account', address: a.ref, slot: r.slot as 1 | 2 | 3 },
      });
    }
  }
  return out;
}

// ── R3: name key ────────────────────────────────────────────────────────────

interface NameTarget {
  side: 'account' | 'record';
  id: string;
  name: string;
}

/**
 * R3 for one target. First names must agree, exactly or through a nickname
 * pair, and the possible surnames must share a word group. Exact when the first
 * names are equal and the names end alike; a variant when reached through a
 * nickname pair or on a middle word only. A whole-name variant row is checked
 * by the caller.
 */
function nameKeyFor(
  evidence: MemberEvidence,
  memberFirstNames: ReadonlyMap<string, 'exact' | 'nickname'>,
  target: NameTarget,
): Extract<KeyHit, { key: 'name' }> | null {
  const t = nameMatchParts(target.name);
  if (!t.first || t.later.length === 0) return null;
  const firstAgreement = memberFirstNames.get(t.first);
  if (!firstAgreement) return null;
  const surname = surnamePasses(evidence, target.name);
  if (!surname.passes || !surname.basis) return null;
  // Exact means the two names end alike: the same last word, or a declared
  // former surname standing as the target's whole ending. A surname met only
  // among the middle words ("Lisa McDaniel" against "Lisa McDaniel Jones") is
  // a variant.
  const memberLast = evidence.possibleSurnames[evidence.possibleSurnames.length - 1];
  const targetLast = t.later[t.later.length - 1];
  const endsAlike = memberLast === targetLast
    || evidence.formerSurnames.some((f) => {
      const group = f.key.split(' ');
      return group.length <= t.later.length && group.every((w, i) => t.later[t.later.length - group.length + i] === w);
    });
  if (firstAgreement === 'exact' && endsAlike) {
    return { key: 'name', side: target.side, basis: surname.basis, match: 'exact' };
  }
  return {
    key: 'name',
    side: target.side,
    basis: surname.basis,
    match: 'variant',
    via: firstAgreement === 'nickname' ? 'nickname' : 'middle_name',
  };
}

/** R3 over every account and record the member's name can reach. */
function nameKey(evidence: MemberEvidence): Array<{ target: NameTarget; hit: Extract<KeyHit, { key: 'name' }> }> {
  if (!evidence.firstGivenName) return [];
  const firstNames = new Map<string, 'exact' | 'nickname'>([[evidence.firstGivenName, 'exact']]);
  for (const alt of nicknameAlternates(evidence.firstGivenName)) {
    if (!firstNames.has(alt)) firstNames.set(alt, 'nickname');
  }
  const variantNames = new Set(wholeNameVariants(normalizeForMatch(evidence.realName)));

  const targets: NameTarget[] = [
    ...(legacyMembers.listNamesForMatch.all() as Array<{ legacy_member_id: string; real_name: string }>)
      .map((r) => ({ side: 'account' as const, id: r.legacy_member_id, name: r.real_name })),
    ...(nameVariants.listHistoricalPersonNames.all() as Array<{ person_id: string; person_name: string }>)
      .map((r) => ({ side: 'record' as const, id: r.person_id, name: r.person_name })),
  ];

  const out: Array<{ target: NameTarget; hit: Extract<KeyHit, { key: 'name' }> }> = [];
  for (const target of targets) {
    const hit = nameKeyFor(evidence, firstNames, target);
    if (hit) {
      out.push({ target, hit });
    } else if (variantNames.size > 0 && variantNames.has(normalizeForMatch(target.name))) {
      out.push({
        target,
        hit: {
          key: 'name', side: target.side,
          basis: surnamePasses(evidence, target.name).basis,
          match: 'variant', via: 'name_variant',
        },
      });
    }
  }
  return out;
}

// ── R4: surname plus date of birth ──────────────────────────────────────────

/**
 * R4. The member's surname or a former surname with their exact date of birth,
 * against old accounts whose real name passes the surname rule and whose date
 * is identical and not a placeholder.
 */
function surnameDobKey(evidence: MemberEvidence): Array<{ accountId: string; hit: Extract<KeyHit, { key: 'surname_dob' }> }> {
  if (!evidence.birthDate || isPlaceholderBirthDate(evidence.birthDate)) return [];
  const rows = legacyMembers.listByBirthDate.all(evidence.birthDate) as Array<{
    legacy_member_id: string; real_name: string | null; birth_date: string;
  }>;
  const out: Array<{ accountId: string; hit: Extract<KeyHit, { key: 'surname_dob' }> }> = [];
  for (const r of rows) {
    const surname = surnamePasses(evidence, r.real_name);
    if (surname.passes && surname.basis) {
      out.push({ accountId: r.legacy_member_id, hit: { key: 'surname_dob', side: 'account', basis: surname.basis } });
    }
  }
  return out;
}

// ── R9: date of birth ───────────────────────────────────────────────────────

/**
 * R9. A date the legacy data uses as a placeholder: before 1930, within the
 * last five years, or the first of January of any year. It corroborates
 * nothing on either side.
 */
function isPlaceholderBirthDate(iso: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return true;
  if (Number(iso.slice(0, 4)) < 1930) return true;
  if (iso.slice(5) === '01-01') return true;
  const fiveYearsAgo = new Date(Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate()));
  return iso >= fiveYearsAgo.toISOString().slice(0, 10);
}

/** R9. The member's date against the account half's date. */
function dobComparison(memberDob: string | null, account: LegacyMemberRow | null): DobOutcome {
  if (!account) return 'no_legacy_account';
  if (!account.birth_date) return memberDob ? 'legacy_dob_absent' : 'both_dob_absent';
  if (!memberDob) return 'member_dob_absent';
  if (isPlaceholderBirthDate(account.birth_date)) return 'placeholder';
  return compareBirthDates(memberDob, account.birth_date);
}

// ── R10: country ────────────────────────────────────────────────────────────

/**
 * R10. Recorded only. People move, so a member's current country legitimately
 * differs from the country on their old account or record; a mismatch never
 * blocks or weakens a match. Country names are canonical English, so a plain
 * case and whitespace fold compares them.
 */
export function countrySignal(a: string | null, b: string | null): CountrySignal {
  if (!a || !b) return 'unknown';
  const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return fold(a) === fold(b) ? 'agree' : 'mismatch';
}

// ── R5: units ───────────────────────────────────────────────────────────────

interface Unit {
  accountId: string | null;
  recordId: string | null;
  account: LegacyMemberRow | null;
  record: HistoricalPersonClaimRow | null;
  hits: KeyHit[];
}

/**
 * R5. A hit on either half of an account and the record the pipeline linked to
 * it yields the pair; a hit on an unpaired half yields that half alone. Every
 * account and record belongs to exactly one unit.
 */
function unitFor(side: 'account' | 'record', id: string): Omit<Unit, 'hits'> | null {
  if (side === 'account') {
    const account = legacyMembers.findByLegacyMemberId.get(id) as LegacyMemberRow | undefined;
    if (!account) return null;
    const record = legacyClaim.findHistoricalPersonByLegacyId.get(id) as HistoricalPersonClaimRow | undefined;
    return { accountId: id, recordId: record?.person_id ?? null, account, record: record ?? null };
  }
  const record = legacyClaim.findHistoricalPersonById.get(id) as HistoricalPersonClaimRow | undefined;
  if (!record) return null;
  const account = record.legacy_member_id
    ? (legacyMembers.findByLegacyMemberId.get(record.legacy_member_id) as LegacyMemberRow | undefined) ?? null
    : null;
  return { accountId: account?.legacy_member_id ?? null, recordId: id, account, record };
}

// ── R8, R11, R12, R13: signals and confidence ───────────────────────────────

/** R8. The best name agreement over both halves. */
function nameAgreement(hits: readonly KeyHit[], surnameOk: boolean): Candidate['nameAgreement'] {
  const names = hits.filter((h): h is Extract<KeyHit, { key: 'name' }> => h.key === 'name');
  if (names.some((h) => h.match === 'exact')) return 'exact';
  if (names.length > 0) return 'variant';
  return surnameOk ? 'surname_only' : 'none';
}

/**
 * R11. Email: any email hit. Name: an exact or variant name hit. Date of birth:
 * an identical, non-placeholder date. Pair: an account and record the pipeline
 * linked whose two halves were reached by different kinds of key.
 */
function signals(unit: Unit, dob: DobOutcome): Signal[] {
  const out: Signal[] = [];
  if (unit.hits.some((h) => h.key === 'email')) out.push('email');
  if (unit.hits.some((h) => h.key === 'name')) out.push('name');
  if (dob === 'identical') out.push('dob');
  if (unit.accountId && unit.recordId) {
    const accountKinds = new Set(unit.hits.filter((h) => h.side === 'account').map((h) => h.key));
    const recordKinds = new Set(unit.hits.filter((h) => h.side === 'record').map((h) => h.key));
    const differ = accountKinds.size > 0 && recordKinds.size > 0
      && ([...accountKinds].some((k) => !recordKinds.has(k)) || [...recordKinds].some((k) => !accountKinds.has(k)));
    if (differ) out.push('pair');
  }
  return out;
}

/** R12. An old account is corroborated by an email hit or an identical date. */
function corroborated(unit: Unit, sig: readonly Signal[]): boolean {
  return unit.accountId !== null && (sig.includes('email') || sig.includes('dob'));
}

/**
 * R13. Two or more signals is high. One signal is medium when it is an email,
 * a date of birth or an exact name, and low when it is a name variant. A
 * disagreeing date or country never lowers it.
 */
function confidence(sig: readonly Signal[], agreement: Candidate['nameAgreement']): Confidence {
  if (sig.length >= 2) return 'high';
  if (sig.length === 1 && sig[0] === 'name' && agreement !== 'exact') return 'low';
  return sig.length === 1 ? 'medium' : 'low';
}

// ── R15 to R23: status ──────────────────────────────────────────────────────

/** R15 to R23. The first applicable row wins. */
function statusFor(
  evidence: MemberEvidence,
  unit: Unit,
  surnameOk: boolean,
  isCorroborated: boolean,
): { status: CandidateStatus; refusal: Refusal | null; heldBy: string | null } {
  const recordHolder = unit.recordId
    ? (legacyClaim.findMemberClaimingHp.get(unit.recordId) as { id: string } | undefined)?.id ?? null
    : null;
  const accountHolder = unit.account?.claimed_by_member_id ?? null;
  const heldBy = [accountHolder, recordHolder].find((h) => h !== null && h !== evidence.memberId) ?? null;

  if ((unit.accountId && evidence.heldAccountId === unit.accountId)
    || (unit.recordId && evidence.heldRecordId === unit.recordId)) {
    return { status: 'hidden', refusal: 'already_mine', heldBy: null };
  }
  if (unit.record?.is_deceased) return { status: 'hidden', refusal: 'deceased', heldBy };
  if (heldBy) return { status: 'hidden', refusal: 'held_by_other', heldBy };
  if (unit.accountId && !unit.recordId && !(unit.account?.real_name ?? '').trim()) {
    return { status: 'hidden', refusal: 'no_account_name', heldBy: null };
  }
  if ((unit.accountId && evidence.declinedIds.has(unit.accountId))
    || (unit.recordId && evidence.declinedIds.has(unit.recordId))) {
    return { status: 'hidden', refusal: 'declined', heldBy: null };
  }
  if ((unit.accountId && evidence.heldAccountId && evidence.heldAccountId !== unit.accountId)
    || (unit.recordId && evidence.heldRecordId && evidence.heldRecordId !== unit.recordId)) {
    return { status: 'hidden', refusal: 'incompatible_with_held', heldBy: null };
  }
  if (unit.accountId && !isCorroborated) return { status: 'needs_admin', refusal: 'uncorroborated', heldBy: null };
  if (!surnameOk) return { status: 'needs_former_surname', refusal: 'surname_mismatch', heldBy: null };
  return { status: 'claimable', refusal: null, heldBy: null };
}

// ── R14: order ──────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<CandidateStatus, number> = {
  claimable: 0, needs_former_surname: 1, needs_admin: 2, hidden: 3,
};
const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/**
 * R14. Claimable first, then those needing a former surname, then those needing
 * an administrator; within each, high, medium, low; then an identical date
 * first; then more signals; then by id, so the order is stable.
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]
    || Number(b.dob === 'identical') - Number(a.dob === 'identical')
    || b.signals.length - a.signals.length
    || candidateKey(a).localeCompare(candidateKey(b));
}

function candidateKey(c: { accountId: string | null; recordId: string | null }): string {
  return `${c.accountId ?? ''}|${c.recordId ?? ''}`;
}

// ── match ───────────────────────────────────────────────────────────────────

/** Every candidate the member's evidence reaches, hidden ones included. */
function match(evidence: MemberEvidence): MatchResult {
  const units = new Map<string, Unit>();
  const addHit = (side: 'account' | 'record', id: string, hit: KeyHit) => {
    const base = unitFor(side, id);
    if (!base) return;
    const key = candidateKey(base);
    const unit = units.get(key) ?? { ...base, hits: [] };
    unit.hits.push(hit);
    units.set(key, unit);
  };

  const email = emailKey(evidence);
  for (const h of email.hits) addHit('account', h.accountId, h.hit);
  for (const h of nameKey(evidence)) addHit(h.target.side, h.target.id, h.hit);
  for (const h of surnameDobKey(evidence)) addHit('account', h.accountId, h.hit);

  const candidates: Candidate[] = [];
  for (const unit of units.values()) {
    const accountSurname = unit.account ? surnamePasses(evidence, unit.account.real_name) : null;
    const recordSurname = unit.record ? surnamePasses(evidence, unit.record.person_name) : null;
    const passing = accountSurname?.passes ? { ...accountSurname, side: 'account' as const }
      : recordSurname?.passes ? { ...recordSurname, side: 'record' as const }
        : null;
    const surnameOk = passing !== null;
    const dob = dobComparison(evidence.birthDate, unit.account);
    const sig = signals(unit, dob);
    const isCorroborated = corroborated(unit, sig);
    const agreement = nameAgreement(unit.hits, surnameOk);
    const status = statusFor(evidence, unit, surnameOk, isCorroborated);
    candidates.push({
      accountId: unit.accountId,
      recordId: unit.recordId,
      curatedPair: unit.accountId !== null && unit.recordId !== null,
      hits: unit.hits,
      surname: {
        passes: surnameOk,
        basis: passing?.basis ?? null,
        side: passing?.side ?? null,
        differingSurname: surnameOk
          ? null
          : displaySurname(unit.account?.real_name ?? unit.record?.person_name) || null,
      },
      corroborated: isCorroborated,
      nameAgreement: agreement,
      dob,
      country: countrySignal(evidence.country, unit.account?.country ?? unit.record?.country ?? null),
      confidence: confidence(sig, agreement),
      signals: sig,
      tiedWith: 0,
      status: status.status,
      refusal: status.refusal,
      heldBy: status.heldBy,
    });
  }

  // tiedWith: other shown candidates reached by the name key on the same side.
  const shown = candidates.filter((c) => c.status !== 'hidden');
  for (const c of shown) {
    const sides = new Set(c.hits.filter((h) => h.key === 'name').map((h) => h.side));
    if (sides.size === 0) continue;
    c.tiedWith = shown.filter((o) => o !== c
      && o.hits.some((h) => h.key === 'name' && sides.has(h.side))).length;
  }

  candidates.sort(compareCandidates);
  return { candidates, ambiguousAddresses: email.ambiguous };
}

// ── R24, R25, R26 ───────────────────────────────────────────────────────────

/**
 * R25. The candidate holding the target, matched afresh from the member's
 * evidence as it stands now. The claim transaction calls this before any write
 * and proceeds only on a claimable candidate (or an already-held one, which
 * reports success and writes nothing). Null when the evidence no longer reaches
 * the target at all.
 */
function recheckInTx(
  evidence: MemberEvidence,
  target: { accountId?: string | null; recordId?: string | null },
): Candidate | null {
  return match(evidence).candidates.find((c) =>
    (target.accountId != null && c.accountId === target.accountId)
    || (target.recordId != null && c.recordId === target.recordId)) ?? null;
}

/**
 * R24. The verified login email reaching the claimed account proves current
 * control of an address the old account carried; everything else a member
 * claims rests on the floor tier.
 */
function evidenceTier(candidate: Candidate): EvidenceTier {
  return candidate.hits.some((h) => h.key === 'email' && h.address.kind === 'login')
    ? 'currently_controls_modern_email_matching_legacy'
    : 'declared_anchor_only';
}

function addressFor(evidence: MemberEvidence, ref: AddressRef): string | null {
  if (ref.kind === 'login') return evidence.loginEmail;
  return evidence.oldEmails.find((o) => o.anchorId === ref.anchorId)?.value ?? null;
}

function addressRefEvidence(evidence: MemberEvidence, ref: AddressRef): Record<string, unknown> {
  const value = addressFor(evidence, ref);
  return {
    kind: ref.kind,
    ...(ref.kind === 'old' ? { anchor_id: ref.anchorId } : {}),
    address_hash: value ? claimAddressHash(value) : null,
  };
}

function basisEvidence(basis: SurnameBasis | null): Record<string, unknown> | null {
  if (!basis) return null;
  return basis.kind === 'former' ? { kind: 'former', anchor_id: basis.anchorId } : { kind: basis.kind };
}

/**
 * R26. The evidence block every claim-step write records: ids, keys, signals and
 * outcomes, and the other candidates shown alongside. Never a name, a date of
 * birth or a raw address.
 */
function auditEvidence(
  candidate: Candidate,
  evidence: MemberEvidence,
  shown: ReadonlyArray<Pick<Candidate, 'accountId' | 'recordId' | 'status'>>,
  tiers?: { proposed?: string | null; written?: string | null },
): Record<string, unknown> {
  return {
    account_id: candidate.accountId,
    record_id: candidate.recordId,
    curated_pair: candidate.curatedPair,
    hits: candidate.hits.map((h) => h.key === 'email'
      ? { key: 'email', side: h.side, slot: h.slot, address: addressRefEvidence(evidence, h.address) }
      : h.key === 'name'
        ? { key: 'name', side: h.side, match: h.match, via: h.via ?? null, surname_basis: basisEvidence(h.basis) }
        : { key: 'surname_dob', side: h.side, surname_basis: basisEvidence(h.basis) }),
    surname: {
      passes: candidate.surname.passes,
      basis: basisEvidence(candidate.surname.basis),
      side: candidate.surname.side,
    },
    corroborated: candidate.corroborated,
    name_agreement: candidate.nameAgreement,
    dob_comparison: candidate.dob,
    country_signal: candidate.country,
    confidence: candidate.confidence,
    signals: candidate.signals,
    tied_with: candidate.tiedWith,
    dob_changes_during_onboarding: evidence.dobChangesDuringOnboarding,
    proposed_tier: tiers?.proposed ?? evidenceTier(candidate),
    written_tier: tiers?.written ?? null,
    shown: shown.map((s) => ({ account_id: s.accountId, record_id: s.recordId, status: s.status })),
  };
}

/** The candidates the claim step shows: every one not hidden, in order. */
function shownCandidates(result: MatchResult): Candidate[] {
  return result.candidates.filter((c) => c.status !== 'hidden');
}

export const legacyMatchingService = {
  readMemberEvidence,
  match,
  shownCandidates,
  recheckInTx,
  evidenceTier,
  auditEvidence,
  surnamePasses,
  isPlaceholderBirthDate,
};

// Exported for the per-rule tests: each rule is one named function.
export const legacyMatchingRules = {
  emailKey,
  nameKey,
  surnameDobKey,
  unitFor,
  surnamePasses,
  nameAgreement,
  dobComparison,
  isPlaceholderBirthDate,
  countrySignal,
  signals,
  corroborated,
  confidence,
  statusFor,
  compareCandidates,
  evidenceTier,
  auditEvidence,
};
