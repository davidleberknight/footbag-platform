/**
 * symbolicProgressions.ts
 *
 * Hand-authored educational progressions for the observational symbolic-grammar
 * layer. Each progression is a fixed chain of trick slugs + per-step prose
 * rationale + symbolic-topology attribution.
 *
 * Phase 1 (UX-SHIP-1) ships only the Walking Family progression. No general
 * progression engine is built yet — the chain is hardcoded.
 *
 * Service-layer integration:
 *   - This module owns the hardcoded chain definitions + per-step rationale.
 *   - The freestyleService caller resolves dict rows (canonical_name, adds,
 *     etc.) for each step and weaves the data into the page view-model.
 *   - No DB writes. No canonical mutation.
 *
 * Layer attribution: this module produces observational symbolic-grammar
 * shape; every output carries layerSource='observational'.
 */
import type { FreestyleTrickRow } from '../db/db';
import { slugToHashtag } from './freestyleRecordShaping';
import { glossaryHrefForTerm } from './glossaryAnchors';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface WalkingProgressionStepInput {
  slug:           string;
  modifierAdded:  string;   // e.g., "anchor", "stepping body modifier"
  rationale:      string;   // educational prose
  symbolicNote:   string;   // topology / mechanic attribution
  glossaryTerms:  string[]; // related glossary terms (linked separately)
  isAnchor:       boolean;
}

export interface WalkingProgressionStep {
  stepNumber:    number;
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
  modifierAdded: string;
  rationale:     string;
  symbolicNote:  string;
  glossaryLinks: Array<{ term: string; href: string }>;
  isAnchor:      boolean;
}

export interface WalkingFamilyProgressionContent {
  pageHeading:          string;
  pageIntro:            string;
  topologyGroupId:      string;
  topologyDisplayName:  string;
  steps:                WalkingProgressionStep[];
  stepCount:            number;
  layerSource:          'observational';
}

// ─────────────────────────────────────────────────────────────────────────
// Hand-authored chain — Walking Family progression
//
// Per UX-SHIP-1 Phase 5 task brief. Steps in fixed order; each transition
// teaches one mechanical/modifier concept. Rationale prose is curator-style
// educational language, not pt##/Red/internal-process leakage.
// ─────────────────────────────────────────────────────────────────────────

