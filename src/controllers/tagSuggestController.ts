/**
 * Tag suggest API controller.
 *
 * GET /tags/suggest?q=prefix
 *
 * Returns JSON array of matching tags, ordered by popularity. No auth
 * required (tags are public). The service bounds the prefix.
 */
import type { Request, Response } from 'express';
import { hashtagDiscoveryService } from '../services/hashtagDiscoveryService';

export const tagSuggestController = {
  suggest(req: Request, res: Response): void {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(hashtagDiscoveryService.suggestTags(q));
  },
};
