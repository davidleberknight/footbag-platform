import { Request, Response, NextFunction } from 'express';
import { netService } from '../services/netService';
import { handleControllerError } from '../lib/controllerErrors';

export const netController = {
  /** GET /net */
  homePage(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getNetHomePage();
      res.render('net/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'net controller');
    }
  },

};
