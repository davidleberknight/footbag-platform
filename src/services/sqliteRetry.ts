import { ServiceUnavailableError } from './serviceErrors';

/**
 * SQLite read/write execution helpers for services.
 *
 * Design note:
 * - better-sqlite3 plus PRAGMA busy_timeout already provides the main contention
 *   waiting behavior for this project.
 * - This helper intentionally does not add another application-level retry loop.
 * - It exists to keep service error mapping explicit and centralized.
 */
interface SqliteLikeError {
  code?: unknown;
  message?: unknown;
}

function getSqliteErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const code = (error as SqliteLikeError).code;
  return typeof code === 'string' ? code : null;
}

export function isBusyOrLockedSqliteError(error: unknown): boolean {
  const code = getSqliteErrorCode(error);
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED';
}

export function runSqliteRead<T>(operationName: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (isBusyOrLockedSqliteError(error)) {
      throw new ServiceUnavailableError(`${operationName} is temporarily unavailable.`, {
        sqliteCode: getSqliteErrorCode(error),
      });
    }

    throw error;
  }
}
