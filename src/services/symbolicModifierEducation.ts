/**
 * symbolicModifierEducation.ts
 *
 * Hand-authored educational pages for modifier-family teaching surfaces.
 *
 * Design philosophy:
 *   - These are TEACHING SURFACES, not symbolic report generators.
 *   - Lead with the body and the mechanics; the cohort of tricks is evidence,
 *     not the primary content.
 *   - Coach-like, embodied prose — not engineering-manual.
 *   - "The same idea on other bases" framing for cross-base reach.
 *   - Single template + per-modifier authored content object.
 *   - Each modifier's "common confusions" section reflects its specific
 *     family of confusions (gyro/inspin for spinning; xdex for paradox;
 *     diving/weaving/zulu for ducking).
 *
 * Adding new modifiers: register an object in MODIFIER_PAGE_CONTENT.
 *
 * Definition authority: a Tier-1 operator's "What it is" line is canonical in
 * the operator reference (TIER1_OPERATOR_DEFINITIONS) and is derived at build
 * time, never authored here. Everything pedagogical on these pages (subtitle,
 * why-it-exists, notation teaching, progression, confusions, execution notes)
 * stays authored locally.
 */
import type { FreestyleTrickRow } from '../db/db';
import { glossaryHrefForTerm } from './glossaryAnchors';
import { getTier1OperatorDefinition } from '../content/freestyleOperatorReference';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface ModifierConfusionPair {
  heading:   string;   // e.g., "Spinning vs gyro"
  prose:     string;   // 2-4 sentence explanation
}

export interface ModifierProgressionStep {
  slug:           string;
  modifierAdded:  string;   // e.g., "anchor", "+ spinning", "+ symposium"
  rationale:      string;   // educational; coach-like
}

export interface ModifierCrossBaseExample {
  slug:           string;   // resolved against dict
  baseLabel:      string;   // e.g., "on osis base", "on torque base"
  prose:          string;   // 1-2 sentences describing what changes
}

export interface ModifierRelatedModifier {
  name:           string;   // e.g., "gyro"
  prose:          string;   // 1-sentence relationship description
}

// Per-modifier authored content (input shape; static).
//
// Pages use the concept-first frozen template: the page teaches the concept
// before the execution (Definition / What changes / How it changes / JOB
// notation / Where it appears / Progression / Representative examples / Common
// confusions / Related concepts / Execution notes). Tier-1 operators leave
// `definition` unset and take their canonical definition line from the operator
// reference at build time.
export interface ModifierEducationInput {
  slug:                 string;     // modifier slug; matches route param
  displayName:          string;     // e.g., "Spinning"
  pageTitle:            string;
  pageSubtitle:         string;     // sits below the H1; one-line frame
  // ── Concept-first frozen template (the standard for operator pages) ──
  // What it is. Tier-1 operators leave this unset: their canonical definition
  // line comes from the operator reference at build time. A local value is
  // only for operators without a Tier-1 canonical definition.
  definition?:          string;
  whyItExists?:         string;     // Why it exists (the structural distinction it records, not difficulty)
  howItChangesBase?:    string;     // How <Operator> changes the base trick (operator-first; modifies, never replaces)
  jobNotation?:         string;     // How it is written in JOB notation, and what the notation records
  whereItAppears?:      string;     // Where it appears (composition first, taxonomy after)
  howItComposes?:       string;     // What kinds of structures it naturally combines with
  executionNotes?:      string;     // Execution, last and objective (defining mechanic, not coaching)
  // ── Shared ──
  // Common confusions (2-4 entries)
  confusions:           ModifierConfusionPair[];
  // Section 4: Progression chain (3-5 steps; first is anchor base)
  progression: {
    anchorBaseLabel:    string;   // e.g., "on whirl"
    steps:              ModifierProgressionStep[];
  };
  // Section 5: "The same idea on other bases" (3-6 cross-base examples)
  crossBase: {
    framingLine:        string;   // 1 sentence framing
    examples:           ModifierCrossBaseExample[];
  };
  // Section 6: Related modifiers (2-4)
  relatedModifiers:     ModifierRelatedModifier[];
}

// Per-modifier output shape (dict-row-resolved view-model).
export interface ModifierProgressionStepResolved extends ModifierProgressionStep {
  canonicalName: string;
  adds:          string | null;
  detailHref:    string;
  isAnchor:      boolean;
  stepNumber:    number;
  isPilot:       boolean;
}

export interface ModifierCrossBaseExampleResolved extends ModifierCrossBaseExample {
  canonicalName: string;
  adds:          string | null;
  detailHref:    string;
  isPilot:       boolean;
}

