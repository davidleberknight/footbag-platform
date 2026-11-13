/**
 * symbolicSetEducation.ts
 *
 * Hand-authored educational content for canonical-set teaching surfaces. A set
 * is a launch system, so its page teaches what structural launch the set
 * contributes to an otherwise-unchanged base dexterity, concept before
 * mechanics.
 *
 * This is the PEDAGOGY layer, deliberately separate from the set data in the
 * freestyle_sets table: a set row carries terse facts (name, group, formula,
 * plain explanation, related sets), and must not absorb teaching prose.
 * The freestyle service resolves the authored content below into a view-model,
 * resolving every progression / representative-trick slug against the
 * dictionary so the links are clickable.
 *
 * Every set page has the same sections (the page title names the set): What it
 * is / Formula / Worked example / Example tricks / Related sets. A guide supplies
 * the short definition, the notation sentence that states the +N under
 * the formula, the worked example (its progression on one anchor trick) and the
 * example tricks; a set without a guide shows its plain explanation and its
 * linked tricks instead, and has no worked example. General notation is
 * explained once, on the Set Encyclopedia.
 *
 * Where a set is the uptime form of a trick the reader already knows, the
 * definition names that trick first, so the reader can picture the set before
 * reading the notation: Pixie is an uptime Around the World, Fairy an uptime
 * Orbit, Quantum an uptime Mirage, Atomic an uptime Illusion.
 *
 * Adding a set: register an object in SET_PAGE_CONTENT.
 */
import type { FreestyleTrickRow } from '../db/db';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface SetEducationProgressionStep {
  slug:        string;
  addedLabel:  string;   // e.g., "anchor (no stepping yet)", "+ stepping"
  rationale:   string;
}

export interface SetEducationExample {
  slug:      string;   // resolved against the dictionary
  baseLabel: string;   // e.g., "Basic dex", "Whirl family"
  prose:     string;
}

// Per-set authored content (input shape; static).
export interface SetEducationInput {
  slug:         string;   // canonical-set slug; matches the /freestyle/sets/:slug param
  displayName:  string;
  definition:     string; // What it is: a few sentences, naming the familiar counterpart trick where there is one
  jobNotation:    string; // The notation sentence shown under the formula, stating the +N; '' to omit
  progression: {
    anchorBaseLabel: string;
    steps:           SetEducationProgressionStep[];
  };
  representativeTricks: {
    examples:    SetEducationExample[];
  };
}

// Per-set output shape (dictionary-row-resolved view-model).
export interface SetEducationProgressionStepResolved extends SetEducationProgressionStep {
  canonicalName: string;
  adds:          string | null;
  detailHref:    string;
  stepNumber:    number;
  isPilot:       boolean;
}

export interface SetEducationExampleResolved extends SetEducationExample {
  canonicalName: string;
  adds:          string | null;
  detailHref:    string;
  isPilot:       boolean;
}

