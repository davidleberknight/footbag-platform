/**
 * Permanent test-scaffolding builder: a generic real-flow claim journey.
 *
 * Builds a claimed account for ANY real migrated legacy record by driving the
 * REAL application use-cases in order against the loaded real dataset (never
 * seeded): register → recover the verify link from the stub-SES outbox → verify
 * (which activates the account) → claim that legacy record directly by its id →
 * complete onboarding (personal details, then confirm any pending club
 * membership the legacy link surfaces) → volunteer to co-lead each joined club
 * where the account is eligible. The claim grants whatever tier the record earns
 * (Hall-of-Fame or paid history), so co-lead eligibility follows the real data.
 *
 * Parameterized by legacy_member_id and nothing else, and carries no person-specific
 * literal: the account registers under the record's own real name (read from
 * legacy_members at build time, never hardcoded), so its profile slug is derived from
 * that name exactly as a genuine registration derives it and claiming lands on the real
 * person's profile. Only the login address is synthetic (a test-persona address, never a
 * real mailbox) and it is only the account's login email, never an identity key — the
 * journey links the legacy record by its id, not by an email match, so no real mailbox
 * and no real personal email is involved.
 *
 * Member media (avatar, galleries) is deliberately out of scope: uploaded test
 * media is not migrated real data, and that upload path is covered synthetically
 * by the end-to-end journey spec and by the seeded media personas. What this
 * builder proves is that the REAL migrated data — the honors, results, historical
 * person, and club affiliations the record carries — renders and behaves once a
 * member claims it.
 *
 * Admin role: this builder never grants admin. The account registers through the
 * real path, so admin is conferred only by the dev/staging register-allowlist
 * bootstrap, and only when the operator's own allowlist lists the synthetic login
 * address. Admin is incidental to the builder, whose point is the real claim and
 * onboarding journey.
 *
 * Not idempotent: the caller guarantees the account does not already exist (the
 * build-claim route checks first by the record's claim state). Part of src/testkit/
 * and excluded from the production image by the env-gated mount plus the build-
 * time strip.
 */
import { db } from '../db/db';
import { identityAccessService } from '../services/identityAccessService';
import { simulatedEmailService } from '../services/simulatedEmailService';
import { memberService } from '../services/memberService';
import { memberOnboardingService } from '../services/memberOnboardingService';
import { clubService } from '../services/clubService';
import { TEST_PERSONA_BIO_PREFIX } from './personaFactory';

// A throwaway registration password for the built account. It is never used to
// log in — the build-claim route issues a session cookie directly — so its only
// job is to satisfy the registration password policy. Kept as a local literal
// (not imported from the persona-secret module, whose import-time env guard
// would otherwise bind this builder to dev/staging and break app boot elsewhere).
const PASSWORD = 'realclaim-journey-pw';

// Synthetic, id-unique login address for a built claimant account. Only the login
// email is synthetic; the account's name and profile slug come from the real record.
// The email is never a real mailbox and is never an identity key -- the journey links
// the legacy record by its id, not by an email match.
function realClaimEmail(legacyMemberId: string): string {
  const suffix = legacyMemberId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `real_claim_${suffix}@personas.test`;
}

const bioFor = (): string =>
  `${TEST_PERSONA_BIO_PREFIX} This account is built by the real register, verify, ` +
  'claim, and onboarding flows against a real migrated footbag.org record rather ' +
  'than a seeded fixture, so the team can verify that migrated real-world data ' +
  'renders and behaves correctly across the site.';

export interface BuildRealClaimResult {
  memberId: string;
  slug: string;
  legacyMemberId: string;
  claimedLegacy: boolean;
  coLedClubIds: string[];
}

