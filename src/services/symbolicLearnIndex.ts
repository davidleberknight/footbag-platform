/**
 * symbolicLearnIndex.ts
 *
 * /freestyle/learn — symbolic-subsystem index page content.
 *
 * Hand-authored entries for the four symbolic surfaces, grouped into three
 * categories:
 *   - Progressions (curated chains)
 *   - Modifier pedagogy (per-modifier teaching pages)
 *   - Reference (Freestyle Concepts connective panels)
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

/** One step in the beginner start-here path: an ordered walk of the foundational pages. */
export interface FoundationalPathStep {
  step:   number;
  name:   string;
  lesson: string;
  href:   string;
}
export interface FoundationalPath {
  heading: string;
  intro:   string;
  steps:   readonly FoundationalPathStep[];
}

export interface SymbolicLearnIndexContent {
  pageHeading:   string;
  pageIntro:     string;
  // The beginner start-here path: the six beginner lessons in reading order,
  // rendered before the more advanced pathways below.
  foundationalPath: FoundationalPath;
  // Operator-board orientation strip rendered before the section list, as the
  // symbolic-onboarding surface for the educational pathways index.
  operatorBoard: OperatorBoardData;
  sections:      LearnIndexSection[];
  layerSource:   'observational';
}

// A six-lesson guided tour of the movement vocabulary and how the dictionary is
// organized, in reading order: conceptual pedagogy, not a physical beginner
// curriculum (the getting-started page owns the first physical steps).
// "Foundations" is reserved for the twelve foundational movements on the
// landing page. Order and lessons are the curator-set sequence.
const FOUNDATIONAL_PATH: FoundationalPath = {
  heading: 'Six lessons: how the vocabulary fits together',
  intro:
    'A guided tour of freestyle\'s movement vocabulary. Read these six pages in order: each teaches one idea about how tricks, families, sets, and modifiers are organized. For your first physical steps with a bag, start with the getting-started page instead.',
  steps: [
    { step: 1, name: 'Around the World', lesson: 'What a dexterity is: the plainest circling motion in the vocabulary, the same leg orbiting the bag and the same toe catching it.', href: '/freestyle/tricks/around_the_world' },
    { step: 2, name: 'Mirage',           lesson: 'A complete trick: set, opposite-leg dexterity, and a catch back on the setting toe, the loop much of freestyle builds on.',        href: '/freestyle/tricks/mirage' },
    { step: 3, name: 'Butterfly',        lesson: 'The catch is structure: the same one-dex idea resolving to a cross-body clipper catch, so how a trick ends is part of what it is.', href: '/freestyle/families/butterfly' },
    { step: 4, name: 'Whirl',            lesson: 'One structure grows a family: a stable clipper ending inherited by a whole family of variations.',                                 href: '/freestyle/families/whirl' },
    { step: 5, name: 'Pixie',            lesson: 'Sets are how tricks begin: one named launch structure that opens terraging, sailing, frantic, and more.',                          href: '/freestyle/sets/pixie' },
    { step: 6, name: 'Spinning',         lesson: 'Modifiers multiply the vocabulary: a full-body rotation layered through a trick, taught with a progression built on the whirl.',   href: '/freestyle/modifier/spinning' },
  ],
};

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
  introBlurb: 'Deep-dive teaching pages for individual modifiers: what the modifier does physically, how it composes onto bases, and where it appears across the dictionary.',
  entries: [
    {
      title:      'Spinning',
      href:       '/freestyle/modifier/spinning',
      shortBlurb: 'A full-body rotation carried through the middle of the trick. Six teaching sections: mechanical lead, common confusions with gyro and inspin, a progression on whirl, and cross-base examples.',
      status:     'shipped',
      isShipped:  true,
    },
    {
      title:      'Paradox',
      href:       '/freestyle/modifier/paradox',
      shortBlurb: 'A hip pivot on a single dex, changing its side relationship without adding another dex. Six teaching sections: mechanical lead, common confusions with xdex / symposium / spinning, a progression on mirage, and cross-base examples including folk single-token names that hide paradox in their canonical reading.',
      status:     'shipped',
      isShipped:  true,
    },
    {
      title:      'Ducking',
      href:       '/freestyle/modifier/ducking',
      shortBlurb: 'A head dip that lets the bag pass around the neck. One member of a four-way ducking family (ducking / weaving / diving / zulu): ducking and diving differ by head motion, while weaving and zulu are ducking sets distinguished by the bag path. Six teaching sections including a progression on butterfly and folk single-token compounds (phoenix, mullet, mind-bender) that hide ducking in their canonical reading.',
      status:     'shipped',
      isShipped:  true,
    },
  ],
};

const REFERENCE_SECTION: LearnIndexSection = {
  heading:    'Reference surfaces',
  introBlurb: 'Reference pages for the symbolic vocabulary itself: the Freestyle Concepts connective panels for high-value terms, which carry current platform doctrine, and the historical move-set compilation, which is preserved as source evidence rather than as current classification.',
  entries: [
    {
      title:      'Historical Move-Set Reference',
      href:       '/freestyle/sets/reference',
      shortBlurb: 'A historical community compilation of the set-notation language: how Pixie, Fairy, Atomic, Quantum, Nuclear, Barraging, Furious and the rest were described in TOE / CLIP / SET grammar. Its classifications are source evidence and may differ from current platform doctrine.',
      status:     'shipped',
      isShipped:  true,
    },
    {
      title:      'Freestyle Concepts movement-topology panels',
      href:       '/freestyle/concepts#connective-panels',
      shortBlurb: 'Paradox, symposium, ducking, spinning, whirl, pixie: each as a short panel pointing to where the term lives in practice across the dictionary.',
      status:     'shipped',
      isShipped:  true,
    },
  ],
};

export function buildSymbolicLearnIndex(operatorBoard: OperatorBoardData): SymbolicLearnIndexContent {
  return {
    pageHeading: 'Educational pathways through freestyle footbag',
    pageIntro:
      'Guided progression paths for exploring freestyle movement: how a modifier feels, how a family of tricks builds up step by step, how a glossary term shows up across the catalog. The trick dictionary remains the main reference; these are companions for learning.',
    foundationalPath: FOUNDATIONAL_PATH,
    operatorBoard,
    sections: [
      PROGRESSIONS_SECTION,
      MODIFIER_PEDAGOGY_SECTION,
      REFERENCE_SECTION,
    ],
    layerSource: 'observational',
  };
}
