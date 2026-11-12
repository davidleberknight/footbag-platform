/**
 * Per-trick curator lines for the page's plain-words opening.
 *
 * The derivatives note is a concise editorial line pointing at a trick's major
 * higher-ADD derivatives, so the page answers "what does this build into"
 * without repeating the build chain. The naming note explains a community name
 * the alias line deliberately leaves out, because it names a narrower form than
 * the trick itself. Both are curator-authored and keyed by slug; a trick with no
 * entry renders nothing.
 */
export const ABOUT_DERIVATIVES: Readonly<Record<string, string>> = {
  torque: 'Major 5-ADD derivatives include Mobius (gyro torque) and Paradox Torque.',
};

export const ABOUT_NAMING_NOTES: Readonly<Record<string, string>> = {
  butterfly:
    'Infinity is a community name for the clipper-set butterfly: a butterfly launched from a clipper set. ' +
    'It names that clipper-set form specifically, so the dictionary preserves Infinity as a historical name rather than listing it among butterfly\'s plain aliases.',
};

export function getAboutDerivatives(slug: string): string | null {
  return ABOUT_DERIVATIVES[slug] ?? null;
}

export function getAboutNamingNote(slug: string): string | null {
  return ABOUT_NAMING_NOTES[slug] ?? null;
}