export async function buildRealClaimJourney(legacyMemberId: string): Promise<BuildRealClaimResult> {
  const id = String(legacyMemberId).trim();
  if (!id) throw new Error('buildRealClaimJourney: a non-empty legacy_member_id is required.');

  // The target must be a real, unclaimed legacy record. Refuse a missing id (no
  // such record loaded) or an already-claimed one (claiming it again would fail
  // partway and leave a half-built account).
  const record = db
    .prepare('SELECT real_name, claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
    .get(id) as { real_name: string | null; claimed_by_member_id: string | null } | undefined;
  if (!record) {
    throw new Error(
      `buildRealClaimJourney: no legacy_members row for id ${id}; the journey needs a loaded real dataset with a claimable record.`,
    );
  }
  if (record.claimed_by_member_id != null) {
    throw new Error(`buildRealClaimJourney: legacy record ${id} is already claimed; choose an unclaimed record.`);
  }

  // Register under the record's own real name, so registration derives the profile
  // slug from that name the way it does for a real member (dave_leberknight from
  // "Dave Leberknight") and claiming lands on the real person's profile. A record
  // with no registration-valid name (a bare collision stub) cannot register, so
  // refuse it with a clear error rather than a cryptic downstream validation throw.
  const realName = (record.real_name ?? '').trim();
  if (realName.split(/\s+/).filter(Boolean).length < 2 || /\d/.test(realName)) {
    throw new Error(
      `buildRealClaimJourney: legacy record ${id} has no registration-valid real name (${JSON.stringify(record.real_name)}); choose a record that carries a full name.`,
    );
  }
  const email = realClaimEmail(id);

  // 1. Register through the real path. No slug is supplied, so registration derives
  //    the profile slug from the real name the way a real member's registration does.
  await identityAccessService.registerMember(
    email, PASSWORD, PASSWORD, realName, realName, '127.0.0.1',
  );

  // 2. Recover the verify link from the stub-SES outbox (drains it first).
  const preview = await simulatedEmailService.getEmailPreview({
    urlPathPrefix: '/verify',
    recipientEmail: email,
  });
  const verifyUrl = preview?.messages[0]?.firstUrl ?? null;
  if (!verifyUrl) throw new Error('buildRealClaimJourney: no verify link found in the simulated email outbox');
  const token = verifyUrl.split('/verify/')[1];
  if (!token) throw new Error(`buildRealClaimJourney: could not parse verify token from ${verifyUrl}`);

  // 3. Verify, which activates the account and resolves the member.
  const verified = await identityAccessService.verifyEmailByToken(token);
  if (!verified) throw new Error('buildRealClaimJourney: verify token did not resolve a member');
  const memberId = verified.memberId;

  // The profile slug registration derived from the real name. Read it back rather
  // than recompute it, so it always matches what registration actually stored
  // (including any uniqueness suffix on a duplicate name).
  const memberRow = db
    .prepare('SELECT slug FROM members WHERE id = ?')
    .get(memberId) as { slug: string } | undefined;
  if (!memberRow) throw new Error(`buildRealClaimJourney: no members row for verified member ${memberId}`);
  const slug = memberRow.slug;

  // 4. Claim the real legacy record directly by its id. The claim grants whatever
  //    tier the record earns and links its historical-person record; that legacy
  //    link is what surfaces any pending club membership candidate below.
  identityAccessService.claimLegacyAccount(memberId, id, 'admin_vetted_evidence');
  memberOnboardingService.completeTaskIfOutstanding(memberId, 'legacy_claim');

  // 5. Personal details: synthetic, obviously-test values (the claimed record's
  //    own migrated data is what the crawl verifies, not these). Completing the
  //    task lets the wizard advance to the club-affiliations step.
  memberService.setPersonalDetails(memberId, {
    city: 'Testville',
    region: '',
    country: 'Testland',
    birthDate: '2008-08-08',
    gender: 'undisclosed',
    yearValue: '2000',
    showFirstCompetitionYear: true,
    showCompetitiveResults: true,
  });
  memberOnboardingService.completeTaskIfOutstanding(memberId, 'personal_details');

  // 6. Confirm any pending club membership candidate the legacy link surfaced,
  //    then advance the step. Records with no club affiliation simply have no
  //    membership card, and the step completes empty.
  for (const card of memberOnboardingService.listWizardCardsForMember(memberId)) {
    if (card.kind === 'membership') {
      memberOnboardingService.submitClubAffiliationsResponse(memberId, {
        kind: 'membership', candidateId: card.candidateId, userDecision: 'confirm', activitySignal: 'active',
      });
    }
  }
  memberOnboardingService.completeTaskIfOutstanding(memberId, 'club_affiliations');

  // 7. Author the About through the real edit-profile use case so the profile
  //    carries the test-persona disclaimer, and re-affirm the public detail
  //    fields set above so the two writes never drift.
  await memberService.updateOwnProfile(slug, {
    bio: bioFor(),
    city: 'Testville',
    region: '',
    country: 'Testland',
    phone: '',
    whatsapp: '',
    emailVisibility: 'members',
    phoneVisible: '0',
    whatsappVisible: '0',
    searchable: '1',
    firstCompetitionYear: '2000',
    showCompetitiveResults: '1',
    showFirstCompetitionYear: '1',
    showGender: '0',
    gender: 'undisclosed',
    links: [],
  });

  // 8. Volunteer to co-lead each joined club, where the account's earned tier
  //    makes it eligible. Best-effort by design: a record whose claim earned no
  //    Tier-1 benefits, or that joined no club, simply co-leads nothing.
  const coLedClubIds: string[] = [];
  const joinedClubs = db
    .prepare('SELECT club_id FROM member_club_affiliations WHERE member_id = ?')
    .all(memberId) as { club_id: string }[];
  for (const { club_id } of joinedClubs) {
    const result = clubService.volunteerToCoLeadClub(memberId, club_id);
    if (result.branch === 'volunteered' || result.branch === 'already_coleader') {
      coLedClubIds.push(club_id);
    }
  }

  return { memberId, slug, legacyMemberId: id, claimedLegacy: true, coLedClubIds };
}

/**
 * Resolve the member who has claimed a real record, building the claim account on
 * first use. If the record is already claimed, returns the existing claimant with no
 * rebuild, so a repeat build-claim hit is safe; otherwise it runs the full journey.
 */
export async function ensureRealClaimMember(legacyMemberId: string): Promise<{ memberId: string }> {
  const id = String(legacyMemberId).trim();
  if (!id) throw new Error('ensureRealClaimMember: a non-empty legacy_member_id is required.');
  const record = db
    .prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
    .get(id) as { claimed_by_member_id: string | null } | undefined;
  if (!record) {
    throw new Error(`ensureRealClaimMember: no legacy_members row for id ${id}; load the real dataset first.`);
  }
  if (record.claimed_by_member_id != null) {
    return { memberId: record.claimed_by_member_id };
  }
  const built = await buildRealClaimJourney(id);
  return { memberId: built.memberId };
}
