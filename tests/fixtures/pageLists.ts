/**
 * Which page the rendered-style browser check measures for each view.
 *
 * The check finds most pages itself: it seeds the crawl corpus, walks the site
 * by links as each viewer below, and keeps the first page that names each view
 * in its development-only response header. A view the walk cannot reach (a page
 * that exists only after a form posts, or one a link never points at) is listed
 * in REACH with the URL that renders it; a view that exists only as the answer
 * to a form is listed by the URL of the page carrying that form, with the form
 * to submit. EXEMPT names a view that cannot be measured at all, with the
 * reason. A page view that is in none of the three fails the check, so a new
 * view cannot ship unmeasured.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const VIEWS_DIR = path.join(REPO_ROOT, 'src', 'views');

/** Viewers the walk runs as. A persona slug signs in through the development persona switch. */
export interface Viewer { name: string; persona: string | null; seeds: string[] }

export const VIEWERS: readonly Viewer[] = [
  { name: 'anonymous', persona: null, seeds: ['/', '/login', '/register', '/password/forgot', '/legal', '/crawl-probe-no-such-page'] },
  { name: 'member', persona: 't1_paid', seeds: ['/', '/members/t1_paid', '/members/t1_paid/edit', '/members/t1_paid/payments', '/members/t1_paid/galleries'] },
  { name: 'club-leader', persona: 'club_leader', seeds: ['/clubs', '/members/club_leader'] },
  { name: 'admin', persona: 'admin_t2', seeds: ['/', '/admin', '/admin/bootstrap-claim'] },
  { name: 'registrant', persona: 'onb_unstarted', seeds: ['/register/wizard/personal_details'] },
  { name: 'registrant-claim', persona: 'onb_partial', seeds: ['/register/wizard/legacy_claim'] },
  { name: 'registrant-club', persona: 'onb_club_unanswered', seeds: ['/register/wizard/club_affiliations'] },
];

/**
 * Rows the browser check seeds so the pages in REACH have something to show.
 * Fixed ids, because REACH names them in URLs.
 */
export const REACH_ROWS = {
  eventKey: 'event_2026_rendered_style_open',
  eventId: 'event-rs-open',
  resultDisciplineId: 'disc-rs-open-singles',
  resultEntryId: 'entry-rs-open-1',
  netTeamId: 'net-team-rs',
  memberGalleryId: 'gallery_rs_member',
  memberMediaId: 'media_rs_member',
  recurringSubscriptionId: 'sub_rs_member',
  curatorMediaId: 'media-curator-rs',
  curatorJobId: 'mj-rs',
  checkoutSessionId: 'cs_rs_member',
  paymentId: 'pay-rs-member',
  playerAId: 'person-rs-player-a',
  // A dispute over an old account another member's claim took, and a plain
  // link-help request naming an account nobody holds.
  disputeItemId: 'wq-rs-dispute',
  disputedLegacyId: 'legmem_rs_disputed',
  disputeHolderId: 'member-rs-dispute-holder',
  disputeRequesterId: 'member-rs-dispute-requester',
  linkHelpItemId: 'wq-rs-link-help',
  linkHelpLegacyId: 'legmem_rs_unclaimed',
  linkHelpRequesterId: 'member-rs-link-requester',
  // A club with one co-leader of its own, so leaving, stepping down and an
  // administrator's demotion all have a seat to act on.
  leaderClubId: 'club-rs-leaders',
  leaderClubKey: 'club_rs_leaders',
  leaderMemberId: 'member-rs-club-leader',
  leaderSlug: 'rs_club_leader',
  retirableTag: 'rs_retirable',
  // Deleting an account ends its session, so each width deletes its own.
  deletePhoneSlug: 'rs_delete_phone',
  deleteDesktopSlug: 'rs_delete_desktop',
  heldPersonId: 'person-rs-held',
  broadcastId: 'emailarchive-rs',
  reconciliationRunId: 'jobrun_rs_reconcile',
  backlogCandidateId: 'ev-rs-backlog',
} as const;

/**
 * A form on the listed page, submitted to reach the view it answers with:
 * `action` is the form's exact action attribute and `fields` the visible
 * fields to fill, by name. Hidden inputs post as the page rendered them.
 */
export interface FormSubmit { action: string; fields?: Readonly<Record<string, string>> }

