/**
 * Per-trick "Movement notation" section subtitle.
 *
 * The notation block's subtitle is a trick-specific one-line gloss of what the
 * trick IS, not generic boilerplate. Curator-authored, keyed by slug. A trick
 * with no entry renders NO subtitle (the section heading stands alone); the
 * notation block never emits filler that merely restates the heading.
 */
export const NOTATION_SUBTITLES: Readonly<Record<string, string>> = {
  bubba:           'Clipper-set illusion.',
  'miraging-kick': 'Mirage-style dex ending in a kick.',
};

export function getNotationSubtitle(slug: string): string | null {
  return NOTATION_SUBTITLES[slug] ?? null;
}
