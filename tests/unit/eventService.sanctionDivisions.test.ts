/**
 * The sanctioned-tournament division check: every competition category (a
 * game at one entry size) must offer a Women's division and an Intermediate
 * division. The check names each category missing either, so the organizer is
 * warned before submitting and the reviewing administrator sees the same flag.
 */
import { describe, it, expect } from 'vitest';
import { missingSanctionDivisions } from '../../src/services/eventService';

type Division = Parameters<typeof missingSanctionDivisions>[0][number];

function div(o: Partial<Division>): Division {
  return {
    game_id: 'game_footbag_net', custom_game_name: null, discipline_category: 'net',
    team_type: 'singles', gender_eligibility: 'open', division_class: 'open', name: 'x',
    ...o,
  };
}

const NAMES: Record<string, string> = { game_footbag_net: 'Footbag Net', game_routines: 'Routines' };
const nameOf = (d: { game_id: string | null; custom_game_name: string | null; name: string }): string =>
  d.game_id ? NAMES[d.game_id] : d.custom_game_name ?? d.name;

describe('missingSanctionDivisions', () => {
  // Defect caught: an event with no divisions is warned of divisions it does
  // not even contest.
  it('finds nothing to warn of when the event has no divisions', () => {
    expect(missingSanctionDivisions([], nameOf)).toEqual([]);
  });

  // Defect caught: a complete category is still flagged, so every sanctioned
  // tournament is warned and the warning stops meaning anything.
  it('is satisfied by a Women\'s and an Intermediate division in the category', () => {
    expect(missingSanctionDivisions([
      div({}), div({ gender_eligibility: 'women' }), div({ division_class: 'intermediate' }),
    ], nameOf)).toEqual([]);
  });

  // Defect caught: an open-only category passes, so an administrator approves
  // a tournament that leaves out women and intermediate players.
  it('names both parts missing from an open-only category', () => {
    expect(missingSanctionDivisions([div({})], nameOf))
      .toEqual(["Women's in Singles Footbag Net", 'Intermediate in Singles Footbag Net']);
  });

  // Defect caught: Singles Net and Doubles Net are treated as one category,
  // so a women's singles division hides a missing women's doubles one.
  it('checks each entry size as its own category', () => {
    const missing = missingSanctionDivisions([
      div({ gender_eligibility: 'women' }), div({ division_class: 'intermediate' }),
      div({ team_type: 'doubles' }), div({ team_type: 'doubles', gender_eligibility: 'women', division_class: 'intermediate' }),
      div({ game_id: 'game_routines', discipline_category: 'freestyle', gender_eligibility: 'mixed', team_type: 'doubles' }),
    ], nameOf);
    expect(missing).toEqual(["Women's in Doubles Routines", 'Intermediate in Doubles Routines']);
  });

  // Defect caught: a mixed division is counted as the Women's division, so a
  // category with no division for women alone passes.
  it('does not count a mixed division as the Women\'s division', () => {
    expect(missingSanctionDivisions([
      div({ team_type: 'doubles', gender_eligibility: 'mixed', division_class: 'intermediate' }),
    ], nameOf)).toEqual(["Women's in Doubles Footbag Net"]);
  });

  // Defect caught: a historical division with no stated parts is flagged, or
  // makes the check throw, on an event carried over from the old site.
  it('leaves a division with no stated parts out of every category', () => {
    expect(missingSanctionDivisions([div({ gender_eligibility: null, division_class: null })], nameOf)).toEqual([]);
  });
});
