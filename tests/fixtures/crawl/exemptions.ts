/**
 * Typed, reasoned exemptions for the crawls.
 *
 * An exemption is never a silent skip: each names its reason class and says in
 * a sentence why the route cannot be reached or why the finding stands. Every
 * exemption must still match something on every run; one that matches nothing
 * is stale and fails, so a fixed defect or a newly reachable route sheds its
 * exemption instead of leaving a hole for the next route that takes its name.
 *
 * A `known-defect` exemption records a real defect the crawl found and leaves
 * the oracle in place for every other page: it names the page, the defect and
 * what a visitor meets, and is deleted by the change that fixes it.
 */
import type { ExemptionReason, Finding, OracleName, RouteExemption } from './oracles';

export interface FindingExemption {
  oracle: OracleName;
  /** The page (or target) the finding is about. */
  url: RegExp;
  /** The finding's problem text. */
  problem: RegExp;
  /** Where the target was found, when the defect is in the page that rendered it. */
  via?: RegExp;
  reason: Extract<ExemptionReason, 'known-defect' | 'harness-by-design'>;
  why: string;
}

/**
 * Split findings into those an exemption covers and those that stand, and
 * report which exemptions matched nothing.
 */
export function applyFindingExemptions(
  findings: readonly Finding[],
  exemptions: readonly FindingExemption[],
): { open: Finding[]; stale: FindingExemption[] } {
  const used = new Set<FindingExemption>();
  const open: Finding[] = [];
  for (const f of findings) {
    const ex = exemptions.find((e) => e.oracle === f.oracle && e.url.test(f.url) && e.problem.test(f.problem)
      && (!e.via || e.via.test(f.via)));
    if (ex) used.add(ex);
    else open.push(f);
  }
  return { open, stale: exemptions.filter((e) => !used.has(e)) };
}

// The public pages that render no meta description today, each an exact path
// (with any query), so a new page without one is still caught.
const NO_DESCRIPTION_PAGES = [
  '', 'bap', 'clubs', 'clubs/usa', 'clubs/club_crawlville', 'events', 'freestyle/media', 'hof',
  'ifpa', 'ifpa/articles', 'ifpa/bylaws', 'ifpa/membership-structure', 'login', 'media',
  'media/browse', 'media/member-galleries', 'media/gallery_[a-z0-9_]+', 'members/canary_shown',
  'net', 'password/forgot', 'records', 'register', 'rules', 'rules/[a-z]+/[a-z0-9-]+', 'sideline',
  'media/item/[A-Za-z0-9_]+', 'media/gallery_[a-z0-9_]+/[A-Za-z0-9_]+',
];

/** Findings the full crawls raise today that are recorded rather than fixed here. */
export const CRAWL_FINDING_EXEMPTIONS: readonly FindingExemption[] = [
  {
    oracle: 'seo', reason: 'known-defect',
    url: new RegExp(`^/(?:${NO_DESCRIPTION_PAGES.join('|')})(?:\\?.*)?$`),
    problem: /^public page has no meta description$/,
    why: 'These public pages render no meta description, so a search result shows whatever text '
      + 'the engine scrapes; the search-engine readiness standard requires one on every public page.',
  },
  {
    oracle: 'markup', reason: 'known-defect',
    url: /^\/admin\/club-cleanup$/,
    problem: /^input-missing-label /,
    why: 'The club cleanup queue renders its per-row selects and inputs with no associated label, '
      + 'so a screen reader announces unnamed controls.',
  },
  {
    oracle: 'markup', reason: 'known-defect',
    url: /^\/admin\/freestyle\/consecutive-records$/,
    problem: /^unique-landmark /,
    why: 'The consecutive-records admin page renders two landmarks of the same kind with no '
      + 'distinguishing name, so landmark navigation cannot tell them apart.',
  },
  {
    oracle: 'markup', reason: 'known-defect',
    url: /^\/media\/(?:item|gallery_[a-z0-9_]+)\/[A-Za-z0-9_]+(?:\?.*)?$/,
    problem: /^unique-landmark /,
    why: 'The media item viewer renders its pager as a second navigation landmark with no '
      + 'distinguishing name, so landmark navigation cannot tell it from the site navigation.',
  },
  {
    oracle: 'seo', reason: 'harness-by-design',
    url: /^\/dev\/personas$/,
    problem: /^public page has no meta description$/,
    why: 'The persona catalog is development and staging test scaffolding, never served in '
      + 'production and kept out of every index, so it carries no search description.',
  },
  {
    oracle: 'shown-but-refused', reason: 'harness-by-design',
    url: /^\/dev\/login\?as=(?:deceased|del_grace_elapsed|del_grace_open|unverified)$/,
    problem: /^signed-in persona redirected to log in/,
    why: 'The persona catalog offers a login link for each persona whose login is refused, so a '
      + 'tester can see the refusal; landing on the login page is the behaviour being shown.',
  },
];

