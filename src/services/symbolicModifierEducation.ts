/**
 * symbolicModifierEducation.ts
 *
 * Hand-authored educational pages for modifier-family teaching surfaces.
 * Per UX-SHIP-1 Phase 6 (Task D), pilot scope: spinning only.
 *
 * Design philosophy (carried forward from the Phase 6 design conversation):
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
 * Phase 6 ships ONLY spinning so the pedagogy framework can be validated
 * before extension to paradox + ducking.
 */
import type { FreestyleTrickRow } from '../db/db';

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
export interface ModifierEducationInput {
  slug:                 string;     // modifier slug; matches route param
  displayName:          string;     // e.g., "Spinning"
  pageTitle:            string;
  pageSubtitle:         string;     // sits below the H1; one-line frame
  // Section 1: Mechanical lead
  mechanicalLead: {
    whereTheMotionLives:  string;
    whenItHappens:        string;
    whatItFeelsLike:      string;
    commonFailure:        string;
  };
  // Section 2: Anchor sentence
  anchorSentence:       string;
  // Section 2.5: Diagram placeholder caption
  diagramPlaceholder:   string;
  // Section 3: Common confusions (2-4 entries)
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
  mechanicalLead:       ModifierEducationInput['mechanicalLead'];
  anchorSentence:       string;
  diagramPlaceholder:   string;
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
}

// ─────────────────────────────────────────────────────────────────────────
// Authored content — SPINNING (the only modifier shipped in Phase 6)
// ─────────────────────────────────────────────────────────────────────────