export interface SetEducationContent {
  slug:           string;
  displayName:    string;
  definition:     string;
  jobNotation:    string;
  progression: {
    anchorBaseLabel: string;
    steps:           SetEducationProgressionStepResolved[];
  };
  representativeTricks: {
    examples:    SetEducationExampleResolved[];
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Authored content — STEPPING (the set-page reference implementation)
// ─────────────────────────────────────────────────────────────────────────

const STEPPING_SET_CONTENT: SetEducationInput = {
  slug:         'stepping',
  displayName:  'Stepping',
  definition:
    'Stepping is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. The support foot relocates as it opens a clipper-anchored set, delivering the bag into the dexterity from an opposite-side inward set rather than from a stationary toe or clipper set.',
  jobNotation:
    'Stepping lives in the set portion of the notation, at the front of the chain. So stepping mirage reads CLIP > OP IN [DEX] >> OP IN [DEX] > OP TOE [DEL] and decomposes as stepping(+1) + mirage(2) = 3, where the leading set carries the +1 and the trailing dex and terminal carry the base.',
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:       'butterfly',
        addedLabel: 'anchor (no stepping yet)',
        rationale:
          'The butterfly dexterity on its own, opened from a stationary set. Stepping will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'ripwalk',
        addedLabel: '+ stepping',
        rationale:
          'The stepping launch applied to butterfly: the support foot relocates to open the set while the butterfly itself is unchanged. The clearest single case for the set, and it carries its own name, ripwalk.',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'stepping_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The same stepping launch opening a whirl: the launch changes while the whirl dex is unchanged (4 ADD).',
      },
      {
        slug:      'stepping_eggbeater',
        baseLabel: 'Cross-body',
        prose:
          'Stepping opening the eggbeater (atomic legover), a cross-body base; the clipper-anchored launch delivers the bag into the cross-body dex (4 ADD).',
      },
      {
        slug:      'stepping_symposium_mirage',
        baseLabel: 'Multiple operators',
        prose:
          'The stepping launch with symposium added: the support leg is kept off the ground through the dex, a body operator on the stepping launch of a mirage (4 ADD).',
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the toe-anchored core launches (PIXIE, FAIRY)
// ─────────────────────────────────────────────────────────────────────────

const PIXIE_SET_CONTENT: SetEducationInput = {
  slug:         'pixie',
  displayName:  'Pixie',
  definition:
    'Pixie is a launch set: essentially an uptime Around the World. From a toe set, the bag makes a same-side inward dex before the next part of the trick begins. Because that dex happens during the set, Pixie changes how the bag is delivered into the following movement rather than replacing that movement.',
  jobNotation:
    'Pixie lives in the set portion of the notation, at the front of the chain. So pixie mirage (the named trick smear) decomposes as pixie(+1) + mirage(2) = 3, the leading set carrying the +1 and the trailing dex and terminal carrying the base.',
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:       'butterfly',
        addedLabel: 'anchor (no pixie yet)',
        rationale:
          'The butterfly dexterity on its own, opened from a stationary set. Pixie will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'dimwalk',
        addedLabel: '+ pixie',
        rationale:
          'The pixie launch applied to butterfly: the toe set opens with a same-side inward dex while the butterfly itself is unchanged. It carries its own name, dimwalk.',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'smear',
        baseLabel: 'Basic dex',
        prose:
          'The pixie launch opening a single mirage dex, the clearest case of the set on its own, and a named trick (3 ADD).',
      },
      {
        slug:      'smudge',
        baseLabel: 'Illusion family',
        prose:
          'The same pixie launch opening an illusion; the launch changes while the illusion dex is unchanged (3 ADD).',
      },
      {
        slug:      'magellan',
        baseLabel: 'Legover family',
        prose:
          'Pixie opening a legover, carrying its own name, magellan (3 ADD).',
      },
      {
        slug:      'pixie_clipper',
        baseLabel: 'Cross-body',
        prose:
          'Pixie opening a clipper stall, the toe-anchored launch delivering the bag into a cross-body terminal (3 ADD).',
      },
      {
        slug:      'dimwalk',
        baseLabel: 'Recognizable named trick',
        prose:
          'Dimwalk is the canonical pixie butterfly, a named trick in its own right: the pixie launch opening a butterfly (4 ADD).',
      },
    ],
  },
};

