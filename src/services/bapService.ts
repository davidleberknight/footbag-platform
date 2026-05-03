import { PageViewModel } from '../types/page';

interface BapSection {
  heading: string;
  paragraphs: string[];
}

interface BapContent {
  externalLink: { href: string; label: string };
  sections: BapSection[];
}

export const bapService = {
  getBapLandingPage(): PageViewModel<BapContent> {
    return {
      seo: { title: 'Big Add Posse' },
      page: {
        sectionKey: 'bap',
        pageKey: 'bap_index',
        title: 'Big Add Posse',
        intro: 'Elite posse of top freestyle shredders.',
      },
      content: {
        externalLink: { href: 'https://bigaddposse.com/', label: 'Visit BigAddPosse.com' },
        sections: [
          {
            heading: 'History of the BAP',
            paragraphs: [
              'One degree of difficulty in footbag freestyle is called an ADD (Additional Degree of Difficulty), so for example the trick called flurry (aka barraging legover) is a 4-add move. The Big Add Posse takes its name from this metric. The BAP is an elite, invite-only group, and the only way to get in is by shredding incredibly hard in front of the existing members.',
              'These kickers are the legends of freestyle!',
            ],
          },
        ],
      },
    };
  },
};
