/**
 * Beginner-facing one-line notes for the structural-fact block on trick-detail
 * pages (the "Modifier(s)" row). Plain English, glossary-tooltip brevity: one
 * sentence, no notation tokens, no curator/process language.
 *
 * Sourcing: the entries for modifiers that carry a curator feel-card `feel`
 * string are paraphrased from that human-authored copy with the remaining
 * notation jargon ("X-dex", "PS X shorthand", etc.) removed. The entries marked
 * NEEDS-CURATOR below are derived for well-defined operators that lack curator
 * copy; they state only the established, uncontested mechanic and should be
 * confirmed by the curator. Frontier / undefined operators (blazing, terraging,
 * surfing, floating, splicing, warping, backside, shooting) are intentionally
 * absent: their mechanics are not settled, so no note is shown rather than a
 * guessed one.
 *
 * Movement-system and movement-neighborhood notes are NOT here; those reuse the
 * curator-authored axis / topology definitions (first sentence) at the call site.
 */
export const MODIFIER_BEGINNER_NOTES: ReadonlyMap<string, string> = new Map([
  // ── Paraphrased from curator feel cards (jargon removed) ──
  ['pixie',      'A tight, compressed set right before the trick begins.'],
  ['fairy',      'An alternate uptime set that circles the bag on an outside path before the base.'],
  ['stepping',   'A launch set that opens the trick as the support foot relocates.'],
  ['atomic',     'A launch set that adds one dexterity before the base (+1); any X-Dex is a separate +1 marked [XDEX] in the notation, not part of atomic.'],
  ['quantum',    'A quicker, compressed version of the atomic launch.'],
  ['blurry',     'Stepping momentum combined with a paradox side-change.'],
  ['nuclear',    'A heavy launch that stacks a paradox with a downtime illusion dexterity.'],
  ['barraging',  'Two same-direction dexterity moves on a single set.'],
  ['furious',    'Two same-direction dexterity moves on one set (+2); structurally the barraging pattern.'],
  ['paradox',    'The hips pivot between two dexterity moves; the body changes sides mid-trick.'],
  ['spinning',   'A full-body turn carried through the dexterity moment.'],
  ['ducking',    'A head dip near the top so the bag passes around the neck.'],
  ['symposium',  'The support leg stays off the ground through the dexterity moment (no plant).'],

  // ── Well-defined operators with no curator feel card (NEEDS-CURATOR review) ──
  ['gyro',       'A half body turn carried into the dexterity moment.'],
  ['diving',     'The upper body dives over the bag and back during the trick.'],
  ['swirling',   'The whirl-and-swirl launch set: a rotational opening carried by a swirl dexterity.'],
  ['inspinning', 'An inward body turn carried into the dexterity moment.'],
  ['miraging',   'An uptime set that adds one inward dexterity before the base (+1); the inward-dex peer of the atomic launch set.'],
  ['whirling',   'The whirl-family launch set: a rotational opening run before the base (whirling osis is the blender).'],
  ['tapping',    'Adds a quick extra dexterity tap before the base.'],
  ['sailing',    'A compound uptime set that runs two set treatments before the base.'],
  ['railing',    'A compound uptime set combining a held position with a sailing set.'],
]);

export function resolveModifierBeginnerNote(slug: string): string | null {
  return MODIFIER_BEGINNER_NOTES.get(slug) ?? null;
}
