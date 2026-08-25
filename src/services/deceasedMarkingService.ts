/**
 * DeceasedMarkingService -- recording that a member has died, and reversing a
 * marking made in error.
 *
 * Owns:
 *   - The `members.is_deceased` write and its timestamp and note
 *   - The cascade to a linked `historical_persons` row
 *   - Withdrawal from events that have not yet happened
 *   - The same flag on an unlinked historical record, set or unset
 *
 * Does not own:
 *   - Clearing the member's contact data afterwards (MemberService owns the
 *     row-level scrub; OperationsPlatformService decides when it runs)
 *   - Membership tier, honours, media attribution or competition results, none
 *     of which this touches: the marking preserves a member's contributions and
 *     changes only what the platform will do on their behalf from now on
 *   - Page shaping for the surface it is reached from (AdminMemberService)
 *
 * Required patterns:
 *   - Every consumer of the flag already exists and reads it directly, so this
 *     service writes it and nothing else propagates.
 *   - The member write, the cascade and the withdrawals land in one
 *     transaction, so a record can never be half-marked.
 *   - Both writes are guarded on the flag's current value, which makes a repeat
 *     a no-op rather than a second audit row.
 *   - Reversal is bounded by `deceased_cleanup_grace_days`, the same window the
 *     contact scrub waits out, because after the scrub there is nothing left to
 *     restore.
 *
 * Persistence: members, historical_persons, registrations, audit_entries.
 *
 * Side effects: audit_entries append. No email: the platform sends nothing to a
 * member it has marked deceased, which is enforced where notifications resolve
 * their recipient.
 *
 * Service shape: singleton object (no external adapters).
 */
