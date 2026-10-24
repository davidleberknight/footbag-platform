/**
 * symbolicSetEducation.ts
 *
 * Hand-authored educational content for canonical-set teaching surfaces. A set
 * is a launch system, so its page teaches what structural launch the set
 * contributes to an otherwise-unchanged base dexterity, concept before
 * mechanics.
 *
 * This is the PEDAGOGY layer, deliberately separate from the set ontology in
 * freestyleCanonicalSets.ts: ontology objects carry terse canonical facts
 * (formula, derived systems, provenance), and must not absorb teaching prose.
 * The freestyle service resolves the authored content below into a view-model,
 * resolving every progression / representative-trick slug against the
 * dictionary so the links are clickable.
 *
 * A set teaching page has at most six sections, with headings identical on
 * every set page (the page title names the set): What it is / How it launches /
 * Progression / Example tricks / Common confusions / Related concepts. "How it
 * launches" carries the launch prose, the notation and the launch notes, each
 * optional, so a page states the formula and the +N once rather than in every
 * slot. General notation is explained once, on the Set Encyclopedia.
 *
 * Adding a set: register an object in SET_PAGE_CONTENT.
 */
import type { FreestyleTrickRow } from '../db/db';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface SetEducationConfusionPair {
  heading: string;
  prose:   string;
}

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

export interface SetEducationRelatedSystem {
  name:  string;
  prose: string;
}

// Per-set authored content (input shape; static).
export interface SetEducationInput {
  slug:         string;   // canonical-set slug; matches the /freestyle/sets/:slug param
  displayName:  string;
  definition:     string; // What it is
  howItLaunches:  string; // How it launches (launch-first; the base dexterity stays recognizable); '' to omit
  jobNotation:    string; // The set formula and what the notation records; '' to omit
  launchNotes:    string; // Objective: the defining launch structure, not coaching; '' to omit
  confusions:     SetEducationConfusionPair[];
  progression: {
    anchorBaseLabel: string;
    steps:           SetEducationProgressionStep[];
  };
  representativeTricks: {
    examples:    SetEducationExample[];
  };
  relatedConcepts: SetEducationRelatedSystem[];
}

// Per-set output shape (dictionary-row-resolved view-model).
export interface SetEducationProgressionStepResolved extends SetEducationProgressionStep {
  canonicalName: string;
  adds:          string | null;
  detailHref:    string;
  isAnchor:      boolean;
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
  howItLaunches:  string;
  jobNotation:    string;
  launchNotes:    string;
  confusions:     SetEducationConfusionPair[];
  progression: {
    anchorBaseLabel: string;
    steps:           SetEducationProgressionStepResolved[];
  };
  representativeTricks: {
    examples:    SetEducationExampleResolved[];
  };
  relatedConcepts: SetEducationRelatedSystem[];
}

// ─────────────────────────────────────────────────────────────────────────
// Authored content — STEPPING (the set-page reference implementation)
// ─────────────────────────────────────────────────────────────────────────

