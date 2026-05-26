import { Request, Response, NextFunction } from 'express';
import { memberOnboardingService } from '../services/memberOnboardingService';

const UNGATED_PREFIXES = [
  '/register/wizard',
  '/login',
  '/logout',
  '/register',
  '/verify',
  '/password',
  '/auto-link/report-incorrect',
  '/health',
  '/ipc',
  '/internal',
  '/tags/suggest',
  '/legal',
];

const UNGATED_PATTERNS = [
  /^\/members\/[^/]+$/,
  /^\/members\/[^/]+\/edit/,
  /^\/members\/[^/]+\/contact-admin/,
  /^\/members\/[^/]+\/anchors\//,
  /^\/members\/me\/auto-link\//,
  /^\/history\/[^/]+\/claim/,
  /^\/history\/[^/]+$/,
];

function isUngated(path: string): boolean {
  if (!path.startsWith('/members/') && !path.startsWith('/clubs/')) return true;
  for (const prefix of UNGATED_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  for (const pattern of UNGATED_PATTERNS) {
    if (pattern.test(path)) return true;
  }
  return false;
}

function nextPendingWizardHref(memberId: string): string {
  const tasks = memberOnboardingService.getTaskWidget(memberId);
  if (tasks.length > 0) return `/register/wizard/${tasks[0].taskType}`;
  return '/register/wizard/personal_details';
}

export function requireOnboardingComplete(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { next(); return; }
  if (isUngated(req.path)) { next(); return; }
  if (memberOnboardingService.isOnboardingComplete(req.user.userId)) { next(); return; }
  res.redirect(303, nextPendingWizardHref(req.user.userId));
}