export interface ModifierFamilyPageContent {
  slug:                 string;
  displayName:          string;
  pageTitle:            string;
  pageSubtitle:         string;
  // Concept-first frozen template (present when the page is on the standard).
  definition?:          string;
  whyItExists?:         string;
  howItChangesBase?:    string;
  jobNotation?:         string;
  whereItAppears?:      string;
  howItComposes?:       string;
  executionNotes?:      string;
  confusions:           ModifierConfusionPair[];
  progression: {
    anchorBaseLabel: string;
    steps:           ModifierProgressionStepResolved[];
  };
  crossBase: {
    framingLine: string;
    examples:    ModifierCrossBaseExampleResolved[];
  };
  relatedModifiers:     ModifierRelatedModifier[];
  glossaryHref:         string;
  layerSource:          'observational';
  /** Operator -> base-atom cross-link (spinning -> spin); null when none. Set by
   *  the freestyle service, which owns the atom<->operator map. */
  baseAtom:             { label: string; href: string } | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Authored content — SPINNING (the only modifier authored so far)
// ─────────────────────────────────────────────────────────────────────────

const SPINNING_CONTENT: ModifierEducationInput = {
  slug:        'spinning',
  displayName: 'Spinning',
  pageTitle:   'Spinning',
  pageSubtitle: 'A body-rotation operator: a full-body rotation carried through the dex, with the underlying dexterity unchanged.',
  whyItExists:
    'Spinning exists to distinguish tricks that incorporate a full-body rotational event. The underlying trick remains the same; the operator records that the body rotates while performing it. This rotational event is significant enough to score independently as [BOD].',
  howItChangesBase:
    'Spinning transforms an existing base trick rather than introducing a new dexterity: a whirl becomes a spinning whirl, a mirage becomes a spinning mirage, and the same holds on osis, torque, and other bases. Spinning is applied to an existing trick: the base trick remains recognizable, while the added body rotation changes how that trick is executed. The rotation and the dexterity are independent structural events, so spinning does not change the dex count, and it composes onto many different bases.',
  jobNotation:
    'Spinning is written as SPIN [BOD] in the dex chain: the full-body rotation is recorded as a body event, not a dexterity. By default it is a back-rotation, written (back) SPIN [BOD]. The [BOD] component marks a body-position event, recorded alongside the dex it carries through. The notation captures the rotational body event, and the additional ADD comes from the rotation itself, not from introducing another dexterity, delay, or body relationship.',
  whereItAppears:
    'Spinning can modify many dexterity-based tricks. In practice players meet it on whirls, mirages, osis, and torques, and it stacks readily with other operators, appearing in deep compounds such as montage. In the movement-system map it sits among the midtime body modifiers, the rotations and head movements carried through the dex, rather than among launches or no-plant disciplines.',
  howItComposes:
    'Spinning composes with almost every family while contributing a rotational body event. It applies across uptime and rotational dexes, stacks with the other body operators in deep compounds such as montage, and works alongside its closely related rotational operators gyro and inspinning to cover any orientation or direction of rotation.',
  executionNotes:
    'The body completes a full rotation carried through the dex, returning the bag on the same dexterity rather than on a second contact. The defining event is the rotational body movement, recorded as SPIN [BOD].',
  confusions: [
    {
      heading: 'Spinning vs gyro',
      prose:
        'Spinning and gyro are closely related rotational operators, not separate ideas. Spinning is the default rotational operator; gyro is a rotational operator with a different orientation. Both record a rotational body event scored as a body modifier, not a dexterity.',
    },
    {
      heading: 'Spinning vs inspinning',
      prose:
        'Inspinning is a closely related rotational operator, in the opposite rotational direction: default spinning rotates so the back passes the bag first, while inspinning rotates the other way, so the chest passes first. Both record the same kind of rotational body event, scored +1; they differ in direction, not in kind.',
    },
    {
      heading: 'Rotation vs dexterity',
      prose:
        'Spinning does not add a dexterity. It records a body rotation carried through a dex that is already there, scored +1 as a body event. The dex count is unchanged; the rotation is a separate component alongside it.',
    },
    {
      heading: 'Body event vs body orientation',
      prose:
        'Spinning is a rotational body event, scored where it occurs. It is not the same as a static orientation marker such as same-side or opposite-side, which only describe which side a dex uses. Spinning records a movement; orientation markers record a position.',
    },
    {
      heading: 'Spinning does not replace the base trick',
      prose:
        'A spinning trick is still fundamentally the underlying trick. Spinning modifies how it is executed; it does not replace the underlying dexterity or family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on whirl',
    steps: [
      {
        slug:          'whirl',
        modifierAdded: 'anchor (no spinning yet)',
        rationale:
          'The rotational whirl dex on its own, with the body not yet turning. Spinning will carry the body through this same dex.',
      },
      {
        slug:          'spinning_whirl',
        modifierAdded: '+ spinning',
        rationale:
          'The full-body rotation added to the whirl. The whirl dex is unchanged; the body now turns through it. The clearest single case for the operator.',
      },
      {
        slug:          'spinning_symposium_whirl',
        modifierAdded: '+ symposium',
        rationale:
          'Spinning combined with a no-plant discipline: the body rotates while the support leg stays off the ground through the dex.',
      },
      {
        slug:          'montage',
        modifierAdded: '+ ducking + paradox (montage)',
        rationale:
          'Spinning stacked with three other body operators (ducking, paradox, and symposium) on a whirl. The rotation is still the same component added at the second step.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'These examples illustrate how the same rotational operator composes across different trick families.',
    examples: [
      {
        slug:      'spinning_mirage',
        baseLabel: 'Basic dex',
        prose:
          'Spinning carried through a single mirage dex, the clearest case of the rotation on its own (3 ADD).',
      },
      {
        slug:      'spinning_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The same rotation on a whirl arc: the body turns through the dex while the whirl itself is unchanged (4 ADD).',
      },
      {
        slug:      'spinning_drifter',
        baseLabel: 'Cross-body',
        prose:
          'Spinning on drifter, a miraging-clipper base that travels across the body; the rotation carries through that cross-body travel (4 ADD).',
      },
      {
        slug:      'spinning_symposium_whirl',
        baseLabel: 'Multiple operators',
        prose:
          'Spinning and symposium together: the body rotates while the support leg stays off the ground, two operators on one whirl (5 ADD).',
      },
      {
        slug:      'montage',
        baseLabel: 'Advanced composition',
        prose:
          'Montage reads as spinning, ducking, paradox, and symposium on a whirl (7 ADD). Spinning is one of four body operators stacked together, still the same rotation carried through.',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'gyro',
      prose: 'A closely related rotational operator, with a different orientation. It records a rotational body event, like spinning, not a dexterity.',
    },
    {
      name:  'inspinning',
      prose: 'A closely related rotational operator, in the opposite rotational direction (the chest passes the bag first). The same kind of body event as spinning.',
    },
    {
      name:  'paradox',
      prose: 'A side-switch hip relationship rather than a whole-body turn; a different body region that often stacks with spinning in multi-operator compounds.',
    },
    {
      name:  'symposium',
      prose: 'A no-plant leg discipline. Stacks with spinning in higher-ADD compounds such as montage.',
    },
    {
      name:  'ducking',
      prose: 'A head dip carried through the dex. Another body operator that stacks with spinning, in a different body region.',
    },
    {
      name:  'whirling',
      prose: 'An uptime set system with a rotational character; a rotation in the set layer, distinct from spinning\'s whole-body turn through the dex.',
    },
    {
      name:  'swirling',
      prose: 'A cross-body rotational dex system in the whirl and swirl family: rotation at the dex layer rather than the whole-body rotation that spinning records.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — PARADOX
// ─────────────────────────────────────────────────────────────────────────

const PARADOX_CONTENT: ModifierEducationInput = {
  slug:        'paradox',
  displayName: 'Paradox',
  pageTitle:   'Paradox',
  pageSubtitle: 'An operator that changes the relationship between the body, the support leg, and the dexterity.',
  whyItExists:
    'Paradox exists to distinguish tricks whose dexterity is performed from the opposite body relationship. The dexterity itself is unchanged; what changes is how the body and support leg are positioned relative to it. That structural relationship is significant enough to score independently as [PDX].',
  howItChangesBase:
    'Paradox transforms an existing base trick rather than introducing a new dexterity: a mirage becomes a paradox mirage, a whirl becomes a paradox whirl, and the same holds on torque, blender, and other bases. The dex still happens once; what changes is the side relationship the body holds around it. Paradox is applied to an existing trick: the base trick remains recognizable, and paradox changes the relationship in which that trick is executed. Because it transforms a base rather than adding a contact, it does not change the dex count, and it composes onto many different bases.',
  jobNotation:
    'In operational notation paradox is the [PDX] component, which marks the cross-body far dex that the side-switch produces: the dex crosses the centreline and the body repositions to bring the leg under the bag. [PDX] exists because that repositioning is a scored relationship worth +1, distinct from the dex itself. It is not the same as [XBD]: [XBD] is a cross-body delay, a landing that sits on the opposite-side surface from the plant foot, while [PDX] is a cross-body dex relationship. It is also independent of [XDEX], the conditional X-Dex: applying paradox does not create X-Dex, and when both appear in one trick each records a different structural event. The familiar form CLIP > OP IN [DEX] is the canonical paradox entry example, where an opposite-side clipper set creates the relationship before the first dex, but it is only an example: paradox can also occur mid-trick as a later [PDX] dex, so the entry form is illustrative, not the definition.',
  whereItAppears:
    'Paradox can modify many dexterity-based tricks. In practice players meet it on mirages, whirls, torques, and blenders, and it stacks readily with other operators, most often with symposium as the PS pair. In the movement-system map it is a dex relationship, classed with the side and centreline relationships rather than with launches, rotations, or no-plant disciplines.',
  howItComposes:
    'Paradox composes with almost every dexterity family, but as a relationship change rather than an added contact. It applies across uptime, rotational, and cross-body dexes, stacks with the other body operators (most often symposium, as the PS pair), and is embedded inside several folk-named compounds, such as blur and food processor, without the name.',
  executionNotes:
    'The support leg and the dexterity finish on opposite sides of the centreline from where they began; the body has switched sides around the dex. A trick reads as a paradox only when that side-switch is present on the scored dex. The defining event is the scored paradox relationship, represented by [PDX].',
  confusions: [
    {
      heading: 'Paradox vs cross-body ([XBD])',
      prose:
        'Both involve crossing the centreline, but they are different components. [XBD] is a cross-body delay: a landing that sits on the opposite-side surface from the plant foot. Paradox, marked [PDX], is a cross-body dex relationship: the body switches sides around the dex itself. A trick can carry one, the other, or both.',
    },
    {
      heading: 'Paradox vs X-Dex',
      prose:
        'Paradox and X-Dex are independent notation components. Paradox is the side-switch relationship, worth +1 on any base it transforms; X-Dex is a separate conditional +1 that a far dex scores where the notation carries [XDEX]. Applying paradox does not create X-Dex. The two can appear in the same trick (for example an atomic far whirl that also carries a paradox dex), where each records a different structural event, but one never produces the other.',
    },
    {
      heading: 'Paradox vs same-side and opposite-side',
      prose:
        'Same-side and opposite-side (SAME and OP) describe which side a single dex is performed on. Paradox is the third option in that family: instead of staying same-side or opposite-side, the body switches sides around the dex. It coexists with the SAME and OP markers rather than replacing them.',
    },
    {
      heading: 'The entry example is not the definition',
      prose:
        'The form CLIP > OP IN [DEX] is the canonical paradox entry, but it is only the most common example. Paradox is the side-switch relationship wherever it occurs, including mid-trick as a later [PDX] dex. Defining paradox by the entry formula alone misses every mid-trick case.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:          'mirage',
        modifierAdded: 'anchor (no paradox yet)',
        rationale:
          'The mirage dex on its own, with the body staying on its starting side. Paradox will switch the body across this same dex.',
      },
      {
        slug:          'paradox_mirage',
        modifierAdded: '+ paradox',
        rationale:
          'The cleanest case: the same mirage dex with the side-switch added. A low-ADD compound (3) where the relationship is at its most visible.',
      },
      {
        slug:          'paradox_whirl',
        modifierAdded: '+ paradox on a rotational base',
        rationale:
          'The same relationship on a whirl, showing that the side-switch holds on a rotational dex as readily as on a hippy one.',
      },
      {
        slug:          'paradox_symposium_whirl',
        modifierAdded: '+ symposium (the PS stack)',
        rationale:
          'Paradox combined with a second operator. The body switches sides while the support leg stays off the ground; this is the PS stack.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'The same side-switch relationship, applied different ways. These show that paradox transforms a base rather than belonging to one family.',
    examples: [
      {
        slug:      'paradox_mirage',
        baseLabel: 'Basic dex',
        prose:
          'Paradox on a single mirage dex, the clearest case of the side-switch on its own (3 ADD).',
      },
      {
        slug:      'paradox_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The same relationship on a rotational base: the body switches sides around the whirl arc (4 ADD).',
      },
      {
        slug:      'paradox_drifter',
        baseLabel: 'Cross-body',
        prose:
          'Paradox on drifter, a miraging-clipper base that travels across the body and lands on a cross-body clipper, carrying the side-switch through that travel (4 ADD).',
      },
      {
        slug:      'paradox_symposium_whirl',
        baseLabel: 'Multiple operators',
        prose:
          'Paradox and symposium together (the PS pair): the body switches sides while the support leg stays off the ground, two operators on one whirl (5 ADD).',
      },
      {
        slug:      'food_processor',
        baseLabel: 'Advanced composition',
        prose:
          'Food processor is a blurry blender, and blurry itself decomposes to stepping plus paradox, so paradox is embedded in this recognizable 6-ADD compound, carried without the name.',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'symposium',
      prose: 'The +1 body modifier paradox most often stacks with; the pair is the shorthand PS (Paradox Symposium).',
    },
    {
      name:  'atomic',
      prose: 'A +1 uptime launch set. It stacks with paradox like any modifier, but the two do not combine into nuclear.',
    },
    {
      name:  'miraging',
      prose: 'A +1 uptime dex set; paradox commonly transforms miraging-family bases such as mirage and drifter.',
    },
    {
      name:  'nuclear',
      prose: 'A +2 set that reads as paradox plus a downtime illusion dex. Paradox is one of its two components.',
    },
    {
      name:  'x-dex',
      prose: 'A separate conditional +1, scored only where the notation carries [XDEX] on a far dex. A paradox dex never carries it.',
    },
    {
      name:  'cross-body delay',
      prose: 'The [XBD] component: a landing on the opposite-side surface. It shares the centreline-crossing idea with paradox but marks a landing, not a dex relationship.',
    },
    {
      name:  'whirl',
      prose: 'A common rotational base for paradox; paradox whirl is a core example of the relationship on an arc-shaped dex.',
    },
    {
      name:  'mirage',
      prose: 'The anchor base for learning paradox; paradox mirage is the cleanest single-dex case.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — DUCKING
// ─────────────────────────────────────────────────────────────────────────

const DUCKING_CONTENT: ModifierEducationInput = {
  slug:        'ducking',
  displayName: 'Ducking',
  pageTitle:   'Ducking',
  pageSubtitle: 'A body operator: the player passes beneath the bag, changing the bag\'s path relative to the body, while the underlying trick is unchanged.',
  whyItExists:
    'Ducking exists to record a body movement that changes how the player and the bag interact. The underlying dexterity is unchanged; the operator records that the player passes beneath the bag while performing it. This body event is significant enough to score independently as [BOD]: it contributes DUCK [BOD], not another dexterity, delay, or body relationship.',
  howItChangesBase:
    'Ducking transforms an existing base trick rather than introducing a new dexterity: a whirl becomes a ducking whirl, a mirage becomes a ducking mirage, and the same holds on butterfly, osis, and other bases. Ducking is applied to an existing trick: the underlying trick remains recognizable, while ducking modifies how that trick is executed by inserting the ducking body movement into it. The duck and the dexterity are independent structural events, so ducking does not change the dex count, and it composes onto many different bases.',
  jobNotation:
    'Ducking is written as DUCK [BOD] in the dex chain: the body movement is recorded as a body event, not a dexterity. The [BOD] component marks a body-position event, recorded alongside the dex it accompanies. The notation captures the ducking body event, and the additional ADD comes from the body movement itself, not from a dexterity, a delay, or a body relationship. Treating ducking as merely a head movement understates it: what the notation records is the player passing beneath the bag, scored as its own component.',
  whereItAppears:
    'Ducking composes naturally across many dexterity families: players meet it on whirls, mirages, butterflies, osis, and torques, and it stacks readily with other operators in deep compounds. It anchors a broader ducking family. Ducking is the body operator. Zulu and weaving are launch sets whose launch incorporates the ducking body movement, rather than adding it to an existing trick. Alpine is a folk compositional label for a trick split into uptime and downtime by inserting a duck or dive, not a separate operator. In the movement-system map ducking sits among the midtime body modifiers, the head and body movements carried through the dex.',
  howItComposes:
    'Ducking combines naturally with the dexterity families, applying across uptime, rotational, and cross-body dexes. It stacks with the other body operators, most often spinning and paradox. It also forms the basis for the Zulu and Weaving launch sets, whose launch incorporates the ducking body movement, and it participates in Alpine naming patterns, where a trick is split into uptime and downtime by an inserted duck.',
  executionNotes:
    'The player passes beneath the bag, so the bag travels around the head and neck rather than over a static body. The defining event is the ducking body movement, recorded as DUCK [BOD].',
  confusions: [
    {
      heading: 'Ducking vs diving',
      prose:
        'Ducking and diving are complementary body operators, distinguished by the path. In ducking the player passes beneath the bag; in diving the bag passes over the player. Both score +1 as body events; they differ in the path, not in kind.',
    },
    {
      heading: 'Ducking operator vs zulu and weaving sets',
      prose:
        'Ducking is the body operator, added to an existing trick. Zulu and weaving are launch sets whose launch incorporates the ducking body movement; each is defined on its own set page. The ducking movement is shared; what differs is whether it modifies a trick or defines the launch.',
    },
    {
      heading: 'Ducking vs alpine',
      prose:
        'Alpine is not another body operator. It is a folk naming convention for a trick split into uptime and downtime by inserting a duck or dive in the middle. Alpine Ripwalk, for example, is structurally Stepping Ducking Butterfly. The body operator inside an Alpine trick is still ducking, or diving; Alpine only names the compositional pattern.',
    },
    {
      heading: 'Body event vs dexterity',
      prose:
        'Ducking does not add a dexterity. It records a body movement carried through a dex that is already there, scored +1 as a body event. The dex count is unchanged; the duck is a separate component alongside it.',
    },
    {
      heading: 'Ducking does not replace the base trick',
      prose:
        'A ducking trick is still fundamentally the underlying trick. Ducking modifies how it is executed; it does not replace the underlying dexterity or family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:          'butterfly',
        modifierAdded: 'anchor (no ducking yet)',
        rationale:
          'The butterfly dex on its own, with the player not yet ducking. Ducking will add the body movement around this same dex.',
      },
      {
        slug:          'ducking_butterfly',
        modifierAdded: '+ ducking',
        rationale:
          'The duck added to the butterfly. The wing motion is unchanged; the player now passes beneath the bag during it. The clearest single case for the operator.',
      },
      {
        slug:          'ducking_whirl',
        modifierAdded: '+ ducking on a rotational base',
        rationale:
          'The same duck on a whirl, showing it composes onto a rotational base as readily as onto a wing motion.',
      },
      {
        slug:          'phoenix',
        modifierAdded: '+ pixie (the Pixie Ducking Butterfly stack)',
        rationale:
          'Phoenix is the technical reading Pixie Ducking Butterfly: a pixie set in front of the same duck. Folk single-token names often carry ducking inside them.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'These examples illustrate how the same ducking operator composes across different trick families, including a folk Alpine naming pattern.',
    examples: [
      {
        slug:      'ducking_mirage',
        baseLabel: 'Basic dex',
        prose:
          'Ducking on a single mirage dex, the clearest case of the body movement on its own (3 ADD).',
      },
      {
        slug:      'ducking_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The same duck on a whirl arc: the player passes beneath the bag while the whirl itself is unchanged (4 ADD).',
      },
      {
        slug:      'ducking_drifter',
        baseLabel: 'Cross-body',
        prose:
          'Ducking on drifter, a miraging-clipper base that travels across the body; the duck is carried through that cross-body travel (4 ADD).',
      },
      {
        slug:      'mind_bender',
        baseLabel: 'Multiple operators',
        prose:
          'Mind-bender reads as ducking and paradox on a blender: the duck and the side-switch run together in different body regions (6 ADD).',
      },
      {
        slug:      'gyro_ducking_symposium_torque',
        baseLabel: 'Alpine pattern (folk naming)',
        prose:
          'Known by the folk name Alpine Big Apple. Alpine is not an operator: it is a naming convention for a trick split into uptime and downtime by inserting a duck. The structure here is gyro, ducking, and symposium on a torque, and ducking is the actual body operator (7 ADD).',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'diving',
      prose: 'The sister body operator, distinguished by the bag passing over the player rather than the player passing beneath the bag.',
    },
    {
      name:  'zulu',
      prose: 'A launch set whose launch incorporates the ducking body movement: the bag passes across the body, under the chin, before the duck.',
    },
    {
      name:  'weaving',
      prose: 'A launch set whose launch incorporates the ducking body movement, with the bag caught on the same foot that performed it.',
    },
    {
      name:  'alpine',
      prose: 'A folk compositional label, not an operator: it names a trick split into uptime and downtime by inserting a duck or dive. The body operator inside is still ducking or diving.',
    },
    {
      name:  'spinning',
      prose: 'A whole-body rotation rather than a duck; a different body operator that stacks with ducking in deep compounds such as montage.',
    },
    {
      name:  'paradox',
      prose: 'A side-switch hip relationship; a different body region that often stacks with ducking.',
    },
    {
      name:  'symposium',
      prose: 'A no-plant leg discipline; stacks with ducking in higher-ADD compounds.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — SYMPOSIUM (synthesized from the no-plant doctrine,
// the documented execution, the rooted/antisymposium inverse, and the PS
// stack; example slugs are active canonical rows)
// ─────────────────────────────────────────────────────────────────────────
const SYMPOSIUM_CONTENT: ModifierEducationInput = {
  slug:        'symposium',
  displayName: 'Symposium',
  pageTitle:   'Symposium',
  pageSubtitle: 'A no-plant discipline: the support leg stays off the ground through the dexterity.',
  whyItExists:
    'Symposium exists to distinguish tricks performed without replanting the support foot. The dexterity itself is unchanged; the operator records that the support leg stays off the ground through the dex. This no-plant discipline is significant enough to score independently as [BOD].',
  howItChangesBase:
    'Symposium changes how a dex is supported, not what the dex is: the same kick or stall is performed, but with no plant underneath it, and that constraint is worth +1. The underlying trick remains recognizable; symposium modifies how that trick is executed rather than replacing it. Because it constrains an existing dex rather than adding one, it does not change the dex count and is not itself a dexterity, which is why it composes onto almost any base rather than belonging to a single family. Its defining feature is that the support leg never replants during the dex; replanting converts the move back to its ordinary planted form.',
  jobNotation:
    'Symposium is written by attaching (no plant while) to the dex it modifies, for example SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]. The annotation contributes the [BOD] component alongside the dex, so the notation records a body event rather than a second [DEX]. That placement is the point: the additional ADD comes from holding the no-plant discipline through the dex, not from introducing another dexterity. Reading the [BOD] beside the [DEX] tells you the move is a single dex performed under a body constraint, not two separate moves.',
  whereItAppears:
    'Symposium can modify almost any dexterity-based trick. In practice players meet it on mirages, whirls, torques, eggbeaters, and other dex-based foundations, and it stacks readily with other operators, most often with paradox as the PS pair. In the movement-system map it is the sole member of the No-Plant and Suspension axis. Its whirl case is well known enough to carry its own folk name, pogo.',
  howItComposes:
    'Symposium composes with nearly every dexterity family. Because it attaches to a dex rather than to a base, it applies across uptime, rotational, and cross-body dexes alike, and it stacks with the other body operators (paradox, spinning, ducking) in deep compounds. It does not form its own launch system; its inverse is the rooted, always-planted discipline.',
  executionNotes:
    'The support foot remains off the ground throughout the dex. Replanting before the dex completes removes the symposium discipline, and with it the additional ADD.',
  confusions: [
    {
      heading: 'Symposium vs rooted',
      prose:
        'Symposium and rooted are opposite disciplines on the same axis. Symposium removes the plant, so the support leg stays off the ground. Rooted keeps the setting foot on the ground throughout (an antisymposium constraint). One suspends the move, the other anchors it.',
    },
    {
      heading: 'Symposium vs paradox',
      prose:
        'Both are +1 body modifiers, and they stack so often that the pair has its own shorthand, PS (Paradox Symposium), as in PS Whirl. They are different mechanics: paradox is a hip pivot that switches sides between two dexes, symposium is the no-plant leg discipline. They run at the same time without interfering, which is why PS is two operators, not one.',
    },
    {
      heading: 'Symposium is not a dex',
      prose:
        'Symposium does not add a dexterity and does not change the dex count. It is a discipline applied to a dex already in the chain, scored +1 for removing the plant. This is why it composes onto almost any base rather than belonging to a single family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:          'mirage',
        modifierAdded: 'anchor (no symposium yet)',
        rationale:
          'The in-to-out hippy dex on its own, planted normally. Symposium will hold the support leg off the ground through this same dex.',
      },
      {
        slug:          'symposium_mirage',
        modifierAdded: '+ symposium',
        rationale:
          'The same mirage dex performed with no plant: symposium in isolation, on a low-ADD base (3) where the constraint is easiest to read.',
      },
      {
        slug:          'symposium_whirl',
        modifierAdded: '+ symposium on a rotational base',
        rationale:
          'The same no-plant discipline carried through a whirl, showing that it holds on a rotational dex as readily as on a hippy one.',
      },
      {
        slug:          'paradox_symposium_whirl',
        modifierAdded: '+ paradox (the PS stack)',
        rationale:
          'Symposium combined with a second operator. Paradox switches sides between the dexes while symposium keeps the support leg up throughout; this is the PS stack.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'The same no-plant constraint, used different ways. These show that symposium is compositional rather than tied to one shape.',
    examples: [
      {
        slug:      'symposium_mirage',
        baseLabel: 'Basic dex',
        prose:
          'Symposium on a single hippy-in dex, the clearest case of the no-plant constraint on its own (3 ADD).',
      },
      {
        slug:      'symposium_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The no-plant discipline on a rotational base (4 ADD). This compound is also known by the folk name pogo.',
      },
      {
        slug:      'symposium_torque',
        baseLabel: 'Cross-body',
        prose:
          'Symposium carried through a torque arc, showing the constraint holding on a cross-body rotational dex (5 ADD).',
      },
      {
        slug:      'symposium_eggbeater',
        baseLabel: 'Double dex',
        prose:
          'Symposium on the eggbeater (atomic legover), a two-dex base: the no-plant applies to the dex it annotates within a longer chain (4 ADD).',
      },
      {
        slug:      'witchdoctor',
        baseLabel: 'Multiple operators',
        prose:
          'Witchdoctor reads as atom smasher plus symposium (atomic symposium mirage): symposium stacking with atomic and a far X-Dex, its +1 riding on top (5 ADD).',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'paradox',
      prose: 'The other +1 body modifier it most often stacks with; the pair is the shorthand PS (Paradox Symposium).',
    },
    {
      name:  'rooted',
      prose: 'The inverse discipline: the setting foot stays on the ground throughout (antisymposium), where symposium keeps it off.',
    },
    {
      name:  'spinning',
      prose: 'A body rotation rather than a plant discipline; the two live in different body regions and stack freely.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Authored content — GYRO (a closely related rotational operator alongside
// spinning and inspinning; distinguished by orientation, not amount; folk-aliased as mobius
// on torque; example slugs are active canonical rows)
// ─────────────────────────────────────────────────────────────────────────
const GYRO_CONTENT: ModifierEducationInput = {
  slug:        'gyro',
  displayName: 'Gyro',
  pageTitle:   'Gyro',
  pageSubtitle: 'A rotational operator that changes the body\'s orientation during a trick, while the underlying dexterity stays the same.',
  whyItExists:
    'Gyro exists to distinguish tricks whose body rotation leaves the body in a different orientation than a full spin at the moment the dexterity is performed. The dexterity itself is unchanged; the operator records that the body turns through an approximate half rotation rather than a full one. This rotational event is significant enough to score independently as [BOD].',
  howItChangesBase:
    'Gyro transforms an existing base trick rather than introducing a new dexterity: a torque becomes a gyro torque (the recognizable named trick mobius), a mirage becomes a gyro mirage, and the same holds on whirl, osis, and other dex-bearing bases. The underlying trick remains recognizable; gyro modifies how that trick is executed rather than replacing it, by turning the body during the dexterity. The rotation and the dexterity are independent structural events, so gyro does not change the dex count; what it changes is the orientation of the body at the moment the dexterity is performed.',
  jobNotation:
    'Gyro is written with the rotational body token SPIN [BOD] in the dex chain, the same body component spinning and inspinning use. The [BOD] component records the rotational body event, and the additional ADD comes from that rotation, not from a dexterity, a delay, or a body relationship. What distinguishes gyro from spinning in notation is not a different body component but how the rotation is expressed in the following dexterity: the half rotation orients the body differently at the moment the dex is performed, so gyro mirage reads SAME IN [DEX] where spinning mirage reads OP IN [DEX].',
  whereItAppears:
    'Gyro can modify many dexterity-based tricks. In practice players meet it on torques, mirages, whirls, and other dex-bearing bases, and it stacks readily with other operators. Its torque case is well known enough to carry its own trick name, mobius. In the movement-system map it sits among the midtime body modifiers, the rotations carried through the dex, alongside spinning and inspinning.',
  howItComposes:
    'Gyro composes with almost every dexterity family while contributing a half-rotation body event. A structural consequence follows directly from this: on a base with no dexterity to orient, such as a bare clipper or toe stall, there is nothing for the rotation to change, so gyro and spinning resolve to the same structure; the rotational operators only diverge where there is a dexterity whose orientation the rotation can change. Gyro applies across uptime, rotational, and cross-body dexes, stacks with the other body operators in deep compounds, and works alongside its closely related rotational operators spinning and inspinning to cover any amount and direction of rotation.',
  confusions: [
    {
      heading: 'Gyro vs spinning',
      prose:
        'Gyro and spinning are closely related rotational operators, not separate ideas. Spinning is the default full rotation; gyro is an approximate half rotation, which leaves the body in a different orientation at the moment the dexterity is performed. They combine for any amount of rotation. Both record a rotational body event scored as a body modifier, not a dexterity.',
    },
    {
      heading: 'Gyro vs inspinning',
      prose:
        'Gyro and inspinning vary the same rotational event. Gyro changes how far the body turns (an approximate half rotation rather than a full one); inspinning changes the direction of rotation (the chest passes the bag first rather than the back). Both are the same kind of body event, scored +1.',
    },
    {
      heading: 'Rotation vs dexterity',
      prose:
        'Gyro does not add a dexterity. It records a rotation carried through a dex that is already there, scored +1 as a body event. The dex count is unchanged; the rotation is a separate component alongside it.',
    },
    {
      heading: 'Gyro does not replace the base trick',
      prose:
        'A gyro trick is still fundamentally the underlying trick. Gyro modifies how it is executed; it does not replace the underlying dexterity or family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on whirl',
    steps: [
      {
        slug:          'whirl',
        modifierAdded: 'anchor (no gyro yet)',
        rationale:
          'The rotational whirl dex on its own, with the body not yet turning. Gyro will carry the body through a half turn around this same dex.',
      },
      {
        slug:          'gyro_whirl',
        modifierAdded: '+ gyro',
        rationale:
          'The half rotation added to the whirl. The whirl dex is unchanged; the body now half-turns through it. The clearest single case for the operator.',
      },
      {
        slug:          'gyro_symposium_whirl',
        modifierAdded: '+ symposium',
        rationale:
          'Gyro combined with a no-plant discipline: the body half-turns while the support leg stays off the ground through the dex.',
      },
      {
        slug:          'gyro_ducking_symposium_torque',
        modifierAdded: '+ ducking (deepest stack)',
        rationale:
          'Gyro stacked with ducking and symposium, a deep gyro compound (known by the folk name Alpine Big Apple). The half rotation is still the same component added at the second step.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'These examples illustrate how the same gyro operator composes across different trick families.',
    examples: [
      {
        slug:      'gyro_mirage',
        baseLabel: 'Basic dex',
        prose:
          'Gyro carried through a single mirage dex, the clearest case of the half rotation on its own (3 ADD).',
      },
      {
        slug:      'gyro_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The same half rotation on a whirl arc: the body half-turns through the dex while the whirl itself is unchanged (4 ADD).',
      },
      {
        slug:      'gyro_eggbeater',
        baseLabel: 'Cross-body',
        prose:
          'Gyro on the eggbeater (atomic legover), a cross-body base; the half turn carries the body through the cross-body dex (4 ADD).',
      },
      {
        slug:      'gyro_symposium_mirage',
        baseLabel: 'Multiple operators',
        prose:
          'Gyro and symposium together: the body half-turns while the support leg stays off the ground, two operators on one mirage (4 ADD).',
      },
      {
        slug:      'mobius',
        baseLabel: 'Recognizable named trick',
        prose:
          'Mobius is the canonical gyro torque and the most recognizable gyro compound, a named trick in its own right: the rotation carried through a torque (5 ADD).',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'spinning',
      prose: 'The full-rotation operator closely related to gyro: a complete turn, where gyro is an approximate half turn. Combine the two for any amount of rotation.',
    },
    {
      name:  'inspinning',
      prose: 'The opposite-direction rotational operator (the chest passes the bag first). The same kind of body event as gyro, varied by direction rather than amount.',
    },
    {
      name:  'paradox',
      prose: 'A side-switch hip relationship rather than a body rotation; a different body region that often stacks with gyro.',
    },
    {
      name:  'symposium',
      prose: 'A no-plant leg discipline; stacks with gyro in higher-ADD compounds.',
    },
    {
      name:  'ducking',
      prose: 'A body movement in which the player passes beneath the bag. Another body operator that stacks with gyro, in a different body region.',
    },
    {
      name:  'whirling',
      prose: 'An uptime set system with a rotational character; a rotation in the set layer, distinct from gyro\'s half-rotation body event.',
    },
    {
      name:  'swirling',
      prose: 'A cross-body rotational dex system in the whirl and swirl family: rotation at the dex layer rather than the body rotation that gyro records.',
    },
  ],
  executionNotes:
    'The body turns through an approximate half rotation during the dexterity, returning the bag on the same dexterity. The rotation leaves the body in a different orientation at the moment the dex is performed than a full spin would; on a base with no dexterity, the rotation is indistinguishable from a full spin. The defining event is the rotational body movement, recorded as SPIN [BOD].',
};

// Diving is Ducking's sister operator: same body-operator structure, same
// DIVE [BOD] notation, same composition with the dex families. The pages are
// authored as complements, parallel everywhere except the single defining
// distinction (ducking passes the player beneath the bag; diving sends the
// upper body over the bag and back).
const DIVING_CONTENT: ModifierEducationInput = {
  slug:        'diving',
  displayName: 'Diving',
  pageTitle:   'Diving',
  pageSubtitle: 'A body operator: the bag passes over the player, changing the bag\'s path relative to the body, while the underlying trick is unchanged.',
  whyItExists:
    'Diving exists to record a body movement that changes how the player and the bag interact. The underlying dexterity is unchanged; the operator records that the bag passes over the player while performing it. This body event is significant enough to score independently as [BOD]: it contributes DIVE [BOD], not another dexterity, delay, or body relationship.',
  howItChangesBase:
    'Diving transforms an existing base trick rather than introducing a new dexterity: a whirl becomes a diving whirl, a mirage becomes a diving mirage, and the same holds on butterfly, osis, and other bases. Diving is applied to an existing trick: the underlying trick remains recognizable, while diving modifies how that trick is executed by inserting the diving body movement into it. The dive and the dexterity are independent structural events, so diving does not change the dex count, and it composes onto many different bases.',
  jobNotation:
    'Diving is written as DIVE [BOD] in the dex chain: the body movement is recorded as a body event, not a dexterity. So diving mirage reads SET > DIVE [BOD] > OP IN [DEX] > OP TOE [DEL], the dive recorded alongside the dex it accompanies. The [BOD] component marks a body-position event, and the additional ADD comes from the body movement itself, not from a dexterity, a delay, or a body relationship. Diving shares this notation with ducking, its sister operator; the two are written the same way and differ only in the path: in ducking the player passes beneath the bag, and in diving the bag passes over the player.',
  whereItAppears:
    'Diving composes naturally across many dexterity families: players meet it on whirls, mirages, butterflies, osis, and clippers, and it stacks readily with other operators in deep compounds. It belongs to the same family it shares with ducking, weaving, and zulu, distinguished from ducking by the bag passing over the player rather than the player passing beneath the bag. Alpine is a folk compositional label for a trick split into uptime and downtime by inserting a duck or a dive, not a separate operator. In the movement-system map diving sits among the midtime body modifiers, the head and body movements carried through the dex.',
  howItComposes:
    'Diving combines naturally with the dexterity families, applying across uptime, rotational, and cross-body dexes. It stacks with the other body operators, most often spinning and paradox, and with set treatments such as stepping and pixie. It participates in Alpine naming patterns, where a trick is split into uptime and downtime by an inserted dive, as in the folk name Alpine Tap for a tapping diving mirage.',
  executionNotes:
    'The bag passes over the player during the dex and falls to the same side. The defining event is the diving body movement, recorded as DIVE [BOD].',
  confusions: [
    {
      heading: 'Diving vs ducking',
      prose:
        'Diving and ducking are complementary body operators, distinguished by the path. In diving the bag passes over the player; in ducking the player passes beneath the bag. Both score +1 as body events; they differ in the path, not in kind.',
    },
    {
      heading: 'Diving operator vs the ducking-family sets',
      prose:
        'Diving is a body operator, added to an existing trick; it does not define a launch. Zulu and weaving are launch sets, but their launch incorporates the ducking movement, the sister operator, not diving. Diving shares the head-and-body-arc family with them while remaining an operator applied to a base.',
    },
    {
      heading: 'Diving vs alpine',
      prose:
        'Alpine is not another body operator. It is a folk naming convention for a trick split into uptime and downtime by inserting a duck or a dive in the middle. Alpine Tap, for example, is structurally a tapping diving mirage. The body operator inside an Alpine trick is still diving, or ducking; Alpine only names the compositional pattern.',
    },
    {
      heading: 'Body event vs dexterity',
      prose:
        'Diving does not add a dexterity. It records a body movement carried through a dex that is already there, scored +1 as a body event. The dex count is unchanged; the dive is a separate component alongside it.',
    },
    {
      heading: 'Diving does not replace the base trick',
      prose:
        'A diving trick is still fundamentally the underlying trick. Diving modifies how it is executed; it does not replace the underlying dexterity or family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:          'butterfly',
        modifierAdded: 'anchor (no diving yet)',
        rationale:
          'The butterfly dex on its own, with the upper body not yet diving. Diving will add the body movement around this same dex.',
      },
      {
        slug:          'diving_butterfly',
        modifierAdded: '+ diving',
        rationale:
          'The dive added to the butterfly. The wing motion is unchanged; the upper body now goes over the bag during it. The clearest single case for the operator.',
      },
      {
        slug:          'diving_whirl',
        modifierAdded: '+ diving on a rotational base',
        rationale:
          'The same dive on a whirl, showing it composes onto a rotational base as readily as onto a wing motion.',
      },
      {
        slug:          'darkwalk',
        modifierAdded: '+ pixie (the Pixie Diving Butterfly stack)',
        rationale:
          'Darkwalk is the technical reading Pixie Diving Butterfly: a pixie set in front of the same dive. Folk single-token names often carry diving inside them.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'These examples illustrate how the same diving operator composes across different trick families, including a folk Alpine naming pattern.',
    examples: [
      {
        slug:      'diving_mirage',
        baseLabel: 'Basic dex',
        prose:
          'Diving on a single mirage dex, the clearest case of the body movement on its own (3 ADD).',
      },
      {
        slug:      'diving_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The same dive on a whirl arc: the upper body goes over the bag while the whirl itself is unchanged (4 ADD).',
      },
      {
        slug:      'diving_drifter',
        baseLabel: 'Cross-body',
        prose:
          'Diving on drifter, a miraging-clipper base that travels across the body; the dive is carried through that cross-body travel (4 ADD).',
      },
      {
        slug:      'stepping_diving_mirage',
        baseLabel: 'Multiple operators',
        prose:
          'A stepping launch with a dive added: the stepping set opens the trick and diving runs through the mirage, a set treatment and a body operator on one base (4 ADD).',
      },
      {
        slug:      'tapping_diving_mirage',
        baseLabel: 'Alpine pattern (folk naming)',
        prose:
          'Known by the folk name Alpine Tap. Alpine is not an operator: it is a naming convention for a trick split into uptime and downtime by inserting a dive. The structure here is tapping and diving on a mirage, and diving is the actual body operator (4 ADD).',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'ducking',
      prose: 'The sister body operator, distinguished by the player passing beneath the bag rather than the bag passing over the player. The two are written the same way and differ only in the path.',
    },
    {
      name:  'zulu',
      prose: 'A launch set in the same head-and-body-arc family, whose launch incorporates the ducking movement rather than diving.',
    },
    {
      name:  'weaving',
      prose: 'A launch set in the same family, whose launch incorporates the ducking movement, with the bag caught on the same foot that performed it.',
    },
    {
      name:  'alpine',
      prose: 'A folk compositional label, not an operator: it names a trick split into uptime and downtime by inserting a duck or a dive. The body operator inside is still diving or ducking.',
    },
    {
      name:  'spinning',
      prose: 'A whole-body rotation rather than a dive; a different body operator that stacks with diving in deep compounds.',
    },
    {
      name:  'paradox',
      prose: 'A side-switch hip relationship; a different body region that often stacks with diving.',
    },
    {
      name:  'symposium',
      prose: 'A no-plant leg discipline; stacks with diving in higher-ADD compounds.',
    },
  ],
};

// Tapping is canonically a +1 modifier on the midtime-body axis: the operator
// index classifies it that way intentionally, and the ADD-math derives it as a
// modifier bonus (tapping(+1) + base), the same pattern as the other body-axis
// modifiers. Its mechanic is a quick tap, which the notation writes as a leading
// toe-set dex (TOE > OP OUT [DEX]); the page reconciles the two senses (mechanic
// written as a dex, role scored as a +1 modifier) rather than choosing one. Its
// set entry is Holden-only ("Atomic same-side"), kept as a historical
// cross-reference, not its identity.
const TAPPING_CONTENT: ModifierEducationInput = {
  slug:        'tapping',
  displayName: 'Tapping',
  pageTitle:   'Tapping',
  pageSubtitle: 'A +1 modifier that adds a quick tap ahead of the base trick, leaving the underlying trick recognizable.',
  whyItExists:
    'Tapping exists to distinguish tricks that prepend a quick tap before the base. The base is unchanged; the operator records the short tap performed ahead of it, scored independently as a +1 modifier.',
  howItChangesBase:
    'Tapping transforms an existing base trick by prepending a quick tap: a mirage becomes a tapping mirage, a whirl becomes a tapping whirl, and the same holds on butterfly, clipper, drifter, and other bases. The underlying trick remains recognizable; tapping adds a short toe-set tap ahead of it rather than replacing it, and the base dexterity then follows unchanged. The platform scores the tap as a +1 modifier on the base, the same modifier-bonus pattern the other midtime-body modifiers follow.',
  jobNotation:
    'Tapping mirage decomposes as tapping(+1) + mirage(2) = 3: the tap contributes +1 as a modifier on the base. In the notation that tap appears as the leading TOE > OP OUT [DEX], a quick toe-set dex performed ahead of the base, often with a plant, so tapping mirage reads TOE > OP OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]. The tap is written as a dex because it is a quick dexterity movement, but it is scored as a +1 modifier on the trick, not as an extra dex folded into the base.',
  whereItAppears:
    'Tapping composes across many dexterity families: players meet it on mirages, whirls, clippers, leg-overs, and drifters, and it stacks onto longer compounds. It belongs to the midtime-body modifiers, alongside the spins and the head movements, as the tap treatment of that group. Holden separately reads a tapping launch as an "Atomic same-side" set, a historical and alternative reading rather than tapping\'s identity as a +1 modifier.',
  howItComposes:
    'Tapping composes with almost any base dexterity, prepending its tap ahead of the trick. It applies to uptime, rotational, and cross-body dexes, and it can stack with other treatments on longer compounds. Like the other midtime-body modifiers, it contributes a single +1 to the trick it is added to.',
  executionNotes:
    'A quick toe-set tap is performed ahead of the base trick, often with a plant, and the base dexterity then follows unchanged. The defining event is that added tap, written as the leading TOE > OP OUT [DEX] in the notation and scored as a +1 modifier.',
  confusions: [
    {
      heading: 'Is the tap a dexterity or a modifier?',
      prose:
        'Both, in different senses. The tap is mechanically a quick dexterity movement, and the notation writes it as a short toe-set dex. But the platform scores tapping as a +1 modifier on the base, the same way it scores the spins and the head movements, not as an extra dex folded into the trick. Tapping is a +1 modifier on the midtime-body axis whose mechanic happens to be a tap.',
    },
    {
      heading: 'Tapping vs its Holden set reading',
      prose:
        'Holden records a tapping launch as an "Atomic same-side" set. That is a historical, alternative reading, not the platform identity of tapping, which is an operator that adds a tap dexterity. The set reading is a cross-reference, not a second name for the operator.',
    },
    {
      heading: 'Tapping vs slapping',
      prose:
        'Tapping and slapping are both short toe-set dexes, distinguished by direction. Tapping leads with an outward tap dex; slapping leads with an inward one. They are kin in the toe-set family, not the same treatment.',
    },
    {
      heading: 'Tapping does not replace the base trick',
      prose:
        'A tapping trick is still fundamentally the underlying trick. Tapping adds a tap ahead of it; it does not replace the underlying dexterity or family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:          'butterfly',
        modifierAdded: 'anchor (no tapping yet)',
        rationale:
          'The butterfly dex on its own, with no tap ahead of it. Tapping will prepend a quick dexterity tap before this same dex.',
      },
      {
        slug:          'tapping_butterfly',
        modifierAdded: '+ tapping',
        rationale:
          'The tap added ahead of the butterfly. The wing motion is unchanged; a quick toe-set dex now precedes it. The clearest single case for the operator.',
      },
      {
        slug:          'tapping_whirl',
        modifierAdded: '+ tapping on a rotational base',
        rationale:
          'The same tap ahead of a whirl, showing it prepends onto a rotational base as readily as onto a wing motion.',
      },
      {
        slug:          'tapping_double_leg_over',
        modifierAdded: '+ tapping on a longer base',
        rationale:
          'The tap ahead of a double leg-over, showing it composes onto a longer dex chain while the base stays recognizable.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'These examples illustrate how the same tapping operator prepends its tap across different trick families.',
    examples: [
      {
        slug:      'tapping_mirage',
        baseLabel: 'Basic dex',
        prose:
          'A tap ahead of a single mirage dex, the clearest case of the tap on its own (3 ADD).',
      },
      {
        slug:      'tapping_whirl',
        baseLabel: 'Whirl family',
        prose:
          'The same tap ahead of a whirl arc: the tap precedes the whirl while the whirl itself is unchanged (4 ADD).',
      },
      {
        slug:      'tapping_clipper',
        baseLabel: 'Cross-body',
        prose:
          'A tap ahead of a clipper, a cross-body base; the quick dex precedes the cross-body delay (3 ADD).',
      },
      {
        slug:      'tapping_legover',
        baseLabel: 'Leg-over family',
        prose:
          'A tap ahead of a leg-over: the toe-set tap precedes the leg-over dex (3 ADD).',
      },
      {
        slug:      'tapping_drifter',
        baseLabel: 'Longer compound',
        prose:
          'A tap ahead of drifter, a miraging-clipper base; the tap precedes a base that already travels across the body (4 ADD).',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'ducking',
      prose: 'A midtime-body modifier like tapping, scored the same +1 way; its mechanic is the player passing beneath the bag rather than a tap.',
    },
    {
      name:  'diving',
      prose: 'Another midtime-body modifier, the bag passing over the player rather than a tap; the same +1 modifier role.',
    },
    {
      name:  'slapping',
      prose: 'A short toe-set sibling of tapping in the same family, leading with an inward dex rather than an outward tap.',
    },
    {
      name:  'quantum',
      prose: 'A toe-set system related to tapping\'s toe-set launch, with an inward dex resolving to an op-side terminal.',
    },
    {
      name:  'atomic',
      prose: 'The set Holden equates with the tapping launch, the "Atomic same-side" reading; an alternative reading, not tapping\'s primary identity.',
    },
    {
      name:  'stepping',
      prose: 'A launch set, by contrast: stepping sets how the trick is launched, where tapping adds a tap dexterity ahead of the base.',
    },
  ],
};

const INSPINNING_CONTENT: ModifierEducationInput = {
  slug:        'inspinning',
  displayName: 'Inspinning',
  pageTitle:   'Inspinning',
  pageSubtitle: 'A rotational operator: a full-body rotation in the forward direction, the chest passing the bag first, with the underlying dexterity unchanged.',
  definition:
    'Inspinning is a body-rotation operator: a full-body rotation in the forward direction, where the chest passes the bag first, carried through the dexterity while the dexterity itself is unchanged. It is the opposite direction from spinning, whose default rotation passes the back first. Inspinning, spinning, and gyro are closely related rotational operators that all contribute the same rotational body event, SPIN [BOD], and differ in direction and orientation. It is a +1 body modifier.',
  whyItExists:
    'Inspinning exists to distinguish tricks whose rotation runs in the forward direction, the chest leading past the bag, from the default backward spin. The underlying dexterity is unchanged; the operator records that the body rotates the other way around. This rotational event is significant enough to score independently as [BOD].',
  howItChangesBase:
    'Inspinning transforms an existing base trick rather than introducing a new dexterity: a mirage becomes an inspinning mirage, a butterfly becomes an inspinning butterfly, and the same holds on osis, legover, and other bases. The underlying trick remains recognizable; inspinning modifies how that trick is executed by carrying the body through a forward rotation rather than replacing the dexterity. The rotation and the dexterity are independent structural events, so inspinning does not change the dex count; what it changes is the direction the body turns.',
  jobNotation:
    'Inspinning is written with the rotational body token SPIN [BOD] in the dex chain, the same body component spinning and gyro use, in the forward direction. The [BOD] component records the rotational body event, and the additional ADD comes from that rotation, not from a dexterity, a delay, or a body relationship. What distinguishes inspinning from spinning in notation is not a different body component but the direction of the rotation: inspinning turns the body so the chest passes the bag first, where spinning by default passes the back first.',
  whereItAppears:
    'Inspinning can modify many dexterity-based tricks. In practice players meet it on mirages, butterflies, osis, and leg-overs, and it stacks readily with other operators, including paradox. Its pixie case is recorded as Pixie Inspinning in the legacy reference. In the movement-system map it sits among the midtime body modifiers, the rotations carried through the dex, alongside spinning and gyro.',
  howItComposes:
    'Inspinning composes with almost every dexterity family while contributing a forward-rotation body event. It applies across uptime, rotational, and cross-body dexes, stacks with the other body operators in deep compounds, and works alongside its closely related rotational operators spinning and gyro to cover any orientation and direction of rotation. Where spinning sets the default backward rotation and gyro sets a half-rotation orientation, inspinning sets the forward direction.',
  executionNotes:
    'The body completes a full rotation in the forward direction, the chest passing the bag first, carried through the dex, and the bag returns on the same dexterity. The defining event is the rotational body movement, recorded as SPIN [BOD].',
  confusions: [
    {
      heading: 'Inspinning vs spinning',
      prose:
        'Inspinning and spinning are closely related rotational operators, not separate ideas. Spinning is the default rotation, which passes the back first; inspinning rotates the other way, so the chest passes first. Both record a rotational body event scored as a body modifier, not a dexterity; they differ in direction, not in kind.',
    },
    {
      heading: 'Inspinning vs gyro',
      prose:
        'Inspinning and gyro vary the same rotational event along different axes. Inspinning changes the direction of rotation (the chest passes the bag first); gyro changes how far the body turns (an approximate half rotation rather than a full one). Both are the same kind of body event, scored +1.',
    },
    {
      heading: 'Rotation vs dexterity',
      prose:
        'Inspinning does not add a dexterity. It records a forward rotation carried through a dex that is already there, scored +1 as a body event. The dex count is unchanged; the rotation is a separate component alongside it.',
    },
    {
      heading: 'Inspinning does not replace the base trick',
      prose:
        'An inspinning trick is still fundamentally the underlying trick. Inspinning modifies how it is executed; it does not replace the underlying dexterity or family.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:          'mirage',
        modifierAdded: 'anchor (no inspinning yet)',
        rationale:
          'The mirage dex on its own, with the body not yet turning. Inspinning will carry the body through a forward rotation around this same dex.',
      },
      {
        slug:          'inspinning_mirage',
        modifierAdded: '+ inspinning',
        rationale:
          'The forward rotation added to the mirage. The mirage dex is unchanged; the body now turns the other way around it. The clearest single case for the operator.',
      },
      {
        slug:          'inspinning_butterfly',
        modifierAdded: '+ inspinning on a wing base',
        rationale:
          'The same forward rotation on a butterfly, showing it composes onto a wing motion as readily as onto a basic dex.',
      },
      {
        slug:          'inspinning_paradox_mirage',
        modifierAdded: '+ paradox (multiple operators)',
        rationale:
          'Inspinning combined with a paradox side-switch on a mirage: the forward rotation and the side-switch run together in different body regions.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'These examples illustrate how the same inspinning operator composes across different trick families.',
    examples: [
      {
        slug:      'inspinning_mirage',
        baseLabel: 'Basic dex',
        prose:
          'Inspinning carried through a single mirage dex, the clearest case of the forward rotation on its own (3 ADD).',
      },
      {
        slug:      'inspinning_clipper',
        baseLabel: 'Cross-body',
        prose:
          'The same forward rotation on a clipper, a cross-body base; the body turns the other way while the clipper delay is unchanged (3 ADD).',
      },
      {
        slug:      'inspinning_legover',
        baseLabel: 'Leg-over family',
        prose:
          'Inspinning on a leg-over: the forward rotation is carried through the leg-over dex (3 ADD).',
      },
      {
        slug:      'inspinning_butterfly',
        baseLabel: 'Wing motion',
        prose:
          'The forward rotation on a butterfly: the body turns the other way while the wing motion itself is unchanged (4 ADD).',
      },
      {
        slug:      'inspinning_paradox_mirage',
        baseLabel: 'Multiple operators',
        prose:
          'Inspinning and paradox together: the forward rotation and the side-switch run in different body regions, two operators on one mirage (4 ADD).',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'spinning',
      prose: 'The default-direction member of the closely related rotational operators: a full rotation that passes the back first. Inspinning is the same rotation in the forward direction.',
    },
    {
      name:  'gyro',
      prose: 'A closely related rotational operator, varied by orientation (an approximate half rotation) rather than by direction. The same kind of body event as inspinning.',
    },
    {
      name:  'paradox',
      prose: 'A side-switch hip relationship rather than a body rotation; a different body region that often stacks with inspinning.',
    },
    {
      name:  'symposium',
      prose: 'A no-plant leg discipline; stacks with inspinning in higher-ADD compounds.',
    },
    {
      name:  'ducking',
      prose: 'A body movement in which the player passes beneath the bag. Another body operator that stacks with inspinning, in a different body region.',
    },
    {
      name:  'whirling',
      prose: 'An uptime set system with a rotational character; a rotation in the set layer, distinct from inspinning\'s whole-body rotation.',
    },
    {
      name:  'swirling',
      prose: 'A cross-body rotational dex system in the whirl and swirl family: rotation at the dex layer rather than the whole-body rotation that inspinning records.',
    },
  ],
};

// Registry — modifier-family pedagogy pages.
const MODIFIER_PAGE_CONTENT: Record<string, ModifierEducationInput> = {
  spinning:   SPINNING_CONTENT,
  paradox:    PARADOX_CONTENT,
  ducking:    DUCKING_CONTENT,
  diving:     DIVING_CONTENT,
  symposium:  SYMPOSIUM_CONTENT,
  gyro:       GYRO_CONTENT,
  tapping:    TAPPING_CONTENT,
  inspinning: INSPINNING_CONTENT,
};

// ─────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns true when a modifier-family page exists for the given slug.
 */
export function hasModifierFamilyPage(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODIFIER_PAGE_CONTENT, slug);
}

/**
 * Build the modifier-family page content for a given slug. Resolves dict
 * rows for every progression step + cross-base example. Returns null when
 * the slug has no authored content.
 */
export function buildModifierFamilyPage(
  slug: string,
  allDictRows: readonly FreestyleTrickRow[],
): ModifierFamilyPageContent | null {
  const input = MODIFIER_PAGE_CONTENT[slug];
  if (!input) return null;

  const dictBySlug = new Map<string, FreestyleTrickRow>();
  for (const row of allDictRows) dictBySlug.set(row.slug, row);

  // Resolve progression steps
  const resolvedSteps: ModifierProgressionStepResolved[] = input.progression.steps.map((step, idx) => {
    const row = dictBySlug.get(step.slug);
    return {
      ...step,
      canonicalName: row?.canonical_name ?? step.slug,
      adds:          row?.adds ?? null,
      detailHref:    `/freestyle/tricks/${step.slug}`,
      isAnchor:      idx === 0,
      stepNumber:    idx + 1,
      isPilot:       !!row,   // pilot rendering decision deferred to template
    };
  });

  // Resolve cross-base examples
  const resolvedCrossBase: ModifierCrossBaseExampleResolved[] = input.crossBase.examples.map(ex => {
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
    slug:               input.slug,
    displayName:        input.displayName,
    pageTitle:          input.pageTitle,
    pageSubtitle:       input.pageSubtitle,
    // The canonical Tier-1 definition wins; a local value only covers operators
    // the operator reference does not define.
    definition:         getTier1OperatorDefinition(input.slug)?.definition ?? input.definition,
    whyItExists:        input.whyItExists,
    howItChangesBase:   input.howItChangesBase,
    jobNotation:        input.jobNotation,
    whereItAppears:     input.whereItAppears,
    howItComposes:      input.howItComposes,
    executionNotes:     input.executionNotes,
    confusions:         input.confusions,
    progression: {
      anchorBaseLabel: input.progression.anchorBaseLabel,
      steps:           resolvedSteps,
    },
    crossBase: {
      framingLine: input.crossBase.framingLine,
      examples:    resolvedCrossBase,
    },
    relatedModifiers: input.relatedModifiers,
    glossaryHref:     glossaryHrefForTerm(input.slug),
    layerSource:      'observational',
    // Defaulted null here; the freestyle service overrides with the operator's
    // base-atom cross-link (it owns the atom<->operator map).
    baseAtom:         null,
  };
}