const FAIRY_SET_CONTENT: SetEducationInput = {
  slug:         'fairy',
  displayName:  'Fairy',
  definition:
    'Fairy is a launch set: essentially an uptime Orbit. From a toe set, the bag makes a same-side outward dex before the next part of the trick begins. Because that dex happens during the set, Fairy changes how the bag is delivered into the following movement rather than replacing that movement.',
  jobNotation:
    'Fairy lives in the set portion of the notation, at the front of the chain. So fairy mirage decomposes as fairy(+1) + mirage(2) = 3, the leading set carrying the +1 and the trailing dex and terminal carrying the base.',
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:       'mirage',
        addedLabel: 'anchor (no fairy yet)',
        rationale:
          'The mirage dexterity on its own, opened from a stationary set. Fairy will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'fairy_mirage',
        addedLabel: '+ fairy',
        rationale:
          'The fairy launch applied to mirage: the toe set opens with a same-side outward dex while the mirage itself is unchanged. The clearest single case for the set (3 ADD).',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'fairy_mirage',
        baseLabel: 'Basic dex',
        prose:
          'The fairy launch opening a single mirage dex, the clearest case of the set on its own (3 ADD).',
      },
      {
        slug:      'fairy_illusion',
        baseLabel: 'Illusion family',
        prose:
          'The same fairy launch opening an illusion; the launch changes while the illusion dex is unchanged (3 ADD).',
      },
      {
        slug:      'fairy_legover',
        baseLabel: 'Legover family',
        prose:
          'Fairy opening a legover (3 ADD).',
      },
      {
        slug:      'fairy_butterfly',
        baseLabel: 'Wing family',
        prose:
          'Fairy opening a butterfly; the toe-anchored outward launch delivering the bag into the wing dex (4 ADD).',
      },
      {
        slug:      'fairy_drifter',
        baseLabel: 'Cross-body',
        prose:
          'Fairy opening a drifter, a cross-body base (4 ADD).',
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the whirl-family launch (SWIRLING)
// ─────────────────────────────────────────────────────────────────────────

const SWIRLING_SET_CONTENT: SetEducationInput = {
  slug:         'swirling',
  displayName:  'Swirling',
  definition:
    'Swirling is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a clipper-anchored cross-body rotational set carried by an explicit SWIRL dex token, the opening of the whirl and swirl family.',
  jobNotation:
    'Swirling lives in the set portion of the notation, at the front of the chain, reading CLIP > SAME BACK/FRONT SWIRL [DEX] >, the cross-body rotational opening with an explicit SWIRL token; the rest of the chain is the unchanged base. So swirling mirage decomposes as swirling(+1) + mirage(2) = 3, the leading SWIRL set carrying the +1 and the trailing dex and terminal carrying the base.',
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:       'mirage',
        addedLabel: 'anchor (no swirling yet)',
        rationale:
          'The mirage dexterity on its own, opened from a stationary set. Swirling will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'swirling_mirage',
        addedLabel: '+ swirling',
        rationale:
          'The swirling launch applied to mirage: the cross-body SWIRL set opens the chain while the mirage itself is unchanged (3 ADD).',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'swirling_mirage',
        baseLabel: 'Basic dex',
        prose:
          'The swirling launch opening a single mirage dex, the clearest case of the SWIRL set on its own (3 ADD).',
      },
      {
        slug:      'swirling_butterfly',
        baseLabel: 'Wing family',
        prose:
          'The same swirling launch opening a butterfly (4 ADD).',
      },
      {
        slug:      'swirling_swirl',
        baseLabel: 'Swirl family',
        prose:
          'Swirling opening a swirl, the SWIRL launch on a swirl base (4 ADD).',
      },
      {
        slug:      'swirling_whirl',
        baseLabel: 'Whirl family',
        prose:
          'Swirling opening a whirl (4 ADD).',
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the composite +3 launch sets (FLOATING, SURFING, WARPING)
// ─────────────────────────────────────────────────────────────────────────

const FLOATING_SET_CONTENT: SetEducationInput = {
  slug:         'floating',
  displayName:  'Floating',
  definition:
    'Floating is a composite launch set: it determines how a trick is opened by stacking three set events, rather than adding a movement to the trick itself. It reads Quantum Symposium Quantum, a quantum entry, a no-plant symposium event, and a second quantum.',
  jobNotation:
    'Floating lives in the set portion of the notation, at the front of the chain, reading as the Quantum Symposium Quantum stack; the rest of the chain is the unchanged base. So floating butterfly (the named trick floatation) decomposes as floating(+3) + butterfly(3) = 6, the leading composite set carrying the +3 and the trailing base carrying its own count.',
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:       'butterfly',
        addedLabel: 'anchor (no floating yet)',
        rationale:
          'The butterfly dexterity on its own, opened from a stationary set. Floating will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'floatation',
        addedLabel: '+ floating',
        rationale:
          'The floating launch applied to butterfly: the Quantum Symposium Quantum stack opens the chain while the butterfly itself is unchanged. The named trick floatation (6 ADD).',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'floatation',
        baseLabel: 'Wing family',
        prose:
          'Floatation is floating butterfly: the Quantum Symposium Quantum launch opening a butterfly, floating(+3) + butterfly(3) = 6.',
      },
    ],
  },
};

