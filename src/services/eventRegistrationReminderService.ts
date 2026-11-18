/**
 * SYS_Send_Event_Registration_Reminders daily worker service.
 *
 * Owns: the pre-event reminder to every confirmed registrant. Once the event is
 * `event_registration_reminder_days` (default 7) or fewer whole UTC days away,
 * each confirmed registration on an event still running registration or closed
 * to it is reminded once, and nothing is sent on or after the start date.
 *
 * Does not own: the registration and its status (the event service and the
 * payment settlement), the run row (OperationsPlatformService), or the summary
 * wording, which is the registration confirmation's own
 * (`eventRegistrationSettlement`), so the reminder describes the registration
 * in the same words the member was sent when it was confirmed.
 *
 * Idempotency: a (registration, start date) row in
 * event_registration_reminder_sent is written in the same transaction as the
 * outbox enqueue, so a failed enqueue rolls the row back and the next pass
 * retries, a pass that missed a day still sends once, a repeat pass sends
 * nothing, and an event moved to a new date reminds its registrants again.
 *
 * Email: transactional, with no mailing list. The reminder is part of the
 * member's registration, as the confirmation is, so no subscription governs
 * it; the outbox still suppresses an address that bounced or complained.
 *
 * Deceased members: the platform sends nothing to a member it has marked
 * deceased; they are counted in the run record and skipped.
 *
 * Persistence: reads registrations, events, members_onboarded,
 * registration_discipline_selections and system_config; appends
 * event_registration_reminder_sent.
 *
 * Side effects: outbox enqueue. No audit row: the job's trail is its run row.
 * One candidate that throws is counted as failed and logged at error, and the
 * pass continues.
 */

import { randomUUID } from 'node:crypto';
import {
  eventRegistrationReminders,
  eventRegistrations,
  transaction,
  type EventRegistrationReminderCandidateRow,
} from '../db/db';
import { emailService } from './emailService';
import { readIntConfig } from './configReader';
import { daysUntilUtcDay } from './activePlayerExpiryService';
import { eventDatesPhrase, registrationSummary, toEntryView } from './eventRegistrationSettlement';
import { logger } from '../config/logger';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER_DAYS = 7;

export interface RunDailyPassResult {
  candidates_scanned:    number;
  reminders_enqueued:    number;
  skipped_already_sent:  number;
  skipped_deceased:      number;
  skipped_missing_email: number;
  /** Candidates whose processing threw; each is logged at error by registration id. */
  failed:                number;
}

export interface RunOpts {
  /** Override "now" for tests; defaults to current wall-clock time. */
  now?: Date;
}

/**
 * Whether the reminder is due for an event starting on `startDate`: from
 * `days` whole UTC days before the start until the day before it. Nothing is
 * due on or after the start date, and a window of zero or fewer days opens
 * nothing.
 */
export function isReminderDue(startDate: string, nowIso: string, days: number): boolean {
  const until = daysUntilUtcDay(`${startDate}T00:00:00.000Z`, nowIso);
  return until > 0 && until <= days;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function tryRecordSent(c: EventRegistrationReminderCandidateRow, nowIso: string): boolean {
  try {
    eventRegistrationReminders.insertSent.run(
      `errs_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      nowIso,
      c.registration_id,
      c.start_date,
      nowIso,
    );
    return true;
  } catch (err) {
    if (
      err && typeof err === 'object' && 'code' in err
      && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      return false;
    }
    throw err;
  }
}

/**
 * Records the reminder and enqueues it in one transaction. Returns false when
 * the ledger already holds it.
 */
function remind(c: EventRegistrationReminderCandidateRow, nowIso: string): boolean {
  return transaction(() => {
    if (!tryRecordSent(c, nowIso)) return false;
    const entries = (eventRegistrations.listSelectionsForRegistration.all(c.registration_id) as
      Parameters<typeof toEntryView>[0][]).map(toEntryView);
    emailService.send({
      template: 'event_registration_reminder',
      params: {
        eventTitle: c.event_title,
        eventDates: eventDatesPhrase(c.start_date, c.end_date),
        registrationSummary: registrationSummary(c.registration_type, entries, c.tshirt_size),
      },
      recipientEmail:    c.login_email!,
      recipientMemberId: c.member_id,
      idempotencyKey:    `event-reminder:${c.registration_id}:${c.start_date}`,
    });
    return true;
  });
}

/** Execute one daily pass. Returns counters for the run row. */
export function runDailyPass(opts: RunOpts = {}): RunDailyPassResult {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const days = readIntConfig('event_registration_reminder_days', DEFAULT_REMINDER_DAYS);

  const result: RunDailyPassResult = {
    candidates_scanned:    0,
    reminders_enqueued:    0,
    skipped_already_sent:  0,
    skipped_deceased:      0,
    skipped_missing_email: 0,
    failed:                0,
  };

  const candidates = eventRegistrationReminders.listCandidates.all(
    utcDate(now.getTime()),
    utcDate(now.getTime() + days * MS_PER_DAY),
  ) as EventRegistrationReminderCandidateRow[];
  result.candidates_scanned = candidates.length;

  for (const c of candidates) {
    try {
      // The query already bounds the window; the pure rule is checked again so
      // the one statement of when a reminder is due is the one that decides.
      if (!isReminderDue(c.start_date, nowIso, days)) continue;
      if (c.is_deceased === 1) {
        result.skipped_deceased += 1;
        continue;
      }
      if (!c.login_email) {
        result.skipped_missing_email += 1;
        continue;
      }
      if (remind(c, nowIso)) result.reminders_enqueued += 1;
      else result.skipped_already_sent += 1;
    } catch (err) {
      result.failed += 1;
      logger.error('SYS_Send_Event_Registration_Reminders: candidate failed', {
        registrationId: c.registration_id,
        errorClass: err instanceof Error ? err.name : typeof err,
      });
    }
  }

  logger.info('SYS_Send_Event_Registration_Reminders run', { nowIso, ...result });
  return result;
}
