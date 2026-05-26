/**
 * Tag suggest API controller.
 *
 * GET /api/tags/suggest?q=prefix
 *
 * Returns JSON array of matching tags, ordered by popularity. No auth
 * required (tags are public). Validates input length.
 */
import type { Request, Response } from 'express';
import { hashtagDiscoveryService } from '../services/hashtagDiscoveryService';

const MAX_PREFIX_LENGTH = 100;
const DEFAULT_LIMIT = 10;

export const tagSuggestController = {
  suggest(req: Request, res: Response): void {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length > MAX_PREFIX_LENGTH) {
      res.json([]);
      return;
    }
    const results = hashtagDiscoveryService.suggestTags(q, DEFAULT_LIMIT);
    res.json(results);
  },
};
