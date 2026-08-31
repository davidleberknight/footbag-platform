/**
 * The A–Z Glossary (/freestyle/glossary): freestyle terms with a concise
 * plain-English definition each, optional aliases (other spellings and
 * abbreviations players use for the same thing), and an optional link to the
 * deeper material (a Freestyle Concepts chapter, a Set Encyclopedia page, an
 * operator page, a trick-detail page, Combo Analysis, competition, or history).
 *
 * The inventory answers "I heard a footbag player use this word, what does it
 * mean?", so ordinary play, string, execution, equipment, and competition
 * vocabulary sits beside the structural vocabulary. Every definition here is a
 * shortening of copy that already exists on the site or a plain restatement of
 * community usage recorded in the curated PassBack glossary; where the site has
 * ruled on a term, the site's reading wins and PassBack is only evidence that
 * the word is in use. This module coins no new doctrine: where a term needs a
 * real explanation, the entry stays short and `moreHref` points at the existing
 * home. Alphabetical ordering is applied by the service, not by the order below;
 * entries are grouped here by theme only so a curator can find them.
 *
 * Reversible TS content module.
 */

export interface GlossaryTerm {
  /** Displayed term, in established capitalization. */
  term: string;
  /** Stable anchor suffix: the entry renders with id="term-{slug}". */
  slug: string;
  /** One or two plain-English sentences. No em dashes. */
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
const COMPETITION = '/freestyle/competition';
const HISTORY = '/freestyle/history';

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  // ── Equipment and physical vocabulary ─────────────────────────────────
  {
    term: 'Footbag',
    slug: 'footbag',
    definition: 'The bag itself, the piece of equipment the sport is played with, and the name of the sport. Players mostly say bag; hacky sack is the older name outsiders use, sometimes ironically inside the sport.',
    aliases: ['bag', 'hacky sack'],
    moreHref: '/freestyle/start', moreLabel: 'Start here',
  },
  {
    term: 'Panels',
    slug: 'panels',
    definition: 'The stitched pieces a bag is made from. Their count names the style of bag: 32s and 14s are the most common.',
  },
  {
    term: 'Fill',
    slug: 'fill',
    definition: 'What a bag is stuffed with, most often metal pellets, sometimes plastic or sand. Fill gives the bag enough weight to control and feel.',
    aliases: ['filler'],
  },
  {
    term: 'Broken-in',
    slug: 'broken-in',
    definition: 'A bag whose material has softened with play. A new, unbroken bag is rolly and harder to control; a well broken-in bag is floppy or stally and sits on a surface.',
    aliases: ['break in'],
  },
  {
    term: 'Lavers',
    slug: 'lavers',
    definition: 'The Adidas Rod Laver, the standard freestyle shoe from the mid-1990s to the mid-2010s; the specific popular model is no longer made.',
    aliases: ['Adidas Rod Laver'],
  },
  {
    term: 'Quantums',
    slug: 'quantums',
    definition: 'Shoes designed for footbag by the community itself, first produced in the 2010s and later redesigned. Not to be confused with the Quantum set.',
  },
  {
    term: 'Toe box',
    slug: 'toe-box',
    definition: 'The space above the toe surface of the shoe. A toe box large and sturdy enough to hold a bag is what a toe wall mod creates.',
  },
  {
    term: 'Toe wall',
    slug: 'toe-wall',
    definition: 'The side of the shoe around the toes. The toe wall mod pulls the walls away from the toe surface so the toe box can hold a bag.',
  },
  {
    term: 'Mods',
    slug: 'mods',
    definition: 'Modifications players make to shoes to improve their footbag surfaces. The most common is the toe wall mod; the Brocka mod removes material at the inner ankle to flatten the inside surface.',
    aliases: ['shoe mods', 'modifications'],
  },

  // ── Building blocks ────────────────────────────────────────────────────
  {
    term: 'Trick',
    slug: 'trick',
    definition: 'A recognized movement pattern that resolves to a defined outcome, usually a stall or a kick. Mirage, Butterfly, Osis, and Torque are tricks.',
    moreHref: `${CONCEPTS}#tricks-sets-modifiers`, moreLabel: 'Tricks, sets, and modifiers',
  },
  {
    term: 'Component',
    slug: 'component',
    definition: 'A building block of a trick: a contact, a dex, or a body movement, slotted in and ordered to make the whole. ADD counts scoring components.',
    moreHref: `${CONCEPTS}#section-add-accounting`, moreLabel: 'ADD Accounting',
  },
  {
    term: 'Contact',
    slug: 'contact',
    definition: 'The simplest component: a part of the body meeting the bag, defined by a surface plus a type of motion (a stall or a kick). A string\'s length is also counted in contacts.',
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Set',
    slug: 'set',
    definition: 'The launch action that begins a trick and positions the bag; also the named launch systems (Pixie, Fairy, Stepping, Atomic, Quantum), which are generally not classified as tricks on their own.',
    aliases: ['setting the bag', 'uptime set'],
    moreHref: '/freestyle/sets', moreLabel: 'Set Encyclopedia',
  },
  {
    term: 'Set foot',
    slug: 'set-foot',
    definition: 'The foot (or leg) that sets the bag into the air. The other one is the support foot.',
    aliases: ['set leg'],
  },
  {
    term: 'Support foot',
    slug: 'support-foot',
    definition: 'The foot (or leg) that stays on the ground while the other sets or catches the bag. Symposium is defined by the support leg staying off the ground.',
    aliases: ['support leg', 'plant foot'],
  },
  {
    term: 'Modifier',
    slug: 'modifier',
    definition: 'A transformation applied to an existing trick and not normally performed on its own. Spinning, Ducking, Symposium, Paradox, and Swirling are modifiers.',
    moreHref: '/freestyle/operators', moreLabel: 'Operators & Modifiers reference',
  },
  {
    term: 'Operator',
    slug: 'operator',
    definition: 'A named set, body movement, or structural relationship that combines with a base trick to build a new named trick. The operators of freestyle are the small vocabulary that generates the large one.',
    moreHref: '/freestyle/operators', moreLabel: 'Operators & Modifiers reference',
  },
  {
    term: 'Composition',
    slug: 'composition',
    definition: 'The premise that a freestyle trick is usually a structure, a base move with operators added, rather than one indivisible thing. Quantum osis and blurry mirage are compositions.',
    moreHref: `${CONCEPTS}#section-composition`, moreLabel: 'Runs & Sequences',
  },
  {
    term: 'Family',
    slug: 'family',
    definition: 'A lineage of tricks that share a conserved terminal, the structure they land into. Paradox whirl still is a whirl, so it stays in the whirl family as modifiers stack.',
    moreHref: `${CONCEPTS}#section-families`, moreLabel: 'Family Encyclopedia',
  },
  {
    term: 'Atom',
    slug: 'atom',
    definition: 'A foundational building block performed within tricks, such as an entry, orbit, or swing move, never a terminal lineage of its own. Around the World and Orbit are the clearest cases.',
    moreHref: `${CONCEPTS}#section-core-concepts`, moreLabel: 'Movement Basics',
  },
  {
    term: 'Body component',
    slug: 'body-component',
    definition: 'The catch-all for non-dex movements in a trick: spins, ducks, dives, paradox, flying. In notation the scored body component is [BOD].',
    aliases: ['BOD'],
    moreHref: `${CONCEPTS}#op-flag-bod`, moreLabel: '[BOD] in operational notation',
  },
  {
    term: 'ADD',
    slug: 'add',
    definition: 'Additional Degree of Difficulty, the traditional additive component accounting for a trick. It counts scoring components: dexterities, cross-body positions, stalls, and other scored elements. It is not a direct measure of execution difficulty.',
    aliases: ['ADDs', 'add count'],
    moreHref: `${CONCEPTS}#section-add-accounting`, moreLabel: 'ADD Accounting',
  },
  {
    term: 'ADD hunting',
    slug: 'add-hunting',
    definition: 'Chasing high-ADD tricks for the number alone. Newer players are usually encouraged not to.',
    aliases: ['ADD hunt'],
    moreHref: `${CONCEPTS}#run-quality`, moreLabel: 'ADD philosophy',
  },
  {
    term: 'Technical name',
    slug: 'technical-name',
    definition: 'A trick named from the simplest named version of each of its components, with sides where needed: Pixie Ducking Butterfly is the technical name of Phoenix. It is always a valid way to name a trick.',
    moreHref: `${CONCEPTS}#section-notation`, moreLabel: 'Trick naming and notation',
  },
  {
    term: 'Nickname',
    slug: 'nickname',
    definition: 'The short community name a trick carries alongside its technical name, usually given by its inventor: Ripwalk for Stepping op Butterfly. The dictionary shows a trick\'s other names as "Also called".',
    moreHref: '/freestyle/tricks', moreLabel: 'Trick Dictionary',
  },

