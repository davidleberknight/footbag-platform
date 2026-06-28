import { Request, Response, NextFunction } from 'express';
import { memberOnboardingService } from '../services/memberOnboardingService';

// The membership-completion gate. A verified member who has not finished the
// required onboarding fields (personal_details populated AND the legacy_claim
// decision made) is not yet a full member: every member-capability surface
// under /members/ and /clubs/ redirects them to the next outstanding wizard
// task. Public BROWSE stays reachable mid-onboarding (the clubs list at /clubs,
// and these /members/ pages: own/any profile read, profile and password edit,
// contact-admin, and the legacy-claim anchor and auto-link affordances the
// wizard itself links to). Admin pages carry their own requireAdmin gate; a
// member holds the admin role only at or after onboarding completes (the
// one-off bootstrap seeds the first admin; every later grant targets an
// existing full member), so an admin reaching an admin page is already
// onboarded and ordinary admin gating governs it. Once both required tasks are
// completed the gate is a no-op and ordinary tier and admin gating governs
// every downstream request.
// The /edit entry intentionally matches sub-paths too (e.g. the password edit
// at /edit/password), so it has no end anchor. Member-capability flows reached
// outside /members/ and /clubs/ (such as the historical-person claim under
// /history/) are never fenced here: claiming is part of finishing onboarding,
// so the wizard depends on those routes staying open mid-onboarding.
const UNGATED_PATTERNS = [
  /^\/members\/[^/]+$/,
  /^\/members\/[^/]+\/edit/,
  /^\/members\/[^/]+\/contact-admin/,
  /^\/members\/[^/]+\/anchors\//,
  /^\/members\/me\/auto-link\//,
];

// originalUrl is never prefix-stripped by router mounting, so the gate reads
// the true path (/members/..., /clubs/...) on the public router where it is
// mounted, rather than a path stripped of a mount prefix.
function gatedPath(req: Request): string {
  return (req.originalUrl || req.url).split('?')[0];
}

function isUngated(path: string): boolean {
  const fenced =
    path.startsWith('/members/') ||
    path.startsWith('/clubs/');
  if (!fenced) return true;
  for (const pattern of UNGATED_PATTERNS) {
    if (pattern.test(path)) return true;
  }
  return false;
}

function nextPendingWizardHref(memberId: string): string {
  const next = memberOnboardingService.nextOutstandingTaskType(memberId);
  return next ? `/register/wizard/${next}` : '/register/wizard/personal_details';
}

export function requireOnboardingComplete(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { next(); return; }
  if (isUngated(gatedPath(req))) { next(); return; }
  if (memberOnboardingService.isOnboardingComplete(req.user.userId)) { next(); return; }
  res.redirect(303, nextPendingWizardHref(req.user.userId));
}
