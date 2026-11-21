/**
 * The two names an organizer's event surfaces generate rather than take as
 * typed: a division's display name from its parts, and the hashtag slug
 * suggested from an event's title.
 */
import { describe, it, expect } from 'vitest';
import { divisionName, suggestEventSlug } from '../../src/services/eventService';

describe('a division name', () => {
  // Defect caught: a women's or mixed division reads as an open one, or the
  // parts come out in an order that makes two divisions look alike, because
  // the name is the only thing a registrant reads to pick a division.
  it('reads class, then gender, then entry size, then game', () => {
    expect(divisionName('intermediate', 'women', 'singles', 'Footbag Net')).toBe("Intermediate Women's Singles Net");
    expect(divisionName('open', 'mixed', 'doubles', 'Footbag Net')).toBe('Open Mixed Doubles Net');
  });

  // Defect caught: a new division named "Open Singles Footbag Net" while the
  // historical results of that competition read "Open Singles Net", so one
  // competition shows under two names on a player's results.
  it('prints the game without the word Footbag', () => {
    expect(divisionName('open', 'open', 'singles', 'Footbag Golf')).toBe('Open Singles Golf');
    expect(divisionName('open', 'open', 'singles', '30 Second Shred')).toBe('Open Singles 30 Second Shred');
  });

  // Defect caught: an open division carries a stray "Open" gender word, so
  // "Open Open Singles" appears, or a blank leaves a double space.
  it('leaves the gender out of an open division', () => {
    expect(divisionName('masters', 'open', 'doubles', 'Routines')).toBe('Masters Doubles Routines');
  });

  // Defect caught: an organizer's own game name is dropped or recased, so the
  // division cannot be told apart from a listed game.
  it('keeps an unlisted game named as the organizer typed it', () => {
    expect(divisionName('novice', 'open', 'singles', 'Hacky Relay')).toBe('Novice Singles Hacky Relay');
  });
});

describe('a suggested event hashtag slug', () => {
  // Defect caught: the suggestion repeats the year the hashtag already
  // carries, as in #event_2025_beaver_open_2025.
  it('folds the title and drops the event\'s own year', () => {
    expect(suggestEventSlug('Beaver Open 2025', '2025')).toBe('beaver_open');
    expect(suggestEventSlug('2025 Worlds', '2025')).toBe('worlds');
  });

  // Defect caught: a different year in the title, which names something
  // else (a twentieth-anniversary event), is stripped as if it were the
  // event's own.
  it('keeps a year that is not the event\'s own', () => {
    expect(suggestEventSlug('Spirit of 1999 Jam', '2025')).toBe('spirit_of_1999_jam');
  });

  // Defect caught: accented letters are dropped rather than spelled out,
  // so the suggestion differs from what the slug rule stores.
  it('folds accented letters by the one slug rule', () => {
    expect(suggestEventSlug('Zürich Café Cup', '2026')).toBe('zurich_cafe_cup');
  });

  it('suggests nothing from a title that is only the year', () => {
    expect(suggestEventSlug('2026', '2026')).toBe('');
  });
});
