/**
 * NetService -- public footbag-net landing page (read-only).
 *
 * Serves (public):
 *   - GET /net: portal landing (hero/mascot, narrative, Singles/Doubles competition-format cards,
 *     and Explore cards linking the events pages, the net rules and the net equipment section).
 *
 * Rendering contract:
 *   - The page method returns PageViewModel<NetHomeContent>. Its content is authored in this file,
 *     so the page reads no competition data; results live on the event and player pages.
 */
import { PageViewModel } from '../types/page';
import { loadSiteVideo } from './siteMediaService';
import { VideoMedia, expandYouTubeVideo } from './videoMedia';

// ---------------------------------------------------------------------------
// View-model types
// ---------------------------------------------------------------------------

interface NetLandingExplainer {
  heading:    string;
  paragraphs: string[];
}

interface NetCompetitionFormat {
  slug:           'singles' | 'doubles';
  title:          string;
  paragraph:      string;
  media:          VideoMedia;
}

interface NetDemoVideo {
  mp4Url:    string;
  posterUrl: string;
  caption:   string;
}

interface NetExploreCard {
  slug:       'events' | 'rules' | 'equipment';
  label:      string;
  href:       string;
  paragraph:  string;
  linkLabel:  string;
}

interface NetHomeContent {
  mascotSrc:             string;
  mascotAlt:             string;
  intro:                 NetLandingExplainer;
  demoVideo:             NetDemoVideo | null;
  competitionFormats:    NetCompetitionFormat[];
  exploreCards:          NetExploreCard[];
}

// ---------------------------------------------------------------------------
// Landing-page static content (adapted from FootbagWorldwide /games/net,
// IFPA 2025). Held in-file so the landing stays thin and no DB call is needed.
// ---------------------------------------------------------------------------
const NET_LANDING_INTRO: NetLandingExplainer = {
  heading: 'What Is Footbag Net?',
  paragraphs: [
    'Footbag Net is an acrobatic discipline of footbag played on a badminton court. Players volley the footbag back and forth using only their feet or lower leg. Similar to Sepak Takraw, footbag net blends the court strategy of beach volleyball with the jumping and kicking skills of martial arts. Players demonstrate remarkable agility by flying through the air to spike the footbag over the net, or to block that spike on defense.',
  ],
};

const NET_COMPETITION_FORMATS: NetCompetitionFormat[] = [
  {
    slug:          'singles',
    title:         'Singles',
    paragraph:     'In singles, each player has one or two kicks to return the footbag over the net. Skilled players can often use the first kick to set up a spike with the second kick.',
    media:         expandYouTubeVideo('Rep-1rQbX-o', 'IFPA World Footbag Championships 2019, Open Singles Net Finals'),
  },
  {
    slug:          'doubles',
    title:         'Doubles',
    paragraph:     'In doubles, teams have three kicks total to return the footbag, and teammates must alternate kicks. Doubles opens the door to set-and-spike plays, crossing blocks, and dramatic rallies.',
    media:         expandYouTubeVideo('lcDP3JGvkP0', 'IFPA World Footbag Championships 2019, Mixed Doubles Net Final'),
  },
];

const NET_EXPLORE_CARDS: NetExploreCard[] = [
  { slug: 'events',    label: 'Events',    href: '/events',                paragraph: 'Net events from every year.',                                             linkLabel: 'Event Archive' },
  { slug: 'rules',     label: 'Rules',     href: '/rules/net/footbag-net', paragraph: 'The official IFPA rules of footbag net: court, service, scoring and fouls.', linkLabel: 'Net Rules' },
  { slug: 'equipment', label: 'Equipment', href: '/equipment#net',         paragraph: 'Net footbags, shoes, and how to set up a court and net.',                 linkLabel: 'Net Equipment' },
];

// ---------------------------------------------------------------------------

export const netService = {
  getNetHomePage(): PageViewModel<NetHomeContent> {
    return {
      seo:  { title: 'Net' },
      page: {
        sectionKey: 'net',
        pageKey:    'net_home',
        title:      'Footbag Net',
        intro:      'Fast-paced foot volleyball over a 5-foot net.',
      },
      content: {
        mascotSrc:           '/img/net-mascot.svg',
        mascotAlt:           'Footbag net icon',
        intro:               NET_LANDING_INTRO,
        demoVideo:           loadSiteVideo('net_demo'),
        competitionFormats:  NET_COMPETITION_FORMATS,
        exploreCards:        NET_EXPLORE_CARDS,
      },
    };
  },

};
