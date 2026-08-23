/**
 * One-click unsubscribe endpoint. A mail client fires this from the
 * `List-Unsubscribe` headers on a bulk message, with no session and no Origin
 * header, so the signed token in the query string is the whole of the
 * authority. RFC 8058 wants a POST and a 2xx; the mail client reads the status
 * and shows its own confirmation, so there is no page to render.
 */
import { Request, Response, NextFunction } from 'express';
import { emailSubscriptionService } from '../services/emailSubscriptionService';

export const emailPreferenceController = {
  postOneClickUnsubscribe(req: Request, res: Response, next: NextFunction): void {
    try {
      const token = typeof req.query.t === 'string' ? req.query.t : '';
      emailSubscriptionService.unsubscribeByToken(token);
      // Every outcome answers alike. A mail provider learns nothing about
      // whether an address, a member, or a subscription exists, so the endpoint
      // cannot be turned into a membership probe, and a client that fires twice
      // sees the same success both times.
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
};
