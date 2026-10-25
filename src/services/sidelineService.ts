/**
 * SidelineService -- public Sideline landing page (read-only).
 *
 * Serves:
 *   - GET /sideline (public): canonical sideline section entry. Sideline is open play, which
 *     anyone joins with no registration and no bracket.
 *
 * Rendering contract:
 *   - getSidelinePage() returns PageViewModel<SidelineContent>.
 *   - Static hero with the hacky sack mascot, an explainer whose last paragraph links the X Square
 *     games (also played as open play), then circle kicking with its cartoon icon, demo .webm clip
 *     and a "More info" link to the footbags section of the equipment page.
 *   - Explainer paragraphs are prose segments; a segment carrying `href` renders as an internal
 *     link inside the sentence.
 */
import { PageViewModel } from '../types/page';
import { SportSectionContent, SportSectionGame } from '../types/sportSection';

export type SidelineContent = SportSectionContent;

const CIRCLE_KICKING: SportSectionGame = {
  slug: 'circle-kicking',
  title: 'Circle Kicking (Hacky Sack)',
  iconSrc: '/img/sideline-icon-hackysack.svg',
  iconAlt: 'Two figures circle-kicking a footbag',
  paragraphs: [
    'Circle kicking, more commonly known as "hacky sack," is the original and most well-known footbag game. A group stands in a circle and keeps the footbag off the ground without using their hands, passing to other players, and trying to get everyone to kick the bag before it drops, known as a "hack." Simple tricks are encouraged, but the focus stays on the group and the flow.',
  ],
  demoVideo: {
    webmUrl: '/video/sideline/hackysack.webm',
    caption: 'Circle kicking demo',
  },
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
        intro: 'Casual and social kicking that anyone can join: free flow, circle kicking and hacky sack.',
      },
      content: {
        mascot: { src: '/img/sideline-hackysack-hero.svg', alt: 'Two figures circle-kicking a footbag' },
        explainer: {
          heading: 'What Is Sideline?',
          paragraphs: [
            [{ text: 'Sideline is open play, the casual and social side of the sport. Anyone can turn up and join in: there is nothing to register for and no bracket. It is easy to learn, and it is how most players first picked up a footbag.' }],
            [
              { text: 'Sideline also includes the ' },
              { text: 'X Square games', href: '/x-square' },
              { text: '.' },
            ],
          ],
        },
        games: [CIRCLE_KICKING],
      },
    };
  },
};
