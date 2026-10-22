/**
 * IfpaService -- public IFPA governance document pages (read-only).
 *
 * Serves (all public):
 *   - GET /ifpa: index of IFPA governance documents.
 *   - GET /ifpa/:docSlug: a single governance document; unknown slug throws NotFoundError (404).
 *
 * Rendering contract:
 *   - getIfpaIndexPage() / getIfpaDocPage() return PageViewModel<IfpaIndexContent | IfpaDocContent>.
 *   - Documents render from the committed IFPA markdown via the ifpa loader.
 *
 * Governance:
 *   - IFPA governance documents are authoritative IFPA-owned content; their disposition is an IFPA
 *     decision, never operator or maintainer discretion.
 */
import { PageViewModel } from '../types/page';
import { NotFoundError } from './serviceErrors';
import { getIfpaDoc, getIfpaDocs, ParsedIfpaDoc } from '../lib/ifpaLoader';
import { memberService, type MemberWelcomeTier } from './memberService';

interface IfpaIndexCard {
  slug: string;
  title: string;
  summary: string;
  href: string;
}

interface IfpaIndexContent {
  docs: IfpaIndexCard[];
  tiers: ReadonlyArray<MemberWelcomeTier>;
  /** The Become-a-Member / Log-In cards render only for unauthenticated visitors. */
  showJoinCtas: boolean;
  /** IFPA's Worlds host-bid template; bids are taken and decided off the platform. */
  worldsBidHref: string;
}

// IFPA owns this Google Doc; a bidder copies it, fills in what they can and
// shares it with the Board. The view link lets a visitor read it before bidding.
const WORLDS_BID_TEMPLATE_URL =
  'https://docs.google.com/document/d/1b30TxP3Emd47vUjHA-Td83MyXoXf6f3pjhqPiU6Lw2Q/edit?usp=sharing';

interface IfpaDocContent {
  doc: ParsedIfpaDoc;
}

const SUMMARIES: Record<string, string> = {
  'membership-structure':
    'Current IFPA membership tiers, pricing, Active Player status rules, vouching, qualifying events, and the Official IFPA Roster.',
  bylaws:
    'Governance bylaws of the IFPA, including the Board of Directors, elections, meetings, and decision-making procedures.',
  articles:
    'Articles of Incorporation filed with the State of California establishing the IFPA as a nonprofit corporation.',
  'sanctioning-guidelines':
    'What IFPA sanctioning gives an event, who can apply, and what every organizer agrees to before and after the event.',
};

export const ifpaService = {
  getIfpaIndexPage(opts: { isAuthenticated: boolean }): PageViewModel<IfpaIndexContent> {
    const docs = getIfpaDocs().map((d) => ({
      slug: d.slug,
      title: d.title,
      summary: SUMMARIES[d.slug] ?? '',
      href: `/ifpa/${d.slug}`,
    }));
    return {
      seo: { title: 'IFPA', fullTitle: 'International Footbag Players Association' },
      page: {
        sectionKey: 'ifpa',
        pageKey: 'ifpa_index',
        title: 'IFPA',
        intro: 'The International Footbag Players Association is the global governing body for footbag, supporting players, clubs, and competitions.',
      },
      content: {
        docs,
        tiers: memberService.getMembershipTiers(),
        showJoinCtas: !opts.isAuthenticated,
        worldsBidHref: WORLDS_BID_TEMPLATE_URL,
      },
    };
  },

  getIfpaDocPage(docSlug: string): PageViewModel<IfpaDocContent> {
    const doc = getIfpaDoc(docSlug);
    if (!doc) {
      throw new NotFoundError(`IFPA doc not found: ${docSlug}`);
    }
    return {
      seo: { title: doc.title, fullTitle: doc.title, description: SUMMARIES[doc.slug] },
      page: {
        sectionKey: 'ifpa',
        pageKey: `ifpa_${doc.slug}`,
        title: doc.title,
      },
      content: { doc },
    };
  },
};
