import { Request, Response, NextFunction } from 'express';
import { systemHealthService } from '../services/systemHealthService';
import { logger } from '../config/logger';

/**
 * The alarm banner on every admin page.
 *
 * An administrator anywhere in the admin section sees, above the page, how many
 * platform alarms are waiting to be answered, with a link to the page that
 * answers them, and a second line when alarms cannot reach this application at
 * all because the worker that reads them has stopped. Nothing is stored for
 * this: both facts are read on the page draw, so the banner goes the moment the
 * condition behind it ends.
 *
 * The banner must never be the thing that takes the console down: a read that
 * fails leaves the page drawn without it and says so in the log, because the
 * page an administrator reaches during an incident is the page that matters.
 */
export function adminAlarmBanner(req: Request, res: Response, next: NextFunction): void {
  if (!res.locals.isAdmin || !(req.path === '/admin' || req.path.startsWith('/admin/'))) {
    next();
    return;
  }
  try {
    const banner = systemHealthService.getAdminAlarmBanner();
    if (banner) res.locals.adminAlarmBanner = banner;
  } catch (err) {
    logger.warn('admin_alarm_banner.unavailable', { errorClass: (err as Error)?.constructor?.name ?? 'unknown' });
  }
  next();
}