import { account, deceasedMarking, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { readIntConfig } from './configReader';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';

const DECEASED_GRACE_DAYS_DEFAULT = 30;
const MAX_REASON = 500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type MarkDeceasedResult = {
  status: 'marked';
  cascadedToHistoricalPerson: boolean;
  registrationsWithdrawn: number;
};

export type RevertDeceasedResult =
  | { status: 'reverted'; cascadedToHistoricalPerson: boolean }
  | { status: 'grace_elapsed'; graceDays: number };

export type HistoricalPersonDeceasedResult =
  | { status: 'changed'; personName: string; isDeceased: boolean }
  | { status: 'unchanged'; personName: string; isDeceased: boolean };

interface MemberRow {
  id: string;
  display_name: string;
  is_deceased: number;
  deceased_at: string | null;
  historical_person_id: string | null;
  personal_data_purged_at: string | null;
}

function readMember(memberId: string): MemberRow {
  const row = account.findMemberForAdminRecord.get(memberId) as MemberRow | undefined;
  if (!row) throw new NotFoundError('No member with that id.');
  return row;
}

function requireReason(raw: string): string {
  const reason = raw.trim();
  if (!reason) throw new ValidationError('Enter the reason for this marking.');
  if (reason.length > MAX_REASON) {
    throw new ValidationError(`The reason must be ${MAX_REASON} characters or fewer.`);
  }
  return reason;
}

function graceDays(): number {
  return readIntConfig('deceased_cleanup_grace_days', DECEASED_GRACE_DAYS_DEFAULT);
}

export const deceasedMarkingService = {
  /**
   * Record that a member has died.
   *
   * The linked historical record follows, so the member surfaces and the
   * historical ones cannot disagree about it, and the member is withdrawn from
   * events that have not happened yet, which is the one consumer effect no
   * existing exclusion predicate covers. Everything else the member leaves
   * behind stays exactly as it is.
   */
  markDeceased(actorId: string, memberId: string, rawReason: string): MarkDeceasedResult {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    if (row.is_deceased === 1) {
      throw new ConflictError('This member is already marked deceased.');
    }
    // An erased account is an anonymized stub. Marking it deceased would record
    // something about a person the record no longer identifies, and the audit
    // row would carry the administrator's reason about them permanently.
    if (row.personal_data_purged_at) {
      throw new ConflictError(
        "This account's personal data has been erased, so it cannot be marked.",
      );
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    return transaction(() => {
      deceasedMarking.markMember.run(now, reason, now, actorId, memberId);

      const cascaded = Boolean(row.historical_person_id);
      if (row.historical_person_id) {
        deceasedMarking.setHistoricalPersonDeceased.run(1, row.historical_person_id);
      }

      const withdrawn = deceasedMarking.cancelUpcomingRegistrations.run(
        'Member deceased', now, now, actorId, memberId, today,
      ).changes;

      appendAuditEntry({
        actionType:    'member.deceased_marked',
        category:      'member',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    reason,
        metadata: {
          cascaded_to_historical_person: cascaded,
          historical_person_id:          row.historical_person_id,
          registrations_withdrawn:       withdrawn,
        },
      });

      return {
        status: 'marked' as const,
        cascadedToHistoricalPerson: cascaded,
        registrationsWithdrawn: withdrawn,
      };
    });
  },

  /**
   * Undo a marking made in error, inside the configured grace period.
   *
   * Past that window the contact scrub has already run and cleared what the
   * account carried, so there is nothing left for a reversal to restore and the
   * story leaves full account deletion as the only remaining path. The
   * withdrawn event registrations are not reinstated: an organizer's roster is
   * theirs, and a member returning to an event registers again.
   */
  revertDeceased(actorId: string, memberId: string, rawReason: string): RevertDeceasedResult {
    const row = readMember(memberId);
    const reason = requireReason(rawReason);
    if (row.is_deceased !== 1) {
      throw new ConflictError('This member is not marked deceased.');
    }

    const days = graceDays();
    const markedAt = row.deceased_at ? Date.parse(row.deceased_at) : Number.NaN;
    const elapsedDays = Number.isNaN(markedAt)
      ? 0
      : (Date.now() - markedAt) / MS_PER_DAY;
    if (row.personal_data_purged_at || elapsedDays > days) {
      return { status: 'grace_elapsed' as const, graceDays: days };
    }

    const now = new Date().toISOString();
    return transaction(() => {
      deceasedMarking.revertMember.run(now, actorId, memberId);

      const cascaded = Boolean(row.historical_person_id);
      if (row.historical_person_id) {
        deceasedMarking.setHistoricalPersonDeceased.run(0, row.historical_person_id);
      }

      appendAuditEntry({
        actionType:    'member.deceased_reverted',
        category:      'member',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    reason,
        metadata: {
          cascaded_to_historical_person: cascaded,
          historical_person_id:          row.historical_person_id,
          marked_at:                     row.deceased_at,
        },
      });

      return { status: 'reverted' as const, cascadedToHistoricalPerson: cascaded };
    });
  },

  /**
   * The same flag on a historical record nobody has claimed.
   *
   * It is consumed only to suppress the direct claim affordance on that record,
   * so setting it says "this person is recognized as deceased" and nothing
   * more. It is reversible for the same reason the member marking is: it can be
   * set on the wrong person.
   */
  setHistoricalPersonDeceased(
    actorId: string,
    personId: string,
    isDeceased: boolean,
    rawReason: string,
  ): HistoricalPersonDeceasedResult {
    const person = deceasedMarking.findHistoricalPerson.get(personId) as
      | {
          person_id: string;
          person_name: string;
          is_deceased: number;
          claimed_by_member_id: string | null;
          claimed_by_display_name: string | null;
        }
      | undefined;
    if (!person) throw new NotFoundError('No historical record with that id.');
    // Somebody holds this record, so the flag belongs to their member record
    // and is set there. Enforced here rather than only by hiding the control,
    // because hiding a control is not a rule: a request that arrives anyway
    // would leave the record marked and the living member's own row clear,
    // which is the disagreement having one home is meant to prevent.
    if (person.claimed_by_member_id) {
      throw new ConflictError(
        `${person.claimed_by_display_name ?? 'A member'} holds this record, so this is recorded `
        + 'on their member record rather than here.',
      );
    }
    const reason = requireReason(rawReason);

    const target = isDeceased ? 1 : 0;
    if (person.is_deceased === target) {
      return {
        status: 'unchanged' as const,
        personName: person.person_name,
        isDeceased,
      };
    }

    return transaction(() => {
      deceasedMarking.setHistoricalPersonDeceased.run(target, personId);
      appendAuditEntry({
        actionType:    isDeceased ? 'member.deceased_marked' : 'member.deceased_reverted',
        category:      'member',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'historical_person',
        entityId:      personId,
        reasonText:    reason,
        metadata:      { unlinked_historical_record: true },
      });
      return {
        status: 'changed' as const,
        personName: person.person_name,
        isDeceased,
      };
    });
  },
};
