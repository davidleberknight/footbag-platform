/**
 * Tag suggest API controller.
 *
 * GET /tags/suggest?q=prefix[&entry=1]
 *
 * Returns JSON array of matching tags, ordered by popularity. No auth
 * required (tags are public). The service bounds the prefix. `entry=1` marks
 * a field where a member applies tags, which leaves out the tags only the
 * platform applies.
 */
import type { Request, Response } from 'express';
import { hashtagDiscoveryService } from '../services/hashtagDiscoveryService';

export const tagSuggestController = {
  suggest(req: Request, res: Response): void {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const entry = req.query.entry === '1';
    res.json(hashtagDiscoveryService.suggestTags(q, 10, { entry }));
  },
};
