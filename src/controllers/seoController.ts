import { Request, Response } from 'express';
import { siteMetaService } from '../services/siteMetaService';

export const seoController = {
  /** GET /robots.txt -- crawl policy (allow-all in production, disallow-all elsewhere). */
  robots(_req: Request, res: Response): void {
    res.type('text/plain; charset=utf-8').send(siteMetaService.buildRobotsTxt());
  },

  /** GET /sitemap.xml -- absolute URLs for every public, indexable page. */
  sitemap(_req: Request, res: Response): void {
    res.type('application/xml; charset=utf-8').send(siteMetaService.buildSitemapXml());
  },

  /** GET /llms.txt -- Markdown site map for AI agents. */
  llms(_req: Request, res: Response): void {
    res.type('text/markdown; charset=utf-8').send(siteMetaService.buildLlmsTxt());
  },
};
