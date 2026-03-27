import { Request, Response } from 'express';
import { homeService } from '../services/homeService';

export const homeController = {
  /**
   * GET /
   * Public home landing page.
   */
  home(_req: Request, res: Response): void {
    const vm = homeService.getPublicHomePage(new Date().toISOString());
    res.render('public/home', vm);
  },
};
