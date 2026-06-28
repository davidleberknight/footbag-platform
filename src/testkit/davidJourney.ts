/**
 * CUTOVER-REMOVE. David Leberknight's full real-flow journey builder. Dev and
 * staging scaffolding (never prod); the go-live gate tears down the DL user and
 * deletes this file (and the rest of the DL scaffolding) before production.
 *
 * Builds David by driving the REAL application use-cases in order against REAL
 * pipeline data (never seeded): his HOF Historical Person "Dave Leberknight",
 * his legacy account, the Wellington Hack Crew club, and his pending Wellington
 * membership candidate all already exist in a loaded dev/staging DB. He logs in
 * with a synthetic test address; no real mailbox is involved. Steps:
 *   - resolve his HOF legacy record id from the pipeline data;
 *   - register, recover the verify link from the stub-SES outbox, verify (which
 *     activates the account);
 *   - claim that legacy account directly by its id (the claim grants tier2
 *     because it is HOF and links his historical-person record, which is what
 *     surfaces his pending Wellington membership candidate);
 *   - personal details (Tauranga NZ; DOB private; gender private; first
 *     competition year 1987 shown; show competitive results);
 *   - confirm his real pending Wellington membership candidate, then volunteer
 *     to co-lead that club (he has no bootstrap-leader candidate, so the
 *     onboarding leadership-offer does not apply; tier2 from the claim satisfies
 *     the volunteer eligibility gate);
 *   - upload his avatar; create the Funky Footbags gallery with his photos and
 *     the YouTube clip.
 *
 * Admin role: this builder never grants admin. He registers through the real
 * path, so admin is conferred only by the dev/staging register-allowlist
 * bootstrap at registration, and only when the operator's own admin allowlist
 * lists his synthetic login address. The maintainer who holds that allowlist
 * gets an admin David (and can therefore curate); any other developer who builds
 * him gets a plain member. The admin role is incidental to this builder, whose
 * point is the real media and onboarding journey.
 *
 * Invoked by the build-then-switch dev route. NOT idempotent: the caller
 * guarantees David does not already exist (the route checks first). Side-effect-
 * safe for the live web process: media uploads run through a local curator-media
 * service instance carrying a permissive video verifier (so the one external
 * YouTube oEmbed call is neutralized) while still using the real storage adapter
 * and the real image worker; no global singleton is mutated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/db';
import { identityAccessService } from '../services/identityAccessService';
import { simulatedEmailService } from '../services/simulatedEmailService';
import { memberService } from '../services/memberService';
import { memberOnboardingService } from '../services/memberOnboardingService';
import { clubService } from '../services/clubService';
import { getDefaultAvatarService } from '../services/avatarService';
import { createCuratorMediaService } from '../services/curatorMediaService';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { getImageProcessingAdapter } from '../adapters/imageProcessingAdapter';
import { TEST_PERSONA_BIO_PREFIX } from './personaFactory';

export const DAVID_SLUG = 'david_leberknight';
// Synthetic login address for the built persona, following the test-persona
// convention. It is only the account's login email, never an identity key: the
// journey links his Hall-of-Fame legacy record by legacy_member_id, not by an
// email match, so no real mailbox and no committed personal email is involved.
export const DAVID_EMAIL = `${DAVID_SLUG}@personas.test`;
export const DAVID_PASSWORD = '88888888';
export const DAVID_NAME = 'David Leberknight';

// About text authored on his profile through the real edit-profile use case.
// Reuses the shared test-persona disclaimer so his profile carries the same
// "not a real member" signal every seeded persona shows, then adds the one way
// he differs: he is built from real Hall of Fame and legacy data rather than a
// seeded fixture, so a tester is never misled into reading him as a production
// identity.
export const DAVID_BIO =
  `${TEST_PERSONA_BIO_PREFIX} This account is built from real Hall of Fame and ` +
  'legacy footbag.org data rather than the seeded persona fixtures, so the team ' +
  'can verify that migrated real-world data renders and behaves correctly across the site.';

// The journey's photo/avatar fixtures live with the testkit (not under tests/)
// so they ship in the staging image, which copies src/testkit/assets but never
// tests/. They are stripped from the production image with the rest of the
// testkit, where build-switch is disabled anyway.
const ASSET_DIR = path.join(process.cwd(), 'src', 'testkit', 'assets');

interface PhotoFixture { file: string; caption: string; tags: string[]; }
const FUNKY_GALLERY_NAME = 'Funky Footbags';
const PHOTOS: PhotoFixture[] = [
  { file: 'fb_182a.jpg', caption: '182 panel footbags', tags: ['#footbags'] },
  { file: 'fb_182b.jpg', caption: '182 panel footbags', tags: ['#footbags'] },
  { file: 'fb_182c.jpg', caption: '182 panel footbags', tags: ['#footbags'] },
  { file: 'club_wellington_chinlone_hack.JPG', caption: 'Chinlone hack with the Wellington club', tags: ['#club_wellington', '#chinlone'] },
  { file: 'club_wellington_in_myanmar.JPG', caption: 'Wellington club in Myanmar', tags: ['#club_wellington'] },
];
const VIDEO = {
  videoUrl: 'https://www.youtube.com/watch?v=h17Z102sJNc',
  videoPlatform: 'youtube' as const,
  caption: 'Wellington Hack Crew in Myanmar playing Chinlone',
  tags: ['#chinlone', '#club_wellington'],
};

export interface BuildDavidResult {
  memberId: string;
  slug: string;
  claimedLegacy: boolean;
  coLedClubIds: string[];
}

export async function buildDavidJourney(): Promise<BuildDavidResult> {
  // 0. Resolve his Hall-of-Fame legacy record id from the loaded pipeline data.
  //    The journey links the legacy account by this id, not by an email match,
  //    so nothing is written into the legacy record and no mailbox is needed.
  const hofLegacy = db
    .prepare(`
      SELECT legacy_member_id FROM historical_persons
       WHERE hof_member = 1 AND legacy_member_id IS NOT NULL
         AND person_name LIKE '%Leberknight%'
       ORDER BY legacy_member_id
       LIMIT 1
    `)
    .get() as { legacy_member_id: string } | undefined;
  if (!hofLegacy) {
    throw new Error(
      'buildDavidJourney: no Hall-of-Fame Leberknight legacy record found; the journey needs a loaded dev/staging database with the canonical person data.',
    );
  }
  const legacyMemberId = String(hofLegacy.legacy_member_id);
  if (legacyMemberId !== '11985') {
    throw new Error(
      `buildDavidJourney: expected the Hall-of-Fame Leberknight legacy_member_id to be 11985 but found ${legacyMemberId}; refusing to claim a mismatched record.`,
    );
  }

  // 1. Register through the real path.
  await identityAccessService.registerMember(
    DAVID_EMAIL, DAVID_PASSWORD, DAVID_PASSWORD, DAVID_NAME, DAVID_NAME, '127.0.0.1', DAVID_SLUG,
  );

  // 2. Recover the verify link from the stub-SES outbox (drains it first).
  const preview = await simulatedEmailService.getEmailPreview({
    urlPathPrefix: '/verify',
    recipientEmail: DAVID_EMAIL,
  });
  const verifyUrl = preview?.messages[0]?.firstUrl ?? null;
  if (!verifyUrl) throw new Error('buildDavidJourney: no verify link found in the simulated email outbox');
  const token = verifyUrl.split('/verify/')[1];
  if (!token) throw new Error(`buildDavidJourney: could not parse verify token from ${verifyUrl}`);

  // 3. Verify, which activates the account and logs the member in.
  const verified = await identityAccessService.verifyEmailByToken(token);
  if (!verified) throw new Error('buildDavidJourney: verify token did not resolve a member');
  const memberId = verified.memberId;
  const slug = verified.slug;

  // 4. Claim his HOF legacy account directly by the id resolved above. The claim
  //    grants tier2 because the account is HOF (which later satisfies the co-lead
  //    eligibility gate) and links his historical-person record; that legacy link
  //    is what surfaces his pending Wellington membership candidate as a wizard
  //    card in the next step.
  identityAccessService.claimLegacyAccount(
    memberId, legacyMemberId, 'admin_vetted_evidence',
  );
  memberOnboardingService.completeTaskIfOutstanding(memberId, 'legacy_claim');
  const claimedLegacy = true;

  // No admin grant happens here on purpose. He registers through the real path,
  // so admin is conferred only by the dev/staging register-allowlist bootstrap,
  // and only when the operator's own admin allowlist lists his login address.
  // The maintainer who holds that allowlist gets an admin David; any other
  // developer who builds him gets a plain member. See the file header.

  // 5. Personal details: Tauranga NZ; DOB fake + private; gender private;
  //    first competition year 1987 shown; show competitive results. The public
  //    fields are named once here and reused when his About is authored below,
  //    so the two writes never drift.
  const DAVID_CITY = 'Tauranga';
  const DAVID_REGION = '';
  const DAVID_COUNTRY = 'New Zealand';
  const DAVID_FIRST_YEAR = '1987';
  memberService.setPersonalDetails(memberId, {
    city: DAVID_CITY,
    region: DAVID_REGION,
    country: DAVID_COUNTRY,
    birthDate: '2008-08-08',
    gender: 'undisclosed',
    yearValue: DAVID_FIRST_YEAR,
    showFirstCompetitionYear: true,
    showCompetitiveResults: true,
  });
  memberOnboardingService.completeTaskIfOutstanding(memberId, 'personal_details');

  // 6a. Confirm his real pending Wellington membership candidate (it surfaces as
  //     a wizard card after the claim links his legacy account).
  for (const card of memberOnboardingService.listWizardCardsForMember(memberId)) {
    if (card.kind === 'membership') {
      memberOnboardingService.submitClubAffiliationsResponse(memberId, {
        kind: 'membership', candidateId: card.candidateId, userDecision: 'confirm', activitySignal: 'active',
      });
    }
  }
  memberOnboardingService.completeTaskIfOutstanding(memberId, 'club_affiliations');

  // 6b. Volunteer to co-lead the club he just joined. He has no bootstrap-leader
  //     candidate, so the onboarding leadership-offer does not apply; the
  //     volunteer path promotes him directly (tier2 from the HOF claim satisfies
  //     the Tier 1 eligibility gate).
  const coLedClubIds: string[] = [];
  const joinedClubs = db
    .prepare(`SELECT club_id FROM member_club_affiliations WHERE member_id = ?`)
    .all(memberId) as { club_id: string }[];
  for (const { club_id } of joinedClubs) {
    const result = clubService.volunteerToCoLeadClub(memberId, club_id);
    if (result.branch === 'volunteered' || result.branch === 'already_coleader') {
      coLedClubIds.push(club_id);
    } else {
      throw new Error(
        `buildDavidJourney: volunteering to co-lead ${club_id} returned '${result.branch}', expected co-leader.`,
      );
    }
  }

  // 6c. Author his About through the real edit-profile use case. Every test
  //     persona explains itself on its own profile; David, built from real
  //     legacy data rather than a seeded fixture, says so here so a tester never
  //     reads his profile as a production identity. Running it after he co-leads
  //     also exercises the co-leader contact-visibility lock (email forced to
  //     members-only). The public fields mirror his personal-details step so the
  //     edit re-affirms rather than regresses them.
  await memberService.updateOwnProfile(slug, {
    bio: DAVID_BIO,
    city: DAVID_CITY,
    region: DAVID_REGION,
    country: DAVID_COUNTRY,
    phone: '',
    whatsapp: '',
    emailVisibility: 'members',
    phoneVisible: '0',
    whatsappVisible: '0',
    searchable: '1',
    firstCompetitionYear: DAVID_FIRST_YEAR,
    showCompetitiveResults: '1',
    showFirstCompetitionYear: '1',
    showGender: '0',
    gender: 'undisclosed',
    links: [],
  });

  // 7. Avatar (real image worker).
  await getDefaultAvatarService().uploadAvatar(
    memberId, slug, fs.readFileSync(path.join(ASSET_DIR, 'david_leberknight_avatar.jpg')), 'david_leberknight_avatar.jpg', { actorIsAdmin: true },
  );

  // 8. Media: a local curator-media instance with the real storage + real image
  //    worker but a permissive video verifier (neutralizes the YouTube oEmbed
  //    call; no global mutation).
  const media = createCuratorMediaService({
    storage: getMediaStorageAdapter(),
    imageProcessor: getImageProcessingAdapter(),
    videoUrlVerifier: async () => ({ ok: true, status: 200, body: { thumbnail_url: 'https://i.vimeocdn.com/seed.jpg' } }),
  });

  await media.createGallery({
    actorMemberId: memberId,
    actorIsAdmin: true,
    ownerMemberId: memberId,
    ownerSlug: slug,
    updates: {
      name: FUNKY_GALLERY_NAME,
      description: 'Photos of funky footbags.',
      sortOrder: 'upload_desc',
      criteriaTags: ['#footbags'],
      excludeTags: [],
      externalLinks: [],
    },
  });

  for (const photo of PHOTOS) {
    await media.uploadPhotoForMember({
      memberId, slug, actorIsAdmin: true,
      photoBuffer: fs.readFileSync(path.join(ASSET_DIR, photo.file)),
      sourceFilename: photo.file, caption: photo.caption, tags: photo.tags,
    });
  }

  await media.submitVideoForMember({
    memberId, slug, actorIsAdmin: true,
    videoUrl: VIDEO.videoUrl, videoPlatform: VIDEO.videoPlatform, caption: VIDEO.caption, tags: VIDEO.tags,
  });

  return { memberId, slug, claimedLegacy, coLedClubIds };
}