const WALKING_FAMILY_STEPS: WalkingProgressionStepInput[] = [
  {
    slug:          'butterfly',
    modifierAdded: 'anchor (no modifier)',
    rationale:
      'The wing-motion foundation. A toe set, an outside-wing dex flick, and a cross-body clipper recovery. The wing pattern + cross-body finish is the defining mechanical shape that every step below extends.',
    symbolicNote:
      'Anchor of the butterfly-wing topology. The wing-motion dex + cross-body clipper is the topological signature shared across the entire walking family.',
    glossaryTerms: ['butterfly', 'clipper', 'cross-body'],
    isAnchor: true,
  },
  {
    slug:          'ripwalk',
    modifierAdded: '+ stepping (body modifier)',
    rationale:
      'Adding a stepping motion mid-wing: the supporting foot moves to a new position between the two kicks. Same wing arc as butterfly, with the support relocating instead of holding still. Natural-direction travel.',
    symbolicNote:
      'Stepping modifier on the butterfly base; preserves wing-motion topology with a mid-arc foot relocation.',
    glossaryTerms: ['stepping', 'butterfly'],
    isAnchor: false,
  },
  {
    slug:          'dimwalk',
    modifierAdded: '+ pixie (set modifier)',
    rationale:
      'Same wing shape, different modifier discipline. Pixie compaction tightens the dex moment: the foot path through the wing is shorter, the bag arc more enclosed. A modifier swap, not a structural change.',
    symbolicNote:
      'Pixie modifier on the butterfly base. Same topology as ripwalk; modifier compaction replaces the stepping action.',
    glossaryTerms: ['pixie', 'butterfly'],
    isAnchor: false,
  },
  {
    slug:          'sidewalk',
    modifierAdded: 'stepping with same-side direction',
    rationale:
      'Same modifier as ripwalk (stepping), executed with same-side direction throughout. The body holds same-side commitment across both wing arcs instead of crossing through neutral. Direction is a canonical-row distinguisher.',
    symbolicNote:
      'Mirror of ripwalk on the direction axis. The walking family treats direction as a structural distinguisher; same kick mechanics, opposite directional travel.',
    glossaryTerms: ['stepping', 'butterfly'],
    isAnchor: false,
  },
  {
    slug:          'dada-curve',
    modifierAdded: 'no modifier; no foot plant',
    rationale:
      'The same kick-and-recovery shape as ripwalk, executed with the supporting foot stationary throughout. No stepping action, no pixie compaction, no modifier at all — the body absorbs the full wing arc without the help of a relocated base.',
    symbolicNote:
      'Self-atom in the butterfly-walking family. Topology-equivalent to ripwalk; the differentiator is the absence of any foot plant during the wing motion.',
    glossaryTerms: ['butterfly'],
    isAnchor: false,
  },
  {
    slug:          'matador',
    modifierAdded: '+ nuclear (set modifier; structurally paradox + illusion)',
    rationale:
      'A heavier modifier raises the wing-motion compound from four ADD to five. Nuclear combines paradox (hip pivot from cross-body set) with a downtime illusioning dex in a single composed motion. Same wing topology; higher discipline.',
    symbolicNote:
      'Nuclear modifier on the butterfly base. Demonstrates how a multi-component modifier (paradox + illusion) raises compound ADD without changing the underlying wing topology.',
    glossaryTerms: ['paradox', 'butterfly'],
    isAnchor: false,
  },
  {
    slug:          'phoenix',
    modifierAdded: '+ pixie + ducking (two modifiers)',
    rationale:
      'Two body modifiers stacked on the butterfly base: pixie compaction plus ducking head movement between the two kicks. The wing topology persists; the trick now teaches modifier stacking explicitly.',
    symbolicNote:
      'Multi-modifier compound on the butterfly base. Pixie compaction + ducking head-motion stacked on the wing-motion topology. Five ADD; flagship-density teaching case.',
    glossaryTerms: ['pixie', 'ducking', 'butterfly'],
    isAnchor: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Walking Family chain against the live trick dictionary.
 * Returns null when ANY step's slug is missing from the dictionary (signals
 * a data invariant break that should fail-loud rather than render a partial
 * page with broken links).
 */
export function buildWalkingFamilyProgression(
  allDictRows: readonly FreestyleTrickRow[],
): WalkingFamilyProgressionContent | null {
  const dictBySlug = new Map<string, FreestyleTrickRow>();
  for (const row of allDictRows) {
    dictBySlug.set(row.slug, row);
  }

  const steps: WalkingProgressionStep[] = [];
  for (let i = 0; i < WALKING_FAMILY_STEPS.length; i++) {
    const def = WALKING_FAMILY_STEPS[i]!;
    const row = dictBySlug.get(def.slug);
    if (!row) {
      // Any missing slug invalidates the page; the chain is curated and
      // expects all 7 slugs present.
      return null;
    }
    steps.push({
      stepNumber:    i + 1,
      slug:          row.slug,
      canonicalName: row.canonical_name,
      hashtag:       slugToHashtag(row.slug),
      adds:          row.adds,
      detailHref:    `/freestyle/tricks/${row.slug}`,
      modifierAdded: def.modifierAdded,
      rationale:     def.rationale,
      symbolicNote:  def.symbolicNote,
      glossaryLinks: def.glossaryTerms.map(term => ({
        term,
        href: glossaryHrefForTerm(term),
      })),
      isAnchor: def.isAnchor,
    });
  }

  return {
    pageHeading:         'Walking-family progression',
    pageIntro:
      'The walking family is a cluster of tricks built on butterfly’s outside-wing motion with cross-body clipper recovery. ' +
      'Each step below extends the previous one by adding or swapping a single modifier discipline. ' +
      'Same topology throughout; modifier choices vary. It surfaces mechanical similarity ' +
      'and does not change the official IFPA family classifications.',
    topologyGroupId:     'butterfly-wing-topology',
    topologyDisplayName: 'Butterfly wing topology',
    steps,
    stepCount:           steps.length,
    layerSource:         'observational',
  };
}
