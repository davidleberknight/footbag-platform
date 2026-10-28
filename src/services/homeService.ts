import { PublicEventSummary } from './eventService';
import { SeoMeta } from '../types/page';
import { VideoMedia } from './videoMedia';
import { config } from '../config/env';

interface HomeHero {
  heading: string;
  subheading?: string;
  videoMedia?: VideoMedia;
  videoCaption?: string;
}

interface HomePrimaryLink {
  label: string;
  href: string;
  description: string;
  variant?: 'primary' | 'outline';
}

interface HomeFeaturePanel {
  heading: string;
  body: string;
  href?: string;
  ctaLabel?: string;
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
}

export const homeService = {
  getPublicHomePage(_nowIso: string): HomePageViewModel {
    return {
      seo: { title: '' },
      page: {
        sectionKey: 'home',
        pageKey: 'home_index',
        title: 'Footbag Worldwide',
        intro: 'The home of footbag sports and recreational "Hacky Sack."',
      },
      hero: {
        heading: 'Footbag Worldwide',
        subheading: 'The home of footbag sports and recreational "Hacky Sack."',
      },
      primaryLinks: [
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
          label: 'X-Square',
          href: '/x-square',
          description: '2-Square, 4-Square and 5-Square.',
        },
        {
          label: 'Golf',
          href: '/golf',
          description: 'Kick a footbag around a course in as few kicks as possible.',
        },
        {
          label: 'Consecutives',
          href: '/consecutives',
          description: 'Keep the footbag in the air for as many kicks as you can, and see the world records.',
        },
        {
          label: 'Sideline',
          href: '/sideline',
          description: 'Casual and social kicking that anyone can join: free flow, circle kicking and hacky sack.',
        },
        {
          label: 'Rules',
          href: '/rules',
          description: 'Official IFPA rules for Footbag Net, Freestyle, X-Square and Footbag Golf.',
        },
        {
          label: 'Hall of Fame',
          href: '/hof',
          description: 'Honoring the pioneers, champions, and promoters of footbag sports.',
        },
        {
          label: 'Big Add Posse',
          href: '/bap',
          description: 'Elite invite-only posse of top freestyle shredders.',
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