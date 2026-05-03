import { PageViewModel } from '../types/page';
import { NotFoundError } from './serviceErrors';
import {
  getRulePage,
  listGroupedByDiscipline,
  RuleDisciplineGroup,
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
  discipline: string;
  label: string;
  links: RulesIndexLink[];
}

interface RulesIndexContent {
  groups: RulesIndexGroup[];
}

interface RulesDetailContent {
  page: ParsedRulePage;
}

function shapeIndexGroup(group: RuleDisciplineGroup): RulesIndexGroup {
  return {
    discipline: group.discipline,
    label: group.label,
    links: group.pages.map((p) => ({
      href: `/rules/${p.discipline}/${p.slug}`,
      label: p.title,
      shortTitle: p.title,
      authority: p.authority,
      effective: p.effective,
    })),
  };
}

export const rulesService = {
  /** GET /rules */
  getRulesIndexPage(): PageViewModel<RulesIndexContent> {
    const groups = listGroupedByDiscipline().map(shapeIndexGroup);
    return {
      seo: { title: 'Footbag Rules', fullTitle: 'Footbag Rules' },
      page: {
        sectionKey: 'rules',
        pageKey: 'rules_index',
        title: 'Footbag Rules',
        intro: 'Official IFPA rules for each footbag discipline.',
      },
      content: { groups },
    };
  },

  /** GET /rules/:disciplineSlug/:ruleSlug */
  getRulePage(disciplineSlug: string, ruleSlug: string): PageViewModel<RulesDetailContent> {
    const page = getRulePage(disciplineSlug, ruleSlug);
    if (!page) {
      throw new NotFoundError(`Rule page not found: ${disciplineSlug}/${ruleSlug}`);
    }
    return {
      seo: {
        title: page.title,
        fullTitle: page.title.startsWith('Footbag')
          ? `${page.title} Rules`
          : `Footbag ${page.title} Rules`,
      },
      page: {
        sectionKey: 'rules',
        pageKey: `rules_${page.discipline}_${page.slug}`,
        title: page.title,
      },
      content: { page },
    };
  },
};
