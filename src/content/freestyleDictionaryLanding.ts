/**
 * freestyleDictionaryLanding.ts
 *
 * Curator-authored editorial content for the dictionary landing surface
 * on /freestyle/tricks (rendered when no ?view= parameter is supplied).
 *
 * Per CR-1 of exploration/dictionary-coherence-2026-05-18/dictionary_landing_page_plan.md.
 *
 * Layer separation: this module supplies static editorial copy + card
 * structural definitions. Numeric stat counts are joined at service-shape
 * time from DB + the OBSERVATIONAL_TRICKS module + the modifier table;
 * this file does not encode counts to prevent drift.
 *
 * Constraints applied (per skill doctrine D + planning doc §2.5):
 *   - No "what's new" / churn-panel content.
 *   - No token soup / AST visuals / interactive symbolic UI.
 *   - One paragraph for notation philosophy (no examples on landing).
 *   - Glossary-primer callout is small; placed adjacent to the
 *     operators/components card.
 *   - Observational badge applies to card 5 only (Observed Tricks).
 */

export interface DictionaryLandingCard {
  /** Stable identifier for testing + CSS hooks. */
  slug:            string;
  title:           string;
  subtitle:        string;
  body:            string;
  /** "Use this view when..." guidance for first-time visitors. */
  useWhen:         string;
  href:            string;
  /**
   * True for the card that links to the observational staging layer
   * (Observed Tricks). Drives the observational badge render.
   */
  isObservational: boolean;
  /**
   * Optional secondary link under the card body. Used only by the
   * Movement System card to surface the Footbag Sets axis discoverability
   * path per CR-3.
   */
  subLink:         { label: string; href: string } | null;
}

export interface DictionaryLandingGlossaryPrimer {
  headline: string;
  body:     string;
  href:     string;
}

/** Static editorial content for the dictionary landing surface. */
export const DICTIONARY_LANDING_FRAMING: string =
  'Official trick names, structural decompositions, and the wider tracked ' +
  'vocabulary. Choose how to browse below.';

export const DICTIONARY_LANDING_NOTATION_PHILOSOPHY: string =
  'Notation in this dictionary follows a symbolic-first approach: ' +
  'structural readings (the ≡ lines on each trick card) describe the ' +
  'official decomposition, with operational notation as fallback for ' +
  'tricks whose official reading is still being authored. Cards without ' +
  'either render their name and ADD value only — the absence is ' +
  'honest, not a placeholder.';

export const DICTIONARY_LANDING_PRIMER: DictionaryLandingGlossaryPrimer = {
  headline: 'New to the notation?',
  body:     'Start with the glossary primer.',
  href:     '/freestyle/glossary#notation',
};

/**
 * The six browse cards rendered on the landing surface, in display order.
 * Order matches the brief's enumeration and the landing-page-plan §2.3.
 *
 * Card 3 (Movement System) is the sole carrier of a subLink, deep-linking
 * to the Set/Uptime axis anchor. Anchor id derived from the axisKey
 * 'set-uptime' plus the 'movement-axis-' prefix applied at
 * freestyleService.ts:4379.
 *
 * Card 5 (Observed Tricks) carries isObservational=true; the
 * observational badge renders on it only.
 */
export const DICTIONARY_LANDING_CARDS: readonly DictionaryLandingCard[] = [
  {
    slug:            'add',
    title:           'By ADD',
    subtitle:        'Difficulty progression',
    body:            'Browse by ADD value, from beginner-friendly through advanced.',
    useWhen:         'When you’re skill-building or want a difficulty ladder.',
    href:            '/freestyle/tricks?view=add',
    isObservational: false,
    subLink:         null,
  },
  {
    slug:            'family',
    title:           'By Family',
    subtitle:        'Structural trick families',
    body:            'Browse the structural anchors. Whirl, butterfly, torque, mirage, osis.',
    useWhen:         'When you know the family and want every variant in one place.',
    href:            '/freestyle/tricks?view=family',
    isObservational: false,
    subLink:         null,
  },
  {
    slug:            'movement-system',
    title:           'By Movement System',
    subtitle:        'Mechanics and operators across four axes',
    body:            'Browse by movement mechanic. Set/Uptime, Entry Topologies, Midtime Body, No-Plant Suspension.',
    useWhen:         'When you want to understand how tricks relate by mechanic, not by name.',
    href:            '/freestyle/tricks?view=movement-system',
    isObservational: false,
    subLink:         {
      label: 'See Footbag Sets axis',
      href:  '/freestyle/tricks?view=movement-system#movement-axis-set-uptime',
    },
  },
  {
    slug:            'neighborhoods',
    title:           'Movement Neighborhoods',
    subtitle:        'Shared movement feel, timing, and structure across families',
    body:            'Tricks that move alike even when their families differ. Hippy-downtime-dex, leggy-uptime-dex, X-dex compounds.',
    useWhen:         'When you want to discover tricks that move like one you already know.',
    href:            '/freestyle/tricks?view=topology',
    isObservational: false,
    subLink:         null,
  },
  {
    slug:            'observed',
    title:           'Observed Tricks',
    subtitle:        'Community-documented, staged before official review',
    body:            'Tricks named in tutorials, records, and other ecosystems that haven’t yet entered official review. Curated for transparency.',
    useWhen:         'When you’ve heard a name we haven’t formally adopted yet.',
    href:            '/freestyle/observational',
    isObservational: true,
    subLink:         null,
  },
  {
    slug:            'operators',
    title:           'Operators & Components',
    subtitle:        'The building blocks',
    body:            'Sets, dexes, spins, surfaces, body modifiers, and the movement-language vocabulary that composes tricks.',
    useWhen:         'When you want to understand what the parts mean before how they combine.',
    href:            '/freestyle/operators',
    isObservational: false,
    subLink:         null,
  },
] as const;
