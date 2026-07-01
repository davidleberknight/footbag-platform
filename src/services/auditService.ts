import { randomUUID } from 'crypto';
import { auditEntries } from '../db/db';

export type AuditActorType = 'system' | 'member' | 'admin';

export interface AuditAppendInput {
  actionType: string;
  category: string;
  actorType: AuditActorType;
  actorMemberId: string | null;
  entityType: string;
  entityId: string;
  reasonText?: string | null;
  metadata?: Record<string, unknown>;
}

const CANONICAL_ACTION_TYPE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

/**
 * Every audit action_type is a lowercase, dotted, domain-prefixed value
 * (`domain.event`, e.g. `auth.register`, `admin.role_granted`). The vocabulary
 * is closed, so a value without a namespace is a programming error; this throws
 * rather than writing a malformed row that would split downstream queries.
 */
export function assertCanonicalActionType(actionType: string): void {
  if (!CANONICAL_ACTION_TYPE.test(actionType)) {
    throw new Error(
      `audit action_type must be lowercase dotted domain.event; got '${actionType}'`,
    );
  }
}

export function appendAuditEntry(input: AuditAppendInput): string {
  assertCanonicalActionType(input.actionType);
  const id = `audit_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const now = new Date().toISOString();
  auditEntries.insert.run(
    id,
    now,
    now,
    input.actorType,
    input.actorMemberId,
    input.actionType,
    input.entityType,
    input.entityId,
    input.category,
    input.reasonText ?? null,
    JSON.stringify(input.metadata ?? {}),
  );
  return id;
}
