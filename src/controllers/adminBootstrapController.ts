import { Request, Response, NextFunction } from 'express';
import { adminBootstrapService } from '../services/adminBootstrapService';
import { RateLimitedError } from '../services/serviceErrors';
import { PageViewModel } from '../types/page';

/**
 * Single-shot first-admin bootstrap claim. Reachable by any SIGNED-IN
 * member (the claimant is by definition not yet an admin), registered
 * above the admin router's requireAdmin gate. The result page is identical
 * for every failure shape (no token provisioned, wrong token) so the
 * endpoint reveals nothing about the bootstrap state.
 */
interface BootstrapClaimContent {
  // Pre-shaped from the service's result code so the template branches on
  // booleans only.
  isGranted: boolean;
  isInvalid: boolean;
}

function render(res: Response, result: 'granted' | 'invalid' | null, status = 200): void {
  res.status(status).render('admin/bootstrap-claim', {
    seo:  { title: 'Administrator bootstrap' },
    page: { sectionKey: '', pageKey: 'admin_bootstrap_claim', title: 'Administrator bootstrap' },
    content: { isGranted: result === 'granted', isInvalid: result === 'invalid' },
  } satisfies PageViewModel<BootstrapClaimContent>);
}

export const adminBootstrapController = {
  getClaim(_req: Request, res: Response): void {
    render(res, null);
  },

  async postClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminBootstrapService.claimBootstrapAdmin(
        req.user!.userId,
        String(req.body.token ?? ''),
        req.ip ?? 'unknown',
      );
      render(res, result.status, result.status === 'granted' ? 200 : 422);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        render(res, 'invalid', 429);
        return;
      }
      next(err);
    }
  },
};
