/**
 * The finance persona's journey: what an administrator and the scheduler do
 * after the finance seed commits, run for real so the Financial Reports page
 * and the Treasurer digest show the seeded money on any stack.
 *
 * The seed writes payments, issues and webhook health, and no job runs. A
 * report the seed wrote would be outranked by the worker's own runs on any
 * stack whose worker already ran, and the worker's next due tick may be a day
 * or a month away. So this journey does, at the real current time, what a
 * person and the scheduler would:
 *
 *   1. The finance administrator resolves the issue on the rehearsal charge,
 *      through the same service entry the reconciliation page posts to.
 *   2. The nightly reconciliation runs through its job-registry entry, so its
 *      run row is that day's newest report, totalling the seeded live money
 *      and carrying the resolved issue forward.
 *   3. The Treasurer digest runs the same way, unless a digest already went out
 *      today: the outbox keeps one digest per UTC day, so a second run would
 *      record a send that mailed nothing. That case is reported, not hidden.
 *   4. One pointer audit row names the runs and the outbox row the journey
 *      made, so the persona refresh removes exactly those and hands the
 *      schedule back to the worker.
 *
 * The shape is reusable for any persona whose story ends in a scheduled job
 * (an expiry reminder, a deletion reaching its purge, a queue digest): seed
 * the state, act through the real entries, run the job on demand through the
 * registry, and leave a pointer row the refresh tears down by.
 *
 * Writes through the application's database singleton, so the caller makes
 * sure that singleton is the database the seed wrote. Refuses production.
 */
import { db } from '../db/db';
import { config } from '../config/env';
import { appendAuditEntry } from '../services/auditService';
import {
  paymentReconciliationService,
  reconciliationDigestIdempotencyKey,
} from '../services/paymentReconciliationService';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../lib/personaGuards';
import { runRegistryJobNow, RegistryJobRefusedError } from './runRegistryJob';
import {
  FINANCE_DEMO_REHEARSAL_ISSUE_ID,
  FINANCE_DEMO_REHEARSAL_RESOLUTION_NOTE,
  FINANCE_DEMO_RUN_AUDIT_ACTION_TYPE,
  FINANCE_DEMO_RECONCILIATION_JOB,
  FINANCE_DEMO_DIGEST_JOB,
  type FinanceDemoRunPointer,
} from './financeDemoSeed';

export const FINANCE_DEMO_ADMIN_SLUG = 'finance_admin';

export type FinanceDemoJourneyResult =
  | { status: 'ran'; at: string; pointer: FinanceDemoRunPointer }
  | { status: 'digest_already_sent_today'; at: string; pointer: FinanceDemoRunPointer }
  | { status: 'job_failed'; at: string; job: string; error: string; pointer: FinanceDemoRunPointer };

export function financeDemoAdminMemberId(): string {
  return `${SEEDED_PERSONA_MEMBER_ID_PREFIX}${FINANCE_DEMO_ADMIN_SLUG}`;
}

function runIdAt(jobName: string, startedAt: string): string | null {
  const row = db
    .prepare(`SELECT id FROM system_job_runs WHERE job_name = ? AND started_at = ?`)
    .get(jobName, startedAt) as { id: string } | undefined;
  return row?.id ?? null;
}

function outboxIdFor(key: string): string | null {
  const row = db
    .prepare(`SELECT id FROM outbox_emails WHERE idempotency_key = ?`)
    .get(key) as { id: string } | undefined;
  return row?.id ?? null;
}

export async function runFinanceDemoJourney(
  opts: { now?: Date } = {},
): Promise<FinanceDemoJourneyResult> {
  if (config.footbagEnv === 'production') {
    throw new RegistryJobRefusedError('The finance demo journey never runs in production.');
  }
  const adminMemberId = financeDemoAdminMemberId();

  paymentReconciliationService.resolveIssue({
    issueId: FINANCE_DEMO_REHEARSAL_ISSUE_ID,
    adminMemberId,
    notes: FINANCE_DEMO_REHEARSAL_RESOLUTION_NOTE,
  });

  const now = opts.now ?? new Date();
  const at = now.toISOString();
  const pointer: FinanceDemoRunPointer = {
    reconciliationRunId: null,
    digestRunId: null,
    digestOutboxId: null,
  };
  const writePointer = (): void => {
    appendAuditEntry({
      actionType: FINANCE_DEMO_RUN_AUDIT_ACTION_TYPE,
      actorType: 'system',
      actorMemberId: null,
      entityType: 'member',
      entityId: adminMemberId,
      reasonText: 'finance persona journey: on-demand reconciliation and digest runs',
      metadata: { ...pointer },
    });
  };

  const reconciliation = await runRegistryJobNow(FINANCE_DEMO_RECONCILIATION_JOB, { now });
  pointer.reconciliationRunId = runIdAt(FINANCE_DEMO_RECONCILIATION_JOB, at);
  if (reconciliation.status === 'failed') {
    writePointer();
    return { status: 'job_failed', at, job: reconciliation.job, error: reconciliation.error, pointer };
  }

  const digestKey = reconciliationDigestIdempotencyKey(now);
  if (outboxIdFor(digestKey) !== null) {
    writePointer();
    return { status: 'digest_already_sent_today', at, pointer };
  }

  const digest = await runRegistryJobNow(FINANCE_DEMO_DIGEST_JOB, { now });
  pointer.digestRunId = runIdAt(FINANCE_DEMO_DIGEST_JOB, at);
  pointer.digestOutboxId = outboxIdFor(digestKey);
  writePointer();
  if (digest.status === 'failed') {
    return { status: 'job_failed', at, job: digest.job, error: digest.error, pointer };
  }
  return { status: 'ran', at, pointer };
}
