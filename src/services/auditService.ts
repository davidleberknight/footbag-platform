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

export function appendAuditEntry(input: AuditAppendInput): void {
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
}