/**
 * A view the walk cannot reach, with the viewer and URL that render it, and the
 * form to submit there when the view is a form's answer. A submit that ends its
 * own session (deleting the account), or a page belonging to one seeded member,
 * names the member to sign in as at each width, phone then desktop, in place of
 * the shared session; the viewer still says which kind of visitor that member
 * is. MEMBER in the URL or action stands for that member's slug.
 */
export interface Reach {
  template: string;
  viewer: string;
  url: string;
  why: string;
  submit?: FormSubmit;
  signInPerWidth?: readonly [phone: string, desktop: string];
}

export const MEMBER = '{member}';

/** The URL or form action for the member signed in at one width. */
export function forMember(text: string, slug: string | null): string {
  return slug ? text.split(MEMBER).join(slug) : text;
}

const R = REACH_ROWS;
export const REACH: readonly Reach[] = [
  { template: 'events/detail', viewer: 'anonymous', url: `/events/${R.eventKey}`, why: 'the events landing links only upcoming events' },
  { template: 'events/year', viewer: 'anonymous', url: '/events/year/2026', why: 'year archives are linked only once results exist' },
  { template: 'net/events', viewer: 'anonymous', url: '/net/events', why: 'the net landing links it only when net results exist' },
  { template: 'net/teams', viewer: 'anonymous', url: '/net/teams', why: 'the net landing links it only when net results exist' },
  { template: 'net/team-detail', viewer: 'anonymous', url: `/net/teams/${R.netTeamId}`, why: 'teams are linked only from net results' },
  { template: 'auth/check-email', viewer: 'anonymous', url: '/register/check-email', why: 'reached by redirect after registering' },
  { template: 'auth/password-reset', viewer: 'anonymous', url: '/password/reset/rendered-style-unknown-token', why: 'reached from an emailed link' },
  { template: 'auth/verify-landing', viewer: 'anonymous', url: '/verify/rendered-style-unknown-token', why: 'reached from an emailed link' },
  { template: 'email/unsubscribe', viewer: 'anonymous', url: '/email/unsubscribe?t=rendered-style-unknown-token', why: 'reached from a link in a bulk message' },
  { template: 'dev/persona-listing', viewer: 'anonymous', url: '/dev/personas', why: 'the tester harness is linked from no page' },
  { template: 'dev/outbox', viewer: 'anonymous', url: '/dev/outbox', why: 'the tester harness is linked from no page' },
  { template: 'members/questions', viewer: 'member', url: '/members/t1_paid/questions', why: 'linked only while a question is waiting' },
  { template: 'members/stub', viewer: 'member', url: '/members/t1_paid/settings', why: 'the placeholder sections are linked from no page' },
  { template: 'members/galleries/edit', viewer: 'member', url: `/members/t1_paid/galleries/${R.memberGalleryId}/edit`, why: 'the walk does not follow the gallery list into each edit form' },
  { template: 'members/media/edit', viewer: 'member', url: `/members/t1_paid/media/${R.memberMediaId}/edit`, why: 'linked from an item page the walk reaches as another viewer' },
  { template: 'members/media/delete-confirm', viewer: 'member', url: `/members/t1_paid/media/${R.memberMediaId}/delete`, why: 'linked from an item page the walk reaches as another viewer' },
  { template: 'members/recurring-donation-cancel-confirm', viewer: 'member', url: `/members/t1_paid/recurring-donations/${R.recurringSubscriptionId}/cancel`, why: 'linked only for an active recurring donation' },
  { template: 'payments/success', viewer: 'member', url: `/payments/success?session_id=${R.checkoutSessionId}`, why: 'reached by the payment provider returning the member' },
  { template: 'payments/cancel', viewer: 'member', url: '/payments/cancel', why: 'reached by the payment provider returning the member' },
  { template: 'register/wizard/complete', viewer: 'member', url: '/register/wizard/complete', why: 'reached by redirect after the last onboarding step' },
  { template: 'history/claim-unavailable', viewer: 'registrant-claim', url: '/history/rendered-style-no-such-person/claim', why: 'shown for a claim link whose record cannot be claimed' },
  { template: 'admin/clubs/record', viewer: 'admin', url: '/admin/clubs/club-crawlville-real', why: 'the admin club list links records the walk groups together' },
  { template: 'admin/historical-records/correction', viewer: 'admin', url: `/admin/historical-records/${R.playerAId}/correction`, why: 'linked only from a search result on the historical-record lookup' },
  { template: 'admin/event-organizers/queue', viewer: 'admin', url: '/admin/events/organizers', why: 'linked from the work queue only when organizer requests wait' },
  { template: 'admin/event-organizers/detail', viewer: 'admin', url: `/admin/events/${R.eventId}/organizers`, why: 'linked from the organizer queue' },
  { template: 'admin/event-results/event', viewer: 'admin', url: `/admin/events/${R.eventId}/results`, why: 'linked only from a search result on the event-results finder' },
  { template: 'admin/event-results/entry', viewer: 'admin', url: `/admin/events/${R.eventId}/results/entries/${R.resultEntryId}`, why: 'linked only from an event\'s results page' },
  { template: 'admin/event-results/discipline', viewer: 'admin', url: `/admin/events/${R.eventId}/results/disciplines/${R.resultDisciplineId}`, why: 'linked only from an event\'s results page' },
  { template: 'admin/curator/edit', viewer: 'admin', url: `/admin/curator/media/${R.curatorMediaId}/edit`, why: 'linked from curated media the walk groups together' },
  { template: 'admin/curator/job-status', viewer: 'admin', url: `/admin/curator/upload/jobs/${R.curatorJobId}`, why: 'reached by redirect after an upload starts' },
  { template: 'admin/broadcasts/detail', viewer: 'admin', url: `/admin/broadcasts/${R.broadcastId}`, why: 'linked from the broadcast list only once a message was sent' },
  { template: 'admin/payments/report', viewer: 'admin', url: `/admin/payments/reports/${R.reconciliationRunId}`, why: 'linked only once the reconciliation job has run' },
  { template: 'admin/payments/detail', viewer: 'admin', url: `/admin/payments/${R.paymentId}`, why: 'the payments list opens on month to date, so a payment from an earlier month is linked only after a date search' },
  { template: 'admin/freestyle-notation-author', viewer: 'admin', url: `/admin/freestyle/notation-backlog/${R.backlogCandidateId}/author`, why: 'linked from the notation backlog per candidate' },
  { template: 'admin/freestyle-trick-publish', viewer: 'admin', url: `/admin/freestyle/notation-backlog/${R.backlogCandidateId}/publish`, why: 'linked from the notation backlog per candidate' },
  { template: 'history/claim-hp-conflict', viewer: 'registrant-claim', url: `/history/${R.heldPersonId}/claim`, why: 'shown for a claim link whose record another member holds' },
  { template: 'history/claim-hp-confirm', viewer: 'registrant-claim', url: '/history/person_persona_claim_record_only_rec/claim', why: 'reached from a claim card on the wizard\'s claim step', signInPerWidth: ['claim_record_only', 'claim_record_only'] },

  // The answers to a form. Every administrator action posts to a preview that
  // writes nothing and commits only from its confirm page, and the member
  // leave and step-down posts ask for confirmation before acting, so these
  // submits change no state.
  { template: 'admin/admin-roles/grant-confirm', viewer: 'admin', url: '/admin/admin-roles', why: 'answers the grant form', submit: { action: '/admin/admin-roles/grant', fields: { member_key: 't1_paid', reason: 'Rendered style check grant preview.' } } },
  { template: 'admin/admin-roles/revoke-confirm', viewer: 'admin', url: '/admin/admin-roles', why: 'answers a revoke form', submit: { action: '/admin/admin-roles/member_persona_admin_b/revoke', fields: { reason: 'Rendered style check revoke preview.' } } },
  { template: 'admin/honor-grants/grant-confirm', viewer: 'admin', url: '/admin/honor-grants', why: 'answers the honor grant form', submit: { action: '/admin/honor-grants/grant', fields: { member_key: 't1_paid', honor: 'hof' } } },
  { template: 'admin/honor-grants/action-confirm', viewer: 'admin', url: '/admin/honor-grants', why: 'answers the board seat form', submit: { action: '/admin/honor-grants/board/set', fields: { member_key: 't1_paid', reason: 'Rendered style check board preview.' } } },
  { template: 'admin/members/confirm', viewer: 'admin', url: '/admin/members/member_persona_t1_paid', why: 'answers the tier correction form', submit: { action: '/admin/members/member_persona_t1_paid/tier', fields: { tier: 'tier2', reason: 'Rendered style check tier preview.' } } },
  { template: 'admin/clubs/confirm', viewer: 'admin', url: '/admin/clubs/club-crawlville-real', why: 'answers the hashtag correction form', submit: { action: '/admin/clubs/club-crawlville-real/hashtag', fields: { hashtag_slug: 'club_crawlville_renamed', reason: 'Rendered style check hashtag preview.' } } },
  { template: 'admin/club-leadership/demote-confirm', viewer: 'admin', url: `/admin/clubs/${R.leaderClubId}/leadership`, why: 'answers the demote form', submit: { action: `/admin/clubs/${R.leaderClubId}/leadership/demote`, fields: { reason: 'Rendered style check demote preview.' } } },
  { template: 'admin/historical-records/confirm', viewer: 'admin', url: '/admin/historical-records?q=Rendered%20Style%20Player%20A', why: 'answers the mark-deceased form', submit: { action: `/admin/historical-records/${R.playerAId}/deceased` } },
  { template: 'admin/event-results/confirm', viewer: 'admin', url: `/admin/events/${R.eventId}/results/entries/${R.resultEntryId}`, why: 'answers the result correction form', submit: { action: `/admin/events/${R.eventId}/results/entries/${R.resultEntryId}`, fields: { placement: '2', reason: 'Rendered style check correction preview.' } } },
  { template: 'admin/tags/confirm', viewer: 'admin', url: `/admin/tags?q=${R.retirableTag}`, why: 'answers the retire form', submit: { action: '/admin/tags/retire', fields: { reason: 'Rendered style check retire preview.' } } },
  { template: 'admin/work-queue/link-help-confirm', viewer: 'admin', url: '/admin/work-queue?category=membership', why: 'answers the link-help approve form', submit: { action: `/admin/work-queue/${R.linkHelpItemId}/link-help/approve`, fields: { target_legacy_member_id: R.linkHelpLegacyId } } },
  { template: 'admin/work-queue/dispute-revert-confirm', viewer: 'admin', url: '/admin/work-queue?category=membership', why: 'answers the dispute revert form', submit: { action: `/admin/work-queue/${R.disputeItemId}/link-help/dispute-revert`, fields: { target_legacy_member_id: R.disputedLegacyId, reason: 'Rendered style check revert preview.' } } },
  { template: 'clubs/leave-confirm', viewer: 'club-leader', url: `/members/${R.leaderSlug}`, why: 'answers the leave form', submit: { action: `/clubs/${R.leaderClubKey}/leave` }, signInPerWidth: [R.leaderSlug, R.leaderSlug] },
  { template: 'clubs/step-down-confirm', viewer: 'club-leader', url: `/members/${R.leaderSlug}`, why: 'answers the step-down form', submit: { action: `/clubs/${R.leaderClubKey}/step-down` }, signInPerWidth: [R.leaderSlug, R.leaderSlug] },
  // An unknown address writes nothing and gets the same page a known one does.
  { template: 'auth/password-forgot-sent', viewer: 'anonymous', url: '/password/forgot', why: 'answers the reset request form', submit: { action: '/password/forgot', fields: { email: 'rendered-style-nobody@example.com' } } },
  { template: 'auth/verify-result', viewer: 'anonymous', url: '/verify/rendered-style-unknown-token', why: 'answers the verify form; an unknown token is refused', submit: { action: '/verify' } },
  // A stub checkout session lives only in the running server, so only the real donate post makes one.
  { template: 'payments/checkout', viewer: 'member', url: '/donate', why: 'the donate form redirects to it', submit: { action: '/donate', fields: { amountChoice: 'custom', customAmount: '25.00' } } },
  { template: 'members/delete-account-done', viewer: 'member', url: `/members/${MEMBER}/delete`, why: 'answers the delete form, which ends the account', submit: { action: `/members/${MEMBER}/delete` }, signInPerWidth: [R.deletePhoneSlug, R.deleteDesktopSlug] },
];

