/**
 * How an event is listed: one dated item for an upcoming or a completed event,
 * and the status badge every event surface shows.
 *
 * The contract: an open event reads as closed once its cutoff day has ended or
 * while its organizers have paused registration, because the form refuses a
 * registration then; the cutoff day itself still reads as open. An upcoming
 * item carries that badge; a completed item carries none and names its
 * hashtag. The date is one range, the location the site's one location form,
 * and a gallery is a link only when there is one.
 */
import { describe, it, expect } from 'vitest';
import { eventStatusBadge, toEventDatedItem, type EventListingRow } from '../../src/services/eventListing';

const open: EventListingRow = {
  title: 'Mountain Open',
  description: 'Two days of net and freestyle.',
  start_date: '2031-05-20',
  end_date: '2031-05-21',
  city: 'Boulder',
  region: 'CO',
  country: 'United States',
  host_club: 'Boulder Footbag Club',
  status: 'reg_open',
  registration_status: 'open',
  registration_deadline: '2031-05-10',
  tag_normalized: '#event_2031_mountain_open',
  tag_display: '#event_2031_mountain_open',
};

describe('the registration status badge', () => {
  // Defect caught: a visitor is told registration is open when the form will
  // refuse them, or an event on its last registration day reads as closed.
  it('reads open through the cutoff day, and closed after it or while paused', () => {
    expect(eventStatusBadge(open, '2031-05-10T23:00:00.000Z')).toEqual({ text: 'Registration open', cssClass: 'badge-reg_open' });
    expect(eventStatusBadge(open, '2031-05-11T00:00:00.000Z')).toEqual({ text: 'Registration closed', cssClass: 'badge-closed' });
    expect(eventStatusBadge({ ...open, registration_status: 'closed' }, '2031-05-01T00:00:00.000Z'))
      .toEqual({ text: 'Registration closed', cssClass: 'badge-closed' });
    expect(eventStatusBadge({ ...open, registration_deadline: null }, '2031-05-20T08:00:00.000Z').text).toBe('Registration open');
  });
});

describe('an event as a dated item', () => {
  // Defect caught: an upcoming event's card loses its link, its date range,
  // where it is, its host, its status or its hashtag, so a visitor cannot plan
  // to go or learn the tag to share their photos under; or a hashtag no media
  // carries links to an empty gallery.
  it('shapes an upcoming event with its range, location, host, status and plain hashtag', () => {
    const item = toEventDatedItem(open, { todayIso: '2031-05-01T00:00:00.000Z' });
    expect(item.href).toBe('/events/event_2031_mountain_open');
    expect(item.date).toBe('20–21 May 2031');
    expect(item.label).toEqual({ text: 'Registration open', cssClass: 'badge-reg_open' });
    expect(item.meta).toEqual([
      { text: 'Boulder, CO, United States' },
      { text: 'Boulder Footbag Club' },
      { text: '#event_2031_mountain_open', isHashtag: true },
    ]);
    expect(item.excerpt).toBe(open.description);
  });

  // Defect caught: a completed event shows a registration badge, or its
  // hashtag does not open the gallery its media fills, or the gallery link is
  // missing, or a blank description renders an empty line.
  it('shapes a completed event with its linked hashtag, its gallery and no badge', () => {
    const item = toEventDatedItem(
      { ...open, status: 'completed', description: '   ', host_club: null, region: null },
      { todayIso: '', galleryHref: '/media/browse?context=event_2031_mountain_open' },
    );
    expect(item.label).toBeNull();
    expect(item.excerpt).toBeNull();
    expect(item.meta).toEqual([
      { text: 'Boulder, United States' },
      { text: '#event_2031_mountain_open', href: '/media/browse?context=event_2031_mountain_open', isHashtag: true },
      { text: 'Gallery', href: '/media/browse?context=event_2031_mountain_open' },
    ]);
  });
});