  // ── Contact surfaces and contact types ─────────────────────────────────
  {
    term: 'Contact surface',
    slug: 'contact-surface',
    definition: 'Where the foot or body meets the bag. A stall holds the bag on a surface; a kick redirects it.',
    aliases: ['surface'],
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Stall',
    slug: 'stall',
    definition: 'Holding the bag still on a contact surface. Most stalls are 1 ADD, and a bare surface name (clipper, toe) defaults to its stall. Older sources and the notation flag call this a delay.',
    aliases: ['delay', 'DEL'],
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Kick',
    slug: 'kick',
    definition: 'A contact that redirects the bag instead of holding it. A kick carries no ADD of its own, so a trick that ends in a kick rather than a stall does not add a component for the kick. Players also say "want to kick?" to mean play.',
    moreHref: `${CONCEPTS}#implicit-contacts`, moreLabel: 'Implied contacts',
  },
  {
    term: 'Toe',
    slug: 'toe',
    definition: 'The top of the shoe, near the toe box. The default surface for sets and many stalls, abbreviated TOE in operational notation.',
    aliases: ['TOE', 'toe stall'],
    moreHref: '/freestyle/tricks/toe_stall', moreLabel: 'Toe stall in the dictionary',
  },
  {
    term: 'Clipper',
    slug: 'clipper',
    definition: 'A cross-body contact surface: an inside stall with the foot crossed behind the opposite leg. A bare "clipper" means a clipper stall, abbreviated CLIP.',
    aliases: ['CLIP', 'clipper stall'],
    moreHref: '/freestyle/tricks/clipper_stall', moreLabel: 'Clipper stall in the dictionary',
  },
  {
    term: 'Toe player',
    slug: 'toe-player',
    definition: 'A player whose tricks mostly land on toe, as opposed to a clipper player. Tricks that primarily use toe are called toe tricks the same way.',
  },
  {
    term: 'Clipper player',
    slug: 'clipper-player',
    definition: 'A player whose tricks mostly land on clipper, as opposed to a toe player. Tricks that primarily use clipper are called clipper tricks the same way.',
  },
  {
    term: 'Inside',
    slug: 'inside',
    definition: 'The inner side of the foot. Used in inside stalls and as a transitional contact in compounds that travel across the body.',
    aliases: ['inside stall'],
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Outside',
    slug: 'outside',
    definition: 'The outer side of the foot. Used in outside stalls; pairs with inside in same-foot transitions.',
    aliases: ['outside stall'],
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Sole',
    slug: 'sole',
    definition: 'The bottom of the shoe. Stylistic and specialized; the surface for sole stalls and a number of cross-body variants.',
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Heel',
    slug: 'heel',
    definition: 'The back of the shoe. Rare as a catch surface; appears in stylistic stalls and certain trick variants.',
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Knee',
    slug: 'knee',
    definition: 'The top of the knee. Used in knee stalls and knee-balanced positions during routines.',
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Cloud',
    slug: 'cloud',
    definition: 'The name for a shin stall: the bag held on the front of the lower leg with the knee bent inward. "Cloud" is the label trick pages use; "shin stall" is the descriptive form.',
    aliases: ['cloud stall', 'shin stall'],
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Flapper',
    slug: 'flapper',
    definition: 'A cross-body sole stall. The community name for the cross-body variant of a sole stall.',
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Dragon',
    slug: 'dragon',
    definition: 'A cross-body outside stall: the bag held on the outside of the foot with the legs crossed. Appears in compound names such as Butterfly Dragon.',
    moreHref: `${CONCEPTS}#section-surfaces`, moreLabel: 'Contact Surfaces & Stalls',
  },
  {
    term: 'Cross-body',
    slug: 'cross-body',
    definition: 'The working foot reaches across and works the bag behind the opposite leg instead of in front on its open side. It defines the clipper and appears in notation as the scored [XBD] component.',
    aliases: ['crossbody', 'xbd', 'XBD'],
    moreHref: `${CONCEPTS}#term-cross-body`, moreLabel: 'Cross-body in Freestyle Concepts',
  },
  {
    term: 'Crank',
    slug: 'crank',
    definition: 'Bending the ankle so the inside surface of the shoe flexes upward and flattens, which is how an inside stall or clipper gets its flattest surface.',
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
    term: 'Wrap',
    slug: 'wrap',
    definition: 'Moving an inside stall into a clipper, or a clipper into an inside stall, while the bag stays on the foot.',
  },
  {
    term: 'Rake',
    slug: 'rake',
    definition: 'Grabbing the bag in one position and dragging it to another, most commonly from cross-body to toe. Also a swing element in trick names such as Whirling Rake.',
  },
  {
    term: 'Walkover',
    slug: 'walkover',
    definition: 'Placing the stalling foot on the ground and stepping the other foot over it.',
  },
  {
    term: 'Rooted',
    slug: 'rooted',
    definition: 'Caught or set with the stalling foot on the ground. In operational notation the (rooted) pre-state marks a held position with no plant.',
    moreHref: `${CONCEPTS}#op-prestate-rooted`, moreLabel: '(rooted) in operational notation',
  },
  {
    term: 'Magic hop',
    slug: 'magic-hop',
    definition: 'A small hop of the support leg just before and just after the bag is stalled, used to keep rhythm and save energy through stalls and sets.',
  },