/**
 * Pages measured in addition to the one the walk found for their view, because
 * they carry the longest real content a layout has to hold. A short row fits a
 * phone in any layout, so a check over ordinary rows proves nothing about the
 * long ones. The browser check seeds these rows itself (STRESS_* below).
 */
export const STRESS: readonly Reach[] = [
  { template: 'clubs/detail', viewer: 'anonymous', url: '/clubs/club_stress_longest', why: 'longest club name and website address' },
  { template: 'freestyle/trick-shell', viewer: 'anonymous', url: '/freestyle/tricks/stress_surging_ducking_paradox_symposium_whirls', why: 'longest unbreakable slug, name and notation' },
  { template: 'admin/audit-log/index', viewer: 'admin', url: '/admin/audit-log?entityType=member&entityId=member-stress-audit-metadata', why: 'longest unbreakable metadata preview' },
];

// The audit viewer's metadata preview is cut at 240 characters, and an object
// value renders as compact JSON with no space in it, so one unbroken run of 240
// characters is what a row can put on a phone-width card.
export const STRESS_AUDIT_ENTITY_ID = 'member-stress-audit-metadata';
export const STRESS_AUDIT_METADATA = { stress_object: { work_queue_item_id: 'wq_'.padEnd(260, '6cf7cba781334932b6e94447') } };