const SPINNING_CONTENT: ModifierEducationInput = {
  slug:        'spinning',
  displayName: 'Spinning',
  pageTitle:   'Spinning',
  pageSubtitle: 'A full-body rotation that carries through the dex moment.',
  mechanicalLead: {
    whereTheMotionLives:
      'The core and hips drive the turn. The kicking foot follows along the rotation’s arc rather than reaching independently — the foot’s path is whatever the rotating body brings it to.',
    whenItHappens:
      'The spin IS the dex. It is not before the kick and not after. When the rotation finishes only after the foot has met the bag, you are chasing the bag rather than carrying it.',
    whatItFeelsLike:
      'Good execution feels like the body opens away from the bag’s path early; by the time the foot meets the bag, the rotation is already carrying through. There is one motion, not two.',
    commonFailure:
      'The rotation arrives late. The kick happens, then the spin catches up. That reads as a kick AND a spin — not a spinning kick.',
  },
  anchorSentence:
    'The body turns completely around during the dex, carrying the bag through the rotation rather than chasing it afterward.',
  diagramPlaceholder:
    'Rotation-path illustration — body arc + foot path during the dex. Diagram planned.',
  confusions: [
    {
      heading: 'Spinning vs gyro',
      prose:
        'Spinning is a full turn (360°). Gyro is a half turn (180°). The two terms combine for arbitrary degrees — spinning-gyro is 540°, double-spinning is 720°. When someone says "gyro," they mean half; "spinning" means full.',
    },
    {
      heading: 'Spinning vs inspin',
      prose:
        'Default spinning is a backspin: the body turns away from the bag, so your back passes the bag first. Inspin reverses that — your chest passes the bag first. The "in-" prefix can attach to any rotation term to flip its direction. In-vortex, for example, means in-gyro drifter.',
    },
    {
      heading: 'Spinning vs other body modifiers',
      prose:
        'Spinning is whole-body rotation. Ducking is a head dip. Paradox is a hip pivot. Symposium is a no-plant leg discipline. They often stack together — montage carries all four — but each lives in a different body region. Spinning never collapses into any of them.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on whirl',
    steps: [
      {
        slug:          'whirl',
        modifierAdded: 'anchor (no spinning yet)',
        rationale:
          'Learn the rotational arc first. Whirl is the dex shape that spinning will later carry through. Without the arc, the spin has nothing to anchor against.',
      },
      {
        slug:          'spinning-whirl',
        modifierAdded: '+ spinning',
        rationale:
          'Add the full-body rotation to the whirl arc. Same kick path; the body now turns through the dex moment. This is the strongest single teaching case for the modifier — one new variable, one mechanical change.',
      },
      {
        slug:          'spinning-symposium-whirl',
        modifierAdded: '+ symposium',
        rationale:
          'Add a no-plant body discipline on top. The support leg stays off the ground during the spinning dex. The spin is doing the same job; the lower body is doing more.',
      },
      {
        slug:          'montage',
        modifierAdded: '+ paradox + ducking (flagship; five components)',
        rationale:
          'Spinning combined with paradox, symposium, AND ducking on the whirl base. Five-component compound; the spinning is still recognizably the same motion you learned at step two — it is just now stacked with three other body disciplines.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'The spinning motion is the same in each of these — what changes is the shape of the dex it carries through.',
    examples: [
      {
        slug:      'spinning-osis',
        baseLabel: 'on osis base',
        prose:
          'The same rotation, applied to an osis arc instead of a whirl arc. The body carries through the same way; the dex itself reaches further.',
      },
      {
        slug:      'spinning-torque',
        baseLabel: 'on torque base',
        prose:
          'Spinning applied to a torque base. This compound is the canonical reading of the trick known as mobius — the same body rotation, different anchor mechanics.',
      },
      {
        slug:      'spinning-clipper',
        baseLabel: 'on clipper-stall base',
        prose:
          'A smaller compound; useful as a low-ADD case for practicing the rotation without a complex dex to manage at the same time.',
      },
      {
        slug:      'spender',
        baseLabel: 'on blender base, with paradox',
        prose:
          'Spinning paired with paradox on a blender base. Two body modifiers running together — the rotation carries through, while the hip pivot of paradox sets up the cross-body recovery.',
      },
      {
        slug:      'surge',
        baseLabel: 'on mirage base, with stepping',
        prose:
          'Folk vocabulary calls this combination "surging" — spinning plus a stepping foot relocation, applied to mirage. The rotation is one of two simultaneous body disciplines.',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'gyro',
      prose: 'The half-rotation sibling (180°). Combine with spinning for any degree of rotation.',
    },
    {
      name:  'inspinning',
      prose: 'Direction-flipped spinning: the chest passes the bag first instead of the back.',
    },
    {
      name:  'paradox',
      prose: 'A different body region — hip pivot rather than whole-body turn. Often pairs with spinning in multi-modifier compounds.',
    },
    {
      name:  'symposium',
      prose: 'A different concept again — no-plant leg discipline. Pairs with spinning in higher-ADD compounds like montage.',
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
  pageSubtitle: 'A hip pivot between two dexes — the same set returning to the same foot, with the body changing sides in between.',
  mechanicalLead: {
    whereTheMotionLives:
      'The hips. Paradox is a hip pivot that happens BETWEEN two dex moments — not during a single dex like spinning, and not before the kick like a body modifier that sets up. The legs do not relocate; the body does.',
    whenItHappens:
      'After the first dex meets the bag and before the second dex meets it. The pivot lives in the gap. If the pivot collapses into one of the dexes, the trick reads as a kick-and-twist rather than two dexes joined by a hip move.',
    whatItFeelsLike:
      'Two distinct contact moments with a clean weight shift between them. The first dex sends; the hip flips the body across; the second dex receives. The set comes back to the same foot it left from, but the body the foot belongs to is now facing the other way.',
    commonFailure:
      'The pivot rides the second dex instead of preceding it. That reads as one fast dex with a body wobble, not as a paradox. The clue is timing: when an observer cannot point to the moment between the two dexes, the modifier has not been executed.',
  },
  anchorSentence:
    'The body pivots at the hips between two dexes on the same set, so the set leaves and returns to the same foot while the body changes sides in between.',
  diagramPlaceholder:
    'Hip-pivot diagram — body position at dex 1 / mid-pivot / dex 2. Diagram planned.',
  confusions: [
    {
      heading: 'Paradox vs xdex',
      prose:
        'Paradox and xdex describe the same hip-pivot motion idea. Paradox is the universal version (+1 ADD on any base); xdex is a narrow named-trick version reserved for specific toe-set compounds. As a rule, paradox lives on clipper-set tricks (the XBD category) and xdex on toe-set tricks. When in doubt, the modifier you want is paradox.',
    },
    {
      heading: 'Paradox vs symposium',
      prose:
        'Both are +1 body modifiers and they often stack ("PS X" = Paradox Symposium X — PS Whirl, PS Mirage). The body region differs: paradox is a hip pivot between dexes; symposium is a no-plant discipline that keeps the support leg in the air. They run simultaneously without interfering; the foot still pivots through the paradox while the support leg stays off the ground for the symposium.',
    },
    {
      heading: 'Paradox vs spinning',
      prose:
        'Spinning is whole-body rotation — the entire body turns once during a single dex. Paradox is a hip pivot between two dexes — only the body shifts sides, and it happens in the GAP between the two contact moments. Spinning fills a single dex; paradox fills the space between two.',
    },
    {
      heading: 'Paradox as a hidden modifier',
      prose:
        'Several folk-named tricks have paradox embedded in their canonical reading without "paradox" in the name. Blur is stepping + paradox + mirage (4 ADD). Fury is furious + paradox + mirage (5 ADD). Nuclear (matador, sumo, hurl, barfry) is paradox + atomic. When a trick name does not carry the modifier word but contains the motion, the symbolic-grammar layer makes that explicit.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on mirage',
    steps: [
      {
        slug:          'mirage',
        modifierAdded: 'anchor (no paradox yet)',
        rationale:
          'Learn the in-to-out hippy-dex first. Mirage IS the dex shape that paradox will later pivot between two of. Without the dex, there is nothing for the hip pivot to live between.',
      },
      {
        slug:          'paradox-mirage',
        modifierAdded: '+ paradox',
        rationale:
          'The cleanest paradox case. Same set, same foot, two mirage-shaped dexes joined by a hip pivot. One new variable — the pivot — and a low-ADD compound where the mechanic is at its most visible.',
      },
      {
        slug:          'paradox-whirl',
        modifierAdded: '+ paradox on a rotational base',
        rationale:
          'Same hip pivot, different dex shape. The whirl base is a rotational arc rather than a hippy-in motion, so the pivot now sits between two arc-shaped dexes. The modifier is doing the same job; the dex it pivots between has changed.',
      },
      {
        slug:          'paradox-symposium-whirl',
        modifierAdded: '+ symposium (the "PS Whirl" stack)',
        rationale:
          'Two body modifiers running simultaneously. Paradox is still the hip pivot between two dexes; symposium keeps the support leg off the ground throughout. Folk shorthand calls this PS X — the most common paradox stack in the corpus.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'The hip pivot is the same in each of these — what changes is the shape of the two dexes it joins.',
    examples: [
      {
        slug:      'paradox-drifter',
        baseLabel: 'on drifter base',
        prose:
          'Paradox applied to drifter. The drifter base is a miraging-clipper arc, so the pivot now joins two arc-shaped dexes with travel. Same hip motion; the two dexes it joins move across the body.',
      },
      {
        slug:      'paradox-blender',
        baseLabel: 'on blender base',
        prose:
          'Paradox on blender. Blender is a whirling-osis canonical reading, so the dexes it joins are rotational. Combining rotational dexes with a hip pivot is one of the higher-ADD paradox cases for good reason — the body has to turn AND switch sides without either motion contaminating the other.',
      },
      {
        slug:      'paradox-torque',
        baseLabel: 'on torque base',
        prose:
          'Paradox on torque. The dex shape is again rotational, so the pivot joins two torque arcs. This compound is one of the workhorses of the high-ADD paradox cohort — Jim Penske and Norek hold long-form records on it.',
      },
      {
        slug:      'blur',
        baseLabel: 'on mirage base, with stepping (folk name)',
        prose:
          'Blur is the canonical decomposition stepping + paradox + mirage. The paradox is the same hip pivot you learned on paradox-mirage; the stepping adds a foot relocation. A folk single-token name that contains paradox without saying so.',
      },
      {
        slug:      'fury',
        baseLabel: 'on mirage base, with furious (folk name)',
        prose:
          'Fury is the canonical decomposition furious + paradox + mirage (5 ADD). Same paradox pivot again; furious is the +2 set treatment that lifts the trick to 5 ADD. Another folk name with paradox embedded.',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'xdex',
      prose: 'The narrow sibling of paradox: same hip-pivot motion idea, but reserved for specific toe-set compounds instead of universal +1.',
    },
    {
      name:  'symposium',
      prose: 'The other +1 body modifier. Often stacks with paradox; the shorthand "PS" means Paradox Symposium.',
    },
    {
      name:  'atomic',
      prose: 'Combined with paradox, atomic produces the nuclear set (+2). Nuclear is the structural reading of matador, sumo, hurl, and barfry.',
    },
    {
      name:  'stepping',
      prose: 'A foot-relocation modifier. Stacked with paradox on mirage, it produces the canonical reading of blur.',
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
  pageSubtitle: 'A head dip that lets the bag pass around the neck — one member of a four-way family of head-motion modifiers.',
  mechanicalLead: {
    whereTheMotionLives:
      'The head and neck. The shoulders move along for balance, but the body stays largely where it is; the head dips out of the bag\'s path and the bag passes around it. Picture the bag tracing a small arc around the side of the neck while the chest and hips remain centered.',
    whenItHappens:
      'Between two dexes, while the bag is in the air. The head moves toward the bag\'s line and dips before the second dex meets it. If the head dips after the bag has already cleared, the modifier is not present — the body just bobbed.',
    whatItFeelsLike:
      'The bag goes one way; the head goes toward where the bag was. There is a moment where the head and the bag are close enough that the dip is recognizably a duck, not a lean. The bag emerges on the opposite side of the head from where the head was moving.',
    commonFailure:
      'The whole upper body leans instead of just the head dipping. That reads as a body-tilt, not a duck — the bag is no longer tracing an arc around the neck; it is just falling past a leaning body. The motion has to be local to the head.',
  },
  anchorSentence:
    'The head moves toward the bag and dips while the bag passes around the neck; the rest of the body continues through the trick largely unmoved.',
  diagramPlaceholder:
    'Head-motion 2×2 diagram — head direction × side the bag falls. Diagram planned.',
  confusions: [
    {
      heading: 'The four head-motion siblings (ducking / weaving / diving / zulu)',
      prose:
        'The ducking family is a 2×2 matrix. Two questions: does the head move TOWARD the bag, or OVER and under it? And does the bag fall on the OPPOSITE side from the head\'s motion, or the SAME side? Ducking = head toward bag, bag opposite. Weaving = head toward bag, bag same side. Diving = head over and under bag, bag same side. Zulu = head over and under bag, bag opposite. All four are +1 body modifiers; which one you have depends on the two answers.',
    },
    {
      heading: 'Ducking vs other body modifiers',
      prose:
        'Ducking is a head/neck movement. Paradox is a hip pivot. Spinning is a whole-body rotation. Symposium is a no-plant leg discipline. Each body modifier lives in a different body region, and stacking them is mostly additive — the head dips while the hips pivot while the body turns. Montage carries spinning, paradox, symposium, AND ducking on the whirl base.',
    },
    {
      heading: 'Ducking as a hidden modifier',
      prose:
        'Several tricks contain ducking in their canonical reading without the word "ducking" in the trick name. Phoenix is pixie + ducking + butterfly — the technical-name reading is "Pixie Ducking Butterfly." Mind-bender, mullet, gauntlet, and montage all list as members of the ducking-family by modifier link, even though the head-dip is buried inside a compound name. The Alpine modifier is a meta-operator: Alpine X means "take X, divide it between uptime and downtime, and insert a duck or dive in the middle" — so Alpine Ripwalk is structurally Stepping Ducking Butterfly.',
    },
  ],
  progression: {
    anchorBaseLabel: 'on butterfly',
    steps: [
      {
        slug:          'butterfly',
        modifierAdded: 'anchor (no ducking yet)',
        rationale:
          'Learn the wing-motion dex first. Butterfly is the dex shape that the head-dip will later sit alongside. Without the wing motion, the head dip has no trick to live inside of.',
      },
      {
        slug:          'ducking-butterfly',
        modifierAdded: '+ ducking',
        rationale:
          'The clearest single teaching case. Same wing motion, same kick path; the head now dips between the dexes while the bag traces an arc around the neck. One new variable, one body region added, ADD goes up by one.',
      },
      {
        slug:          'ducking-whirl',
        modifierAdded: '+ ducking on a rotational base',
        rationale:
          'Same head dip, different dex shape. The whirl base is a rotational arc rather than a wing motion, so the head dip now happens during a turn. The modifier is doing the same job; the body around it is doing something different.',
      },
      {
        slug:          'phoenix',
        modifierAdded: '+ pixie (the "Pixie Ducking Butterfly" stack)',
        rationale:
          'Phoenix is a folk single-token name whose technical name is Pixie Ducking Butterfly — pixie is a set treatment, ducking is the head dip, butterfly is the base. The same head dip you learned at step two is still doing the same job; now there is a pixie set in front of it.',
      },
    ],
  },
  crossBase: {
    framingLine:
      'The head dip is the same in each of these — what changes is the dex shape the head is dipping during.',
    examples: [
      {
        slug:      'ducking-clipper',
        baseLabel: 'on clipper-stall base',
        prose:
          'A low-ADD case (3 ADD). The clipper-stall base is the simplest dex shape in the freestyle vocabulary, which makes ducking-clipper a useful pure teaching case for the head-dip mechanic without a complex base to manage simultaneously.',
      },
      {
        slug:      'ducking-osis',
        baseLabel: 'on osis base',
        prose:
          'The head dip applied to osis\'s hippy-in-extended arc. The two motions are largely orthogonal — the hips drive the osis, the head drives the duck. They stack cleanly because they live in different body regions.',
      },
      {
        slug:      'mullet',
        baseLabel: 'on whirl base, with paradox and symposium',
        prose:
          'A folk single-token name in the ducking-family by modifier link. Mullet (6 ADD) layers paradox and symposium on a whirl base alongside the head dip — four body modifiers stacked, ducking still recognizably doing the same job.',
      },
      {
        slug:      'mind-bender',
        baseLabel: 'on torque base, with paradox',
        prose:
          'Another folk single-token name in the ducking-family. The head dip and the paradox hip pivot run simultaneously around a torque-shaped dex — three body modifiers in different regions, none collapsing into the others.',
      },
      {
        slug:      'hatchet',
        baseLabel: 'on whirl base, with the diving sibling',
        prose:
          'Hatchet uses the diving sibling (head over and under the bag) rather than ducking proper. Included as a cross-family example: the same body region (head/neck), but the motion goes around the bag\'s arc rather than dipping under one side of it.',
      },
    ],
  },
  relatedModifiers: [
    {
      name:  'weaving',
      prose: 'Sibling head-motion modifier. Same head motion toward the bag as ducking; bag falls to the SAME side as the head moved, not the opposite.',
    },
    {
      name:  'diving',
      prose: 'Sibling head-motion modifier. The head goes OVER and UNDER the bag in a full arc; bag falls to the same side as the initial head movement. Hatchet is the named compound.',
    },
    {
      name:  'zulu',
      prose: 'Sibling head-motion modifier. The head goes over and under the bag like diving, but the bag falls to the opposite side. The full-arc sibling of ducking.',
    },
    {
      name:  'alpine',
      prose: 'A meta-operator that inserts a duck or dive between uptime and downtime of a base trick. Alpine Ripwalk = Stepping Ducking Butterfly; the modifier is named by the operator rather than the head-motion sibling.',
    },
  ],
};

// Registry — modifier-family pedagogy pages.
const MODIFIER_PAGE_CONTENT: Record<string, ModifierEducationInput> = {
  spinning: SPINNING_CONTENT,
  paradox:  PARADOX_CONTENT,
  ducking:  DUCKING_CONTENT,
};

// ─────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns true when a modifier-family page exists for the given slug.
 * Phase 6 ships only "spinning".
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
    mechanicalLead:     input.mechanicalLead,
    anchorSentence:     input.anchorSentence,
    diagramPlaceholder: input.diagramPlaceholder,
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
    glossaryHref:     '/freestyle/glossary',
    layerSource:      'observational',
  };
}