const SURFING_SET_CONTENT: SetEducationInput = {
  slug:         'surfing',
  displayName:  'Surfing',
  definition:
    'Surfing is a composite launch set: it determines how a trick is opened by stacking three set events, rather than adding a movement to the trick itself. It reads Fairy Symposium Swirling, a fairy toe-set outward dex, a no-plant symposium body, and a back-swirl dex.',
  jobNotation:
    'Surfing lives in the set portion of the notation, at the front of the chain, reading TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] > OP OUT [DEX] >, the Fairy Symposium Swirling stack; the rest of the chain is the unchanged base. So surfing blender (the named trick big papa smurf) decomposes as surfing(+3) + blender(4) = 7, the leading composite set carrying the +3 and the trailing base carrying its own count.',
  progression: {
    anchorBaseLabel: 'on blender',
    steps: [
      {
        slug:       'blender',
        addedLabel: 'anchor (no surfing yet)',
        rationale:
          'The blender dexterity on its own, opened from a stationary set. Surfing will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'big_papa_smurf',
        addedLabel: '+ surfing',
        rationale:
          'The surfing launch applied to blender: the Fairy Symposium Swirling stack opens the chain while the blender itself is unchanged. The named trick big papa smurf (7 ADD).',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'big_papa_smurf',
        baseLabel: 'Blender family',
        prose:
          'Big papa smurf is surfing blender: the Fairy Symposium Swirling launch opening a blender, surfing(+3) + blender(4) = 7.',
      },
    ],
  },
};

const WARPING_SET_CONTENT: SetEducationInput = {
  slug:         'warping',
  displayName:  'Warping',
  definition:
    'Warping is a composite launch set: it determines how a trick is opened by a two-dex set sequence, rather than adding a movement to the trick itself. The first dex opens the set, and the second dex is carried as a no-plant symposium event.',
  jobNotation:
    'Warping lives in the set portion of the notation, at the front of the chain, reading TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX], a first dex followed by a second dex carried as a no-plant symposium event; the rest of the chain is the unchanged base. So warping mirage (the named trick warp) decomposes as warping(+3) + mirage(2) = 5, the leading two-dex set carrying the +3 and the trailing base carrying its own count.',
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:       'mirage',
        addedLabel: 'anchor (no warping yet)',
        rationale:
          'The mirage dexterity on its own, opened from a stationary set. Warping will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'warp',
        addedLabel: '+ warping',
        rationale:
          'The warping launch applied to mirage: the two-dex set, whose second dex is a symposium event, opens the chain while the mirage itself is unchanged. The named trick warp (5 ADD).',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'warp',
        baseLabel: 'Basic dex',
        prose:
          'Warp is warping mirage: the two-dex warping launch opening a mirage, warping(+3) + mirage(2) = 5.',
      },
    ],
  },
};

