/**
 * SidelineService -- public sideline games landing page (read-only).
 *
 * Serves:
 *   - GET /sideline (public): canonical sideline section entry.
 *
 * Rendering contract:
 *   - getSidelineLandingPage() returns PageViewModel<SidelineLandingContent>.
 *   - Static hero plus a fixed per-game list (Circle Kicking, 2-Square, 4-Square, Consecutive
 *     Kicks, Footbag Golf), each with optional cartoon icon and optional demo .webm clip.
 *   - Each game may carry an optional internal "MORE INFO" link (its rules page, e.g.
 *     /rules/sideline/2-square, or another internal page such as /records); the page renders zero
 *     offsite links.
 */
import { PageViewModel } from '../types/page';

interface SidelineMoreInfoLink {
  label: string;
  href: string;
  external: boolean;
}

interface SidelineDemoVideo {
  webmUrl: string;
  caption: string;
}

interface SidelineGame {
  slug: string;
  title: string;
  iconSrc: string | null;
  iconAlt: string;
  paragraphs: string[];
  demoVideo: SidelineDemoVideo | null;
  moreInfo: SidelineMoreInfoLink[];
}

interface SidelineLandingExplainer {
  heading: string;
  paragraphs: string[];
}

interface SidelineLandingContent {
  mascotSrc: string;
  mascotAlt: string;
  intro: SidelineLandingExplainer;
  games: SidelineGame[];
}

const SIDELINE_INTRO: SidelineLandingExplainer = {
  heading: 'What are Sideline games?',
  paragraphs: [
    'Sideline footbag games are the casual, social, and community-driven side of the sport. They are easy to learn, played with friends in a circle, a square, or across a small course, and were the original way most players first picked up a footbag.',
  ],
};

const SIDELINE_GAMES: SidelineGame[] = [
  {
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
    moreInfo: [],
  },
  {
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
        label: '2-Square rules',
        href: '/rules/sideline/2-square',
        external: false,
      },
    ],
  },
  {
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
        label: '4-Square rules',
        href: '/rules/sideline/4-square',
        external: false,
      },
    ],
  },
  {
    slug: 'consecutive-kicks',
    title: 'Consecutive Kicks',
    iconSrc: null,
    iconAlt: '',
    paragraphs: [
      'Consecutive kicks is the discipline of keeping a single footbag aloft for as many uninterrupted kicks as possible. It can be played solo or in a group (called "free style" consecutive), and it is the basis for some of footbag\'s longest-standing world records.',
    ],
    demoVideo: null,
    moreInfo: [
      {
        label: 'World records and milestones',
        href: '/records',
        external: false,
      },
    ],
  },
  {
    slug: 'footbag-golf',
    title: 'Footbag Golf',
    iconSrc: '/img/sideline-icon-golf.svg',
    iconAlt: 'Footbag flying toward a golf flag',
    paragraphs: [
      'In the same way disc golf combines traditional golf with disc throwing, footbag golf combines it with kicking. Set up a small course with obstacles and trees, pick a target hole, and try to kick the footbag into it in as few shots as possible.',
    ],
    demoVideo: {
      webmUrl: '/video/sideline/golf.webm',
      caption: 'Footbag golf demo',
    },
    moreInfo: [
      {
        label: 'IFPA Footbag Golf rules (Article IV)',
        href: '/rules/golf/footbag-golf',
        external: false,
      },
    ],
  },
];

export const sidelineService = {
  getSidelineLandingPage(): PageViewModel<SidelineLandingContent> {
    return {
      seo: { title: 'Sideline' },
      page: {
        sectionKey: 'sideline',
        pageKey: 'sideline_home',
        title: 'Sideline',
        intro: 'Casual and social kicking, including Hacky Sack, 2 Square, 4 Square, Consecutives, and Golf.',
      },
      content: {
        mascotSrc: '/img/sideline-hackysack-hero.svg',
        mascotAlt: 'Two figures circle-kicking a footbag',
        intro: SIDELINE_INTRO,
        games: SIDELINE_GAMES,
      },
    };
  },
};