  // ── Dexterities ────────────────────────────────────────────────────────
  {
    term: 'Dex',
    slug: 'dex',
    definition: 'Short for dexterity: the foot circles the bag while it is in the air. Dexes are the central scoring component of freestyle, marked [DEX] in notation.',
    aliases: ['dexterity', 'DEX'],
    moreHref: `${CONCEPTS}#section-dexterities`, moreLabel: 'Dexterities',
  },
  {
    term: 'Dexless',
    slug: 'dexless',
    definition: 'A trick or component that contains no dex. Dexes are so central that the absence of one is itself a named category.',
    moreHref: `${CONCEPTS}#term-dexless`, moreLabel: 'Dexless in Freestyle Concepts',
  },
  {
    term: 'Direction',
    slug: 'direction',
    definition: 'A dex travels one of two ways around the leg, inward or outward. Reversing the direction gives a different trick with its own name, as mirage and illusion show.',
    moreHref: `${CONCEPTS}#section-dexterities`, moreLabel: 'Dexterities',
  },
  {
    term: 'In-dex',
    slug: 'in-dex',
    definition: 'A dex that travels inward: the bag arcs toward the body\'s center line. Paired with in-direction sets such as pixie and quantum.',
    moreHref: `${CONCEPTS}#term-in-dex`, moreLabel: 'In-dex in Freestyle Concepts',
  },
  {
    term: 'Out-dex',
    slug: 'out-dex',
    definition: 'A dex that travels outward: the bag arcs away from the body\'s center line. Paired with out-direction sets such as atomic and fairy.',
    moreHref: `${CONCEPTS}#term-out-dex`, moreLabel: 'Out-dex in Freestyle Concepts',
  },
  {
    term: 'Direction reversal',
    slug: 'rev-zero',
    definition: 'The operator, written rev(0), that reverses a dex\'s in and out direction while adding no difficulty. Illusion is the reverse of mirage, pickup of legover, orbit of around the world.',
    aliases: ['rev(0)'],
    moreHref: `${CONCEPTS}#term-rev-zero`, moreLabel: 'Direction reversal in Freestyle Concepts',
  },
  {
    term: 'Same-side',
    slug: 'same-side',
    definition: 'The dex acts on the same leg as the most recent side-bearing component, written SAME or ss. Read against that reference, not against a fixed plant leg; "near" in a trick name is a separate positional axis, not this relation.',
    aliases: ['ss', 'SAME'],
    moreHref: `${CONCEPTS}#term-same-side`, moreLabel: 'Relative-side relationships',
  },
  {
    term: 'Opposite',
    slug: 'opposite-side',
    definition: 'The dex acts on the opposite leg from the most recent side-bearing component, written OP or op. Two OP relations in a row return to the original leg, and OP by itself adds no difficulty; "far" in a trick name is a separate positional axis, not this relation.',
    aliases: ['op', 'OP', 'opposite side'],
    moreHref: `${CONCEPTS}#term-opposite-side`, moreLabel: 'Relative-side relationships',
  },
  {
    term: 'Far',
    slug: 'far',
    definition: 'A positional name in trick names (Far Whirl), with "near" as its counterpart. Near and far name a different configuration of the same trick; they are a separate axis from the SAME and OP side relations and do not redefine them.',
    moreHref: `${CONCEPTS}#term-op-not-xdex`, moreLabel: 'Relative-side relationships',
  },
  {
    term: 'Near',
    slug: 'near',
    definition: 'A positional name in trick names, the counterpart of "far". Near and far name a different configuration of the same trick; they are a separate axis from the SAME and OP side relations and do not redefine them.',
    moreHref: `${CONCEPTS}#term-op-not-xdex`, moreLabel: 'Relative-side relationships',
  },
  {
    term: 'X-Dex',
    slug: 'x-dex',
    definition: 'An extra dexterity worth +1, scored wherever the operational notation carries the [XDEX] marker on a dex. The notation is the source of truth for where it applies.',
    aliases: ['Xdex', 'XDEX'],
    moreHref: `${CONCEPTS}#term-x-dex`, moreLabel: 'X-Dex in Freestyle Concepts',
  },
  {
    term: 'Hippy',
    slug: 'hippy',
    definition: 'A dex whose motion comes from the hip: the thigh circles the bag. One of the two dex motion styles, the other being leggy.',
    moreHref: `${CONCEPTS}#term-hippy-leggy`, moreLabel: 'Motion style in Freestyle Concepts',
  },
  {
    term: 'Leggy',
    slug: 'leggy',
    definition: 'A dex whose motion comes from the knee: the calf circles the bag. One of the two dex motion styles, the other being hippy.',
    moreHref: `${CONCEPTS}#term-hippy-leggy`, moreLabel: 'Motion style in Freestyle Concepts',
  },
  {
    term: 'Full dex',
    slug: 'full-dex',
    definition: 'A dex that circles the bag entirely: the leg starts on one side, circles, and returns to the same side. Contrast a half dex.',
    moreHref: `${CONCEPTS}#term-full-half-dex`, moreLabel: 'Full vs half dex',
  },
  {
    term: 'Half dex',
    slug: 'half-dex',
    definition: 'A dex that circles the bag only partway, finishing on the opposite side. Contrast a full dex.',
    moreHref: `${CONCEPTS}#term-full-half-dex`, moreLabel: 'Full vs half dex',
  },
  {
    term: 'Dex window',
    slug: 'dex-window',
    definition: 'The space around the leg a dex passes through, the phantom shape the leg draws around the bag. Deep, thin, and shoey locate a dex within it.',
    aliases: ['window'],
    moreHref: `${CONCEPTS}#term-dex-window`, moreLabel: 'Execution window',
  },
  {
    term: 'Deep',
    slug: 'deep',
    definition: 'A dex that sits high in the window, well away from the shoe: controlled and clearly executed, with a generous arc around the leg.',
    moreHref: `${CONCEPTS}#term-deep`, moreLabel: 'Execution window',
  },
  {
    term: 'Thin',
    slug: 'thin',
    definition: 'A dex that sits at the edge of the window, close to the shoe. The bag barely clears the leg; legal and counted, but with a small safety margin. A duck is thin the farther from the neck it passes.',
    moreHref: `${CONCEPTS}#term-thin`, moreLabel: 'Execution window',
  },
  {
    term: 'Shoey',
    slug: 'shoey',
    definition: 'A dex that grazes the shoe surface during the circle, distinct from a clean thin dex by the audible or visible shoe contact.',
    moreHref: `${CONCEPTS}#term-shoey`, moreLabel: 'Execution window',
  },
  {
    term: 'Scoopy',
    slug: 'scoopy',
    definition: 'A dex or catch with extra under-bag character, where the leg cups beneath the bag in an arced motion rather than circling or catching cleanly.',
    aliases: ['scooped', 'scoop'],
    moreHref: `${CONCEPTS}#term-scoopy`, moreLabel: 'Execution window',
  },
  {
    term: 'The',
    slug: 'the',
    definition: 'Pronounced "thuh": a component that is attempted but completely missed, such as a dex that misses the window entirely. Typically counted as a fault.',
    moreHref: `${CONCEPTS}#term-the`, moreLabel: 'Execution window',
  },

