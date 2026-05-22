/**
 * The sanctioned pattern for "we just hit an operational failure that an
 * operator must be told about." Folds two writes into one call:
 *
 *   1. An audit_entries forensic row (durable record in the DB).
 *   2. A logger.error() marker line (operator alert path via CloudWatch +
 *      SNS in staging/prod; suite-fail signal via the spy in tests/setup-env).
 *
 * Throw / swallow is the caller's contract: this function does not throw.
 * Anti-enumeration sites (requestPasswordReset) swallow; everywhere else
 * the catch block re-throws so the controller renders 503.
 */
import { appendAuditEntry, type AuditActorType } from './auditService';
import { logger } from '../config/logger';

export interface OperationalErrorParams {
  // Convention: must end in '_failed'. Enforced at runtime.
  actionType: string;
  category: string;
  entityType: string;
  entityId: string;
  reasonText: string;
  cause: unknown;
  metadata?: Record<string, unknown>;
  actorMemberId?: string | null;
  actorType?: AuditActorType;
}

export function recordOperationalError(p: OperationalErrorParams): void {
  if (!p.actionType.endsWith('_failed')) {
    throw new Error(
      `recordOperationalError: actionType must end in '_failed', got '${p.actionType}'`,
    );
  }
  const error = p.cause instanceof Error ? p.cause.message : String(p.cause);
  appendAuditEntry({
    actionType: p.actionType,
    category: p.category,
    actorType: p.actorType ?? 'system',
    actorMemberId: p.actorMemberId ?? null,
    entityType: p.entityType,
    entityId: p.entityId,
    reasonText: p.reasonText,
    metadata: { ...(p.metadata ?? {}), error },
  });
  logger.error(`audit: ${p.actionType}`, {
    entityId: p.entityId,
    ...(p.metadata ?? {}),
    error,
  });
}
