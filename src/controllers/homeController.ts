import { Request, Response } from 'express';

export const homeController = {
  /**
   * GET /
   * Public home landing page.
   */
  home(_req: Request, res: Response): void {
    res.render('public/home', {});
  },
};
