/**
 * freestyleGlossaryRules: the rules every A–Z glossary entry must meet, applied by
 * the glossary editor before a save and by the rebuild seeder before it writes.
 * One home, so a glossary the seeder accepts is one the editor can save unchanged,
 * and the other way round.
 *
 * A slug is lowercase letters and digits in hyphen-joined words, because the entry
 * renders at the anchor `#term-{slug}` that other pages link to. Each slug and each
 * term (ignoring case) names one entry only. An alias never equals another entry's
 * term, and no alias is claimed by two entries, since either would show one word
 * twice. The deeper link and its label travel together, and the link is a path on
 * this site. Pure: no database, no I/O.
 */

export const GLOSSARY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The parts of an entry the rules read. */
export interface GlossaryRuleInput {
  slug:      string;
  term:      string;
  aliases:   readonly string[];
  moreHref:  string | null;
  moreLabel: string | null;
}

/** One broken rule, tied to the entry and the field that breaks it. */
export interface GlossaryRuleProblem {
  slug:    string;
  field:   'slug' | 'term' | 'aliases' | 'moreHref';
  message: string;
}

const key = (s: string): string => s.trim().toLowerCase();

/** Whether a deeper link is a path on this site: one leading slash, never two. */
export function isSitePath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !/\s/.test(href);
}

/** Every rule the glossary breaks, in entry order. Empty when it is sound. */
export function glossaryProblems(entries: readonly GlossaryRuleInput[]): GlossaryRuleProblem[] {
  const problems: GlossaryRuleProblem[] = [];
  const termOwner = new Map<string, string>();
  for (const e of entries) {
    if (!termOwner.has(key(e.term))) termOwner.set(key(e.term), e.slug);
  }

  const seenSlugs = new Set<string>();
  const seenTerms = new Set<string>();
  const aliasOwner = new Map<string, string>();
  for (const e of entries) {
    if (!GLOSSARY_SLUG_PATTERN.test(e.slug)) {
      problems.push({ slug: e.slug, field: 'slug', message: 'A glossary slug uses only lowercase letters and digits, in words joined by single hyphens.' });
    }
    if (seenSlugs.has(e.slug)) {
      problems.push({ slug: e.slug, field: 'slug', message: `"${e.slug}" is already a glossary entry.` });
    }
    seenSlugs.add(e.slug);

    if (seenTerms.has(key(e.term))) {
      problems.push({ slug: e.slug, field: 'term', message: `"${e.term}" is already a glossary term.` });
    }
    seenTerms.add(key(e.term));

    for (const a of e.aliases) {
      // A case variant of the entry's own term is harmless; another entry's term
      // is a duplicate entry in disguise.
      const owner = termOwner.get(key(a));
      if (key(a) !== key(e.term) && owner !== undefined && owner !== e.slug) {
        problems.push({ slug: e.slug, field: 'aliases', message: `The alias "${a}" is another entry's term.` });
      }
      const claimedBy = aliasOwner.get(key(a));
      if (claimedBy !== undefined && claimedBy !== e.slug) {
        problems.push({ slug: e.slug, field: 'aliases', message: `The alias "${a}" is already an alias of another entry.` });
      }
      aliasOwner.set(key(a), e.slug);
    }

    if ((e.moreHref === null) !== (e.moreLabel === null)) {
      problems.push({ slug: e.slug, field: 'moreHref', message: 'A deeper link and its label go together: give both or neither.' });
    } else if (e.moreHref !== null && !isSitePath(e.moreHref)) {
      problems.push({ slug: e.slug, field: 'moreHref', message: 'The deeper link must be a path on this site, starting with a single "/".' });
    }
  }
  return problems;
}
