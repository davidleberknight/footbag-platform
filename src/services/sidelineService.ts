/**
 * SidelineService -- public Sideline landing page (read-only).
 *
 * Serves:
 *   - GET /sideline (public): canonical sideline section entry. Sideline is open play, which
 *     anyone joins with no registration and no bracket.
 *
 * Rendering contract:
 *   - getSidelinePage() returns PageViewModel<SidelineContent>.
 *   - Static hero with the circle-kicking mascot, then the Getting a Hack subsection (anchor
 *     `#hack`, which the Hack menu entry opens) whose last paragraph places it within sideline and
 *     links the X-Square games (also played as open play), then circle kicking with its cartoon icon, curated demo
 *     clip (absent until the curator seed stores it) and a "More info" link to the footbags section of the equipment page.
 *   - Explainer paragraphs are prose segments; a segment carrying `href` renders as an internal
 *     link inside the sentence.
 */
import { PageViewModel } from '../types/page';
import { SportSectionContent, SportSectionGame } from '../types/sportSection';
import { loadSiteVideo } from './siteMediaService';

export type SidelineContent = SportSectionContent;

const CIRCLE_KICKING: SportSectionGame = {
  slug: 'circle-kicking',
  title: 'Circle Kicking ("Hacky Sack")',
  iconSrc: '/img/sideline-icon-hackysack.svg',
  iconAlt: 'Two figures circle-kicking a footbag',
  paragraphs: [
    'Circle kicking, commonly known as "Hacky Sack," is the original and most well-known footbag game. A group stands in a circle and keeps the footbag off the ground without using their hands, passing to other players, and trying to get everyone to kick the bag before it drops, known as a "hack." Simple tricks are encouraged, but the focus stays on the group and the flow.',
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
        explainer: {
          id: 'hack',
          heading: 'Getting a Hack',
          paragraphs: [
            [{ text: 'Getting a hack is the original footbag game and how most players first picked up a footbag. A group stands in a circle and keeps the footbag off the ground without using their hands. It is cooperative, not competitive, and everyone plays together. The game\'s inventors called it "hacking the sack," and the brand name "Hacky Sack" came later. Many players today call it free flow footbag as well.' }],
            [
              { text: 'Getting a hack is part of sideline play, the casual and social side of the sport: anyone can turn up and join in, with nothing to register for and no bracket. Sideline also includes the ' },
              { text: 'X-Square games', href: '/x-square' },
              { text: '.' },
            ],
          ],
        },
        games: [{ ...CIRCLE_KICKING, demoVideo: loadSiteVideo('circle_kicking_demo') }],
      },
    };
  },
};
