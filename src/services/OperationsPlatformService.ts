import { health } from '../db/db';
import { runSqliteRead } from './sqliteRetry';

export interface ReadinessStatus {
  isReady: boolean;
  checks: {
    database: {
      isReady: boolean;
    };
  };
}

/**
 * MVFP-scoped operations service surface.
 *
 * Readiness composition belongs here, not in db.ts. For this slice the only
 * implemented dependency check is the minimal DB probe from db.ts.
 */
export class OperationsPlatformService {
  checkReadiness(): ReadinessStatus {
    try {
      const row = runSqliteRead('checkReadiness', () =>
        health.checkReady.get() as { is_ready: number } | undefined,
      );

      const databaseReady = row?.is_ready === 1;

      return {
        isReady: databaseReady,
        checks: {
          database: {
            isReady: databaseReady,
          },
        },
      };
    } catch {
      return {
        isReady: false,
        checks: {
          database: {
            isReady: false,
          },
        },
      };
    }
  }
}

export const operationsPlatformService = new OperationsPlatformService();