  // ── Execution and result vocabulary ────────────────────────────────────
  {
    term: 'Clean',
    slug: 'clean',
    definition: 'Fully controlled, clearly executed. The reference quality every other execution label is measured against.',
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
    definition: 'A set where the bag is dragged through an uptime dex or a spin before the intended component happens. Used interchangeably with slurry.',
    moreHref: `${CONCEPTS}#term-pulled`, moreLabel: 'Execution quality',
  },
  {
    term: 'Slurry',
    slug: 'slurry',
    definition: 'Synonym for a pulled set: the bag is dragged through an uptime dex or spin before the intended component fires.',
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
    definition: 'A dex with more motion than the trick requires: extra leg travel that does not serve the structure, sometimes far enough to miss the bag. Common in early learners working a new dex pattern.',
    aliases: ['over-dex'],
    moreHref: `${CONCEPTS}#term-over-dexed`, moreLabel: 'Execution quality',
  },
  {
    term: 'Hit',
    slug: 'hit',
    definition: 'To complete a trick. Footbag players hit tricks rather than land them.',
  },
  {
    term: 'Handcatch',
    slug: 'handcatch',
    definition: 'Catching the bag in the hand after hitting a trick, written [trick]>hand in string notation. It usually implies good execution and control.',
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
    definition: 'The bag hitting the ground; a dropped trick is one that ended that way. Dropless describes any run of tricks performed without a drop, usually said of a routine.',
    aliases: ['dropped'],
  },
  {
    term: 'Bail',
    slug: 'bail',
    definition: 'To change a trick on the fly to something easier in order to avoid a drop, such as bailing from a spinning whirl to a spinning clipper when the set is low.',
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
    definition: 'The top of the bag\'s flight, where uptime turns into downtime; a component timed there is peaking.',
    aliases: ['peaking'],
    moreHref: `${CONCEPTS}#section-timing-sets`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Strong side',
    slug: 'strong-side',
    definition: 'A player\'s preferred side for a trick or component. The non-preferred side is the flip side.',
  },
  {
    term: 'Flip side',
    slug: 'flip-side',
    definition: 'A player\'s non-preferred side for a trick or component, the opposite of their strong side; often shortened to flip.',
    aliases: ['flipside', 'flip'],
  },
  {
    term: 'Bigfoot',
    slug: 'bigfoot',
    definition: 'A stance description: a left or right bigfoot player is one whose strong toe and strong clipper use the same foot.',
  },
  {
    term: 'Sideways',
    slug: 'sideways',
    definition: 'A stance description: a left or right sideways player is one whose strong toe and strong clipper use the same side of the body.',
  },
  {
    term: 'Air shred',
    slug: 'air-shred',
    definition: 'To practice a trick without the bag, to get a feel for the motions.',
  },

  // ── Ducks and spins ────────────────────────────────────────────────────
  {
    term: 'Ducking',
    slug: 'ducking',
    definition: 'A body operator: the player passes beneath the bag near the apex, so the bag passes around the head and neck while the underlying trick is unchanged. A +1 body modifier.',
    aliases: ['duck'],
    moreHref: '/freestyle/modifier/ducking', moreLabel: 'Ducking modifier page',
  },
  {
    term: 'Diving',
    slug: 'diving',
    definition: 'A body operator: the bag passes over the player, the complement of ducking, while the underlying trick is unchanged. A +1 body modifier.',
    aliases: ['dive'],
    moreHref: '/freestyle/modifier/diving', moreLabel: 'Diving modifier page',
  },
  {
    term: 'Weaving',
    slug: 'weaving',
    definition: 'A ducking set in which the bag is caught on the same foot that performed the set.',
    aliases: ['weave'],
    moreHref: `${CONCEPTS}#term-weaving`, moreLabel: 'Ducks in Freestyle Concepts',
  },
  {
    term: 'Zulu',
    slug: 'zulu',
    definition: 'A ducking set in which the bag travels across the body, under the chin, before the duck.',
    moreHref: `${CONCEPTS}#term-zulu`, moreLabel: 'Ducks in Freestyle Concepts',
  },
  {
    term: 'Crowny',
    slug: 'crowny',
    definition: 'A duck performed with just the very top of the head, the duck-world parallel to a thin or shoey dex.',
    aliases: ['crown'],
    moreHref: `${CONCEPTS}#term-crowny`, moreLabel: 'Ducks in Freestyle Concepts',
  },
  {
    term: 'Spinning',
    slug: 'spinning',
    definition: 'A body-rotation operator: a full-body 360 degree rotation carried through the dex moment, with the underlying dexterity unchanged. A +1 body modifier. Unless inspinning is named, a spin is a backspin, turning away from the bag.',
    aliases: ['spin'],
    moreHref: '/freestyle/modifier/spinning', moreLabel: 'Spinning modifier page',
  },
  {
    term: 'Inspinning',
    slug: 'inspinning',
    definition: 'A forward-rotation spin, turning toward the bag so the chest passes it first; distinct in direction from spinning\'s default back-rotation. Any spin contributes +1 ADD.',
    aliases: ['inspin'],
    moreHref: '/freestyle/modifier/inspinning', moreLabel: 'Inspinning modifier page',
  },
  {
    term: 'Gyro',
    slug: 'gyro',
    definition: 'A rotational operator: an approximate half rotation where spinning is a full turn, leaving the body in a different orientation at the dex moment. A +1 body modifier.',
    moreHref: '/freestyle/modifier/gyro', moreLabel: 'Gyro modifier page',
  },

