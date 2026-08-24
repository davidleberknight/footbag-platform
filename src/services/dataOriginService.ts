/**
 * Whether the rows this process writes record real business or a rehearsal.
 *
 * Owns: the single synchronous answer to "is this platform doing real business
 * right now", and the boot-time resolution that makes that answer available
 * without I/O on the write path.
 *
 * Does not own: the per-payment live/test flag. A payment carries the
 * provider's own `provider_livemode`, which is stronger evidence about that one
 * charge than anything this process can infer, and stays authoritative for
 * money. This service answers the broader question for every other row.
 *
 * The discriminator is the go-live marker in the parameter store, which is the
 * boundary the destructive-deploy guard already treats as authoritative: before
 * it flips, production is being proven and everything written is a rehearsal
 * artifact; after it flips, production is carrying real member data and real
 * money. Nothing else in the platform records that boundary, so nothing else
 * can stamp a row honestly.
 *
 * Invariants preserved:
 *  - Fail closed. Only a marker positively reading live yields 'live'. An
 *    unread marker, an unreachable parameter store, an unrecognised value, or a
 *    process that never ran the boot resolution all yield 'unknown', never
 *    'live'. A row that is really test data mislabelled as real money is the
 *    failure this exists to prevent, and the audit ledger is append-only, so a
 *    wrong stamp can never be corrected afterwards.
 *  - Resolved once at boot, never on the write path. Audit rows are appended
 *    inside better-sqlite3 transactions, where `await` is a runtime crash, so
 *    the value must already be in memory by the time any row is written.
 *  - Environments below production are always 'test'. Their databases are never
 *    the production database, and their marker is absent by design.
 */
import { config } from '../config/env';
import { logger } from '../config/logger';
import { getSecretsAdapter } from '../adapters/secretsAdapter';

export type DataOrigin = 'live' | 'test' | 'unknown';

/**
 * Undefined until the boot resolution runs. Deliberately not defaulted to a
 * value: 'unknown' before resolution and 'unknown' after a failed resolution
 * mean the same thing to a reader, and both must never be 'live'.
 */
let resolved: DataOrigin | undefined;

/**
 * The marker is written by the go-live runbook step and read by the deploy
 * guard; it is not managed by Terraform, so this is its only in-application
 * read path.
 */
function goLiveMarkerName(): string {
  return `/footbag/${config.footbagEnv}/app/production_live`;
}

/**
 * Resolve once at process start, before any request is served or any worker
 * cycle runs. Safe to call more than once; later calls are no-ops so an entry
 * point that boots several subsystems cannot re-read the parameter store.
 *
 * Never throws. A failure here must not stop the process from serving: it
 * degrades the stamp to 'unknown', which reads as "not provably real" wherever
 * it is rendered, and that is the correct direction.
 */
export async function initDataOrigin(): Promise<DataOrigin> {
  if (resolved !== undefined) return resolved;

  if (config.footbagEnv !== 'production') {
    resolved = 'test';
    return resolved;
  }

  try {
    const raw = await getSecretsAdapter().getAbsolute(goLiveMarkerName());
    const value = raw?.trim();
    if (value === 'true') {
      resolved = 'live';
    } else if (value === 'false') {
      resolved = 'test';
      logger.warn(
        'Go-live marker reads pre-live; rows written by this process are stamped as test data.',
      );
    } else {
      resolved = 'unknown';
      logger.error(
        `Go-live marker is absent or unrecognised (got ${value === undefined ? 'no value' : `'${value}'`}); rows written by this process cannot be stamped as real data.`,
      );
    }
  } catch (err) {
    resolved = 'unknown';
    logger.error(
      `Go-live marker could not be read; rows written by this process cannot be stamped as real data: ${(err as Error).message}`,
    );
  }

  return resolved;
}

/**
 * The stamp to record on a row written now. Synchronous by contract, because
 * its callers run inside database transactions.
 */
export function currentDataOrigin(): DataOrigin {
  return resolved ?? 'unknown';
}

/**
 * Test seam. Production code never calls this; the boot resolution is the only
 * supported way to set the value in a running process.
 */
export function __setDataOriginForTests(value: DataOrigin | undefined): void {
  resolved = value;
}
