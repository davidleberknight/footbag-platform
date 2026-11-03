/**
 * The A–Z Glossary (/freestyle/glossary): a compact lookup of freestyle
 * vocabulary, each term with a one-sentence definition, optional aliases (other
 * spellings and abbreviations players use for the same thing), and an optional
 * link to the deeper material.
 *
 * The inventory answers "I heard a footbag player use this word, what does it
 * mean?". A word that names a trick, set, contest format, equipment item or event
 * with its own page has no entry here: the Trick Dictionary, Set Encyclopedia,
 * Operators & Modifiers, competition and equipment pages own those. Every
 * definition is a shortening of copy that already exists on the site or a plain
 * restatement of community usage recorded in the curated PassBack glossary; where
 * the site has ruled on a term, the site's reading wins. This module coins no new
 * doctrine. Alphabetical ordering is applied by the service, not by the order
 * below; entries are grouped here by theme only so a curator can find them.
 *
 * Reversible TS content module.
 */

export interface GlossaryTerm {
  /** Displayed term, in established capitalization. */
  term: string;
  /** Stable anchor suffix: the entry renders with id="term-{slug}". */
  slug: string;
  /** One plain-English sentence. No em dashes. */
  definition: string;
  /**
   * Other spellings, abbreviations, or synonyms for the same thing. Rendered
   * beside the term; never a second entry. An alias may not equal another
   * entry's term (that would be a duplicate in disguise).
   */
  aliases?: readonly string[];
  /** Optional deeper-material link; both fields present or both absent. */
  moreHref?: string;
  moreLabel?: string;
}

