/**
 * HofService -- public Hall of Fame landing page (read-only).
 *
 * Serves:
 *   - GET /hof (public): canonical Hall of Fame section entry.
 *
 * Rendering contract:
 *   - getHofLandingPage() returns PageViewModel<HofContent>, service-shaped.
 *   - Provides content.externalLink so the template never constructs the standalone HoF URL.
 *   - Editorial only: the page tells the honor's history and sends the reader to its
 *     authoritative external home. It carries no on-site inductee roster and no per-person
 *     honor page, so it reads no person data and touches no database.
 *
 * Visibility:
 *   - Public official honor. HoF status is a permanent public historical record, preserved even
 *     through PII purge or deceased flows.
 */
import { PageViewModel } from '../types/page';

/** A run of paragraph text; one carrying `href` renders as an external link. */
interface ProseSegment {
  text: string;
  href?: string;
}

interface HofSection {
  heading: string;
  paragraphs: ProseSegment[][];
}

interface HofContent {
  externalLink: { href: string; label: string };
  sections: HofSection[];
}

export const hofService = {
  getHofLandingPage(): PageViewModel<HofContent> {
    return {
      seo: {
        title: 'Hall of Fame',
        description:
          'The Footbag Hall of Fame honors the pioneers, champions and promoters of footbag sports. Read the history of the honor and visit the official Hall of Fame site.',
      },
      page: {
        sectionKey: 'hof',
        pageKey: 'hof_index',
        title: 'Footbag Hall of Fame',
        intro: 'Honoring the pioneers, champions, and promoters of footbag sports.',
      },
      content: {
        externalLink: { href: 'https://www.footbaghalloffame.net/', label: 'Visit FootbagHallOfFame.net' },
        sections: [
          {
            heading: 'A Bit of History...',
            paragraphs: [
              [
                { text: 'One fine day in Oregon in 1972, ' },
                { text: 'Mike Marshall', href: 'https://www.footbaghalloffame.net/our-members/mike-marshall' },
                { text: ' and ' },
                { text: 'John Stalberger', href: 'https://www.footbaghalloffame.net/our-members/john-stalberger' },
                {
                  text:
                    ' decided to hack a sack, ' +
                    'to kick a small bag around for fun and exercise. ' +
                    'This became Hacky Sack brand footbag, and soon there were competitions, ' +
                    'plus joyful free-flow kicking at festivals and events. ' +
                    'The Footbag Hall of Fame was founded in 1997 by Stalberger and fellow pioneers ' +
                    'to honour the champions and promoters who left their mark, turning this back-yard game into a global phenomenon. ' +
                    'Maybe some day you can become a HoF member too! Get involved, join a club, go to tournaments, ' +
                    'and most of all, have fun! Go get a hack with a sack. The most fun wins. ' +
                    'Well, sometimes ',
                },
                { text: 'Kenny Shults', href: 'https://www.footbaghalloffame.net/our-members/ken-shults' },
                { text: ' still wins!' },
              ],
              [{ text: '#BringBackTheHack' }],
            ],
          },
        ],
      },
    };
  },
};