  // ── Timing ─────────────────────────────────────────────────────────────
  {
    term: 'Uptime',
    slug: 'uptime',
    definition: 'The phase before the peak, while the bag is rising. Uptime components, usually dexing sets, are what "set" often means.',
    moreHref: `${CONCEPTS}#section-timing-sets`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Midtime',
    slug: 'midtime',
    definition: 'The phase at the peak, the brief no-plant moment. Also called hangtime.',
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
    definition: 'How quickly a player begins the next phase\'s component. A transition that has to fire aggressively is said to need a fast attack.',
    moreHref: `${CONCEPTS}#term-attack`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Set realization',
    slug: 'set-realization',
    definition: 'A dex performed as part of launching and positioning the bag. The inward and outward movements realized as sets are named Quantum and Atomic.',
    moreHref: `${CONCEPTS}#term-set-realization`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Standalone realization',
    slug: 'standalone-realization',
    definition: 'A dex movement realized independently after the bag is launched and before the terminal. The inward and outward standalone patterns are Mirage and Illusion.',
    moreHref: `${CONCEPTS}#term-standalone-realization`, moreLabel: 'Timing & Sets',
  },
  {
    term: 'Toe set',
    slug: 'toe-set',
    definition: 'A set launched from a toe stall.',
    moreHref: `${CONCEPTS}#set-surface-vs-named-set`, moreLabel: 'Set surface vs named set',
  },
  {
    term: 'Clip set',
    slug: 'clip-set',
    definition: 'A set launched from a clipper stall. Also called a clipper set.',
    aliases: ['clipper set'],
    moreHref: `${CONCEPTS}#set-surface-vs-named-set`, moreLabel: 'Set surface vs named set',
  },

  // ── Named sets ─────────────────────────────────────────────────────────
  {
    term: 'Pixie',
    slug: 'pixie',
    definition: 'A toe-anchored launch set with tight, compressed uptime dexes: the Around the World movement realized in a set role.',
    moreHref: '/freestyle/sets/pixie', moreLabel: 'Pixie in the Set Encyclopedia',
  },
  {
    term: 'Fairy',
    slug: 'fairy',
    definition: 'A toe-anchored launch set that dexes outward on the same side before the base: the Orbit movement realized in a set role, the outward-circling mirror of pixie.',
    moreHref: '/freestyle/sets/fairy', moreLabel: 'Fairy in the Set Encyclopedia',
  },
  {
    term: 'Stepping',
    slug: 'stepping',
    definition: 'A clipper-anchored launch set that inserts a foot relocation mid-trick; the plant foot moves between set and catch.',
    moreHref: '/freestyle/sets/stepping', moreLabel: 'Stepping in the Set Encyclopedia',
  },
  {
    term: 'Atomic',
    slug: 'atomic',
    definition: 'The outward dex realized as a set, contributing +1: a single outward, cross-body dexterity from a toe set, before the base.',
    moreHref: '/freestyle/sets/atomic', moreLabel: 'Atomic in the Set Encyclopedia',
  },
  {
    term: 'Quantum',
    slug: 'quantum',
    definition: 'The inward dex realized as a set; the direction-reversed sibling of Atomic on the inward side.',
    moreHref: '/freestyle/sets/quantum', moreLabel: 'Quantum in the Set Encyclopedia',
  },
  {
    term: 'Blurry',
    slug: 'blurry',
    definition: 'A set modifier that adds one dex as part of the set, combining stepping momentum with paradox-style body positioning. Some named blurry compounds, such as Blur, expand to a deeper decomposition.',
    moreHref: '/freestyle/sets/blurry', moreLabel: 'Blurry in the Set Encyclopedia',
  },
  {
    term: 'Nuclear',
    slug: 'nuclear',
    definition: 'A two-dex set worth 2 ADD: a paradox dex followed by a downtime illusioning dex.',
    moreHref: '/freestyle/sets/nuclear', moreLabel: 'Nuclear in the Set Encyclopedia',
  },
  {
    term: 'Furious',
    slug: 'furious',
    definition: 'A two-dex set beginning from clipper with an opposite-side inward dex followed by a same-side inward dex. Barraging is a legacy name pattern for the same set.',
    moreHref: '/freestyle/sets/furious', moreLabel: 'Furious in the Set Encyclopedia',
  },
  {
    term: 'Barraging',
    slug: 'barraging',
    definition: 'A legacy name pattern for the Furious two-dex set, not a separate set or operator. Barraging-named tricks resolve to Furious.',
    moreHref: `${CONCEPTS}#term-barraging-not-a-set`, moreLabel: 'Related terms that are not launch sets',
  },
  {
    term: 'Barrage',
    slug: 'barrage',
    definition: 'A separate standalone base trick concept, not the same as Barraging.',
    moreHref: `${CONCEPTS}#term-barrage-not-a-set`, moreLabel: 'Related terms that are not launch sets',
  },
  {
    term: 'Illusioning',
    slug: 'illusioning',
    definition: 'A descriptive name for the outward standalone dex movement, as in Illusioning Kick. Atomic names the same movement in a set role; Illusioning is not a reusable scored operator.',
    moreHref: `${CONCEPTS}#term-illusioning`, moreLabel: 'Related terms that are not launch sets',
  },
  {
    term: 'Miraging',
    slug: 'miraging',
    definition: 'A descriptive name for the inward standalone dex movement, as in Miraging Kick. Quantum names the same movement in a set role; Miraging is not a launch set or a reusable scored operator.',
    moreHref: `${CONCEPTS}#term-miraging-not-a-set`, moreLabel: 'Related terms that are not launch sets',
  },