/** Duplicate-title findings across the anonymous crawl, recorded rather than fixed here. */
export const TITLE_FINDING_EXEMPTIONS: readonly FindingExemption[] = [
  {
    oracle: 'seo', reason: 'known-defect',
    url: /^\/media\/gallery_[a-z0-9_]+\/[A-Za-z0-9_]+$/,
    problem: /^title "[^"]*" shared by 2 pages: \/media\/gallery_[a-z0-9_]+\/[A-Za-z0-9_]+, \/media\/item\/[A-Za-z0-9_]+\?/,
    why: 'A media item reached through a named gallery and through a tag query is two pages with '
      + 'two canonical addresses and one title, so a search engine indexes the same item twice.',
  },
];

/** Findings only the persona sweep raises, recorded rather than fixed here. */
export const SWEEP_FINDING_EXEMPTIONS: readonly FindingExemption[] = [];

/** Sitemap findings recorded rather than fixed here. */
export const SITEMAP_FINDING_EXEMPTIONS: ReadonlyArray<{ entry: RegExp; problem: RegExp; reason: 'known-defect'; why: string }> = [];

function group(reason: ExemptionReason, why: string, keys: string[]): RouteExemption[] {
  return keys.map((k) => {
    const [method, ...rest] = k.split(' ');
    return { method, path: rest.join(' '), reason, why };
  });
}

