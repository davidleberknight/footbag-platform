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
 *
 * A failure that concerns someone who is not a member (a registrant, an
 * unfinished account) uses logOperationalError instead: the operator is told
 * the same way, and the audit log, which holds nothing about non-members,
 * gets no row.
 */
import { appendAuditEntry, type AuditActorType } from './auditService';
import { logger } from '../config/logger';

export interface OperationalErrorParams {
  // Convention: must end in '_failed'. Enforced at runtime.
  actionType: string;
  entityType: string;
  entityId: string;
  reasonText: string;
  cause: unknown;
  metadata?: Record<string, unknown>;
  actorMemberId?: string | null;
  actorType?: AuditActorType;
}

function assertFailedSuffix(actionType: string): void {
  if (!actionType.endsWith('_failed')) {
    throw new Error(
      `recordOperationalError: actionType must end in '_failed', got '${actionType}'`,
    );
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// What kind of failure it was, for the audit row: the error's class and, for a
// database or system error, its code. Never the message, which can quote an
// address, a name or a value from the row that failed, and the audit log
// outlives an erasure. The operator log line keeps the message.
function errorClass(cause: unknown): { error_class: string; error_code?: string } {
  const name = cause instanceof Error ? cause.name : typeof cause;
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? { error_class: name, error_code: code } : { error_class: name };
}

export function recordOperationalError(p: OperationalErrorParams): void {
  assertFailedSuffix(p.actionType);
  appendAuditEntry({
    actionType: p.actionType,
    actorType: p.actorType ?? 'system',
    actorMemberId: p.actorMemberId ?? null,
    entityType: p.entityType,
    entityId: p.entityId,
    reasonText: p.reasonText,
    metadata: { ...(p.metadata ?? {}), ...errorClass(p.cause) },
  });
  logger.error(`audit: ${p.actionType}`, {
    entityId: p.entityId,
    ...(p.metadata ?? {}),
    error: errorText(p.cause),
  });
}

/** The operator alarm alone, for a failure about someone who is not a member. */
export function logOperationalError(p: OperationalErrorParams): void {
  assertFailedSuffix(p.actionType);
  logger.error(`audit: ${p.actionType}`, {
    entityId: p.entityId,
    ...(p.metadata ?? {}),
    error: errorText(p.cause),
  });
}
