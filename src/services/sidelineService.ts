/**
 * SidelineService -- public Hack page (read-only).
 *
 * Serves:
 *   - GET /sideline (public): the Hack page, which the Hack menu entry opens at its top. It
 *     presents open play.
 *
 * Rendering contract:
 *   - getSidelinePage() returns PageViewModel<SidelineContent>.
 *   - Static hero titled Hack with the circle-kicking mascot, then one circle kicking section with
 *     its cartoon icon, whose last paragraph places it within sideline play and names 2-Square and
 *     4-Square, linking the X-Square page (also played as open play), then its curated demo clip
 *     (absent until the curator seed stores it). It carries no "More info" links. There is no
 *     separate explainer, so no fact is told twice.
 *   - Paragraphs are prose segments; a segment carrying `href` renders as an internal link inside
 *     the sentence.
 */
import { PageViewModel } from '../types/page';
import { SportSectionContent, SportSectionGame } from '../types/sportSection';
import { loadSiteVideo } from './siteMediaService';

export type SidelineContent = SportSectionContent;

const CIRCLE_KICKING: SportSectionGame = {
  slug: 'hack',
  title: 'Circle Kicking ("Hacky Sack")',
  iconSrc: '/img/sideline-icon-hackysack.svg',
  iconAlt: 'Two figures circle-kicking a footbag',
  paragraphs: [
    [{ text: 'Circle kicking, commonly known as "Hacky Sack," is the original footbag game, and still the most popular globally, probably because it is cooperative social fun exercise. The goal is to get a hack, which is when everybody kicks it at least once, then get a double hack... That is, the group stands in a circle and keeps the footbag off the ground without using their hands, passing to other players and trying to get everyone to kick the bag before it drops. Simple tricks are encouraged, but the focus stays on the group and the flow. The game\'s inventors called this "hacking the sack," and the brand name "Hacky Sack" came later. Many players today also call this free flow footbag, but even then they will say, "Let\'s get a hack!"' }],
    [
      { text: 'Circle kicking is part of sideline play, the casual and social side of the sport: anyone can turn up and join in. Sideline also includes 2-Square, 4-Square (' },
      { text: 'X-Square', href: '/x-square' },
      { text: '), juggling, and more. The most fun wins.' },
    ],
  ],
  // Filled per request from the curated circle kicking demo slot.
  demoVideo: null,
  moreInfo: [],
};

export const sidelineService = {
  getSidelinePage(): PageViewModel<SidelineContent> {
    return {
      seo: { title: 'Hack' },
      page: {
        sectionKey: 'sideline',
        pageKey: 'sideline_home',
        title: 'Hack',
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
