/**
 * /ipc: shared-secret-gated inter-process channel between containers.
 *
 * Today this hosts only the worker→web job-event channel. Distinct from the
 * /internal mount, which is human-facing admin QC tooling (session auth);
 * /ipc is machine-only (shared-secret auth, no human session).
 *
 * Auth happens inside the controller because shared-secret is the only
 * required signal here; no member-session middleware applies.
 */
import { Router } from 'express';
import { ipcController } from '../controllers/ipcController';

export const ipcRouter = Router();

ipcRouter.post('/job-events', ipcController.receiveJobEvent);