// The longest real values in the migrated data, measured from the built
// database: a club website address of 136 characters, mostly without break
// points (a social-media page with a long query string); a club name of 55; a
// trick slug and canonical name of 47 each; movement notation of 132. Each value
// below is built to exactly that length.
export const STRESS_LENGTHS = { clubUrl: 136, clubName: 55, trickSlug: 47, trickName: 47, notation: 132 } as const;
export const STRESS_CLUB_KEY = 'club_stress_longest';
export const STRESS_CLUB_URL = 'https://www.facebook.com/pages/Stress-City-BC/Stress-City-Footbag-Association/94501474233?ref=ts&__a=17&ajaxpipe=1&x='
  .padEnd(STRESS_LENGTHS.clubUrl, '9');
export const STRESS_CLUB_NAME = 'Greater Stress City Metropolitan Footbag Association of'.slice(0, STRESS_LENGTHS.clubName);
export const STRESS_TRICK_SLUG = 'stress_surging_ducking_paradox_symposium_whirls';
export const STRESS_TRICK_NAME = 'Stress Surging Ducking Paradox Symposium Whirls';
export const STRESS_TRICK_NOTATION = 'SET > STEPPING [BOD] > PARADOX [BOD] > BLURRY [BOD] > SPIN [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL] > OP TOE > SPIN [BOD] > DEX'
  .slice(0, STRESS_LENGTHS.notation);

