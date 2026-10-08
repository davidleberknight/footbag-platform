import { Request, Response, NextFunction } from 'express';
import { equipmentService } from '../services/equipmentService';
import { handleControllerError } from '../lib/controllerErrors';

export const equipmentController = {
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = equipmentService.getEquipmentPage();
      res.render('equipment/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'equipment controller');
    }
  },
};
