/**
 * GolfService -- public Footbag Golf landing page (read-only).
 *
 * Serves:
 *   - GET /golf (public): canonical golf section entry.
 *
 * Rendering contract:
 *   - getGolfPage() returns PageViewModel<GolfContent>.
 *   - Static hero carrying the golf artwork as its mascot, then the Footbag Golf section with its
 *     demo .webm clip and internal "More info" links (the golf rules, the golf section of the
 *     equipment page). The section repeats no icon, since the hero carries the artwork.
 */
import { PageViewModel } from '../types/page';
import { SportSectionContent, SportSectionGame } from '../types/sportSection';

export type GolfContent = SportSectionContent;

const FOOTBAG_GOLF: SportSectionGame = {
  slug: 'footbag-golf',
  title: 'Footbag Golf',
  iconSrc: null,
  iconAlt: '',
  paragraphs: [
    'In the same way disc golf combines traditional golf with disc throwing, footbag golf combines it with kicking. Set up a small course with obstacles and trees, pick a target hole, and try to kick the footbag into it in as few shots as possible.',
  ],
  demoVideo: {
    webmUrl: '/video/sideline/golf.webm',
    caption: 'Footbag golf demo',
  },
  moreInfo: [
    {
      label: 'IFPA Footbag Golf Rules (Article IV)',
      href: '/rules/golf/footbag-golf',
      external: false,
    },
    {
      label: 'Golf Equipment',
      href: '/equipment#golf',
      external: false,
    },
  ],
};

export const golfService = {
  getGolfPage(): PageViewModel<GolfContent> {
    return {
      seo: { title: 'Golf' },
      page: {
        sectionKey: 'golf',
        pageKey: 'golf_home',
        title: 'Footbag Golf',
        intro: 'Kick a footbag around a course in as few kicks as possible.',
      },
      content: {
        mascot: { src: '/img/sideline-icon-golf.svg', alt: 'Footbag flying toward a golf flag' },
        explainer: null,
        games: [FOOTBAG_GOLF],
      },
    };
  },
};
