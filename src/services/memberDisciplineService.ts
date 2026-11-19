/**
 * MemberDisciplineService -- an administrator's protective restriction of an
 * account, and the record of the IFPA board's decision on a member under the
 * bylaws' discipline article.
 *
 * Owns:
 *   - Restricting an account and lifting a restriction: the state on the member
 *     row, the end of every session (the password version moves on), the
 *     return of an announcement waiting for approval, the audit row and the
 *     member's notice.
 *   - Recording a board decision: the date checks the bylaws set, the decision
 *     row, what each outcome does to the account, and the decision notice.
 *     An expulsion bars the login address by keyed hash and then deletes the
 *     account through AccountDeletionService, the one path every deletion takes.
 *   - The daily pass that lifts ended board suspensions and deletes decisions
 *     past retention.
 *
 * Does not own:
 *   - Refusing a restricted account at sign-in and on every request
 *     (IdentityAccessService and the session middleware read the restriction).
 *   - Refusing a barred address at registration (IdentityAccessService).
 *   - The record page and the confirmation pages (AdminMemberService).
 *   - The notice and the hearing themselves: the board runs those, and the
 *     platform records only what it decided.
 *
 * Required patterns:
 *   - An administrator cannot act on their own account, another
 *     administrator, the platform's own account, or a deleted account.
 *   - A restriction is protective and changes nothing else: no tier, no
 *     cancellation, no public content.
 *   - A board suspension's restriction is the board's final decision, so an
 *     administrator cannot lift it; it lifts on its end date.
 *   - The decision's audit row names neither the login address nor who
 *     decided, which may be a person; both stay on the decision row.
 *   - Each act's writes, audit row and notice are one transaction.
 *   - A resubmitted decision identical to the member's latest is a repeat: it
 *     writes no second row and carries on from where the first stopped.
 *
 * Persistence: members (restriction columns, password_version),
 *   membership_discipline_decisions, barred_email_hashes, work_queue_items and
 *   member_announcements (an announcement waiting for approval), audit_entries.
 *
 * Side effects:
 *   - audit_entries append (`auth.account_restricted`,
 *     `auth.account_restriction_lifted`, `member.discipline_recorded`)
 *   - outbox enqueue (`account_restricted`, `account_restriction_lifted`,
 *     `membership_discipline_decided`; an expulsion's notice is sent by the
 *     deletion)
 *
 * Service shape: singleton; the expulsion's deletion reaches storage through
 * the deletion service's own accessor.
 */
