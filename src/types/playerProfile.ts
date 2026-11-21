/**
 * Shared types for player profile views (history detail, member profile, public profile).
 * All three views render the same entity -- a footbag player -- at different access levels.
 */
import type { PersonLocation } from '../services/countryUtils';

export interface PlayerResultEntry {
  disciplineName: string | null;
  disciplineCategory: string | null;
  teamType: string | null;
  placement: number;
  /** The placing's medal colour class, or empty. */
  medalClass: string;
  scoreText: string | null;
  teammates: { name: string; playerHref?: string }[];
  isTie: boolean;
  /** Per-row prefix: "Tied with ", "Tied with " before partners, or "" */
  detailPrefix: string;
}

export interface PlayerEventGroup {
  eventKey: string;
  eventHref: string;
  eventTitle: string;
  startDate: string;
  city: string;
  eventRegion: string | null;
  eventCountry: string;
  /** Where the event was held, in the site's one location form. */
  locationText: string | null;
  /** The event's media gallery, when its hashtag carries media. */
  galleryHref: string | null;
  results: PlayerResultEntry[];
}

export interface PlayerHeroData {
  displayName: string;
  honorificNickname?: string;
  isHof: boolean;
  isBap: boolean;
  isBoard?: boolean;
  hofInductionYear?: number;
  bapInductionYear?: number;
  historicalPersonName?: string | null;
  // The facts strip shows this as a labeled fact; the shaping service has
  // already left out any city and region the viewer may not see.
  location?: PersonLocation | null;
  firstCompetitionYear?: number | null;
  showFirstCompetitionYear?: boolean;
  // A historical record with no honor, so the hero says what the page is: a
  // record of a player, not a member account.
  isHistoricalOnly?: boolean;
}