  // ── Body operators, modifiers, and name shorthand ──────────────────────
  {
    term: 'Paradox',
    slug: 'paradox',
    definition: 'A hip and plant relationship applied to a single dexterity: the body switches sides around the dex without adding another dex or changing the set foot. A +1 body modifier, marked [PDX].',
    aliases: ['pdx', 'PDX'],
    moreHref: '/freestyle/modifier/paradox', moreLabel: 'Paradox modifier page',
  },
  {
    term: 'Symposium',
    slug: 'symposium',
    definition: 'A no-plant leg discipline: the support leg stays off the ground and the setting foot does not replant while the dex is performed. A +1 body modifier, abbreviated SYMP or symp.',
    aliases: ['symp', 'SYMP'],
    moreHref: '/freestyle/modifier/symposium', moreLabel: 'Symposium modifier page',
  },
  {
    term: 'Symple',
    slug: 'symple',
    definition: 'A historical token seen beside symposium in source material, described there as a component that starts symposium and replants the free foot midway. Whether it names a distinct movement is unresolved; Symposium is the established operator.',
    moreHref: `${CONCEPTS}#term-symple`, moreLabel: 'Symple in Freestyle Concepts',
  },
  {
    term: 'Muted',
    slug: 'muted',
    definition: 'An active leg held in the air for an entire component without planting. Mostly said of dexes, but it applies to other components too.',
    moreHref: `${CONCEPTS}#term-muted`, moreLabel: 'Muted in Freestyle Concepts',
  },
  {
    term: 'Frontside',
    slug: 'frontside',
    definition: 'Player shorthand for a trick with its uptime component made symposium (Frontside Atom Smasher). Its counterparts are Backside (the downtime component) and Full Symp (both).',
    aliases: ['FS'],
    moreHref: '/freestyle/modifier/symposium', moreLabel: 'Symposium modifier page',
  },
  {
    term: 'Backside',
    slug: 'backside',
    definition: 'Player shorthand for a trick with its downtime component made symposium (Backside Atom Smasher); Frontside is the uptime counterpart and Full Symp makes both symposium. As an abbreviation, bs more often means both sides.',
    moreHref: '/freestyle/modifier/symposium', moreLabel: 'Symposium modifier page',
  },
  {
    term: 'Full Symp',
    slug: 'full-symp',
    definition: 'Player shorthand for a trick with both its uptime and downtime components made symposium (Full Symp Atom Smasher); Frontside and Backside name the one-phase versions.',
    moreHref: '/freestyle/modifier/symposium', moreLabel: 'Symposium modifier page',
  },
  {
    term: 'PS',
    slug: 'ps',
    definition: 'Paradox Symposium, as in PS Whirl for Paradox Symposium Whirl.',
    aliases: ['paradox symposium'],
    moreHref: `${CONCEPTS}#abbreviations`, moreLabel: 'Abbreviations',
  },
  {
    term: 'Alpine',
    slug: 'alpine',
    definition: 'Shorthand that splits a trick between its uptime and downtime and inserts a duck or dive between them: Alpine Ripwalk is Stepping Ducking Butterfly.',
    moreHref: `${CONCEPTS}#term-alpine`, moreLabel: 'Alpine in Freestyle Concepts',
  },
  {
    term: 'Tapping',
    slug: 'tapping',
    definition: 'A +1 modifier that prepends a quick toe-set dex ahead of the base trick, preserving the recognizable base identity.',
    moreHref: '/freestyle/modifier/tapping', moreLabel: 'Tapping modifier page',
  },
  {
    term: 'Flying',
    slug: 'flying',
    definition: 'A contact or trick performed with the whole body in the air, a no-stall body modifier: a flying clipper is a clipper kick with no stall, and "flying clipper stall" states the stall explicitly to contrast the implied kick.',
    aliases: ['flyer'],
    moreHref: `${CONCEPTS}#implicit-contacts`, moreLabel: 'Implied contacts',
  },

  // ── Foundational tricks ────────────────────────────────────────────────
  {
    term: 'Around the World',
    slug: 'around_the_world',
    definition: 'Toe set, same-side circling dex, same-side toe catch. The foot carries the bag in a full circle around the outside of the leg without crossing the body. Abbreviated ATW.',
    moreHref: '/freestyle/tricks/around_the_world', moreLabel: 'Around the World in the dictionary',
  },
  {
    term: 'Orbit',
    slug: 'orbit',
    definition: 'Around the World traced the other way: toe set, same-side circling dex in the reverse direction, same-side toe catch.',
    moreHref: '/freestyle/tricks/orbit', moreLabel: 'Orbit in the dictionary',
  },
  {
    term: 'Legover',
    slug: 'legover',
    definition: 'Set, opposite-leg out-dex, catch on the dexing foot. The opposite leg swings out and over the bag, and the bag is caught on that same leg.',
    moreHref: '/freestyle/tricks/legover', moreLabel: 'Legover in the dictionary',
  },
  {
    term: 'Pickup',
    slug: 'pickup',
    definition: 'Set, opposite-leg in-dex, catch on the dexing foot. The opposite leg scoops inward under the bag and picks it back up on that same leg.',
    moreHref: '/freestyle/tricks/pickup', moreLabel: 'Pickup in the dictionary',
  },
  {
    term: 'Mirage',
    slug: 'mirage',
    definition: 'Set, opposite-leg in-dex, return to the setting toe. The opposite leg circles the bag from inside to outside and the bag drops back to the toe that set it.',
    moreHref: '/freestyle/tricks/mirage', moreLabel: 'Mirage in the dictionary',
  },
  {
    term: 'Illusion',
    slug: 'illusion',
    definition: 'Set, opposite-leg out-dex, return to the setting toe. The direction mirror of the mirage: a wide, leggy crescent that returns the bag to the toe that set it.',
    moreHref: '/freestyle/tricks/illusion', moreLabel: 'Illusion in the dictionary',
  },
  {
    term: 'Butterfly',
    slug: 'butterfly',
    definition: 'Set, out-dex, cross-body clipper catch. A wing-like outward sweep of the foot across the body to a clipper landing, in same-side and opposite-side variants.',
    moreHref: '/freestyle/tricks/butterfly', moreLabel: 'Butterfly in the dictionary',
  },
  {
    term: 'Osis',
    slug: 'osis',
    definition: 'Set, back or front spin, cross-body clipper catch. The body spins downward and the bag is caught cross-body on a clipper, the spin and the catch as one motion.',
    moreHref: '/freestyle/tricks/osis', moreLabel: 'Osis in the dictionary',
  },
  {
    term: 'Whirl',
    slug: 'whirl',
    definition: 'Set, opposite-side in-dex, cross-body clipper catch. An inward dex that finishes not on an open toe but across the body on a clipper.',
    moreHref: '/freestyle/tricks/whirl', moreLabel: 'Whirl in the dictionary',
  },
  {
    term: 'Swirl',
    slug: 'swirl',
    definition: 'Set, same-side out-dex, same-side cross-body clipper catch. The same-side leg circles outward once and the bag lands on a same-side clipper.',
    moreHref: '/freestyle/tricks/swirl', moreLabel: 'Swirl in the dictionary',
  },
  {
    term: 'LIMP',
    slug: 'limp',
    definition: 'The four basic toe tricks as a group: Legover, Illusion, Mirage, and Pickup. CLIMP is the extended group that adds Clipper.',
    moreHref: `${CONCEPTS}#section-core-concepts`, moreLabel: 'Movement Basics',
  },

