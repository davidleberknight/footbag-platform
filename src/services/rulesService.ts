/**
 * RulesService -- public IFPA rules pages (read-only).
 *
 * Serves (all public):
 *   - GET /rules: rules index; rule pages grouped by discipline ordered net, freestyle, x-square,
 *     golf (the main-navigation order), each group with a one-sentence intro, closing with a link
 *     to the equipment page.
 *   - GET /rules/:categorySlug/:ruleSlug: rule detail; unknown category or slug throws
 *     NotFoundError (renders 404).
 *
 * Rendering contract:
 *   - getRulesIndexPage() / getRulePage() return PageViewModel<RulesIndexContent | RulesDetailContent>.
 *   - Content renders from the committed IFPA rules markdown via marked, cached in memory. Each H1
 *     becomes a page whose URL slug is the slugified H1 text, so renaming an H1 changes its URL.
 *     The H1 names the game ("2-Square"); the displayed title, index link and tab title add
 *     " Rules" ("2-Square Rules"). Rule detail: title hero with a one-sentence intro, authority and
 *     effective-date meta line, optional on-this-page TOC, markdown bodyHtml; each H2 gets a
 *     slugified anchor id.
 *
 * Governance:
 *   - Rules content is IFPA-governed: IFPA authors and maintains it, and these pages publish it as
 *     IFPA's own rules, so no platform-authored currency or ratification notice is rendered. The
 *     page and group intros live here rather than in the IFPA files: net, freestyle and golf quote
 *     IFPA's own opening comment, and the rest is the site's own orientation copy.
 */
import { PageViewModel } from '../types/page';
import { NotFoundError } from './serviceErrors';
import {
  getRulePage,
  listGroupedByCategory,
  RuleCategoryGroup,
  ParsedRulePage,
} from '../lib/rulesLoader';

interface RulesIndexLink {
  href: string;
  label: string;
  shortTitle: string;
  authority: string;
  effective: string | null;
}

interface RulesIndexGroup {
  category: string;
  label: string;
  intro: string | null;
  links: RulesIndexLink[];
}

interface RulesIndexContent {
  groups: RulesIndexGroup[];
  equipmentLink: { lead: string; href: string; label: string };
}

interface RulesDetailContent {
  page: ParsedRulePage;
}

// Keyed by category, matching the frontmatter `category` of each rules file.
const GROUP_INTROS: Record<string, string> = {
  'x-square': 'Rules for 2-Square and 4-Square.',
  net: 'Rules for singles and doubles net play.',
  golf: 'Rules for playing a footbag golf course.',
  freestyle: 'Rules for freestyle competition, where players are judged on difficulty, variety and execution.',
};

// Keyed by `category/slug`, the same key as the rule page URL.
const PAGE_INTROS: Record<string, string> = {
  'net/footbag-net':
    'Footbag net is a court game played either one-on-one or two-on-two (singles or doubles) over a 5 ft. net.',
  'freestyle/footbag-freestyle':
    'Footbag Freestyle is a highly specialized version of footbag that focuses on technical skill, in terms of both depth and breadth.',
  'golf/footbag-golf':
    'Footbag golf is a recreational sport for everybody, regardless of age, gender or ability.',
  'x-square/2-square':
    '2-Square takes the classic schoolyard square game and combines it with footbag.',
  'x-square/4-square':
    'Four squares, four players: score points by landing the footbag in someone else\'s square without letting it land in your own.',
};

function ruleDisplayTitle(page: Pick<ParsedRulePage, 'title'>): string {
  return `${page.title} Rules`;
}

function shapeIndexGroup(group: RuleCategoryGroup): RulesIndexGroup {
  return {
    category: group.category,
    label: group.label,
    intro: GROUP_INTROS[group.category] ?? null,
    links: group.pages.map((p) => ({
      href: `/rules/${p.category}/${p.slug}`,
      label: ruleDisplayTitle(p),
      shortTitle: ruleDisplayTitle(p),
      authority: p.authority,
      effective: p.effective,
    })),
  };
}

export const rulesService = {
  /** GET /rules */
  getRulesIndexPage(): PageViewModel<RulesIndexContent> {
    const groups = listGroupedByCategory().map(shapeIndexGroup);
    return {
      seo: { title: 'Footbag Rules', fullTitle: 'Footbag Rules' },
      page: {
        sectionKey: 'rules',
        pageKey: 'rules_index',
        title: 'Footbag Rules',
        intro: 'Official IFPA rules for each discipline.',
      },
      content: {
        groups,
        equipmentLink: {
          lead: 'Looking for what you need to play?',
          href: '/equipment',
          label: 'Footbag Equipment',
        },
      },
    };
  },

  /** GET /rules/:categorySlug/:ruleSlug */
  getRulePage(categorySlug: string, ruleSlug: string): PageViewModel<RulesDetailContent> {
    const page = getRulePage(categorySlug, ruleSlug);
    if (!page) {
      throw new NotFoundError(`Rule page not found: ${categorySlug}/${ruleSlug}`);
    }
    const displayTitle = ruleDisplayTitle(page);
    const intro = PAGE_INTROS[`${page.category}/${page.slug}`];
    return {
      seo: {
        title: displayTitle,
        fullTitle: page.title.startsWith('Footbag') ? displayTitle : `Footbag ${displayTitle}`,
      },
      page: {
        sectionKey: 'rules',
        pageKey: `rules_${page.category}_${page.slug}`,
        title: displayTitle,
        ...(intro ? { intro } : {}),
      },
      content: { page },
    };
  },
};
