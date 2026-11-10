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
 *
 * Adding new modifiers: register an object in MODIFIER_PAGE_CONTENT.
 *
 * Definition authority: a Tier-1 operator's "What it is" line is canonical in
 * the operator reference (TIER1_OPERATOR_DEFINITIONS) and is derived at build
 * time, never authored here. Everything pedagogical on these pages (subtitle,
 * how it changes the base trick, progression, examples, related concepts)
 * stays authored locally.
 */
import type { FreestyleTrickRow } from '../db/db';
import { conceptsHrefForTerm } from './conceptsAnchors';
import { getTier1OperatorDefinition } from '../content/freestyleOperatorReference';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface ModifierProgressionStep {
  slug:           string;
  modifierAdded:  string;   // e.g., "anchor", "+ spinning", "+ symposium"
  rationale:      string;   // educational; coach-like
}

export interface ModifierCrossBaseExample {
  slug:           string;   // resolved against dict
  baseLabel:      string;   // e.g., "on osis base", "on torque base"
}

export interface ModifierRelatedModifier {
  name:           string;   // e.g., "gyro"
  prose:          string;   // 1-sentence relationship description
}

// Per-modifier authored content (input shape; static).
//
// Pages use the concept-first frozen template: the page teaches the concept
// through a few short sections (Definition / How it changes the base trick /
// Progression / Representative examples / Related concepts). Tier-1 operators leave
// `definition` unset and take their canonical definition line from the operator
// reference at build time.
export interface ModifierEducationInput {
  slug:                 string;     // modifier slug; matches route param
  displayName:          string;     // e.g., "Spinning"
  pageTitle:            string;
  pageSubtitle:         string;     // sits below the H1; one-line frame
  // Prominent working-model framing rendered under the subtitle. Set where the
  // operational reading is the encyclopedia's consistent model rather than
  // settled community consensus (paradox / cross-body).
  workingModelNote?:    string;
  // ── Concept-first frozen template (the standard for operator pages) ──
  // What it is. Tier-1 operators leave this unset: their canonical definition
  // line comes from the operator reference at build time. A local value is
  // only for operators without a Tier-1 canonical definition.
  definition?:          string;
  howItChangesBase?:    string;     // How <Operator> changes the base trick (operator-first; modifies, never replaces)
  // ── Shared ──
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
  workingModelNote?:    string;
  // Concept-first frozen template (present when the page is on the standard).
  definition?:          string;
  howItChangesBase?:    string;
  progression: {
    anchorBaseLabel: string;
    steps:           ModifierProgressionStepResolved[];
  };
  crossBase: {
    framingLine: string;
    examples:    ModifierCrossBaseExampleResolved[];
  };
  relatedModifiers:     ModifierRelatedModifier[];
  conceptsHref:         string;
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
  pageSubtitle: 'A body-rotation operator: a full-body rotation carried through the middle of the trick, with the underlying trick unchanged.',
  howItChangesBase:
    'Spinning transforms an existing base trick rather than introducing a new dexterity: a whirl becomes a spinning whirl, a mirage becomes a spinning mirage, and the same holds on osis, torque, and other bases. Spinning is applied to an existing trick: the base trick remains recognizable, while the added body rotation changes how that trick is executed. The rotation and the dexterity are independent structural events, so spinning does not change the dex count, and it composes onto many different bases.',
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
      },
      {
        slug:      'spinning_whirl',
        baseLabel: 'Whirl family',
      },
      {
        slug:      'spinning_drifter',
        baseLabel: 'Cross-body',
      },
      {
        slug:      'spinning_symposium_whirl',
        baseLabel: 'Multiple operators',
      },
      {
        slug:      'montage',
        baseLabel: 'Advanced composition',
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
  workingModelNote:
    'The relationships described here are the working model this encyclopedia uses for consistent notation and indexing. Experienced players do not agree on every Paradox and cross-body case, and exceptions or alternate readings exist.',
  howItChangesBase:
    'Paradox transforms an existing base trick rather than introducing a new dexterity: a mirage becomes a paradox mirage, a whirl becomes a paradox whirl, and the same holds on torque, blender, and other bases. The dex still happens once; what changes is the side relationship the body holds around it. Paradox is applied to an existing trick: the base trick remains recognizable, and paradox changes the relationship in which that trick is executed. Because it transforms a base rather than adding a contact, it does not change the dex count, and it composes onto many different bases.',
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
      },
      {
        slug:      'paradox_whirl',
        baseLabel: 'Whirl family',
      },
      {
        slug:      'paradox_drifter',
        baseLabel: 'Cross-body',
      },
      {
        slug:      'paradox_symposium_whirl',
        baseLabel: 'Multiple operators',
      },
      {
        slug:      'food_processor',
        baseLabel: 'Advanced composition',
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
      prose: 'Descriptive mirage-family language for the inward standalone movement, not a launch set and not a scored operator; paradox commonly transforms mirage-family bases such as mirage and drifter.',
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
      name:  'cross-body traversal',
      prose: 'The [XBD] component records a cross-body landing across the centreline, independent of SAME/OP. It marks body configuration or traversal, not the paradox relationship on a dexterity.',
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
  howItChangesBase:
    'Ducking transforms an existing base trick rather than introducing a new dexterity: a whirl becomes a ducking whirl, a mirage becomes a ducking mirage, and the same holds on butterfly, osis, and other bases. Ducking is applied to an existing trick: the underlying trick remains recognizable, while ducking modifies how that trick is executed by inserting the ducking body movement into it. The duck and the dexterity are independent structural events, so ducking does not change the dex count, and it composes onto many different bases.',
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
      },
      {
        slug:      'ducking_whirl',
        baseLabel: 'Whirl family',
      },
      {
        slug:      'ducking_drifter',
        baseLabel: 'Cross-body',
      },
      {
        slug:      'mind_bender',
        baseLabel: 'Multiple operators',
      },
      {
        slug:      'gyro_ducking_symposium_torque',
        baseLabel: 'Alpine pattern (folk naming)',
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
  howItChangesBase:
    'Symposium changes how a dex is supported, not what the dex is: the same kick or stall is performed, but with no plant underneath it, and that constraint is worth +1. The underlying trick remains recognizable; symposium modifies how that trick is executed rather than replacing it. Because it constrains an existing dex rather than adding one, it does not change the dex count and is not itself a dexterity, which is why it composes onto almost any base rather than belonging to a single family. Its defining feature is that the support leg never replants during the dex; replanting converts the move back to its ordinary planted form.',
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
      },
      {
        slug:      'symposium_whirl',
        baseLabel: 'Whirl family',
      },
      {
        slug:      'symposium_torque',
        baseLabel: 'Cross-body',
      },
      {
        slug:      'symposium_eggbeater',
        baseLabel: 'Double dex',
      },
      {
        slug:      'witchdoctor',
        baseLabel: 'Multiple operators',
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
  howItChangesBase:
    'Gyro transforms an existing base trick rather than introducing a new dexterity: a torque becomes a gyro torque (the recognizable named trick mobius), a mirage becomes a gyro mirage, and the same holds on whirl, osis, and other dex-bearing bases. The underlying trick remains recognizable; gyro modifies how that trick is executed rather than replacing it, by turning the body during the dexterity. The rotation and the dexterity are independent structural events, so gyro does not change the dex count; what it changes is the orientation of the body at the moment the dexterity is performed.',
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
      },
      {
        slug:      'gyro_whirl',
        baseLabel: 'Whirl family',
      },
      {
        slug:      'gyro_eggbeater',
        baseLabel: 'Cross-body',
      },
      {
        slug:      'gyro_symposium_mirage',
        baseLabel: 'Multiple operators',
      },
      {
        slug:      'mobius',
        baseLabel: 'Recognizable named trick',
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
  howItChangesBase:
    'Diving transforms an existing base trick rather than introducing a new dexterity: a whirl becomes a diving whirl, a mirage becomes a diving mirage, and the same holds on butterfly, osis, and other bases. Diving is applied to an existing trick: the underlying trick remains recognizable, while diving modifies how that trick is executed by inserting the diving body movement into it. The dive and the dexterity are independent structural events, so diving does not change the dex count, and it composes onto many different bases.',
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
      },
      {
        slug:      'diving_whirl',
        baseLabel: 'Whirl family',
      },
      {
        slug:      'diving_drifter',
        baseLabel: 'Cross-body',
      },
      {
        slug:      'stepping_diving_mirage',
        baseLabel: 'Multiple operators',
      },
      {
        slug:      'tapping_diving_mirage',
        baseLabel: 'Alpine pattern (folk naming)',
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
  howItChangesBase:
    'Tapping transforms an existing base trick by prepending a quick tap: a mirage becomes a tapping mirage, a whirl becomes a tapping whirl, and the same holds on butterfly, clipper, drifter, and other bases. The underlying trick remains recognizable; tapping adds a short toe-set tap ahead of it rather than replacing it, preserving the recognizable base identity. Because SAME/OP is component-relative, the inserted tapping dex can re-author a downstream base component\'s side coordinate: in Tapdown, the Butterfly dex is encoded as SAME OUT rather than its standalone OP OUT coordinate because the inserted tapping dex becomes the most recent side-bearing reference. The leg relation changes; the OUT direction does not. The platform scores the tap as a +1 modifier on the base, the same modifier-bonus pattern the other midtime-body modifiers follow.',
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
      },
      {
        slug:      'tapping_whirl',
        baseLabel: 'Whirl family',
      },
      {
        slug:      'tapping_clipper',
        baseLabel: 'Cross-body',
      },
      {
        slug:      'tapping_legover',
        baseLabel: 'Leg-over family',
      },
      {
        slug:      'tapping_drifter',
        baseLabel: 'Longer compound',
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
      prose: 'The set a historical compilation equates with the tapping launch, the "Atomic same-side" reading; an alternative reading, not tapping\'s primary identity.',
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
  howItChangesBase:
    'Inspinning transforms an existing base trick rather than introducing a new dexterity: a mirage becomes an inspinning mirage, a butterfly becomes an inspinning butterfly, and the same holds on osis, legover, and other bases. The underlying trick remains recognizable; inspinning modifies how that trick is executed by carrying the body through a forward rotation rather than replacing the dexterity. The rotation and the dexterity are independent structural events, so inspinning does not change the dex count; what it changes is the direction the body turns.',
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
      },
      {
        slug:      'inspinning_clipper',
        baseLabel: 'Cross-body',
      },
      {
        slug:      'inspinning_legover',
        baseLabel: 'Leg-over family',
      },
      {
        slug:      'inspinning_butterfly',
        baseLabel: 'Wing motion',
      },
      {
        slug:      'inspinning_paradox_mirage',
        baseLabel: 'Multiple operators',
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
    workingModelNote:   input.workingModelNote,
    // The canonical Tier-1 definition wins; a local value only covers operators
    // the operator reference does not define.
    definition:         getTier1OperatorDefinition(input.slug)?.definition ?? input.definition,
    howItChangesBase:   input.howItChangesBase,
    progression: {
      anchorBaseLabel: input.progression.anchorBaseLabel,
      steps:           resolvedSteps,
    },
    crossBase: {
      framingLine: input.crossBase.framingLine,
      examples:    resolvedCrossBase,
    },
    relatedModifiers: input.relatedModifiers,
    conceptsHref:     conceptsHrefForTerm(input.slug),
    layerSource:      'observational',
    // Defaulted null here; the freestyle service overrides with the operator's
    // base-atom cross-link (it owns the atom<->operator map).
    baseAtom:         null,
  };
}
