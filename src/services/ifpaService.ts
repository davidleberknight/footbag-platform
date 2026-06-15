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

interface IfpaIndexCard {
  slug: string;
  title: string;
  summary: string;
  href: string;
}

interface IfpaIndexContent {
  docs: IfpaIndexCard[];
}

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
};

export const ifpaService = {
  getIfpaIndexPage(): PageViewModel<IfpaIndexContent> {
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
        intro: 'Governance documents for the International Footbag Players Association.',
      },
      content: { docs },
    };
  },

  getIfpaDocPage(docSlug: string): PageViewModel<IfpaDocContent> {
    const doc = getIfpaDoc(docSlug);
    if (!doc) {
      throw new NotFoundError(`IFPA doc not found: ${docSlug}`);
    }
    return {
      seo: { title: doc.title, fullTitle: doc.title },
      page: {
        sectionKey: 'ifpa',
        pageKey: `ifpa_${doc.slug}`,
        title: doc.title,
      },
      content: { doc },
    };
  },
};