const STEPPING_SET_CONTENT: SetEducationInput = {
  slug:         'stepping',
  displayName:  'Stepping',
  definition:
    'Stepping is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. The support foot relocates as it opens a clipper-anchored set, delivering the bag into the dexterity from an opposite-side inward set rather than from a stationary toe or clipper set. The dexterity that follows is unchanged; what stepping sets is the launch. In notation the set reads CLIP > OP IN [DEX], and as a set treatment it contributes +1.',
  howItLaunches: '',
  jobNotation:
    'Stepping lives in the set portion of the notation, at the front of the chain. So stepping mirage reads CLIP > OP IN [DEX] >> OP IN [DEX] > OP TOE [DEL] and decomposes as stepping(+1) + mirage(2) = 3, where the leading set carries the +1 and the trailing dex and terminal carry the base.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base. Stepping Whirl retains Whirl\'s OP IN.',
  confusions: [
    {
      heading: 'Stepping vs a plain clipper or toe set',
      prose:
        'Stepping is not just any clipper set. It is a clipper-anchored set with an opposite-side inward dex, opened by relocating the support foot. A stationary toe or clipper set delivers the bag without that relocation and scores no set bonus; stepping records the foot relocation and scores +1.',
    },
    {
      heading: 'Stepping vs pixie',
      prose:
        'Stepping and pixie are both core launch sets, but they are different launches. Pixie is a toe set with a same-side inward dex (TOE > SAME IN [DEX]); stepping is a clipper-anchored set with an opposite-side inward dex (CLIP > OP IN [DEX]). They are separate launch identities, not two names for one launch.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'Furious',
      prose: 'the two-dex set historically also called Barraging; Barraging names resolve to Furious.',
    },
    {
      name:  'blurry',
      prose: 'A set system that decomposes to stepping plus a paradox side-switch; the stepping launch with an added cross-body relationship.',
    },
    {
      name:  'bubba',
      prose: 'The directional mirror of stepping: the same clipper-anchored launch opened to the opposite side.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the toe-anchored core launches (PIXIE, FAIRY)
// ─────────────────────────────────────────────────────────────────────────

const PIXIE_SET_CONTENT: SetEducationInput = {
  slug:         'pixie',
  displayName:  'Pixie',
  definition:
    'Pixie is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a toe set with a same-side inward dex, delivering the bag into the dexterity that follows. The dexterity is unchanged; what pixie sets is the launch. In notation the set reads TOE > SAME IN [DEX], and as a set treatment it contributes +1.',
  howItLaunches:
    'The toe set opens with a same-side inward dex, and the bag is delivered into whatever dexterity follows, which stays recognizable: a pixie mirage is still a mirage (the named trick smear), a pixie butterfly is still a butterfly (the named trick dimwalk).',
  jobNotation:
    'Pixie lives in the set portion of the notation, at the front of the chain. So pixie mirage (the named trick smear) decomposes as pixie(+1) + mirage(2) = 3, the leading set carrying the +1 and the trailing dex and terminal carrying the base.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base. Smear retains Mirage\'s OP IN, while Magellan authors Legover\'s outward dex as SAME OUT.',
  confusions: [
    {
      heading: 'Pixie vs fairy',
      prose:
        'Pixie and fairy are both toe-anchored core launch sets, but they are different launches. Pixie opens with a same-side inward dex (TOE > SAME IN [DEX]); fairy opens with a same-side outward dex (TOE > SAME OUT [DEX]). They are directional mirrors, separate launch identities, not two names for one launch.',
    },
    {
      heading: 'Pixie vs stepping',
      prose:
        'Both are core launch sets, but pixie is toe-anchored with a same-side inward dex, while stepping is clipper-anchored with an opposite-side inward dex (CLIP > OP IN [DEX]). Different anchor, different launch.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'sailing',
      prose: 'A set system derived from pixie: sailing reads pixie plus quantum, layering a further set treatment onto the pixie launch.',
    },
    {
      name:  'terraging',
      prose: 'Another set system built on the pixie launch.',
    },
  ],
};

const FAIRY_SET_CONTENT: SetEducationInput = {
  slug:         'fairy',
  displayName:  'Fairy',
  definition:
    'Fairy is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a toe set with a same-side outward dex, delivering the bag into the dexterity that follows. The dexterity is unchanged; what fairy sets is the launch. In notation the set reads TOE > SAME OUT [DEX], and as a set treatment it contributes +1.',
  howItLaunches:
    'The toe set opens with a same-side outward dex, and the bag is delivered into whatever dexterity follows, which stays recognizable: a fairy mirage is still a mirage, a fairy butterfly is still a butterfly.',
  jobNotation:
    'Fairy lives in the set portion of the notation, at the front of the chain. So fairy mirage decomposes as fairy(+1) + mirage(2) = 3, the leading set carrying the +1 and the trailing dex and terminal carrying the base.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base. Fairy Butterfly retains Butterfly\'s OP OUT.',
  confusions: [
    {
      heading: 'Fairy vs pixie',
      prose:
        'Fairy and pixie are both toe-anchored core launch sets, but they are different launches. Fairy opens with a same-side outward dex (TOE > SAME OUT [DEX]); pixie opens with a same-side inward dex (TOE > SAME IN [DEX]). They are directional mirrors, separate launch identities, not two names for one launch.',
    },
    {
      heading: 'Fairy vs stepping',
      prose:
        'Both are core launch sets, but fairy is toe-anchored with a same-side outward dex, while stepping is clipper-anchored with an opposite-side inward dex. Different anchor, different launch.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'surfing',
      prose: 'A composite set that opens with the fairy toe-set entry (fairy symposium swirling); useful for seeing how fairy seeds derived systems.',
    },
    {
      name:  'finchy',
      prose: 'A set system built on the fairy launch.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the whirl-family launch (SWIRLING)
// ─────────────────────────────────────────────────────────────────────────

const SWIRLING_SET_CONTENT: SetEducationInput = {
  slug:         'swirling',
  displayName:  'Swirling',
  definition:
    'Swirling is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a clipper-anchored cross-body rotational set carried by an explicit SWIRL dex token, the opening of the whirl and swirl family. The dexterity is unchanged; what swirling sets is the launch. As a set treatment it contributes +1.',
  howItLaunches: '',
  jobNotation:
    'Swirling lives in the set portion of the notation, at the front of the chain, reading CLIP > SAME BACK/FRONT SWIRL [DEX] >, the cross-body rotational opening with an explicit SWIRL token; the rest of the chain is the unchanged base. So swirling mirage decomposes as swirling(+1) + mirage(2) = 3, the leading SWIRL set carrying the +1 and the trailing dex and terminal carrying the base.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base. Swirling Butterfly retains Butterfly\'s OP OUT.',
  confusions: [],
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
  relatedConcepts: [
    {
      name:  'snapping',
      prose: 'A set system derived from swirling.',
    },
    {
      name:  'surfing',
      prose: 'A composite set that carries swirling as its out dex (fairy symposium swirling).',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the composite +3 launch sets (FLOATING, SURFING, WARPING)
// ─────────────────────────────────────────────────────────────────────────

const FLOATING_SET_CONTENT: SetEducationInput = {
  slug:         'floating',
  displayName:  'Floating',
  definition:
    'Floating is a composite launch set: it determines how a trick is opened by stacking three set events, rather than adding a movement to the trick itself. It reads Quantum Symposium Quantum, a quantum entry, a no-plant symposium event, and a second quantum. The dexterity is unchanged; what floating sets is the launch. As a set treatment it contributes +3.',
  howItLaunches: '',
  jobNotation:
    'Floating lives in the set portion of the notation, at the front of the chain, reading as the Quantum Symposium Quantum stack; the rest of the chain is the unchanged base. So floating butterfly (the named trick floatation) decomposes as floating(+3) + butterfly(3) = 6, the leading composite set carrying the +3 and the trailing base carrying its own count.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base. Floatation authors Butterfly\'s dex as SAME OUT.',
  confusions: [
    {
      heading: 'Floating is one named set, not three separate operators',
      prose:
        'Floating reads Quantum Symposium Quantum, but it is taken as a single settled launch set worth +3, not three operators to be re-derived on every trick. Trick cards reference the floating set by shorthand rather than repeating the expansion.',
    },
    {
      heading: 'Floating is a launch, not a body movement',
      prose:
        'The symposium event inside floating is part of the launch sequence, not a body operator added to the trick afterward. Floating is scored as a set treatment and written in the set portion of the notation.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'sailing',
      prose: 'A sibling composite set; useful for seeing floating as one member of a family of worked-out composite launches.',
    },
    {
      name:  'quantum',
      prose: 'The set treatment that floating stacks twice (Quantum Symposium Quantum).',
    },
    {
      name:  'symposium',
      prose: 'The no-plant event in the middle of the floating stack.',
    },
  ],
};

const SURFING_SET_CONTENT: SetEducationInput = {
  slug:         'surfing',
  displayName:  'Surfing',
  definition:
    'Surfing is a composite launch set: it determines how a trick is opened by stacking three set events, rather than adding a movement to the trick itself. It reads Fairy Symposium Swirling, a fairy toe-set outward dex, a no-plant symposium body, and a back-swirl dex. The dexterity is unchanged; what surfing sets is the launch. As a set treatment it contributes +3.',
  howItLaunches: '',
  jobNotation:
    'Surfing lives in the set portion of the notation, at the front of the chain, reading TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] > OP OUT [DEX] >, the Fairy Symposium Swirling stack; the rest of the chain is the unchanged base. So surfing blender (the named trick big papa smurf) decomposes as surfing(+3) + blender(4) = 7, the leading composite set carrying the +3 and the trailing base carrying its own count.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base. Big Papa Smurf retains Blender\'s OP IN.',
  confusions: [
    {
      heading: 'Surfing is one named set, not three separate operators',
      prose:
        'Surfing reads Fairy Symposium Swirling, but it is taken as a single settled launch set worth +3, not three operators to be re-derived on every trick. Trick cards reference the surfing set by shorthand rather than repeating the expansion.',
    },
    {
      heading: 'Surfing is a launch, not a body movement',
      prose:
        'The symposium body inside surfing is part of the launch sequence, not a body operator added to the trick afterward. Surfing is scored as a set treatment and written in the set portion of the notation.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'fairy',
      prose: 'The toe-set outward entry that opens the surfing stack.',
    },
    {
      name:  'swirling',
      prose: 'The out dex inside the surfing stack.',
    },
    {
      name:  'symposium',
      prose: 'The no-plant body event in the middle of the surfing stack.',
    },
  ],
};

const WARPING_SET_CONTENT: SetEducationInput = {
  slug:         'warping',
  displayName:  'Warping',
  definition:
    'Warping is a composite launch set: it determines how a trick is opened by a two-dex set sequence, rather than adding a movement to the trick itself. The first dex opens the set, and the second dex is carried as a no-plant symposium event. The dexterity that follows is unchanged; what warping sets is the launch. As a set treatment it contributes +3.',
  howItLaunches: '',
  jobNotation:
    'Warping lives in the set portion of the notation, at the front of the chain, reading TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX], a first dex followed by a second dex carried as a no-plant symposium event; the rest of the chain is the unchanged base. So warping mirage (the named trick warp) decomposes as warping(+3) + mirage(2) = 5, the leading two-dex set carrying the +3 and the trailing base carrying its own count.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base.',
  confusions: [
    {
      heading: 'Warping is one named set, not separate operators',
      prose:
        'Warping is a two-dex set whose second dex is a symposium event, but it is taken as a single settled launch set worth +3, not operators to be re-derived on every trick. Trick cards reference the warping set by shorthand rather than repeating the expansion.',
    },
    {
      heading: 'Warping is a launch, not a body movement',
      prose:
        'The symposium event inside warping is part of the launch sequence, not a body operator added to the trick afterward. Warping is scored as a set treatment and written in the set portion of the notation.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'sailing',
      prose: 'A sibling composite set; useful for seeing warping as one member of a family of worked-out composite launches.',
    },
    {
      name:  'symposium',
      prose: 'The no-plant event carried as the second dex of the warping set.',
    },
  ],
};

const ATOMIC_SET_CONTENT: SetEducationInput = {
  slug:         'atomic',
  displayName:  'Atomic',
  definition:
    'Atomic is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a toe set with a single opposite-side outward dex, delivering the bag into the dexterity that follows. The dexterity is unchanged; what atomic sets is the launch. In notation the set reads TOE > OP OUT [DEX], and as a set treatment it contributes +1.',
  howItLaunches: '',
  jobNotation:
    'Atomic lives in the set portion of the notation, at the front of the chain. So atomic whirl decomposes as atomic(+1) + whirl(3) = 4, the leading set carrying the +1 and the trailing base carrying the rest.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base. Tapdown remains the established Tapping re-authoring precedent.',
  confusions: [
    {
      heading: 'Atomic vs quantum',
      prose:
        'Both are toe-anchored launch sets that finish on an opposite-side component, but they open in opposite directions. Atomic opens with an opposite-side outward dex (TOE > OP OUT [DEX]); quantum opens with an opposite-side inward dex (TOE > OP IN [DEX]). They are directional counterparts, separate launch identities, not two names for one launch.',
    },
    {
      heading: 'Atomic vs illusioning',
      prose:
        'Older sources sometimes used illusioning language for atomic, but current doctrine keeps them distinct: illusioning is the outward dex realized standalone, not another name for atomic, which is that same movement realized with a set role.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'nuclear',
      prose: 'A clipper-anchored set that folds a paradox pivot into a downtime illusion dex. A separate launch family, useful to contrast against the single outward uptime dex of atomic.',
    },
    {
      name:  'tapping',
      prose: 'A toe-anchored set built on the same opening; useful for seeing how atomic seeds derived systems.',
    },
  ],
};

const QUANTUM_SET_CONTENT: SetEducationInput = {
  slug:         'quantum',
  displayName:  'Quantum',
  definition:
    'Quantum is a launch set: it determines how a trick is opened rather than adding a movement to the trick itself. It opens from a toe set with a single opposite-side inward dex, delivering the bag into the dexterity that follows. The dexterity is unchanged; what quantum sets is the launch. In notation the set reads TOE > OP IN [DEX], and as a set treatment it contributes +1. Its historical name is Toe Blur.',
  howItLaunches: '',
  jobNotation:
    'Quantum lives in the set portion of the notation, at the front of the chain. So quantum mirage decomposes as quantum(+1) + mirage(2) = 3.',
  launchNotes:
    'The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; they are not copied mechanically from the standalone base.',
  confusions: [
    {
      heading: 'Quantum vs atomic',
      prose:
        'Both are toe-anchored launches that finish on an opposite-side component, but they open in opposite directions. Quantum opens inward (TOE > OP IN [DEX]); atomic opens outward (TOE > OP OUT [DEX]). Directional counterparts, separate launch identities.',
    },
    {
      heading: 'Quantum vs Toe Blur',
      prose:
        'Toe Blur is the historical name for the quantum launch, most familiar as quantum mirage. Same launch, older name; the dictionary keeps quantum as the current term with Toe Blur preserved as history.',
    },
    {
      heading: 'Quantum vs Miraging',
      prose:
        'Miraging is a descriptive mirage-family name for the inward standalone movement; it is a nickname, not a launch set, and not an equivalent term for Quantum. Miraging names may persist for continuity, but Quantum is the same inward movement realized with a set role, and its own historical name is Toe Blur.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'frantic',
      prose: 'A set system derived from quantum, layering a further set treatment onto the quantum launch.',
    },
    {
      name:  'slapping',
      prose: 'A same-side-component sibling of quantum; useful for contrasting the terminal side.',
    },
  ],
};

const NUCLEAR_SET_CONTENT: SetEducationInput = {
  slug:         'nuclear',
  displayName:  'Nuclear',
  definition:
    'Nuclear is a launch set that folds two movements into one opening: a paradox hip pivot and a downtime illusion-style dex, from a clipper set with a same-side outward dex, delivering the bag into the base that follows. The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; what nuclear sets is the launch. In notation the set reads CLIP > SAME OUT [DEX], and as a set treatment it contributes +2, combining paradox and illusion.',
  howItLaunches: '',
  jobNotation:
    'Nuclear lives in the set portion of the notation, at the front of the chain: CLIP > SAME OUT [DEX] >. So nuclear butterfly decomposes as nuclear(+2) + butterfly(3) = 5, the leading set carrying the +2 and the trailing base carrying the rest.',
  launchNotes: '',
  confusions: [
    {
      heading: 'Nuclear vs atomic',
      prose:
        'Both relate to uptime launches, but atomic is a single opposite-side outward toe dex (+1) and nuclear is a clipper-anchored paradox-plus-illusion opening (+2). Atomic is a related uptime set, not a component of nuclear under the paradox-plus-illusion reading.',
    },
    {
      heading: 'Nuclear is a +2 set, not a single dex',
      prose:
        'Some older readings treat nuclear as a basic single-dex set; the platform tracks it as a +2 opening that folds paradox and illusion together. The +2 reflects the combined launch, not a single dex.',
    },
  ],
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
  relatedConcepts: [
    {
      name:  'twinspinning',
      prose: 'A set system derived from nuclear, the nuclear inspinning, layering a further treatment onto the nuclear launch.',
    },
    {
      name:  'paradox',
      prose: 'One of the two movements nuclear folds in: a hip pivot between dexes. Useful for seeing the internal structure of nuclear.',
    },
    {
      name:  'illusion',
      prose: 'The downtime dex nuclear folds in alongside paradox; useful for seeing why nuclear reads as a +2 combined opening.',
    },
  ],
};

const FURIOUS_SET_CONTENT: SetEducationInput = {
  slug:         'furious',
  displayName:  'Furious',
  definition:
    'Furious is a launch set built from two dexes: it opens a trick from a clipper set with an opposite-side inward dex, then a same-side inward dex, delivering the bag into the base that follows. The base movement identity is retained, but its SAME/OP coordinates are authored within the complete compound relative to the most recent preceding side-bearing component; what furious sets is the launch. In notation the set reads CLIP > OP IN [DEX] > SAME IN [DEX], and as a two-dex set it contributes +2. Its historical name is high stepping.',
  howItLaunches: '',
  jobNotation:
    'Furious lives in the set portion of the notation, at the front of the chain, and spans two dexes: CLIP > OP IN [DEX] > SAME IN [DEX] >. So a furious mirage decomposes as furious(+2) + mirage(2) = 4, the leading two-dex set carrying the +2 and the trailing base carrying the rest.',
  launchNotes: '',
  confusions: [
    {
      heading: 'Furious vs Barraging',
      prose:
        'Furious is the canonical set for this two-dex opening. Barraging is not a canonical set. Some dictionary trick rows keep barraging-based names for historical name continuity, but those names are naming residue, not evidence that Barraging is a set; the set taught here is Furious.',
    },
    {
      heading: 'Furious vs stepping',
      prose:
        'Both are clipper-anchored inward launches, but stepping is a single dex (CLIP > OP IN [DEX], +1) and furious runs two inward dexes (+2). Different launch, different count.',
    },
    {
      heading: 'Furious vs Barrage',
      prose:
        'Barrage is a separate standalone base concept, unrelated to the furious two-dex set opening despite the similar name.',
    },
  ],
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
  // Stepping, Barraging and barrage are each a Common confusions entry above.
  relatedConcepts: [],
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
      isAnchor:      idx === 0,
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
    howItLaunches:  input.howItLaunches,
    jobNotation:    input.jobNotation,
    launchNotes:    input.launchNotes,
    confusions:     input.confusions,
    progression: {
      anchorBaseLabel: input.progression.anchorBaseLabel,
      steps,
    },
    representativeTricks: {
      examples,
    },
    relatedConcepts: input.relatedConcepts,
  };
}
