import { PublicEventSummary } from './eventService';
import { SeoMeta } from '../types/page';
import { VideoMedia, expandYouTubeVideo } from './videoMedia';

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
  getPublicHomePage(nowIso: string): HomePageViewModel {
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
        videoMedia: expandYouTubeVideo(
          'euLrL1zCvVQ',
          '43rd IFPA World Footbag Championships, Montréal 2024, official video',
        ),
        videoCaption: '43rd IFPA World Footbag Championships, Montréal 2024 (official video).',
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
          href: '/members',
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
          label: 'Sideline',
          href: '/sideline',
          description: 'Casual and social kicking, including Hacky Sack, 2 Square, 4 Square, Consecutives, and Golf.',
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
          description: 'Honouring the pioneers, champions, and promoters of footbag sports.',
        },
        {
          label: 'Big Add Posse',
          href: '/bap',
          description: 'Elite invite-only posse of top freestyle shredders.',
        },
        {
          label: 'Media Galleries',
          href: '/media',
          description: 'Photos and videos organized into named galleries.',
        },
      ],
      comingSoonSections: [
        { heading: 'Tutorials', body: 'Rules, how-to guides, and reference material for all levels.' },
      ],
    };
  },
};