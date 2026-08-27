/**
 * /ipc: shared-secret-gated inter-process channel between containers.
 *
 * Today this hosts only the worker→web job-event channel. It is machine-only:
 * a shared secret authenticates the caller and no human session is involved,
 * which is what separates it from every admin surface, where a signed-in
 * administrator is the whole point.
 *
 * Auth happens inside the controller because shared-secret is the only
 * required signal here; no member-session middleware applies.
 */
import { Router } from 'express';
import { ipcController } from '../controllers/ipcController';

export const ipcRouter = Router();

ipcRouter.post('/job-events', ipcController.receiveJobEvent);
