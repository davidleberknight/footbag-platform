/**
 * The Events landing page stops featuring an event once it has finished.
 *
 * The unit test beside this one pins the day comparison; this one pins the
 * wiring, which is the half that actually broke: the landing page already
 * received the current time and used it only for the upcoming list, so the
 * featured card rendered unconditionally and kept announcing a finished event
 * in the future tense. The card is hand-authored, so the assertions here are
 * about whether it is present at all, not about its copy.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('4135');

let eventService: typeof import('../../src/services/eventService').eventService;
let promoEndDate: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  ({ eventService } = await import('../../src/services/eventService'));
  // Read the card's own end date rather than restating it, so the test follows
  // the featured event when the next one is authored.
  const seen = eventService.getPublicEventsLandingPage('2000-01-01T00:00:00.000Z');
  promoEndDate = seen.content.featuredPromo!.endDate;
});

afterAll(() => cleanupTestDb(dbPath));

function dayAfter(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T09:00:00.000Z`;
}

describe('GET /events — featured promo lifecycle', () => {
  it('carries the featured card while the event is still ahead', () => {
    const vm = eventService.getPublicEventsLandingPage('2000-01-01T00:00:00.000Z');
    expect(vm.content.featuredPromo).toBeDefined();
    expect(vm.content.featuredPromo!.title.length).toBeGreaterThan(0);
  });

  it('carries it on the event’s final day', () => {
    const vm = eventService.getPublicEventsLandingPage(`${promoEndDate}T18:00:00.000Z`);
    expect(vm.content.featuredPromo).toBeDefined();
  });

  it('drops it the day after the event ends', () => {
    const vm = eventService.getPublicEventsLandingPage(dayAfter(promoEndDate));
    expect(vm.content.featuredPromo).toBeUndefined();
  });

  it('drops it long after the event, without anyone editing the card', () => {
    const vm = eventService.getPublicEventsLandingPage('2099-01-01T00:00:00.000Z');
    expect(vm.content.featuredPromo).toBeUndefined();
  });

  it('leaves the rest of the landing page intact once the card retires', () => {
    const vm = eventService.getPublicEventsLandingPage('2099-01-01T00:00:00.000Z');
    expect(vm.page.title).toBe('Footbag Events');
    expect(Array.isArray(vm.content.upcomingEvents)).toBe(true);
    expect(Array.isArray(vm.content.archiveYears)).toBe(true);
  });
});
