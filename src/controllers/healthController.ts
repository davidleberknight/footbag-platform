import { Request, Response } from 'express';
import { operationsPlatformService } from '../services/operationsPlatformService';

export const healthController = {
  /**
   * GET /health/live
   * Process-only liveness probe. No DB involved, if this process can respond
   * to HTTP, it is alive.
   */
  live(_req: Request, res: Response): void {
    res.json({ ok: true, check: 'live' });
  },

  /**
   * GET /health/ready
   * Readiness probe. Delegates to OperationsPlatformService, which composes
   * the database probe and the container-memory pressure check. Returns
   * 200 if ready, 503 if not.
   *
   * Anonymous response carries only `{ ok, check }`. Per-check detail
   * (DB readiness, memory utilization percent) is deliberately omitted:
   * the endpoint is public (no auth gate; mounted before requireAuth),
   * and host telemetry surfaced to anonymous callers assists timing
   * attacks targeting peak-load windows. Operators rely on CloudWatch
   * (CWAgent publishes `mem_used_percent` as a host metric; the
   * readiness threshold aligns with it) for the same signal.
   */
  ready(_req: Request, res: Response): void {
    const status = operationsPlatformService.checkReadiness();
    res.status(status.isReady ? 200 : 503).json({
      ok: status.isReady,
      check: 'ready',
    });
  },
};
