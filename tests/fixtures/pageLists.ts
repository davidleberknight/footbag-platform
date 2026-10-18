/**
 * Which page the rendered-style browser check measures for each view.
 *
 * The check finds most pages itself: it seeds the crawl corpus, walks the site
 * by links as each viewer below, and keeps the first page that names each view
 * in its development-only response header. A view the walk cannot reach (a page
 * that exists only after a form posts, or one a link never points at) is listed
 * in REACH with the URL that renders it, or in EXEMPT with the reason it is not
 * measured. A page view that is in none of the three fails the check, so a new
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
  netTeamId: 'net-team-rs',
  memberGalleryId: 'gallery_rs_member',
  memberMediaId: 'media_rs_member',
  recurringSubscriptionId: 'sub_rs_member',
  curatorMediaId: 'media-curator-rs',
  curatorJobId: 'mj-rs',
  checkoutSessionId: 'cs_rs_member',
} as const;

/** A view the walk cannot reach, with the viewer and URL that render it. */
export interface Reach { template: string; viewer: string; url: string; why: string }

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
  { template: 'admin/event-organizers/queue', viewer: 'admin', url: '/admin/events/organizers', why: 'linked from the work queue only when organizer requests wait' },
  { template: 'admin/event-organizers/detail', viewer: 'admin', url: `/admin/events/${R.eventId}/organizers`, why: 'linked from the organizer queue' },
  { template: 'admin/curator/edit', viewer: 'admin', url: `/admin/curator/media/${R.curatorMediaId}/edit`, why: 'linked from curated media the walk groups together' },
  { template: 'admin/curator/job-status', viewer: 'admin', url: `/admin/curator/upload/jobs/${R.curatorJobId}`, why: 'reached by redirect after an upload starts' },
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
];

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
const POSTED = 'rendered only as the answer to a form post, which the read-only walk never sends';
export const EXEMPT: Readonly<Record<string, string>> = {
  'admin/admin-roles/grant-confirm': POSTED,
  'admin/admin-roles/revoke-confirm': POSTED,
  'admin/club-leadership/demote-confirm': POSTED,
  'admin/clubs/confirm': POSTED,
  'admin/historical-records/confirm': POSTED,
  'admin/honor-grants/action-confirm': POSTED,
  'admin/honor-grants/grant-confirm': POSTED,
  'admin/members/confirm': POSTED,
  'admin/tags/confirm': POSTED,
  'admin/work-queue/link-help-confirm': POSTED,
  'auth/password-forgot-sent': POSTED,
  'auth/verify-result': POSTED,
  'clubs/leave-confirm': POSTED,
  'clubs/step-down-confirm': POSTED,
  'members/delete-account-done': POSTED,
  'payments/checkout': 'needs a checkout session, which only the donate form post creates',
  'history/claim-hp-confirm': 'needs a registrant whose claim lookup matches a historical record; the legacy-claim browser spec drives it',
  'history/claim-hp-conflict': 'needs a historical record another member has already claimed; the claim route tests cover it',
  'admin/broadcasts/detail': 'needs a sent broadcast, which only the compose form send creates and no row factory builds',
  'admin/payments/report': 'needs a reconciliation run, which only the scheduled reconciliation job writes',
  'admin/freestyle-notation-author': 'needs a notation-backlog candidate derived from the full freestyle dictionary',
  'admin/freestyle-trick-publish': 'needs a notation-backlog candidate derived from the full freestyle dictionary',
};

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
