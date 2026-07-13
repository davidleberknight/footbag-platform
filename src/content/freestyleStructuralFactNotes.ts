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
  ['fairy',      'An alternate set that circles the bag on an outside path before the base.'],
  ['stepping',   'A launch set that opens the trick as the support foot relocates.'],
  ['atomic',     'A launch set that adds one dexterity before the base (+1); any X-Dex is a separate +1 marked [XDEX] in the notation, not part of atomic.'],
  ['quantum',    'A quicker, compressed version of the atomic launch.'],
  ['blurry',     'Stepping momentum combined with a paradox side-change.'],
  ['nuclear',    'A heavy launch that stacks a paradox with a downtime illusion dexterity.'],
  // No 'barraging' entry: it is a legacy name for the Furious set, not an
  // active operator, so it never earns a structural-fact chip of its own.
  ['furious',    'Two same-direction dexterity moves on one set (+2); a two-dex set.'],
  ['paradox',    'The hips pivot on a single dexterity; the body changes sides mid-trick without adding another dex.'],
  ['spinning',   'A full-body turn carried through the middle of the trick.'],
  ['ducking',    'A head dip near the top so the bag passes around the neck.'],
  ['symposium',  'The support leg stays off the ground through the middle of the trick (no plant).'],

  // ── Well-defined operators with no curator feel card (NEEDS-CURATOR review) ──
  ['gyro',       'A half body turn carried into the middle of the trick, on the same foot that set the bag.'],
  ['diving',     'The upper body dives over the bag and back during the trick.'],
  ['swirling',   'Inserts the swirl-cell dexterity, a same-side out dex, ahead of the base (+1).'],
  ['inspinning', 'A forward body turn carried through the middle of the trick.'],
  ['miraging',   'Descriptive mirage-family language for the inward standalone movement that adds one inward dexterity before the base (+1). Quantum is the same inward movement realized with a set role; miraging is not a launch set or a Quantum equivalent.'],
  ['whirling',   'The whirl-family launch set: a rotational opening run before the base (whirling osis is the blender).'],
  ['tapping',    'Adds a quick extra dexterity tap before the base.'],
  ['sailing',    'A compound set that runs two set treatments before the base.'],
  ['railing',    'A compound set combining a held position with a sailing set.'],
]);

export function resolveModifierBeginnerNote(slug: string): string | null {
  return MODIFIER_BEGINNER_NOTES.get(slug) ?? null;
}
