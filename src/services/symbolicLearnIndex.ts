/**
 * symbolicLearnIndex.ts
 *
 * /freestyle/learn — symbolic-subsystem index page content.
 *
 * Per DISCOVERABILITY phase. Hand-authored entries for the four symbolic
 * surfaces shipped in UX-SHIP-1 (Phases 4-7), grouped into three categories:
 *   - Progressions (curated chains)
 *   - Modifier pedagogy (per-modifier teaching pages)
 *   - Reference (glossary connective panels)
 *
 * Observational layer only. No DB writes; no canonical references modified.
 */

export interface LearnIndexEntry {
  title:        string;
  href:         string;
  shortBlurb:   string;
  status:       'shipped' | 'planned';
  isShipped:    boolean;   // template-facing convenience flag
}

export interface LearnIndexSection {
  heading:      string;
  introBlurb:   string;
  entries:      LearnIndexEntry[];
}

export interface SymbolicLearnIndexContent {
  pageHeading:   string;
  pageIntro:     string;
  sections:      LearnIndexSection[];
  layerSource:   'observational';
}

const PROGRESSIONS_SECTION: LearnIndexSection = {
  heading:    'Progressions',
  introBlurb: 'Curated chains that walk you up a family of related compounds, one modifier at a time.',
  entries: [
    {
      title:      'Walking-family progression',
      href:       '/freestyle/progression/walking-family',
      shortBlurb: 'Butterfly → ripwalk → dimwalk → sidewalk → dada-curve → matador → phoenix. Seven steps; each one adds or swaps a single modifier on the butterfly base.',
      status:     'shipped',
      isShipped:  true,
    },
  ],
};

const MODIFIER_PEDAGOGY_SECTION: LearnIndexSection = {
  heading:    'Modifier pedagogy',
  introBlurb: 'Deep-dive teaching pages for individual modifiers — what the modifier does physically, how it composes onto bases, and where it appears across the dictionary.',
  entries: [
    {
      title:      'Spinning',
      href:       '/freestyle/modifier/spinning',
      shortBlurb: 'A full-body rotation that carries through the dex moment. Six teaching sections: mechanical lead, common confusions with gyro and inspin, a progression on whirl, and cross-base examples.',
      status:     'shipped',
      isShipped:  true,
    },
    {
      title:      'Paradox',
      href:       '/freestyle/modifier/paradox',
      shortBlurb: 'A hip pivot between two dexes on the same set. Six teaching sections: mechanical lead, common confusions with xdex / symposium / spinning, a progression on mirage, and cross-base examples including folk single-token names that hide paradox in their canonical reading.',
      status:     'shipped',
      isShipped:  true,
    },
    {
      title:      'Ducking',
      href:       '/freestyle/modifier/ducking',
      shortBlurb: 'A head dip that lets the bag pass around the neck. One member of a four-way head-motion family (ducking / weaving / diving / zulu — a 2×2 of head direction × bag-fall side). Six teaching sections including a progression on butterfly and folk single-token compounds (phoenix, mullet, mind-bender) that hide ducking in their canonical reading.',
      status:     'shipped',
      isShipped:  true,
    },
  ],
};

const REFERENCE_SECTION: LearnIndexSection = {
  heading:    'Glossary connective panels',
  introBlurb: 'Six high-value glossary terms surface their related tricks, related symbolic groups, and notation hints in compact connective-tissue panels at the bottom of the freestyle glossary.',
  entries: [
    {
      title:      'Glossary §13 panels',
      href:       '/freestyle/glossary#connective-panels',
      shortBlurb: 'Paradox, symposium, ducking, spinning, whirl, pixie — each as a short panel pointing to where the term lives in practice across the dictionary.',
      status:     'shipped',
      isShipped:  true,
    },
  ],
};

export function buildSymbolicLearnIndex(): SymbolicLearnIndexContent {
  return {
    pageHeading: 'Educational pathways through freestyle footbag',
    pageIntro:
      'These surfaces sit beside the canonical trick dictionary as an observational educational layer. They teach freestyle physically and mechanically — how a modifier feels, how a family of tricks builds up step by step, how a glossary term shows up across the catalog. The dictionary remains the canonical reference; the surfaces below are companions for learning.',
    sections: [
      PROGRESSIONS_SECTION,
      MODIFIER_PEDAGOGY_SECTION,
      REFERENCE_SECTION,
    ],
    layerSource: 'observational',
  };
}
