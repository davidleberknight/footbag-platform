import { Request, Response, NextFunction } from 'express';
import { memberOnboardingService } from '../services/memberOnboardingService';

// The onboarding gate covers ONLY /members/ and /clubs/ paths; everything
// else passes untouched. Within the gated scope, these /members/ pages stay
// reachable mid-onboarding (own profile, edit, contact-admin, anchors, and
// the auto-link affordances the wizard itself links to).
const UNGATED_PATTERNS = [
  /^\/members\/[^/]+$/,
  /^\/members\/[^/]+\/edit/,
  /^\/members\/[^/]+\/contact-admin/,
  /^\/members\/[^/]+\/anchors\//,
  /^\/members\/me\/auto-link\//,
];

function isUngated(path: string): boolean {
  if (!path.startsWith('/members/') && !path.startsWith('/clubs/')) return true;
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
  if (isUngated(req.path)) { next(); return; }
  if (memberOnboardingService.isOnboardingComplete(req.user.userId)) { next(); return; }
  res.redirect(303, nextPendingWizardHref(req.user.userId));
}
