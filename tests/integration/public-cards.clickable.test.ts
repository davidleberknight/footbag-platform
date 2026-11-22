/**
 * A public card that leads to one place opens from a click anywhere on it:
 * exactly one of its links is the card's stretched link, it goes where the
 * card's title or button goes, and every other link inside the card keeps its
 * own target. A card with nothing to click, or a card that is a form, carries
 * no stretched link, so it never lifts under the pointer as if it could be
 * clicked. A second control repeating the card's link is kept out of the tab
 * order and hidden from assistive technology, so keyboard and screen-reader
 * users meet one link per card.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Window } from 'happy-dom';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { cachedGet } from '../fixtures/cachedGet';
import { insertClub, insertEvent } from '../fixtures/factories';

const { dbPath } = setTestEnv('7461');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const EVENT_TITLE = 'Clickable Card Open';
const CLUB_NAME = 'Clickable Card Footbag Club';
const CLUB_WEBSITE = 'https://clickable-card-club.example.org/';
const SECOND_CLUB_NAME = 'Clickable Card Second Club';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Real-shaped ids: the public directory leaves out the factory's default
  // test-club id, as it would a test row that reached a shared database.
  insertClub(db, {
    id: 'club-ar-clickable', name: CLUB_NAME, city: 'Buenos Aires', region: null, country: 'Argentina',
    status: 'active', publiclyVisible: true, external_url: CLUB_WEBSITE,
  });
  insertClub(db, {
    id: 'club-ar-second', name: SECOND_CLUB_NAME, city: 'Rosario', region: null, country: 'Argentina',
    status: 'active', publiclyVisible: true,
  });
  insertEvent(db, { title: EVENT_TITLE, status: 'reg_open' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

interface CardView {
  stretched: Array<{ href: string; text: string; tabindex: string | null }>;
  otherHrefs: string[];
  hiddenRepeats: Array<{ href: string; tabindex: string | null; ariaHidden: string | null }>;
}

/** Every `.card` on the page matching the selector, with its links sorted out. */
function cards(html: string, selector = '.card'): CardView[] {
  const window = new Window();
  window.document.write(html);
  return Array.from(window.document.querySelectorAll(selector)).map((card) => {
    const links = Array.from(card.querySelectorAll('a'));
    return {
      stretched: links
        .filter((a) => a.classList.contains('card-link'))
        .map((a) => ({ href: a.getAttribute('href') ?? '', text: (a.textContent ?? '').trim(), tabindex: a.getAttribute('tabindex') })),
      otherHrefs: links.filter((a) => !a.classList.contains('card-link')).map((a) => a.getAttribute('href') ?? ''),
      hiddenRepeats: links
        .filter((a) => !a.classList.contains('card-link') && a.getAttribute('aria-hidden') === 'true')
        .map((a) => ({ href: a.getAttribute('href') ?? '', tabindex: a.getAttribute('tabindex'), ariaHidden: a.getAttribute('aria-hidden') })),
    };
  });
}

/** The single-destination cards a page shows each carry exactly one stretched link. */
function expectOneStretchedLinkEach(views: CardView[], where: string): void {
  expect(views.length, `${where} shows cards`).toBeGreaterThan(0);
  views.forEach((v, i) => {
    expect(v.stretched, `${where} card ${i} has one stretched link`).toHaveLength(1);
    expect(v.stretched[0].href, `${where} card ${i} stretched link has a target`).not.toBe('');
  });
}

describe('upcoming event cards on /events', () => {
  it('open the event from anywhere on the card', async () => {
    const res = await page('/events');
    expect(res.status).toBe(200);
    const views = cards(res.text, '.card-grid .card');
    // Catches: an event card whose body is dead, so a visitor clicking beside
    // the title gets nothing.
    expectOneStretchedLinkEach(views, '/events');
    const seeded = views.find((v) => v.stretched[0].text === EVENT_TITLE);
    expect(seeded, 'the seeded event has a card').toBeDefined();
    // Catches: the stretched link pointing somewhere other than the event page.
    const event = await page(seeded!.stretched[0].href);
    expect(event.status).toBe(200);
    expect(event.text).toContain(EVENT_TITLE);
  });
});

describe('club cards on a clubs country page', () => {
  it('open the club from anywhere on the card while the website link keeps its own target', async () => {
    const res = await page('/clubs/argentina');
    expect(res.status).toBe(200);
    const views = cards(res.text, '[data-club-id]');
    // Catches: the clubs page drawing clubs as rows with no card link, so only
    // the name opens the club.
    expectOneStretchedLinkEach(views, '/clubs/argentina');
    expect(views).toHaveLength(2);
    const seeded = views.find((v) => v.stretched[0].text === CLUB_NAME);
    expect(seeded, 'the seeded club has a card').toBeDefined();
    // Catches: the card link leading anywhere but the club's own page.
    const club = await page(seeded!.stretched[0].href);
    expect(club.status).toBe(200);
    expect(club.text).toContain(CLUB_NAME);
    // Catches: the club website made the card link, or dropped, so a visitor
    // cannot reach it from the card.
    expect(seeded!.otherHrefs).toContain(CLUB_WEBSITE);
  });
});

describe('IFPA hub cards on /ifpa', () => {
  it('give each governance document one stretched link and keep the Read button out of the tab order', async () => {
    const res = await page('/ifpa');
    expect(res.status).toBe(200);
    const window = new Window();
    window.document.write(res.text);
    const docCards = Array.from(window.document.querySelectorAll('.card'))
      .filter((c) => c.querySelector('.card-title a.card-link'));
    expect(docCards.length, 'governance document cards are shown').toBeGreaterThan(0);
    for (const card of docCards) {
      const titleHref = card.querySelector('.card-title a.card-link')!.getAttribute('href');
      const repeats = Array.from(card.querySelectorAll('a.btn'));
      expect(repeats).toHaveLength(1);
      // Catches: the Read button still a tab stop, so a keyboard user meets
      // every document twice.
      expect(repeats[0].getAttribute('href')).toBe(titleHref);
      expect(repeats[0].getAttribute('tabindex')).toBe('-1');
      expect(repeats[0].getAttribute('aria-hidden')).toBe('true');
    }
    // Catches: a single-button card on the hub (join, Worlds bid, rules) left
    // with a dead body.
    const linkedCards = cards(res.text).filter((v) => v.stretched.length + v.otherHrefs.length > 0);
    expectOneStretchedLinkEach(linkedCards, '/ifpa');
    // Join, governance documents, Worlds bid and rules: every card on the hub
    // that leads anywhere is clickable.
    expect(linkedCards.length).toBe(docCards.length + 3);
  });
});

describe('button cards on home and /media', () => {
  it.each([['/'], ['/media']])('%s opens each card from anywhere on it through its one button', async (path) => {
    const res = await page(path);
    expect(res.status).toBe(200);
    const window = new Window();
    window.document.write(res.text);
    const buttonCards = Array.from(window.document.querySelectorAll('.card'))
      .filter((c) => c.querySelector('a.btn'));
    expect(buttonCards.length, `${path} shows button cards`).toBeGreaterThan(0);
    for (const card of buttonCards) {
      const buttons = Array.from(card.querySelectorAll('a.btn'));
      // Catches: a one-button card whose body is dead, or a card that stretches
      // a link other than its button.
      expect(buttons).toHaveLength(1);
      expect(buttons[0].classList.contains('card-link'), `${path} button is the card link`).toBe(true);
    }
  });
});
