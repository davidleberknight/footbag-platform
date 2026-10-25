/**
 * XSquareService -- public X Square landing page (read-only).
 *
 * Serves:
 *   - GET /x-square (public): canonical X Square section entry. X Square is the category of
 *     2-Square, 4-Square and 5-Square.
 *
 * Rendering contract:
 *   - getXSquarePage() returns PageViewModel<XSquareContent>.
 *   - Static hero carrying the 2-Square artwork as its mascot, an explainer, then 2-Square and
 *     4-Square, each with its cartoon icon beside the heading, an optional demo .webm clip and
 *     internal "More info" links (its rules page under /rules/x-square/, the court setup section of
 *     the equipment page).
 */
import { PageViewModel } from '../types/page';
import { SportSectionContent, SportSectionGame } from '../types/sportSection';

export type XSquareContent = SportSectionContent;

const TWO_SQUARE: SportSectionGame = {
  slug: 'two-square',
  title: '2-Square',
  iconSrc: '/img/sideline-icon-twosquare.svg',
  iconAlt: 'Two figures playing footbag across a line',
  paragraphs: [
    '2-Square takes the classic schoolyard square game and combines it with footbag. Score points against your opponent by making the bag drop in their square while keeping it from dropping in yours.',
  ],
  demoVideo: null,
  moreInfo: [
    {
      label: '2-Square Rules',
      href: '/rules/x-square/2-square',
      external: false,
    },
    {
      label: 'Court Setup',
      href: '/equipment#square-games',
      external: false,
    },
  ],
};

const FOUR_SQUARE: SportSectionGame = {
  slug: 'four-square',
  title: '4-Square',
  iconSrc: '/img/sideline-icon-twosquare.svg',
  iconAlt: 'Players in a four-square footbag layout',
  paragraphs: [
    '4-Square is the four-player variant of the same idea: four squares, four players, score points by landing the footbag in someone else\'s square without letting it land in your own. Fast, social, and easy to set up on any flat surface.',
  ],
  demoVideo: {
    webmUrl: '/video/sideline/foursquare.webm',
    caption: '4-Square demo',
  },
  moreInfo: [
    {
      label: '4-Square Rules',
      href: '/rules/x-square/4-square',
      external: false,
    },
    {
      label: 'Court Setup',
      href: '/equipment#square-games',
      external: false,
    },
  ],
};

export const xSquareService = {
  getXSquarePage(): PageViewModel<XSquareContent> {
    return {
      seo: { title: 'X Square' },
      page: {
        sectionKey: 'x-square',
        pageKey: 'x_square_home',
        title: 'X Square',
        intro: '2-Square, 4-Square and 5-Square.',
      },
      content: {
        mascot: { src: '/img/sideline-icon-twosquare.svg', alt: 'Two figures playing footbag across a line' },
        explainer: {
          heading: 'What Is X Square?',
          paragraphs: [
            [{ text: 'X Square covers 2-Square, 4-Square and 5-Square. Each player defends a square and scores by making the footbag drop in another player\'s square. 2-Square is the one contested at tournaments. 4-Square and 5-Square are the same idea for more players.' }],
          ],
        },
        games: [TWO_SQUARE, FOUR_SQUARE],
      },
    };
  },
};
