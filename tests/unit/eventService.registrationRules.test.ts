/**
 * The rules that decide whether a member can register for an event and which
 * entries a division admits: the cutoff day, the types offered while a type
 * carries no fee, and gender eligibility between member profiles.
 */
import { describe, it, expect } from 'vitest';
import {
  checkDivisionEligibility,
  isRegistrationOpen,
  offeredRegistrationTypes,
  registrationCutoff,
} from '../../src/services/eventService';

describe('registration window', () => {
  const event = { status: 'reg_open', registration_status: 'open', registration_deadline: '2030-05-10', start_date: '2030-05-20' };

  // Defect caught: the deadline is ignored for the start date, or the start
  // date is not the fallback when no deadline is set.
  it('closes on the deadline, or the start date when none is set', () => {
    expect(registrationCutoff(event)).toBe('2030-05-10');
    expect(registrationCutoff({ ...event, registration_deadline: null })).toBe('2030-05-20');
  });

  // Defect caught: the cutoff day itself is refused, the day after it is
  // accepted, or a stopped or non-open event still takes registrations.
  it('is open through the cutoff day only, and only while open and not stopped', () => {
    expect(isRegistrationOpen(event, '2030-05-10T23:59:00.000Z')).toBe(true);
    expect(isRegistrationOpen(event, '2030-05-11T00:00:00.000Z')).toBe(false);
    expect(isRegistrationOpen({ ...event, registration_status: 'closed' }, '2030-05-01T00:00:00.000Z')).toBe(false);
    expect(isRegistrationOpen({ ...event, status: 'closed' }, '2030-05-01T00:00:00.000Z')).toBe(false);
  });
});

describe('offered registration types', () => {
  // Defect caught: a type carrying a fee is offered before the event's
  // sanction approval enabled payment, or attendee registration is offered
  // when the organizers did not turn it on.
  it('offers each free type, attendee only when accepted, and a fee type only once payment is enabled', () => {
    const free = { is_attendee_registration_open: 0, competitor_fee_cents: null, attendee_fee_cents: null, payment_enabled: 0 };
    expect(offeredRegistrationTypes(free)).toEqual(['competitor']);
    expect(offeredRegistrationTypes({ ...free, is_attendee_registration_open: 1 })).toEqual(['competitor', 'attendee_supporter']);
    expect(offeredRegistrationTypes({ ...free, is_attendee_registration_open: 1, competitor_fee_cents: 5000 })).toEqual(['attendee_supporter']);
    const bothFees = { is_attendee_registration_open: 1, competitor_fee_cents: 5000, attendee_fee_cents: 1500 };
    expect(offeredRegistrationTypes({ ...bothFees, payment_enabled: 0 })).toEqual([]);
    expect(offeredRegistrationTypes({ ...bothFees, payment_enabled: 1 })).toEqual(['competitor', 'attendee_supporter']);
  });
});

describe('division gender eligibility', () => {
  const open = { name: 'Open Singles', gender_eligibility: 'open' };
  const women = { name: "Women's Doubles", gender_eligibility: 'women' };
  const mixed = { name: 'Mixed Doubles', gender_eligibility: 'mixed' };
  const member = (gender: string | null) => ({ gender });

  // Defect caught: an open division, or a historical one with no gender part,
  // refuses anyone.
  it('admits anyone to an open division', () => {
    expect(checkDivisionEligibility(open, null, null)).toBeNull();
    expect(checkDivisionEligibility({ name: 'Old', gender_eligibility: null }, 'undisclosed', null)).toBeNull();
  });

  // Defect caught: an undisclosed or unset gender enters a gendered draw.
  it('needs a declared gender for a gendered division', () => {
    for (const g of [null, 'undisclosed']) {
      expect(checkDivisionEligibility(women, g, member('female')), String(g)).not.toBeNull();
      expect(checkDivisionEligibility(mixed, g, member('male')), String(g)).not.toBeNull();
    }
  });

  // Defect caught: an organizer entering someone else is told to fix their
  // own profile, and the refusal never says whose gender is missing; the
  // member registering themselves is addressed, not named.
  it('names the entrant when someone else enters them', () => {
    expect(checkDivisionEligibility(women, null, null, 'Ada Entrant')).toContain('Ada Entrant');
    expect(checkDivisionEligibility(mixed, 'male', member('male'), 'Ada Entrant')).not.toBeNull();
    expect(checkDivisionEligibility(women, null, null)).not.toContain('Ada Entrant');
  });

  // Defect caught: a man enters a women's division, or a women's pair is
  // refused.
  it('admits only women to a women division', () => {
    expect(checkDivisionEligibility(women, 'female', member('female'))).toBeNull();
    expect(checkDivisionEligibility(women, 'male', member('female'))).not.toBeNull();
    expect(checkDivisionEligibility(women, 'female', member('male'))).not.toBeNull();
    expect(checkDivisionEligibility(women, 'female', member('undisclosed'))).not.toBeNull();
  });

  // Defect caught: a mixed pair of one gender is admitted, or a man and a
  // woman are refused whichever of them registers.
  it('admits one man and one woman to a mixed division', () => {
    expect(checkDivisionEligibility(mixed, 'female', member('male'))).toBeNull();
    expect(checkDivisionEligibility(mixed, 'male', member('female'))).toBeNull();
    expect(checkDivisionEligibility(mixed, 'male', member('male'))).not.toBeNull();
    expect(checkDivisionEligibility(mixed, 'female', member('female'))).not.toBeNull();
    expect(checkDivisionEligibility(mixed, 'female', member(null))).not.toBeNull();
  });
});
