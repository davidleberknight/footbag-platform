/**
 * The wording of the automatic news items an event emits. Pure, with no
 * database access, so the persona seed can word the item an event it seeds
 * would have produced through the real flow exactly as the news service does.
 */
import { escapeNewsMarkdown } from '../lib/newsMarkdown';
import { personLocation } from './countryUtils';
import { eventDateRange } from './eventListing';

/** The three moments an event emits an automatic item. */
export type EventNewsKind = 'opened' | 'sanctioned' | 'results';

/** The event fields an automatic item's wording names. */
export interface EventNewsFacts {
  title: string;
  start_date: string;
  end_date: string;
  city: string;
  region: string | null;
  country: string;
}

/**
 * An automatic event item's title and Markdown body. The title is plain text,
 * shown escaped; inside the body the organizer's own words (the title and the
 * location) are escaped so they render exactly as typed.
 */
export function eventItemText(kind: EventNewsKind, event: EventNewsFacts): { title: string; body: string } {
  const name = escapeNewsMarkdown(event.title);
  const dates = escapeNewsMarkdown(eventDateRange(event.start_date, event.end_date));
  const where = escapeNewsMarkdown(personLocation(event.city, event.region, event.country)?.text ?? '');
  switch (kind) {
    case 'opened':
      return {
        title: `Upcoming event: ${event.title}`,
        body: `${name} runs ${dates} in ${where}. Details and registration are on the event page.`,
      };
    case 'sanctioned':
      return {
        title: `${event.title} is sanctioned by IFPA`,
        body: `IFPA has sanctioned ${name}, which runs ${dates} in ${where}. Details and registration are on the event page.`,
      };
    case 'results':
      return {
        title: `Results posted for ${event.title}`,
        body: `The results of ${name}, held ${dates} in ${where}, are now on the event page.`,
      };
  }
}
