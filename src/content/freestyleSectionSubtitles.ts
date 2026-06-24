/**
 * Per-(section, trick) curator-authored detail-page section subtitles.
 *
 * Each detail-page section renders a one-line subtitle ONLY when a curator has
 * authored trick-specific copy for that section. A trick with no entry renders
 * no subtitle at all (the section heading stands alone). There is no generic
 * boilerplate fallback: a subtitle that merely restates the heading is worse
 * than none.
 */
export type DetailSectionKey =
  | 'movementNotation'
  | 'executionNotation'
  | 'equivalentReadings'
  | 'movementIntuition'
  | 'namingInterpretation'
  | 'structuralNeighbors'
  | 'modifiers'
  | 'familyLadder';

const SECTION_SUBTITLES: Readonly<Record<DetailSectionKey, Readonly<Record<string, string>>>> = {
  movementNotation: {
    bubba: 'Clipper-set illusion.',
  },
  executionNotation: {
    spin:            'Standalone body turn ending in a kick action.',
    'miraging_kick': 'Mirage dex pattern that resolves to a kick instead of a delay.',
  },
  equivalentReadings: {
    torque: 'Canonical and historical ways this move has been analyzed.',
    mobius: 'Compressed gyro-torque reading, then expanded source-style readings.',
  },
  movementIntuition:    {},
  namingInterpretation: {},
  structuralNeighbors:  {},
  modifiers:            {},
  familyLadder:         {},
};

export const DETAIL_SECTION_KEYS = Object.keys(SECTION_SUBTITLES) as DetailSectionKey[];

/** All section subtitles for one trick; each key is the curator copy or null. */
export function getSectionSubtitles(slug: string): Record<DetailSectionKey, string | null> {
  const out = {} as Record<DetailSectionKey, string | null>;
  for (const key of DETAIL_SECTION_KEYS) {
    out[key] = SECTION_SUBTITLES[key][slug] ?? null;
  }
  return out;
}
