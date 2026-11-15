/**
 * freestyleGlossaryRegistry: the A–Z glossary entries, read from the
 * freestyle_glossary_terms table.
 *
 * Owns: every entry the glossary page lists, with its term, slug, definition,
 * aliases and optional deeper link, parsed from the stored row.
 *
 * Does not own: the glossary editor's writes (freestyleCurationService), the rules
 * an entry must meet (freestyleGlossaryRules), or the page's alphabetical order and
 * letter groups (freestyleService).
 *
 * The entries are about a hundred short rows read by one page and the editor, so
 * they are read on each call rather than cached; an edit shows on the next read.
 * Read-only: nothing here writes.
 */
import { freestyleGlossaryTerms, type FreestyleGlossaryTermRow } from '../db/db';

/** One glossary entry with every curator-authored field, parsed. */
export interface GlossaryTermRecord {
  slug:       string;
  term:       string;
  definition: string;
  /** Other spellings and abbreviations, in display order. */
  aliases:    readonly string[];
  /** The deeper-material link and its label; both null when there is none. */
  moreHref:   string | null;
  moreLabel:  string | null;
}

function parseAliases(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function toRecord(r: FreestyleGlossaryTermRow): GlossaryTermRecord {
  return {
    slug:       r.slug,
    term:       r.term,
    definition: r.definition,
    aliases:    parseAliases(r.aliases_json),
    moreHref:   r.more_href,
    moreLabel:  r.more_label,
  };
}

/** Every glossary entry, in slug order. */
export function glossaryTerms(): GlossaryTermRecord[] {
  return (freestyleGlossaryTerms.listAll.all() as FreestyleGlossaryTermRow[]).map(toRecord);
}

/** One glossary entry, or null when no entry has that slug. */
export function findGlossaryTerm(slug: string): GlossaryTermRecord | null {
  const row = freestyleGlossaryTerms.getBySlug.get(slug) as FreestyleGlossaryTermRow | undefined;
  return row ? toRecord(row) : null;
}
