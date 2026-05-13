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

// Registry — single entry for Phase 6 pilot.
const MODIFIER_PAGE_CONTENT: Record<string, ModifierEducationInput> = {
  spinning: SPINNING_CONTENT,
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