/** Served routes the full crawls cannot reach, each with its reason. */
export const ROUTE_EXEMPTIONS: readonly RouteExemption[] = [
  ...group('machine-caller',
    'Called by a machine with its own authority (a signed provider webhook, the internal job hook, '
    + 'or a mail client\'s one-click unsubscribe), never by a rendered link or form.', [
      'POST /ipc/job-events', 'POST /payments/webhook', 'POST /email/unsubscribe',
    ]),
  ...group('script-requested',
    'Requested by page script (suggestion lookups, the direct-upload signing and finalize calls, '
    + 'and the upload job status poll), never rendered as a link or form.', [
      'GET /tags/suggest', 'GET /freestyle/search/suggest',
      'POST /admin/curator/upload/sign', 'POST /admin/curator/upload/finalize',
      'GET /admin/curator/upload/jobs/:jobId',
    ]),
  ...group('event-stream', 'A server-sent event stream that never ends, so a walk cannot read it.', [
    'GET /admin/curator/upload/jobs/:jobId/events',
  ]),
  ...group('session-ending', 'Ends the crawling persona\'s session, so the walk never follows it.', [
    'POST /logout',
  ]),
  ...group('probed-directly',
    'Re-seeds every persona, so the walk skips it and a dedicated case in this suite probes it.', [
      'POST /dev/personas/refresh',
    ]),
  ...group('compatibility-redirect', 'A permanent redirect from a retired address; nothing current links to it.', [
    'GET /tags', 'GET /freestyle/insights', 'GET /freestyle/families',
  ]),
  ...group('mailed-token',
    'Reached only from a link mailed to the member carrying a one-time token; no crawl seeds a captured message.', [
      'GET /verify/:token', 'POST /verify/resend', 'GET /password/reset/:token', 'POST /password/reset/:token',
      'GET /members/:memberKey/download/:token',
    ]),
  ...group('harness-by-design',
    'The captured-mail viewer is test scaffolding the persona catalog names in its instructions '
    + 'rather than links; a tester opens it by address.', [
      'GET /dev/outbox',
    ]),
  ...group('valid-submission-only',
    'The form is rendered only on the page a valid first submission returns (a confirmation step, a '
    + 'checkout, a registration acknowledgement); the empty-body probe stops at validation.', [
      'POST /admin/admin-roles/grant/confirm', 'POST /admin/admin-roles/:memberId/revoke/confirm',
      'POST /admin/honor-grants/grant/confirm', 'POST /admin/honor-grants/remove/confirm',
      'POST /admin/honor-grants/board/set/confirm', 'POST /admin/honor-grants/board/remove/confirm',
      'POST /admin/members/:memberId/name/confirm', 'POST /admin/members/:memberId/slug/confirm',
      'POST /admin/members/:memberId/tier/confirm', 'POST /admin/members/:memberId/active-player/confirm',
      'POST /admin/members/:memberId/profile/confirm', 'POST /admin/members/:memberId/avatar/remove/confirm',
      'POST /admin/members/:memberId/deceased/confirm', 'POST /admin/members/:memberId/deceased/revert/confirm',
      'POST /admin/historical-records/:personId/deceased/confirm',
      'POST /admin/historical-records/:personId/deceased/revert/confirm',
      'POST /admin/work-queue/:id/link-help/approve/confirm',
      'POST /admin/clubs/:clubId/content/confirm', 'POST /admin/clubs/:clubId/hashtag/confirm',
      'POST /admin/clubs/:clubId/leadership/demote/confirm', 'POST /admin/tags/retire/confirm',
      'POST /history/:personId/claim/confirm', 'GET /register/check-email',
      'GET /payments/success', 'GET /payments/cancel', 'GET /payments/checkout/:sessionId',
      'POST /payments/checkout/:sessionId/confirm', 'POST /payments/checkout/:sessionId/cancel',
      'POST /payments/checkout/:sessionId/decline', 'GET /register/wizard/complete',
    ]),
  ...group('unlinked-page',
    'A served page that no rendered page links to, reachable only by typing its address.', [
      'GET /freestyle/tricks/:add(\\d+)', 'GET /admin/freestyle/notation-backlog',
      'GET /admin/freestyle/notation-drafts',
    ]),
  ...group('fixture-gap',
    'The crawl fixture seeds no row or state that renders a link or form to this route (no '
    + 'avatar, deceased record, work-queue item of this kind, payment report, flagged media, curator '
    + 'media, trick tip, notation candidate, net team, past event, recurring donation, '
    + 'organizer task, archive configuration, claimable record, or second club for the persona).', [
      'POST /admin/members/:memberId/avatar/remove', 'POST /admin/members/:memberId/deceased/revert',
      'POST /admin/historical-records/:personId/deceased', 'POST /admin/historical-records/:personId/deceased/revert',
      'POST /admin/work-queue/:id/resolve', 'POST /admin/work-queue/:id/dismiss', 'POST /admin/work-queue/:id/unpark',
      'POST /admin/work-queue/:id/link-help/dispute-revert',
      'GET /admin/payments/reports/:runId', 'POST /admin/payments/reconciliation/:issueId/resolve',
      'POST /admin/email-log/:id/review', 'POST /admin/alarms/:id/acknowledge', 'GET /admin/broadcasts/:id',
      'GET /admin/events/organizers', 'GET /admin/events/:eventId/organizers',
      'POST /admin/events/:eventId/organizers/assign', 'POST /admin/events/:eventId/organizers/remove',
      'POST /admin/clubs/:clubId/content', 'POST /admin/clubs/:clubId/hashtag',
      'POST /admin/clubs/:clubId/leadership/demote', 'POST /admin/tags/retire',
      'GET /admin/freestyle/notation-backlog/:candidateId/author',
      'POST /admin/freestyle/notation-backlog/:candidateId/author',
      'GET /admin/freestyle/notation-backlog/:candidateId/publish',
      'POST /admin/freestyle/notation-backlog/:candidateId/publish',
      'POST /admin/freestyle/tips/:id/edit', 'POST /admin/freestyle/tips/:id/order',
      'POST /admin/freestyle/tips/:id/hide', 'POST /admin/freestyle/tips/:id/restore',
      'POST /admin/freestyle/tips/:id/remap',
      'GET /admin/curator/media/:id/edit', 'POST /admin/curator/media/:id/edit', 'POST /admin/curator/media/:id/delete',
      'POST /admin/media-flags/flags/:flagId/clear', 'POST /admin/media-flags/:mediaId/delete',
      'POST /admin/media-flags/:mediaId/no-action', 'POST /admin/media-flags/:mediaId/flag',
      'POST /admin/media-flags/:mediaId/retry-removal',
      'GET /archive', 'POST /clubs/swap-primary', 'POST /clubs/:key/volunteer', 'POST /clubs/:key/reactivate',
      'POST /clubs/:key/hashtag',
      'GET /net/events', 'GET /net/teams', 'GET /net/teams/:teamId',
      'GET /events/year/:year', 'GET /events/:eventKey',
      'GET /history/:personId/claim', 'POST /members/:memberKey/vouch',
      'GET /members/:memberKey/recurring-donations/:stripeSubscriptionId/cancel',
      'POST /members/:memberKey/recurring-donations/:stripeSubscriptionId/cancel',
      'GET /members/:memberKey/galleries/:id/edit', 'POST /members/:memberKey/galleries/:id/edit',
      'POST /members/:memberKey/galleries/:id/delete',
      'GET /members/:memberKey/media/:mediaId/edit', 'POST /members/:memberKey/media/:mediaId/edit',
      'POST /members/:memberKey/media/:mediaId/delete',
      'POST /register/wizard/legacy_claim/claim', 'POST /register/wizard/legacy_claim/claim-with-surname',
      'POST /register/wizard/legacy_claim/birth-date',
      'POST /register/wizard/club_affiliations/submit', 'POST /register/wizard/club_affiliations/none',
    ]),
];

/**
 * Private values no crawled page renders to anyone in their audience, so their
 * positive control cannot run in this fixture; the leak check still guards
 * every page against them.
 */
export const CANARY_CONTROL_EXEMPTIONS: ReadonlyArray<{ field: string; reason: 'fixture-gap'; why: string }> = [
  {
    field: 'birth date', reason: 'fixture-gap',
    why: 'A member\'s birth date renders only as claim evidence on an administrator\'s link-help card, '
      + 'which needs a pending claim against an old account the fixture does not seed.',
  },
  {
    field: 'declared former surname', reason: 'fixture-gap',
    why: 'Declared anchors render only inside the claim step of the wizard and on claim evidence, '
      + 'neither of which the fixture reaches for the canary member.',
  },
  {
    field: 'declared old email', reason: 'fixture-gap',
    why: 'Declared anchors render only inside the claim step of the wizard and on claim evidence, '
      + 'neither of which the fixture reaches for the canary member.',
  },
];
