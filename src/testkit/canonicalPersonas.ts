/**
 * Maintainer-curated baseline persona catalog.
 *
 * The shared reference set every maintainer and paid tester switches between.
 * Each entry carries coverageNotes documenting the testing dimensions it
 * exercises; the catalog doubles as a coverage matrix that surfaces gaps as
 * the testing surface grows. New test slices add personas here rather than
 * inventing fixture rows.
 *
 * The catalog covers the tier ladder and admin role plus onboarding-wizard
 * state, legacy-claim variants, graded auto-link confidence (high/medium/low),
 * legacy-club-candidate cards (pending/declined/resolved/junk), club
 * affiliations, payment history, Active Player expiry, mailing-list
 * subscription state, and edge-case identities.
 */
import type { PersonaSpec } from './personaFactory';

export const CANONICAL_PERSONAS: PersonaSpec[] = [
  {
    slug: 't0_fresh',
    displayName: 'Tia Zero',
    tier: 'tier0',
    onboardingComplete: true,
    coverageNotes: ['tier0 baseline', 'onboarding wizard complete', 'no payment history'],
  },
  {
    slug: 't1_paid',
    displayName: 'Won Paid',
    tier: 'tier1',
    onboardingComplete: true,
    payments: [{ type: 'membership', status: 'succeeded', purchasedTier: 'tier1' }],
    coverageNotes: ['tier1', 'one successful membership purchase', 'tier1 benefits gate'],
  },
  {
    slug: 't2_paid',
    displayName: 'Tu Paid',
    tier: 'tier2',
    onboardingComplete: true,
    payments: [
      { type: 'membership', status: 'succeeded', purchasedTier: 'tier1' },
      { type: 'membership', status: 'succeeded', purchasedTier: 'tier2' },
    ],
    coverageNotes: ['tier2', 'tier1 + tier2 purchase history', 'tier2 benefits gate'],
  },
  {
    slug: 't3_comped',
    displayName: 'Tree Comped',
    tier: 'tier3',
    underlyingTier: 'tier2',
    onboardingComplete: true,
    coverageNotes: [
      'tier3 governance tier',
      'admin-comped (no payment)',
      'underlying tier2',
    ],
  },
  {
    slug: 'admin_t2',
    displayName: 'Addie Min',
    tier: 'tier2',
    isAdmin: true,
    onboardingComplete: true,
    payments: [{ type: 'membership', status: 'succeeded', purchasedTier: 'tier2' }],
    coverageNotes: ['admin role', 'tier2', 'admin nav + admin-gated surfaces'],
  },

  // ── Onboarding-wizard state ───────────────────────────────────────────────
  {
    slug: 'onb_unstarted',
    displayName: 'Newt Begin',
    tier: 'tier0',
    coverageNotes: ['fresh signup, no onboarding rows (all tasks pending)'],
  },
  {
    slug: 'onb_partial',
    displayName: 'Hal Fway',
    tier: 'tier0',
    onboardingTasks: { personal_details: 'completed', legacy_claim: 'in_progress_paused' },
    coverageNotes: [
      'partial wizard',
      'personal_details done, legacy_claim paused mid-flow',
      'dashboard resume card',
    ],
  },
  {
    slug: 'onb_skipped',
    displayName: 'Bea Skip',
    tier: 'tier0',
    onboardingTasks: {
      personal_details: 'completed',
      legacy_claim: 'skipped',
      club_affiliations: 'skipped',
    },
    coverageNotes: ['wizard with explicitly skipped legacy + club tasks'],
  },

  // ── Legacy claim variants ─────────────────────────────────────────────────
  {
    slug: 'legacy_unlinked_email',
    displayName: 'Pat Match',
    tier: 'tier0',
    legacy: { linked: false, realName: 'Pat Match', legacyEmail: 'pat.match@legacy.test' },
    onboardingTasks: { personal_details: 'completed', legacy_claim: 'in_progress_paused' },
    coverageNotes: [
      'unlinked legacy match with legacy_email',
      'email-equality claim fast path + /claim/confirm token via simulated-email card',
    ],
  },
  {
    slug: 'legacy_unlinked_noemail',
    displayName: 'Jo Cardonly',
    tier: 'tier0',
    legacy: { linked: false, realName: 'Jo Cardonly' },
    coverageNotes: [
      'unlinked legacy match, null legacy_email',
      'historical-person card-confirm claim path',
    ],
  },
  {
    slug: 'legacy_linked',
    displayName: 'Sam Claimed',
    tier: 'tier1',
    onboardingComplete: true,
    legacy: { linked: true, realName: 'Sam Claimed', legacyEmail: 'sam.claimed@legacy.test' },
    payments: [{ type: 'membership', status: 'succeeded', purchasedTier: 'tier1' }],
    coverageNotes: ['completed legacy claim (member.legacy_member_id set)', 'tier1'],
  },

  // ── Graded auto-link confidence (single-candidate path) ───────────────────
  {
    slug: 'autolink_high',
    displayName: 'Kenny Highmatch',
    tier: 'tier0',
    legacy: { autoLinkConfidence: 'high' },
    onboardingTasks: { personal_details: 'completed', legacy_claim: 'in_progress_paused' },
    coverageNotes: ['auto-link high confidence (exact name match)', 'auto-link-confirm card'],
  },
  {
    slug: 'autolink_medium',
    displayName: 'Robin Midmatch',
    tier: 'tier0',
    legacy: { autoLinkConfidence: 'medium' },
    onboardingTasks: { personal_details: 'completed', legacy_claim: 'in_progress_paused' },
    coverageNotes: ['auto-link medium confidence (same-surname name_variants match)'],
  },
  {
    slug: 'autolink_low',
    displayName: 'Lou Lowmatch',
    tier: 'tier0',
    legacy: { autoLinkConfidence: 'low' },
    onboardingTasks: { personal_details: 'completed', legacy_claim: 'in_progress_paused' },
    coverageNotes: ['auto-link low confidence (no name candidate)', 'falls through to manual claim'],
  },
  {
    slug: 'legacy_club_cards',
    displayName: 'Cam Cards',
    tier: 'tier0',
    legacy: { linked: false, realName: 'Cam Cards' },
    legacyClubCandidates: [
      { clubName: 'Pending Kick Club', classification: 'onboarding_visible', resolutionStatus: 'pending' },
      { clubName: 'Declined Shred Club', classification: 'onboarding_visible', resolutionStatus: 'rejected' },
      { clubName: 'Resolved Footbag Club', resolutionStatus: 'confirmed_current', mapped: true },
      { clubName: 'Junk Noise Club', classification: 'junk' },
    ],
    coverageNotes: [
      'legacy-club-candidate cards: pending / declined / resolved / junk-suppressed',
      'unlinked legacy identity hosting the affiliations',
    ],
  },

  // ── Club affiliations ─────────────────────────────────────────────────────
  {
    slug: 'club_leader',
    displayName: 'Lee Der',
    tier: 'tier1',
    onboardingComplete: true,
    club: { clubName: 'Downtown Footbag', leader: true },
    coverageNotes: ['confirmed club leader (bootstrap-leader + signal)', 'club affiliation'],
  },
  {
    slug: 'club_multi',
    displayName: 'Polly Clubs',
    tier: 'tier1',
    onboardingComplete: true,
    clubs: [
      { clubName: 'Harbor Kick Collective', current: true, primary: true },
      { clubName: 'Old Town Shred', current: false },
    ],
    coverageNotes: ['multiple club affiliations', 'one current+primary, one former'],
  },
  {
    slug: 'club_contact',
    displayName: 'Connie Tact',
    tier: 'tier1',
    onboardingComplete: true,
    clubs: [{ clubName: 'Riverside Footbag', current: true, contact: true }],
    coverageNotes: ['current club affiliation flagged as listed contact'],
  },

  // ── Payment history ───────────────────────────────────────────────────────
  {
    slug: 'pay_failed',
    displayName: 'Fay Lure',
    tier: 'tier0',
    onboardingComplete: true,
    payments: [{ type: 'membership', status: 'failed', purchasedTier: 'tier1' }],
    coverageNotes: ['failed membership purchase, no tier grant', 'retry-from-failure surface'],
  },
  {
    slug: 'pay_pending',
    displayName: 'Penny Ding',
    tier: 'tier0',
    onboardingComplete: true,
    payments: [{ type: 'membership', status: 'pending', purchasedTier: 'tier2' }],
    coverageNotes: ['pending checkout, no tier grant yet'],
  },
  {
    slug: 'pay_refunded',
    displayName: 'Reff Und',
    tier: 'tier0',
    onboardingComplete: true,
    payments: [{ type: 'membership', status: 'refunded', purchasedTier: 'tier1' }],
    coverageNotes: ['refunded membership purchase'],
  },
  {
    slug: 'pay_donation',
    displayName: 'Donna Gift',
    tier: 'tier1',
    onboardingComplete: true,
    payments: [
      { type: 'membership', status: 'succeeded', purchasedTier: 'tier1' },
      { type: 'donation', status: 'succeeded', amountCents: 5000, purchasedTier: null },
    ],
    coverageNotes: ['membership + standalone donation history'],
  },

  // ── Active Player status ──────────────────────────────────────────────────
  {
    slug: 'ap_active',
    displayName: 'Ace Tive',
    tier: 'tier0',
    onboardingComplete: true,
    activePlayer: { expiresAt: '2027-12-31T00:00:00.000Z' },
    coverageNotes: ['current (non-expired) Active Player grant'],
  },
  {
    slug: 'ap_expired',
    displayName: 'Xavier Pyre',
    tier: 'tier0',
    onboardingComplete: true,
    activePlayer: { expiresAt: '2024-06-01T00:00:00.000Z', reasonCode: 'official_event_attendance' },
    coverageNotes: ['recently-expired Active Player', 'M_Active_Player_Expiry surface'],
  },

  // ── Mailing-list subscription state ───────────────────────────────────────
  {
    slug: 'ml_subscribed',
    displayName: 'Sue Scribe',
    tier: 'tier1',
    onboardingComplete: true,
    mailingList: { status: 'subscribed' },
    coverageNotes: ['subscribed mailing-list membership'],
  },
  {
    slug: 'ml_unsubscribed',
    displayName: 'Una Sub',
    tier: 'tier1',
    onboardingComplete: true,
    mailingList: { status: 'unsubscribed' },
    coverageNotes: ['unsubscribed mailing-list membership'],
  },

  // ── Edge-case identities ──────────────────────────────────────────────────
  {
    slug: 'edge_surname_a',
    displayName: 'Chris Tan',
    realName: 'Chris Tan',
    tier: 'tier1',
    onboardingComplete: true,
    coverageNotes: ['surname collision (Tan) with edge_surname_b'],
  },
  {
    slug: 'edge_surname_b',
    displayName: 'Pat Tan',
    realName: 'Pat Tan',
    tier: 'tier1',
    onboardingComplete: true,
    coverageNotes: ['surname collision (Tan) with edge_surname_a'],
  },
  {
    slug: 'edge_dup_display_a',
    displayName: 'Jordan Lee',
    realName: 'Jordan Lee',
    tier: 'tier0',
    onboardingComplete: true,
    coverageNotes: ['duplicate display name with edge_dup_display_b'],
  },
  {
    slug: 'edge_dup_display_b',
    displayName: 'Jordan Lee',
    realName: 'Jordan Lee',
    tier: 'tier0',
    onboardingComplete: true,
    coverageNotes: ['duplicate display name with edge_dup_display_a'],
  },
  {
    slug: 'edge_unicode',
    displayName: 'Renée Müller',
    realName: 'Renée Müller',
    tier: 'tier1',
    onboardingComplete: true,
    coverageNotes: ['unicode / diacritic display + real name'],
  },
  {
    // RTL override (U+202E) + pop directional formatting (U+202C) around a span.
    slug: 'edge_rtl',
    displayName: 'Sara ‮reparK‬',
    realName: 'Sara Krapper',
    tier: 'tier0',
    onboardingComplete: true,
    coverageNotes: ['RTL-override control characters in display name'],
  },
  {
    // Leading Cyrillic 'А' (U+0410) homoglyph of Latin 'A'.
    slug: 'edge_homoglyph',
    displayName: 'Аlex Kerr',
    realName: 'Alex Kerr',
    tier: 'tier0',
    onboardingComplete: true,
    coverageNotes: ['Cyrillic homoglyph in display name'],
  },
];