const CONCEPTS = '/freestyle/concepts';
const COMBO = '/freestyle/combo-analysis';
const HISTORY = '/freestyle/history';

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  // ── Equipment and physical vocabulary ─────────────────────────────────
  {
    term: 'Fill',
    slug: 'fill',
    definition: 'What a bag is stuffed with, most often metal pellets, sometimes plastic or sand.',
    aliases: ['filler'],
  },
  {
    term: 'Broken-in',
    slug: 'broken-in',
    definition: 'A bag whose material has softened with play, so it sits on a surface rather than rolling off.',
    aliases: ['break in'],
  },
  {
    term: 'Mods',
    slug: 'mods',
    definition: 'Modifications players make to shoes to improve their footbag surfaces, most commonly the toe wall mod.',
    aliases: ['shoe mods', 'modifications'],
  },

  // ── Building blocks ────────────────────────────────────────────────────
  {
    term: 'Trick',
    slug: 'trick',
    definition: 'A recognized movement pattern that resolves to a defined outcome, usually a stall or a kick.',
    moreHref: `${CONCEPTS}#tricks-sets-modifiers`, moreLabel: 'Tricks, sets, and modifiers',
  },
  {
    term: 'Component',
    slug: 'component',
    definition: 'A building block of a trick: a contact, a dex, or a body movement.',
    moreHref: `${CONCEPTS}#section-add-accounting`, moreLabel: 'ADD Accounting',
  },
  {
    term: 'Contact',
    slug: 'contact',
    definition: 'A part of the body meeting the bag, defined by a surface plus a stall or a kick.',
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Set',
    slug: 'set',
    definition: 'The launch action that begins a trick and positions the bag; also the named launch systems.',
    aliases: ['setting the bag', 'uptime set'],
    moreHref: '/freestyle/sets', moreLabel: 'Set Encyclopedia',
  },
  {
    term: 'Set foot',
    slug: 'set-foot',
    definition: 'The foot (or leg) that sets the bag into the air.',
    aliases: ['set leg'],
  },
  {
    term: 'Support foot',
    slug: 'support-foot',
    definition: 'The foot (or leg) that stays on the ground while the other sets or catches the bag.',
    aliases: ['support leg', 'plant foot'],
  },
  {
    term: 'Modifier',
    slug: 'modifier',
    definition: 'A transformation applied to an existing trick and not normally performed on its own.',
    moreHref: '/freestyle/operators', moreLabel: 'Operators & Modifiers',
  },
  {
    term: 'Operator',
    slug: 'operator',
    definition: 'A named set, body movement, or structural relationship that combines with a base trick to build a new named trick.',
    moreHref: '/freestyle/operators', moreLabel: 'Operators & Modifiers',
  },
  {
    term: 'Composition',
    slug: 'composition',
    definition: 'The premise that a trick is usually a base move with operators added, rather than one indivisible thing.',
    moreHref: `${CONCEPTS}#section-composition`, moreLabel: 'Runs & Sequences',
  },
  {
    term: 'Family',
    slug: 'family',
    definition: 'A lineage of tricks that share a conserved terminal, the structure they land into.',
    moreHref: `${CONCEPTS}#section-families`, moreLabel: 'Family Encyclopedia',
  },
  {
    term: 'Entry movement',
    slug: 'entry-movement',
    definition: 'A foundational building block performed within tricks, never a terminal lineage of its own.',
    moreHref: `${CONCEPTS}#section-core-concepts`, moreLabel: 'Movement Basics',
  },
  {
    term: 'Body component',
    slug: 'body-component',
    definition: 'Any non-dex movement in a trick, such as a spin or duck, scored in notation as [BOD].',
    aliases: ['BOD'],
    moreHref: `${CONCEPTS}#op-flag-bod`, moreLabel: '[BOD] in notation',
  },
  {
    term: 'ADD',
    slug: 'add',
    definition: 'Additional Degree of Difficulty, which counts scoring components and is not a direct measure of execution difficulty.',
    aliases: ['ADDs', 'add count'],
    moreHref: `${CONCEPTS}#section-add-accounting`, moreLabel: 'ADD Accounting',
  },
  {
    term: 'ADD hunting',
    slug: 'add-hunting',
    definition: 'Chasing high-ADD tricks for the number alone.',
    aliases: ['ADD hunt'],
    moreHref: `${CONCEPTS}#run-quality`, moreLabel: 'ADD philosophy',
  },
  {
    term: 'Technical name',
    slug: 'technical-name',
    definition: 'A trick named from the simplest named version of each of its components: Pixie Ducking Butterfly is the technical name of Phoenix.',
    moreHref: `${CONCEPTS}#section-notation`, moreLabel: 'Trick naming and notation',
  },
  {
    term: 'Nickname',
    slug: 'nickname',
    definition: 'The short community name a trick carries alongside its technical name: Ripwalk for Stepping op Butterfly.',
  },

  // ── Contact surfaces and contact types ─────────────────────────────────
  {
    term: 'Contact surface',
    slug: 'contact-surface',
    definition: 'Where the foot or body meets the bag.',
    aliases: ['surface'],
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Stall',
    slug: 'stall',
    definition: 'Holding the bag still on a contact surface; older sources and the notation flag call this a delay.',
    aliases: ['delay', 'DEL'],
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Kick',
    slug: 'kick',
    definition: 'A contact that redirects the bag instead of holding it, and carries no ADD of its own.',
    moreHref: `${CONCEPTS}#implicit-contacts`, moreLabel: 'Implied contacts',
  },
  {
    term: 'Clipper',
    slug: 'clipper',
    definition: 'A cross-body contact surface: an inside stall with the foot crossed behind the opposite leg.',
    aliases: ['CLIP', 'clipper stall'],
    moreHref: '/freestyle/tricks/clipper_stall', moreLabel: 'Clipper stall in the dictionary',
  },
  {
    term: 'Toe player',
    slug: 'toe-player',
    definition: 'A player whose tricks mostly land on toe, as opposed to a clipper player.',
  },
  {
    term: 'Clipper player',
    slug: 'clipper-player',
    definition: 'A player whose tricks mostly land on clipper, as opposed to a toe player.',
  },
  {
    term: 'Cross-body',
    slug: 'cross-body',
    definition: 'The working foot reaches across and works the bag behind the opposite leg, scored in notation as [XBD].',
    aliases: ['crossbody', 'xbd', 'XBD'],
    moreHref: `${CONCEPTS}#term-cross-body`, moreLabel: 'Cross-body in Freestyle Concepts',
  },
  {
    term: 'Crank',
    slug: 'crank',
    definition: 'Bending the ankle so the inside surface of the shoe flexes upward and flattens.',
  },
  {
    term: 'Roll',
    slug: 'roll',
    definition: 'A contact where the bag rolls across the body from one position to another rather than stopping.',
  },
  {
    term: 'Pincher',
    slug: 'pincher',
    definition: 'A contact where the bag is grabbed behind the knee.',
  },
  {
    term: 'Burger',
    slug: 'burger',
    definition: 'A contact where the bag is trapped between two surfaces, usually a toe stall with the other shoe pressed on top.',
    aliases: ['stallburger'],
  },
  {
    term: 'Transfer',
    slug: 'transfer',
    definition: 'Moving the bag from one contact to another without setting it into the air.',
  },
  {
    term: 'Rooted',
    slug: 'rooted',
    definition: 'Caught or set with the stalling foot on the ground.',
    moreHref: `${CONCEPTS}#op-prestate-rooted`, moreLabel: '(rooted) in notation',
  },
  {
    term: 'Magic hop',
    slug: 'magic-hop',
    definition: 'A small hop of the support leg just before and just after the bag is stalled, used to keep rhythm.',
  },

  // ── Dexterities ────────────────────────────────────────────────────────
  {
    term: 'Dex',
    slug: 'dex',
    definition: 'Short for dexterity: the foot circles the bag while it is in the air.',
    aliases: ['dexterity', 'DEX'],
    moreHref: `${CONCEPTS}#section-dexterities`, moreLabel: 'Dexterities',
  },
  {
    term: 'Dexless',
    slug: 'dexless',
    definition: 'A trick or component that contains no dex.',
    moreHref: `${CONCEPTS}#term-dexless`, moreLabel: 'Dexless in Freestyle Concepts',
  },
  {
    term: 'Direction',
    slug: 'direction',
    definition: 'A dex travels inward or outward around the leg, and reversing it gives a different trick with its own name.',
    moreHref: `${CONCEPTS}#section-dexterities`, moreLabel: 'Dexterities',
  },
  {
    term: 'In-dex',
    slug: 'in-dex',
    definition: 'A dex that travels inward: the bag arcs toward the body\'s center line.',
    moreHref: `${CONCEPTS}#term-in-dex`, moreLabel: 'In-dex in Freestyle Concepts',
  },
  {
    term: 'Out-dex',
    slug: 'out-dex',
    definition: 'A dex that travels outward: the bag arcs away from the body\'s center line.',
    moreHref: `${CONCEPTS}#term-out-dex`, moreLabel: 'Out-dex in Freestyle Concepts',
  },
  {
    term: 'Direction reversal',
    slug: 'rev-zero',
    definition: 'The operator, written rev(0), that reverses a dex\'s in and out direction while adding no difficulty.',
    aliases: ['rev(0)'],
    moreHref: `${CONCEPTS}#term-rev-zero`, moreLabel: 'Direction reversal in Freestyle Concepts',
  },
  {
    term: 'Same-side',
    slug: 'same-side',
    definition: 'The dex acts on the same leg as the most recent side-bearing component, written SAME or ss.',
    aliases: ['ss', 'SAME'],
    moreHref: `${CONCEPTS}#term-same-side`, moreLabel: 'Relative-side relationships',
  },
  {
    term: 'Opposite',
    slug: 'opposite-side',
    definition: 'The dex acts on the opposite leg from the most recent side-bearing component, written OP or op.',
    aliases: ['op', 'OP', 'opposite side'],
    moreHref: `${CONCEPTS}#term-opposite-side`, moreLabel: 'Relative-side relationships',
  },
  {
    term: 'Far',
    slug: 'far',
    definition: 'Another name in trick names for the opposite-side (OP) relation; it adds no difficulty on its own.',
    moreHref: `${CONCEPTS}#term-op-not-xdex`, moreLabel: 'Relative-side relationships',
  },
  {
    term: 'Near',
    slug: 'near',
    definition: 'Another name in trick names for the same-side (SAME) relation; it adds no difficulty on its own.',
    moreHref: `${CONCEPTS}#term-op-not-xdex`, moreLabel: 'Relative-side relationships',
  },
  {
    term: 'X-Dex',
    slug: 'x-dex',
    definition: 'An extra dexterity worth +1, scored wherever the operational notation carries the [XDEX] marker on a dex.',
    aliases: ['Xdex', 'XDEX'],
    moreHref: `${CONCEPTS}#term-x-dex`, moreLabel: 'X-Dex in Freestyle Concepts',
  },
  {
    term: 'Hippy',
    slug: 'hippy',
    definition: 'A dex whose motion comes from the hip: the thigh circles the bag.',
    moreHref: `${CONCEPTS}#term-hippy-leggy`, moreLabel: 'Motion style in Freestyle Concepts',
  },
  {
    term: 'Leggy',
    slug: 'leggy',
    definition: 'A dex whose motion comes from the knee: the calf circles the bag.',
    moreHref: `${CONCEPTS}#term-hippy-leggy`, moreLabel: 'Motion style in Freestyle Concepts',
  },
  {
    term: 'Full dex',
    slug: 'full-dex',
    definition: 'A dex that circles the bag entirely, returning the leg to the side it started on.',
    moreHref: `${CONCEPTS}#term-full-half-dex`, moreLabel: 'Full vs half dex',
  },
  {
    term: 'Half dex',
    slug: 'half-dex',
    definition: 'A dex that circles the bag only partway, finishing on the opposite side.',
    moreHref: `${CONCEPTS}#term-full-half-dex`, moreLabel: 'Full vs half dex',
  },
  {
    term: 'Dex window',
    slug: 'dex-window',
    definition: 'The space around the leg a dex passes through.',
    aliases: ['window'],
    moreHref: `${CONCEPTS}#term-dex-window`, moreLabel: 'Execution window',
  },
  {
    term: 'Deep',
    slug: 'deep',
    definition: 'A dex that sits high in the window, well away from the shoe.',
    moreHref: `${CONCEPTS}#term-deep`, moreLabel: 'Execution window',
  },
  {
    term: 'Thin',
    slug: 'thin',
    definition: 'A dex that sits at the edge of the window, close to the shoe, so the bag barely clears the leg.',
    moreHref: `${CONCEPTS}#term-thin`, moreLabel: 'Execution window',
  },
  {
    term: 'Shoey',
    slug: 'shoey',
    definition: 'A dex that grazes the shoe surface during the circle.',
    moreHref: `${CONCEPTS}#term-shoey`, moreLabel: 'Execution window',
  },
  {
    term: 'Scoopy',
    slug: 'scoopy',
    definition: 'A dex or catch where the leg cups beneath the bag in an arced motion rather than circling or catching cleanly.',
    aliases: ['scooped', 'scoop'],
    moreHref: `${CONCEPTS}#term-scoopy`, moreLabel: 'Execution window',
  },

  // ── Execution and result vocabulary ────────────────────────────────────
  {
    term: 'Clean',
    slug: 'clean',
    definition: 'Fully controlled, clearly executed.',
    moreHref: `${CONCEPTS}#term-clean`, moreLabel: 'Execution quality',
  },
  {
    term: 'Sloppy',
    slug: 'sloppy',
    definition: 'Poorly controlled execution: the dex completes but the motion is unclear or the bag\'s path is uneven.',
    moreHref: `${CONCEPTS}#term-sloppy`, moreLabel: 'Execution quality',
  },
  {
    term: 'Pulled',
    slug: 'pulled',
    definition: 'A set where the bag is dragged through an uptime dex or a spin before the intended component happens.',
    moreHref: `${CONCEPTS}#term-pulled`, moreLabel: 'Execution quality',
  },
  {
    term: 'Slurry',
    slug: 'slurry',
    definition: 'Synonym for a pulled set.',
    moreHref: `${CONCEPTS}#term-slurry`, moreLabel: 'Execution quality',
  },
  {
    term: 'Froggy',
    slug: 'froggy',
    definition: 'A pulled spin: a spin that drags the bag through before the intended component happens.',
    moreHref: `${CONCEPTS}#term-froggy`, moreLabel: 'Execution quality',
  },
  {
    term: 'Over-dexed',
    slug: 'over-dexed',
    definition: 'A dex with more motion than the trick requires.',
    aliases: ['over-dex'],
    moreHref: `${CONCEPTS}#term-over-dexed`, moreLabel: 'Execution quality',
  },
  {
    term: 'Hit',
    slug: 'hit',
    definition: 'To complete a trick; footbag players hit tricks rather than land them.',
  },
  {
    term: 'Handcatch',
    slug: 'handcatch',
    definition: 'Catching the bag in the hand after hitting a trick, written [trick]>hand in string notation.',
    aliases: ['hand'],
  },
  {
    term: 'Seal',
    slug: 'seal',
    definition: 'Hitting a trick with enough control to do something after it: a whirl sealed with a mirage.',
    aliases: ['sealed'],
  },
  {
    term: 'Drop',
    slug: 'drop',
    definition: 'The bag hitting the ground; dropless describes a run of tricks performed without one.',
    aliases: ['dropped'],
  },
  {
    term: 'Bail',
    slug: 'bail',
    definition: 'To change a trick on the fly to something easier in order to avoid a drop.',
    aliases: ['bailed'],
  },
  {
    term: 'Footed',
    slug: 'footed',
    definition: 'A trick that was almost hit, but the bag rolled off the stalling foot at the end.',
  },
  {
    term: 'Peak',
    slug: 'peak',
    definition: 'The top of the bag\'s flight, where uptime turns into downtime.',
    aliases: ['peaking'],
    moreHref: `${CONCEPTS}#section-timing-sets`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Strong side',
    slug: 'strong-side',
    definition: 'A player\'s preferred side for a trick or component.',
  },
  {
    term: 'Flip side',
    slug: 'flip-side',
    definition: 'A player\'s non-preferred side for a trick or component.',
    aliases: ['flipside', 'flip'],
  },
  {
    term: 'Air shred',
    slug: 'air-shred',
    definition: 'To practice a trick without the bag, to get a feel for the motions.',
  },

  // ── Timing ─────────────────────────────────────────────────────────────
  {
    term: 'Uptime',
    slug: 'uptime',
    definition: 'The phase before the peak, while the bag is rising.',
    moreHref: `${CONCEPTS}#section-timing-sets`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Midtime',
    slug: 'midtime',
    definition: 'The phase at the peak, the brief no-plant moment.',
    aliases: ['hangtime'],
    moreHref: `${CONCEPTS}#section-timing-sets`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Downtime',
    slug: 'downtime',
    definition: 'The phase after the peak, while the bag is falling toward the catch.',
    moreHref: `${CONCEPTS}#section-timing-sets`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Attack',
    slug: 'attack',
    definition: 'How quickly a player begins the next phase\'s component.',
    moreHref: `${CONCEPTS}#term-attack`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Set realization',
    slug: 'set-realization',
    definition: 'A dex performed as part of launching and positioning the bag.',
    moreHref: `${CONCEPTS}#term-set-realization`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Standalone realization',
    slug: 'standalone-realization',
    definition: 'A dex movement realized independently after the bag is launched and before the terminal.',
    moreHref: `${CONCEPTS}#term-standalone-realization`, moreLabel: 'Timing & Sets',
  },

  // ── Provisional operators: these entries are each page's only way in ───
  {
    term: 'Symple',
    slug: 'symple',
    definition: 'A historical token seen beside symposium in source material. Whether it names a distinct movement is unresolved.',
    moreHref: '/freestyle/modifier/symple', moreLabel: 'Symple modifier page',
  },
  {
    term: 'Muted',
    slug: 'muted',
    definition: 'An active leg held in the air for an entire component without planting.',
    moreHref: '/freestyle/modifier/muted', moreLabel: 'Muted modifier page',
  },
  {
    term: 'Flying',
    slug: 'flying',
    definition: 'A contact or trick performed with the whole body in the air, a no-stall body modifier.',
    aliases: ['flyer'],
    moreHref: '/freestyle/modifier/flying', moreLabel: 'Flying modifier page',
  },

  // ── Name shorthand ─────────────────────────────────────────────────────
  {
    term: 'Backside',
    slug: 'backside',
    definition: 'Player shorthand for a trick with its downtime component made symposium.',
    moreHref: '/freestyle/modifier/symposium', moreLabel: 'Symposium modifier page',
  },
  {
    term: 'Alpine',
    slug: 'alpine',
    definition: 'Shorthand that splits a trick between its uptime and downtime and inserts a duck or dive between them.',
    moreHref: `${CONCEPTS}#term-alpine`, moreLabel: 'Alpine in Freestyle Concepts',
  },
  {
    term: 'LIMP',
    slug: 'limp',
    definition: 'The four basic toe tricks as a group: Legover, Illusion, Mirage, and Pickup.',
    moreHref: `${CONCEPTS}#section-core-concepts`, moreLabel: 'Movement Basics',
  },

  // ── Strings, runs, and combinations ────────────────────────────────────
  {
    term: 'Run',
    slug: 'run',
    definition: 'A continuous, unplanned flow of tricks linked one after another, counted in contacts.',
    aliases: ['string'],
    moreHref: `${COMBO}#run-quality`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'String notation',
    slug: 'string-notation',
    definition: 'Writing tricks out with an arrow between linked tricks: Mirage>Clipper>ss Legover.',
    moreHref: COMBO, moreLabel: 'Combo Analysis',
  },
  {
    term: 'Combo',
    slug: 'combo',
    definition: 'Any number of tricks linked as a group, usually shorter and more deliberately built than a string.',
    moreHref: COMBO, moreLabel: 'Combo Analysis',
  },
  {
    term: 'Link',
    slug: 'link',
    definition: 'Two tricks performed one straight after the other.',
    aliases: ['linked'],
    moreHref: COMBO, moreLabel: 'Combo Analysis',
  },
  {
    term: 'Unique',
    slug: 'unique',
    definition: 'A trick in a string or combo that has not already been done on that side of the body.',
    moreHref: COMBO, moreLabel: 'Combo Analysis',
  },
  {
    term: 'Drill',
    slug: 'drill',
    definition: 'A combo done on one side of the body and then repeated exactly on the other.',
  },
  {
    term: 'Rewind',
    slug: 'rewind',
    definition: 'A combo that reverses its order at the halfway point instead of repeating it.',
  },
  {
    term: 'Mirror',
    slug: 'mirror',
    definition: 'A link whose two tricks are mirror images of each other in forward and reverse motion.',
  },
  {
    term: 'Back-to-back',
    slug: 'back-to-back',
    definition: 'The same trick linked two or more times in a row.',
    aliases: ['b2b'],
  },
  {
    term: 'Both sides',
    slug: 'both-sides',
    definition: 'Doing a trick on both sides of the body.',
    aliases: ['bs', 'both-sided'],
  },
  {
    term: 'BSOS',
    slug: 'bsos',
    definition: '"Both sides one string": a trick done on both sides of the body within a single string; string and run name the same continuous sequence here, so BSOR describes the same achievement.',
    aliases: ['BSOR', 'bee sauce'],
  },
  {
    term: 'Midstring',
    slug: 'midstring',
    definition: 'Doing a trick in the middle of a string rather than in isolation.',
  },
  {
    term: 'Shuffle',
    slug: 'shuffle',
    definition: 'A combo built by linking tricks that use uptime dexing sets.',
    aliases: ['shuffling'],
  },

  // ── Community and play vocabulary ──────────────────────────────────────
  {
    term: 'Shred',
    slug: 'shred',
    definition: 'To play freestyle, especially to play well.',
    aliases: ['shredding'],
  },
  {
    term: 'Passback',
    slug: 'passback',
    definition: 'Giving the previous player another turn instead of taking your own; also the name of a tutorial video series.',
    moreHref: `${HISTORY}#institutions`, moreLabel: 'Institutions in Freestyle History',
  },

  // ── ADD tiers and run quality ──────────────────────────────────────────
  {
    term: 'Tiltless',
    slug: 'tiltless',
    definition: 'A run in which every trick reaches at least 2 ADD.',
    moreHref: `${COMBO}#run-quality-tiltless`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'Guiltless',
    slug: 'guiltless',
    definition: 'A run in which every trick reaches at least 3 ADD.',
    moreHref: `${COMBO}#run-quality-guiltless`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'Tripless',
    slug: 'tripless',
    definition: 'A run in which every trick reaches at least 4 ADD.',
    moreHref: `${COMBO}#run-quality-tripless`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'Fearless',
    slug: 'fearless',
    definition: 'A run in which every trick reaches at least 5 ADD.',
    moreHref: `${COMBO}#run-quality-fearless`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'Beastly',
    slug: 'beastly',
    definition: 'A run in which every trick reaches at least 6 ADD.',
    moreHref: `${COMBO}#run-quality-beastly`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'Godly',
    slug: 'godly',
    definition: 'A run in which every trick reaches at least 7 ADD.',
    moreHref: `${COMBO}#run-quality-godly`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'Genuine',
    slug: 'genuine',
    definition: 'Guiltless play that uses no BOP tricks.',
    aliases: ['Genuine Guiltless'],
    moreHref: `${COMBO}#run-quality-genuine`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'BOP',
    slug: 'bop',
    definition: 'Butterfly, Osis, Paradox Mirage: the most basic guiltless tricks.',
    aliases: ['BOPs'],
    moreHref: `${COMBO}#run-quality-bop`, moreLabel: 'Run quality in Combo Analysis',
  },

  // ── Notation ───────────────────────────────────────────────────────────
  {
    term: 'Operational notation',
    slug: 'operational-notation',
    definition: 'The token-by-token spelling of a trick, and the source of truth for what it scores.',
    moreHref: `${CONCEPTS}#operational-notation`, moreLabel: 'Operational notation',
  },
  {
    term: 'Jobs notation',
    slug: 'jobs-notation',
    definition: 'The 1995 notation that describes a trick by the movement it is rather than the name it carries.',
    aliases: ["Job's notation"],
    moreHref: `${CONCEPTS}#jobs-notation`, moreLabel: 'Jobs notation',
  },
];