const ATOMIC_SET_CONTENT: SetEducationInput = {
  slug:         'atomic',
  displayName:  'Atomic',
  definition:
    'Atomic is a launch set: essentially an uptime Illusion. From a toe set, the bag makes a single opposite-side outward dex before the next part of the trick begins. Because that dex happens during the set, Atomic changes how the bag is delivered into the following movement rather than replacing that movement.',
  jobNotation:
    'Atomic lives in the set portion of the notation, at the front of the chain. So atomic whirl decomposes as atomic(+1) + whirl(3) = 4, the leading set carrying the +1 and the trailing base carrying the rest.',
  progression: {
    anchorBaseLabel: 'on whirl',
    steps: [
      {
        slug:       'whirl',
        addedLabel: 'anchor (no atomic yet)',
        rationale:
          'The whirl dexterity on its own, opened from a stationary set. Atomic will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'atomic_whirl',
        addedLabel: '+ atomic',
        rationale:
          'The atomic launch applied to whirl: the toe set opens with an opposite-side outward dex while the whirl itself is unchanged, atomic(+1) + whirl(3) = 4.',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'atom_smasher',
        baseLabel: 'Named trick',
        prose:
          'Atom smasher is the atomic mirage and a named trick in its own right: the atomic launch opening a mirage, reading 4 because it carries an X-Dex.',
      },
      {
        slug:      'atomic_whirl',
        baseLabel: 'Rotational',
        prose:
          'The atomic launch opening a whirl; the launch changes while the whirl dex is unchanged, atomic(+1) + whirl(3) = 4.',
      },
      {
        slug:      'atomic_swirl',
        baseLabel: 'Reverse rotational',
        prose:
          'Atomic opening a swirl, the reverse-direction rotational counterpart of the whirl, 4 ADD.',
      },
      {
        slug:      'atomic_butterfly',
        baseLabel: 'Butterfly family',
        prose:
          'Atomic opening a butterfly, the outward launch delivering the bag into the butterfly, 4 ADD.',
      },
      {
        slug:      'atomic_illusion',
        baseLabel: 'Illusion family',
        prose:
          'Atomic opening an illusion, one of the clearest single-dex cases, atomic(+1) + illusion(2) = 3.',
      },
    ],
  },
};

const QUANTUM_SET_CONTENT: SetEducationInput = {
  slug:         'quantum',
  displayName:  'Quantum',
  definition:
    'Quantum is a launch set: essentially an uptime Mirage. From a toe set, the bag makes a single opposite-side inward dex before the next part of the trick begins. Because that dex happens during the set, Quantum changes how the bag is delivered into the following movement rather than replacing that movement.',
  jobNotation:
    'Quantum lives in the set portion of the notation, at the front of the chain. So quantum mirage decomposes as quantum(+1) + mirage(2) = 3.',
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:       'mirage',
        addedLabel: 'anchor (no quantum yet)',
        rationale:
          'The mirage dexterity on its own, opened from a stationary set. Quantum will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'quantum_mirage',
        addedLabel: '+ quantum',
        rationale:
          'The quantum launch applied to mirage: the toe set opens with an opposite-side inward dex, quantum(+1) + mirage(2) = 3. Its historical name is Toe Blur.',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'quantum_mirage',
        baseLabel: 'Named trick',
        prose:
          'The quantum launch opening a single mirage, the clearest case of the set on its own and historically named Toe Blur, quantum(+1) + mirage(2) = 3.',
      },
      {
        slug:      'quantum_whirl',
        baseLabel: 'Rotational',
        prose:
          'Quantum opening a whirl; the launch changes while the whirl dex is unchanged, 4 ADD.',
      },
      {
        slug:      'quantum_butterfly',
        baseLabel: 'Butterfly family',
        prose:
          'Quantum opening a butterfly, the inward launch delivering the bag into the butterfly, 4 ADD.',
      },
      {
        slug:      'quantum_legover',
        baseLabel: 'Legover family',
        prose:
          'Quantum opening a legover, quantum(+1) + legover(2) = 3.',
      },
      {
        slug:      'quantum_illusion',
        baseLabel: 'Illusion family',
        prose:
          'Quantum opening an illusion, 3 ADD.',
      },
    ],
  },
};