  // ── Strings, runs, and combinations ────────────────────────────────────
  {
    term: 'Run',
    slug: 'run',
    definition: 'A continuous, unplanned flow of tricks linked one after another, the usual way the sport is played and the unit the run-quality tiers describe; players also call it a string. Its length is counted in contacts: a 12-contact run.',
    aliases: ['string'],
    moreHref: `${COMBO}#run-quality`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'String notation',
    slug: 'string-notation',
    definition: 'Writing tricks out with an arrow between linked tricks: Mirage>Clipper>ss Legover. A multiplier x[N] repeats a trick or combo, and >hand marks a handcatch.',
    moreHref: COMBO, moreLabel: 'Combo Analysis',
  },
  {
    term: 'Combo',
    slug: 'combo',
    definition: 'Any number of tricks linked as a group, usually shorter and more deliberately built than a string, often around a theme.',
    moreHref: COMBO, moreLabel: 'Combo Analysis',
  },
  {
    term: 'Link',
    slug: 'link',
    definition: 'Two tricks performed one straight after the other; a link is specifically a two-trick combo. Tricks done in sequence are said to be linked.',
    aliases: ['linked'],
    moreHref: COMBO, moreLabel: 'Combo Analysis',
  },
  {
    term: 'Unique',
    slug: 'unique',
    definition: 'A trick in a string or combo that has not already been done on that side of the body; a repeat on the same side is non-unique. Uniqueness is one of the things Shred 30 scores.',
    moreHref: COMBO, moreLabel: 'Combo Analysis',
  },
  {
    term: 'Drill',
    slug: 'drill',
    definition: 'A combo done on one side of the body and then repeated exactly on the other, written with rpt at the repeat point: Mirage>Legover rpt.',
  },
  {
    term: 'Marathon drill',
    slug: 'marathon-drill',
    definition: 'A drill repeated for a large number of contacts or a set time, such as 100 contacts of Mirage>ss Mirage rpt; drops do not reset the count. Used to train consistency and endurance.',
    aliases: ['marathon', 'marathon drilling'],
  },
  {
    term: 'Rewind',
    slug: 'rewind',
    definition: 'A combo that reverses its order at the halfway point instead of repeating it: Legover>ss Mirage>ss Mirage>Legover.',
  },
  {
    term: 'Mirror',
    slug: 'mirror',
    definition: 'A link whose two tricks are mirror images of each other in forward and reverse motion, so the combo would play back the same reversed.',
  },
  {
    term: 'Back-to-back',
    slug: 'back-to-back',
    definition: 'The same trick linked two or more times in a row: PLO b2b is PLO>PLO.',
    aliases: ['b2b'],
  },
  {
    term: 'Both sides',
    slug: 'both-sides',
    definition: 'Doing a trick on both sides of the body, abbreviated bs. A player or string that mostly uses both sides is both-sided; one that mostly uses one side is one-sided.',
    aliases: ['bs', 'both-sided'],
  },
  {
    term: 'BSOS',
    slug: 'bsos',
    definition: '"Both sides one string": a trick done on both sides of the body within a single string, jokingly said "bee sauce". Also written BSOR, "both sides one run"; string and run name the same continuous sequence here, so the two describe the same achievement.',
    aliases: ['BSOR', 'bee sauce'],
  },
  {
    term: 'Midstring',
    slug: 'midstring',
    definition: 'Doing a trick in the middle of a string rather than in isolation, which is usually much harder.',
  },
  {
    term: 'Shuffle',
    slug: 'shuffle',
    definition: 'A combo built by linking tricks that use uptime dexing sets; shuffling is playing that way.',
    aliases: ['shuffling'],
  },
  {
    term: 'Everything',
    slug: 'everything',
    definition: 'A drill that takes one uptime set through each LIMP trick on both sides: Pixie Everything is Pixie Legover, Illusion, Mirage, and Pickup, same-side and opposite, each on both sides, in any order.',
    aliases: ['Everything drill'],
  },

  // ── Community and play vocabulary ──────────────────────────────────────
  {
    term: 'Shred',
    slug: 'shred',
    definition: 'To play freestyle, especially to play well; the general freestyle word for kicking. Players ask "want to shred?" or "want to kick?" to invite someone into a circle.',
    aliases: ['shredding'],
  },
  {
    term: 'Circle',
    slug: 'circle',
    definition: 'The usual way to play with others: three to five players stand in a circle and take individual turns with the bag, passing it on when their turn ends. Also the competition format modeled on it.',
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Props',
    slug: 'props',
    definition: 'Acknowledgement from the other players in a circle after a good turn, such as a high five.',
  },
  {
    term: 'Passback',
    slug: 'passback',
    definition: 'Giving the previous player another turn instead of taking your own; to pass is to send the bag on for the next turn. Also the name of the tutorial video series that taught and named tricks for a new generation.',
    moreHref: `${HISTORY}#institutions`, moreLabel: 'Institutions in Freestyle History',
  },
  {
    term: 'Self-serve',
    slug: 'self-serve',
    definition: 'Setting the bag to yourself for another turn in a circle rather than passing it on; depending on the circle it can be seen as poor form.',
  },
  {
    term: 'Jam',
    slug: 'jam',
    definition: 'A casual footbag event focused on getting regional players together to play; it may include competition but is not built around it.',
    moreHref: `${HISTORY}#competition`, moreLabel: 'Competition in Freestyle History',
  },
  {
    term: 'Tournament',
    slug: 'tournament',
    definition: 'A footbag event built around competition in the judged formats.',
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Worlds',
    slug: 'worlds',
    definition: 'The World Footbag Championships, the biggest tournament of the year.',
    aliases: ['World Championships'],
    moreHref: '/events', moreLabel: 'Events',
  },

  // ── Competition formats ────────────────────────────────────────────────
  {
    term: 'Routine',
    slug: 'routine',
    definition: 'A timed performance choreographed to music, scored on difficulty attempted, cleanliness of execution, and artistry.',
    aliases: ['routines'],
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Battle',
    slug: 'battle',
    definition: 'A one-on-one technical showdown: two players alternate attempts and a judge or the crowd picks each round, with bracket elimination deciding the winner.',
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Shred-Off',
    slug: 'shred-off',
    definition: 'The online, asynchronous variant of Battle: players submit their attempts remotely instead of alternating in person.',
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Sick 3',
    slug: 'sick-3',
    definition: 'A three-trick format: the player attempts three tricks and is scored on the difficulty landed, with no execution credit. Its single-trick counterpart is Sick Trick.',
    aliases: ['Sick3'],
    moreHref: `${COMBO}#format-sick3`, moreLabel: 'Sick 3 in Combo Analysis',
  },
  {
    term: 'Sick Trick',
    slug: 'sick-trick',
    definition: 'A single best-trick contest: each player attempts the hardest individual trick they can land cleanly, and the highest difficulty that sticks wins. Also called Sick 1, the one-trick counterpart of Sick 3.',
    aliases: ['Sick 1'],
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Request',
    slug: 'request',
    definition: 'An elimination format in which organizers call out tricks or links prepared in advance and players must land them on demand.',
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Shred 30',
    slug: 'shred-30',
    definition: 'A timed format: thirty seconds to run the hardest combo a player can, scored on ADD count and uniqueness.',
    aliases: ['Shred:30', '30 Second Shred'],
    moreHref: `${COMBO}#format-shred-30`, moreLabel: 'Shred 30 in Combo Analysis',
  },
  {
    term: 'Rippin\' Run',
    slug: 'rippin-run',
    definition: 'A head-to-head longest-string contest: whoever runs the longest string before dropping wins. Iron Man and Last Man Standing are the related longest-string formats.',
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Iron Man',
    slug: 'iron-man',
    definition: 'A head-to-head longest-string contest, like Rippin\' Run: whoever runs the longest string before dropping wins.',
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },
  {
    term: 'Last Man Standing',
    slug: 'last-man-standing',
    definition: 'A longest-string contest in which every player goes at the same time; the last one still running without a drop wins.',
    moreHref: COMPETITION, moreLabel: 'Competition formats',
  },

