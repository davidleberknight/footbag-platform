/**
 * What an event owes once it ends: every event its results, a sanctioned one
 * also its after-event summary, both within twenty days of its last day. A
 * sanctioned event past that with no results shows the "sanctioning
 * requirements not met" badge; a summary still unsent keeps it owed without
 * the badge.
 */
import { describe, it, expect } from 'vitest';
import { eventObligations } from '../../src/services/eventService';

const SANCTIONED = { end_date: '2026-06-01', sanction_status: 'approved' };
const FREE = { end_date: '2026-06-01', sanction_status: 'none' };

describe('eventObligations', () => {
  it('owes nothing on the event\'s last day, before it has ended', () => {
    // An organizer must not be told results are owed while the event is still running.
    expect(eventObligations(SANCTIONED, false, false, '2026-06-01')).toMatchObject({ ended: false, resultsOwed: false, summaryOwed: false });
  });

  it('owes results and the summary of a sanctioned event the day after it ends', () => {
    expect(eventObligations(SANCTIONED, false, false, '2026-06-02')).toMatchObject({
      ended: true, resultsOwed: true, summaryOwed: true, deadline: '2026-06-21', overdue: false, showBadge: false,
    });
  });

  it('shows the badge from the twenty-first day after the last day, not on the twentieth', () => {
    // The rule gives twenty days; a badge a day early would brand an organizer who met it.
    expect(eventObligations(SANCTIONED, false, false, '2026-06-21').showBadge).toBe(false);
    expect(eventObligations(SANCTIONED, false, false, '2026-06-22').showBadge).toBe(true);
  });

  it('clears the badge once results are in, while an unsent summary stays owed', () => {
    // The badge follows the results alone.
    expect(eventObligations(SANCTIONED, true, false, '2026-07-30')).toMatchObject({ resultsOwed: false, summaryOwed: true, showBadge: false });
  });

  it('never owes an unsanctioned event a summary or shows it the badge', () => {
    expect(eventObligations(FREE, false, false, '2026-07-30')).toMatchObject({ resultsOwed: true, summaryOwed: false, showBadge: false });
  });

  it('counts the deadline across a month end', () => {
    expect(eventObligations({ end_date: '2026-12-20', sanction_status: 'approved' }, false, false, '2027-01-10').deadline).toBe('2027-01-09');
  });
});