const NUCLEAR_SET_CONTENT: SetEducationInput = {
  slug:         'nuclear',
  displayName:  'Nuclear',
  definition:
    'Nuclear is a launch set that folds two movements into one opening: a paradox hip pivot and a downtime illusion-style dex, from a clipper set with a same-side outward dex, delivering the bag into the base that follows. The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; what nuclear sets is the launch.',
  jobNotation:
    'Nuclear lives in the set portion of the notation, at the front of the chain: CLIP > SAME OUT [DEX] >. So nuclear butterfly decomposes as nuclear(+2) + butterfly(3) = 5, the leading set carrying the +2 and the trailing base carrying the rest.',
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:       'butterfly',
        addedLabel: 'anchor (no nuclear yet)',
        rationale:
          'The butterfly dexterity on its own, opened from a stationary set. Nuclear will open it with a paradox-plus-illusion clipper launch.',
      },
      {
        slug:       'matador',
        addedLabel: '+ nuclear',
        rationale:
          'The nuclear launch applied to butterfly, carrying its own name matador, nuclear(+2) + butterfly(3) = 5.',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'sumo',
        baseLabel: 'Named trick',
        prose:
          'Sumo is the nuclear mirage, a named trick in its own right: the nuclear launch opening a mirage, 5 ADD.',
      },
      {
        slug:      'matador',
        baseLabel: 'Butterfly family',
        prose:
          'Matador is the nuclear butterfly, a named trick, nuclear(+2) + butterfly(3) = 5.',
      },
      {
        slug:      'nuclear_whirl',
        baseLabel: 'Rotational',
        prose:
          'Nuclear opening a whirl, 5 ADD.',
      },
      {
        slug:      'nuclear_legover',
        baseLabel: 'Legover family',
        prose:
          'Nuclear opening a legover, nuclear(+2) + legover(2) = 4.',
      },
      {
        slug:      'nuclear_illusion',
        baseLabel: 'Illusion family',
        prose:
          'Nuclear opening an illusion, 4 ADD.',
      },
    ],
  },
};

const FURIOUS_SET_CONTENT: SetEducationInput = {
  slug:         'furious',
  displayName:  'Furious',
  definition:
    'Furious is a launch set built from two dexes: it opens a trick from a clipper set with an opposite-side inward dex, then a same-side inward dex, delivering the bag into the base that follows. The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; what furious sets is the launch.',
  jobNotation:
    'Furious lives in the set portion of the notation, at the front of the chain, and spans two dexes: CLIP > OP IN [DEX] > SAME IN [DEX] >. So a furious mirage decomposes as furious(+2) + mirage(2) = 4, the leading two-dex set carrying the +2 and the trailing base carrying the rest.',
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:       'mirage',
        addedLabel: 'anchor (no furious yet)',
        rationale:
          'The mirage dexterity on its own, opened from a stationary set. Furious will open it with two inward dexes.',
      },
      {
        slug:       'furious_mirage',
        addedLabel: '+ furious',
        rationale:
          'The two-dex furious launch applied to mirage, furious(+2) + mirage(2) = 4.',
      },
    ],
  },
  representativeTricks: {
    examples: [
      {
        slug:      'furious_mirage',
        baseLabel: 'Basic dex',
        prose:
          'The furious launch opening a single mirage, the clearest two-dex case, 4 ADD.',
      },
      {
        slug:      'furious_osis',
        baseLabel: 'Osis family',
        prose:
          'The furious launch opening an osis, 5 ADD.',
      },
      {
        slug:      'fury',
        baseLabel: 'Named trick',
        prose:
          'Fury is a named trick built on the furious launch, 5 ADD.',
      },
      {
        slug:      'furious_butterfly',
        baseLabel: 'Butterfly family',
        prose:
          'The furious launch opening a butterfly, 5 ADD.',
      },
      {
        slug:      'furious_legover',
        baseLabel: 'Legover family',
        prose:
          'The furious launch opening a legover, furious(+2) + legover(2) = 4.',
      },
    ],
  },
};

