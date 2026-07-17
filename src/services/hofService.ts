/**
 * HofService -- public Hall of Fame landing page (read-only).
 *
 * Serves:
 *   - GET /hof (public): canonical Hall of Fame section entry.
 *
 * Rendering contract:
 *   - getHofLandingPage() returns PageViewModel<HofContent>, service-shaped.
 *   - Provides content.externalLink so the template never constructs the standalone HoF URL.
 *   - Provides content.honorees: the on-site index of canonical inductees, each linked to a
 *     claimed member profile when one exists, otherwise the history page. Reads the canonical
 *     honoree list from db.ts (publicPlayers.listHofHonorees).
 *
 * Visibility:
 *   - Public official honor. HoF status is a permanent public historical record, preserved even
 *     through PII purge or deceased flows.
 */
import { PageViewModel } from '../types/page';
import { runSqliteRead } from './sqliteRetry';
import { publicPlayers } from '../db/db';

interface HofSection {
  heading: string;
  paragraphs: string[];
}

interface HofHonoree {
  name: string;
  href: string;
  year: number | null;
}

interface HofContent {
  externalLink: { href: string; label: string };
  sections: HofSection[];
  honorees: HofHonoree[];
}

export const hofService = {
  getHofLandingPage(): PageViewModel<HofContent> {
    const honorees = runSqliteRead('hofService.listHofHonorees', () =>
      (publicPlayers.listHofHonorees.all() as Array<{
        person_id: string;
        person_name: string;
        hof_induction_year: number | null;
        linked_member_slug: string | null;
      }>).map((r) => ({
        name: r.person_name,
        href: r.linked_member_slug ? `/members/${r.linked_member_slug}` : `/history/${r.person_id}`,
        year: r.hof_induction_year,
      })),
    );

    return {
      seo: { title: 'Hall of Fame' },
      page: {
        sectionKey: 'hof',
        pageKey: 'hof_index',
        title: 'Footbag Hall of Fame',
        intro: 'Honouring the pioneers, champions, and promoters of footbag sports.',
      },
      content: {
        externalLink: { href: 'https://www.footbaghalloffame.net/', label: 'Visit FootbagHallOfFame.net' },
        honorees,
        sections: [
          {
            heading: 'A Bit of History...',
            paragraphs: [
              'One fine day in Oregon in 1972, <a href="https://www.footbaghalloffame.net/our-members/mike-marshall" target="_blank" rel="noopener noreferrer">Mike Marshall</a> and <a href="https://www.footbaghalloffame.net/our-members/john-stalberger" target="_blank" rel="noopener noreferrer">John Stalberger</a> decided to hack a sack, ' +
              'to kick a small bag around for fun and exercise. ' +
              'This became Hacky Sack brand footbag, and soon there were competitions, ' +
              'plus joyful free-flow kicking at festivals and events. ' +
              'The Footbag Hall of Fame was founded in 1997 by Stalberger and fellow pioneers ' +
              'to honour the champions and promoters who left their mark, turning this back-yard game into a global phenomenon. ' +
              'Maybe some day you can become a HoF member too! Get involved, join a club, go to tournaments, ' +
              'and most of all, have fun! Go get a hack with a sack. The most fun wins. ' +
              'Well, sometimes <a href="https://www.footbaghalloffame.net/our-members/ken-shults" target="_blank" rel="noopener noreferrer">Kenny Shults</a> still wins!\n\n' +
              '#BringBackTheHack',
            ],
          },
        ],
      },
    };
  },
};
