import { randomUUID } from 'crypto';
import { auditEntries } from '../db/db';
import { currentDataOrigin } from './dataOriginService';

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
    currentDataOrigin(),
  );
  return id;
}

export interface OwnAuditRow {
  id: string;
  occurred_at: string;
  metadata_json: string;
}

/**
 * The actor's own latest audit row for an action on an entity, or null. A
 * repeated submit reads it to report its own earlier act (`own_repeat`) rather
 * than a state someone else left (`already_held`).
 */
export function findOwnLatestAudit(
  actorMemberId: string,
  actionType: string,
  entityType: string,
  entityId: string,
): OwnAuditRow | null {
  return (auditEntries.findLatestOwn.get(actorMemberId, actionType, entityType, entityId) as
    OwnAuditRow | undefined) ?? null;
}

/**
 * This actor's audit row for an act on an entity, when that act is the one that
 * stands: the latest of the act and its reversal on the entity is the act, and
 * this actor did it. Null when someone else acted last, or the act was reversed
 * since. A repeated submit reads it to report `own_repeat` only for the change it
 * actually made, and `already_held` for a state another act left.
 */
export function findStandingOwnAct(
  actorMemberId: string,
  actionType: string,
  reversingActionType: string,
  entityType: string,
  entityId: string,
): OwnAuditRow | null {
  const latest = auditEntries.findLatestForEntity.get(
    entityType, entityId, actionType, reversingActionType,
  ) as (OwnAuditRow & { actor_member_id: string | null; action_type: string }) | undefined;
  if (!latest || latest.action_type !== actionType || latest.actor_member_id !== actorMemberId) {
    return null;
  }
  return latest;
}
