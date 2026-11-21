/**
 * What a registration fee's payment does to the registration it pays for.
 *
 * Owns: the registration side of a paid registration's settlement, run inside
 * the payment service's own transaction for the provider event, so the payment
 * and the registration it pays for always move together; and the shared pieces
 * the registration confirmation email is built from, which the event service's
 * free registration uses as well.
 *
 * Does not own: the payment row, its transitions or its audit rows (the payment
 * service), or the registration form and its rules (the event service). It is a
 * module of its own so the payment service can reach it without loading the
 * event service, which already depends on the payment service.
 *
 * Invariants:
 *   - A settlement moves only a registration still pending on that payment. A
 *     registration the member withdrew while paying stays withdrawn: the payment
 *     still settles, and any refund is arranged by the IFPA Treasurer.
 *   - Settlement confirms the registration however long the checkout took, even
 *     past the registration cutoff, because the money moved and a paid place is
 *     never refused afterwards.
 *   - An abandoned checkout cancels its pending registration, keeping the entries.
 *
 * Side effects: the registration confirmation email (outbox enqueue, inside the
 * caller's transaction). No audit row: the payment's own transition and audit
 * rows record the act, and the registration row records its status, reason and
 * time.
 */
import { eventRegistrations } from '../db/db';
import { emailService } from './emailService';
import { formatDateRange } from '../lib/handlebarsHelpers';

export type RegistrationType = 'competitor' | 'attendee_supporter';

export const REGISTRATION_TYPE_LABELS: Record<RegistrationType, string> = {
  competitor: 'Competitor',
  attendee_supporter: 'Spectator',
};

/** Stored on a pending registration whose checkout session closed unpaid. */
export const CHECKOUT_EXPIRED = 'Checkout expired';

const SETTLEMENT_ACTOR = 'payment_service';

export interface RegistrationEntryView {
  divisionName: string;
  partnerName: string | null;
  partnerHref: string | null;
  isAmateur: boolean;
}

export function eventDatesPhrase(startDate: string, endDate: string): string {
  return formatDateRange(startDate === endDate ? startDate : `${startDate}/${endDate}`);
}

export function toEntryView(row: {
  division_name: string; enters_as_amateur?: number;
  partner_member_name: string | null; partner_member_slug: string | null;
}): RegistrationEntryView {
  return {
    divisionName: row.division_name,
    partnerName: row.partner_member_name,
    partnerHref: row.partner_member_slug ? `/members/${encodeURIComponent(row.partner_member_slug)}` : null,
    isAmateur: row.enters_as_amateur === 1,
  };
}

/** The confirmation email's summary of what the member registered for. */
export function registrationSummary(type: RegistrationType, entries: RegistrationEntryView[], tshirtSize: string | null): string {
  const lines = [`Registered as: ${REGISTRATION_TYPE_LABELS[type]}`];
  for (const e of entries) {
    lines.push(`${e.divisionName}${e.partnerName ? ` with ${e.partnerName}` : ''}${e.isAmateur ? ', as an Amateur' : ''}`);
  }
  if (tshirtSize) lines.push(`T-shirt size: ${tshirtSize}`);
  return lines.join('\n');
}

interface PaidRegistrationRow {
  id: string;
  member_id: string;
  status: string;
  registration_type: RegistrationType;
  tshirt_size: string | null;
  event_title: string;
  start_date: string;
  end_date: string;
}

type SelectionRow = Parameters<typeof toEntryView>[0];

/**
 * Confirm the registration a settled payment pays for and email its details.
 * Call inside the payment's settlement transaction.
 */
export function confirmPaidRegistrationInTx(
  paymentId: string,
  now: string,
): { status: 'confirmed'; registrationId: string } | { status: 'noop'; reason: 'no_registration' | 'not_pending' } {
  const reg = eventRegistrations.findByPayment.get(paymentId) as PaidRegistrationRow | undefined;
  if (!reg) return { status: 'noop', reason: 'no_registration' };
  if (eventRegistrations.confirmByPayment.run(now, SETTLEMENT_ACTOR, paymentId).changes === 0) {
    return { status: 'noop', reason: 'not_pending' };
  }
  const entries = (eventRegistrations.listSelectionsForRegistration.all(reg.id) as SelectionRow[]).map(toEntryView);
  emailService.sendToMember({
    template: 'event_registration_confirmed',
    params: {
      eventTitle: reg.event_title,
      eventDates: eventDatesPhrase(reg.start_date, reg.end_date),
      registrationSummary: registrationSummary(reg.registration_type, entries, reg.tshirt_size),
    },
    memberId: reg.member_id,
    idempotencyKey: `event-registration:${reg.id}:${paymentId}`,
  });
  return { status: 'confirmed', registrationId: reg.id };
}

/**
 * Cancel the pending registration a checkout that closed unpaid was for. Call
 * inside the transaction that closes the payment.
 */
export function cancelRegistrationForClosedCheckoutInTx(
  paymentId: string,
  now: string,
): { status: 'canceled' } | { status: 'noop' } {
  const changed = eventRegistrations.cancelPendingByPayment.run(
    CHECKOUT_EXPIRED, now, now, SETTLEMENT_ACTOR, paymentId,
  ).changes;
  return changed === 0 ? { status: 'noop' } : { status: 'canceled' };
}