  // ── ADD tiers and run quality ──────────────────────────────────────────
  {
    term: 'Tiltless',
    slug: 'tiltless',
    definition: 'A run in which every trick reaches at least 2 ADD; the first rung of the run-quality ladder.',
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
    definition: 'A run in which every trick reaches at least 7 ADD. Aspirational; rarely sustained.',
    moreHref: `${COMBO}#run-quality-godly`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'Genuine',
    slug: 'genuine',
    definition: 'Guiltless play that uses no BOP tricks, which is generally much harder. Also called Genuine Guiltless.',
    aliases: ['Genuine Guiltless'],
    moreHref: `${COMBO}#run-quality-genuine`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'BOP',
    slug: 'bop',
    definition: 'Butterfly, Osis, Paradox Mirage: the most basic guiltless tricks, a named exception set used when deriving the Genuine run-quality tier.',
    aliases: ['BOPs'],
    moreHref: `${COMBO}#run-quality-bop`, moreLabel: 'Run quality in Combo Analysis',
  },
  {
    term: 'PWF',
    slug: 'pwf',
    definition: 'Paradox Whirl-Free: Fearless or Beastly play done without any Paradox Whirl component, which players count as harder. A community usage; not part of the site\'s scoring doctrine.',
    aliases: ['Pdx Whirl-Free'],
    moreHref: `${COMBO}#run-quality-fearless`, moreLabel: 'Run quality in Combo Analysis',
  },

  // ── Notation and abbreviations ─────────────────────────────────────────
  {
    term: 'Operational notation',
    slug: 'operational-notation',
    definition: 'The token-by-token spelling of a trick as surfaces, side relations, directions, and scored components, such as SET > OP CLIP [XBD] [DEL]. It is the source of truth for what a trick scores.',
    moreHref: `${CONCEPTS}#operational-notation`, moreLabel: 'Operational notation',
  },
  {
    term: 'Jobs notation',
    slug: 'jobs-notation',
    definition: 'The 1995 notation that describes a trick by the movement it is rather than the name it carries: surfaces, dexterities, and body positions written as a formula, with > between components.',
    aliases: ["Job's notation"],
    moreHref: `${CONCEPTS}#jobs-notation`, moreLabel: 'Jobs notation',
  },
  {
    term: 'ATW',
    slug: 'atw',
    definition: 'Abbreviation of Around the World. DATW is a Double Around the World.',
    moreHref: `${CONCEPTS}#abbreviations`, moreLabel: 'Abbreviations',
  },
  {
    term: 'DLO',
    slug: 'dlo',
    definition: 'Abbreviation of Double Leg Over.',
    moreHref: `${CONCEPTS}#abbreviations`, moreLabel: 'Abbreviations',
  },
  {
    term: 'UNS',
    slug: 'uns',
    definition: 'The unusual-surface component in operational notation: a stall landing on a non-standard surface such as sole, knee, head, or cloud. It scores like any stall; the flag records that the surface is unusual.',
    aliases: ['unusual surface'],
    moreHref: `${CONCEPTS}#op-flag-uns`, moreLabel: '[UNS] in operational notation',
  },
];

/**
 * A cross-reference: a one-line "see X" pointer for an alias whose first
 * letter differs from its canonical entry, so a reader scanning the list
 * under that letter still finds the word. It carries no definition of its own;
 * the canonical entry stays the single definition.
 */
export interface GlossaryCrossReference {
  /** The alias as a reader would look it up. */
  term: string;
  /** Anchor suffix: renders with id="see-{slug}". */
  slug: string;
  /** Slug of the canonical GLOSSARY_TERMS entry it points at. */
  seeSlug: string;
}

export const GLOSSARY_CROSS_REFERENCES: readonly GlossaryCrossReference[] = [
  { term: 'Delay',     slug: 'delay',     seeSlug: 'stall' },
  { term: 'Dexterity', slug: 'dexterity', seeSlug: 'dex' },
  { term: 'Duck',      slug: 'duck',      seeSlug: 'ducking' },
  { term: 'Pdx',       slug: 'pdx',       seeSlug: 'paradox' },
  { term: 'String',    slug: 'string',    seeSlug: 'run' },
  { term: 'Symp',      slug: 'symp',      seeSlug: 'symposium' },
  { term: 'XBD',       slug: 'xbd',       seeSlug: 'cross-body' },
];

// Module-load invariants: one canonical entry per term and per anchor slug, an
// alias never doubles as another entry's term, a "more" link always travels
// with its label, and every cross-reference points at a real entry, restates
// one of that entry's aliases, and never collides with an entry term. A
// duplicate here would render two entries for one term, which is exactly what
// a glossary must not do.
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
      // A case variant of the entry's own term (TOE for Toe) is fine; the
      // same string as ANOTHER entry's term is a duplicate in disguise.
      if (key !== t.term.trim().toLowerCase() && terms.has(key)) {
        throw new Error(`glossary alias "${a}" on ${t.term} duplicates an entry term`);
      }
      const owner = aliasOwner.get(key);
      if (owner && owner !== t.term) throw new Error(`glossary alias "${a}" claimed by both ${owner} and ${t.term}`);
      aliasOwner.set(key, t.term);
    }
  }
  const bySlug = new Map(GLOSSARY_TERMS.map(t => [t.slug, t]));
  const seen = new Set<string>();
  for (const x of GLOSSARY_CROSS_REFERENCES) {
    const key = x.term.trim().toLowerCase();
    if (terms.has(key)) throw new Error(`glossary cross-reference "${x.term}" duplicates an entry term`);
    if (seen.has(key) || slugs.has(x.slug)) throw new Error(`duplicate glossary cross-reference: ${x.term}`);
    seen.add(key);
    const target = bySlug.get(x.seeSlug);
    if (!target) throw new Error(`glossary cross-reference "${x.term}" points at unknown slug ${x.seeSlug}`);
    if (aliasOwner.get(key) !== target.term) {
      throw new Error(`glossary cross-reference "${x.term}" must be an alias of ${target.term}`);
    }
  }
})();
