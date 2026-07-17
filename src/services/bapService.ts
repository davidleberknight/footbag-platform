/**
 * BapService -- public Big Add Posse landing page (read-only).
 *
 * Serves:
 *   - GET /bap (public): canonical Big Add Posse section entry.
 *
 * Rendering contract:
 *   - getBapLandingPage() returns PageViewModel<BapContent>, service-shaped.
 *   - Provides content.externalLink so the template never constructs the standalone BAP URL.
 *   - Provides content.honorees: the on-site index of canonical members, each linked to a
 *     claimed member profile when one exists, otherwise the history page, with the recorded BAP
 *     nickname. Reads the canonical honoree list from db.ts (publicPlayers.listBapHonorees).
 *
 * Visibility:
 *   - Public official honor. BAP status is a permanent public historical record, preserved even
 *     through PII purge or deceased flows.
 */
import { PageViewModel } from '../types/page';
import { runSqliteRead } from './sqliteRetry';
import { publicPlayers } from '../db/db';

interface BapSection {
  heading: string;
  paragraphs: string[];
}

interface BapHonoree {
  name: string;
  nickname: string | null;
  href: string;
  year: number | null;
}

interface BapContent {
  externalLink: { href: string; label: string };
  sections: BapSection[];
  honorees: BapHonoree[];
}

export const bapService = {
  getBapLandingPage(): PageViewModel<BapContent> {
    const honorees = runSqliteRead('bapService.listBapHonorees', () =>
      (publicPlayers.listBapHonorees.all() as Array<{
        person_id: string;
        person_name: string;
        bap_nickname: string | null;
        bap_induction_year: number | null;
        linked_member_slug: string | null;
      }>).map((r) => ({
        name: r.person_name,
        nickname: r.bap_nickname,
        href: r.linked_member_slug ? `/members/${r.linked_member_slug}` : `/history/${r.person_id}`,
        year: r.bap_induction_year,
      })),
    );

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
        honorees,
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
