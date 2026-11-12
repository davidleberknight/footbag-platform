/**
 * freestyleSectionSubtitles.ts
 *
 * Curator-authored one-line subtitles under a trick page's notation headings,
 * staged for loader 28a, which seeds them into freestyle_tricks:
 *
 *   MOVEMENT_NOTATION_SUBTITLES  → movement_notation_subtitle
 *   EXECUTION_NOTATION_SUBTITLES → execution_notation_subtitle
 *
 * A trick with no entry shows the heading alone; a subtitle that only restates
 * the heading is worse than none.
 *
 * Deleted with the pipeline at cutover, together with the seeder.
 */

export const MOVEMENT_NOTATION_SUBTITLES: ReadonlyMap<string, string> = new Map([
  ['bubba', 'Clipper-set illusion.'],
]);

export const EXECUTION_NOTATION_SUBTITLES: ReadonlyMap<string, string> = new Map([
  ['spin',          'Standalone body turn ending in a kick action.'],
  ['miraging_kick', 'Mirage dex pattern that resolves to a kick instead of a stall.'],
]);
