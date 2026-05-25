import { describe, it, expect } from 'vitest';
import { groupPlayerResults, PlayerResultRow } from '../../src/services/playerShaping';

function makeRow(overrides: Partial<PlayerResultRow> = {}): PlayerResultRow {
  return {
    event_id:                 'evt-1',
    event_title:              'Test Event',
    start_date:               '2025-06-01',
    city:                     'Portland',
    event_region:             'Oregon',
    event_country:            'US',
    event_tag_normalized:     '#event_2025_test',
    discipline_name:          'Freestyle',
    discipline_category:      'freestyle',
    team_type:                'singles',
    placement:                1,
    score_text:               null,
    participant_display_name: 'Alice',
    participant_person_id:    'person-alice',
    participant_member_slug:  null,
    ...overrides,
  };
}

describe('groupPlayerResults', () => {
  it('returns empty array for empty input', () => {
    expect(groupPlayerResults([], {})).toEqual([]);
  });

  it('groups a single row into one event with one result', () => {
    const rows = [makeRow()];
    const result = groupPlayerResults(rows, {});

    expect(result).toHaveLength(1);
    expect(result[0].eventKey).toBe('event_2025_test');
    expect(result[0].eventHref).toBe('/events/event_2025_test');
    expect(result[0].eventTitle).toBe('Test Event');
    expect(result[0].results).toHaveLength(1);
    expect(result[0].results[0].placement).toBe(1);
    expect(result[0].results[0].teammates).toHaveLength(1);
    expect(result[0].results[0].teammates[0].name).toBe('Alice');
  });

  it('strips leading # from event_tag_normalized', () => {
    const rows = [makeRow({ event_tag_normalized: '#event_2025_worlds' })];
    const result = groupPlayerResults(rows, {});
    expect(result[0].eventKey).toBe('event_2025_worlds');
  });

  it('handles event_tag_normalized without leading #', () => {
    const rows = [makeRow({ event_tag_normalized: 'event_2025_worlds' })];
    const result = groupPlayerResults(rows, {});
    expect(result[0].eventKey).toBe('event_2025_worlds');
  });

  it('excludes self by selfPersonId', () => {
    const rows = [makeRow({ participant_person_id: 'person-self' })];
    const result = groupPlayerResults(rows, { selfPersonId: 'person-self' });

    expect(result[0].results[0].teammates).toHaveLength(0);
  });

  it('excludes self by selfMemberId', () => {
    const rows = [makeRow({ participant_member_id: 'member-self' })];
    const result = groupPlayerResults(rows, { selfMemberId: 'member-self' });

    expect(result[0].results[0].teammates).toHaveLength(0);
  });

  it('does not exclude when selfPersonId does not match', () => {
    const rows = [makeRow({ participant_person_id: 'person-other' })];
    const result = groupPlayerResults(rows, { selfPersonId: 'person-self' });

    expect(result[0].results[0].teammates).toHaveLength(1);
  });

  it('groups multiple events separately', () => {
    const rows = [
      makeRow({ event_tag_normalized: '#event_2025_a', event_title: 'Event A' }),
      makeRow({ event_tag_normalized: '#event_2025_b', event_title: 'Event B' }),
    ];
    const result = groupPlayerResults(rows, {});

    expect(result).toHaveLength(2);
    expect(result[0].eventTitle).toBe('Event A');
    expect(result[1].eventTitle).toBe('Event B');
  });

  it('groups same discipline + placement into one result entry', () => {
    const rows = [
      makeRow({ participant_display_name: 'Alice', participant_person_id: 'p-a' }),
      makeRow({ participant_display_name: 'Bob', participant_person_id: 'p-b' }),
    ];
    const result = groupPlayerResults(rows, {});

    expect(result[0].results).toHaveLength(1);
    expect(result[0].results[0].teammates).toHaveLength(2);
    expect(result[0].results[0].teammates.map(t => t.name)).toEqual(['Alice', 'Bob']);
  });

  it('creates separate entries for different disciplines', () => {
    const rows = [
      makeRow({ discipline_name: 'Freestyle', placement: 1 }),
      makeRow({ discipline_name: 'Net', placement: 1 }),
    ];
    const result = groupPlayerResults(rows, {});

    expect(result[0].results).toHaveLength(2);
    expect(result[0].results[0].disciplineName).toBe('Freestyle');
    expect(result[0].results[1].disciplineName).toBe('Net');
  });

  it('creates separate entries for different placements in same discipline', () => {
    const rows = [
      makeRow({ placement: 1, participant_display_name: 'Alice', participant_person_id: 'p-a' }),
      makeRow({ placement: 2, participant_display_name: 'Bob', participant_person_id: 'p-b' }),
    ];
    const result = groupPlayerResults(rows, {});

    expect(result[0].results).toHaveLength(2);
  });

  it('deduplicates teammates with same display name', () => {
    const rows = [
      makeRow({ participant_display_name: 'Alice', participant_person_id: 'p-a' }),
      makeRow({ participant_display_name: 'Alice', participant_person_id: 'p-a' }),
    ];
    const result = groupPlayerResults(rows, {});

    expect(result[0].results[0].teammates).toHaveLength(1);
  });

  it('resolves teammate playerHref from member slug', () => {
    const rows = [makeRow({ participant_member_slug: 'alice_smith', participant_person_id: 'p-a' })];
    const result = groupPlayerResults(rows, {});

    expect(result[0].results[0].teammates[0].playerHref).toBe('/members/alice_smith');
  });

  it('resolves teammate playerHref from person ID when no slug', () => {
    const rows = [makeRow({ participant_member_slug: null, participant_person_id: 'person-123' })];
    const result = groupPlayerResults(rows, {});

    expect(result[0].results[0].teammates[0].playerHref).toBe('/history/person-123');
  });

  it('sets teammate playerHref to undefined when neither slug nor person ID', () => {
    const rows = [makeRow({ participant_member_slug: null, participant_person_id: null })];
    const result = groupPlayerResults(rows, {});

    expect(result[0].results[0].teammates[0].playerHref).toBeUndefined();
  });

  // ─── Sick-discipline trick-anomaly filter ────────────────────────────
  //
  // Regression for the 2013 Todexon 14 / 2015 Worlds Copenhagen /
  // 2016 + 2025 Eurochamp Frankfurt etc. event-results bug:
  // the canonical event_result_participants.csv loaded the performed
  // trick name as a second participant (participant_order=2, no
  // person_id, no member_id) on solo "Sick Trick" / "Sick 3-Trick"
  // disciplines. The renderer surfaced this as "Tied with: <trick name>"
  // on player profile pages. Fix: filter these rows from the teammates
  // list (data stays in DB for a future performance-note surface).

  describe('sick-discipline trick-anomaly filter', () => {
    it('skips a Sick 3-Trick row carrying a trick name as a second participant', () => {
      // Todexon 14 — Jindrich Smola, Open Sick 3-Trick, place 2.
      // Canonical CSV has two participant rows: Jindrich (order 1,
      // person_id set) + trick name (order 2, no IDs).
      const rows = [
        makeRow({
          discipline_name:          'Open Sick 3-Trick',
          placement:                2,
          team_type:                'singles',
          participant_display_name: 'Jindrich Smola',
          participant_person_id:    'person-jindrich',
        }),
        makeRow({
          discipline_name:          'Open Sick 3-Trick',
          placement:                2,
          team_type:                'singles',
          participant_display_name: 'Paradox Swirl>mullet>steping torque',
          participant_person_id:    null,
          participant_member_slug:  null,
        }),
      ];
      const result = groupPlayerResults(rows, { selfPersonId: 'person-jindrich' });

      expect(result).toHaveLength(1);
      expect(result[0].results).toHaveLength(1);
      // The trick name must NOT appear as a teammate.
      expect(result[0].results[0].teammates).toHaveLength(0);
      // Singles result with no teammates → no "Tied with:" rendering.
      expect(result[0].results[0].detailPrefix).toBe('');
    });

    it('skips a Sick Trick row carrying a trick name as a second participant', () => {
      // Todexon 14 — Milan Benda, Open Sick Trick, place 1.
      // Trick name "Genesis Rake" is loaded as order-2 participant.
      const rows = [
        makeRow({
          discipline_name:          'Open Sick Trick',
          placement:                1,
          team_type:                'singles',
          participant_display_name: 'Milan Benda',
          participant_person_id:    'person-milan',
        }),
        makeRow({
          discipline_name:          'Open Sick Trick',
          placement:                1,
          team_type:                'singles',
          participant_display_name: 'Genesis Rake',
          participant_person_id:    null,
          participant_member_slug:  null,
        }),
      ];
      const result = groupPlayerResults(rows, { selfPersonId: 'person-milan' });

      expect(result[0].results[0].teammates).toHaveLength(0);
      expect(result[0].results[0].detailPrefix).toBe('');
    });

    it('preserves legitimate doubles partners with no person_id (doubles disciplines)', () => {
      // Negative case: a doubles-net partner whose person_id has not
      // been identity-resolved upstream. Display name only. Must STILL
      // render as a teammate (the trick-anomaly filter only applies to
      // sick disciplines).
      const rows = [
        makeRow({
          discipline_name:          'Open Doubles Net',
          placement:                1,
          team_type:                'doubles',
          participant_display_name: 'Tomas Tucek',
          participant_person_id:    'person-tomas',
        }),
        makeRow({
          discipline_name:          'Open Doubles Net',
          placement:                1,
          team_type:                'doubles',
          participant_display_name: 'Martin Sladek',
          participant_person_id:    null,
          participant_member_slug:  null,
        }),
      ];
      const result = groupPlayerResults(rows, { selfPersonId: 'person-tomas' });

      // Doubles partner without person_id is still a legitimate teammate.
      expect(result[0].results[0].teammates).toHaveLength(1);
      expect(result[0].results[0].teammates[0].name).toBe('Martin Sladek');
      expect(result[0].results[0].detailPrefix).toBe('With partner: ');
    });

    it('preserves a sick-discipline teammate that DOES have a person_id (defensive)', () => {
      // Belt-and-suspenders case: if a "sick" discipline ever had a
      // legitimate second human (collaborator, judge co-credit, etc.)
      // with an identity, do NOT silently drop them. The filter only
      // applies when both person_id AND member_id are missing.
      const rows = [
        makeRow({
          discipline_name:          'Open Sick Trick',
          placement:                1,
          team_type:                'singles',
          participant_display_name: 'Performer Alpha',
          participant_person_id:    'person-alpha',
        }),
        makeRow({
          discipline_name:          'Open Sick Trick',
          placement:                1,
          team_type:                'singles',
          participant_display_name: 'Performer Beta',
          participant_person_id:    'person-beta',
        }),
      ];
      const result = groupPlayerResults(rows, { selfPersonId: 'person-alpha' });

      expect(result[0].results[0].teammates).toHaveLength(1);
      expect(result[0].results[0].teammates[0].name).toBe('Performer Beta');
    });
  });
});
