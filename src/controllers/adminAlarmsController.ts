import type { Request, Response, NextFunction } from 'express';
import { systemAlarmService } from '../services/systemAlarmService';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';
import { NotFoundError } from '../services/serviceErrors';

export const adminAlarmsController = {
  /** GET /admin/alarms */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let acknowledgedFlag = false;
      let alreadySettledFlag = false;
      if (flash?.kind === FLASH_KIND.ALARM_ACKNOWLEDGED) {
        acknowledgedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.ALARM_ALREADY_SETTLED) {
        alreadySettledFlag = true;
        clearFlash(res, req);
      }
      const page = Number.parseInt(String(req.query['page'] ?? '1'), 10);
      res.render('admin/alarms/index', systemAlarmService.getAlarmsPage({
        acknowledgedFlag,
        alreadySettledFlag,
        page: Number.isFinite(page) ? page : 1,
      }));
    } catch (err) {
      handleControllerError(err, res, next, 'admin alarms controller');
    }
  },

  /** POST /admin/alarms/:id/acknowledge */
  acknowledge(req: Request, res: Response, next: NextFunction): void {
    const alarmId = req.params['id'] ?? '';
    const note = typeof req.body?.note === 'string' ? req.body.note : null;
    try {
      // The service reports a no-op when the alarm was already taken or has
      // since cleared. Writing the success flash regardless tells the second
      // administrator they acknowledged something they did not.
      const result = systemAlarmService.acknowledge({
        alarmId, adminMemberId: req.user!.userId, note,
      });
      writeFlash(
        res, req,
        result.status === 'acknowledged'
          ? FLASH_KIND.ALARM_ACKNOWLEDGED
          : FLASH_KIND.ALARM_ALREADY_SETTLED,
        alarmId,
      );
      res.redirect(303, '/admin/alarms');
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/alarms/index', systemAlarmService.getAlarmsPage());
        return;
      }
      handleControllerError(err, res, next, 'admin alarms controller');
    }
  },
};
