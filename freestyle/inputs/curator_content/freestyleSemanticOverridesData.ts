/**
 * freestyleSemanticOverridesData.ts
 *
 * Two kinds of curator content for the trick page, seeded into
 * `freestyle_tricks`:
 *
 * 1. COMPOUND_SEMANTIC_DESCRIPTIONS, seeded into `description`. Each is a
 *    curator-authored reading of the trick, in plain compositional prose rather
 *    than notation or ADD math, and replaces the description the dictionary
 *    load gave the row.
 *
 * 2. REVERSE_PAIR_BASES, seeded into `reverse_pair_base`. Each names the trick
 *    the key reverses, so the page can show the rev(0) formula. rev(0) reverses
 *    the in-to-out dex direction and is used sparingly: only for these five
 *    pedagogically clear pairs, never mechanically for every reverse-direction
 *    trick, and never as the start of a general symbolic algebra.
 */

export const COMPOUND_SEMANTIC_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  ['furious',        'a two-dex set: two same-direction dexterity steps on a single set, contributing +2.'],
  ['atom_smasher',   'atomic mirage composition: atomic set primitive followed by a mirage-class terminal.'],
  // Foundational set operators: identity plus the uptime relationship to the dex
  // they echo (Pixie to Around the World, Fairy to Orbit). Worded as "an uptime
  // X", never "X equals Y".
  ['pixie', 'A set primitive that circles the leg around the bag during the set, acting as a +1 set modifier. Pixie can be understood as an uptime Around the World: both involve a leg circling the bag, but Pixie performs the circling motion as part of the set itself, before the bag reaches its peak, while Around the World completes that dexterity around a stalled bag.'],
  ['fairy', 'A set primitive, the opposite-direction counterpart of pixie, acting as a +1 set modifier. Fairy can be understood as an uptime Orbit: it performs the reverse-direction circling dexterity during the set, before the bag reaches its peak, while Orbit completes that same reverse-direction dexterity around a stalled bag.'],
  ['around_the_world_kick', 'Circle the bag with the foot, then kick it instead of stalling it. Most dexterity tricks finish by catching the bag in a stall; a dex-kick finishes the same circling motion with a kick, so the loop scores a single ADD because no terminal stall is added. Around the World Kick is the most common trick of this kind, and it is no longer the only one: the same drop-the-stall pattern produces a small group of 1-ADD dex-kick tricks, including Pixie Kick, Orbit Kick, Fairy Kick, Legover Kick, Miraging Kick, and Illusioning Kick. Around the World Kick is the one commonly practiced; the others follow naturally from the notation but are rarely performed as named tricks.'],
  // Pixie Kick and Around the World Kick share notation; only the footwork differs,
  // which the symbol cannot express, so the distinction is stated in prose.
  ['pixie_kick', 'Pixie Kick shares its notation with Around the World Kick but differs in footwork: Around the World Kick finishes with a kick from the same foot that circled the bag, while Pixie Kick finishes with a kick from the opposite foot. Both are 1-ADD dex-kicks: two ways to perform a dexterity without ending in a stall.'],
  // Illusioning Kick is a logically-derived dex-kick: the illusion-direction dexterity
  // without its terminal stall, and the direction-reversed sibling of Miraging Kick.
  // Rarely practiced as a named trick.
  ['illusioning_kick', 'Illusioning Kick uses the illusion-direction dexterity, an opposite-side outward dex, and finishes with a kick instead of a stall. It is the direction-reversed sibling of Miraging Kick. Like Pixie Kick, Orbit Kick, Fairy Kick, and the other dex-kicks, it follows naturally from the notation system by replacing the final stall with a kick, and is rarely encountered as a named or commonly practiced freestyle trick.'],
  // Carousel: a Rake-terminal frontier compound. Names the major structural
  // phases and the terminal that gives it its identity, without listing every
  // token or restating the execution notation.
  ['surging_ducking_paradox_symposium_whirling_rake', 'Carousel is a frontier compound built around a Rake terminal. A Surging entry leads into Ducking, followed by the Paradox, Symposium, and Whirling structure that sets up the final swing-to-toe Rake finish. It is one of the deepest Rake-terminal structures in the vocabulary.'],
  // Big Apple Sauce: a Torque-family frontier trick. Describes its actual
  // structural sequence (spinning/paradox entry, no-plant inward dex, Torque
  // spin-to-clipper terminal) and avoids the retired "miraging" operator language.
  ['big_apple_sauce', 'A Torque-family frontier trick. It opens with a spinning paradox entry, threads a no-plant inward dexterity through the middle, and resolves on a Torque spin-to-clipper terminal in the osis mold. What distinguishes it is that entry: the paradox rides the inward lead dexterity before the closing spin settles the bag onto the cross-body clipper.'],
  ['2_bag_juggling', 'Controlling two bags with a single foot, keeping both in play through alternating stalls on the same surface. The foundational multi-bag primitive: where standard freestyle works one bag, two-bag juggling adds a second object the foot must track and re-stall without dropping either.'],
  ['3_bag_juggling', 'Controlling three bags with two feet, keeping all three in play through coordinated stalls across both feet. A higher-order multi-bag primitive: where two-bag juggling works two bags on a single foot, three-bag juggling distributes three bags across both feet, each foot tracking and re-stalling its share without dropping any.'],
]);

export const REVERSE_PAIR_BASES: ReadonlyMap<string, string> = new Map([
  ['illusion',  'mirage'],
  ['pickup',    'legover'],
  ['rev_whirl', 'whirl'],
  ['rev_swirl', 'swirl'],
  ['orbit',     'around_the_world'],
]);
