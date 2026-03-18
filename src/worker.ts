/**
 * Worker entry point — stub, no active jobs.
 *
 * Background jobs (email outbox, DB backup, cleanup, etc.) are deferred.
 * This file exists so the worker container has a valid entry point and the
 * compose stack can start without errors.
 *
 * When job processing is implemented, OperationsPlatformService will own the
 * job catalog and scheduler integration.
 */
import 'dotenv/config';
import { logger } from './config/logger';

logger.info('worker started', { note: 'no jobs configured — exiting cleanly' });
process.exit(0);
