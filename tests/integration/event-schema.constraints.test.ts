/**
 * Database constraints on the structured event division, the sanction request's
 * prize money, the seeded game list and the pre-event reminder ledger.
 *
 * Each refusal sits beside a row the same constraint accepts, so a constraint
 * that refuses everything fails here too. Rows are written through the shared
 * factories, whose overrides are wide enough to carry the values the database
 * must refuse; the game-list rows are the one exception, written as statements
 * because no factory builds a game row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertEvent,
  insertDiscipline,
  insertMember,
  insertRegistration,
  insertEventRegistrationReminderSent,
} from '../fixtures/factories';
import { assertAppendOnly } from '../fixtures/assertAppendOnly';

const { dbPath } = setTestEnv('4900');

let db: BetterSqlite3.Database;
let eventId: string;

beforeAll(() => {
  db = createTestDb(dbPath);
  eventId = insertEvent(db);
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('event division structure', () => {
  it('refuses the retired mixed_doubles entry size and accepts doubles', () => {
    // A division stored as mixed_doubles would carry no gender part, so the
    // registration gender check would have nothing to enforce.
    expect(() => insertDiscipline(db, eventId, { name: 'Retired Mixed', team_type: 'mixed_doubles' }))
      .toThrow(/CHECK constraint failed/);
    expect(() => insertDiscipline(db, eventId, { name: 'Open Doubles Net', discipline_category: 'net', team_type: 'doubles' }))
      .not.toThrow();
  });

  it('refuses mixed gender on a singles division and accepts it on doubles', () => {
    // A mixed singles division is one no entry could ever satisfy: mixed needs
    // a male and a female partner.
    expect(() => insertDiscipline(db, eventId, {
      name: 'Mixed Singles Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'mixed',
    })).toThrow(/CHECK constraint failed/);
    expect(() => insertDiscipline(db, eventId, {
      name: 'Mixed Doubles Net', discipline_category: 'net', team_type: 'doubles', gender_eligibility: 'mixed',
    })).not.toThrow();
  });

  it('refuses an unknown discipline and accepts the historical sideline family', () => {
    // A typo'd family files the division under no discipline section at all.
    expect(() => insertDiscipline(db, eventId, { name: 'Odd One', discipline_category: 'other' }))
      .toThrow(/CHECK constraint failed/);
    expect(() => insertDiscipline(db, eventId, { name: 'Old 2-Square', discipline_category: 'sideline' }))
      .not.toThrow();
  });

  it('refuses a gender or class outside the vocabulary', () => {
    // An unknown value would pass no registration gate the service knows.
    expect(() => insertDiscipline(db, eventId, {
      name: 'Bad Gender', gender_eligibility: 'men' as unknown as 'open',
    })).toThrow(/CHECK constraint failed/);
    expect(() => insertDiscipline(db, eventId, {
      name: 'Bad Class', division_class: 'pro' as unknown as 'open',
    })).toThrow(/CHECK constraint failed/);
    expect(() => insertDiscipline(db, eventId, {
      name: 'Masters Women Net', discipline_category: 'net', gender_eligibility: 'women', division_class: 'masters',
    })).not.toThrow();
  });

  it('names its game from the list or by the organizer, never both, and never an unlisted id', () => {
    // Two game names on one division would leave the display name ambiguous;
    // a dangling game id would name a game nobody can see.
    expect(() => insertDiscipline(db, eventId, {
      name: 'Both Games', discipline_category: 'net', game_id: 'game_footbag_net', custom_game_name: 'Beach Net',
    })).toThrow(/CHECK constraint failed/);
    expect(() => insertDiscipline(db, eventId, {
      name: 'Ghost Game', discipline_category: 'net', game_id: 'game_does_not_exist',
    })).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => insertDiscipline(db, eventId, {
      name: 'Listed Game', discipline_category: 'net', game_id: 'game_footbag_net',
    })).not.toThrow();
    expect(() => insertDiscipline(db, eventId, {
      name: 'Custom Game', discipline_category: 'freestyle', custom_game_name: 'Shred Relay',
    })).not.toThrow();
  });
});

describe('event prize money', () => {
  it('stores the total and its currency together or not at all', () => {
    // A total with no currency cannot be shown to the reviewing administrator.
    expect(() => insertEvent(db, { prize_money_total_cents: 50000 }))
      .toThrow(/CHECK constraint failed/);
    expect(() => insertEvent(db, { prize_money_currency: 'USD' }))
      .toThrow(/CHECK constraint failed/);
    expect(() => insertEvent(db, { prize_money_total_cents: 50000, prize_money_currency: 'USD' }))
      .not.toThrow();
  });
});

describe('seeded game list', () => {
  function insertGame(id: string, flags: { singles: 0 | 1; doubles: 0 | 1; mixed: 0 | 1 }): void {
    // factory-cannot-express: no factory builds a game row; the statement is the
    // subject of the assertion, the list refusing a malformed game.
    db.prepare(`
      INSERT INTO discipline_games (
        id, created_at, created_by, updated_at, updated_by, version,
        discipline_category, name, sort_order,
        allows_singles, allows_doubles, allows_open, allows_women, allows_mixed,
        allows_novice, allows_intermediate, allows_open_class, allows_masters
      ) VALUES (?, 'x', 'test', 'x', 'test', 1, 'net', ?, 99, ?, ?, 1, 1, ?, 1, 1, 1, 1)
    `).run(id, id, flags.singles, flags.doubles, flags.mixed);
  }

  it('refuses a game admitting mixed without doubles, or no entry size at all', () => {
    // The creation form would then offer a division no entry could fill.
    expect(() => insertGame('game_bad_mixed', { singles: 1, doubles: 0, mixed: 1 }))
      .toThrow(/CHECK constraint failed/);
    expect(() => insertGame('game_no_size', { singles: 0, doubles: 0, mixed: 0 }))
      .toThrow(/CHECK constraint failed/);
    expect(() => insertGame('game_ok', { singles: 1, doubles: 1, mixed: 1 }))
      .not.toThrow();
  });
});

describe('pre-event reminder ledger', () => {
  it('records one reminder per registration and event date, and never changes', () => {
    // A second row for the same date would let the job remind a registrant
    // twice; a moved event must be able to remind again.
    const memberId = insertMember(db);
    const regId = insertRegistration(db, eventId, memberId);
    const firstId = insertEventRegistrationReminderSent(db, regId, { event_start_date: '2027-06-01' });

    expect(() => insertEventRegistrationReminderSent(db, regId, { event_start_date: '2027-06-01' }))
      .toThrow(/UNIQUE constraint failed/);
    expect(() => insertEventRegistrationReminderSent(db, regId, { event_start_date: '2027-06-08' }))
      .not.toThrow();
    assertAppendOnly(db, 'event_registration_reminder_sent', firstId);
  });
});
