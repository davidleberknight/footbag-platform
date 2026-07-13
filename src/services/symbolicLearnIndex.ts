/**
 * symbolicLearnIndex.ts
 *
 * /freestyle/learn — symbolic-subsystem index page content.
 *
 * Hand-authored entries for the four symbolic surfaces, grouped into three
 * categories:
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
    'A guided tour of freestyle\'s movement vocabulary. Read these six pages in order: each teaches one idea about how tricks, families, and names are organized. For your first physical steps with a bag, start with the getting-started page instead.',
  steps: [
    { step: 1, name: 'Mirage',    lesson: 'The simplest dexterity, and the idea most of freestyle is built from.',  href: '/freestyle/families/mirage' },
    { step: 2, name: 'Butterfly', lesson: 'A dexterity flowing into a cross-body clipper catch.',                   href: '/freestyle/families/butterfly' },
    { step: 3, name: 'Whirl',     lesson: 'The connector a combo keeps returning to.',                              href: '/freestyle/families/whirl' },
    { step: 4, name: 'Osis',      lesson: 'The ending a whole branch of tricks grows from.',                        href: '/freestyle/families/osis' },
    { step: 5, name: 'Swirl',     lesson: 'How the vocabulary grows: sibling cells in one movement matrix.',        href: '/freestyle/families/swirl' },
    { step: 6, name: 'Down',      lesson: 'How tricks are organized: four famous names, one family.',               href: '/freestyle/families/down' },
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
  introBlurb: 'Authoritative reference pages for the symbolic vocabulary itself: the glossary connective panels for high-value terms, and the set-notation reference that names the operational language.',
  entries: [
    {
      title:      'Set notation reference',
      href:       '/freestyle/sets/reference',
      shortBlurb: 'The legacy set-notation language: how Pixie, Fairy, Atomic, Quantum, Nuclear, Barraging, Furious and the rest are described in TOE / CLIP / SET grammar. The operational layer of the movement language.',
      status:     'shipped',
      isShipped:  true,
    },
    {
      title:      'Glossary movement-topology panels',
      href:       '/freestyle/glossary#connective-panels',
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
