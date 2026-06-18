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
  ['stepping',   'A foot relocation mid-trick; the kicking foot moves between phases.'],
  ['atomic',     'A launch set that packs an extra hidden dexterity move in before the base.'],
  ['quantum',    'A quicker, compressed version of the atomic launch.'],
  ['blurry',     'Stepping momentum combined with a paradox side-change.'],
  ['nuclear',    'A heavy launch that stacks a paradox with a downtime illusion dexterity.'],
  ['barraging',  'Two same-direction dexterity moves on a single set.'],
  ['furious',    'Two fast dexterity moves driven through with extra rotation.'],
  ['paradox',    'The hips pivot between two dexterity moves; the body changes sides mid-trick.'],
  ['spinning',   'A full-body turn carried through the dexterity moment.'],
  ['ducking',    'A head dip near the top so the bag passes around the neck.'],
  ['symposium',  'The support leg stays off the ground through the dexterity moment (no plant).'],

  // ── Well-defined operators with no curator feel card (NEEDS-CURATOR review) ──
  ['gyro',       'A half body turn carried into the dexterity moment.'],
  ['diving',     'A forward body dive over the bag during the trick.'],
  ['swirling',   'A body turn run through the trick, following the swirl direction.'],
  ['inspinning', 'An inward body turn carried into the dexterity moment.'],
  ['miraging',   'Adds a mirage-style downtime dexterity move onto the base.'],
  ['whirling',   'Adds a front-whirl dexterity move onto the base.'],
  ['tapping',    'Adds a quick extra dexterity tap before the base.'],
  ['sailing',    'A compound uptime set that runs two set treatments before the base.'],
  ['railing',    'A compound uptime set combining a held position with a sailing set.'],
]);

export function resolveModifierBeginnerNote(slug: string): string | null {
  return MODIFIER_BEGINNER_NOTES.get(slug) ?? null;
}