/** Views the check does not measure, each with its reason. */
export const EXEMPT: Readonly<Record<string, string>> = {};

/** Every page view on disk, as the name a controller renders it by: partials and layouts are not pages. */
export function listPageTemplates(): string[] {
  return (fs.readdirSync(VIEWS_DIR, { recursive: true }) as string[])
    .map((rel) => rel.split(path.sep).join('/'))
    .filter((rel) => rel.endsWith('.hbs') && !rel.startsWith('partials/') && !rel.startsWith('layouts/'))
    .map((rel) => rel.slice(0, -'.hbs'.length))
    .sort();
}

/**
 * Paths the walk never requests: a switch or logout would change who the walk
 * is, a media file is not a page, and the job event stream never ends. Every GET
 * on the site is read-only by design, so walking links writes nothing.
 */
export function walkSkips(p: string): boolean {
  return p.startsWith('/dev/switch')
    || p.startsWith('/dev/build-claim')
    || p === '/logout'
    || p.startsWith('/media-store/')
    || /^\/admin\/curator\/upload\/jobs\/.+\/events$/.test(p)
    || /\.(?:css|js|png|jpe?g|gif|svg|webp|ico|txt|xml|json|pdf|mp4|webm)(?:\?|$)/.test(p);
}

/**
 * Groups URLs that almost certainly render the same view, so the walk does not
 * fetch every member profile to find the one view they share. A segment that
 * looks like an identifier (it carries an underscore or a digit, as slugs, ids
 * and years do) becomes `*`; route words are kept, hyphenated ones included
 * (`email-templates`), and so are the query parameter names.
 */
export function urlShape(url: string): string {
  const [pathname, query = ''] = url.split('?');
  const segs = pathname.split('/').filter(Boolean).map((s) => (/[_\d]/.test(s) ? '*' : s));
  const keys = [...new URLSearchParams(query).keys()].sort().join('&');
  return `/${segs.join('/')}${keys ? `?${keys}` : ''}`;
}

/** How many URLs of one shape the walk fetches before it stops looking there for a new view. */
export const URLS_PER_SHAPE = 3;