// Registry — set teaching pages.
const SET_PAGE_CONTENT: Record<string, SetEducationInput> = {
  stepping: STEPPING_SET_CONTENT,
  pixie:    PIXIE_SET_CONTENT,
  fairy:    FAIRY_SET_CONTENT,
  swirling: SWIRLING_SET_CONTENT,
  floating: FLOATING_SET_CONTENT,
  surfing:  SURFING_SET_CONTENT,
  warping:  WARPING_SET_CONTENT,
  atomic:   ATOMIC_SET_CONTENT,
  quantum:  QUANTUM_SET_CONTENT,
  nuclear:  NUCLEAR_SET_CONTENT,
  furious:  FURIOUS_SET_CONTENT,
};

// ─────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────

/** Returns true when an authored set-teaching page exists for the slug. */
export function hasSetEducationPage(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(SET_PAGE_CONTENT, slug);
}

// First-class sets that are NOT also tricks, so their TRICK route redirects to
// the set page (a /freestyle/tricks/<slug> request must not render a trick that
// does not exist). They carried legacy modifier assumptions (a modifier stub, a
// trick-route redirect to the modifier page); the route layer now redirects both
// their modifier and trick routes to /freestyle/sets/<slug>. Swirling has an
// authored teaching page, but it stays listed here precisely because its trick
// route must redirect — unlike dual-role sets such as pixie and fairy, which ARE
// tricks and whose trick page renders normally (only their modifier route
// redirects, via hasSetEducationPage). Its ADD-math layer (trick_modifiers,
// operator reference) is unaffected. Whirling is not listed: it is not a set, so
// its modifier and trick routes resolve as a body modifier's do.
const SET_FIRST_MODIFIER_SLUGS: ReadonlySet<string> = new Set(['swirling']);

/** True when the slug is a first-class set whose MODIFIER route redirects to its
 *  set page (an authored set page, or a route-migrated canonical set). Used for
 *  the modifier route, which redirects for every first-class set. */
export function isSetFirstSlug(slug: string): boolean {
  return hasSetEducationPage(slug) || SET_FIRST_MODIFIER_SLUGS.has(slug);
}

/** True only for first-class sets that are not also tricks, whose TRICK route
 *  must redirect to the set page. Dual-role sets (pixie, fairy) are excluded so
 *  their trick page still renders. */
export function isRouteMigratedSet(slug: string): boolean {
  return SET_FIRST_MODIFIER_SLUGS.has(slug);
}

/**
 * Build the set-teaching content for a slug, resolving every progression step
 * and representative-trick slug against the dictionary so links are clickable
 * and carry the canonical name + ADD. Returns null when the slug has no
 * authored content.
 */
export function buildSetEducationContent(
  slug: string,
  allDictRows: readonly FreestyleTrickRow[],
): SetEducationContent | null {
  const input = SET_PAGE_CONTENT[slug];
  if (!input) return null;

  const dictBySlug = new Map<string, FreestyleTrickRow>();
  for (const row of allDictRows) dictBySlug.set(row.slug, row);

  const steps: SetEducationProgressionStepResolved[] = input.progression.steps.map((step, idx) => {
    const row = dictBySlug.get(step.slug);
    return {
      ...step,
      canonicalName: row?.canonical_name ?? step.slug,
      adds:          row?.adds ?? null,
      detailHref:    `/freestyle/tricks/${step.slug}`,
      stepNumber:    idx + 1,
      isPilot:       !!row,
    };
  });

  const examples: SetEducationExampleResolved[] = input.representativeTricks.examples.map(ex => {
    const row = dictBySlug.get(ex.slug);
    return {
      ...ex,
      canonicalName: row?.canonical_name ?? ex.slug,
      adds:          row?.adds ?? null,
      detailHref:    `/freestyle/tricks/${ex.slug}`,
      isPilot:       !!row,
    };
  });

  return {
    slug:           input.slug,
    displayName:    input.displayName,
    definition:     input.definition,
    jobNotation:    input.jobNotation,
    progression: {
      anchorBaseLabel: input.progression.anchorBaseLabel,
      steps,
    },
    representativeTricks: {
      examples,
    },
  };
}
