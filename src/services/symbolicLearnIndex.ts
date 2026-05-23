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

import type { OperatorBoardData } from './freestyleService.js';

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
  // Operator-board orientation strip rendered before the section list, as the
  // symbolic-onboarding surface for the educational pathways index.
  operatorBoard: OperatorBoardData;
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
  heading:    'Reference surfaces',
  introBlurb: 'Authoritative reference pages for the symbolic vocabulary itself — the glossary connective panels for high-value terms, and the set-notation reference that names the operational language.',
  entries: [
    {
      title:      'Set notation reference',
      href:       '/freestyle/sets',
      shortBlurb: 'The legacy set-notation language: how Pixie, Fairy, Atomic, Quantum, Nuclear, Barraging, Furious and the rest are described in TOE / CLIP / SET grammar. The operational layer of the movement language.',
      status:     'shipped',
      isShipped:  true,
    },
    {
      title:      'Glossary movement-topology panels',
      href:       '/freestyle/glossary#connective-panels',
      shortBlurb: 'Paradox, symposium, ducking, spinning, whirl, pixie — each as a short panel pointing to where the term lives in practice across the dictionary.',
      status:     'shipped',
      isShipped:  true,
    },
  ],
};

export function buildSymbolicLearnIndex(operatorBoard: OperatorBoardData): SymbolicLearnIndexContent {
  return {
    pageHeading: 'Educational pathways through freestyle footbag',
    pageIntro:
      'Guided progression paths for exploring freestyle movement — how a modifier feels, how a family of tricks builds up step by step, how a glossary term shows up across the catalog. The trick dictionary remains the main reference; these are companions for learning.',
    operatorBoard,
    sections: [
      PROGRESSIONS_SECTION,
      MODIFIER_PEDAGOGY_SECTION,
      REFERENCE_SECTION,
    ],
    layerSource: 'observational',
  };
}
