/**
 * Per-trick "About this trick" derivatives note, rendered after the build chain.
 *
 * A concise editorial line pointing at a trick's major higher-ADD derivatives,
 * so the page answers "what does this build into" without repeating the build
 * chain. Curator-authored, keyed by slug; a trick with no entry renders nothing.
 */
export const ABOUT_DERIVATIVES: Readonly<Record<string, string>> = {
  torque: 'Major 5-ADD derivatives include Mobius (gyro torque) and Paradox Torque.',
};

export function getAboutDerivatives(slug: string): string | null {
  return ABOUT_DERIVATIVES[slug] ?? null;
}
