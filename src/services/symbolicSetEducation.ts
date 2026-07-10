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
 * The frozen set template (headings identical on every migrated set page; the
 * page title names the set): What it is / Why it exists / How it launches /
 * JOB notation / Where it appears / How it composes / Progression /
 * Representative tricks / Common confusions / Related concepts / Launch notes.
 * It reads in lockstep with the operator template; the two slots that are
 * launch-specific ("How it launches", "Launch notes") replace the operator
 * slots "How it changes the base trick" and "Execution notes".
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
  pageSubtitle: string;   // one-line frame below the H1
  definition:     string; // What it is
  whyItExists:    string; // Why it exists (the launch distinction it records, not difficulty)
  howItLaunches:  string; // How it launches (launch-first; the base dexterity stays recognizable)
  jobNotation:    string; // The set formula and what the notation records
  whereItAppears: string; // Which bases and compounds use this launch (composition first)
  howItComposes:  string; // What it combines with, and the set systems it seeds
  launchNotes:    string; // Objective: the defining launch structure, not coaching
  confusions:     SetEducationConfusionPair[];
  progression: {
    anchorBaseLabel: string;
    steps:           SetEducationProgressionStep[];
  };
  representativeTricks: {
    framingLine: string;
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
  pageSubtitle:   string;
  definition:     string;
  whyItExists:    string;
  howItLaunches:  string;
  jobNotation:    string;
  whereItAppears: string;
  howItComposes:  string;
  launchNotes:    string;
  confusions:     SetEducationConfusionPair[];
  progression: {
    anchorBaseLabel: string;
    steps:           SetEducationProgressionStepResolved[];
  };
  representativeTricks: {
    framingLine: string;
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
  pageSubtitle: 'A launch set that opens a trick from a relocating support foot, determining how the bag is delivered into the dexterity while the dexterity itself stays the same.',
  definition:
    'Stepping is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. The support foot relocates as it opens a clipper-anchored set, delivering the bag into the dexterity from an opposite-side inward set rather than from a stationary toe or clipper set. The dexterity that follows is unchanged; what stepping sets is the launch. In notation the set reads CLIP > OP IN [DEX], and as a set treatment it contributes +1.',
  whyItExists:
    'Stepping exists to distinguish tricks whose launch comes from a relocating support foot opening a clipper-anchored set, rather than from a stationary toe or clipper set. The dexterity is the same either way; the set records that the support foot steps to a new position to open the chain. This launch is a distinct structural event, scored independently as a +1 set treatment, separate from any body movement or dexterity in the trick.',
  howItLaunches:
    'Stepping is the launch itself, not a movement added after launch. The support foot relocates to open a clipper-anchored set, and the bag is delivered from an opposite-side inward set into whatever dexterity follows. The dexterity that follows is recognizable and unchanged: a stepping mirage is still a mirage, a stepping butterfly is still a butterfly (the named trick ripwalk). What stepping determines is how the trick is set up and entered, contributing +1 from the set treatment, separate from the dexterity count.',
  jobNotation:
    'Stepping lives in the set portion of the notation, at the front of the chain. A stepping trick opens CLIP > OP IN [DEX] >, the clipper-anchored set with an opposite-side inward dex that records the relocating support foot; the rest of the chain is the unchanged base. So stepping mirage reads CLIP > OP IN [DEX] >> OP IN [DEX] > OP TOE [DEL] and decomposes as stepping(+1) + mirage(2) = 3, where the leading set carries the +1 and the trailing dex and terminal carry the base. This is what marks stepping as a launch rather than a body operator: it is written as the opening set, not as a [BOD] or [PDX] token inserted alongside the dexterity.',
  whereItAppears:
    'Stepping is one of the core launch sets and appears across a very wide range of bases, from single-dex tricks to deep compounds. Several named systems are built directly on it: barraging, blurry, leaning, go-go, and shooting all extend the stepping launch. Its butterfly case carries the well-known name ripwalk. Among the launch sets it is clipper-anchored, the directional mirror of bubba, distinct from the toe-anchored launches such as pixie and fairy.',
  howItComposes:
    'Stepping composes with almost any dexterity while contributing its clipper-anchored launch. It opens uptime, rotational, and cross-body dexes, and the body operators layer on top of it: stepping and symposium, stepping and ducking, stepping and paradox all combine on a single base, each on its own axis. Because stepping is the launch and the body operators are body movements, the two layer without competing, which is why the deepest stepping compounds carry several operators at once. Stepping also seeds its own derived set systems, where a further set treatment is layered onto the stepping launch.',
  launchNotes:
    'The defining structure is a clipper-anchored set with an opposite-side inward dex, opened as the support foot relocates. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged. In notation the launch is recorded at the front of the chain as CLIP > OP IN [DEX].',
  confusions: [
    {
      heading: 'Stepping vs a plain clipper or toe set',
      prose:
        'Stepping is not just any clipper set. It is a clipper-anchored set with an opposite-side inward dex, opened by relocating the support foot. A stationary toe or clipper set delivers the bag without that relocation and scores no set bonus; stepping records the foot relocation and scores +1.',
    },
    {
      heading: 'Stepping is a launch, not a body movement',
      prose:
        'Stepping does not turn, duck, or pivot the body. It determines how the bag is launched into the trick, at the set layer. That is why it is scored as a set treatment and written in the set portion of the notation, not as a body token.',
    },
    {
      heading: 'Stepping vs pixie',
      prose:
        'Stepping and pixie are both core launch sets, but they are different launches. Pixie is a toe set with a same-side inward dex (TOE > SAME IN [DEX]); stepping is a clipper-anchored set with an opposite-side inward dex (CLIP > OP IN [DEX]). They are separate launch identities, not two names for one launch.',
    },
    {
      heading: 'Stepping does not replace the base trick',
      prose:
        'A stepping trick is still fundamentally the underlying trick. Stepping sets how it is launched; it does not replace the underlying dexterity or family.',
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
      {
        slug:       'parkwalk',
        addedLabel: '+ paradox',
        rationale:
          'The stepping launch combined with a paradox side-switch on the same butterfly base, a body operator on its own axis. The named trick parkwalk.',
      },
      {
        slug:       'stepping_ducking_butterfly',
        addedLabel: '+ ducking (deepest stack)',
        rationale:
          'The stepping launch stacked with ducking on butterfly, a deeper stepping compound. The support-foot relocation is still the same launch opening the chain.',
      },
    ],
  },
  representativeTricks: {
    framingLine:
      'These examples illustrate how the same stepping launch opens different trick families.',
    examples: [
      {
        slug:      'stepping_mirage',
        baseLabel: 'Basic dex',
        prose:
          'The stepping launch opening a single mirage dex, the clearest case of the set on its own (3 ADD).',
      },
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
      {
        slug:      'ripwalk',
        baseLabel: 'Recognizable named trick',
        prose:
          'Ripwalk is the canonical stepping butterfly, the most recognizable stepping compound and a named trick in its own right (named after the player Rippin Rick Reese): the stepping launch opening a butterfly (4 ADD).',
      },
    ],
  },
  relatedConcepts: [
    {
      name:  'barraging',
      prose: 'A two-dex set built on the stepping launch, adding a second inward dex. The clearest system derived from stepping. Furious is a historically related name; current doctrine holds Furious and Barraging distinct by timing, so equivalence is not inferred from the name.',
    },
    {
      name:  'blurry',
      prose: 'A set system that decomposes to stepping plus a paradox side-switch; the stepping launch with an added cross-body relationship.',
    },
    {
      name:  'shooting',
      prose: 'Another set system derived from the stepping launch, layering a further set treatment onto it.',
    },
    {
      name:  'bubba',
      prose: 'The directional mirror of stepping: the same clipper-anchored launch opened to the opposite side.',
    },
    {
      name:  'pixie',
      prose: 'A toe-anchored launch set (a toe set with a same-side inward dex). A separate launch identity, useful to contrast against stepping.',
    },
    {
      name:  'fairy',
      prose: 'The directional mirror of pixie, and like pixie a toe-anchored launch; contrasts with the clipper anchor of stepping.',
    },
    {
      name:  'paradox',
      prose: 'A side-switch dex relationship that combines with the stepping launch; the combination underlies blurry and the named trick parkwalk.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the toe-anchored core launches (PIXIE, FAIRY)
// ─────────────────────────────────────────────────────────────────────────

const PIXIE_SET_CONTENT: SetEducationInput = {
  slug:         'pixie',
  displayName:  'Pixie',
  pageSubtitle: 'A toe-anchored launch set that opens a trick from a same-side inward dex, determining how the bag is delivered into the dexterity while the dexterity itself stays the same.',
  definition:
    'Pixie is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a toe set with a same-side inward dex, delivering the bag into the dexterity that follows. The dexterity is unchanged; what pixie sets is the launch. In notation the set reads TOE > SAME IN [DEX], and as a set treatment it contributes +1.',
  whyItExists:
    'Pixie exists to distinguish tricks whose launch is a toe set with a same-side inward dex, separate from a stationary toe or clipper set and separate from its directional mirror fairy, whose dex is same-side outward. The dexterity is the same either way; the set records the specific toe-anchored, same-side-inward opening, scored independently as a +1 set treatment.',
  howItLaunches:
    'Pixie is the launch itself, not a movement added after launch. The toe set opens with a same-side inward dex, and the bag is delivered into whatever dexterity follows, which stays recognizable: a pixie mirage is still a mirage (the named trick smear), a pixie butterfly is still a butterfly (the named trick dimwalk). What pixie determines is how the trick is set up and entered, contributing +1 from the set treatment, separate from the dexterity count.',
  jobNotation:
    'Pixie lives in the set portion of the notation, at the front of the chain. A pixie trick opens TOE > SAME IN [DEX] >, the toe set with a same-side inward dex; the rest of the chain is the unchanged base. So pixie mirage (the named trick smear) decomposes as pixie(+1) + mirage(2) = 3, the leading set carrying the +1 and the trailing dex and terminal carrying the base. This is what marks pixie as a launch rather than a body operator: it is written as the opening set, not as a [BOD] or [PDX] token alongside the dexterity.',
  whereItAppears:
    'Pixie is one of the core launch sets and appears across a wide range of bases, from single-dex tricks to deep compounds. Several of its cases carry their own names: pixie mirage is smear, pixie illusion is smudge, pixie legover is magellan, pixie butterfly is dimwalk. Several set systems are built directly on it: sailing (pixie plus quantum), terraging, and frantic all extend the pixie launch. Among the launch sets it is toe-anchored, the directional mirror of fairy, distinct from the clipper-anchored launches such as stepping.',
  howItComposes:
    'Pixie composes with almost any dexterity while contributing its toe-anchored launch, and the body operators layer on top of it on their own axes. Because pixie is the launch and operators such as symposium, ducking, and paradox are body movements, the two layer without competing. Pixie also seeds its own derived set systems, where a further set treatment is layered onto the pixie launch: sailing reads pixie plus quantum, and terraging and frantic build on the same toe-anchored opening.',
  launchNotes:
    'The defining structure is a toe set with a same-side inward dex, written TOE > SAME IN [DEX]. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged. In notation the launch is recorded at the front of the chain.',
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
    {
      heading: 'Pixie is a launch, not a body movement',
      prose:
        'Pixie does not turn, duck, or pivot the body. It determines how the bag is launched into the trick, at the set layer. That is why it is scored as a set treatment and written in the set portion of the notation, not as a body token.',
    },
    {
      heading: 'Pixie does not replace the base trick',
      prose:
        'A pixie trick is still fundamentally the underlying trick. Pixie sets how it is launched; it does not replace the underlying dexterity or family.',
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
    framingLine:
      'These examples illustrate how the same pixie launch opens different trick families.',
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
      name:  'fairy',
      prose: 'The directional mirror of pixie: the same toe anchor opened with a same-side outward dex instead of inward. A separate launch identity, useful to contrast against pixie.',
    },
    {
      name:  'sailing',
      prose: 'A set system derived from pixie: sailing reads pixie plus quantum, layering a further set treatment onto the pixie launch.',
    },
    {
      name:  'terraging',
      prose: 'Another set system built on the pixie launch.',
    },
    {
      name:  'stepping',
      prose: 'A clipper-anchored core launch set (an opposite-side inward dex). A separate launch identity, useful to contrast against the toe anchor of pixie.',
    },
    {
      name:  'quantum',
      prose: 'A set treatment that combines with pixie to form sailing; useful for seeing how pixie seeds derived systems.',
    },
  ],
};

const FAIRY_SET_CONTENT: SetEducationInput = {
  slug:         'fairy',
  displayName:  'Fairy',
  pageSubtitle: 'A toe-anchored launch set that opens a trick from a same-side outward dex, the directional mirror of pixie, while the dexterity itself stays the same.',
  definition:
    'Fairy is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a toe set with a same-side outward dex, delivering the bag into the dexterity that follows. The dexterity is unchanged; what fairy sets is the launch. In notation the set reads TOE > SAME OUT [DEX], and as a set treatment it contributes +1.',
  whyItExists:
    'Fairy exists to distinguish tricks whose launch is a toe set with a same-side outward dex, separate from a stationary set and separate from its directional mirror pixie, whose dex is same-side inward. The dexterity is the same; the set records the specific toe-anchored, same-side-outward opening, scored independently as a +1 set treatment.',
  howItLaunches:
    'Fairy is the launch itself. The toe set opens with a same-side outward dex, and the bag is delivered into whatever dexterity follows, which stays recognizable: a fairy mirage is still a mirage, a fairy butterfly is still a butterfly. What fairy determines is how the trick is set up and entered, contributing +1 from the set treatment, separate from the dexterity count.',
  jobNotation:
    'Fairy lives in the set portion of the notation, at the front of the chain. A fairy trick opens TOE > SAME OUT [DEX] >, the toe set with a same-side outward dex; the rest of the chain is the unchanged base. So fairy mirage decomposes as fairy(+1) + mirage(2) = 3, the leading set carrying the +1 and the trailing dex and terminal carrying the base. This is what marks fairy as a launch rather than a body operator: it is the opening set, not a [BOD] or [PDX] token alongside the dexterity.',
  whereItAppears:
    'Fairy is one of the core launch sets and appears across a wide range of bases, from single-dex tricks to compounds. Several set systems extend it, including fairy atomic, fairy spinning, and finchy. Among the launch sets it is toe-anchored, the directional mirror of pixie, distinct from the clipper-anchored launches such as stepping.',
  howItComposes:
    'Fairy composes with almost any dexterity while contributing its toe-anchored launch, and the body operators layer on top of it on their own axes. Because fairy is the launch and operators such as symposium, ducking, and paradox are body movements, the two layer without competing. Fairy also seeds its own derived set systems, where a further set treatment is layered onto the fairy launch, and it is the toe-set entry inside the composite set surfing (fairy symposium swirling).',
  launchNotes:
    'The defining structure is a toe set with a same-side outward dex, written TOE > SAME OUT [DEX]. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged.',
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
    {
      heading: 'Fairy is a launch, not a body movement',
      prose:
        'Fairy does not turn, duck, or pivot the body. It determines how the bag is launched into the trick, at the set layer, which is why it is scored as a set treatment and written in the set portion of the notation.',
    },
    {
      heading: 'Fairy does not replace the base trick',
      prose:
        'A fairy trick is still fundamentally the underlying trick. Fairy sets how it is launched; it does not replace the underlying dexterity or family.',
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
    framingLine:
      'These examples illustrate how the same fairy launch opens different trick families.',
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
      name:  'pixie',
      prose: 'The directional mirror of fairy: the same toe anchor opened with a same-side inward dex instead of outward. A separate launch identity, useful to contrast against fairy.',
    },
    {
      name:  'surfing',
      prose: 'A composite set that opens with the fairy toe-set entry (fairy symposium swirling); useful for seeing how fairy seeds derived systems.',
    },
    {
      name:  'stepping',
      prose: 'A clipper-anchored core launch set. A separate launch identity, useful to contrast against the toe anchor of fairy.',
    },
    {
      name:  'finchy',
      prose: 'A set system built on the fairy launch.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the whirl-family launches (WHIRLING, SWIRLING)
// ─────────────────────────────────────────────────────────────────────────

const WHIRLING_SET_CONTENT: SetEducationInput = {
  slug:         'whirling',
  displayName:  'Whirling',
  pageSubtitle: 'A clipper-anchored rotational launch set, the anchor of the whirl-family naming branch, while the dexterity it opens stays the same.',
  definition:
    'Whirling is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a clipper-anchored set with an opposite-side inward dex and a same-side terminal, the rotational opening that anchors the whirl family. The dexterity is unchanged; what whirling sets is the launch. As a set treatment it contributes +1.',
  whyItExists:
    'Whirling exists to name the clipper-anchored rotational launch that opens the whirl family, distinguishing it from a stationary set and from its siblings swirling (an explicit SWIRL-token dex) and blazing (the opposite-side-terminal reading that the platform treats as whirling). The dexterity is the same; the set records the specific rotational opening, scored independently as a +1 set treatment.',
  howItLaunches:
    'Whirling is the launch itself, not a movement added after launch. The clipper-anchored set opens with an opposite-side inward dex resolving to a same-side terminal, and the bag is delivered into whatever dexterity follows, which stays recognizable: a whirling whirl is still a whirl, a whirling osis is still an osis (the named trick blender). What whirling determines is how the trick is set up and entered, contributing +1 from the set treatment.',
  jobNotation:
    'Whirling lives in the set portion of the notation, at the front of the chain, reading CLIP > OP IN [DEX] with a same-side terminal component; the rest of the chain is the unchanged base. So whirling whirl decomposes as whirling(+1) + whirl(3) = 4, the leading rotational set carrying the +1 and the trailing dex and terminal carrying the base. This is what marks whirling as a launch rather than a body operator: it is written as the opening set, not as a [BOD] token inserted alongside the dexterity.',
  whereItAppears:
    'Whirling is the anchor of the whirl-family naming branch and appears across whirl, butterfly, rake, pickup, and other bases. Its osis case is the named trick blender, and bling blang is a named whirling compound. Several set systems extend it, including blistering (whirling gyro) and pogo (symposium whirling). Among the launch sets it is clipper-anchored and rotational, the same-side-terminal sibling of swirling.',
  howItComposes:
    'Whirling composes with rotational and non-rotational dexes while contributing its clipper-anchored rotational launch, and the body operators layer on top of it on their own axes: whirling and gyro give blistering, whirling and symposium give pogo. Because whirling is the launch and the body operators are body movements, the two layer without competing, which is why the deeper whirling compounds carry several operators at once.',
  launchNotes:
    'The defining structure is a clipper-anchored set with an opposite-side inward dex and a same-side terminal component, the rotational opening of the whirl family. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged.',
  confusions: [
    {
      heading: 'Whirling vs swirling',
      prose:
        'Whirling and swirling are sibling whirl-family launch sets, but they are different launches. Whirling opens with an opposite-side inward dex resolving to a same-side terminal; swirling opens with an explicit SWIRL-token dex (CLIP > SAME BACK/FRONT SWIRL [DEX]). Separate launch identities, not two names for one launch.',
    },
    {
      heading: 'Whirling vs blazing',
      prose:
        'Holden distinguishes blazing from whirling by terminal side (opposite-side terminal). The platform does not separate them: blazing is treated as a terminal-side variant of whirling, not an independent set.',
    },
    {
      heading: 'Whirling is a launch, not a body movement',
      prose:
        'Whirling is the rotational opening of the trick, scored as a set treatment and written in the set portion of the notation. It is not a spin or turn added to the body after launch.',
    },
    {
      heading: 'Whirling does not replace the base trick',
      prose:
        'A whirling trick is still fundamentally the underlying trick. Whirling sets how it is launched; it does not replace the underlying dexterity or family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on whirl',
    steps: [
      {
        slug:       'whirl',
        addedLabel: 'anchor (no whirling yet)',
        rationale:
          'The whirl dexterity on its own, opened from a stationary set. Whirling will change how the bag is delivered into this same dexterity.',
      },
      {
        slug:       'whirling_whirl',
        addedLabel: '+ whirling',
        rationale:
          'The whirling launch applied to whirl: the clipper-anchored rotational set opens the chain while the whirl itself is unchanged (4 ADD).',
      },
    ],
  },
  representativeTricks: {
    framingLine:
      'These examples illustrate how the same whirling launch opens different trick families.',
    examples: [
      {
        slug:      'whirling_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The whirling launch opening a whirl, the clearest case of the rotational set on its own (4 ADD).',
      },
      {
        slug:      'whirling_butterfly',
        baseLabel: 'Wing family',
        prose:
          'The same whirling launch opening a butterfly; the rotational launch changes while the wing dex is unchanged (4 ADD).',
      },
      {
        slug:      'bling_blang',
        baseLabel: 'Recognizable named trick',
        prose:
          'Bling blang is a named whirling compound (4 ADD).',
      },
      {
        slug:      'whirling_rake',
        baseLabel: 'Rake family',
        prose:
          'Whirling opening a rake (3 ADD).',
      },
      {
        slug:      'whirling_pickup',
        baseLabel: 'Basic dex',
        prose:
          'Whirling opening a pickup, a single-dex base (3 ADD).',
      },
    ],
  },
  relatedConcepts: [
    {
      name:  'swirling',
      prose: 'The SWIRL-token sibling: the same whirl-family rotational launch written with an explicit SWIRL dex. A separate launch identity, useful to contrast against whirling.',
    },
    {
      name:  'blazing',
      prose: 'The opposite-side-terminal reading of whirling. Holden distinguishes it by terminal side; the platform treats it as a variant of whirling.',
    },
    {
      name:  'blistering',
      prose: 'A set system derived from whirling: whirling plus gyro.',
    },
    {
      name:  'pogo',
      prose: 'A set system derived from whirling: symposium whirling.',
    },
  ],
};

const SWIRLING_SET_CONTENT: SetEducationInput = {
  slug:         'swirling',
  displayName:  'Swirling',
  pageSubtitle: 'A clipper-anchored rotational launch set written with an explicit SWIRL dex, the SWIRL-token sibling of whirling, while the dexterity it opens stays the same.',
  definition:
    'Swirling is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a clipper-anchored cross-body rotational set carried by an explicit SWIRL dex token, the opening of the whirl and swirl family. The dexterity is unchanged; what swirling sets is the launch. As a set treatment it contributes +1.',
  whyItExists:
    'Swirling exists to name the clipper-anchored rotational launch written with an explicit SWIRL dex, distinguishing it from a stationary set and from its same-side-terminal sibling whirling. The dexterity is the same; the set records the specific cross-body SWIRL opening, scored independently as a +1 set treatment.',
  howItLaunches:
    'Swirling is the launch itself. The clipper-anchored set opens with a cross-body SWIRL dex, and the bag is delivered into whatever dexterity follows, which stays recognizable: a swirling mirage is still a mirage, a swirling butterfly is still a butterfly. What swirling determines is how the trick is set up and entered, contributing +1 from the set treatment.',
  jobNotation:
    'Swirling lives in the set portion of the notation, at the front of the chain, reading CLIP > SAME BACK/FRONT SWIRL [DEX] >, the cross-body rotational opening with an explicit SWIRL token; the rest of the chain is the unchanged base. So swirling mirage decomposes as swirling(+1) + mirage(2) = 3, the leading SWIRL set carrying the +1 and the trailing dex and terminal carrying the base. This is what marks swirling as a launch rather than a body operator: it is the opening set, not a [BOD] token alongside the dexterity.',
  whereItAppears:
    'Swirling is the SWIRL-token opening of the whirl and swirl family and appears across mirage, butterfly, swirl, whirl, and other bases. Several set systems extend it, including snapping and twisted. Among the launch sets it is clipper-anchored and rotational, the SWIRL-token sibling of whirling.',
  howItComposes:
    'Swirling composes with rotational and non-rotational dexes while contributing its cross-body SWIRL launch, and the body operators layer on top of it on their own axes. Because swirling is the launch and the body operators are body movements, the two layer without competing, which is why the deeper swirling compounds carry several operators at once.',
  launchNotes:
    'The defining structure is a clipper-anchored cross-body rotational set carried by an explicit SWIRL dex, written CLIP > SAME BACK/FRONT SWIRL [DEX]. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged.',
  confusions: [
    {
      heading: 'Swirling vs whirling',
      prose:
        'Swirling and whirling are sibling whirl-family launch sets, but they are different launches. Swirling opens with an explicit SWIRL-token dex (CLIP > SAME BACK/FRONT SWIRL [DEX]); whirling opens with an opposite-side inward dex resolving to a same-side terminal. Separate launch identities, not two names for one launch.',
    },
    {
      heading: 'Swirling is a launch, not a body movement',
      prose:
        'Swirling is the rotational opening of the trick, scored as a set treatment and written in the set portion of the notation. It is not a spin or turn added to the body after launch.',
    },
    {
      heading: 'Swirling does not replace the base trick',
      prose:
        'A swirling trick is still fundamentally the underlying trick. Swirling sets how it is launched; it does not replace the underlying dexterity or family.',
    },
  ],
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
    framingLine:
      'These examples illustrate how the same swirling launch opens different trick families.',
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
      name:  'whirling',
      prose: 'The same-side-terminal sibling: the same whirl-family rotational launch written without the explicit SWIRL token. A separate launch identity, useful to contrast against swirling.',
    },
    {
      name:  'snapping',
      prose: 'A set system derived from swirling.',
    },
    {
      name:  'surfing',
      prose: 'A composite set that carries swirling as its back-swirl dex (fairy symposium swirling).',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — the composite +3 launch sets (FLOATING, SURFING, WARPING)
// ─────────────────────────────────────────────────────────────────────────

const FLOATING_SET_CONTENT: SetEducationInput = {
  slug:         'floating',
  displayName:  'Floating',
  pageSubtitle: 'A composite launch set reading Quantum Symposium Quantum, contributing +3, while the dexterity it opens stays the same.',
  definition:
    'Floating is a composite launch set: it determines how a trick is opened by stacking three set events, rather than adding a movement to the trick itself. It reads Quantum Symposium Quantum, a quantum entry, a no-plant symposium event, and a second quantum. The dexterity is unchanged; what floating sets is the launch. As a set treatment it contributes +3.',
  whyItExists:
    'Floating exists to name a settled composite launch, the Quantum Symposium Quantum stack, as a single set rather than spelling out the expansion on every trick card. Floating-family cards reference this set by a floating-set shorthand. The dexterity is the same; the set records the composite opening, scored as a +3 set treatment.',
  howItLaunches:
    'Floating is the launch itself, a three-event set sequence. The quantum entry, the no-plant symposium event, and the second quantum open the chain, and the bag is delivered into whatever dexterity follows, which stays recognizable: floating butterfly is still a butterfly (the named trick floatation). What floating determines is how the trick is set up and entered, contributing +3 from the composite set treatment.',
  jobNotation:
    'Floating lives in the set portion of the notation, at the front of the chain, reading as the Quantum Symposium Quantum stack; the rest of the chain is the unchanged base. So floating butterfly (the named trick floatation) decomposes as floating(+3) + butterfly(3) = 6, the leading composite set carrying the +3 and the trailing base carrying its own count. This is what marks floating as a launch: it is written as the opening set sequence, not as body tokens inserted alongside the dexterity.',
  whereItAppears:
    'Floating is a composite set and appears on the floating family of compounds. Its butterfly case is the named trick floatation. Because it carries +3, floating compounds sit among the higher-ADD tricks. It is a sibling of the other composite sets such as sailing.',
  howItComposes:
    'Floating is itself a composition of set treatments, Quantum Symposium Quantum, taken as one launch. It opens a base dexterity while contributing its +3, and the trailing base carries its own count. As a composite set it is a worked-out stack rather than a single primitive launch, which is why it is presented as one named set instead of repeating the expansion on each card.',
  launchNotes:
    'The defining structure is the composite set Quantum Symposium Quantum: a quantum entry, a no-plant symposium event, and a second quantum, contributing +3. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged.',
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
    {
      heading: 'Floating does not replace the base trick',
      prose:
        'A floating trick is still fundamentally the underlying trick. Floating sets how it is launched; it does not replace the underlying dexterity or family.',
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
    framingLine:
      'The settled floating compound shows the composite launch on a wing base.',
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
  pageSubtitle: 'A composite launch set reading Fairy Symposium Swirling, contributing +3, while the dexterity it opens stays the same.',
  definition:
    'Surfing is a composite launch set: it determines how a trick is opened by stacking three set events, rather than adding a movement to the trick itself. It reads Fairy Symposium Swirling, a fairy toe-set outward dex, a no-plant symposium body, and a back-swirl dex. The dexterity is unchanged; what surfing sets is the launch. As a set treatment it contributes +3.',
  whyItExists:
    'Surfing exists to name a settled composite launch, the Fairy Symposium Swirling stack, as a single set rather than spelling out the expansion on every trick card. Surfing-family cards reference this set by a surfing-set shorthand. The dexterity is the same; the set records the composite opening, scored as a +3 set treatment.',
  howItLaunches:
    'Surfing is the launch itself, a three-event set sequence. The fairy outward dex, the no-plant symposium body, and the back-swirl dex open the chain, and the bag is delivered into whatever dexterity follows, which stays recognizable: surfing blender is still a blender (the named trick big papa smurf). What surfing determines is how the trick is set up and entered, contributing +3 from the composite set treatment.',
  jobNotation:
    'Surfing lives in the set portion of the notation, at the front of the chain, reading TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] > OP BACK SWIRL [DEX] >, the Fairy Symposium Swirling stack; the rest of the chain is the unchanged base. So surfing blender (the named trick big papa smurf) decomposes as surfing(+3) + blender(4) = 7, the leading composite set carrying the +3 and the trailing base carrying its own count. This is what marks surfing as a launch: it is the opening set sequence, not body tokens inserted alongside the dexterity.',
  whereItAppears:
    'Surfing is a composite set and appears on the surfing family of compounds. Its blender case is the named trick big papa smurf. Because it carries +3, surfing compounds sit among the higher-ADD tricks. It opens with the fairy toe-set entry and carries swirling as its back-swirl dex.',
  howItComposes:
    'Surfing is itself a composition of set treatments, Fairy Symposium Swirling, taken as one launch. It opens a base dexterity while contributing its +3, and the trailing base carries its own count. As a composite set it is a worked-out stack rather than a single primitive launch, which is why it is presented as one named set instead of repeating the expansion on each card.',
  launchNotes:
    'The defining structure is the composite set Fairy Symposium Swirling: a fairy toe-set outward dex, a no-plant symposium body, and a back-swirl dex, contributing +3. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged.',
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
    {
      heading: 'Surfing does not replace the base trick',
      prose:
        'A surfing trick is still fundamentally the underlying trick. Surfing sets how it is launched; it does not replace the underlying dexterity or family.',
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
    framingLine:
      'The settled surfing compound shows the composite launch on a blender base.',
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
      prose: 'The back-swirl dex inside the surfing stack.',
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
  pageSubtitle: 'A two-dex launch set whose second dex is a no-plant symposium event, contributing +3, while the dexterity it opens stays the same.',
  definition:
    'Warping is a composite launch set: it determines how a trick is opened by a two-dex set sequence, rather than adding a movement to the trick itself. The first dex opens the set, and the second dex is carried as a no-plant symposium event. The dexterity that follows is unchanged; what warping sets is the launch. As a set treatment it contributes +3.',
  whyItExists:
    'Warping exists to name a settled two-dex launch, whose second dex is a symposium event, as a single set rather than spelling out the expansion on every trick card. Warping-family cards reference this set by a warping-set shorthand. The dexterity is the same; the set records the composite opening, scored as a +3 set treatment.',
  howItLaunches:
    'Warping is the launch itself, a two-dex set sequence. The first dex opens, the second dex is carried as a no-plant symposium event, and the bag is delivered into whatever dexterity follows, which stays recognizable: warping mirage is still a mirage (the named trick warp). What warping determines is how the trick is set up and entered, contributing +3 from the composite set treatment.',
  jobNotation:
    'Warping lives in the set portion of the notation, at the front of the chain, reading TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX], a first dex followed by a second dex carried as a no-plant symposium event; the rest of the chain is the unchanged base. So warping mirage (the named trick warp) decomposes as warping(+3) + mirage(2) = 5, the leading two-dex set carrying the +3 and the trailing base carrying its own count. This is what marks warping as a launch: it is the opening set sequence, not body tokens inserted alongside the dexterity.',
  whereItAppears:
    'Warping is a composite set and appears on the warping family of compounds. Its mirage case is the named trick warp. Because it carries +3, warping compounds sit among the higher-ADD tricks. It is a sibling of the other composite sets such as sailing.',
  howItComposes:
    'Warping is itself a two-dex set treatment whose second dex is a symposium event, taken as one launch. It opens a base dexterity while contributing its +3, and the trailing base carries its own count. As a composite set it is a worked-out stack rather than a single primitive launch, which is why it is presented as one named set instead of repeating the expansion on each card.',
  launchNotes:
    'The defining structure is a two-dex set whose second dex is a no-plant symposium event, written TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX], contributing +3. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged.',
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
    {
      heading: 'Warping does not replace the base trick',
      prose:
        'A warping trick is still fundamentally the underlying trick. Warping sets how it is launched; it does not replace the underlying dexterity or family.',
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
    framingLine:
      'The settled warping compound shows the composite launch on a mirage base.',
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
  pageSubtitle: 'A toe-anchored launch set that opens a trick from a single opposite-side outward dex, an uptime set worth +1 that determines how the bag is delivered into the dexterity while the dexterity itself stays the same.',
  definition:
    'Atomic is a launch set: it determines how a trick is opened, rather than adding a movement to the trick itself. It opens from a toe set with a single opposite-side outward dex, delivering the bag into the dexterity that follows. The dexterity is unchanged; what atomic sets is the launch. In notation the set reads TOE > OP OUT [DEX], and as an uptime set treatment it contributes +1. Any following dex marked [XDEX] is a separate +1, recorded explicitly in the notation and never inferred from atomic.',
  whyItExists:
    'Atomic exists to name a specific toe-anchored, opposite-side outward launch, separate from a stationary toe set and separate from its inward counterpart quantum, whose dex runs opposite-side inward. Both finish on an opposite-side component; atomic dexes outward where quantum dexes inward. The dexterity is the same either way; the set records the outward-uptime opening, scored independently as a +1 set treatment.',
  howItLaunches:
    'Atomic is the launch itself, not a movement added after launch. The toe set opens with an opposite-side outward dex, and the bag is delivered into whatever dexterity follows, which stays recognizable: an atomic whirl is still a whirl, an atomic butterfly is still a butterfly. What atomic determines is how the trick is set up and entered, contributing +1 from the set treatment, separate from the dexterity count and separate from any X-Dex.',
  jobNotation:
    'Atomic lives in the set portion of the notation, at the front of the chain. An atomic trick opens TOE > OP OUT [DEX] >, the toe set with an opposite-side outward dex; the rest of the chain is the unchanged base. So atomic whirl decomposes as atomic(+1) + whirl(3) = 4, the leading set carrying the +1 and the trailing base carrying the rest. A following dex marked [XDEX] scores its own separate +1: atom smasher, the atomic mirage, reads 4 because it carries an X-Dex, while an atomic trick without one does not.',
  whereItAppears:
    'Atomic is one of the core uptime launch sets and appears across a wide range of bases. Its clearest named case is atom smasher, the atomic mirage. It seeds its own derived set systems, including fairy atomic and neutron, and the tapping set builds on the same toe-anchored opening. Among the launch sets it is the outward-uptime counterpart of quantum, distinct from the clipper-anchored and downtime launches.',
  howItComposes:
    'Atomic composes with almost any dexterity while contributing its outward-uptime launch, and the body operators layer on top of it on their own axes. Because atomic is the launch and operators such as symposium, ducking, and paradox are body movements, the two layer without competing. Atomic also seeds its own derived set systems, where a further set treatment is layered onto the atomic launch.',
  launchNotes:
    'The defining structure is a toe set with a single opposite-side outward dex, written TOE > OP OUT [DEX]. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged. In notation the launch is recorded at the front of the chain, and any X-Dex is a separate [XDEX] token, never part of atomic.',
  confusions: [
    {
      heading: 'Atomic vs quantum',
      prose:
        'Both are toe-anchored uptime launch sets that finish on an opposite-side component, but they open in opposite directions. Atomic opens with an opposite-side outward dex (TOE > OP OUT [DEX]); quantum opens with an opposite-side inward dex (TOE > OP IN [DEX]). They are directional counterparts, separate launch identities, not two names for one launch.',
    },
    {
      heading: 'Atomic vs illusioning',
      prose:
        'Older sources sometimes used illusioning language for atomic, but current doctrine keeps them distinct: illusioning is a downtime move, not another name for the atomic uptime set.',
    },
    {
      heading: 'Atomic is a launch, not a body movement',
      prose:
        'Atomic does not turn, duck, or pivot the body. It determines how the bag is launched into the trick, at the set layer. That is why it is scored as a +1 set treatment and written in the set portion of the notation, not as a body token.',
    },
    {
      heading: 'X-Dex is separate from atomic',
      prose:
        'A following dex marked [XDEX] in the notation scores a separate +1. It is recorded explicitly in the notation, never inferred from atomic or the base, so some atomic tricks read one higher than atomic plus the base alone.',
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
    framingLine:
      'These examples illustrate how the same atomic launch opens different trick families.',
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
          'Atomic opening a butterfly, the outward-uptime launch delivering the bag into the butterfly, 4 ADD.',
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
      name:  'quantum',
      prose: 'The inward counterpart of atomic: the same toe anchor and opposite-side terminal, opened with an inward dex instead of outward. A separate launch identity, useful to contrast against atomic.',
    },
    {
      name:  'nuclear',
      prose: 'A clipper-anchored set that folds a paradox pivot into a downtime illusion dex. A separate launch family, useful to contrast against the single outward uptime dex of atomic.',
    },
    {
      name:  'tapping',
      prose: 'A toe-anchored set built on the same opening; useful for seeing how atomic seeds derived systems.',
    },
    {
      name:  'X-Dex',
      prose: 'The conditional +1 a following dex scores when the notation carries [XDEX]; recorded explicitly, never inferred from atomic. Key to reading atomic ADD totals correctly.',
    },
  ],
};

const QUANTUM_SET_CONTENT: SetEducationInput = {
  slug:         'quantum',
  displayName:  'Quantum',
  pageSubtitle: 'A toe-anchored launch set that opens a trick from a single opposite-side inward dex, an uptime set worth +1 and the inward counterpart of atomic.',
  definition:
    'Quantum is a launch set: it determines how a trick is opened rather than adding a movement to the trick itself. It opens from a toe set with a single opposite-side inward dex, delivering the bag into the dexterity that follows. The dexterity is unchanged; what quantum sets is the launch. In notation the set reads TOE > OP IN [DEX], and as an uptime set treatment it contributes +1. Any following dex marked [XDEX] is a separate +1, recorded explicitly and never inferred from quantum. Its historical name is Toe Blur.',
  whyItExists:
    'Quantum exists to name the inward-uptime toe launch, the directional counterpart of atomic: both open from a toe set and finish on an opposite-side component, but quantum dexes inward where atomic dexes outward. The dexterity is the same either way; the set records the inward-uptime opening, scored independently as a +1 set treatment.',
  howItLaunches:
    'Quantum is the launch itself, not a movement added after launch. The toe set opens with an opposite-side inward dex, and the bag is delivered into whatever dexterity follows, which stays recognizable: a quantum whirl is still a whirl, a quantum mirage is still a mirage. What quantum determines is how the trick is entered, contributing +1 from the set treatment, separate from the dexterity count and any X-Dex.',
  jobNotation:
    'Quantum lives in the set portion of the notation, at the front of the chain. A quantum trick opens TOE > OP IN [DEX] >, the toe set with an opposite-side inward dex; the rest of the chain is the unchanged base. So quantum mirage decomposes as quantum(+1) + mirage(2) = 3, and its historical name is Toe Blur. A following dex marked [XDEX] scores its own separate +1.',
  whereItAppears:
    'Quantum is one of the core uptime launch sets and appears across many bases; its named case quantum mirage is Toe Blur. It seeds the derived set system frantic. Among the launch sets it is the inward-uptime counterpart of atomic and a same-side-terminal sibling of slapping.',
  howItComposes:
    'Quantum composes with almost any dexterity while contributing its inward-uptime launch, and the body operators layer on top of it on their own axes. Because quantum is the launch and operators such as symposium, ducking, and paradox are body movements, the two layer without competing. Quantum also seeds derived systems such as frantic, where a further set treatment is layered onto the quantum launch.',
  launchNotes:
    'The defining structure is a toe set with a single opposite-side inward dex, written TOE > OP IN [DEX]. The set precedes the base dexterity and delivers the bag into it; the dexterity then runs unchanged. In notation the launch is recorded at the front of the chain, and any X-Dex is a separate [XDEX] token.',
  confusions: [
    {
      heading: 'Quantum vs atomic',
      prose:
        'Both are toe-anchored uptime launches that finish on an opposite-side component, but they open in opposite directions. Quantum opens inward (TOE > OP IN [DEX]); atomic opens outward (TOE > OP OUT [DEX]). Directional counterparts, separate launch identities.',
    },
    {
      heading: 'Quantum vs Toe Blur',
      prose:
        'Toe Blur is the historical name for the quantum launch, most familiar as quantum mirage. Same launch, older name; the dictionary keeps quantum as the current term with Toe Blur preserved as history.',
    },
    {
      heading: 'Quantum is a launch, not a body movement',
      prose:
        'Quantum does not turn or pivot the body; it determines how the bag is launched into the trick, at the set layer, scored as a +1 set treatment and written in the set portion of the notation.',
    },
    {
      heading: 'X-Dex is separate from quantum',
      prose:
        'A following dex marked [XDEX] scores a separate +1, recorded explicitly in the notation and never inferred from quantum.',
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
    framingLine:
      'These examples illustrate how the same quantum launch opens different trick families.',
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
          'Quantum opening a butterfly, the inward-uptime launch delivering the bag into the butterfly, 4 ADD.',
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
      name:  'atomic',
      prose: 'The outward counterpart of quantum: the same toe anchor and opposite-side terminal, opened outward instead of inward. A separate launch identity, useful to contrast.',
    },
    {
      name:  'frantic',
      prose: 'A set system derived from quantum, layering a further set treatment onto the quantum launch.',
    },
    {
      name:  'slapping',
      prose: 'A same-side-component sibling of quantum; useful for contrasting the terminal side.',
    },
    {
      name:  'X-Dex',
      prose: 'The conditional +1 a following dex scores when the notation carries [XDEX]; recorded explicitly, key to reading quantum ADD totals.',
    },
  ],
};

const NUCLEAR_SET_CONTENT: SetEducationInput = {
  slug:         'nuclear',
  displayName:  'Nuclear',
  pageSubtitle: 'A clipper-anchored launch set worth +2 that combines a paradox hip pivot with a downtime illusion-style dex.',
  definition:
    'Nuclear is a launch set that folds two movements into one opening: a paradox hip pivot and a downtime illusion-style dex, from a clipper set with a same-side outward dex, delivering the bag into the base that follows. The base is unchanged; what nuclear sets is the launch. In notation the set reads CLIP > SAME OUT [DEX], and as a set treatment it contributes +2, combining paradox and illusion. Any following dex marked [XDEX] is a separate +1, recorded explicitly and never inferred from nuclear.',
  whyItExists:
    'Nuclear exists to name a clipper-anchored opening that combines a paradox hip shift and an illusion-style dex into one +2 set treatment, distinct from the single-dex uptime launches. The base that follows is unchanged; the set records the paradox-plus-illusion opening.',
  howItLaunches:
    'Nuclear is the launch itself, not a movement added after launch. The clipper set opens with a same-side outward dex that carries a paradox hip pivot into an illusion-style motion, and the bag is delivered into whatever base follows, which stays recognizable: a nuclear butterfly is still a butterfly. What nuclear determines is how the trick is entered, contributing +2 from the set treatment, separate from the base count and any X-Dex.',
  jobNotation:
    'Nuclear lives in the set portion of the notation, at the front of the chain: CLIP > SAME OUT [DEX] >. So nuclear butterfly decomposes as nuclear(+2) + butterfly(3) = 5, the leading set carrying the +2 and the trailing base carrying the rest. A following dex marked [XDEX] scores its own separate +1.',
  whereItAppears:
    'Nuclear is a clipper-anchored +2 launch appearing across many bases. Named cases include sumo, the nuclear mirage, and matador, the nuclear butterfly. It seeds the derived set system twinspinning, the nuclear inspinning.',
  howItComposes:
    'Nuclear composes with a range of bases while contributing its paradox-plus-illusion launch, and further body operators layer on top of it on their own axes. Nuclear also seeds derived systems such as twinspinning, where a further set treatment is layered onto the nuclear launch.',
  launchNotes:
    'The defining structure is a clipper set with a same-side outward dex that folds a paradox pivot into an illusion-style motion, written CLIP > SAME OUT [DEX], a +2 set treatment. The set precedes the base and delivers the bag into it; any X-Dex is a separate [XDEX] token.',
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
    {
      heading: 'Nuclear is a launch, not a body movement added later',
      prose:
        'Nuclear determines how the bag is launched, at the set layer, scored as a +2 set treatment and written at the front of the chain, not as a body token layered on after the launch.',
    },
    {
      heading: 'X-Dex is separate from nuclear',
      prose:
        'A following dex marked [XDEX] scores a separate +1, recorded explicitly in the notation and never inferred from nuclear.',
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
    framingLine:
      'These examples illustrate how the same nuclear launch opens different bases.',
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
      name:  'atomic',
      prose: 'A single outward uptime toe set (+1); a related uptime launch, but not a component of nuclear under the paradox-plus-illusion reading. Useful to contrast.',
    },
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
  pageSubtitle: 'A clipper-anchored two-dex uptime set worth +2, opening a trick from an opposite-side inward dex followed by a same-side inward dex.',
  definition:
    'Furious is a launch set built from two dexes: it opens a trick from a clipper set with an opposite-side inward dex, then a same-side inward dex, delivering the bag into the base that follows. The base is unchanged; what furious sets is the launch. In notation the set reads CLIP > OP IN [DEX] > SAME IN [DEX], and as a two-dex uptime set it contributes +2. Its historical name is high stepping.',
  whyItExists:
    'Furious exists to name the two-dex clipper-anchored uptime opening, separate from the single-dex stepping launch. Where stepping opens with one opposite-side inward dex, furious runs two inward dexes before the base, and the set records that doubled opening as a +2 treatment.',
  howItLaunches:
    'Furious is the launch itself, two dexes run before the base. The clipper set opens with an opposite-side inward dex, then a same-side inward dex, and the bag is delivered into whatever base follows, which stays recognizable. What furious determines is how the trick is entered, contributing +2 from the two-dex set treatment, separate from the base count.',
  jobNotation:
    'Furious lives in the set portion of the notation, at the front of the chain, and spans two dexes: CLIP > OP IN [DEX] > SAME IN [DEX] >. So a furious mirage decomposes as furious(+2) + mirage(2) = 4, the leading two-dex set carrying the +2 and the trailing base carrying the rest.',
  whereItAppears:
    'Furious is the two-dex uptime set and appears across many bases; named cases include baroque and fury. Among the launch sets it is the two-dex counterpart of the single-dex stepping launch. Some dictionary trick rows for this set keep barraging-based names for historical name continuity; those names are naming residue, and the set is Furious.',
  howItComposes:
    'Furious composes with a wide range of bases while contributing its two-dex clipper-anchored launch, and the body operators layer on top of it on their own axes. Because furious is the launch and operators such as paradox and symposium are body movements, the two layer without competing.',
  launchNotes:
    'The defining structure is a clipper set with two inward dexes, an opposite-side inward dex then a same-side inward dex, written CLIP > OP IN [DEX] > SAME IN [DEX]. The set precedes the base and delivers the bag into it; the base then runs unchanged.',
  confusions: [
    {
      heading: 'Furious vs Barraging',
      prose:
        'Furious is the canonical set for this two-dex uptime opening. Barraging is not a canonical set. Some dictionary trick rows keep barraging-based names for historical name continuity, but those names are naming residue, not evidence that Barraging is a set; the set taught here is Furious.',
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
    {
      heading: 'Furious is a launch, not a body movement',
      prose:
        'Furious does not turn or pivot the body; it determines how the bag is launched into the trick, at the set layer, scored as a +2 two-dex set treatment and written at the front of the chain.',
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
        slug:       'barraging_mirage',
        addedLabel: '+ furious',
        rationale:
          'The two-dex furious launch applied to mirage, furious(+2) + mirage(2) = 4. This compound is recorded under a legacy barraging-based name, kept for name continuity; the set is Furious.',
      },
    ],
  },
  representativeTricks: {
    framingLine:
      'These examples show the two-dex furious launch opening different bases; some are recorded under legacy barraging-based names kept for name continuity, but the set is Furious.',
    examples: [
      {
        slug:      'barraging_mirage',
        baseLabel: 'Basic dex',
        prose:
          'The furious launch opening a single mirage, the clearest two-dex case, 4 ADD.',
      },
      {
        slug:      'barraging_osis',
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
        slug:      'barraging_butterfly',
        baseLabel: 'Butterfly family',
        prose:
          'The furious launch opening a butterfly, 5 ADD.',
      },
      {
        slug:      'barraging_legover',
        baseLabel: 'Legover family',
        prose:
          'The furious launch opening a legover, furious(+2) + legover(2) = 4.',
      },
    ],
  },
  relatedConcepts: [
    {
      name:  'stepping',
      prose: 'The single-dex clipper-anchored launch; furious is its two-dex counterpart. Useful to contrast the doubled opening.',
    },
    {
      name:  'Barraging',
      prose: 'Not a canonical set. Legacy barraging-based trick names persist for name continuity, but Furious is the set, not Barraging.',
    },
    {
      name:  'barrage',
      prose: 'A separate standalone base, unrelated to the furious two-dex set despite the similar name.',
    },
  ],
};

// Registry — set teaching pages.
const SET_PAGE_CONTENT: Record<string, SetEducationInput> = {
  stepping: STEPPING_SET_CONTENT,
  pixie:    PIXIE_SET_CONTENT,
  fairy:    FAIRY_SET_CONTENT,
  whirling: WHIRLING_SET_CONTENT,
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
// their modifier and trick routes to /freestyle/sets/<slug>. Whirling and
// swirling have authored teaching pages, but they stay listed here precisely
// because their trick route must redirect — unlike dual-role sets such as pixie
// and fairy, which ARE tricks and whose trick page renders normally (only their
// modifier route redirects, via hasSetEducationPage). Their ADD-math layer
// (trick_modifiers, operator reference) is unaffected.
const SET_FIRST_MODIFIER_SLUGS: ReadonlySet<string> = new Set(['whirling', 'swirling']);

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
    pageSubtitle:   input.pageSubtitle,
    definition:     input.definition,
    whyItExists:    input.whyItExists,
    howItLaunches:  input.howItLaunches,
    jobNotation:    input.jobNotation,
    whereItAppears: input.whereItAppears,
    howItComposes:  input.howItComposes,
    launchNotes:    input.launchNotes,
    confusions:     input.confusions,
    progression: {
      anchorBaseLabel: input.progression.anchorBaseLabel,
      steps,
    },
    representativeTricks: {
      framingLine: input.representativeTricks.framingLine,
      examples,
    },
    relatedConcepts: input.relatedConcepts,
  };
}