import { randomUUID } from 'crypto';
import {
  memberAnnouncements, memberDiscipline, transaction, workQueue,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { emailService } from './emailService';
import { getDefaultAccountDeletionService } from './accountDeletionService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { barredEmailHash } from '../lib/barredEmailHash';
import { formatDateDisplay } from './dateFormat';
import { logger } from '../config/logger';

export type DisciplineOutcome = 'suspended' | 'expelled' | 'other_sanction' | 'no_action';

const OUTCOMES: readonly DisciplineOutcome[] = ['suspended', 'expelled', 'other_sanction', 'no_action'];

/** The bylaws' notice period before a suspension or expulsion. */
const NOTICE_DAYS = 15;
/** The bylaws' minimum gap between the hearing and an expulsion taking effect. */
const HEARING_DAYS = 5;
/** The bylaws' window for challenging a decision, counted from the purge. */
const RETENTION_DAYS = 365;

interface DisciplineMemberRow {
  id: string;
  display_name: string;
  login_email_normalized: string | null;
  is_admin: number;
  is_system: number;
  deleted_at: string | null;
  personal_data_purged_at: string | null;
  restricted_at: string | null;
  restricted_by: string | null;
  restriction_reason: string | null;
  restricted_until: string | null;
}

export interface DecisionRow {
  id: string;
  decided_by: string;
  outcome: DisciplineOutcome;
  notice_date: string;
  hearing_date: string;
  decision_date: string;
  suspended_until: string | null;
  reason: string;
  created_at: string;
}

export interface DecisionInput {
  decidedBy: string;
  outcome: string;
  noticeDate: string;
  hearingDate: string;
  decisionDate: string;
  suspendedUntil: string;
  reason: string;
}

/** A decision whose fields have passed every check. */
export interface CheckedDecision {
  decidedBy: string;
  outcome: DisciplineOutcome;
  noticeDate: string;
  hearingDate: string;
  decisionDate: string;
  suspendedUntil: string | null;
  reason: string;
}

export type RestrictResult = { status: 'restricted' } | { status: 'already_restricted' };
export type LiftResult = { status: 'lifted' } | { status: 'not_restricted' };
export type DecisionResult =
  | { status: 'recorded'; outcome: Exclude<DisciplineOutcome, 'expelled'> }
  | { status: 'expelled' }
  | { status: 'expelled_storage_failed' };

function readRow(memberId: string): DisciplineMemberRow {
  const row = memberDiscipline.readMember.get(memberId) as DisciplineMemberRow | undefined;
  if (!row) throw new NotFoundError('No member with that id.');
  return row;
}

/**
 * The accounts no administrator may restrict or record a decision on. Their
 * own, because nobody judges their own case; another administrator, who hands
 * the role on first; the platform's own account; and a deleted account, which
 * has nothing left to restrict.
 */
export function refuseDisciplineTarget(
  actorId: string,
  row: { id: string; is_admin: number; is_system: number; deleted_at: string | null; personal_data_purged_at: string | null },
): void {
  if (row.id === actorId) throw new ValidationError('You cannot act on your own account.');
  if (row.is_admin === 1) {
    throw new ValidationError("An administrator's account cannot be restricted. Remove their administrator role first.");
  }
  if (row.is_system === 1) throw new ValidationError("The platform's own account cannot be restricted.");
  if (row.deleted_at || row.personal_data_purged_at) throw new ValidationError('This account is deleted.');
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function parseDate(value: string, label: string): string {
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new ValidationError(`Enter the ${label} as a date.`);
  }
  return date;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A board suspension still running today. */
function boardSuspensionRuns(row: { restricted_until: string | null }, now: Date): boolean {
  return row.restricted_until !== null && row.restricted_until > todayIso(now);
}

/**
 * Check a decision against the bylaws. The platform records the board's
 * decision and runs none of its procedure, but a suspension or expulsion
 * recorded with less notice than the bylaws give, or an expulsion with too
 * little time after the hearing, is one the bylaws did not allow, so it is
 * refused rather than carried out.
 */
export function checkDecision(input: DecisionInput, now: Date = new Date()): CheckedDecision {
  const outcome = input.outcome.trim() as DisciplineOutcome;
  if (!OUTCOMES.includes(outcome)) throw new ValidationError('Choose the outcome the board decided.');
  const decidedBy = input.decidedBy.trim();
  if (!decidedBy) throw new ValidationError('Enter who decided: the board, or the committee or person it authorized.');
  if (decidedBy.length > 200) throw new ValidationError('Who decided must be 200 characters or fewer.');
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError('Enter the reason the board gave.');
  if (reason.length > 500) throw new ValidationError('The reason must be 500 characters or fewer.');
  const noticeDate = parseDate(input.noticeDate, 'notice date');
  const hearingDate = parseDate(input.hearingDate, 'hearing date');
  const decisionDate = parseDate(input.decisionDate, 'decision date');
  if (decisionDate > todayIso(now)) throw new ValidationError('The decision date cannot be in the future.');
  if (hearingDate < noticeDate) throw new ValidationError('The hearing cannot come before the notice.');
  if (decisionDate < hearingDate) throw new ValidationError('The decision cannot come before the hearing.');
  if ((outcome === 'suspended' || outcome === 'expelled') && daysBetween(noticeDate, decisionDate) < NOTICE_DAYS) {
    throw new ValidationError(
      `The bylaws give a member ${NOTICE_DAYS} days' notice before a suspension or expulsion, `
      + 'so the decision date must be at least that long after the notice date.',
    );
  }
  if (outcome === 'expelled' && daysBetween(hearingDate, decisionDate) < HEARING_DAYS) {
    throw new ValidationError(
      `The bylaws require the hearing at least ${HEARING_DAYS} days before an expulsion takes effect, `
      + 'so the decision date must be at least that long after the hearing date.',
    );
  }
  let suspendedUntil: string | null = null;
  if (outcome === 'suspended') {
    suspendedUntil = parseDate(input.suspendedUntil, 'suspension end date');
    if (suspendedUntil <= decisionDate) {
      throw new ValidationError('The suspension must end after the decision date.');
    }
  }
  return { decidedBy, outcome, noticeDate, hearingDate, decisionDate, suspendedUntil, reason };
}

function sameDecision(row: DecisionRow, d: CheckedDecision): boolean {
  return row.decided_by === d.decidedBy && row.outcome === d.outcome
    && row.notice_date === d.noticeDate && row.hearing_date === d.hearingDate
    && row.decision_date === d.decisionDate && row.suspended_until === d.suspendedUntil
    && row.reason === d.reason;
}

/** Return an announcement the member has waiting for approval, unsent. */
function returnHeldAnnouncements(memberId: string, actorId: string, nowIso: string): void {
  workQueue.closeOpenAnnouncementReviewsForMember.run(
    nowIso, 'Closed: the member\'s account was restricted; the announcement was not sent.',
    nowIso, actorId, memberId,
  );
  memberAnnouncements.withdrawPendingForMember.run(nowIso, actorId, memberId);
}

/** Lift a standing restriction inside the caller's transaction; the caller writes the notice. */
function liftInTx(
  memberId: string, actor: { id: string | null; type: 'admin' | 'system' }, reason: string, nowIso: string,
): string | null {
  const res = memberDiscipline.lift.run(nowIso, actor.id ?? 'system', memberId);
  if (res.changes === 0) return null;
  return appendAuditEntry({
    actionType:    'auth.account_restriction_lifted',
    actorType:     actor.type,
    actorMemberId: actor.id,
    entityType:    'member',
    entityId:      memberId,
    reasonText:    reason,
  });
}

export const memberDisciplineService = {
  readMember(memberId: string): DisciplineMemberRow {
    return readRow(memberId);
  },

  listDecisions(memberId: string): DecisionRow[] {
    return memberDiscipline.listDecisionsForMember.all(memberId) as DecisionRow[];
  },

  /** Whether an administrator may lift this member's restriction now. */
  canLift(row: { restricted_at: string | null; restricted_until: string | null }, now: Date = new Date()): boolean {
    return row.restricted_at !== null && !boardSuspensionRuns(row, now);
  },

  restrict(actorId: string, memberId: string, reason: string): RestrictResult {
    return transaction(() => {
      const row = readRow(memberId);
      refuseDisciplineTarget(actorId, row);
      if (row.restricted_at) return { status: 'already_restricted' } as const;
      const nowIso = new Date().toISOString();
      memberDiscipline.restrict.run(nowIso, actorId, reason, null, nowIso, actorId, memberId);
      returnHeldAnnouncements(memberId, actorId, nowIso);
      const auditId = appendAuditEntry({
        actionType:    'auth.account_restricted',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    reason,
      });
      emailService.sendActNotice({
        template: 'account_restricted',
        params:   { memberName: row.display_name, note: reason },
        memberId,
        actId:    auditId,
      });
      return { status: 'restricted' } as const;
    });
  },

  lift(actorId: string, memberId: string, reason: string): LiftResult {
    return transaction(() => {
      const row = readRow(memberId);
      refuseDisciplineTarget(actorId, row);
      if (!row.restricted_at) return { status: 'not_restricted' } as const;
      if (boardSuspensionRuns(row, new Date())) {
        throw new ValidationError(
          'This restriction is a suspension the board decided, and the board\'s decision is final. '
          + 'It lifts by itself on its end date.',
        );
      }
      const nowIso = new Date().toISOString();
      const auditId = liftInTx(memberId, { id: actorId, type: 'admin' }, reason, nowIso);
      if (auditId) {
        emailService.sendActNotice({
          template: 'account_restriction_lifted',
          params:   { memberName: row.display_name, note: reason },
          memberId,
          actId:    auditId,
        });
      }
      return { status: 'lifted' } as const;
    });
  },

  /**
   * Record the board's decision and carry it out. A suspension restricts the
   * account until its end date; an expulsion bars the address and deletes the
   * account; any other outcome lifts a standing restriction, since the board
   * has ruled.
   */
  async recordDecision(actorId: string, memberId: string, input: DecisionInput): Promise<DecisionResult> {
    const decision = checkDecision(input);
    const now = new Date();
    const nowIso = now.toISOString();

    const committed = transaction(() => {
      const row = readRow(memberId);
      // A repeat of an expulsion whose deletion failed part-way finds the
      // account restricted and its decision already standing, and carries on
      // to the deletion rather than writing the decision twice.
      const latest = (memberDiscipline.listDecisionsForMember.all(memberId) as DecisionRow[])[0];
      if (latest !== undefined && sameDecision(latest, decision)) return { row, repeat: true };
      refuseDisciplineTarget(actorId, row);

      const decisionId = `discipline_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      memberDiscipline.insertDecision.run(
        decisionId, nowIso, actorId, memberId, decision.decidedBy, decision.outcome,
        decision.noticeDate, decision.hearingDate, decision.decisionDate, decision.suspendedUntil,
        decision.reason,
      );
      const auditId = appendAuditEntry({
        actionType:    'member.discipline_recorded',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    decision.reason,
        metadata: {
          decision_id:     decisionId,
          outcome:         decision.outcome,
          notice_date:     decision.noticeDate,
          hearing_date:    decision.hearingDate,
          decision_date:   decision.decisionDate,
          suspended_until: decision.suspendedUntil,
        },
      });

      if (decision.outcome === 'expelled') {
        // Barred and locked out now, inside the same transaction as the
        // decision, so nothing the deletion below does or fails to do leaves
        // the member able to act or to register again.
        if (row.login_email_normalized) {
          memberDiscipline.insertBarredHash.run(barredEmailHash(row.login_email_normalized), nowIso, actorId);
        }
        memberDiscipline.restrict.run(nowIso, actorId, decision.reason, null, nowIso, actorId, memberId);
        returnHeldAnnouncements(memberId, actorId, nowIso);
        return { row, repeat: false };
      }

      if (decision.outcome === 'suspended' && decision.suspendedUntil! > todayIso(now)) {
        memberDiscipline.restrict.run(
          nowIso, actorId, decision.reason, decision.suspendedUntil, nowIso, actorId, memberId,
        );
        if (!row.restricted_at) returnHeldAnnouncements(memberId, actorId, nowIso);
      } else {
        liftInTx(memberId, { id: actorId, type: 'admin' }, decision.reason, nowIso);
      }
      emailService.sendActNotice({
        template: 'membership_discipline_decided',
        params: {
          memberName: row.display_name,
          outcome:    decision.outcome,
          untilDate:  decision.suspendedUntil ? formatDateDisplay(decision.suspendedUntil) : '',
          note:       decision.reason,
        },
        memberId,
        actId: auditId,
      });
      return { row, repeat: false };
    });

    if (decision.outcome !== 'expelled') {
      return { status: 'recorded', outcome: decision.outcome };
    }
    if (committed.row.deleted_at) return { status: 'expelled' };
    const deletion = await getDefaultAccountDeletionService().requestAccountDeletion({
      memberId,
      recurringDonationChoice: 'cancel',
      byAdmin: { adminMemberId: actorId, reason: decision.reason, notice: 'expelled' },
    });
    switch (deletion.status) {
      case 'deleted':
      case 'already_deleted':
        return { status: 'expelled' };
      case 'storage_failed':
        return { status: 'expelled_storage_failed' };
      case 'not_found':
        throw new NotFoundError('member not found');
      case 'administrator':
        throw new ValidationError("An administrator's account cannot be deleted. Remove their administrator role first.");
    }
  },

  /**
   * The daily pass: lift every board suspension whose end date has come, and
   * delete every decision past the bylaws' challenge window. Each lift re-reads
   * its row inside its own transaction, so a restriction changed after the
   * listing is left as it now stands.
   */
  runDailyPass(now: Date = new Date()): { lifted: number; decisionsDeleted: number } {
    const today = todayIso(now);
    const nowIso = now.toISOString();
    const ids = (memberDiscipline.listEndedSuspensions.all(today) as { id: string }[]).map((r) => r.id);
    let lifted = 0;
    for (const memberId of ids) {
      try {
        const done = transaction(() => {
          const row = readRow(memberId);
          if (row.restricted_until === null || row.restricted_until > today || row.deleted_at) return false;
          const auditId = liftInTx(memberId, { id: null, type: 'system' }, 'The board suspension ended.', nowIso);
          if (!auditId) return false;
          emailService.sendActNotice({
            template: 'account_restriction_lifted',
            params:   { memberName: row.display_name, note: 'Your suspension has ended.' },
            memberId,
            actId:    auditId,
          });
          return true;
        });
        if (done) lifted += 1;
      } catch (err) {
        logger.error('SYS_Apply_Membership_Discipline: suspension lift failed', {
          memberId,
          errorClass: err instanceof Error ? err.name : typeof err,
        });
      }
    }
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
    const decisionsDeleted = memberDiscipline.deleteDecisionsPastRetention.run(cutoff).changes;
    return { lifted, decisionsDeleted };
  },
};