// Module-load invariants: one canonical entry per term and per anchor slug, an
// alias never doubles as another entry's term, and a "more" link always travels
// with its label. A duplicate here would render two entries for one term, which
// is exactly what a glossary must not do.
(() => {
  const terms = new Set<string>();
  const slugs = new Set<string>();
  for (const t of GLOSSARY_TERMS) {
    const termKey = t.term.trim().toLowerCase();
    if (terms.has(termKey)) throw new Error(`duplicate glossary term: ${t.term}`);
    if (slugs.has(t.slug)) throw new Error(`duplicate glossary slug: ${t.slug}`);
    if ((t.moreHref === undefined) !== (t.moreLabel === undefined)) {
      throw new Error(`glossary term ${t.term} must carry both moreHref and moreLabel or neither`);
    }
    terms.add(termKey);
    slugs.add(t.slug);
  }
  const aliasOwner = new Map<string, string>();
  for (const t of GLOSSARY_TERMS) {
    for (const a of t.aliases ?? []) {
      const key = a.trim().toLowerCase();
      // A case variant of the entry's own term is fine; the same string as
      // ANOTHER entry's term is a duplicate in disguise.
      if (key !== t.term.trim().toLowerCase() && terms.has(key)) {
        throw new Error(`glossary alias "${a}" on ${t.term} duplicates an entry term`);
      }
      const owner = aliasOwner.get(key);
      if (owner && owner !== t.term) throw new Error(`glossary alias "${a}" claimed by both ${owner} and ${t.term}`);
      aliasOwner.set(key, t.term);
    }
  }
})();
