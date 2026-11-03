/**
 * Tag suggest API controller.
 *
 * GET /tags/suggest?q=prefix[&entry=1]
 * GET /tags/suggest?didYouMean=<typed hashtag>
 *
 * Returns a JSON array of matching tags. No auth required (tags, events and
 * clubs are public; no member is ever matched). The service bounds the input.
 * `entry=1` marks a field where a member applies tags, which leaves out the
 * tags only the platform applies. `didYouMean` returns the one event or club
 * standard hashtag a typed freeform one most likely meant, or an empty array.
 */
import type { Request, Response } from 'express';
import { hashtagDiscoveryService } from '../services/hashtagDiscoveryService';

export const tagSuggestController = {
  suggest(req: Request, res: Response): void {
    if (typeof req.query.didYouMean === 'string') {
      const hit = hashtagDiscoveryService.didYouMean(req.query.didYouMean);
      res.json(hit ? [hit] : []);
      return;
    }
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const entry = req.query.entry === '1';
    res.json(hashtagDiscoveryService.suggestTags(q, 10, { entry }));
  },
};
