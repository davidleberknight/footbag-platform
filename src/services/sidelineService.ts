/**
 * SidelineService -- public Sideline landing page (read-only).
 *
 * Serves:
 *   - GET /sideline (public): canonical sideline section entry. Sideline is open play, which
 *     anyone joins with no registration and no bracket.
 *
 * Rendering contract:
 *   - getSidelinePage() returns PageViewModel<SidelineContent>.
 *   - Static hero with the circle-kicking mascot, then one circle kicking section (anchor `#hack`,
 *     which the Hack menu entry opens) with its cartoon icon, whose last paragraph places it within
 *     sideline and links the X-Square games (also played as open play), then its curated demo clip
 *     (absent until the curator seed stores it) and a "More info" link to the footbags section of
 *     the equipment page. There is no separate explainer, so no fact is told twice.
 *   - Paragraphs are prose segments; a segment carrying `href` renders as an internal link inside
 *     the sentence.
 */
import { PageViewModel } from '../types/page';
import { SportSectionContent, SportSectionGame } from '../types/sportSection';
import { loadSiteVideo } from './siteMediaService';

export type SidelineContent = SportSectionContent;

const CIRCLE_KICKING: SportSectionGame = {
  // The anchor the Hack menu entry opens.
  slug: 'hack',
  title: 'Circle Kicking ("Hacky Sack")',
  iconSrc: '/img/sideline-icon-hackysack.svg',
  iconAlt: 'Two figures circle-kicking a footbag',
  paragraphs: [
    [{ text: 'Circle kicking, commonly known as "Hacky Sack," is the original and most well-known footbag game, and how most players first picked up a footbag. A group stands in a circle and keeps the footbag off the ground without using their hands, passing to other players and trying to get everyone to kick the bag before it drops, known as getting a "hack." Simple tricks are encouraged, but the focus stays on the group and the flow: it is cooperative, not competitive, and everyone plays together.' }],
    [{ text: 'The game\'s inventors called it "hacking the sack," and the brand name "Hacky Sack" came later. Many players today also call it free flow footbag.' }],
    [
      { text: 'Circle kicking is part of sideline play, the casual and social side of the sport: anyone can turn up and join in, with nothing to register for and no bracket. Sideline also includes the ' },
      { text: 'X-Square games', href: '/x-square' },
      { text: '.' },
    ],
  ],
  // Filled per request from the curated circle kicking demo slot.
  demoVideo: null,
  moreInfo: [
    {
      label: 'Footbag Equipment',
      href: '/equipment#footbags',
      external: false,
    },
  ],
};

export const sidelineService = {
  getSidelinePage(): PageViewModel<SidelineContent> {
    return {
      seo: { title: 'Sideline' },
      page: {
        sectionKey: 'sideline',
        pageKey: 'sideline_home',
        title: 'Sideline',
        intro: 'Open play that anyone can join, starting with getting a hack: the cooperative circle game commonly known as "Hacky Sack."',
      },
      content: {
        mascot: { src: '/img/sideline-hackysack-hero.svg', alt: 'Two figures circle-kicking a footbag' },
        explainer: null,
        games: [{ ...CIRCLE_KICKING, demoVideo: loadSiteVideo('circle_kicking_demo') }],
      },
    };
  },
};
