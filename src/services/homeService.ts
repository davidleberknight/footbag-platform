import { PublicEventSummary } from './eventService';
import { SeoMeta } from '../types/page';
import { VideoMedia } from './videoMedia';
import { config } from '../config/env';

interface HomeHero {
  heading: string;
  subheading?: string;
  // Single newcomer entry path; renders as the hero's one CTA. The hero is a
  // dark gradient panel, so the template renders it with the inverse button
  // treatment reserved for CTAs on dark panels.
  cta?: { label: string; href: string };
  videoMedia?: VideoMedia;
  videoCaption?: string;
}

interface HomePrimaryLink {
  label: string;
  href: string;
  description: string;
  // Button label when it must differ from the card title so the control
  // names its real destination (e.g. the Members card's button goes to the
  // login page). Absent means the button reuses the card label.
  ctaLabel?: string;
  variant?: 'primary' | 'outline';
}

interface HomeFeaturePanel {
  heading: string;
  body: string;
  href?: string;
  ctaLabel?: string;
}

interface HomeComingSoonSection {
  heading: string;
  body: string;
}

export interface HomePageViewModel {
  seo: SeoMeta;
  page: {
    sectionKey: 'home';
    pageKey: 'home_index';
    title: string;
    intro: string;
    notice?: string;
  };
  hero: HomeHero;
  primaryLinks: HomePrimaryLink[];
  featuredUpcomingEvents?: PublicEventSummary[];
  featurePanels?: HomeFeaturePanel[];
  comingSoonSections?: HomeComingSoonSection[];
}

export const homeService = {
  getPublicHomePage(_nowIso: string): HomePageViewModel {
    return {
      seo: { title: '' },
      page: {
        sectionKey: 'home',
        pageKey: 'home_index',
        title: 'Footbag Worldwide',
        intro: 'The sport of keeping a small bag in the air with your feet, from casual "Hacky Sack" circles to world championships.',
      },
      hero: {
        heading: 'Footbag Worldwide',
        subheading: 'The sport of keeping a small bag in the air with your feet, from casual "Hacky Sack" circles to world championships.',
        cta: { label: 'New to Footbag? Start Here', href: '/sideline' },
      },
      // Newcomer-relevance order: the ways to play lead, member and rules
      // surfaces sit mid-grid, honors and archives close the grid.
      primaryLinks: [
        {
          label: 'Sideline',
          href: '/sideline',
          description: 'Casual and social kicking, including Hacky Sack, 2 Square, 4 Square, Consecutives, and Golf.',
        },
        {
          label: 'Freestyle',
          href: '/freestyle',
          description: 'Tricks, combos, and choreographed routines set to music.',
        },
        {
          label: 'Net',
          href: '/net',
          description: 'Fast-paced foot volleyball over a 5-foot net.',
        },
        {
          label: 'Events',
          href: '/events',
          description: 'Find upcoming events, or browse competitive results from tournaments.',
        },
        {
          label: 'Clubs',
          href: '/clubs',
          description: 'Find clubs near you and around the world.',
        },
        {
          label: 'Members',
          href: '/login',
          description: 'Manage your profile and participate in the footbag community.',
          ctaLabel: 'Log In',
        },
        {
          label: 'Rules',
          href: '/rules',
          description: 'Official IFPA rules for Sideline games, Footbag Net, Footbag Golf, and Freestyle.',
        },
        {
          label: 'Records',
          href: '/records',
          description: 'Consecutive kicks world records, highest scores, and milestones.',
        },
        {
          label: 'Hall of Fame',
          href: '/hof',
          description: 'Honoring the pioneers, champions, and promoters of footbag sports.',
        },
        {
          label: 'Big Add Posse',
          href: '/bap',
          description: "The invite-only honor society of freestyle's most accomplished players.",
        },
        {
          label: 'Media Galleries',
          href: '/media',
          description: 'Browse by hashtag or visit named galleries.',
        },
        // The legacy archive is a separate members-only static site; the card
        // appears only where a deployment provides its URL, and the card
        // itself stays public. Its target is member-gated one of two ways:
        // at the archive edge (signed-out visitors get the archive's own
        // sign-in page), or, where the archive edge cannot share the platform
        // session cookie, through the platform's own login-gated redirect.
        ...(config.archiveUrl
          ? [
              {
                label: 'Legacy Archive',
                href: config.archiveLoginRedirect ? '/archive' : config.archiveUrl,
                description:
                  'The preserved original footbag.org site. Historical reference, for signed-in members.',
              },
            ]
          : []),
      ],
    };
  },
};