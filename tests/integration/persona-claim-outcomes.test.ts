/**
 * Every claim persona produces the claim-step outcome it promises.
 *
 * The catalog is seeded whole, as /dev/personas seeds it, because the claim
 * step's name key scans every account and record and one persona's rows can
 * reach another's. Each claim persona is then matched through the real matching
 * service, and its card's status, confidence and evidence tier are asserted
 * against what its catalog text tells a tester to expect.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersona } from '../../src/testkit/personaFactory';
import { insertMemberDeclaredAnchor } from '../fixtures/factories';

const { dbPath } = setTestEnv('3405');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let matching: typeof import('../../src/services/legacyMatchingService').legacyMatchingService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  for (const spec of CANONICAL_PERSONAS) {
    if (!spec.blockedBy) seedPersona(db, spec);
  }
  matching = (await import('../../src/services/legacyMatchingService')).legacyMatchingService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function resultFor(slug: string) {
  const evidence = matching.readMemberEvidence(`member_persona_${slug}`);
  if (!evidence) throw new Error(`no evidence for persona ${slug}`);
  return matching.match(evidence);
}

function shownFor(slug: string) {
  return matching.shownCandidates(resultFor(slug));
}

function accountCard(slug: string) {
  return resultFor(slug).candidates.find((c) => c.accountId === `legmem_persona_${slug}`);
}

describe('claim personas reach the outcomes their catalog text promises', () => {
  // Defect caught: a tester following the email-pair persona finds a weaker or
  // unclaimable card, or one that records the wrong evidence tier.
  it('the email-matched pair is one strong claimable card at the sign-in address tier', () => {
    const c = accountCard('claim_email_pair');
    expect(c).toMatchObject({ status: 'claimable', confidence: 'high', curatedPair: true });
    expect(matching.evidenceTier(c!)).toBe('currently_controls_modern_email_matching_legacy');
    expect(shownFor('claim_email_pair')).toHaveLength(1);
  });

  // Defect caught: an old account found by name alone offers a claim control.
  it('an account found by name alone needs an administrator', () => {
    expect(accountCard('claim_name_only')).toMatchObject({ status: 'needs_admin', refusal: 'uncorroborated' });
    expect(accountCard('claim_old_email')).toMatchObject({ status: 'needs_admin', refusal: 'uncorroborated' });
  });

  // Defect caught: the old-email persona stays stuck after the tester adds the
  // address its catalog text names, or claims at the sign-in address tier.
  it('declaring the old address the catalog names makes the account claimable at the declared tier', () => {
    insertMemberDeclaredAnchor(db, {
      member_id: 'member_persona_claim_old_email', anchor_type: 'old_email', anchor_value: 'pat.match@legacy.test',
    });
    const c = accountCard('claim_old_email');
    expect(c).toMatchObject({ status: 'claimable', confidence: 'high' });
    expect(matching.evidenceTier(c!)).toBe('declared_anchor_only');
  });

  // Defect caught: a record with no account behind it is not claimable on the
  // name, or a nickname record is reported as strong as an exact one.
  it('records with no account are claimable on the name, exact as possible and nickname as weakest', () => {
    const exact = resultFor('claim_record_only').candidates
      .find((c) => c.recordId === 'person_persona_claim_record_only_rec');
    expect(exact).toMatchObject({ status: 'claimable', confidence: 'medium', accountId: null });
    const nickname = resultFor('claim_record_nickname').candidates
      .find((c) => c.recordId === 'person_persona_claim_record_nickname_rec');
    expect(nickname).toMatchObject({ status: 'claimable', confidence: 'low', nameAgreement: 'variant' });
  });

  // Defect caught: the married-name card offers a plain claim, or names the
  // wrong surname on its "I used the surname" control.
  it('the married-name account offers the surname it carries', () => {
    expect(accountCard('claim_married_name')).toMatchObject({
      status: 'needs_former_surname', corroborated: true,
      surname: { passes: false, differingSurname: 'Oldname' },
    });
  });

  // Defect caught: a split pair shows as one card, or one half is unclaimable.
  it('an account and record the pipeline left unlinked show as two claimable cards', () => {
    const shown = shownFor('claim_split_pair');
    expect(shown.map((c) => c.status)).toEqual(['claimable', 'claimable']);
    expect(shown.some((c) => c.accountId === 'legmem_persona_claim_split_pair' && c.recordId === null)).toBe(true);
    expect(shown.some((c) => c.recordId === 'person_persona_claim_split_pair_rec' && c.accountId === null)).toBe(true);
  });

  // Defect caught: a declined candidate comes back on the claim step.
  it('a standing decline hides its candidate', () => {
    expect(shownFor('claim_declined')).toEqual([]);
    expect(accountCard('claim_declined')).toMatchObject({ status: 'hidden', refusal: 'declined' });
  });

  // Defect caught: a shared address corroborates one of the accounts it sits on,
  // or the administrator is not told it is shared.
  it('a sign-in address on two accounts corroborates neither and is reported', () => {
    const result = resultFor('claim_shared_email');
    expect(result.candidates.find((c) => c.accountId === 'legmem_persona_claim_shared_email'))
      .toMatchObject({ status: 'needs_admin' });
    expect(result.ambiguousAddresses).toEqual([{ address: { kind: 'login' }, accountCount: 2 }]);
  });

  // Defect caught: the last-attempt persona's account is claimable before the
  // tester corrects the date, so the journey proves nothing.
  it('the misdated account needs an administrator until the date is corrected', () => {
    expect(accountCard('claim_last_attempt')).toMatchObject({ status: 'needs_admin', dob: 'mismatch' });
  });

  // Defect caught: namesakes are hidden, or ordered with the weaker one first.
  it('namesakes all show, the email-matched one first', () => {
    const shown = shownFor('claim_namesakes');
    expect(shown).toHaveLength(2);
    expect(shown[0]).toMatchObject({ accountId: 'legmem_persona_claim_namesakes', confidence: 'high' });
    expect(shown[1]).toMatchObject({ recordId: 'person_persona_claim_namesakes_alt_1', confidence: 'medium' });
  });

  // Defect caught: an account under a different first name is never reached by
  // its exact date, or a mismatched date blocks an email-corroborated claim.
  it('a date of birth corroborates or fails to, and never blocks', () => {
    const dobOnly = accountCard('claim_dob_only');
    expect(dobOnly).toMatchObject({ status: 'claimable', confidence: 'medium', dob: 'identical' });
    expect(dobOnly!.hits.map((h) => h.key)).toEqual(['surname_dob']);
    expect(accountCard('claim_dob_mismatch')).toMatchObject({ status: 'claimable', dob: 'mismatch', confidence: 'high' });
  });

  // Defect caught: a persona meant to show an empty claim step shows a card.
  it('the never-had-one and conflict-prompt personas show no card', () => {
    expect(shownFor('onb_partial')).toEqual([]);
    expect(shownFor('claim_conflict_prompt')).toEqual([]);
  });
});
