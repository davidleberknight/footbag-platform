import {
  FreestyleLeaderRow, FreestyleRecordRow, FreestyleTrickRow, FreestyleTrickModifierRow,
  FreestyleTrickRowWithStatus, FreestyleTrickRowWithParse,
  FreestyleTrickAliasRow, FreestyleMediaCoveredSourceRow,
  FreestyleTrickModifierLinkRow, FreestyleTrickModifierLinkDetailRow,
  FreestyleModifierUsageRow,
  FreestyleCompetitorRow, FreestyleEraRow, FreestyleRecentEventRow,
  FreestyleMilestoneRow, FreestyleCareerRow, FreestyleNationRow,
  FreestyleWorldChampionRow, FreestyleDecadeNationRow, FreestyleFormatEventRow,
  FreestylePartnershipRow,
  CuratorSlotMediaRow,
  freestyleRecords, freestyleTricks, freestyleTrickModifiers, freestyleTrickAliases,
  freestyleMediaLinks,
  freestyleCompetition, freestylePartnerships, media,
  queryCuratorMediaTags,
} from '../db/db';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { runSqliteRead } from './sqliteRetry';
import { NotFoundError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { personHref } from './personLink';
import { VideoMedia, expandYouTubeVideo, expandVideoFromMediaItem } from './videoMedia';
import { shapePartnershipPair } from './playerShaping';
import {
  FreestyleRecordViewModel,
  shapeFreestyleRecord,
  slugToHashtag,
  trickNameToSlug,
} from './freestyleRecordShaping';
import { getResolvableTrickSlugs } from './freestyleResolvableSlugs';
import {
  NotationDisplay,
  shapeNotationDisplay,
  buildNotationLookupContext,
} from './notationRendering';
import {
  OperationalToken,
  shapeOperationalNotationDisplay,
} from './operationalNotationRendering';
import {
  SemanticBrowseToken,
  shapeSemanticNotations,
} from './semanticNotationRendering';
import {
  FreestyleRelatedTrick,
  FreestyleNextTrick,
  FreestylePreviousTrick,
  buildRelatedTricks,
  buildNextTricks,
  buildPreviousTricks,
} from './freestyleRelatedTricks';
import {
  SymbolicRelatedTopologyPanel,
  SymbolicEducationCta,
  buildSymbolicRelatedTopologyPanel,
  buildSymbolicEducationCtas,
} from './symbolicTrickPanels';
import {
  WalkingFamilyProgressionContent,
  buildWalkingFamilyProgression,
} from './symbolicProgressions';
import {
  ModifierFamilyPageContent,
  buildModifierFamilyPage,
  hasModifierFamilyPage,
} from './symbolicModifierEducation';
import {
  GlossaryConnectivePanel,
  buildGlossaryConnectivePanels,
} from './symbolicGlossaryPanels';
import {
  OperatorReferenceEntry,
  OPERATOR_REFERENCE_ENTRIES,
  getOperatorReferenceEntry,
} from '../content/freestyleOperatorReference';
import {
  OPERATOR_INDEX_AXES,
  OPERATOR_INDEX_SLUGS,
} from '../content/freestyleOperatorIndex';
import {
  CORE_TRICK_SPEC,
} from '../content/freestyleLandingContent';
import { TRICKS_MOSAIC, mosaicClipFilename } from '../content/freestyleTricksMosaic';
import {
  CORE_ATOM_EDUCATIONAL,
  isCoreAtom,
} from '../content/freestyleCoreAtomEducational';
import {
  getDoctrineDivergence,
} from '../content/freestyleTrickDoctrine';
import {
  getSymbolicEquivalenceChain,
} from '../content/freestyleSymbolicEquivalences';
import {
  filterAliasesForBrowse,
} from '../content/freestyleAliasGovernance';
import {
  FreestyleTrickKind,
  resolveTrickKind,
} from '../content/freestyleTrickKindOverrides';
import {
  getFamilyInvariant,
} from '../content/freestyleFamilyInvariants';
import {
  resolveFamilyOverride,
  resolveFamilyDisplayName,
  resolveFamilyDualMemberships,
} from '../content/freestyleFamilyOverrides';
import {
  MOVEMENT_SYSTEM_AXES,
  resolveModifierCompositionGloss,
  resolveAxisForModifier,
} from '../content/freestyleMovementSystems';
import {
  ALTERNATIVE_SURFACES,
} from '../content/freestyleAlternativeSurfaces';
import {
  PUBLIC_DISPLAY_FAMILIES,
  resolveDisplayFamily,
  familyWithAncestors,
  PUBLIC_FAMILY_ORDER,
  PUBLIC_FAMILY_LABEL,
  PUBLIC_FAMILY_PARENT_LABEL,
  PUBLIC_FAMILY_PARENT_OF,
} from '../content/freestylePublicFamilies';
import {
  familyTier,
  FAMILY_DESCENDANT_COUNTS,
  FAMILY_TIER_LABEL,
  type FamilyTier,
} from '../content/freestyleFamilyTiers';
import { JOBS_NOTATION_ARTICLE, JOBS_NOTATION_ARTICLE_TITLE } from '../content/jobsNotationArticle';
import { FAMILY_HISTOGRAM, ENTRY_HISTOGRAM, type TopologyHistogramRow } from '../content/freestyleTopologyHistograms';
import { MODIFIER_CLUSTERS, clusterForModifier, clusterLabelForModifier } from '../content/freestyleModifierClusters';
import { quantityLadderFor } from '../content/freestyleQuantityLadders';
import {
  CANONICAL_SETS,
  SET_SUBTYPE_SPECS,
  findCanonicalSetBySlug,
} from '../content/freestyleCanonicalSets';
import { COMPETITION_FORMATS } from '../content/freestyleCompetitionFormats';
import {
  COMPOSITIONAL_SET_FAMILIES,
  UPTIME_REINTERPRETATION_LADDERS,
  COMPOSITIONAL_AUDIT_ENTRIES,
} from '../content/freestyleCompositionalSets';
import {
  getCompoundSemanticDescription,
  isDescriptionRedundantWithNotation,
  getReversePairTransform,
  REV_ZERO_EXPLAINER,
} from '../content/freestyleSemanticOverrides';
import {
  getTrickIntuition,
} from '../content/freestyleTrickIntuition';
import {
  getTrickInterpretation,
} from '../content/freestyleTrickInterpretations';
import {
  resolveTrickTier,
} from '../content/freestyleTrickTier';
import {
  getTrickMechanicalDelta,
} from '../content/freestyleTrickMechanicalDelta';
import {
  getTrickOntologyRole,
} from '../content/freestyleTrickOntologyRole';
import {
  getTrickProductivity,
} from '../content/freestyleTrickProductivity';
import {
  getTrickFamilyEvolution,
} from '../content/freestyleTrickFamilyEvolution';
import {
  getTrickProgressiveReadings,
} from '../content/freestyleTrickProgressiveReadings';
import {
  isUnresolvedCompound,
} from '../content/freestyleUnresolvedCompounds';
import {
  FREESTYLE_ADD_ANALYSIS_CONTENT,
  type AddAnalysisContent,
} from '../content/freestyleAddAnalysisContent';
import {
  RESOLVED_FORMULAS_SPRINT_1,
  type ResolvedFormula,
} from '../content/freestyleResolvedFormulas';
import {
  FREESTYLE_COMBO_ANALYSIS_CONTENT,
  type ComboAnalysisContent,
} from '../content/freestyleComboAnalysisContent';
import {
  OBSERVATIONAL_TRICKS,
} from '../content/freestyleObservationalTricks';
import {
  OBSERVATIONAL_UNIVERSE,
  OBSERVATIONAL_UNIVERSE_STATS,
  DOCTRINE_BLOCKING_QUESTIONS,
  type ObservationalUniverseRow,
} from '../content/freestyleObservationalUniverse';
import {
  DERIVATION_PILOT_ENTRIES,
  type DerivationPanelEntry,
} from '../content/freestyleDerivationPilot';
import {
  ROOT_TERMINAL_FAMILIES,
  BRANCH_FAMILIES,
  type GlossaryFamilyCard,
} from '../content/freestyleGlossaryFamilyCards';
import {
  ADD_WORKED_EXAMPLES,
  type GlossaryAddExample,
} from '../content/freestyleGlossaryAddExamples';
import {
  getEquivalenceTopologyFor,
  type EquivalenceTopologyEntry,
} from '../content/freestyleEquivalenceTopology';
import { CORE_TRICKS, isCoreTrick } from './coreTrickRegistry';
import {
  SymbolicLearnIndexContent,
  buildSymbolicLearnIndex,
} from './symbolicLearnIndex';
import {
  InsightsTrick,
  InsightsTransition,
  InsightsSequence,
  InsightsDiversePlayer,
  FreestyleHistoryPioneer,
  FreestyleHistoryEra,
  INSIGHTS_MOST_USED,
  INSIGHTS_CONNECTORS,
  INSIGHTS_TRANSITIONS,
  INSIGHTS_SEQUENCES,
  INSIGHTS_DIVERSE_PLAYERS,
  HISTORY_PIONEERS,
  HISTORY_ERAS,
  HISTORY_ADD_SYSTEM,
} from '../content/freestyleEditorial';

// ---------------------------------------------------------------------------
// Record type labels
// ---------------------------------------------------------------------------
const RECORD_TYPE_LABELS: Record<string, string> = {
  trick_consecutive:        'Consecutive Completions',
  trick_consecutive_dex:   'Consecutive Completions (Dex)',
  trick_consecutive_juggle: 'Consecutive Juggle',
};

function labelForType(recordType: string): string {
  return RECORD_TYPE_LABELS[recordType] ?? recordType;
}

// ── Media-tag display shaping (LANDING-AND-TRICKS-QA-REALIGNMENT-1 F7) ───
// Raw tags come from media_tags.tag_display (e.g., "#torque", "#curated",
// "#trick"). The browse-surface render filters out noise (`#trick` is
// universally redundant on freestyle media; `#freestyle` is redundant on
// freestyle-only surfaces; `#unavailable_embed` is implementation state)
// and sorts the remainder by pedagogical priority so trick-slug tags lead.
//
// Restraint-first: maintainer-named hard requirement. Hashtag
// layer is part of the visible symbolic/navigation language, not hidden
// metadata. Goal: pedagogical readability via repeated exposure.
const MEDIA_TAG_SUPPRESS = new Set(['#trick', '#unavailable_embed']);
const MEDIA_TAG_KIND_ORDER: MediaTagDisplay['kind'][] = [
  'trick', 'source', 'creator', 'content-type', 'event', 'discipline', 'quality',
];
const MEDIA_TAG_KNOWN_SOURCES = new Set([
  '#passback_records', '#tricks_of_the_trade', '#shred_global',
  '#anz_trikz', '#footbag_finland', '#footbag_hof_archive',
]);
const MEDIA_TAG_KNOWN_CONTENT_TYPES = new Set(['#tutorial', '#demo']);
const MEDIA_TAG_KNOWN_DISCIPLINES = new Set(['#freestyle', '#net', '#chinlone']);
const MEDIA_TAG_KNOWN_QUALITY = new Set(['#curated']);

function classifyMediaTag(tag: string): MediaTagDisplay['kind'] {
  if (tag.startsWith('#by_'))    return 'creator';
  if (tag.startsWith('#event_')) return 'event';
  if (MEDIA_TAG_KNOWN_SOURCES.has(tag))       return 'source';
  if (MEDIA_TAG_KNOWN_CONTENT_TYPES.has(tag)) return 'content-type';
  if (MEDIA_TAG_KNOWN_DISCIPLINES.has(tag))   return 'discipline';
  if (MEDIA_TAG_KNOWN_QUALITY.has(tag))       return 'quality';
  // Anything else with `#`-prefix and a kebab-case body is treated as a
  // trick-slug tag. This matches the rendered DB inventory (~80 trick slugs).
  return 'trick';
}

export function shapeMediaTagsForBrowse(
  rawTags: readonly string[],
  opts: { surfaceContext?: 'freestyle-only' | 'cross-discipline' } = {},
): MediaTagDisplay[] {
  const surfaceContext = opts.surfaceContext ?? 'freestyle-only';
  const seen = new Set<string>();
  const out: MediaTagDisplay[] = [];
  for (const raw of rawTags) {
    if (!raw) continue;
    const tag = raw.trim();
    if (!tag.startsWith('#')) continue;
    if (MEDIA_TAG_SUPPRESS.has(tag)) continue;
    if (surfaceContext === 'freestyle-only' && tag === '#freestyle') continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push({ display: tag, kind: classifyMediaTag(tag) });
  }
  out.sort((a, b) => {
    const ai = MEDIA_TAG_KIND_ORDER.indexOf(a.kind);
    const bi = MEDIA_TAG_KIND_ORDER.indexOf(b.kind);
    if (ai !== bi) return ai - bi;
    return a.display.localeCompare(b.display);
  });
  return out;
}

/**
 * Load the system-account-owned demo loop by source filename.
 * Returns null if no FH-owned media with that filename exists (e.g., before
 * the curator seed has run).
 */
function loadCuratorDemoVideo(sourceFilename: string): FreestyleDemoVideo | null {
  const row = media.getCuratorMediaByFilename.get(sourceFilename) as
    | CuratorSlotMediaRow
    | undefined;
  if (!row || row.media_type !== 'video' || !row.video_id) return null;
  const adapter = getMediaStorageAdapter();
  return {
    mp4Url: `${adapter.constructURL(row.video_id)}?v=${row.id}`,
    posterUrl: row.thumbnail_url ?? '',
    caption: row.caption ?? '',
  };
}

// ---------------------------------------------------------------------------
// Shaped types for templates
// ---------------------------------------------------------------------------

export interface FreestyleRecordGroup {
  recordType: string;
  label: string;
  records: FreestyleRecordViewModel[];
}

export interface FreestyleRecordsContent {
  groups: FreestyleRecordGroup[];
  totalRecords: number;
  totalHolders: number;
}

export interface FreestyleLeaderViewModel {
  rank: number;
  holderName: string;
  holderHref: string | null;
  recordCount: number;
  topValue: number;
  topTrick: string | null;
}

export interface FreestyleLeadersContent {
  leaders: FreestyleLeaderViewModel[];
  totalHolders: number;
  totalRecords: number;
}

export interface FreestyleLandingExplainer {
  /** Optional section heading. Empty string when no heading should render
   *  (e.g. portal lede paragraphs that sit directly under the hero
   *  without an h2 banner). */
  heading: string;
  paragraphs: string[];
}

export interface FreestyleDemoVideo {
  mp4Url: string;
  posterUrl: string;
  caption: string;
}

// Core Tricks compact symbolic object — see PART H-pre of the IA plan.
// A canonical row is rendered as: #slug + zero-or-more `≡ reading` lines +
// optional symbolic notation + ADD. Atoms typically omit the `≡` and
// symbolic-notation slots; compounds typically surface one or more `≡`
// stopping-depth readings.
//
// Field naming: `addNumeric` (not `add`) avoids collision with the
// Handlebars helper named `add` registered in src/app.ts. The template
// renders `{{addNumeric}}` — using `{{add}}` would resolve to the helper
// and produce "[object Object]undefined" output.
export interface FreestyleCoreTrickCard {
  slug:                 string;        // "around-the-world"; the canonical DB slug (drives anchor + href)
  displaySlug:          string;        // visible #-tag; equals slug unless CoreTrickSpec.displaySlug overrides
  semanticEquivalences: string[];      // ["ATW"]; empty for irreducible atoms
  symbolicNotation:     string | null; // null when the `≡` reading carries the symbolic info
  addNumeric:           number | null; // null when DB row is missing (renders "—" + footnote)
  addPending:           boolean;       // true when addNumeric is null
}

// Featured-strip item — a single compact card on the merged landing
// "Featured" strip. The
// strip merges what were two separate sections (Competition Formats +
// Demonstrations) into one curated grid. Both kinds use the same shape;
// competition-format identity comes from the title (Routine / Circle /
// Sick 3 / Shred 30), not from a separate field. Tags optional: format
// cards typically have none (title carries the format anchor); curated
// demonstrations carry source/creator/quality chips.
export interface FreestyleFeaturedItem {
  key:     string;             // stable id for anchors (e.g., "routine", "conlon-1998")
  title:   string;             // display heading (e.g., "Routine", "Footbag 2026: San Marino")
  caption: string | null;      // optional one-line context; never a paragraph
  media:   VideoMedia;         // video-facade payload (required; never null)
  tags:    MediaTagDisplay[];  // optional chips; empty on format cards
}

// One displayable media-tag chip. `kind` drives optional CSS tier styling.
// Built by shapeMediaTagsForBrowse from raw `#`-prefixed tag strings.
export interface MediaTagDisplay {
  display: string;   // verbatim including '#' prefix (e.g., "#torque")
  kind:    'trick' | 'source' | 'creator' | 'content-type' | 'event' | 'quality' | 'discipline';
}

export interface FreestyleMosaicCell {
  slug: string;
  label: string;
  href: string;
  mp4Url: string | null;
  posterUrl: string | null;
}

// "Freestyle by the Numbers" landing band: six summary cards, each a different
// lens on the same dictionary, computed live (never baked) and each a gateway
// into its matching browse axis.
export interface FreestyleByNumbersBar {
  label: string;
  count: number;
  percent: number;       // share of the dictionary total (0..100)
  widthBucket: number;   // 5..100; reuses the .gloss-bar-fill--w{n} width classes
}
export interface FreestyleByNumbersCard {
  key: string;
  eyebrow: string;       // the question this histogram answers
  title: string;
  viewKey: string;        // browse-axis value; template builds /freestyle/tricks?view={viewKey}
  footnote: string | null;
  bars: FreestyleByNumbersBar[];
}

// Compute the six histogram cards from the already-loaded trick rows + the
// modifier-link feed. Trick-kind population only (resolveTrickKind === 'trick'),
// so the counts match the dictionary browse views the cards link into.
// A body primitive that is its own base (the hop-over) is not a dex sequence, so
// empty operational_notation means zero dexterity events, not an unknown/pending
// count. Dex-bearing body compounds resolve to a different base, so they stay
// Unknown until notated.
function isDexlessBodyAtom(r: { category: string | null; base_trick: string | null; slug: string }): boolean {
  return r.category === 'body' && r.base_trick === r.slug;
}

function buildFreestyleByNumbers(
  trickRows: readonly FreestyleTrickRow[],
  linkRows: readonly FreestyleTrickModifierLinkRow[],
): { cards: FreestyleByNumbersCard[]; note: string } {
  const tricks = trickRows.filter(r => resolveTrickKind(r.slug) === 'trick');
  const N = Math.max(1, tricks.length);   // uniform denominator: the trick-kind total
  const inc = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

  // Bar width AND percent are both a share of the dictionary total N (not of the
  // largest row), so every card is directly comparable.
  const bar = (label: string, count: number): FreestyleByNumbersBar => ({
    label: label.replace(/-/g, ' '),
    count,
    percent: Math.round((count / N) * 100),
    widthBucket: Math.min(100, Math.max(5, Math.round(((count / N) * 100) / 5) * 5)),
  });
  const ordered = (counts: Map<string, number>, order: string[]): FreestyleByNumbersBar[] =>
    order.filter(k => counts.has(k)).map(k => bar(k, counts.get(k)!));
  const top = (counts: Map<string, number>, n: number): FreestyleByNumbersBar[] =>
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => bar(k, c));
  // Family endings keeps the glossary's terminal ordering (the catch-surface
  // roots clipper/toe lead, then the families) so the two surfaces never drift.
  const histTop = (hist: readonly TopologyHistogramRow[], n: number): FreestyleByNumbersBar[] =>
    hist.slice(0, n).map(h => bar(h.label, h.count));

  const dexCount = (r: FreestyleTrickRow): string => {
    const op = r.operational_notation;
    if (!op || !op.trim()) return isDexlessBodyAtom(r) ? '0' : 'Unknown';
    const n = (op.match(/\[DEX\]/g) ?? []).length;
    return n >= 3 ? '3+' : String(n);
  };
  const entrySurface = (op: string | null): string | null => {
    const o = (op ?? '').trim().toUpperCase();
    if (o.startsWith('TOE')) return 'toe set';
    if (o.startsWith('CLIP')) return 'clip set';
    return null;
  };

  const add = new Map<string, number>();
  const dex = new Map<string, number>();
  const entry = new Map<string, number>();
  for (const r of tricks) {
    if (r.adds != null) inc(add, String(r.adds));
    inc(dex, dexCount(r));
    const e = entrySurface(r.operational_notation);
    if (e) inc(entry, e);
  }

  const trickKind = new Set(tricks.map(r => r.slug));
  const SET_SYSTEMS = new Set(['symposium', 'paradox', 'pixie', 'fairy', 'stepping', 'quantum', 'atomic', 'blurry', 'nuclear', 'furious']);
  const bodyMods = new Map<string, number>();
  const allMods = new Map<string, number>();
  for (const l of linkRows) {
    if (!trickKind.has(l.trick_slug)) continue;
    inc(allMods, l.modifier_slug);
    // Body = movement operators only; the set-system launchers belong to Entry,
    // so Body and Components read as genuinely different lenses.
    if (!SET_SYSTEMS.has(l.modifier_slug)) inc(bodyMods, l.modifier_slug);
    if (SET_SYSTEMS.has(l.modifier_slug)) inc(entry, l.modifier_slug);   // entry = catch surfaces + set systems
  }

  const unknownDex = dex.get('Unknown') ?? 0;
  const cards: FreestyleByNumbersCard[] = [
    { key: 'difficulty', eyebrow: 'How layered are tricks?', title: 'Difficulty',
      viewKey: 'add', footnote: null, bars: ordered(add, ['1', '2', '3', '4', '5', '6', '7', '8']) },
    { key: 'dexterity', eyebrow: 'How many dexes define tricks?', title: 'Dexterity',
      viewKey: 'dex-count', footnote: null, bars: ordered(dex, ['0', '1', '2', '3+', 'Unknown']) },
    { key: 'entry', eyebrow: 'How do tricks begin?', title: 'Entry sets',
      viewKey: 'sets', footnote: null, bars: top(entry, 20) },
    { key: 'terminal', eyebrow: 'How do tricks finish?', title: 'Family endings',
      viewKey: 'family', footnote: null, bars: histTop(FAMILY_HISTOGRAM, 20) },
    { key: 'body', eyebrow: 'What body movements shape tricks?', title: 'Body movements',
      viewKey: 'movement-system', footnote: null, bars: top(bodyMods, 10) },
    { key: 'component', eyebrow: 'What modifiers dominate?', title: 'Components',
      viewKey: 'component', footnote: null, bars: top(allMods, 10) },
  ];
  return { cards, note: `Counts shown out of ${N} tricks; ${unknownDex} pending notation.` };
}

export interface FreestyleLandingContent {
  mascotSrc: string;
  mascotAlt: string;
  /** "What is Freestyle?" intro — heading + paragraphs, rendered as the
   *  first section under the hero, ahead of the demo video. */
  intro: FreestyleLandingExplainer;
  demoVideo: FreestyleDemoVideo | null;
  // Featured strip — competition formats + curated demonstrations rendered
  // in one compact grid. Empty array hides the section content.
  featured: FreestyleFeaturedItem[];
  // Lower enrichment band: 12 labelled core-atom cells, each loading a curated
  // loop or showing a labelled empty tile. tricksMosaicHasClips is false until any
  // clip is curated, which the landing uses to keep the band quiet meanwhile.
  tricksMosaic: FreestyleMosaicCell[];
  tricksMosaicHasClips: boolean;
  // "Freestyle by the Numbers" band: six live histogram summary cards + a
  // shared denominator note (all cards normalized to the trick-kind total).
  byTheNumbers: FreestyleByNumbersCard[];
  byTheNumbersNote: string;
  // Media-section gallery links, null when the gallery is not seeded.
  mediaRecordsHref: string | null;
  mediaCuratedHref: string | null;
  mediaShredHref: string | null;
  // Coming-soon gating for the Start Here / Go Deeper portal cards.
  totalTricks: number;
  totalRecords: number;
}

// ── Operator Board ──────────────────────────────────────────────────────
// The landing-page mini-board introduces the Tier-1 operator vocabulary
// (13 operators across set / body / structural tiers). Cells with
// curatorConfirmPending=true require a curator accuracy pass before any
// prose lock.
export interface OperatorBoardOperator {
  glyph:                  string;   // e.g. "PIX"
  name:                   string;   // e.g. "Pixie"
  action:                 string;   // one-line plain-English action
  compositionA:           string;   // left side of "A + BASE → RESULT"
  compositionResult:      string;   // result name on the right of the arrow
  curatorConfirmPending:  boolean;  // true for [curator confirm] cells
  // Restrained deep-link to the single most authoritative existing surface
  // for this operator. null when no mature destination exists: don't fabricate
  // maturity. href + hrefLabel are paired; both populated or both null.
  href:                   string | null;   // absolute path with anchor
  hrefLabel:              string | null;   // short destination-type label
}
export interface OperatorBoardTier {
  key:       'set' | 'body' | 'structural';
  eyebrow:   string;   // "I · Sets"
  title:     string;   // "Set operators"
  intro:     string;   // "What sends the bag into the air."
  operators: OperatorBoardOperator[];
}
export interface OperatorBoardData {
  heading: string;
  lede:    string;
  tiers:   OperatorBoardTier[];
}
// Surface tag for the connective-prose lookup. The tiers are surface-invariant;
// only heading + lede change. Default is 'landing' to keep the original call
// site (FreestyleService.getLandingPage) unchanged.
export type OperatorBoardSurface = 'landing' | 'glossary' | 'learn';
const OPERATOR_BOARD_PROSE: Record<OperatorBoardSurface, { heading: string; lede: string }> = {
  // Ledes are one short sentence each; the tier eyebrow + card grid
  // do the structural teaching.
  landing: {
    heading: 'The operators of freestyle',
    lede:    'Fourteen primitives. Combine them to build every named trick.',
  },
  glossary: {
    heading: 'The compositional vocabulary',
    lede:    'Fourteen primitive operators. The sections below define each in depth.',
  },
  learn: {
    heading: 'Start with the operators',
    lede:    'Learn these fourteen primitives first; every other surface assumes their vocabulary.',
  },
};

interface TrickRefMediaRow {
  id: string;
  video_id: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  video_platform: string | null;
  uploaded_at: string;
  source_id: string | null;
}

// ── Semantic-notation fallback ladder (NF-2B) ────────────────────────────
// Per-trick semantic-notation rendering. Picks one of four layers:
//   layer='equivalence'   — curator-authored chain from freestyleSymbolicEquivalences
//   layer='base-lineage'  — "Built on {base}" derived from row.base_trick
//   layer='curation-gap'  — "Compositional reading pending curation." cue
//   (null)                — no semantic-notation block (Layer 1 alone, or core atom silence)
// Reads ONLY: row.slug, row.notation, row.base_trick, plus dictBySlug for base
// resolution and the two registries (CORE_TRICKS + OPERATOR_REFERENCE_ENTRIES) for
// shallow token recognition. Never tokenizes canonical_name; never recurses;
// never auto-generates chain content.

export interface SemanticNotationToken {
  kind: 'link' | 'plain';
  text: string;
  href: string | null;
}
export interface SemanticNotationReading {
  tokens:     SemanticNotationToken[];
  depthIndex: number;   // 0 = primary; later indices visually descend (100/92/86% scale)
}
export interface SemanticNotation {
  layer:                 'equivalence' | 'base-lineage' | 'curation-gap';
  // Pre-shaped layer booleans; templates branch on these, never on the
  // raw layer code.
  isEquivalenceLayer:    boolean;
  isBaseLineageLayer:    boolean;
  isCurationGapLayer:    boolean;
  // Equivalence layer fields:
  readings:              SemanticNotationReading[];
  curatorConfirmPending: boolean;
  // Base-lineage layer fields:
  baseSlug:              string | null;
  baseName:              string | null;
  // Source attribution (const literal; never claims parser provenance)
  sourceLabel:           'editorial';
}

// Equivalence-topology view. Service-boundary shape for the alternate-
// derivations disclosure on trick-detail: each derivation row carries
// pre-shaped chip/badge labels so the template never renders the raw
// role/source codes as visible text (the codes remain available for
// CSS-class modifiers only).
export interface EquivalenceTopologyDerivationView {
  reading:       string;
  addBreakdown:  string | null;
  role:          string;   // CSS-class modifier only
  source:        string;   // CSS-class modifier only
  roleLabel:     string;   // visible badge text, e.g. 'alternate equivalent'
  sourceLabel:   string;   // visible chip text, e.g. 'curator derived'
  showRoleBadge: boolean;  // false for the canonical-primary row
}
export interface EquivalenceTopologyView {
  summary:     string;
  derivations: EquivalenceTopologyDerivationView[];
}

const DERIVATION_ROLE_LABELS: Record<string, string> = {
  'canonical-primary':         'canonical',
  'alternate-equivalent':      'alternate equivalent',
  'historical':                'historical',
  'doctrine-locked-alternate': 'doctrine-locked alternate',
  'deprecated':                'deprecated',
};
const DERIVATION_SOURCE_LABELS: Record<string, string> = {
  'curator-derived': 'curator derived',
  'historical':      'historical',
  'community':       'community',
  'structural':      'structural',
};

function shapeEquivalenceTopologyView(entry: EquivalenceTopologyEntry): EquivalenceTopologyView {
  return {
    summary: entry.summary,
    derivations: entry.derivations.map((d) => ({
      reading:       d.reading,
      addBreakdown:  d.addBreakdown ?? null,
      role:          d.role,
      source:        d.source,
      roleLabel:     DERIVATION_ROLE_LABELS[d.role] ?? d.role.replace(/-/g, ' '),
      sourceLabel:   DERIVATION_SOURCE_LABELS[d.source] ?? d.source.replace(/-/g, ' '),
      showRoleBadge: d.role !== 'canonical-primary',
    })),
  };
}

// Cross-link surface for /freestyle/sets. Each row carries the
// display label, its set/operational notation (or null for variant-tag list
// items that have no notation column), a stable anchor id, and an optional
// `trickHref` resolved against the active trick dictionary. The match rule
// is strict: slugify(label) must equal a public freestyle_tricks.slug. No
// representative-link guesses, no modifier-page links, no compound-label
// editorial mapping.
export interface FreestyleMoveLabel {
  label:     string;
  notation:  string | null;
  matchSlug: string | null;     // slugified label when it matches a public trick slug; else null
  trickHref: string | null;     // /freestyle/tricks/<matchSlug> when matchSlug; else null
  anchorId:  string;            // move-<slugified-label>; stable for every row
}

export interface FreestyleMovesContent {
  basicSets:          FreestyleMoveLabel[];
  spinningVariants:   FreestyleMoveLabel[];
  whirlSwirlVariants: FreestyleMoveLabel[];
  unsVariants:        FreestyleMoveLabel[];
  antisymposium:      FreestyleMoveLabel[];
  components:         FreestyleMoveLabel[];
}

// View-model shapes for /freestyle/compositional-sets. Service-shaped
// from src/content/freestyleCompositionalSets.ts plus a live dictionary
// lookup that resolves each card's canonical link target.
export interface CompositionalSetCardView {
  name:           string;
  notation:       string;
  /** Resolved status — 'canonical' iff a dictionary slug exists. */
  status:         'canonical' | 'platform-tracked' | 'holden-only';
  /** Visible badge text for non-canonical cards; null for canonical. */
  statusLabel:    string | null;
  /** Pre-shaped badge gate; templates never compare the raw status. */
  showStatusBadge: boolean;
  /** /freestyle/tricks/<slug> when status === 'canonical'; null otherwise. */
  trickHref:      string | null;
  /** Stable per-card anchor (kebab-case). */
  anchorId:       string;
  structuralNote: string | null;
}

export interface CompositionalSetFamilyView {
  key:     string;
  name:    string;
  intro:   string;
  members: CompositionalSetCardView[];
}

export interface UptimeReinterpretationLadderView {
  setName:          string;
  setNotation:      string;
  reinterpretation: string;
  steps:            readonly string[];
  sourceCitation:   string;
  conflictNote:     string | null;
  anchorId:         string;
}

export interface CompositionalAuditEntryView {
  holdenName:      string;
  holdenReading:   string;
  platformReading: string | null;
  status:          'aligned' | 'partial' | 'conflict' | 'holden-only';
  statusLabel:     string;  // pre-shaped label for the badge ("Aligned", "Partial fit", etc.)
  note:            string | null;
}

export interface CompositionalAuditSummary {
  aligned:    number;
  partial:    number;
  conflict:   number;
  holdenOnly: number;
  /** Total entries audited. */
  total:      number;
}

export interface FreestyleCompositionalSetsContent {
  premise: {
    canonicalFormula: string;
    softenerNote:     string;
    examples:         { name: string; notation: string; trickHref: string | null }[];
  };
  families: CompositionalSetFamilyView[];
  ladders:  UptimeReinterpretationLadderView[];
  audit: {
    summary:       CompositionalAuditSummary;
    /** Curated headline entries (one per status category, plus a few additional). */
    headlineRows:  CompositionalAuditEntryView[];
    /**
     * Exploration-doc cross-link. The full row-by-row audit lives there;
     * the public surface stays compact.
     */
    fullAuditNote: string;
  };
  crossLinks: {
    setsReferenceHref:    string;
    operatorsHref:        string;
    glossaryNotationHref: string;
  };
}

// Kebab-case slug derivation for /freestyle/sets labels. Distinct from the
// underscore-style slugify in src/services/slugify.ts because trick slugs in
// the dictionary are kebab-case. Anchor ids on this page derive from this
// function regardless of whether the label matches a trick — every row gets
// a stable id for future backlinking.
function movesAnchorSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s*\/\s*/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const SOURCE_LABELS: Record<string, string> = {
  tt_youtube:           'Tricks of the Trade',
  passback_records:     'Passback record',
  anz_trikz:            "Anz' Trikz",
  footbag_finland:      'Footbag Finland',
  shred_global:         'Shred Global',
  flipsider_footbag:    'Flipsider',
  footbagspot_passback: 'FootbagSpot',
  footbagspot_tutorials:'FootbagSpot Tutorials',
  passback_demos:       'PassBack',
  passback_basics:      'PassBack Basics',
};

// Single source-of-truth tier registry for the badge logic and the
// trick-detail Reference Media split (Tutorials vs Demos). The prior
// TUTORIAL_SOURCE_IDS / DEMO_SOURCE_IDS Sets were folded into this map so
// all source-id classification reads from one place. Per-clip override
// (sidecar `tier` field flowing into DB) is deferred until that override
// path is wired end-to-end through curator ingest.
//
// Tier semantics:
//   - TUTORIAL:      explicit teaching intent (technique cues, breakdown).
//                    Drives "Tutorial available" badge and tutorialMedia bucket.
//   - DEMONSTRATION: single-clip "what the trick looks like done well",
//                    no teaching intent. Drives "Demo only" badge.
//   - RECORD:        competitive consecutive-completion clips. Surfaced via
//                    /freestyle/records and the Passback Records table on
//                    trick-detail; never appears in the Reference Media
//                    Tutorial/Demo split.
export type MediaTier = 'TUTORIAL' | 'DEMONSTRATION' | 'RECORD';

export const SOURCE_TIER: Record<string, MediaTier> = {
  // Canonical / strong tutorial sources.
  tt_youtube:            'TUTORIAL',
  footbagspot_tutorials: 'TUTORIAL',
  polini_pointers:       'TUTORIAL',
  footbag_foundations:   'TUTORIAL',
  everything_footbag:    'TUTORIAL',
  passback_basics:       'TUTORIAL',

  // Mixed-character sources held at TUTORIAL until the per-clip override
  // path lands. Blanket reclassification would drop real instructional
  // clips inside these sources, so sidecar-level override is the right fix.
  anz_trikz:             'TUTORIAL',
  footbagspot_passback:  'TUTORIAL',

  // Demonstration sources: single-trick showcase clips with no teaching
  // intent. shred_global entries follow the caption pattern
  //   "Footbag Freestyle Trick: <name> (<add>add) by <player>".
  shred_global:          'DEMONSTRATION',
  footbag_finland:       'DEMONSTRATION',
  flipsider_footbag:     'DEMONSTRATION',
  passback_demos:        'DEMONSTRATION',

  // Record-tier: never bucketed as Tutorial/Demo on trick-detail.
  passback_records:      'RECORD',
};

export function tierOf(sourceId: string | null | undefined): MediaTier | null {
  if (!sourceId) return null;
  return SOURCE_TIER[sourceId] ?? null;
}

function shapeReferenceMedia(
  row: TrickRefMediaRow,
  rawTags: readonly string[] = [],
): TrickReferenceMediaItem {
  const adapter = getMediaStorageAdapter();
  const media = expandVideoFromMediaItem(row, {
    constructURL: (key) => adapter.constructURL(key),
    videoTitle: row.caption ?? '',
  });
  return {
    mediaId: row.id,
    media,
    caption: row.caption ?? null,
    sourceLabel: row.source_id ? (SOURCE_LABELS[row.source_id] ?? row.source_id) : null,
    tags: shapeMediaTagsForBrowse(rawTags, { surfaceContext: 'freestyle-only' }),
  };
}

// Shared core-tricks shaper.
// Both getLandingPage and getGlossaryPage (§10) build the same compact
// symbolic-object grid; the helper centralizes the join between the
// curator-authoritative CORE_TRICK_SPEC and the freestyle_tricks DB rows
// (ADD value + optional symbolic notation).
function shapeCoreTricks(trickRows: FreestyleTrickRow[]): FreestyleCoreTrickCard[] {
  return CORE_TRICK_SPEC.map(spec => {
    const row = trickRows.find(t => t.slug === spec.slug);
    const parsedAdd = row && row.adds != null ? Number(row.adds) : NaN;
    const hasAdd = Number.isFinite(parsedAdd);
    // Notation normalization:
    //   - symbolicNotation sources from CoreTrickSpec.operationalNotation
    //     (curator-authored TS content module), not the DB operational_notation
    //     column. TS is source-of-truth for atom op-notation.
    //   - semanticEquivalences takes only the first reading (descriptive
    //     prose). The accounting formula equivalences[1] is preserved in the
    //     content module but no longer rendered on the public landing grid;
    //     prune in the shaping helper, not the template.
    //     Accounting derivations remain accessible at /freestyle/add-analysis.
    return {
      slug:                 spec.slug,
      displaySlug:          spec.displaySlug ?? spec.slug,
      semanticEquivalences: [spec.equivalences[0]!],
      symbolicNotation:     spec.operationalNotation,
      addNumeric:           hasAdd ? parsedAdd : null,
      addPending:           !hasAdd,
    };
  });
}

// Set-modifier registry shaper. Projects (a) the Tier-1 set
// operators from the operator board + (b) intermediate set/compound-set
// entries from OPERATOR_REFERENCE_ENTRIES onto one flat
// FreestyleSetModifierEntry[] for the glossary §10 grid. De-dup: when a
// slug appears in both sources, the OPERATOR_REFERENCE entry wins (its
// `oneLineMeaning` + `decomposition` carry richer registry content).
function shapeSetModifiers(board: OperatorBoardData): FreestyleSetModifierEntry[] {
  const setTier = board.tiers.find(t => t.key === 'set');
  // The set-primitive grid is the glossary anchor home only for set primitives
  // that no other Modifiers & Operators surface owns. Atomic / Quantum / Blurry /
  // Nuclear / Barraging carry their full decomposition + worked examples in the
  // intermediate-operators list, and Stepping is defined in the body-modifier
  // reference; rendering them here too would duplicate each operator's
  // term-{slug} anchor onto two elements. Excluding them leaves Pixie and Fairy,
  // whose term-anchor link target lives nowhere else.
  const ownedElsewhere = new Set<string>([
    ...OPERATOR_REFERENCE_ENTRIES.map(e => e.slug),
    'stepping',
  ]);
  return (setTier?.operators ?? [])
    .map(op => ({
      slug:           op.name.toLowerCase().replace(/\s+/g, '-'),
      name:           op.name,
      glyph:          op.glyph,
      oneLineMeaning: op.action,
      decomposition:  null,
      href:           op.href,
    }))
    .filter(e => !ownedElsewhere.has(e.slug));
}

// Operators index: compact rows grouped by movement-system axis. Per-row data is
// composed from the modifier table (name + ADD weight), the canonical-set
// formulas (set-only notation), the feel cards + operator reference (descriptor),
// and the teaching-page + doctrine-pending flags (status pill). A row's notation
// line appears only when the modifier exists as a canonical set, so body
// modifiers never carry a fabricated notation.
const operatorTitleCase = (slug: string): string =>
  slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

function operatorFeelCard(slug: string): ModifierFeelCard | undefined {
  return SET_MODIFIER_FEEL_CARDS.find(c => c.slug === slug)
    ?? BODY_MODIFIER_FEEL_CARDS.find(c => c.slug === slug);
}

// Set-only notation: a modifier carries a notation line only when it exists as a
// canonical set, so body modifiers never show a fabricated formula.
function operatorNotation(slug: string): string | null {
  return CANONICAL_SETS.find(s => s.slug === slug)?.formula ?? null;
}

function operatorAddLabel(row: FreestyleTrickModifierRow | undefined): string | null {
  if (!row) return null;
  return row.add_bonus === row.add_bonus_rotational
    ? `+${row.add_bonus}`
    : `+${row.add_bonus} / +${row.add_bonus_rotational} rot`;
}

// Execution-mechanic definitions for the no-plant modifiers that have no feel
// card or operator-reference entry, so their index row + stub still describe
// themselves once the shared advanced-reference is off the operators page.
const MODIFIER_EXECUTION_NOTES: Readonly<Record<string, string>> = {
  symple: 'Starts as symposium, but mid-component the non-symple foot returns to the ground. The shorthand "symp" can mean symposium or symple, whichever the component naturally is.',
  muted:  'An active leg held in the air for an entire component without planting. Mostly used for dexes, but applies to other components too.',
};

function operatorDescriptor(slug: string): string | null {
  return operatorFeelCard(slug)?.feel
    ?? getOperatorReferenceEntry(slug)?.oneLineMeaning
    ?? MODIFIER_EXECUTION_NOTES[slug]
    ?? null;
}

// Honest status pill: a hand-authored teaching page wins; otherwise a
// curator-pending decomposition reads as doctrine-pending; everything tracked in
// the modifier vocabulary reads as platform-tracked.
function operatorStatus(slug: string): { key: string; label: string } {
  if (hasModifierFamilyPage(slug)) return { key: 'teaching', label: 'Teaching page' };
  if (getOperatorReferenceEntry(slug)?.curatorConfirmPending) {
    return { key: 'doctrine-pending', label: 'Doctrine-pending' };
  }
  return { key: 'platform-tracked', label: 'Platform-tracked' };
}

// Short type label for modifiers outside the curated index (fallback for the
// stub page); the curated index uses its axis's typeLabel directly.
const MODIFIER_TYPE_LABEL: Readonly<Record<string, string>> = {
  set: 'Set', body: 'Body', 'rotational-qualifier': 'Rotational',
};

// A slug is a known modifier (resolves to a detail page, not a 404) when it is
// in the curated index, the modifier table, or the operator reference.
function isKnownModifier(slug: string, row: FreestyleTrickModifierRow | undefined): boolean {
  return OPERATOR_INDEX_SLUGS.has(slug) || row != null || getOperatorReferenceEntry(slug) != null;
}

function buildOperatorIndexAxes(
  modifierRows: readonly FreestyleTrickModifierRow[],
): OperatorIndexAxisGroup[] {
  const rowBySlug = new Map(modifierRows.map(r => [r.slug, r]));
  return OPERATOR_INDEX_AXES.map(axis => ({
    axisKey:  axis.axisKey,
    axisName: axis.axisName,
    modifiers: axis.modifierSlugs.map((slug): OperatorIndexRow => {
      const row = rowBySlug.get(slug);
      return {
        slug,
        name:       row?.modifier_name ?? operatorFeelCard(slug)?.name ?? operatorTitleCase(slug),
        hashtag:    `#${slug}`,
        typeLabel:  axis.typeLabel,
        addLabel:   operatorAddLabel(row),
        notation:   operatorNotation(slug),
        descriptor: operatorDescriptor(slug),
        status:     operatorStatus(slug),
        subFamilyLabel: axis.subFamilies?.find(sf => sf.firstSlug === slug)?.label ?? null,
      };
    }),
  }));
}

// §5 family-tree shaping. Curator-selected pilot families: the four
// whose compound membership is dense enough to teach the "anchor +
// branched modifiers" pattern. Members are sorted by ADD ascending
// (then by canonical name), capped to keep the visual budget tight.
const FAMILY_TREE_PILOTS: readonly string[] = ['whirl', 'butterfly', 'mirage', 'osis'];
const FAMILY_TREE_MEMBER_CAP = 7;

function shapeFamilyTrees(trickRows: readonly FreestyleTrickRow[]): FreestyleFamilyTree[] {
  const trees: FreestyleFamilyTree[] = [];
  for (const anchorSlug of FAMILY_TREE_PILOTS) {
    const anchorRow = trickRows.find(r => r.slug === anchorSlug);
    const anchorAdds = anchorRow && anchorRow.adds != null
      ? Number(anchorRow.adds)
      : NaN;
    const compounds = trickRows
      .filter(r => r.trick_family === anchorSlug && r.slug !== anchorSlug)
      .sort((a, b) => {
        const aAdds = a.adds != null ? Number(a.adds) : Number.POSITIVE_INFINITY;
        const bAdds = b.adds != null ? Number(b.adds) : Number.POSITIVE_INFINITY;
        if (aAdds !== bAdds) return aAdds - bAdds;
        return a.canonical_name.localeCompare(b.canonical_name);
      })
      .slice(0, FAMILY_TREE_MEMBER_CAP)
      .map<FreestyleFamilyTreeMember>(r => {
        const parsed = r.adds != null ? Number(r.adds) : NaN;
        return {
          slug:    r.slug,
          display: r.canonical_name,
          adds:    Number.isFinite(parsed) ? parsed : null,
          href:    `/freestyle/tricks/${r.slug}`,
        };
      });
    trees.push({
      anchorSlug,
      anchorDisplay: anchorRow?.canonical_name ?? anchorSlug,
      anchorAdds:    Number.isFinite(anchorAdds) ? anchorAdds : null,
      members:       compounds,
    });
  }
  return trees;
}

// Pathway-block shaping for the trick detail page. Bundles three pre-shaped
// summaries so the template renders without any business logic. Every string
// the template will display is built here; href anchors point at existing
// detail-page sections.
function shapeTrickPathways(args: {
  tutorialCount: number;
  demoCount: number;
  recordCount: number;
  topRecordHolder: string | null;
  topRecordValue: number;
  familySlug: string | null;
  familyName: string | null;
  familyMemberCount: number;  // already-rendered-on-page family ladder size
}): TrickPathways {
  const { tutorialCount, demoCount, recordCount, topRecordHolder, topRecordValue,
          familySlug, familyName, familyMemberCount } = args;

  // Learn pathway. Tutorial- and demo-tier counts surface separately so the
  // wording cannot conflate them. When only demos exist the user
  // can still learn-by-watching, so the link to Reference Media still renders.
  const learnTotal = tutorialCount + demoCount;
  const tutorialFragment = `${tutorialCount} tutorial${tutorialCount === 1 ? '' : 's'}`;
  const demoFragment     = `${demoCount} demonstration${demoCount === 1 ? '' : 's'}`;
  let learnPrimaryText: string;
  if (tutorialCount > 0 && demoCount > 0) {
    learnPrimaryText = `${tutorialFragment} and ${demoFragment} available`;
  } else if (tutorialCount > 0) {
    learnPrimaryText = `${tutorialFragment} available`;
  } else if (demoCount > 0) {
    learnPrimaryText = `${demoFragment} available`;
  } else {
    learnPrimaryText = 'No tutorials yet';
  }
  const learn: TrickPathwaySummary = learnTotal > 0
    ? {
        available: true,
        count: learnTotal,
        primaryText: learnPrimaryText,
        secondaryText: null,
        href: '#media',
        hrefLabel: 'Jump to Reference Media',
      }
    : {
        available: false,
        count: 0,
        primaryText: learnPrimaryText,
        secondaryText: null,
        href: null,
        hrefLabel: null,
      };

  // Watch pathway — driven by passback record count (rendered in the records
  // table further down the page), not by record-tier media items
  const watch: TrickPathwaySummary = recordCount > 0
    ? {
        available: true,
        count: recordCount,
        primaryText: `${recordCount} record${recordCount === 1 ? '' : 's'}`,
        secondaryText: topRecordHolder
          ? `Top: ${topRecordHolder} (${topRecordValue} kicks)`
          : null,
        href: '#passback-records',
        hrefLabel: 'Jump to Passback Records',
      }
    : {
        available: false,
        count: 0,
        primaryText: 'No records yet',
        secondaryText: null,
        href: null,
        hrefLabel: null,
      };

  // Family pathway. familyMemberCount > 1 means the family ladder section
  // actually renders below; only surface the link when there's somewhere to go.
  const family: TrickPathwaySummary = familySlug && familyName && familyMemberCount > 1
    ? {
        available: true,
        count: familyMemberCount - 1,  // siblings, not counting current trick
        primaryText: `Family: ${familyName}`,
        secondaryText: `${familyMemberCount - 1} related trick${familyMemberCount - 1 === 1 ? '' : 's'}`,
        href: `/freestyle/tricks?family=${familySlug}`,
        hrefLabel: `Browse ${familyName} family`,
      }
    : {
        available: false,
        count: 0,
        primaryText: 'No family attribution yet',
        secondaryText: null,
        href: null,
        hrefLabel: null,
      };

  return { learn, watch, family };
}

export interface FreestyleRelatedGroup {
  key:       string;            // the underlying relating rule
  label:     string;            // group heading (e.g. "Same family", "Swing elements")
  rationale: string | null;     // optional one-line WHY for the whole group
  tricks:    FreestyleRelatedTrick[];
}

export interface FreestyleQuantityLadderView {
  ladderLabel: string;
  rationale:   string;
  steps: {
    label:      string;
    slug:       string | null;
    detailHref: string | null;  // null for a missing rung
    adds:       string;
    isCurrent:  boolean;
    present:    boolean;        // false = ladder member not active in the dictionary
  }[];
}

export interface FreestyleTrickModifierMembership {
  name:        string;          // modifier display name (e.g. "Paradox")
  clusterLabel: string;         // "By modifier" browse-cluster label
  axisName:    string | null;   // Movement System axis name, null when unclassified
  axisKey:     string | null;   // axis key; the template builds the ?view=movement-system deep-link from it
  gloss:       string | null;   // one-line composition gloss, null when none authored
}

export interface FreestyleTrickContent {
  trickName: string;
  sortName: string | null;
  slug: string;
  records: FreestyleRecordViewModel[];      // current holders only (superseded_by IS NULL)
  recordCount: number;
  topValue: number;
  progression: FreestyleRecordViewModel[];  // all records including superseded, newest first
  hasProgression: boolean;                  // true when any records are superseded
  // Dictionary info, null when trick has no dictionary entry
  dictEntry: FreestyleTrickDictEntry | null;
  // Family members: siblings or derivatives, sorted by ADD value
  familyMembers: FreestyleFamilyMember[];   // empty when family has only one member
  hasFamilyMembers: boolean;
  // Hero family chip — parent-resolved family; null when the trick's family is
  // a route-out (foundational surface / ecosystem / alt-surface / multi-bag).
  // The template builds the href from `slug` so the `?family=` stays literal.
  familyChip: { label: string; slug: string; isMinorLineage: boolean } | null;
  // Same family-member set as `familyMembers`, regrouped
  // by ADD value for tier-grouped rendering. Numeric tiers sort ascending;
  // non-numeric/null tier renders last as "Modifiers".
  familyTiers: FreestyleFamilyTier[];
  // Related Tricks (R1 same-family → R2 modifier-prefix → R3 grandparent),
  // ADD-bucket sampled within each rule, capped at 8. Empty when no dict entry.
  // This is the CANONICAL (Layer 1) IFPA-family-based relating.
  relatedTricks: FreestyleRelatedTrick[];
  // `relatedTricks` partitioned into the labeled relationship categories
  // (Same family / Shares a modifier / Movement neighbours / Built on /
  // Structural ancestor) by the existing per-row `rule`. Each group carries an
  // optional one-line rationale; the movement-neighbour group is re-labeled
  // "Swing elements" for the pendulum/rake pair. Empty groups are dropped.
  relatedGroups: FreestyleRelatedGroup[];
  // Quantity ladder this trick belongs to (same base, increasing repetition
  // count) — a cross-family relationship, NOT a family. Null when not a ladder
  // member. A ladder member slug absent from the dictionary renders missing.
  quantityLadder: FreestyleQuantityLadderView | null;
  // "Modifiers on this trick" — one row per modifier link, carrying its
  // browse-cluster label, Movement System axis deep-link (when classified),
  // and optional composition gloss. Always shaped from the trick's modifier
  // links, independent of the modifier-layering panel's >=3-link gate. Empty
  // when the trick carries no modifier links.
  modifierMemberships: FreestyleTrickModifierMembership[];
  // Families this trick belongs to beyond its primary family: the parent root
  // of a branch family (branch->root containment) plus any curator
  // dual-memberships. The template builds the `?family=` href from `slug`
  // (single-variable URL). Empty for root-family and route-out tricks.
  additionalFamilies: { label: string; slug: string; isMinorLineage: boolean }[];
  // Observational symbolic-grammar topology panel (Layer 3). Null when:
  //   - slug is not in the flagship allow-list (8 flagship slugs)
  //   - slug has no topology-axis group membership in the staging CSVs
  //   - the resolved topology group has no other active members after self-exclude
  // Distinct from `relatedTricks`: this surfaces SYMBOLIC topology (cross-cuts
  // IFPA family) rather than canonical family-based relating.
  // Observational layer.
  symbolicRelatedTopology: SymbolicRelatedTopologyPanel | null;
  // Observational educational CTAs (DISCOVERABILITY phase). Trick-membership-
  // driven; empty array when no symbolic surface is relevant for this slug.
  // Renders subordinate to the canonical Related Tricks + Related Topology
  // panels. Currently triggers: butterfly-wing-topology → walking progression;
  // spinning-family / whirl-rotational-topology → spinning modifier page.
  symbolicEducationCtas: SymbolicEducationCta[];
  // Reverse semantic linkage. Topology + component
  // groups this trick belongs to. Each renders as a small inline link to
  // its browse-view anchor. Empty arrays mean no memberships; the panel hides.
  symbolicMemberships: TrickSemanticMemberships;
  // Next Tricks: same family + higher ADD; per-bucket-2 sampling, capped at 5.
  // Family-scoped progression; cross-family progression intentionally excluded.
  nextTricks: FreestyleNextTrick[];
  // Previous Tricks: same family + lower ADD; per-bucket-2 sampling, capped at 5.
  // Family base trick (slug == trick_family) is preferred first within its bucket.
  previousTricks: FreestylePreviousTrick[];
  // Reference Media — split by source tier:
  // - tutorialMedia: instructional sources (TT, AnzTrikz, FootbagSpot,
  //   Shred Global, Polini Pointers, Footbag Foundations, Everything Footbag)
  // - demoMedia: named-trick performance footage (Footbag Finland, Flipsider)
  // passback_records media items are filtered out of both arrays and render
  // in the Passback Records table below instead.
  tutorialMedia: TrickReferenceMediaItem[];
  demoMedia: TrickReferenceMediaItem[];
  hasReferenceMedia: boolean;            // pre-shaped: tutorialMedia.length || demoMedia.length
  // Section heading reflects what's actually inside the Reference Media block
  // so wording cannot conflate tutorials with demos:
  //   - 'Tutorials and demonstrations' when both are present
  //   - 'Tutorials'                     when tutorial-tier only
  //   - 'Demonstrations'                when demo-tier only
  //   - null                            when neither (section omitted via hasReferenceMedia)
  referenceMediaHeading: string | null;
  // Pathways block: pre-shaped summary of Learn / Watch / Family availability
  // for the new "What you can do with this trick" panel near the top of the
  // detail page. All anchor hrefs are pre-built so templates render only.
  pathways: TrickPathways;
  // Notation grammar diagnostic panel (read-only surface). Null when
  // the row has no structural_parse_json — page renders identically to before.
  notationGrammar: NotationGrammarPanel | null;
  // Role-aware notation rendering. Pre-shaped tokens with role
  // classification + educational tooltip text. Null when notation is empty.
  // Display-only; never affects parser output or ADD math.
  notationDisplay: NotationDisplay | null;
  // NF-2B semantic-notation fallback ladder. Coexists with notationDisplay
  // (Layer 1); the ladder picks layer='equivalence' / 'base-lineage' /
  // 'curation-gap' or returns null (Layer 4 silence). See shapeSemanticNotation.
  semanticNotation: SemanticNotation | null;
  // Operational notation block. Renders in the
  // "Set notation (operational)" section between semantic notation and
  // editorial decomposition. Null when the row has no operational_notation
  // populated; section omits entirely when null. Adds role-classified
  // token highlighting (warm palette, distinct from semantic's cool
  // palette); the token classification lives in
  // operationalNotationRendering.ts.
  operationalNotation: OperationalNotation | null;
  // Single-page pilot. Populated only for the flagship
  // pilot trick (montage). Null for every other trick so the legacy template
  // continues to render unchanged. When populated, the universal shell
  // renders the single-page section sequence instead of the legacy ordering.
  ux2Pilot: Ux2PilotData | null;
  // Density classification. Derived from existing data only
  // (modifier count, notation presence, operational notation presence, records,
  // media, ux2Pilot data presence). Read-only signal used
  // to gate flagship-only visual surfaces (token-coloured h1,
  // modifier-layering visualisation, modifier-ecosystem panel) without per-slug
  // allowlists.
  densityTier: 'sparse' | 'standard' | 'flagship';
  // Pre-shaped gate signal for the unified Media block.
  // True when either curated reference media exists (tutorial/demo grids
  // populated) OR editorial prose is authored (ux2Pilot non-null, signalling
  // the row deserves a flagship Media section with empty-state body).
  hasMediaBlock: boolean;
  // Hero quick-stat ADD-derivation strip tokens; null when
  // the trick is a modifier-only row or has no numeric adds. Built from
  // freestyle_trick_modifier_links + base_trick adds + this row's adds.
  // Renders in the hero immediately below the hero-stats chips.
  heroFormula: HeroFormulaToken[] | null;
  // Hero decomposition strip tokens; null when
  // modifier_links.length < 2. Renders between h1 and family-badge as a
  // prominent coloured-token row mirroring the original prototype's title
  // decomposition. Pure presentation; augments the title, does not replace.
  heroDecomposition: HeroDecompositionToken[] | null;
  // Nested modifier-layering visualisation; null when
  // modifier_links.length < 3. The single panel renders below the operational
  // notation block; only Montage clears the threshold in the current
  // dictionary. Pure presentation.
  modifierLayering: ModifierLayering | null;
  // Pre-shaped flag: true when the trick has at least one
  // modifier_links row. Used by trick-about.hbs to suppress the redundant
  // "ADD value" dl row on compound rows where the hero formula + modifier
  // layering already surface the total.
  hasModifierLinks: boolean;
  // Parallel tricks panel data; empty array when no
  // parallels exist (atoms; tricks at unique adds within their family).
  // Cap 4 rows. Rendered between Related Tricks and the Media block as a
  // navigation surface, not a recommendation surface.
  parallelTricks: ParallelTrick[];
  // Modifier substitutions panel data; empty array when
  // no substitution candidates exist. Cap 4 rows. Rendered immediately after
  // parallelTricks. The swap visualisation is the load-bearing signal:
  // "replace ducking with spinning and you get Spender."
  substitutions: ModifierSubstitution[];
  // Tier-4 executable-accounting disclosure: human-readable ADD derivation
  // for curator-published mechanically-derivable compounds. Null when no
  // resolved formula is published for this slug (silent suppression =
  // Tier-3 absence). The 4-tier rendering hierarchy contract forbids
  // Tier-4 patterns on browse cards + landing; trick-detail pages are the
  // only public surface (alongside /freestyle/add-analysis) where this
  // surfaces. Provenance is curator-internal language and is NOT exposed.
  // Suppressed (null) when isFirstClass is true; the comparativeNotation
  // row supersedes this surface for first-class tricks.
  addAnalysis: TrickAddAnalysisDisclosure | null;
  // First-class trick promotion flag (pilot). True when the slug passes
  // the First-Class ADD Convergence Rule AND appears in the pilot
  // allow-list. Drives the comparativeNotation surface; outside the
  // pilot, the field stays false even for governance-clean slugs.
  isFirstClass: boolean;
  // Comparative-notation row (Zone B, smaller font, label-led inline
  // metadata: JOB / ADD / VIDEO). Non-null only when isFirstClass is
  // true. Renders directly below the hero, before the rest of the page.
  comparativeNotation: ComparativeNotationRow | null;
  // Equivalence-topology view: alternate-derivation paths for tricks
  // whose canonical reading admits a structurally distinct path that
  // converges arithmetically. Null when no entry is authored OR when
  // the entry is curator-confirm-pending (filtered at service layer
  // so pending entries never surface publicly). Renders inside a
  // collapsed <details> advanced panel below the ADD-derivation
  // disclosure on trick-detail. Additive observational layer; never
  // overrides the canonical published reading.
  equivalenceTopology: EquivalenceTopologyView | null;
  // Family-anchor context. Populated
  // only when the current trick IS the family-anchor (slug ===
  // trick_family) AND the family carries a curator-authored invariant
  // (DP-1's six: whirl, rev-whirl, butterfly, mirage, osis, swirl).
  // Null for every other trick. Drives the family-anchor callout in
  // the trick-family section header; teaches readers that the page
  // they're on is itself the productive root of a family. Reuses the
  // FAMILY_INVARIANTS data already authored for the dictionary's
  // family view — single source of truth across surfaces.
  familyAnchorContext: {
    invariant:         string;       // e.g. "leggy in dex > ss clipper"
    familyName:        string;       // e.g. "Whirl"
    familyBrowseHref:  string;       // /freestyle/tricks?view=family#family-{slug}
  } | null;
  // Doctrine-divergence scoring note. Populated from
  // DOCTRINE_DIVERGENCE_REGISTRY when the slug carries documented
  // divergence between IFPA-grammar derivation and a community/
  // external source. Renders
  // on trick-detail ONLY (NEVER on browse cards); tone is factual +
  // source-attributed + brief. Null when no public-facing divergence
  // applies (~99% of canonical slugs).
  scoringNote: {
    category:        'historical-divergence' | 'doctrine-sensitive' | 'alternate-accounting';
    sourceSystem:    string | null;
    sourceClaim:     number | null;
    canonicalValue:  number;
    provenanceNote:  string;
    visibility:      'public' | 'advanced';
  } | null;
  // Primitive-note callout.
  // Populated only when the slug is one of the 12 core atoms (per
  // isCoreAtom). Surfaces a lightweight "Core movement atom" callout
  // on atom trick-detail pages so readers understand the ontological
  // role behind the suppressed compound-shaped sections (addAnalysis,
  // equivalenceTopology).
  //
  // Doctrine: primitive vs compound is a structural distinction, not
  // a difficulty claim or an ADD valuation. See the glossary's
  // "Primitives and Compounds" section (#primitives-and-compounds)
  // for the full doctrine framing.
  primitiveNote: {
    label:     string;
    explainer: string;
  } | null;
  // Reverse-pair transform overlay.
  // Populated only for the five curator-locked reverse-direction
  // pairs (illusion, pickup, rev-whirl, rev-swirl, orbit). Surfaces
  // a small "Transform" line below the canonical JOB notation so
  // readers see the structural symmetry between the reverse trick
  // and its base.
  //
  // FOREVER-RULE: deliberately scoped to these five entries; this
  // overlay is an educational pedagogy layer, NOT a general
  // symbolic algebra system. New transform operators or entries
  // require explicit curator approval.
  transform: {
    expression:    string;  // e.g. "rev(0) + mirage"
    baseSlug:      string;
    baseName:      string;
    baseHref:      string;
    baseAdd:       number;  // for ALT-row formula rendering
    totalAdd:      number;  // rev(0) is +0, so totalAdd == baseAdd
    rev0Explainer: string;  // shared rev(0) operator explainer
  } | null;
  // Movement-intuition prose.
  // Populated only for curator-locked flagship pages. Renders as a
  // "Movement intuition" section between trick-about and trick-notation
  // so the page reads movement-first → structure-second.
  //
  // Layer separation: prose only; never replaces notation, ADD
  // accounting, or any ontology field.
  intuition: {
    prose:       string;
    attribution: string;
  } | null;
  // "Compressed from" / "Compressed reading" pedagogy line.
  // Strict allowlist of famous structural
  // compressions only: smear, ripwalk, atom-smasher, eggbeater, mobius.
  // Reinforces the glossary §composition "Structural compression"
  // concept directly on the flagship detail pages. Reads from existing
  // freestyleSymbolicEquivalences.ts data (readings[0] is the compact
  // reading). Null for every non-allowlisted slug; suppresses cleanly
  // when no data. NOT a general equivalence-expansion surface; this is
  // pedagogy reinforcement, not ontology.
  compressedFrom: {
    label:   'Compressed from' | 'Compressed reading';
    reading: string;
  } | null;
  // Naming & interpretation overlay. Populated only when the slug has a
  // curator-authored entry in freestyleTrickInterpretations.ts. Surfaces a
  // canonical reading + one or more historical readings + structural
  // notes that frame the layer separation ("both readings describe the
  // same trick; the historical reading does not imply a productive
  // modifier family"). Distinct from the alias slot and from the S5
  // primary-readings slot — see the module's layer-separation doctrine.
  interpretation: {
    canonicalReading:   string;
    historicalReadings: string[];
    structuralNotes:    string[];
  } | null;
  // Trick tier (trick-detail ontology doctrine).
  // 'A' = flagship ontology exemplar (renders L1-L6 layers when authored).
  // 'B' = secondary, renders L1 + L5 only when authored.
  // 'C' = default — renders the universal shell exactly as today.
  trickTier: 'A' | 'B' | 'C';
  // L2: mechanical-delta layer. The deepest ontology-work locus —
  // where paradox / x-dex / nuclear / blurry / furious / rotational /
  // hidden-topology distinctions become understandable. Populated for
  // Tier A slugs with curator-authored entries; null otherwise.
  mechanicalDelta: {
    parentLinks:        { slug: string; label: string; href: string }[];
    prose:              string;
    topologyKind:       string;
    topologyLabel:      string;          // pre-shaped UI label
    interpretiveTraditions: { reading: string; citation: string }[];
    hasInterpretiveTraditions: boolean;
  } | null;
  // L3: ontology-role layer. Names what ontology concept this trick
  // exemplifies; renders as an eyebrow + prose pair.
  ontologyRole: {
    role:  string;
    prose: string;
  } | null;
  // L4: productivity narrative. Why this trick became generative +
  // curator-authored productive-descendant cross-links.
  productivity: {
    prose:                  string;
    productiveDescendants:  { slug: string; label: string; href: string; note?: string }[];
  } | null;
  // L5: family-evolution narrative. Branching steps, each with axis +
  // prose + exemplar links. NOT a list — a movement-language history.
  familyEvolution: {
    steps: {
      branchAxis:    string;
      prose:         string;
      exemplarLinks: { slug: string; label: string; href: string }[];
    }[];
  } | null;
  // L6: progressive-reading staircase. simple parent → topology
  // transformation → compositional extension → compressed shorthand →
  // descendant systems.
  progressiveReadings: {
    stages: { stage: string; reading: string; citation?: string }[];
  } | null;
  // Placeholder-description suppression. True
  // when the DB `description` matches a known placeholder pattern
  // (X-modified Y / X-and-Y modified Z / "Popular freestyle trick.").
  // Template suppresses the literal description and renders the
  // service-shaped decomposition pill instead. DB row is NEVER
  // mutated — suppression is render-only.
  descriptionIsPlaceholder: boolean;
}

// Re-export the equivalence-topology entry type so consumers of the
// trick-detail view-model can type their handlers without depending on
// the content module directly.
export type { EquivalenceTopologyEntry } from '../content/freestyleEquivalenceTopology';

/** First-class trick metadata strip — six labeled fields rendered as a
 *  Wikipedia-infobox-style publication metadata block below the hero.
 *  Visually distinct from ordinary trick pages; values are pre-shaped so
 *  the template only places labels and emits values. Source attributions
 *  ride as small captions next to each value (NOT inline debug prose). */
export interface ComparativeNotationRow {
  /** Slug-tag form ('#osis'). Appears as the strip's title row. */
  trickTag:           string;
  /** Curator-authored compact notation (e.g. 'gyro torque',
   *  'stepping paradox mirage') from freestyle_tricks.notation. */
  compactNotation:    string;
  /** Operational / Job-lineage notation chain. */
  jobLineage:         string;
  /** 'curator' = curator-published operational notation; 'derived' =
   *  mechanical derivation from base + modifier stack; 'atomic' = atomic
   *  upper-case chain form for singleton atoms; 'absent' = no lineage
   *  notation available (last-resort empty state). */
  jobLineageSource:   'curator' | 'derived' | 'atomic' | 'absent';
  /** Fully spelled-out operational chain when jobLineage uses a named-set
   *  shorthand (e.g. '(railing set) >>'); empty string when the lineage is
   *  already fully expanded. Renders as the EXPANDED summary row. */
  expandedNotation:   string;
  /** ADD-breakdown derivation string (e.g. 'paradox(+1) + mirage(2) = 3 ADD'). */
  addBreakdown:       string;
  /** 'curator' = curator-published RESOLVED_FORMULAS_SPRINT_1 row;
   *  'atomic' = atomic flag-component decomposition from
   *  ATOMIC_FLAG_DECOMPOSITIONS. */
  addBreakdownSource: 'curator' | 'atomic';
  /** Curator-locked numeric ADD from freestyle_tricks.adds. */
  officialAdd:        number;
  /** 'tutorial' / 'demo' / 'available' / 'none-yet'. */
  videoState:         'tutorial' | 'demo' | 'available' | 'none-yet';
  videoLabel:         string;
  /** Alternate interpretive formula (the ALT row). Populated only when
   *  a transform expression exists for this slug (the 5 curator-locked
   *  rev(0) entries: illusion / pickup / rev-whirl / rev-swirl / orbit).
   *  rev(+0) belongs in this row, not in the ADD calculation, so the
   *  reverse-pair interpretation stays separate from the direct ADD
   *  derivation. */
  altFormula:         string | null;
}

/** Curator-published ADD derivation surfaced under a collapsed disclosure
 *  on the trick-detail page. Only `derivation` + `totalAdd` are
 *  user-facing; provenance lives in the content module for curator audit
 *  but does not render publicly. */
export interface TrickAddAnalysisDisclosure {
  /** Human-readable derivation, e.g. 'paradox(+1) + mirage(2) = 3 ADD'. */
  derivation: string;
  /** Total ADD value matching the derivation arithmetic. */
  totalAdd:   number;
}

export interface Ux2PilotData {
  shortDescription: string | null;                  // one-sentence elevator pitch for the hero
  executionParagraphs: string[];                    // pre-split paragraphs; empty array hides the section
  learningParagraphs: string[];                     // pre-split paragraphs; empty array hides the section
  prerequisiteParagraphs: string[];                 // pre-split paragraphs; empty array hides the section
  featuredMedia: TrickReferenceMediaItem | null;    // single featured media; null = empty state
  featuredMediaEmptyState: string | null;           // copy shown when featuredMedia is null
}

function splitProseParagraphs(prose: string | null): string[] {
  if (!prose) return [];
  return prose
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0);
}

export interface OperationalNotation {
  raw:        string;                            // verbatim string from freestyle_tricks.operational_notation
  tokens:     OperationalToken[];                // O1b: role-classified spans for highlighted rendering
  sourceNote: string | null;                     // O1d: free-form curator-authored provenance/citation; null when absent
}

export interface TrickPathwaySummary {
  available: boolean;            // gates the block's "no X yet" fallback rendering
  count: number;                 // pre-formatted into pre-shaped strings; raw count for tests
  primaryText: string;           // pre-shaped main-line text; e.g. "3 tutorials available"
  secondaryText: string | null;  // optional second line; e.g. "Top: Jim Penske (47 kicks)"
  href: string | null;           // jump-link target ('#media', '#passback-records', or family filter)
  hrefLabel: string | null;      // pre-shaped CTA text; e.g. "Jump to Reference Media"
}

export interface TrickPathways {
  learn: TrickPathwaySummary;
  watch: TrickPathwaySummary;
  family: TrickPathwaySummary;
}

export interface TrickReferenceMediaItem {
  mediaId: string;
  media: VideoMedia | null;
  caption: string | null;
  sourceLabel: string | null;         // human-friendly source label, e.g. 'Tricks of the Trade'
  // Hashtag chips for the visible symbolic-navigation layer (F7). Shaped via
  // shapeMediaTagsForBrowse: noise (`#trick`, `#unavailable_embed`, `#freestyle`
  // on freestyle-only surfaces) suppressed; remainder sorted by kind precedence.
  // Empty array when the media row has no surfacing-eligible tags.
  tags: MediaTagDisplay[];
}

export interface FreestyleTrickDictEntry {
  canonicalName: string;
  adds: string | null;          // numeric string or 'modifier'
  addsNumeric: number | null;   // parsed integer or null
  category: string | null;
  description: string | null;
  aliases: string[];
  baseTrick: string | null;
  baseTrickSlug: string | null; // slug for linking to base trick page
  baseTrickAdds: string | null; // ADD value of the base trick, for composition display
  trickFamily: string | null;   // family grouping slug
  isBase: boolean;              // true when this trick IS the family base (trick_family == own slug)
  isModifier: boolean;
  isCompound: boolean;          // true for category=compound or category=dex with a different base
  // ADD composition: null for base tricks and modifiers
  addComposition: string | null;  // e.g. "whirl (3) + blurry (+2 on rotational) = 5"
  appliedModifiers: AppliedModifier[];
  // Family editorial note for major families
  familyNote: string | null;
}

export interface AppliedModifier {
  name: string;
  addBonus: number;
  addBonusRotational: number;
  isRotationalBase: boolean;
  effectiveBonus: number;       // the actual bonus applied given whether base is rotational
  // Display-only fields for hero quick-stat formula.
  modifierType: string;         // 'body' | 'set' | other; sourced from freestyle_trick_modifiers.modifier_type
  cssRole: string;              // semantic-notation cssRole for token coloration: 'set' | 'rotation' | 'modifier'
}

// Hero quick-stat ADD-derivation strip.
// One token sequence rendered in the hero, immediately below the hero-stats
// chips, summarising "modifier(+w) + ... + base(N) = TOTAL ADD" with each
// operand role-coloured (cool palette). Atom rows (no modifiers) render the
// short form: "trick-name = N ADD". Rendered by trick-hero.hbs as a single
// quiet line; no h2; no surrounding card. Pure presentation; never affects
// ADD math (asserted ADD remains editorial truth).
export interface HeroFormulaToken {
  kind: 'modifier' | 'base' | 'operator' | 'result';
  // Pre-shaped role booleans; templates branch on these, never on the
  // raw kind code (kind stays for data attributes).
  isOperator: boolean;
  isResult: boolean;
  text: string;          // displayed token text
  weight: string | null; // muted parenthetical weight, e.g. "(+2)" or "(3)"; null for operators/result
  cssRole: string | null;// 'set' | 'rotation' | 'modifier' | 'core-family'; null for operators/result
}

// Hero decomposition strip. Prominent role-coloured token
// row rendered between the h1 and the family badge for compound tricks where
// modifier_links.length >= 2. Augments the existing plain h1 (preserves
// readability and accessibility); does not replace the title text. Atom rows
// and 1-modifier compounds render null (plain h1 only). Pure presentation.
export interface HeroDecompositionToken {
  text: string;          // modifier or base name (lowercase, as in canonical_name)
  cssRole: string;       // 'set' | 'rotation' | 'modifier' | 'core-family'
  kind: 'modifier' | 'base';
}

// Relationship surfaces.
// Parallel tricks: same family + same ADD value + different slug. Up to 4
// rows. Pedagogical lens: "alternative structural solutions at the same
// difficulty tier." Each row carries the canonical name, ADD value, and a
// concise decomposition string showing the modifier set + base.
export interface ParallelTrick {
  slug: string;
  canonicalName: string;
  detailHref: string;
  adds: string;             // numeric string for display
  decompSummary: string;    // e.g. "pixie + ducking + butterfly" -- no weights, no equals
  modifierCount: number;    // 0-N
}

// Modifier substitution: same base + same modifier count + share N-1 modifiers.
// Up to 4 rows. Pedagogical lens: "replace this modifier with this modifier
// and you get..." Each row exposes the explicit swap (one slug out, one in)
// alongside the substitute trick's name + ADD.
export interface ModifierSubstitution {
  slug: string;
  canonicalName: string;
  detailHref: string;
  adds: string;
  swapFromName: string;     // current trick's unique modifier (lowercase)
  swapFromCssRole: string;
  swapToName: string;       // substitute trick's unique modifier (lowercase)
  swapToCssRole: string;
}

// Modifier layering. Prototype-inspired nested-box
// visualisation surfacing how modifiers stack onto the base trick. Activates
// only when modifier_links.length >= 3 (flagship-density threshold).
// Each ModifierLayer wraps the next deeper layer; the
// innermost layer is the base trick (kind='base'). Rendered by the recursive
// partial src/views/partials/trick-modifier-layer.hbs. Pure presentation.
export interface ModifierLayer {
  kind: 'modifier' | 'base';
  name: string;            // lowercase token
  weight: string;          // '(+1)' for modifiers; '(3)' for base; empty when unknown
  cssRole: string;         // 'set' | 'rotation' | 'modifier' | 'core-family'
  kindLabel: string;       // visible role label: 'core' for the base layer, else the css role word
  inner: ModifierLayer | null;  // deeper layer; null at the base
}

export interface ModifierLayering {
  rootLayer: ModifierLayer; // outermost wrapper; recurse via `inner` to the base
  totalLabel: string;       // 'N ADD' summary line under the nested boxes
}

// ── Notation grammar (read-only display) ────────────────────────────
// Diagnostic surface for the structured-parse columns (schema +
// parser fills). Read-only: asserted `adds` remains authoritative; computed values
// here are diagnostic only and never override editorial truth.
//
// Returns null on the page view-model when structural_parse_json is missing or
// unparseable — the trick-detail page renders exactly as before in that case.

export interface NotationGrammarRoleToken {
  token: string;       // e.g. 'spinning', 'symposium', 'whirl'
  atomResolved: boolean; // true when this token represents a self-canonical atom
}

export interface NotationGrammarRoleBucket {
  key:    string;     // 'core_family' | 'set' | 'rotation' | 'modifier' | 'delay_surface' | 'directionality' | 'unusual_surface' | 'unresolved_tokens'
  label:  string;     // human-readable bucket label (e.g. 'Core family', 'Modifier')
  tokens: NotationGrammarRoleToken[]; // empty list omitted by the template
}

// Editorial decomposition — surfaces curator-asserted structural lineage
// (base_trick + freestyle_trick_modifier_links) as a SECOND, parallel
// decomposition view alongside the parser-derived one. Strict editorial
// decomposition: consults ONLY the explicit join table + base column. Does NOT
// re-tokenize canonical_name and does NOT parse description text. Always
// labeled `sourceLabel='editorial'` so the template can never present this
// claim as parser output.
//
// Invariants this shaping path preserves:
//   - Editorial-derived `composedAdds` NEVER overrides asserted_adds.
//   - Editorial-derived `composedAdds` NEVER overrides parser `computed_adds`.
//   - No slug-specific branches anywhere in the shaping path.
//   - Broken-link / sparse-coverage states surface honestly; never invented.
export interface EditorialDecompositionModifier {
  slug:           string;
  name:           string;
  modifierType:   string;          // 'body' | 'set'
  addBonus:       number;          // non-rotational weight from trick_modifiers
  addBonusRot:    number;          // rotational weight from trick_modifiers
  effectiveBonus: number;          // selected based on parent's isRotationalBase
  rotBonusApplied:boolean;         // true iff parent is rotational AND addBonusRot != addBonus
  notes:          string | null;   // verbatim from trick_modifiers.notes
}

export interface EditorialDecomposition {
  // Base lineage — drawn from `freestyle_tricks.base_trick` and resolved
  // against the dictionary at shape time.
  baseSlug:           string | null;
  baseAdds:           number | null;
  baseStatus:         'resolved' | 'broken_link';
  isRotationalBase:   boolean;

  // Modifier composition — drawn from freestyle_trick_modifier_links (strict).
  // Empty when the join table has no rows for this trick — surfaced honestly
  // as `modifierCoverage='absent'`, not silently elided.
  modifiers:          EditorialDecompositionModifier[];
  modifierCoverage:   'present' | 'absent';

  // Composed math from the editorial layer.
  composedAdds:       number | null;   // base.adds + Σ(modifier.effectiveBonus); null if unresolvable
  matchesAsserted:    boolean | null;  // composedAdds === assertedAdds; null when composedAdds null
  derivationText:     string | null;   // pretty-printed; null when composedAdds null

  // Always 'editorial'. Single-purpose attribution so the template never has
  // to infer the source of a decomposition claim.
  sourceLabel:        'editorial';
}

export interface NotationGrammarPanel {
  // Status — service-shaped label and one-line description for the badge.
  status:            string;     // raw status value: exact_modifier_derived | exact_self_atom | approximate | unresolved | policy_dependent
  statusLabel:       string;     // human-readable label, e.g. 'Exact (modifier-derived)'
  statusDescription: string;     // one-sentence explanation suitable for a tooltip or caption

  // ADD reconciliation. Asserted is authoritative; computed is diagnostic.
  assertedAdds:      number | null;
  computedAdds:      number | null;
  addsAgree:         boolean;    // true when both present and equal; false otherwise (including either null)
  formula:           string | null;

  // Raw notation source (when present in DB).
  jobsNotationRaw:        string | null;
  jobsNotationNormalized: string | null;

  // Two role layers: descriptive (what each token is classified as) and
  // add-contributing (used for ADD math). Empty buckets
  // are omitted so the template can render only present roles.
  descriptiveRoles:     NotationGrammarRoleBucket[];
  addContributingRoles: NotationGrammarRoleBucket[];

  // Honesty signals.
  parseWarnings:    string[];
  policyTokens:     string[];
  additiveFlags:    string[];
  unresolvedTokens: string[];   // raw token strings; convenience flat list for the template

  // Editorial context — surfaces the row's `description` column so named compounds
  // (sumo, sailing, blur, barfly, etc.) carry their human explanation in the panel
  // even when the parser-derived formula is just `slug(N) = N`. Null when the row
  // has no description or the description is empty/whitespace.
  editorialContext: string | null;

  // Pre-shaped predicate driving the "Diagnostic details" disclosure block.
  // True when there is any content (parse warnings or jobs notation) to put
  // behind the disclosure; false suppresses the wrapper entirely.
  hasDiagnosticDetails: boolean;

  // Editorial decomposition — curator-asserted structural lineage. Null when
  // the row has no usable editorial decomposition data (no base_trick, or
  // self-reference base_trick AND no modifier links). When present, ALWAYS
  // labeled as editorial; never claims parser provenance.
  editorialDecomposition: EditorialDecomposition | null;
}

const ROLE_BUCKET_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'core_family',      label: 'Core family' },
  { key: 'set',              label: 'Set' },
  { key: 'rotation',         label: 'Rotation' },
  { key: 'modifier',         label: 'Modifier' },
  { key: 'delay_surface',    label: 'Delay surface' },
  { key: 'directionality',   label: 'Directionality' },
  { key: 'unusual_surface',  label: 'Unusual surface' },
  { key: 'unresolved_tokens', label: 'Unresolved tokens' },
];

const STATUS_LABELS: Record<string, { label: string; description: string }> = {
  exact_modifier_derived: {
    label:       'Exact: structurally derived',
    description: 'The structural decomposition reproduces the asserted ADD from a base trick plus modifier weights.',
  },
  exact_self_atom: {
    label:       'Exact: named trick / self-atom',
    description: 'The trick is its own canonical anchor; computed ADD equals the asserted value tautologically: a different kind of agreement than a structural derivation.',
  },
  approximate: {
    label:       'Approximate',
    description: 'The structural decomposition resolves cleanly but the computed ADD disagrees with the asserted value.',
  },
  unresolved: {
    label:       'Unresolved',
    description: 'The parser could not classify enough tokens to compute an ADD from the structural decomposition.',
  },
  policy_dependent: {
    label:       'Policy-dependent',
    description: 'The parse contains a token whose ADD weight or ontology placement is contested and pending expert review.',
  },
};

function shapeRoleBuckets(
  layer: Record<string, unknown> | undefined,
): NotationGrammarRoleBucket[] {
  if (!layer || typeof layer !== 'object') return [];
  const buckets: NotationGrammarRoleBucket[] = [];
  for (const { key, label } of ROLE_BUCKET_ORDER) {
    const raw = (layer as Record<string, unknown>)[key];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const tokens: NotationGrammarRoleToken[] = [];
    for (const t of raw) {
      if (t && typeof t === 'object') {
        const tok = (t as { token?: unknown }).token;
        if (typeof tok === 'string' && tok.length > 0) {
          tokens.push({
            token: tok,
            atomResolved: (t as { atom_resolved?: unknown }).atom_resolved === true,
          });
        }
      }
    }
    if (tokens.length > 0) buckets.push({ key, label, tokens });
  }
  return buckets;
}

// Editorial-decomposition shaping (strict):
//
// Inputs:
//   row             — the active trick row (carries base_trick, adds, slug)
//   dictBySlug      — lookup map from slug → FreestyleTrickRow for base resolution
//   modifierLinks   — explicit join-table rows for THIS trick (already fetched)
//
// Output:
//   EditorialDecomposition when the row has structural editorial data worth
//   surfacing; null otherwise.
//
// Render-rule: returns non-null when base_trick is set AND base_trick is not
// a self-reference. Self-referencing rows (e.g. sailing's base_trick=sailing)
// have nothing structural to decompose into; the parser-derived view + the
// description (Editorial context block) are sufficient.
//
// Invariants this shaping path preserves:
//   - Reads ONLY base_trick + freestyle_trick_modifier_links.
//   - Never re-tokenizes canonical_name. Never parses description.
//   - Never claims parser provenance (sourceLabel always 'editorial').
//   - composedAdds is presentation-only; never feeds back into asserted_adds.
function shapeEditorialDecomposition(
  row: FreestyleTrickRowWithParse,
  dictBySlug: Map<string, FreestyleTrickRow>,
  modifierLinks: FreestyleTrickModifierLinkDetailRow[],
): EditorialDecomposition | null {
  const baseSlugRaw = row.base_trick;
  if (!baseSlugRaw || baseSlugRaw.trim().length === 0) return null;
  const baseSlug = baseSlugRaw.trim();
  // Self-reference: sailing→sailing, surging→surging style. Editorial layer
  // has nothing to decompose; suppress.
  if (baseSlug === row.slug) return null;

  // Try to resolve the base. Editorial state is honest about broken links.
  const baseRow = dictBySlug.get(baseSlug) ?? null;
  const baseStatus: 'resolved' | 'broken_link' = baseRow ? 'resolved' : 'broken_link';
  const baseAdds = baseRow && baseRow.adds && /^\d+$/.test(baseRow.adds)
    ? parseInt(baseRow.adds, 10)
    : null;
  const isRotationalBase = ROTATIONAL_BASES.has(baseSlug);

  // Modifier list — strict B1: only the explicit join table.
  const modifiers: EditorialDecompositionModifier[] = modifierLinks.map(link => {
    const effective = isRotationalBase ? link.add_bonus_rotational : link.add_bonus;
    return {
      slug:           link.modifier_slug,
      name:           link.modifier_name,
      modifierType:   link.modifier_type,
      addBonus:       link.add_bonus,
      addBonusRot:    link.add_bonus_rotational,
      effectiveBonus: effective,
      rotBonusApplied: isRotationalBase && link.add_bonus_rotational !== link.add_bonus,
      notes:          link.modifier_notes,
    };
  });
  const modifierCoverage: 'present' | 'absent' = modifiers.length > 0 ? 'present' : 'absent';

  // Composed math. Null when base couldn't resolve to a numeric ADD.
  let composedAdds: number | null = null;
  let derivationText: string | null = null;
  if (baseAdds !== null) {
    const totalBonus = modifiers.reduce((s, m) => s + m.effectiveBonus, 0);
    composedAdds = baseAdds + totalBonus;
    if (modifiers.length > 0) {
      const rotSuffix = (m: EditorialDecompositionModifier) => {
        const rotApplied = isRotationalBase && m.addBonus !== m.addBonusRot;
        return rotApplied ? ' rot' : '';
      };
      const parts = modifiers
        .map(m => `${m.slug}(+${m.effectiveBonus}${rotSuffix(m)})`)
        .join(' + ');
      derivationText = `${parts} + ${baseSlug}(${baseAdds}) = ${composedAdds}`;
    } else {
      derivationText = `${baseSlug}(${baseAdds}) = ${composedAdds}`;
    }
  }

  // matchesAsserted: only meaningful when both numbers are known.
  const assertedAdds = row.adds && /^\d+$/.test(row.adds) ? parseInt(row.adds, 10) : null;
  const matchesAsserted = composedAdds !== null && assertedAdds !== null
    ? composedAdds === assertedAdds
    : null;

  return {
    baseSlug,
    baseAdds,
    baseStatus,
    isRotationalBase,
    modifiers,
    modifierCoverage,
    composedAdds,
    matchesAsserted,
    derivationText,
    sourceLabel: 'editorial',
  };
}

// ── Semantic-notation fallback ladder (NF-2B) ────────────────────────────
// Compose a `SemanticNotation` for a trick row. Layer selection:
//   1. Curated equivalence chain (Layer 2) — if authored in
//      freestyleSymbolicEquivalences.ts. Coexists with Layer 1 (curator notation
//      in `row.notation`); both render as distinct sections.
//   2. Base-lineage phrase (Layer 3) — if `row.base_trick` resolves and isn't
//      a self-reference, AND no curator notation exists, AND no chain.
//   3. Layer 4 (true atom silence) — if slug is in CORE_TRICKS and no data:
//      return null (no semantic-notation block).
//   4. Layer 5b (non-core curation gap) — non-core, no curator notation, no
//      base lineage: surface "Compositional reading pending curation." cue.
//
// Editorial-layer rules preserved:
//   - Reads only slug / notation / base_trick + dictBySlug for base resolution.
//   - Never tokenizes canonical_name; never recurses; never invokes parser.
//   - Auto-link tokens only resolve to CORE_TRICKS or OPERATOR_REFERENCE_ENTRIES.
//   - sourceLabel='editorial' const literal.
const RECOGNIZED_LINK_SLUGS: ReadonlySet<string> = (() => {
  const s = new Set<string>();
  for (const slug of CORE_TRICKS) s.add(slug);
  for (const entry of OPERATOR_REFERENCE_ENTRIES) s.add(entry.slug);
  return s;
})();

/**
 * Render-time abbreviation expansion for S5 chain readings.
 * Eliminates the visible inconsistency where
 * S5 readings use lowercase abbreviations (`ss`, `op`) while JOB
 * tokens on the same page use uppercase spelled-out forms (`SAME`,
 * `OP`). Expanding to lowercase prose (`same-side`, `opposite`) keeps
 * the readings reading as compositional name phrases without
 * shouting all-caps.
 *
 * Map is intentionally small and curator-locked — only the two
 * abbreviations that recur frequently enough to confuse readers.
 * Future additions one-at-a-time by explicit curator decision.
 */
const S5_TOKEN_EXPANSIONS: ReadonlyMap<string, string> = new Map([
  ['ss', 'same-side'],
  ['op', 'opposite'],
]);

function expandS5Abbreviation(token: string): string {
  return S5_TOKEN_EXPANSIONS.get(token.toLowerCase()) ?? token;
}

function tokenizeEquivalenceReading(reading: string): SemanticNotationToken[] {
  return reading
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map((token): SemanticNotationToken => {
      const expanded = expandS5Abbreviation(token);
      const normalized = expanded.toLowerCase();
      if (RECOGNIZED_LINK_SLUGS.has(normalized)) {
        return { kind: 'link', text: expanded, href: `/freestyle/glossary#term-${normalized}` };
      }
      return { kind: 'plain', text: expanded, href: null };
    });
}

function shapeSemanticNotation(
  row: FreestyleTrickRowWithParse,
  dictBySlug: Map<string, FreestyleTrickRow>,
): SemanticNotation | null {
  const slug = row.slug;

  // Layer 2: curated equivalence chain. Renders alongside Layer 1 when both
  // exist — does NOT suppress curator notation.
  const chain = getSymbolicEquivalenceChain(slug);
  if (chain) {
    return {
      layer:    'equivalence',
      isEquivalenceLayer:  true,
      isBaseLineageLayer:  false,
      isCurationGapLayer:  false,
      readings: chain.readings.map((reading, depthIndex) => ({
        tokens: tokenizeEquivalenceReading(reading),
        depthIndex,
      })),
      curatorConfirmPending: chain.curatorConfirmPending,
      baseSlug:              null,
      baseName:              null,
      sourceLabel:           'editorial',
    };
  }

  // No chain. If curator notation exists (Layer 1), it handles rendering;
  // no semantic-notation block needed.
  const hasCuratorNotation =
    typeof row.notation === 'string' && row.notation.trim().length > 0;
  if (hasCuratorNotation) return null;

  // Layer 3: base lineage. Resolves when base_trick is set, not self-ref,
  // and present in the dictionary.
  const baseSlugRaw = row.base_trick;
  if (baseSlugRaw && baseSlugRaw.trim().length > 0) {
    const baseSlug = baseSlugRaw.trim();
    if (baseSlug !== slug) {
      const baseRow = dictBySlug.get(baseSlug);
      if (baseRow) {
        return {
          layer:                 'base-lineage',
          isEquivalenceLayer:    false,
          isBaseLineageLayer:    true,
          isCurationGapLayer:    false,
          readings:              [],
          curatorConfirmPending: false,
          baseSlug,
          baseName:              baseRow.canonical_name || baseSlug,
          sourceLabel:           'editorial',
        };
      }
    }
  }

  // No structural data. Layer 4 (core atom) vs Layer 5b (non-core gap).
  if (isCoreTrick(slug)) return null;   // Layer 4 silence
  return {
    layer:                 'curation-gap',
    isEquivalenceLayer:    false,
    isBaseLineageLayer:    false,
    isCurationGapLayer:    true,
    readings:              [],
    curatorConfirmPending: false,
    baseSlug:              null,
    baseName:              null,
    sourceLabel:           'editorial',
  };
}

function shapeNotationGrammar(
  row: FreestyleTrickRowWithParse,
  dictBySlug: Map<string, FreestyleTrickRow>,
  modifierLinks: FreestyleTrickModifierLinkDetailRow[],
): NotationGrammarPanel | null {
  if (!row.structural_parse_json) return null;
  let parsed: Record<string, unknown>;
  try {
    const candidate = JSON.parse(row.structural_parse_json);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }
    parsed = candidate as Record<string, unknown>;
  } catch {
    return null;
  }

  const status = row.add_formula_status ?? 'unresolved';
  const statusEntry = STATUS_LABELS[status]
    ?? { label: status, description: 'Status produced by the parser. See PROPOSAL §7.2.' };

  const assertedAdds = row.adds !== null && /^\d+$/.test(row.adds) ? parseInt(row.adds, 10) : null;
  const computedAdds = row.computed_adds;
  const addsAgree    = assertedAdds !== null && computedAdds !== null && assertedAdds === computedAdds;

  const descriptive = parsed.descriptive_roles as Record<string, unknown> | undefined;
  const contributing = parsed.add_contributing_roles as Record<string, unknown> | undefined;

  const parseWarningsRaw = parsed.parse_warnings;
  const policyTokensRaw  = parsed.policy_tokens;
  const additiveFlagsRaw = parsed.additive_flags;
  const parseWarnings = Array.isArray(parseWarningsRaw)
    ? parseWarningsRaw.filter((x): x is string => typeof x === 'string') : [];
  const policyTokens = Array.isArray(policyTokensRaw)
    ? policyTokensRaw.filter((x): x is string => typeof x === 'string') : [];
  const additiveFlags = Array.isArray(additiveFlagsRaw)
    ? additiveFlagsRaw.filter((x): x is string => typeof x === 'string') : [];

  // Unresolved tokens live inside descriptive_roles; flatten the
  // string list for the template's convenience.
  const unresolvedRaw = descriptive ? descriptive['unresolved_tokens'] : undefined;
  const unresolvedTokens: string[] = Array.isArray(unresolvedRaw)
    ? unresolvedRaw
        .map(t => (t && typeof t === 'object' ? (t as { token?: unknown }).token : null))
        .filter((x): x is string => typeof x === 'string')
    : [];

  const editorialContext = typeof row.description === 'string' && row.description.trim().length > 0
    ? row.description.trim()
    : null;

  const hasDiagnosticDetails = parseWarnings.length > 0
    || (typeof row.jobs_notation_raw === 'string' && row.jobs_notation_raw.length > 0);

  const editorialDecomposition = shapeEditorialDecomposition(row, dictBySlug, modifierLinks);

  return {
    status,
    statusLabel:       statusEntry.label,
    statusDescription: statusEntry.description,
    assertedAdds,
    computedAdds,
    addsAgree,
    formula:           row.computed_add_formula,
    jobsNotationRaw:        row.jobs_notation_raw,
    jobsNotationNormalized: row.jobs_notation_normalized,
    descriptiveRoles:     shapeRoleBuckets(descriptive),
    addContributingRoles: shapeRoleBuckets(contributing),
    parseWarnings,
    policyTokens,
    additiveFlags,
    unresolvedTokens,
    editorialContext,
    hasDiagnosticDetails,
    editorialDecomposition,
  };
}

export interface FreestyleFamilyMember {
  slug: string;
  canonicalName: string;
  adds: string | null;
  isCurrentTrick: boolean;   // true for the trick being viewed
  detailHref: string;        // always /freestyle/tricks/:slug (dict entry exists)
  hasRecords: boolean;       // true when passback records exist for this trick
}

// Family lineage grouped by ADD value. Numeric tiers sort
// ascending; rows with non-numeric or null ADD ("modifier", unrated) collapse
// into a single "Modifiers" tier rendered after the numeric tiers.
export interface FreestyleFamilyTier {
  addsLabel: string;                       // e.g. "3 ADD", "4 ADD", "Modifiers"
  addsNumeric: number | null;              // null for the non-numeric tier
  members: FreestyleFamilyMember[];        // members in this tier (preserves source order)
  hasCurrent: boolean;                     // true if the current trick sits in this tier
}

export interface FreestyleModifierEntry {
  slug: string;
  name: string;
  addBonus: number;
  addBonusRotational: number;
  modifierType: string;     // 'body' | 'set'
  notes: string | null;
}

// Media-coverage indicator for the trick-dictionary ADD view, in priority order:
//   'tutorial' — at least one tutorial-tier source covers this trick
//   'demo'     — only demo-tier or record-tier media sources cover (no tutorial)
//   'record'   — no reference media, but a freestyle record carries its own video
//   'none'     — no media of any kind for this trick
export type TrickMediaCoverage = 'tutorial' | 'demo' | 'record' | 'none';

export interface FreestyleTrickIndexRow {
  slug: string;
  canonicalName: string;
  hashtag: string;              // derived presentation token: '#' + slug with hyphens converted to underscores
  trickFamily: string | null;   // family slug; used as the target of the hashtag-filter link
  adds: string | null;
  category: string | null;
  description: string | null;
  notation: string | null;      // Jobs notation, opaque text; rendered monospace
  aliases: string[];
  detailHref: string;           // always /freestyle/tricks/:slug for all dict entries
  hasRecords: boolean;          // true when passback records exist (shows record indicator)
  recordHref: string | null;    // kept for backwards compatibility — same as detailHref when hasRecords
  hasMedia: boolean;            // back-compat boolean; equals (mediaCoverage !== 'none')
  mediaCoverage: TrickMediaCoverage;  // tier-aware coverage classification
  mediaCoverageLabel: string;   // pre-shaped chip text: 'Tutorial available' / 'Demo available' / '' (none)
  isExternalOnly: boolean;      // true when row is is_active=0 + review_status='pending' (external placeholder)
  statusBadge: string | null;   // pre-shaped status text; null for plain canonical rows
  placeholderNote: string | null; // pre-shaped note rendered under the row when isExternalOnly = true
}

export interface FreestyleTrickGroup {
  category: string;
  label: string;
  tricks: FreestyleTrickIndexRow[];
  // Shared symbolic trick cards, ADD ascending then trick name alphabetical.
  cards: DictionaryTrickCard[];
  anchorId: string;   // `category-{slug}`
}

// ADD-grouped bucket for the beginner/default view. addNumeric is null for
// the "Unrated / unresolved" bucket; otherwise an integer 0..9.
export interface FreestyleTrickAddGroup {
  addNumeric: number | null;
  addLabel: string;            // pre-shaped: '1 ADD', '2 ADD', '0 ADD', 'Unrated / unresolved'
  anchorId: string;            // pre-shaped section anchor: 'add-0'..'add-N', 'add-unrated'. Avoids the 0-is-falsy template footgun and stays correct for future 8/9 ADD buckets.
  tricks: FreestyleTrickIndexRow[];
  // Shared symbolic trick cards. Built alongside the legacy
  // `tricks` rows so views not yet on the dictionary-trick-card partial
  // can continue rendering inline markup.
  cards: DictionaryTrickCard[];
}

// ─────────────────────────────────────────────────────────────────────────
// DictionaryTrickCard — the canonical symbolic trick card view-model.
//
// One card system, progressive density, operational notation as the
// visual center of gravity. Browse modes share this shape.
// ─────────────────────────────────────────────────────────────────────────

export interface DictionaryTrickCard {
  // Structural-role discriminator. Only `kind === 'trick'` rows appear on
  // the trick-browse surfaces (ADD / family / category / component /
  // topology). Modifiers / operators / surfaces have their own homes; never
  // mixed into the trick-difficulty ladder. Kind overrides live in
  // freestyleTrickKindOverrides.ts.
  kind:                       FreestyleTrickKind;
  slug:                       string;
  hashtag:                    string;                        // '#' + slug (underscored)
  displayName:                string;                        // canonical_name
  href:                       string;                        // /freestyle/tricks/:slug ; suppressed when external-only placeholder
  adds:                       string | null;                 // numeric string for display; null when unrated
  addsLabel:                  string;                        // pre-shaped: '4 ADD' / '? ADD' (never empty)
  // Symbolic-equivalence readings rendered as `≡ <reading>` lines above the
  // notation row. Merged from two sources, both curator-authored and
  // restraint-governed (no DB-data leakage):
  //   1. freestyleSymbolicEquivalences.ts — compound chains (mobius, etc.)
  //   2. freestyleAliasGovernance.ts — atom-level canonical aliases (ATW, etc.)
  // Empty array when neither source has an entry; the template suppresses
  // the row in that case.
  symbolicEquivalences:       string[];
  // Tokenized form of each ≡ reading,
  // parallel to `symbolicEquivalences`. Each inner array is one reading's
  // tokens; the template renders role-classified spans. `isFamilyAnchor` is
  // true on tokens that match the active view's anchor (family / component /
  // topology slug) — drives the underline emphasis in browse density.
  // Registry density renders only the first reading's tokens for one-line
  // discipline; browse density renders all readings.
  tokenizedEquivalences:      SemanticBrowseToken[][];
  operationalNotation:        OperationalNotation | null;    // role-tagged tokens; null when pending
  operationalNotationStatus:  'available' | 'pending';
  commonAliases:              string[];                      // service-side "common aliases only" filter applied here
  isExternalOnly:             boolean;                       // suppresses href; renders placeholder shell
  statusBadge:                string | null;                 // adjudication-state badge for external placeholders
  placeholderNote:            string | null;                 // adjudication-state explainer (status, not prose description)
  hasRecords:                 boolean;                       // tiny indicator only; not visually load-bearing
  hasReferenceMedia:          boolean;                       // true when any media badge applies (tutorial, demo, or a record's own video)
  mediaCoverage:              TrickMediaCoverage;            // 'tutorial' | 'demo' | 'record' | 'none' — drives optional chip
  mediaCoverageLabel:         string;                        // pre-shaped chip text: 'Tutorial available' / 'Demo available' / 'Record video' / '' (none)
  trickFamily:                string | null;                 // reserved for future family-axis affordance
  // Curator-authored flag for folk-derived /
  // mechanically-ambiguous rows. Drives a small italic pill on the
  // card. Read from freestyleUnresolvedCompounds.ts; never auto-derived.
  pendingDecomposition:       boolean;
  // Editorial atom reading
  // populated from CORE_TRICK_SPEC.equivalences[0] when the slug is in
  // the curator-authoritative core-atom set AND no chain reading or
  // op-notation exists. Provides a neutral "core atom — <description>"
  // line so foundational atom cards don't render visually emptier than
  // the compounds they decompose to. Empty string when no atom reading
  // applies. The compact partial renders this only as a fallback.
  coreAtomLabel:              string;
  // First-class display fields (FC polish slice). Populated only for
  // slugs in FIRST_CLASS_TIER_1 ∪ FIRST_CLASS_TIER_2. When isFirstClass=true the partial
  // renders a compact secondary row beneath the primary card content
  // showing the OPERATIONAL/JOB chain (when meaningful) + the ADD
  // breakdown. Empty fields suppress their corresponding row.
  isFirstClass:                boolean;
  firstClassChainLabel:        'JOB' | 'OPERATIONAL' | null;  // null suppresses the chain row
  firstClassChainValue:        string | null;
  firstClassAddBreakdown:      string | null;
  // ADD-view two-line row contract. The line-2 "ADD:"
  // formula string, derived in priority order: curator RESOLVED_FORMULAS
  // → atomic decomposition → mechanical modifier-link derivation
  // (sum-verified against canonical adds) → null. When null the ADD-view
  // partial renders a bare "ADD: N" (honest; never fabricated). Used only
  // by the ADD-view density; other views ignore it.
  addViewFormula:              string | null;
  // True when the trick is first-class but its operational/Job chain is
  // genuinely absent upstream (no curator op-notation in DB, no atomic
  // flag-decomposition chain, no derivable form). Triggers an honest
  // "Job notation pending" line in the first-class summary partial,
  // rather than silently hiding the row and leaving the card looking
  // truncated next to osis-parity entries.
  firstClassChainIncomplete:   boolean;
}

export type FreestyleTricksActiveView = 'add' | 'family' | 'category' | 'sets' | 'component' | 'topology' | 'movement-system' | 'dex-count';

// Sets-view browse model. Canonical sets are first-class ontology objects, not
// trick-grouped browse filters. Six subtypes; each set carries a
// hashtag, formula, movement explanation, equivalence notes, derived /
// related system slugs, source provenance, and (optionally) audit
// status. Per-set detail pages live at /freestyle/sets/:slug.
//
// Alternate-surface systems are NOT here. Surface mechanics are a
// distinct ontology layer (see ?view=movement-system alt-surfaces
// subsection). The Set Hub renders a cross-link card pointing readers
// to that surface; no surface entries on this view.
export interface FreestyleSetsBrowseView {
  intro:                  string;
  totalSets:              number;
  subtypeSections:        SetSubtypeSection[];
  altSurfacesCrossLink:   AltSurfacesCrossLink;
}

export interface SetSubtypeSection {
  key:    SetSubtypeKey;
  label:  string;
  intro:  string;
  count:  number;
  cards:  CanonicalSetCard[];
}

export type SetSubtypeKey =
  | 'true-core'
  | 'composite-derived'
  | 'rotational'
  | 'whirl-swirl'
  | 'uns'
  | 'rooted-antisymposium';

export interface CanonicalSetCard {
  slug:                 string;
  hashtag:              string;
  displayName:          string;
  formula:              string;
  movementExplanation:  string;
  equivalenceReadings:  readonly string[];   // pre-shaped strings, "<reading> — <citation>"
  source:               CanonicalSetSourceKey;
  sourceLabel:          string;              // pre-shaped UI label
  sourceCitation:       string;
  auditStatus?:         CanonicalSetAuditKey;
  auditStatusLabel?:    string;              // pre-shaped UI label
  derivedSystems:       readonly SlugLinkVM[];
  relatedSystems:       readonly SlugLinkVM[];
  detailHref:           string;              // /freestyle/sets/<slug> detail target
  showDetailLink:       boolean;             // suppresses the link when the detail page cannot resolve
}

export type CanonicalSetSourceKey = 'canonical' | 'platform-tracked' | 'holden-only';
export type CanonicalSetAuditKey   = 'aligned' | 'partial' | 'conflict' | 'holden-only';

export interface SlugLinkVM {
  slug:  string;
  label: string;
  href:  string;        // anchor href within the set hub (e.g. "#set-pixie")
}

export interface AltSurfacesCrossLink {
  heading:           string;
  framing:           string;
  movementSystemHref: string;
  ctaLabel:          string;
}

// ─────────────────────────────────────────────────────────────────────────
// Set Encyclopedia (standalone /freestyle/sets page).
//
// Distinct from /freestyle/tricks?view=sets (which embeds set content in
// the dictionary URL) and from /freestyle/compositional-sets (which is
// the exploratory hub). The Encyclopedia is the canonical user-facing
// entry point for "what is this set system?" — minimalist cards, scan-
// friendly, links to /freestyle/sets/<slug> for deep ontology.
//
// Per the curator UX directive: cards carry ONLY name +
// hashtag + compact formula + one-sentence movement + one provenance
// line + quick-relation tags + "View details →". Deep prose lives on
// the detail pages.
// ─────────────────────────────────────────────────────────────────────────

export interface FreestyleSetsEncyclopediaView {
  intro:           string;
  totalSets:       number;
  subtypeSections: readonly EncyclopediaSubtypeSection[];
  /** S4 mini-TOC: one pill per rendered subtype section, in render order.
   *  Empty when no sections render. */
  subtypeMiniToc:  readonly EncyclopediaMiniTocEntry[];
  crossLinks:      EncyclopediaCrossLinks;
}

export interface EncyclopediaMiniTocEntry {
  anchorId: string;     // matches the rendered <section id="...">
  label:    string;
}

export interface EncyclopediaSubtypeSection {
  key:   SetSubtypeKey;
  label: string;
  /** Curator-authored 2-3 sentence framing of this subtype. Surfaced
   *  under the h2 on /freestyle/sets so each category lands with
   *  immediate context rather than as bare taxonomy. Sourced from
   *  SET_SUBTYPE_SPECS in freestyleCanonicalSets.ts (single source of
   *  truth across encyclopedia + detail surfaces). */
  intro: string;
  count: number;
  cards: readonly EncyclopediaSetCard[];
  /** S4 Read-next footer: forward pointer to the next rendered subtype
   *  section. Null on the last rendered section (no next; footer
   *  suppresses). The tagline is the first sentence of the next
   *  section's intro, lowercased — short enough for a 1-line footer. */
  nextSubtypeAnchor:  string | null;
  nextSubtypeLabel:   string | null;
  nextSubtypeTagline: string | null;
}

export interface EncyclopediaSetCard {
  slug:            string;
  hashtag:         string;
  displayName:     string;
  formula:         string;
  /** First sentence of movementExplanation; compact + scan-friendly. */
  compactMovement: string;
  /** Single short line — combines source + audit status into one label. */
  provenanceLine:  string;
  /** Beginner-safe status pill that keeps internal source names off the card:
   *  'Under review' (documented disagreement), 'Platform-tracked', or
   *  'Community-cited' (compilation-only). key is the kebab CSS hook. */
  statusPill:      { label: string; key: string };
  /** Up to 3 quick-relation tags (derived first, then related). */
  quickRelations:  readonly SlugLinkVM[];
  /** Resolves to /freestyle/sets/<slug>. */
  detailHref:      string;
  /** Kebab-case role key for CSS targeting (e.g. 'plus-one-entry'). */
  roleKey:         EncyclopediaCardRole;
  /** Uppercase short label shown in the card header (e.g. '+1 ENTRY'). */
  roleLabel:       string;
  /** True for the 5 literal-primitive true-core entries that anchor most
   *  of the compositional vocabulary (pixie / fairy / stepping / atomic /
   *  quantum). Drives a small ★ chip + tooltip in the card header. */
  isFlagship:      boolean;
  /** Tooltip text for the ★ chip on flagship cards. */
  flagshipTitle?:  string;
  /** Up to 3 canonical tricks this set is commonly seen in (lowest ADD first,
   *  then alphabetical). Empty when no modifier-registry rows link the set.
   *  Surfaced as "Common in:" on the card — deliberately non-deterministic
   *  wording, since a set is one ingredient among several in any compound. */
  commonIn:        readonly SlugLinkVM[];
}

export type EncyclopediaCardRole =
  | 'plus-one-entry'
  | 'clip-entry'
  | 'composite'
  | 'rotational'
  | 'whirl-swirl'
  | 'uns-entry'
  | 'rooted';

export interface EncyclopediaCrossLinks {
  dictionaryBysetLabel:    string;
  dictionaryBysetHref:     string;
  compositionalHubLabel:   string;
  compositionalHubHref:    string;
  operatorsPageLabel:      string;
  operatorsPageHref:       string;
  flatReferenceLabel:      string;
  flatReferenceHref:       string;
}

// Set detail page content.
// One page per canonical set at /freestyle/sets/<slug>. Mirrors the
// trick-detail structure: hashtag · formula · movement explanation ·
// equivalence readings · derived/related systems · example tricks ·
// cross-links · source/audit provenance.
export interface FreestyleSetDetailContent {
  slug:                 string;
  hashtag:              string;
  displayName:          string;
  subtype:              SetSubtypeKey;
  subtypeLabel:         string;
  formula:              string;
  movementExplanation:  string;
  equivalenceReadings:  readonly string[];
  derivedSystems:       readonly SlugLinkVM[];
  relatedSystems:       readonly SlugLinkVM[];
  exampleTricks:        readonly SetDetailExampleTrick[];
  hasExampleTricks:     boolean;
  crossLinks:           SetDetailCrossLinks;
  source:               CanonicalSetSourceKey;
  sourceLabel:          string;
  sourceCitation:       string;
  auditStatus?:         CanonicalSetAuditKey;
  auditStatusLabel?:    string;
  componentMechanicsNote: string;
  /** S5 subtype-internal sibling navigation: previous/next set within
   *  the same subtype, in CANONICAL_SETS declaration order (the same
   *  order the encyclopedia card grid uses). Null on the first/last
   *  set within the subtype; the sibling-nav strip suppresses entirely
   *  if both are null. */
  previousSet:          SetDetailSibling | null;
  nextSet:              SetDetailSibling | null;
}

export interface SetDetailSibling {
  slug:        string;
  displayName: string;
  href:        string;
}

export interface SetDetailExampleTrick {
  slug:                string;
  displayName:         string;
  href:                string;
  adds:                string | null;
  addsLabel:           string;
  operationalNotation: string;
}

export interface SetDetailCrossLinks {
  setHubHref:                string;
  compositionalHubHref:      string;
  movementSystemAxisHref:    string;
  operatorReferenceHref?:    string;
  flatReferenceHref:         string;
}

// Dex-count grouped browse view. Buckets active dictionary tricks by the number of [DEX] tokens
// in their operational_notation field. Pedagogical axis: "How many dex
// moves does this trick involve?". Tricks without op_notation fall into an
// "Unknown" bucket. Uses the shared dictionary-trick-card partial; card
// shapes are identical to the ADD view.
export interface FreestyleTrickDexCountGroup {
  dexCount: number | null;     // null = unknown (no op_notation)
  dexLabel: string;            // pre-shaped: '0 dex events', '1 dex event', '2 dex events', '3+ dex events', 'Unknown / no notation'
  bucketId: string;            // pre-shaped section anchor: 'dex-0', 'dex-1', ... 'dex-unknown'. Avoids Handlebars 0-is-falsy footgun in the template.
  cards: DictionaryTrickCard[];
}

// One row in the ?view=sets projection. Each set/modifier carries the list
// of canonical tricks that use it via freestyle_trick_modifier_links.
// modifierType ('set' | 'body' | 'rotational-qualifier') drives the
// section-header grouping in the template.
//
// Cards are full DictionaryTrickCard view-models (NOT FreestyleTrickIndexRow).
// The dictionary-trick-card partial expects DictionaryTrickCard's shape —
// displayName, href, addsLabel, operationalNotation.tokens,
// tokenizedEquivalences, mediaCoverage, etc. — so the trick titles render
// as linked anchors and the standardized JOB block fires consistently
// across every browse view. An earlier approach used
// FreestyleTrickIndexRow here, which left most card fields blank and
// reduced the rendered output to bare hashtags. The DictionaryTrickCard
// shape closes that gap.
export interface FreestyleSetGroup {
  modifierSlug: string;
  modifierName: string;
  modifierType: string;
  addBonus: number;
  addBonusRotational: number;
  cards: DictionaryTrickCard[];
  trickCount: number;
}

// Cross-link from a family-filtered dictionary view to a section in the
// ?view=sets projection. Surfaces the modifiers used by tricks in the
// active family. Driven entirely by freestyle_trick_modifier_links —
// no schema, ontology, or routing change.
export interface FreestyleRelatedSetLink {
  modifierSlug: string;
  modifierName: string;
  modifierType: string;
  count: number;          // number of in-family tricks linked to this modifier
  href: string;           // /freestyle/tricks?view=sets#set-{modifierSlug}
}

// ─────────────────────────────────────────────────────────────────────────
// ComponentBrowseView.
//
// Browses tricks grouped by the structural component they share. Current
// scope: body modifiers + set modifiers only. Topology groups and movement
// archetypes are deferred to a future slice.
//
// A trick may appear in multiple groups (intentional duplication; a single
// trick can carry multiple modifier links of different types). This is the
// load-bearing browse path the slice unlocks.
// ─────────────────────────────────────────────────────────────────────────

export interface ComponentGroup {
  componentSlug:   string;          // modifier_slug
  componentName:   string;          // display name (lowercase canonical or display-cased)
  bodyDefinition:  string | null;   // one-line body-mechanics definition; null when curator hasn't authored one
  memberCount:     number;          // post-filter trick count
  anchorId:        string;          // `component-{slug}` for hash-anchor navigation
  cards:           DictionaryTrickCard[];   // ADD ascending, then name
}

export interface ComponentAxis {
  axisKey:    'body' | 'set';
  axisLabel:  string;
  anchorId:   string;                // `axis-body` / `axis-set`
  groups:     ComponentGroup[];      // priority-ordered, then alphabetical
}

export interface ComponentBrowseView {
  axes:  ComponentAxis[];
  // Explanatory note rendered above the axes. Static prose — kept short.
  duplicationNote: string;
}

// ─────────────────────────────────────────────────────────────────────────
// TopologyBrowseView (topology browse axis).
//
// Pedagogically-grounded, high-confidence educational groups. Memberships
// computed deterministically from existing data (base_trick + modifier_links
// + a small curator-tagged dex-class map for hippy/leggy).
//
// The 6 CSV-defined topology groups in symbolic_topology_groups.csv are NOT
// surfaced here; those are an advanced taxonomy. This surface
// deliberately stays a small, learner-friendly set per curator
// guidance: "small, obvious, educational, high-confidence; avoid hyper-
// fractal symbolic overfitting."
// ─────────────────────────────────────────────────────────────────────────

export interface TopologyGroup {
  topologySlug:   string;          // 'hippy-downtime-dex'
  topologyName:   string;          // 'Hippy downtime dex'
  bodyDefinition: string;          // one-line biomechanical definition
  memberCount:    number;
  anchorId:       string;          // 'topology-{slug}'
  cards:          DictionaryTrickCard[];   // ADD ascending then name
}

export interface TopologyBrowseView {
  // Observational-layer attribution rendered as a badge near the top.
  layerSource:        'observational';
  // Static framing prose — kept short, explicitly observational.
  observationalNote:  string;
  groups:             TopologyGroup[];
}

// ─────────────────────────────────────────────────────────────────────────
// MovementSystemBrowseView (Movement System axis projection).
//
// Curator-authored four-axis ontology projecting modifier groups under
// pedagogical axes (Set/Uptime, Entry Topologies, Midtime Body, No-Plant
// & Suspension). Axes + memberships are sourced from the content module
// freestyleMovementSystems.ts; trick memberships are computed by joining
// the axis modifier slugs against modifier_links (the same data already
// loaded for the Component view).
// Reuses shapeDictionaryTrickCard and isTrickRow.
// ─────────────────────────────────────────────────────────────────────────

export interface MovementSystemGroup {
  modifierSlug:   string;
  modifierName:   string;
  bodyDefinition: string | null;   // reused from COMPONENT_DEFINITIONS; null when curator hasn't authored one
  // Per-modifier educational composition gloss
  // (e.g., paradox: "PDX + base — entry topology..."). Single italic
  // line rendered above the card stack. null when no curator entry.
  compositionGloss: string | null;
  memberCount:    number;
  anchorId:       string;          // `movement-${modifierSlug}` for hash-anchor navigation
  cards:          DictionaryTrickCard[];   // ADD ascending, then name
}

export interface MovementSystemAxisView {
  axisKey:        string;          // matches MovementSystemAxis.axisKey
  axisName:       string;          // matches MovementSystemAxis.axisName
  axisDefinition: string;          // matches MovementSystemAxis.axisDefinition
  anchorId:       string;          // `movement-axis-${axisKey}`
  groups:         MovementSystemGroup[];   // declaration-order per curator content module
}

export interface MovementSystemBrowseView {
  observationalNote: string;
  axes:              MovementSystemAxisView[];   // axes with zero non-empty groups are pruned
  // Alternative-surfaces subsection. Compact educational subsection rendered
  // AFTER the 4 movement-system axes. Always shaped; renders only when
  // activeView === 'movement-system'.
  alternativeSurfaces: AlternativeSurfacesView;
}

export interface AlternativeSurfacesView {
  intro:  string;
  groups: AlternativeSurfaceGroupView[];
}

export interface AlternativeSurfaceGroupView {
  slug:   string;            // anchor id ('alt-surface-sole-and-heel' etc)
  label:  string;            // pre-shaped group label
  note:   string;             // pre-shaped framing line
  tricks: AlternativeSurfaceTrickView[]; // members surviving the canonical-DB existence filter
}

export interface AlternativeSurfaceTrickView {
  slug:                 string;
  displayName:          string;
  href:                 string; // /freestyle/tricks/:slug
  adds:                 string | null;
  addsLabel:            string;  // pre-shaped '2 ADD' / '? ADD'
  operationalNotation:  string;  // raw op_notation string; empty when not populated
}

export interface FreestyleTricksIndexContent {
  // Default beginner/ADD view (always shaped; rendering controlled by activeView).
  addGroups: FreestyleTrickAddGroup[];
  // Quick-jump chips for the ADD view (levels 1..6 + a collapsed "7+ ADD"),
  // each linking to the in-page ADD section anchor. Empty off the ADD view.
  addJumpChips: { label: string; href: string }[];
  // ?view=dex-count grouped view.
  // Always shaped; UI branch renders only when activeView === 'dex-count'.
  dexCountGroups: FreestyleTrickDexCountGroup[];
  // ?view=sets grouped view. Always shaped;
  // UI branch renders only when activeView === 'sets'. Replaces the previous
  // sets→component alias (component view is soft-retired).
  setsBrowseView: FreestyleSetsBrowseView;
  activeView: FreestyleTricksActiveView;

  // Existing category-grouped view, preserved for ?view=category.
  groups: FreestyleTrickGroup[];
  familyGroups: FreestyleFamilyGroup[];  // first-class Family Parents, rendered as full sections
  // Minor lineages: conserved-terminal families below the current first-class
  // threshold, shown as a compact band rather than full sections.
  minorLineages: FreestyleMinorLineage[];
  // In-page jump index for the family view: root families and derived branch
  // families as anchor chips, so readers can skip between family sections
  // without scrolling the full list. Derived purely from familyGroups.
  familyJumpIndex: FreestyleFamilyJumpIndex;
  // Sets-grouped view: dictionary tricks bucketed by which modifier(s) they
  // use. Drives ?view=sets. Empty when no active tricks have modifier_links.
  setGroups: FreestyleSetGroup[];
  // ?view=sets cluster grouping (organizational): non-empty clusters in display
  // order, each wrapping its active modifier groups.
  setsClusterView: SetsClusterView[];
  // Component view (?view=component). Body + set modifier axes only.
  componentView: ComponentBrowseView;
  // Topology view (?view=topology). Six pedagogically-
  // grounded educational groups computed from existing data (base_trick +
  // modifier_links + curator-tagged dex-class map). Observational layer.
  topologyView: TopologyBrowseView;
  // Four-axis Movement System projection
  // (Set/Uptime · Entry Topologies · Midtime Body · No-Plant & Suspension).
  // Always shaped. Source: src/content/freestyleMovementSystems.ts.
  movementSystemView: MovementSystemBrowseView;
  modifiers: FreestyleModifierEntry[];   // body/set modifier reference table
  totalTricks: number;
  activeFamily: string | null;           // when set, dictionary is filtered to this family only (hashtag-click filter)
  // Empty unless activeFamily is set AND the family has modifier-linked tricks.
  relatedSetGroups: FreestyleRelatedSetLink[];
  // dictionaryIntro: plain-language intro rendered once below the hero on
  // every browse view. familyViewIntro: per-view context note for the
  // advanced family browse view. Absence = silence (template branches on
  // truthy string).
  dictionaryIntro: string | null;
  familyViewIntro: string | null;
  // Per-view scale sentences (browse-shell cleanup). Each is computed from the
  // same group arrays the template renders, so the counts always match the
  // visible sections/cards. Rendered once in the corresponding view's intro.
  familyScale: string | null;
  dexCountScale: string | null;
  movementSystemScale: string | null;
  setsScale: string | null;
  topologyScale: string | null;
  /** Landing-surface 3-band conceptual grid
   *  rendered above the inline view-toggle when on the default landing view.
   *  Bands = Difficulty / Structure / Tracking & Expansion. Each card carries
   *  a lens question + count + full-enumeration chip preview + optional
   *  cross-link. Each card surfaces
   *  ALL labels in its enumeration (wrapped-chip form) so the landing feels
   *  encyclopedic and navigable rather than truncated. */
  landingGrid: DictionaryLandingGrid;
  // Beginner orientation bridge above the landing grid on the default view:
  // what the dictionary is, a high-level ADD definition, a single-base build-up
  // example, the three exploration lenses, and deep links into the glossary.
  landingOnboarding: DictionaryLandingOnboarding;
}

export interface DictionaryLandingOnboarding {
  heading: string;
  intro: readonly string[];
  definitions: readonly { term: string; plain: string }[];
  example: { label: string; steps: readonly { name: string; note: string }[] };
  lenses: readonly { label: string; note: string }[];
  links: readonly { label: string; href: string }[];
}

export interface DictionaryLandingGrid {
  bands: readonly DictionaryLandingBand[];
}

export interface DictionaryLandingBand {
  eyebrow: string;  // 'DIFFICULTY' / 'STRUCTURE' / 'TRACKING & EXPANSION'
  cards:   readonly DictionaryLandingCard[];
}

export interface DictionaryLandingCard {
  label:        string;         // display label (sentence case)
  href:         string;         // /freestyle/tricks?view=… OR /freestyle/observational
  count:        number;         // bucket / group / row count (per C1 governance)
  countDisplay: string;         // thousands-separated count for the visible badge (e.g. '1,769')
  countSuffix:  string;         // noun the count enumerates ('families' / 'modifiers' / ...); rendered visibly next to the number AND in aria
  lensQuestion: string;         // 'How layered is the trick?'
  // Jump-menu entries: each links to its subsection/page anchor, with an
  // optional derived hit count (null when not available).
  chips:        readonly DictionaryLandingChip[];
  crossLink?:   { label: string; href: string };  // optional in-context cross-link
}

export interface DictionaryLandingChip {
  label: string;
  href:  string;                // anchor or page link the chip jumps to
  count: number | null;         // derived hit count; null when unavailable
}

// Higher-level modifier cluster for the grouped ?view=sets page (organizational
// UX; individual modifier groups nest underneath). Reversible content grouping,
// not ontology — see freestyleModifierClusters.ts.
export interface SetsClusterView {
  key:    string;               // `cluster-{key}` section anchor
  label:  string;
  blurb:  string;
  groups: FreestyleSetGroup[];  // active modifier groups in this cluster
}

export interface FreestyleMinorLineage {
  slug:  string;              // trick_family value; drives ?family={slug}
  name:  string;              // display label (e.g. "Flurry")
  count: number;              // documented descendant count
  href:  string;              // /freestyle/tricks?family={slug}
}

export interface FreestyleFamilyGroup {
  familySlug: string;
  familyName: string;         // capitalized family name (e.g. "Whirl")
  members: FreestyleTrickIndexRow[];
  // Shared symbolic trick cards, with anchor-first ordering.
  // Anchor = the family's base trick (slug === familySlug) when present.
  cards: DictionaryTrickCard[];
  // Optional cross-link to a symbolic educational surface for this family
  // (e.g., butterfly family → walking-family progression). Null when no
  // corresponding surface is shipped.
  crossLink: { label: string; href: string } | null;
  // Family-level shared-terminal-structure
  // invariant. Pedagogical surface rendered as a small subdued line below
  // the section heading. Curator-authored per family slug; null when no
  // entry exists. See src/content/freestyleFamilyInvariants.ts.
  sharedStructure: string | null;
  // For a derived branch family (torque/blender under osis; double-leg-over/
  // eggbeater under legover), the display name of its parent root family. Null
  // for a root family.
  branchParentName: string | null;
}

// One chip in the family-view jump index.
export interface FreestyleFamilyJumpChip {
  slug: string;
  name: string;
  count: number;     // rendered trick count in that family section
  anchor: string;    // in-page hash, e.g. "#family-whirl"
}

// Jump index for the family view: root families first, then derived branch
// families; a single entry points at the minor-lineages band when present.
export interface FreestyleFamilyJumpIndex {
  roots: FreestyleFamilyJumpChip[];
  branches: FreestyleFamilyJumpChip[];
  hasMinorLineages: boolean;
}

// ---------------------------------------------------------------------------
// Freestyle Insights types (service-layer constants, not DB-backed)
// ---------------------------------------------------------------------------

export interface InsightsModifier {
  rank:  number;
  name:  string;
  type:  string;   // pre-shaped label, e.g. "body modifier"
  count: number;
}

export interface FreestyleInsightsContent {
  mostUsed:          InsightsTrick[];
  mostUsedModifiers: InsightsModifier[];
  connectors:        InsightsTrick[];
  transitions:       InsightsTransition[];
  notableSequences:  InsightsSequence[];
  diversePlayers:    InsightsDiversePlayer[];
}

// ---------------------------------------------------------------------------
// Competition content types (canonical-results-derived)
// ---------------------------------------------------------------------------

export interface FreestyleCompetitorViewModel {
  personId: string;
  name: string;
  country: string | null;
  golds: number;
  silvers: number;
  bronzes: number;
  totalPodiums: number;
  profileHref: string | null;    // /members/{slug} if claimed, else /history/:personId
}

export interface FreestyleEraViewModel {
  era: string;
  events: number;
}

export interface FreestyleRecentEventViewModel {
  eventId:    string;
  title:      string;
  startDate:  string;
  city:       string;
  country:    string;
  href:       string;       // /events/:tag_normalized (platform event link)
}

export interface FreestyleFormatViewModel {
  key:        string;
  name:       string;
  blurb:      string;
  eventCount: number;   // live prevalence in documented events; 0 if none found
  eventLabel: string;   // pre-shaped, e.g. "20 documented events" or "" when 0
}

export interface FreestyleMilestoneEntry {
  rank:        number;
  name:        string;
  country:     string | null;
  value:       number;
  detail:      string;   // pre-shaped secondary stat
  profileHref: string | null;
}

export interface FreestyleMilestoneBucket {
  key:       string;
  title:     string;
  valueLabel: string;    // column header for `value`
  entries:   FreestyleMilestoneEntry[];
}

export interface FreestyleNationViewModel {
  rank:        number;
  country:     string;
  podiums:     number;
  golds:       number;
  competitors: number;
}

export interface FreestyleDecadeNationViewModel {
  decade:      string;
  nationCount: number;
  nations:     { country: string; podiums: number }[];
}

export interface FreestyleCompetitionContent {
  formats:           FreestyleFormatViewModel[];
  topCompetitors:    FreestyleCompetitorViewModel[];
  milestones:        FreestyleMilestoneBucket[];
  nations:           FreestyleNationViewModel[];
  worldChampions:    FreestyleMilestoneEntry[];
  geographyByDecade: FreestyleDecadeNationViewModel[];
  eventsByEra:       FreestyleEraViewModel[];
  recentEvents:      FreestyleRecentEventViewModel[];
  totalEvents:       number;
  dataNote:          string;
}

// ---------------------------------------------------------------------------
// Partnerships content types
// ---------------------------------------------------------------------------

export interface FreestylePartnershipViewModel {
  personIdA:       string;
  personNameA:     string;
  hrefA:           string | null;
  personIdB:       string;
  personNameB:     string;
  hrefB:           string | null;
  appearanceCount: number;
  winCount:        number;
  podiumCount:     number;
  yearSpan:        string | null;
}

export interface FreestylePartnershipBucket {
  title:        string;
  partnerships: FreestylePartnershipViewModel[];
}

export interface FreestylePartnershipsContent {
  buckets:      FreestylePartnershipBucket[];
  allRanked:    FreestylePartnershipViewModel[];
  totalShown:   number;
  dataNote:     string;
}

// ---------------------------------------------------------------------------
// History content types (editorial service-layer constants)
// ---------------------------------------------------------------------------

// ── Set-modifier registry entry ───────────────────────────
// One row in the glossary §10 "Set modifiers" grid. Renders as a compact
// registry tile: name + one-line meaning + optional decomposition + a
// deeplink anchor for cross-reference. Source-agnostic at the view-model
// layer: the service projects Tier-1 set operators (PIX / AT / Q / BL /
// FAIRY / STEP) AND OPERATOR_REFERENCE_ENTRIES (atomic / quantum / blurry /
// nuclear / barraging / furious) onto the same shape.
export interface FreestyleSetModifierEntry {
  slug:            string;                  // 'atomic', 'pixie', etc. — anchor target
  name:            string;                  // 'Atomic', 'Pixie'
  glyph:           string | null;           // 'AT', 'PIX'; null for non-Tier-1 entries
  oneLineMeaning:  string;                  // short prose; max ~2 sentences
  decomposition:   string | null;           // semantic decomposition string when curator-authoritative
  href:            string | null;           // optional cross-link (e.g. /freestyle/sets#move-pixie)
}

// One row in the glossary §7 abbreviation tables. Plain shape: short
// form on the left, plain-language meaning on the right.
export interface FreestyleGlossaryAbbreviationEntry {
  short:   string;                           // 'PDX', 'SS', 'DATW'
  meaning: string;                           // 'Paradox (body modifier).'
}

// One §6 "Common Advanced Modifiers" feel card. Player-facing pedagogical
// view of a modifier: a short movement-first description ("feel"), a
// structural intuition line, a canonical example, and an optional family
// adjacency hint. Distinct from the Surface-B intermediate-operators
// decomposition reference, which carries the structural-decomposition
// view of the same modifiers.
//
// Cards are partitioned into set-cluster and body-cluster arrays at the
// service layer (SET_MODIFIER_FEEL_CARDS / BODY_MODIFIER_FEEL_CARDS) so the
// template renders each pre-shaped list without status-field branching.
export interface ModifierFeelCard {
  slug:         string;                   // 'pixie', 'paradox' — anchors at `modifier-{slug}`
  name:         string;                   // 'Pixie', 'Paradox'
  glyph:        string | null;            // 'PIX', 'STEP' for Tier-1 set; null otherwise
  feel:         string;                   // one-sentence movement description
  intuition:    string;                   // one-line structural intuition
  example:      string;                   // canonical worked example(s)
  familyHint:   string | null;            // optional observational adjacency
  midtimeBody:  boolean;                  // flag for "midtime body modifiers" sub-cluster
}

// Curator-authored. 9 set-cluster cards, rendered top-to-bottom in the
// order below. Doctrine-aware phrasing per SEMANTIC_COMPRESSION_DOCTRINE
// §3 verb levels.
const SET_MODIFIER_FEEL_CARDS: readonly ModifierFeelCard[] = [
  {
    slug:        'pixie',
    name:        'Pixie',
    glyph:       'PIX',
    feel:        'Pixie creates tight, compressed uptime dexes.',
    intuition:   'A set primitive that shortens the dex window; pairs naturally with most bases.',
    example:     'Smoke = Pixie Drifter; Phoenix = Pixie Ducking Butterfly.',
    familyHint:  'Pixie frequently branches into smear, dimwalk, phoenix, and smog.',
    midtimeBody: false,
  },
  {
    slug:        'fairy',
    name:        'Fairy',
    glyph:       'FAIRY',
    feel:        'Fairy runs an alternate uptime path; the bag travels with illusion-style mechanics.',
    intuition:   'Recently confirmed as legitimate compositional vocabulary; structural role under community review.',
    example:     'Appears as both a standalone base and a modifier on other bases.',
    familyHint:  null,
    midtimeBody: false,
  },
  {
    slug:        'stepping',
    name:        'Stepping',
    glyph:       'STEP',
    feel:        'Stepping inserts a foot relocation mid-trick; the kicking foot moves between phases.',
    intuition:   'A modifier that adds a step within the set; stacks across most bases.',
    example:     'Ripwalk = Stepping Butterfly; Tripwalk = Stepping Quantum Butterfly.',
    familyHint:  'Stepping pairs with paradox to form the blurry family (Blur, Blurry Whirl, Blurry Torque, Food Processor).',
    midtimeBody: false,
  },
  {
    slug:        'atomic',
    name:        'Atomic',
    glyph:       null,
    feel:        'Atomic launches with cross-body, X-dex-like character from a toe set.',
    intuition:   'A heavier launch primitive; recent rulings note hidden paradox-from-toe character (under community review).',
    example:     'Atom Smasher = Atomic Mirage; Eggbeater = Atomic Legover.',
    familyHint:  'Atomic stacks with paradox into Nuclear; surfaces in eggbeater, silo, flux, legbeater.',
    midtimeBody: false,
  },
  {
    slug:        'quantum',
    name:        'Quantum',
    glyph:       null,
    feel:        'Quantum is a compressed-atomic feel; quicker, with similar cross-body character.',
    intuition:   'A set modifier historically called Toe-Blur; reads as a tighter atomic.',
    example:     'Quantum Mirage; Tripwalk = Stepping Quantum Butterfly.',
    familyHint:  'Quantum anchors tripwalk, legeater, and plasma.',
    midtimeBody: false,
  },
  {
    slug:        'blurry',
    name:        'Blurry',
    glyph:       null,
    feel:        'Blurry combines stepping momentum with paradox-style body positioning.',
    intuition:   'Folk-shorthand for "stepping + paradox"; the structural reading expands to the two operators acting together.',
    example:     'Blur = Stepping Paradox Mirage; Blurry Whirl = Stepping Paradox Whirl.',
    familyHint:  'The blurry family includes Blur, Blurry Whirl, Blurry Torque, and Food Processor.',
    midtimeBody: false,
  },
  {
    slug:        'nuclear',
    name:        'Nuclear',
    glyph:       null,
    feel:        'Nuclear stacks paradox and a downtime illusioning dex into a single heavy launch character.',
    intuition:   'A set modifier that structurally reads as paradox + illusion.',
    example:     'Matador = Nuclear Butterfly; Sumo = Nuclear Mirage.',
    familyHint:  'Nuclear anchors matador, sumo, and venom.',
    midtimeBody: false,
  },
  {
    slug:        'barraging',
    name:        'Barraging',
    glyph:       null,
    feel:        'Barraging puts two same-direction dexes on a single set.',
    intuition:   'A count-bearing set primitive that structurally reads as (dex) + (dex). The two dex steps are each ADD-bearing, giving the modifier a structural +2 weight.',
    example:     'Baroque = Barraging Osis; Flurry = Barraging Legover.',
    familyHint:  'Barraging anchors flurry, baroque, and the historical high-stepping cohort.',
    midtimeBody: false,
  },
  {
    slug:        'furious',
    name:        'Furious',
    glyph:       null,
    feel:        'Furious extends the uptime with rotational character.',
    intuition:   'A set modifier with rotational policy; non-rotational reading under community review.',
    example:     'Fury = Furious Paradox Mirage; Nemesis = Furious Barfly.',
    familyHint:  null,
    midtimeBody: false,
  },
];

// Curator-authored. 4 body-cluster cards, rendered top-to-bottom in the
// order below.
const BODY_MODIFIER_FEEL_CARDS: readonly ModifierFeelCard[] = [
  {
    slug:        'paradox',
    name:        'Paradox',
    glyph:       null,
    feel:        'Paradox pivots the hips between two dexes on the same set; the body changes sides mid-trick.',
    intuition:   'A body modifier that flips cross-body orientation between dex moments.',
    example:     'Paradox Whirl; Paradox Mirage.',
    familyHint:  'Paradox pairs naturally with symposium (the "PS X" shorthand) and stacks within Nuclear.',
    midtimeBody: false,
  },
  {
    slug:        'spinning',
    name:        'Spinning',
    glyph:       null,
    feel:        'Spinning carries a full-body 360° rotation through the dex moment.',
    intuition:   'A body modifier (flat); pairs with gyro for 180° rotations.',
    example:     'Mobius = Spinning Torque; Spinning Butterfly.',
    familyHint:  'Spinning anchors mobius, montage, and surreal.',
    midtimeBody: true,
  },
  {
    slug:        'ducking',
    name:        'Ducking',
    glyph:       null,
    feel:        'Ducking dips the head near the apex so the bag passes around the neck.',
    intuition:   'A body modifier; one of a four-way family (ducking, diving, weaving, zulu) defined by head direction and bag-fall side.',
    example:     'Phoenix = Pixie Ducking Butterfly; Mind-Bender.',
    familyHint:  'Ducking branches into phoenix, mind-bender, montage, tomahawk.',
    midtimeBody: true,
  },
  {
    slug:        'symposium',
    name:        'Symposium',
    glyph:       null,
    feel:        'Symposium is a no-plant leg discipline; the support leg stays off the ground through the dex.',
    intuition:   'A body modifier; often stacks with paradox (the "PS X" shorthand).',
    example:     'Surreal = Paradox Symposium Whirl; Mullet.',
    familyHint:  'Symposium pairs naturally with paradox and underlies surreal, surgery, mullet, montage, and superfly.',
    midtimeBody: false,
  },
];

// One member of a §5 family tree. Compound trick that branches off a
// family anchor (whirl / butterfly / mirage / osis).
export interface FreestyleFamilyTreeMember {
  slug:    string;                           // 'paradox-whirl'
  display: string;                           // 'paradox whirl'
  adds:    number | null;                    // 4, or null when ADD is unresolved
  href:    string;                           // '/freestyle/tricks/paradox-whirl'
}

// One family-tree entry for §5. Anchor on top, branched members below.
// Curator-selected pilot families; not every core trick gets a tree.
export interface FreestyleFamilyTree {
  anchorSlug:    string;                     // 'whirl'
  anchorDisplay: string;                     // 'whirl'
  anchorAdds:    number | null;              // anchor's own ADD value
  members:       readonly FreestyleFamilyTreeMember[];
}

// The glossary surfaces two abbreviation categories. `trickNames` are
// the shorthand readers meet in trick titles + composition prose;
// `operationalTokens` are the bracket-flagged component tokens that
// appear inside operational notation strings. Split intentionally so a
// learner reading §7 can scan the right list for the context they're in.
export interface FreestyleGlossaryAbbreviations {
  trickNames:        readonly FreestyleGlossaryAbbreviationEntry[];
  operationalTokens: readonly FreestyleGlossaryAbbreviationEntry[];
}

// Curator-authored. Order is rendered as-is.
const GLOSSARY_ABBREVIATIONS: FreestyleGlossaryAbbreviations = {
  trickNames: [
    { short: 'PDX',      meaning: 'Paradox (body modifier).' },
    { short: 'SS',       meaning: 'Same side / near. Component on the plant-foot side.' },
    { short: 'OP',       meaning: 'Opposite / far. Component on the non-plant-foot side.' },
    { short: 'SYMP',     meaning: 'Symposium, or symple; context decides.' },
    { short: 'DLO',      meaning: 'Double Leg Over.' },
    { short: 'ATW',      meaning: 'Around-the-World.' },
    { short: 'DATW',     meaning: 'Double Around-the-World.' },
    { short: 'BOP',      meaning: 'Butterfly, Osis, Paradox Mirage.' },
    { short: 'PS Whirl', meaning: 'Paradox Symposium Whirl.' },
  ],
  operationalTokens: [
    { short: 'DEX',  meaning: 'Dexterity component. The foot circles the bag.' },
    { short: 'XBD',  meaning: 'Cross-body component. Active foot crosses the body’s centerline.' },
    { short: 'BOD',  meaning: 'Body-position component. Spin, duck, dive, flying, or paradox pose change. Carries +1 ADD in body-modifier accounting (e.g. BOD(1) + clipper(1) for flying clipper).' },
    { short: 'CLIP', meaning: 'Clipper: inside-arch shoe surface.' },
    { short: 'TOE',  meaning: 'Toe surface: top of the shoe.' },
    { short: 'UNS',  meaning: 'Unusual surface. Non-standard delay or kick surface (sole, cloud, knee-front, etc.). Carries 1 ADD in surface-anchor accounting (e.g. UNS(1) = 1 ADD for sole-kick / cloud-kick).' },
    { short: 'DEL',  meaning: 'Delay / terminal stall component closing a JOB-notation chain.' },
  ],
};

// Glossary view-model. Carries the shaped notation examples so the §8
// notation explainers render with the same role-aware classification the
// trick-detail page uses. Keeps the glossary's promise ("color-coded
// structural roles") visible on the page itself.
// A family card plus its two INDEPENDENT doctrine labels, so the card stops
// collapsing ancestry and tier into one chip:
//   - lineage position: Root lineage, or Branch lineage (<parent>), from the
//     public roster's `parent` field;
//   - tier: Family Parent / Minor Lineage / Foundational Terminal Surface, from
//     freestyleFamilyTiers.
// Reflects already-adopted doctrine; changes no roster membership.
export interface GlossaryFamilyCardView extends GlossaryFamilyCard {
  lineageLabel: string;
  tierKey:      FamilyTier;
  tierLabel:    string;
}

// Family cards that are not in the public roster carry an explicit lineage parent
// + tier (they are sub-families/minor lineages, e.g. rev-whirl under whirl).
const CARD_ONLY_FAMILY_LINEAGE: Readonly<Record<string, { parentSlug: string; tier: FamilyTier }>> = {
  'rev-whirl': { parentSlug: 'whirl',     tier: 'minor-lineage' },
  'blur':      { parentSlug: 'mirage',    tier: 'minor-lineage' },
  'phoenix':   { parentSlug: 'butterfly', tier: 'minor-lineage' },
};

function shapeGlossaryFamilyCard(card: GlossaryFamilyCard): GlossaryFamilyCardView {
  const override   = CARD_ONLY_FAMILY_LINEAGE[card.slug];
  const parentSlug = override?.parentSlug ?? PUBLIC_FAMILY_PARENT_OF.get(card.slug) ?? null;
  const tier       = override?.tier ?? familyTier(card.slug);
  const lineageLabel = parentSlug
    ? `Branch lineage (${PUBLIC_FAMILY_LABEL.get(parentSlug) ?? parentSlug})`
    : 'Root lineage';
  return { ...card, lineageLabel, tierKey: tier, tierLabel: FAMILY_TIER_LABEL[tier] };
}

// A lineage sub-group within a tier ("Root lineages", "Branches of Osis").
export interface FamilyCardSubGroup {
  label: string;
  cards: readonly GlossaryFamilyCardView[];
}

// Family cards grouped PRIMARILY by display tier, then by lineage position, so
// every Family Parent reads as one tier whether it is a root or a branch. Reuses
// the same tier classifier + roster `parent` data the chips use; changes no
// roster membership or tier logic. Each card appears in exactly one group, so its
// `#term-{slug}` anchor still renders once.
export interface FamilyCardTierGroup {
  tierKey:   string;
  tierLabel: string;
  subGroups: readonly FamilyCardSubGroup[];
}

function familyCardParentSlug(slug: string): string | null {
  return CARD_ONLY_FAMILY_LINEAGE[slug]?.parentSlug ?? PUBLIC_FAMILY_PARENT_OF.get(slug) ?? null;
}

function buildFamilyCardTierGroups(): FamilyCardTierGroup[] {
  const allCards = [...ROOT_TERMINAL_FAMILIES, ...BRANCH_FAMILIES].map(shapeGlossaryFamilyCard);
  const tierOrder: { key: FamilyTier; label: string }[] = [
    { key: 'family-parent',                 label: 'Family Parents' },
    { key: 'minor-lineage',                 label: 'Minor Lineages' },
    { key: 'foundational-terminal-surface', label: 'Foundational Terminal Surfaces' },
  ];
  const groups: FamilyCardTierGroup[] = [];
  for (const { key, label } of tierOrder) {
    const tierCards = allCards.filter(c => c.tierKey === key);
    if (tierCards.length === 0) continue;
    const subGroups: FamilyCardSubGroup[] = [];
    const roots = tierCards.filter(c => familyCardParentSlug(c.slug) === null);
    if (roots.length) subGroups.push({ label: 'Root lineages', cards: roots });
    // Branches grouped by parent, in the order each parent first appears.
    const byParent = new Map<string, GlossaryFamilyCardView[]>();
    for (const c of tierCards) {
      const parentSlug = familyCardParentSlug(c.slug);
      if (parentSlug === null) continue;
      const bucket = byParent.get(parentSlug) ?? [];
      bucket.push(c);
      byParent.set(parentSlug, bucket);
    }
    for (const [parentSlug, cards] of byParent) {
      subGroups.push({ label: `Branches of ${PUBLIC_FAMILY_LABEL.get(parentSlug) ?? parentSlug}`, cards });
    }
    groups.push({ tierKey: key, tierLabel: label, subGroups });
  }
  return groups;
}

export interface FreestyleGlossaryContent {
  // Operator-board orientation strip embedded in §3 ("How Tricks Are Built").
  // Shared partial with the landing page; surface-specific heading + lede.
  operatorBoard:    OperatorBoardData;
  // Intermediate-operator reference rendered inside §3 as a quick-reference
  // subsection. Authoritative source for what each intermediate operator
  // means and how it decomposes; equivalence-chain tokens deep-link here.
  intermediateOperators: readonly OperatorReferenceEntry[];
  // Foundational tricks
  // and set-modifier grids rendered as compact symbolic objects inside §10.
  // Same view-model shape as the landing's coreTricks for partial reuse.
  coreTricks:       FreestyleCoreTrickCard[];
  setModifiers:     FreestyleSetModifierEntry[];
  notationExamples: {
    whirl:        NotationDisplay | null;
    paradoxWhirl: NotationDisplay | null;
    gauntlet:     NotationDisplay | null;
  };
  // Connective-tissue panels (observational symbolic-grammar layer) for
  // 6 high-value terms: paradox / symposium / ducking / spinning / whirl /
  // pixie. Each panel surfaces related tricks + related symbolic groups +
  // a notation hint + optional deep-link to a modifier-family page.
  // Always populated (length=6); panels
  // may have empty relatedTricks arrays when staging CSVs are missing.
  connectivePanels: GlossaryConnectivePanel[];
  // §7 abbreviation tables — split into trick-name shorthand and
  // operational-notation tokens. Curator-authored; lives on the service
  // layer so future additions don't require a template surgery pass.
  abbreviations:    FreestyleGlossaryAbbreviations;
  // §5 family-tree visuals — curator-selected pilot families (whirl /
  // butterfly / mirage / osis). Each entry: anchor + capped member list.
  // Members are public dictionary rows with their ADD values + detail-
  // page hrefs; never includes the anchor itself.
  familyTrees:      readonly FreestyleFamilyTree[];
  // §6 "Common Advanced Modifiers" feel cards. Player-facing pedagogical
  // view; complements Surface B's decomposition reference (intermediate
  // operators dl + execution mechanics + set modifier registry). See
  // SEMANTIC_COMPRESSION_DOCTRINE §3 for verb discipline; the cards use
  // Level-2 / Level-3 phrasing (movement-first). Partitioned at the service
  // layer so the template renders each cluster without status-field
  // branching: 9 set cards, 4 body cards.
  setModifierFeelCards:  readonly ModifierFeelCard[];
  bodyModifierFeelCards: readonly ModifierFeelCard[];
  // §5 family cards, grouped primarily by display tier (Family Parents, then
  // Minor Lineages) and within each by lineage position (root lineages, then
  // branches grouped under their parent). Each card preserves its #term-{slug}
  // anchor and appears in exactly one group.
  familyCardGroups: readonly FamilyCardTierGroup[];
  // Atoms not covered by the family-card cohorts above — clipper-stall,
  // legover, pickup, illusion, around-the-world, orbit. Same shape as
  // coreTricks; rendered under §5's "Other foundational atoms" subsection.
  // Preserves the #term-{slug} anchors for these atoms without
  // duplicating with the family-card anchors above.
  otherFoundationalAtoms: FreestyleCoreTrickCard[];
  // The ratified first-class family roster, sourced from the same module as
  // the dictionary's "By family" browse (PUBLIC_DISPLAY_FAMILIES) so the
  // glossary roster always matches the dictionary's. Not every entry has a
  // rich family card above; uncarded first-class families still appear here.
  firstClassFamilyRoster: readonly { slug: string; label: string; branches: readonly { slug: string; label: string }[] }[];
  // Minor lineages: conserved-terminal families below the current first-class
  // threshold, shown as a compact list under the roster.
  minorLineageRoster: readonly { slug: string; label: string; count: number }[];
  // Measured topology histograms (how tricks end / begin); widthBucket is a
  // quantized 5%-step width class so the bar carries no inline style.
  familyHistogram: readonly { label: string; count: number; tier: string; widthBucket: number }[];
  entryHistogram:  readonly { label: string; count: number; tier: string; widthBucket: number }[];
  // §8 ADD Accounting worked-example cards. Five compact
  // educational cards illustrating how ADD math composes for compound
  // tricks. Pulled from the curator-authored ADD_WORKED_EXAMPLES module,
  // shaped at this boundary with a visible statusLabel so the template
  // never renders the raw status code as text.
  addWorkedExamples:    ReadonlyArray<GlossaryAddExample & { statusLabel: string }>;
  // §1 Derivation atlas — five canonical entries rendered through the
  // derivation-first compositional-atlas primitives (derivation panel,
  // semantic-depth ladder, ADD breakdown, equivalence chain, doctrine
  // note). Demonstrates the compositional system upfront, before the
  // reference content begins.
  derivationAtlas:      readonly DerivationPanelEntry[];
  // §1 Core trick atoms — twelve curator-authoritative atoms with
  // movement-physical educational prose (curator-authored). Surfaces
  // a beginner-facing pedagogical layer ABOVE the existing symbolic /
  // structural reference content. Authoring principle: movement
  // intuition + foundational/cultural significance lead; compositional
  // pointers are explicitly secondary. Sourced from
  // src/content/freestyleCoreAtomEducational.ts. Each card carries a
  // detail-page href for navigation outward.
  coreAtomEducationalCards: readonly LanguageOfFreestyleAtomCard[];
}

/** Glossary §1 pedagogical atom card shape. Distinct from
 *  FreestyleCoreTrickCard (which is the symbolic / structural object
 *  rendered in §10); this card carries beginner-facing prose. */
export interface LanguageOfFreestyleAtomCard {
  slug:             string;
  displayName:      string;
  adds:             string;        // pre-formatted, e.g. "2 ADD"
  detailHref:       string;
  lead:             string;        // movement-physical
  movementIntuition: string;       // embodied coaching cue (what it feels like)
  foundationalNote: string;        // cultural / why-foundational
  familyRole:       string;        // optional secondary; empty string ok
}

// ── Emerging Vocabulary governance surface ────────────────────────────────
// Derived from the generated freestyleObservationalUniverse module
// (overlap-safe: in_db=false, governance_state∉{1,2}). Observational layer
// only — every figure is observationally extrapolated, never canonical.

export interface ObservationalStat {
  label: string;
  value: string;   // pre-formatted (e.g. '243', '16%')
  hint:  string;
}

export interface ObservationalCard {
  name:               string;
  /** Proposed canonical slug; NOT a live route. */
  slug:               string;
  sourceBadge:        string;
  sourceLabel:        string;
  ecosystem:          string;
  parentFamily:       string;
  /** 'ADD 3 (extrapolated)' or null when not derived. NEVER a canonical ADD. */
  addLabel:           string | null;
  /** ADD-accounting string, or null. */
  decomposition:      string | null;
  parserConfidence:   string;   // high | medium | low | ''
  doctrineConfidence: string;   // stable | blocked | policy-dependent | ''
  /** Curator note merged from the legacy curator module, when present. */
  curatorNote:        string | null;
  hasDetails:         boolean;
}

export interface ObservationalEcosystemGroup {
  ecosystem: string;
  label:     string;
  count:     number;
  cards:     readonly ObservationalCard[];
}

export interface ObservationalEcosystemRow {
  ecosystem:  string;
  label:      string;
  ready:      number;
  frontier:   number;
  doctrine:   number;
  unresolved: number;
  total:      number;
}

export interface ObservationalDoctrineCluster {
  key:              string;
  label:            string;
  count:            number;
  blockingQuestion: string;
  sampleNames:      readonly string[];
}

export interface ObservationalSummaryRow {
  name:   string;
  source: string;
}

export interface ObservationalSummarySection {
  total:       number;
  intro:       string;
  sampleCards: readonly ObservationalCard[];
  fullList:    readonly ObservationalSummaryRow[];
}

export interface FreestyleObservationalContent {
  stats:               readonly ObservationalStat[];
  statsNote:           string;
  layerNote:           string;
  /** Section A — clean mechanical promotions, grouped by ecosystem. */
  readyTotal:          number;
  readyGroups:         readonly ObservationalEcosystemGroup[];
  /** Section B — per-ecosystem frontier matrix + curator-confirm cards. */
  ecosystemMatrix:     readonly ObservationalEcosystemRow[];
  frontierTotal:       number;
  frontierGroups:      readonly ObservationalEcosystemGroup[];
  /** Section C — doctrine bottleneck clusters. */
  doctrineTotal:       number;
  doctrineClusters:    readonly ObservationalDoctrineCluster[];
  /** Section D — folk-name / historical unresolved. */
  folk:                ObservationalSummarySection;
  /** Section E — parser uncertainty / unresolved syntax. */
  parser:              ObservationalSummarySection;
  /** Alias / Duplicate archive — names that resolve to an existing trick. */
  aliasArchive:        ObservationalSummarySection;
  sources:             readonly { badge: string; label: string }[];
  canonicalReferences: readonly { label: string; href: string }[];
  generatedOn:         string;
  isEmpty:             boolean;
}

const OBSERVED_SOURCE_LABELS: Record<string, string> = {
  PB: 'PassBack', FM: 'FootbagMoves', SG: 'Stanford shorthand',
  FB: 'Footbag.org', FF: 'Footbag Finland', IFPA: 'IFPA', MULTI: 'Multiple sources',
};

const OBSERVED_ECOSYSTEM_LABELS: Record<string, string> = {
  'pixie': 'Pixie', 'fairy': 'Fairy', 'stepping': 'Stepping', 'quantum': 'Quantum',
  'atomic': 'Atomic', 'ducking': 'Ducking', 'spinning/gyro': 'Spinning / Gyro',
  'symposium/paradox': 'Symposium / Paradox', 'whirl/osis/other': 'Whirl / Osis',
  'blurry/furious': 'Blurry / Furious',
  'blurry': 'Blurry transitivity', 'dod-ddd': 'DOD / DDD policy',
  'pogo': 'Pogo composition', 'weaving': 'Weaving operator', 'shooting': 'Shooting operator',
  'other': 'Other', '(unclassified)': 'Other compounds',
};

function observedSourceLabel(badge: string): string {
  return OBSERVED_SOURCE_LABELS[badge] ?? badge;
}

function observedEcosystemLabel(slug: string): string {
  return OBSERVED_ECOSYSTEM_LABELS[slug]
    ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Other');
}

function shapeObservationalCard(
  row: ObservationalUniverseRow,
  curatorNotes: ReadonlyMap<string, string>,
): ObservationalCard {
  const note = curatorNotes.get(row.slug) ?? null;
  const addLabel = row.provisionalAdd ? `ADD ${row.provisionalAdd} (extrapolated)` : null;
  const decomposition = row.decomposition || null;
  return {
    name:               row.name,
    slug:               row.slug,
    sourceBadge:        row.source,
    sourceLabel:        observedSourceLabel(row.source),
    ecosystem:          row.ecosystem,
    parentFamily:       row.parentFamily,
    addLabel,
    decomposition,
    parserConfidence:   row.parserConfidence,
    doctrineConfidence: row.doctrineConfidence,
    curatorNote:        note,
    hasDetails:         Boolean(decomposition) || Boolean(note),
  };
}

// /freestyle/operators view-model. Pure URL promotion of the modifier-
// reference content that lives inside /freestyle/glossary §6. Both pages
// render the same shared partial `freestyle/partials/modifier-reference`;
// the operators page wraps it with its own hero + breadcrumbs so it can
// serve as a standalone discoverable destination.
// One compact row in the operators index. Mirrors the trick-dictionary /
// set-encyclopedia row contract: identity + a type/ADD pair + an optional
// set-only notation line + a status pill + click-throughs. Notation is present
// ONLY for set-structured modifiers (those with a canonical-set formula); body
// modifiers never carry a fabricated notation line.
export interface OperatorIndexRow {
  slug:        string;
  name:        string;
  hashtag:     string;                       // '#paradox'
  typeLabel:   string;                        // 'Set' | 'Entry' | 'Body' | 'No-plant'
  addLabel:    string | null;                // '+1' | '+1 / +2 rot' | null when untracked
  notation:    string | null;                // canonical-set formula; set modifiers only
  descriptor:  string | null;                // one short movement line
  status:      { key: string; label: string };
  // Sub-family divider label, set on the first row of an educational
  // sub-grouping within an axis (e.g. "Spin family"); null otherwise.
  subFamilyLabel: string | null;
  // Detail + browse hrefs are built in the template from `slug` (single-variable
  // URLs) so the query-string '=' is not HTML-escaped.
}

export interface OperatorIndexAxisGroup {
  axisKey:   string;
  axisName:  string;
  modifiers: OperatorIndexRow[];
}

export interface FreestyleOperatorsContent {
  // Compact, grouped index (the consistency layer). Per-modifier depth lives on
  // the detail/stub pages; the page tail carries only cross-cutting notes, so the
  // operators surface no longer renders the per-modifier reference (that stays in
  // the glossary's Modifiers & Operators section, the anchor home).
  indexAxes: OperatorIndexAxisGroup[];
}

// Data-driven detail page for a known modifier that has no hand-authored
// teaching essay yet: what it is, its type + ADD + set-only notation, the tricks
// that commonly use it, and its sibling modifiers. Keeps every modifier slug
// from dead-ending while honestly signalling that the rich page is pending.
export interface ModifierStubContent {
  slug:        string;
  displayName: string;
  hashtag:     string;
  typeLabel:   string;
  addLabel:    string | null;
  notation:    string | null;
  whatItIs:    string | null;
  // Per-modifier depth, pulled from the operator reference (the detail page is
  // now the canonical home for this content).
  decomposition:    string | null;
  workedExamples:   readonly string[];
  statusKey:   string;
  statusLabel: string;
  commonTricks:     { slug: string; name: string; adds: string }[];
  relatedModifiers: { slug: string; name: string }[];
}

export interface FreestyleHistoryEvolutionEntry {
  period: string;
  label: string;
  summary: string;
}

export interface FreestyleHistoryMediaPanel {
  // Either a YouTube video (preferred when an existing curated reference is
  // available) OR a placeholder caption when no asset is yet curated.
  // Templates render the video when `media` is non-null; otherwise they
  // render the placeholder hook with the caption text.
  media:           VideoMedia | null;
  caption:         string;
  placeholderNote: string | null;  // shown when media is null
}

export interface FreestyleHistoryContent {
  eras: FreestyleHistoryEra[];
  pioneers: FreestyleHistoryPioneer[];
  addSystem: string[];
  regionalShift: string;
  modernEra: string;
  // History-page editorial refinement.
  // "Evolution of difficulty" framing — not a new ontology layer; an editorial
  // pass through the same eras with a difficulty-arc lens.
  evolution: FreestyleHistoryEvolutionEntry[];
  // Combo-evolution narrative: how multi-trick
  // sequences grew from isolated kicks into linked dexterity combinations
  // through to modern density-driven runs. Editorial paragraphs.
  comboEvolution: string[];
  // Early-routine → guiltless framing: how judging and audience expectations
  // evolved from "creative routine" to ADD-aware combo-density baselines,
  // while keeping creativity and execution in the picture.
  earlyRoutineEvolution: string[];
  // Media slots. Each is null-safe so the template can render a placeholder
  // hook when no curated asset is available. Prefer existing curated/media
  // assets already in the platform; do NOT invent new YouTube IDs here.
  heroMedia:        FreestyleHistoryMediaPanel | null;
  pioneersMedia:    FreestyleHistoryMediaPanel | null;
  modernEraMedia:   FreestyleHistoryMediaPanel | null;
}

// ---------------------------------------------------------------------------
// Shaping helpers
// ---------------------------------------------------------------------------

function groupByType(rows: FreestyleRecordRow[]): FreestyleRecordGroup[] {
  const resolvableSlugs = getResolvableTrickSlugs();
  const groupMap = new Map<string, FreestyleRecordRow[]>();
  for (const row of rows) {
    const bucket = groupMap.get(row.record_type) ?? [];
    bucket.push(row);
    groupMap.set(row.record_type, bucket);
  }
  return Array.from(groupMap.entries()).map(([recordType, typeRows]) => ({
    recordType,
    label:   labelForType(recordType),
    records: typeRows.map(r => shapeFreestyleRecord(r, resolvableSlugs)),
  }));
}

function shapeLeaders(rows: FreestyleLeaderRow[]): FreestyleLeaderViewModel[] {
  return rows.map((row, i) => ({
    rank:        i + 1,
    holderName:  row.holder_name,
    holderHref:  personHref(row.holder_member_slug, row.person_id),
    recordCount: row.record_count,
    topValue:    row.top_value,
    topTrick:    row.top_trick,
  }));
}

// ---------------------------------------------------------------------------
// Trick dictionary helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  dex:      'Dexterity',
  body:     'Body',
  set:      'Set',
  compound: 'Compound',
  modifier: 'Modifier',
};

// Editorial notes for major trick families.
// These are service-layer constants, not DB-backed, and describe structural
// significance at the family level rather than individual tricks.
const FAMILY_NOTES: Record<string, string> = {
  whirl:
    'The whirl is the central rotational base in advanced freestyle. More compound tricks ' +
    'are built on whirl than any other base, ranging from single-modifier entries (paradox ' +
    'whirl, ducking whirl, blurry whirl) to dense compounds like mullet (3-modifier, 6 ADD) ' +
    'and montage (4-modifier, 7 ADD).',
  butterfly:
    'The butterfly sits at the intersection of dexterity and compound technique. It underlies ' +
    'ripwalk (Stepping Butterfly) and dimwalk (pixie butterfly), two of the most commonly ' +
    'performed 4-ADD tricks. Its 3-ADD starting point and moderate complexity make it the ' +
    'most common entry point into the compound vocabulary.',
  osis:
    'The osis spawns two major named sub-families: torque (miraging osis) and blender ' +
    '(whirling osis). These in turn anchor their own clusters (paradox torque and mobius' +
    'on the torque side, paradox blender and spender on the blender side), making the osis' +
    'one of the most generative bases in the advanced trick vocabulary.',
  mirage:
    'The mirage is the foundational 2-ADD dex base. Compounds include smear (pixie ' +
    'mirage) and tap (tapping mirage) at 3 ADD; atom smasher (atomic mirage) and blur ' +
    '(canonically Stepping Paradox Mirage) at 4 ADD.',
  clipper:
    'The clipper is a 1-ADD body kick into clipper position. Its primary compound derivative ' +
    'is flying-clipper. Stall-based compounds (ducking clipper, spinning clipper) surface via ' +
    'the Movement System view’s body-modifier axis; drifter anchors its own branch family.',
  legover:
    'The legover base yields a compact family: eggbeater (atomic legover) and flurry ' +
    '(barraging legover) are the primary 3-ADD entries. The family is notable for producing ' +
    'DLO-style combinations at 5 ADD (fog).',
  torque:
    'Torque is the most important intermediate base in advanced freestyle. Canonically ' +
    'Miraging Osis, it sits at 4 ADD and supports a dense cluster of high-difficulty ' +
    'derivatives: paradox torque and mobius (Spinning Torque) at 5 ADD, atomic torque ' +
    'at 6 ADD, and several 6-7 ADD compounds.',
  blender:
    'Blender is the other major 4-ADD osis compound (canonically Whirling Osis). ' +
    'Derivatives include paradox blender (5 ADD), spender (Spinning Paradox Blender, 6 ADD), ' +
    'and food processor (blurry blender).',
};

// Rotational base tricks, these receive the higher modifier bonus (add_bonus_rotational)
const ROTATIONAL_BASES = new Set(['whirl', 'mirage', 'torque', 'blender', 'swirl', 'drifter']);

// Slug-keyed lookup for trick-detail Tier-4 disclosure. Built once at
// module load from the curator-published resolved-formulas content
// module. Missing slugs return null → silent suppression (Tier-3 absence
// on the trick-detail page), preserving the test-pinned 4-tier
// rendering hierarchy contract.
const RESOLVED_FORMULAS_BY_SLUG: ReadonlyMap<string, ResolvedFormula> = (() => {
  const map = new Map<string, ResolvedFormula>();
  for (const formula of RESOLVED_FORMULAS_SPRINT_1) {
    map.set(formula.slug, formula);
  }
  return map;
})();

/** Resolve the curator-authored JOB operational notation for a slug.
 *  Lookup order: CoreTrickSpec (12 atoms) → RESOLVED_FORMULAS_SPRINT_1
 *  (curator-published compounds carrying operationalNotation) → DB row's
 *  operational_notation column. Returns null when no source has a value.
 *
 *  This is the single source-of-truth path for JOB notation shaping.
 *  Both shapeDictionaryTrickCard (browse) and the trick-detail builder
 *  consult it so card + detail page stay in sync. */
function resolveOperationalNotationRaw(
  slug: string,
  dbRaw: string | null | undefined,
): string | null {
  const coreAtomSpec = CORE_TRICK_SPEC.find(s => s.slug === slug);
  if (coreAtomSpec?.operationalNotation) return coreAtomSpec.operationalNotation;
  const resolved = RESOLVED_FORMULAS_BY_SLUG.get(slug);
  if (resolved?.operationalNotation) return resolved.operationalNotation;
  return dbRaw ?? null;
}

/** Resolve the Tier-4 ADD-analysis disclosure for a trick slug. Returns
 *  null when the slug has no curator-published resolved formula —
 *  trick-detail then silently omits the disclosure section. Provenance
 *  is intentionally NOT included in the disclosure (curator-internal
 *  language; see [[feedback_public_facing_prose]]). */
/** Strip the trailing `= N ADD` from a curator-published
 *  derivation string. The hero ADD chip (`{adds} ADD`) is the authoritative
 *  ADD display on trick-detail + first-class browse cards; the breakdown row
 *  carries the operator-by-operator math without restating the total. The
 *  /freestyle/add-analysis worked-examples and glossary §formulas
 *  intentionally keep the terminator (teaching surfaces; out of scope). */
function stripDerivationAddTerminator(s: string): string {
  return s.replace(/\s*=\s*\d+\s*ADD\s*$/, '');
}

function shapeTrickAddAnalysis(slug: string): TrickAddAnalysisDisclosure | null {
  const formula = RESOLVED_FORMULAS_BY_SLUG.get(slug);
  if (!formula) return null;
  return {
    derivation: stripDerivationAddTerminator(formula.derivation),
    totalAdd:   formula.totalAdd,
  };
}

// ── First-class trick cohort ─────────────────────────────────────────────
//
// First-class status is curator-governed via two explicit tiers. A trick
// renders as first-class when it appears in either tier; the renderer uses
// `isFirstClass(slug)` to check membership and `getFirstClassTier(slug)`
// to differentiate visual/test-level behavior.
//
// Semantic interpretation: "first-class" means FOUNDATIONAL +
// PUBLICATION-QUALITY, NOT "elite" or "high-ADD". A trick earns the
// secondary JOB/ADD strip when (a) its canonical structure is
// curator-locked, (b) its display + slug are stable, and (c) the trick
// plays a foundational pedagogical role — the 12 core atoms, the
// foundational 1-ADD surface vocabulary (anatomical surface stalls,
// unusual-surface kicks, folk-name surfaces), the operator-first
// 1-ADD primitives (flying-family), and curator-handpicked compound
// showcases. The semantic is the explicit foundational-band reading
// (widened from an implicit "elite-only" reading).
//
// Promotion criteria (apply to BOTH tiers):
//   - passes assertFirstClassConvergence (derivation == computed ==
//     official ADD, no doctrine blocker, notation populated)
//   - stable canonical slug + display name
//   - foundational role OR publication-quality role — an atom of the
//     movement vocabulary, a foundational primitive that introduces a
//     learning dimension (surface family, unusual-surface ADD bucket,
//     flying-operator decomposition, sui-generis self-token notation,
//     …), OR a compound that adds an educational dimension not already
//     covered (operator, family, folk-name equivalence, multi-operator
//     chain)
//   - not in DOCTRINE_BLOCKED_SLUGS
//
// Tier criteria:
//   Tier 1 — JOB + ADD both curator-locked. Atoms with
//     ATOMIC_FLAG_DECOMPOSITIONS entries (providing operationalChain +
//     decomposition strings), or compounds with both curator-authored
//     operational_notation AND a RESOLVED_FORMULAS_SPRINT_1 entry.
//     Cards render at full osis-grade parity (both first-class rows
//     populated, no incomplete-state line).
//   Tier 2 — ADD curator-locked; Job notation genuinely absent upstream.
//     RESOLVED_FORMULAS_SPRINT_1 entries whose operational_notation
//     column is empty. Cards render the ADD breakdown plus the honest
//     "JOB: notation pending" incomplete-state line.
//
// To promote a slug: verify the criteria above, add to the appropriate
// tier with an inline comment naming the foundational or educational
// dimension it adds. To demote: remove the entry; the renderer falls
// back to standard dictionary-card rendering automatically.
const FIRST_CLASS_TIER_1: ReadonlySet<string> = new Set([
  // 11 atom singletons — full curator data via ATOMIC_FLAG_DECOMPOSITIONS.
  // Orbit deliberately excluded: its base_trick is empty in the DB
  // (it's a CORE_TRICK_SPEC atom but the convergence rule treats it as
  // compound). Promote in a future slice when the classification is
  // reconciled.
  'osis',                // golden reference; double-pass rotational dex
  'toe-stall',           // foundational stall — surface anchor
  'clipper-stall',       // inside-shoe stall; clipper family root
  'mirage',              // mirage family root; cross-body rotational dex
  'whirl',               // whirl family root; rotational dex
  'butterfly',           // butterfly family root; rotational dex on a different beat
  'swirl',               // reverse-rotation dex atom
  'legover',             // legover family root; dex over supporting leg
  'pickup',              // pickup family root; dex catching from below
  'illusion',            // dex with mid-flight rotation; mirror of mirage
  'around-the-world',    // orbit-class atom (ATW)
  // Compound with full curator data (op-notation + resolved formula).
  'pendulum',            // swing-class compound; only first-class compound at full parity
  // ── Foundational 1-ADD surface vocabulary (atomic; passes convergence;
  //    widens "first-class" from "elite" →
  //    "foundational + publication-quality"). Each entry introduces a
  //    distinct learning dimension. JOB sourced from curator DB
  //    op-notation; ADD from ATOMIC_FLAG_DECOMPOSITIONS below.
  'heel-stall',          // anatomical surface stall (heel); universal stall=1
  'inside-stall',        // anatomical surface stall (inside-of-foot); base for clipper family
  'outside-stall',       // anatomical surface stall (outside-of-foot)
  'head-stall',          // anatomical surface stall (head)
  'forehead-stall',      // anatomical surface stall (forehead)
  'neck-stall',          // anatomical surface stall (neck)
  'knee-stall',          // anatomical surface stall (knee)
  'shoulder-stall',      // anatomical surface stall (shoulder)
  'sole-kick',           // unusual-surface kick; introduces the unusual-surface ADD bucket
  'cloud-kick',          // unusual-surface kick (cloud = back of calf/shin); same bucket as sole-kick + cloud-stall exception
  'peak-delay',          // folk-name surface stall (peak = rim of ballcap); universal stall=1 applies to folk surfaces
  // ── Foundational 1-ADD flying-operator primitives. Introduce the
  //    operator-first chain decomposition at the 1-ADD level.
  //    flying(1) = 1 ADD; the operator owns the ADD slot, the surface
  //    is the terminal. See [[feedback_flying_operator_and_folk_surfaces]].
  'flying-inside',       // flying-operator primitive; chain 'flying > inside'
  'flying-outside',      // flying-operator primitive; chain 'flying > outside'
  'double-knee',         // sui-generis self-token JOB ('double knee'); flying-derived ADD
  // ── Foundational 2-ADD primitives (pedagogical ADD-bucket
  //    normalization). Extend the foundational band
  //    upward; each exposes a core ADD bucket explicitly.
  'cloud-stall',         // 2-ADD unusual-surface stall; teaches the unusual-surface(shin) + stall buckets
  'dragonfly-kick',      // 2-ADD flying primitive with dex; teaches bod + dex buckets
  'flying-clipper',      // 2-ADD flying primitive with xbody; teaches bod + xbody buckets
  // ── knee-clipper: folk name, not a literal clipper-surface stall;
  //    curator clarified it reads as a flying dex knee kick
  //    (bod + xbody = 2 ADD). Added to the foundational band so the
  //    audit/parser classification no longer trips on KNEE-CLIPPER STALL.
  'knee-clipper',        // 2-ADD flying dex knee kick (folk-name resolution)
  // ── guay: 2-ADD pickup-pattern dex primitive ending in inside-stall
  //    (sibling structure to pickup / legover / illusion / mirage).
  //    Released from DOCTRINE_BLOCKED_SLUGS curator_hold.
  'guay',                // 2-ADD dex + stall primitive; inside-stall terminus variant of pickup
]);

const FIRST_CLASS_TIER_2: ReadonlySet<string> = new Set([
  // Compounds with curator-published ADD derivation but no curator
  // operational notation. Card renders the ADD breakdown + honest
  // "JOB: notation pending" incomplete-state line. Cohort selected for
  // distinct educational dimensions; no redundant siblings.
  'paradox-mirage',          // paradox operator on mirage
  'symposium-mirage',        // symposium operator on mirage
  'atomic-butterfly',        // atomic operator on rotational base
  'ripwalk',                 // folk-name resolution (≡ stepping butterfly)
  'ducking-butterfly',       // ducking operator on rotational base
  'spinning-butterfly',      // spinning operator on rotational base
  'stepping-osis',           // stepping operator on osis (set-modifier showcase)
  'eggbeater',               // folk-name resolution (≡ atomic legover)
  'paradox-symposium-whirl', // multi-operator chain showcase
  // FootbagMoves single-source 8-ADD torque compounds. Sibling-composed
  // notation (not curator-confirmed); promoted under the arithmetic-closes
  // policy with honest single-source provenance.
  'surging-ducking-paradox-torque', // surging + ducking + paradox on torque(4) = 8
  'big-apple-sauce',                 // spinning + paradox + miraging + symposium on torque(4) = 8; FM lists 9
  // FootbagMoves single-source 7-ADD ready-now batch (same provenance posture).
  'margaritaville',                  // surging + paradox on blender(4) = 7
  'swirlwind',                       // spinning + paradox + symposium + whirling on swirl(3) = 7
  'genuphobia',                      // fairy + spyro + symposium on torque(4) = 7
  'redwetter',                       // shooting on eggbeater(3) = 6; FM lists 7
  'big-papa-smurf',                  // surfing on blender(4) = 7 (clean, no divergence)
  'liquifier',                       // splicing on blender(4) = 6; FM lists 7
  // FootbagMoves railing cohort, published at structural value with the
  // FM-7 over-count recorded as a railing-cohort divergence (railing = rooted + sailing = 2).
  'dorshanatrix',                    // railing + symposium on mirage(2) = 5; FM lists 7
  'flying-fish',                     // railing + ducking on mirage(2) = 5; FM lists 7
  'rail-warrior',                    // railing + ducking on butterfly(3) = 6; FM lists 7
  'floatation',                      // floating(3 = quantum+symposium+quantum) + butterfly(3) = 6; FM lists 7
  'warp',                            // warping(3 = two-dex set, 2nd dex symposium) + mirage(2) = 5; FM lists 7
  // Stepping + base batch (leading-[DEX] chassis; stepping=+1; all bases canonical).
  'stepping-mirage',
  'stepping-illusion',
  'stepping-legover',
  'stepping-butterfly',
  'stepping-blender',
  'stepping-reaper',
  'stepping-rev-whirl',
  'stepping-paradox-torque',
  'stepping-diving-mirage',
  'stepping-diving-butterfly',
  'stepping-ducking-drifter',
  'stepping-ducking-paradox-illusion',
  'stepping-ducking-symposium-eggbeater',
  // Spinning + base batch (back-spin chassis; spinning=+1; all bases canonical).
  'spinning-eggbeater',
  'spinning-rev-whirl',
  'spinning-tomahawk',
  'spinning-symposium-torque',
  'spinning-whirling-swirl',
  'spinning-ducking-drifter',
  'spinning-diving-symposium-whirl',
  'spinning-ducking-symposium-whirl',
  'spinning-ducking-superfly',
  'spinning-symposium-flux',
  'spinning-symposium-whirling-swirl',
  'spinning-miraging-symposium-torque',
  // Diving + base batch (DIVE [BOD] chassis; diving=+1; all bases canonical).
  'diving-mirage',
  'diving-illusion',
  'diving-legover',
  'diving-pickup',
  'diving-butterfly',
  'diving-whirl',
  'diving-drifter',
  'diving-osis',
  'diving-swirl',
  'diving-eclipse',
  'diving-smudge',
  'diving-symposium-mirage',
  // Fairy + base batch (TOE > SAME OUT [DEX] entry set; fairy=+1; all bases canonical).
  'fairy-butterfly',
  'fairy-drifter',
  'fairy-gyro-drifter',
  'fairy-gyro-torque',
  'fairy-illusion',
  'fairy-merkon',
  'fairy-rev-whirl',
  'fairy-ripstein',
  'fairy-spinning-ducking-osis',
  'fairy-swirling-swirl',
  'fairy-whirl',
  // Barraging + base batch (two-dex +2 chassis; barraging=+2; all bases canonical).
  'barraging-barfly',
  'barraging-butterfly',
  'barraging-eggbeater',
  'barraging-illusion',
  'barraging-legover',
  'barraging-mirage',
  'barraging-pickup',
  'barraging-whirl',
  // Symposium + base batch (no-plant first-dex chassis; symposium=+1; all bases canonical).
  'symposium-atomic-butterfly',
  'symposium-blur',
  'symposium-bubba',
  'symposium-mobius',
  'symposium-swirl',
  'symposium-tomahawk',
  'symposium-whirling-swirl',
  'symposium-miraging-mirage',
  // Swirling + base batch (OP BACK SWIRL [DEX] prefix chassis; swirling=+1; all bases canonical).
  'swirling-butterfly',
  'swirling-mirage',
  'swirling-paradox-mirage',
  'swirling-swirl',
  'swirling-symposium-whirl',
  'swirling-whirl',
  'swirling-whirling-swirl',
  // Pixie + base batch (TOE > SAME IN [DEX] entry set; pixie=+1; all bases canonical; alias-scrubbed).
  'pixie-dolomite',
  'pixie-rev-whirl',
  'pixie-spinning-paradox-blender',
  'pixie-spinning-paradox-symposium-whirl',
  'pixie-spinning-paradox-whirl',
  'pixie-symposium-rev-whirl',
  'pixie-symposium-whirling-swirl',
  // Small remnants (tapping / miraging / paradox; each +1; all bases canonical).
  'tapping-legover',
  'miraging-symposium-butterfly',
  'miraging-symposium-whirl',
  'paradox-fusion',
  'paradox-symposium-illusion',
  // Whirling-X (uptime-whirl operator; OP IN [DEX] prefix + leading-dex flip).
  'whirling-mirage',
  'whirling-pickup',
  'whirling-whirl',
  'whirling-butterfly',
  'whirling-rake',
  // Clean Tier-1 sweep (settled operators on canonical bases).
  'stepping-guay',
  'diving-guay',
  'tapping-guay',
  'fairy-guay',
  'inspinning-guay',
  'pixie-guay',
  'pixie-mirage',
  'pixie-clipper',
  'pixie-double-pickup',
  'pixie-diving-butterfly',
  'pixie-ducking-butterfly',
  'pixie-ducking-mirage',
  'pixie-symposium-reverse-whirl',
  'fairy-ducking-mirage',
  'fairy-torque',
  'diving-clipper',
  'diving-toe-stall',
  'stepping-barrage',
  'stepping-clipper',
  'gyro-clipper',
  'gyro-diving-butterfly',
  'symposium-whirling-mirage',
  'spinning-butterfly-kick',
  'barraging-barfly-swirl',
  'ducking-symposium-reverse-whirl',
  'tapping-double-over-down',
  'gyro-diving-clipper',
  // ── Audit-derived promotions. Each fully
  //    converges with official ADD via mechanical modifier × base
  //    derivation; no composite-modifier expansion, no doctrine block.
  'atomic-torque',           // atomic(+1) + torque(4) = 5 ADD
  'ducking-mirage',          // ducking(+1) + mirage(2) = 3 ADD
  'paradox-drifter',         // paradox(+1) + drifter(3) = 4 ADD
  'spinning-pickup',         // spinning(+1) + pickup(2) = 3 ADD
  'tapping-whirl',           // tapping(+1) + whirl(3) = 4 ADD
  // ── Promotions: 19 slugs already carrying
  //    curator-published derivations in RESOLVED_FORMULAS_SPRINT_1
  //    but never explicitly added to a tier set. Each row's derivation
  //    is settled; promotion is mechanical (set membership only).
  'atom-smasher',            // atomic(+1) + mirage(2) + symposium(+1) = 4 ADD (composite via base-mirage)
  'dimwalk',                 // stepping(+1) + butterfly(3) = 4 ADD
  'ducking-clipper',         // ducking(+1) + clipper-stall(2) = 3 ADD
  'ducking-osis',            // ducking(+1) + osis(3) = 4 ADD
  'ducking-whirl',           // ducking(+1) + whirl(3) = 4 ADD
  'fog',                     // stepping(+1) + paradox(+1) + dlo(3) = 5 ADD
  'orbit',                   // orbit-class atom
  'paradox-blender',         // paradox(+1) + blender(4) = 5 ADD
  'paradox-torque',          // paradox(+1) + torque(4) = 5 ADD
  'rake',                    // 2-ADD primitive
  // 'rev-up' excluded from FIRST_CLASS_TIER_2: structurally
  // distinct from rev-whirl (per curator clarification) but no
  // structural decomposition authored; demoted via is_active=0 in
  // red_corrections.
  'rev-whirl',               // 3-ADD whirl-family primitive
  'smear',                   // pixie(+1) + mirage(2) = 3 ADD
  'spinning-clipper',        // spinning(+1) + clipper-stall(2) = 3 ADD
  'spinning-osis',           // spinning(+1) + osis(3) = 4 ADD
  'spinning-torque',         // spinning(+1) + torque(4) = 5 ADD
  'stepping-whirl',          // stepping(+1) + whirl(3) = 4 ADD
  'symposium-whirl',         // symposium(+1) + whirl(3) = 4 ADD
  'whirling-swirl',          // whirling(+1) + swirl(3) = 4 ADD
  // ── Promotions: 28 slugs covering the remaining
  //    audit-validated promotion candidates. 6 via ATAM bracket-flag
  //    decomposition (squeeze through barraging-osis); 22 via parser-
  //    derived modifier × base (or composite for witchdoctor). The
  //    promotion-candidate pool is closed for
  //    all rows except composite-modifier compounds (blurry-* / haze /
  //    food-processor / mantis / nova) and the missing-notation /
  //    doctrine-blocked / folk-name primitive backlog.
  // ATAM bracket-flag (6):
  'squeeze',                 // UNS(1) + stall(1) = 2 ADD
  'barrage',                 // dex(1) + dex(1) + stall(1) = 3 ADD
  'barfly',                  // dex(1) + dex(1) + xbody(1) + stall(1) = 4 ADD
  'high-plains-drifter',     // dex(1) + dex(1) + xbody(1) + stall(1) = 4 ADD
  'paradon',                 // dex(1) + dex(1) + xbody(1) + stall(1) = 4 ADD
  'barraging-osis',          // dex(1) + dex(1) + BOD(1) + xbody(1) + stall(1) = 5 ADD
  // Parser-derived modifier × base (21) + composite witchdoctor (1):
  'cross-body-sole-stall',   // xbody(+1) + sole-stall(2) = 3 ADD
  'legeater',                // quantum(+1) + pickup(2) = 3 ADD
  'paste',                   // pixie(+1) + pickup(2) = 3 ADD
  'reverse-drifter',         // [directional: rev] + drifter(3) = 3 ADD
  'scrambled-eggbeater',     // atomic(+1) + pickup(2) = 3 ADD
  'tap',                     // tapping(+1) + mirage(2) = 3 ADD
  'blur',                    // stepping(+1) + paradox(+1) + mirage(2) = 4 ADD
  'hatchet',                 // diving(+1) + whirl(3) = 4 ADD
  'paradox-whirl',           // paradox(+1) + whirl(3) = 4 ADD
  'pigbeater',               // pixie(+1) + eggbeater(3) = 4 ADD
  'spinning-whirl',          // spinning(+1) + whirl(3) = 4 ADD
  'tripwalk',                // quantum(+1) + butterfly(3) = 4 ADD
  'matador',                 // nuclear(+2) + butterfly(3) = 5 ADD
  'phoenix',                 // pixie(+1) + ducking(+1) + butterfly(3) = 5 ADD
  'spinal-tap',              // tapping(+1) + torque(4) = 5 ADD
  'spinning-symposium-whirl',// spinning(+1) + symposium(+1) + whirl(3) = 5 ADD
  'witchdoctor',             // atom-smasher(4) + symposium(+1) = 5 ADD (composite)
  'mind-bender',             // ducking(+1) + paradox(+1) + blender(4) = 6 ADD
  'mullet',                  // ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 6 ADD
  'spender',                 // spinning(+1) + paradox(+1) + blender(4) = 6 ADD
  'gauntlet',                // stepping(+1) + ducking(+1) + paradox(+1) + torque(4) = 7 ADD
  'montage',                 // spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD
  // ── Mechanical notation back-fill promotions:
  //    18 ordinary modifier+base compounds + 1 foundational primitive
  //    (sole-stall via ATOMIC). All derive cleanly via standard
  //    modifier × base ADD math; no composite-modifier expansion.
  //    Notation is back-filled into the DB notation column.
  'flail',                   // symposium(+1) + illusion(2) = 3 ADD
  'magellan',                // pixie(+1) + legover(2) = 3 ADD
  'merkon',                  // spinning(+1) + legover(2) = 3 ADD
  'smudge',                  // pixie(+1) + illusion(2) = 3 ADD
  'assassin',                // pixie(+1) + ducking(+1) + mirage(2) = 4 ADD
  'haze',                    // stepping(+1) + dlo(3) = 4 ADD
  'mantis',                  // gyro(+1) + eggbeater(3) = 4 ADD
  'nova',                    // symposium(+1) + dlo(3) = 4 ADD
  'parkwalk',                // pixie(+1) + butterfly(3) = 4 ADD
  'royale',                  // paradox(+1) + reverse-drifter(3) = 4 ADD
  'smog',                    // pixie(+1) + dlo(3) = 4 ADD
  'smoke',                   // pixie(+1) + drifter(3) = 4 ADD
  'tapdown',                 // tapping(+1) + butterfly(3) = 4 ADD
  'tombstone',               // stepping(+1) + drifter(3) = 4 ADD
  'blurriest',               // blurry(+1 flat) + barfly(4) = 5 ADD (NOT composite carve-out)
  'grave-digger',            // stepping(+1) + torque(4) = 5 ADD
  'tomahawk',                // ducking(+1) + paradox-whirl(4) = 5 ADD
  'big-apple',               // gyro(+1) + symposium(+1) + torque(4) = 6 ADD
  // Foundational 2-ADD primitive parallel to cloud-stall:
  'sole-stall',              // UNS(1) + stall(1) = 2 ADD via ATOMIC
  // ── DATW + DLO promoted from the productive-multiplicity
  //    exception list to FIRST_CLASS_TIER_2. Both have notation +
  //    operational_notation backfilled via red_corrections; base_trick
  //    set to self via correction so isAtomic gate fires; ATOMIC_FLAG_
  //    DECOMPOSITIONS entry carries the bracket-counted structural form.
  'double-around-the-world',
  'double-leg-over',
  //    moved from OBSERVATIONAL_TRICKS module into canonical via
  //    audit-validated derivations. 9 FB.org + 4 PassBack + 1 stepwise
  //    FB.org (paradox-blizzard depends on blizzard, both promoted
  //    same slice). Per feedback_observational_canonical_promotion_cleanup,
  //    each row's observational entry is removed in the same change-set.
  'blizzard',                // stepping(+1) + illusion(2) = 3 ADD (PB)
  'blaze',                   // whirling(+1) + mirage(2) = 3 ADD (PB)
  'bedwetter',               // stepping(+1) + eggbeater(3) = 4 ADD (PB)
  'sole-survivor',           // spinning(+1) + symposium(+1) + whirl(3) = 5 ADD (PB)
  'spinning-paradox-mirage', // spinning(+1) + paradox(+1) + mirage(2) = 4 ADD (FB.org)
  'spinning-paradox-illusion', // spinning(+1) + paradox(+1) + illusion(2) = 4 ADD (FB.org)
  'spinning-paradox-whirl',  // spinning(+1) + paradox(+1) + whirl(3) = 5 ADD (FB.org)
  'paradox-double-leg-over', // paradox(+1) + dlo(3) = 4 ADD (FB.org)
  'paradox-barrage',         // paradox(+1) + barrage(3) = 4 ADD (FB.org)
  'paradox-symposium-mirage', // paradox(+1) + symposium(+1) + mirage(2) = 4 ADD (FB.org)
  'paradox-high-plains-drifter', // paradox(+1) + HPD(4) = 5 ADD (FB.org)
  'spinning-paradox-blender', // spinning(+1) + paradox(+1) + blender(4) = 6 ADD (FB.org)
  'stepping-ducking-paradox-blender', // stepping(+1) + ducking(+1) + paradox(+1) + blender(4) = 7 ADD (FB.org)
  'paradox-blizzard',        // paradox(+1) + blizzard(3) = 4 ADD (FB.org; stepwise via blizzard)
  // ── Doctrine-divergence pilot batch. First
  //    registered rows of DOCTRINE_DIVERGENCE_REGISTRY. Each carries a
  //    +1 gap between IFPA-grammar derivation (canonical) and PassBack
  //    source claim; documented as historical-divergence with public
  //    scoring-notes rendering on trick-detail pages.
  'blurrage',                // stepping(+1) + barrage(3) = 4 ADD (PB-source: 3)
  'predator',                // atomic(+1) + dlo(3) = 4 ADD (PB-source: 3)
  'schmoe',                  // stepping(+1) + legover(2) = 3 ADD (PB-source: 2)
  // ── Polish promotions: three ATW-family promoted
  //    rows + three held-delay leg-over family rows + butterfly-kick
  //    correction. Each has operationalNotation populated via the
  //    RESOLVED_FORMULAS overlay; promotion to FIRST_CLASS_TIER_2 here
  //    surfaces the JOB+ADD browse-card row (was: bare op-notation
  //    display only on trick-detail pages).
  'around-the-world-kick',       // around-the-world chain without the terminal (ss toe) stall = 1 ADD
  'triple-around-the-world',     // dex(3) + stall(1) = 4 ADD
  'double-around-the-world-heel', // dex(2) + heel-stall(1) = 3 ADD
  'hop-over',                    // inside-delay(1) + bod(1) = 2 ADD
  'walk-over',                   // inside-delay(1) + dex(1) = 2 ADD
  'wrap',                        // inside-delay(1) + dex(1) = 2 ADD
  'butterfly-kick',              // bod(1) + dex(1) = 2 ADD (corrected; was 3 ADD with extra [XBD])
  'eclipse',                     // bod(1) + del(1) + dex(1) = 3 ADD (airborne hop-over topology; curator-supplied JOB)
  // ── Deferred-candidate promotions (pixie family + toe-blizzard alias):
  //    pixie-opposite-clipper / pixie-same-clipper = pixie(+1) + clipper-stall(2) = 3 ADD;
  //    toe-blizzard is an alias of quantum-illusion (not a new canonical row).
  'pixie-opposite-clipper',      // [DEX] + [XBD] + [DEL] = 3 ADD (sibling JOB from drifter / fairy-clipper)
  'pixie-same-clipper',          // [DEX] + [XBD] + [DEL] = 3 ADD (sibling JOB from drifter / fairy-clipper)
  // ── Inspinning family promotions (settled: inspinning = +1 modifier):
  'inspinning-butterfly',        // (front) SPIN [BOD] + butterfly base = 4 ADD (sibling JOB from spinning-butterfly)
  'inspinning-paradox-illusion', // (front) SPIN [BOD] + paradox-illusion base = 4 ADD (sibling JOB from spinning-paradox-illusion)
  'inspinning-paradox-mirage',   // (front) SPIN [BOD] + paradox-mirage base = 4 ADD (sibling JOB from spinning-paradox-mirage)
  // ── Down-family promotions (settled: down-pattern tricks are distinct):
  'double-over-down',            // [DEX] + [DEX] + [XBD] + [DEL] = 4 ADD (TOE-set chassis; FB.org-confirmed JOB)
  'down-double-down',            // [DEX] + [DEX] + [XBD] + [DEL] = 4 ADD (CLIP-set chassis; FB.org-confirmed JOB)
  'down-diver',                  // diving(+1) + double-over-down(4) = 5 ADD ([BOD] + 4 base tokens; FB.org-confirmed JOB)
  // ── Paradox-family promotions (settled +1 PDX modifier; FB.org-confirmed JOBs):
  'paradox-da-da-curve',         // paradox(+1) + dada-curve(4) = 5 ADD ([PDX] + 4 base tokens)
  'paradox-whirling-swirl',      // paradox(+1) + whirling-swirl(4) = 5 ADD ([PDX] + 4 base tokens)
  // ── Symposium-pixie promotion (symposium = +1 no-plant body modifier; sibling-derived JOB):
  'symposium-pixie',             // symposium(+1) + pixie(2) = 3 ADD ([BOD] + [DEX] + [DEL])
  // ── Ricochet promotion (cross-body sole/flapper terminator; FB.org-confirmed JOB):
  'ricochet',                    // [DEX] + [DEX] + [XBD] + [UNS] + [DEL] = 5 ADD (flapper-stall base)
  // ── Flurricane promotion (gyro(+1) + flurry(4); FB.org-confirmed JOB):
  'flurricane',                  // gyro(+1) + flurry(4) = 5 ADD ([BOD] + 3*[DEX] + [DEL])
  // ── Pixie-swirl promotion (pixie(+1) + swirl(3); FB.org-confirmed JOB):
  'pixie-swirl',                 // pixie(+1) + swirl(3) = 4 ADD ([DEX] + [DEX] + [XBD] + [DEL])
  // ── Down-family follow-ons + flux (FB.org-confirmed JOBs):
  'pixie-double-over-down',      // pixie(+1) + double-over-down(4) = 5 ADD
  'scorpions-tail',              // spinning(+1) + down-double-down(4) = 5 ADD (alias: Spinning Down Double-Down)
  'flux',                        // atomic(+1) + osis(3) = 4 ADD (alias: Atomic Osis)
  // ── Avalanche + spike-hammer (structural twins; 3-operator-stack compressions):
  'avalanche',                   // stepping(+1) + ducking(+1) + paradox-illusion(3) = 5 ADD (alias: Stepping Ducking Paradox Illusion)
  'spike-hammer',                // stepping(+1) + ducking(+1) + paradox-mirage(3) = 5 ADD (alias: Stepping Ducking Paradox Mirage)
  // ── Double-over-down-swirl (extends double-over-down chassis; FB.org-confirmed JOB):
  'double-over-down-swirl',      // [DEX] + [DEX] + [DEX] + [XBD] + [DEL] = 5 ADD (double-over-down + OP BACK SWIRL third dex)
  // ── Quantum-symposium-mirage ('toe X → quantum X' retirement; FB.org-confirmed JOB):
  'quantum-symposium-mirage',    // quantum(+1) + symposium-mirage(3) = 4 ADD ([DEX] + [BOD] + [DEX] + [DEL]); folk-name alias "Backside Symposium Toe Blur"
]);

// "Compressed from" detail-page surface.
// Strict allowlist of famous/foundational structural compressions that
// reinforce the glossary §composition "Structural compression" concept
// directly on the flagship detail pages.
//
// DOCTRINE (curator-locked):
//   - NEVER add slugs to this map for ontology-expansion reasons. This
//     is pedagogy reinforcement of the glossary concept, not a general
//     equivalence-spam surface. The user-curator decides additions one
//     compression at a time.
//   - The label for each slug is curator-authored. "Compressed from"
//     reads the slug as the compressed form of a longer compositional
//     reading (smear ← pixie mirage). "Compressed reading" reads the
//     slug as the compact name with the reading as one expansion
//     (mobius has multiple compression depths).
//   - Reads readings[0] from freestyleSymbolicEquivalences.ts. The slug
//     MUST have an entry there; null is returned otherwise (clean
//     suppression).
//   - blur and barrage were considered but lack symbolic-equivalences
//     entries; deferred pending curator authoring.
//   - ripwalk and atom-smasher carry curatorConfirmPending=true on
//     their semantic-notation chains, but the allowlist membership IS
//     the curator approval for this specific lightweight surface (the
//     curator explicitly listed both in the slice brief).
const FAMOUS_COMPRESSION_SLUGS: ReadonlyMap<string, 'Compressed from' | 'Compressed reading'> = new Map([
  ['smear',        'Compressed from'   as const],
  ['ripwalk',      'Compressed from'   as const],
  ['atom-smasher', 'Compressed from'   as const],
  ['eggbeater',    'Compressed from'   as const],
  ['mobius',       'Compressed reading' as const],
]);

/**
 * Shape the "Compressed from" / "Compressed reading" view-model field.
 * Returns null when the slug is NOT in the famous-compression allowlist
 * OR when no symbolic-equivalence chain exists for the slug. The label
 * for mobius is "Compressed reading"; all others use "Compressed from".
 */
function shapeCompressedFrom(slug: string): { label: 'Compressed from' | 'Compressed reading'; reading: string } | null {
  const label = FAMOUS_COMPRESSION_SLUGS.get(slug);
  if (label === undefined) return null;
  const chain = getSymbolicEquivalenceChain(slug);
  if (chain === null || chain.readings.length === 0) return null;
  return { label, reading: chain.readings[0]! };
}

// Sui-generis primitives whose curator-locked JOB notation IS the
// canonical name itself (no decomposable set + terminator chain).
// double-knee is the founding member; pendulum mirrors the
// pattern conceptually but carries '[DEL] [DEX]' in DB op-notation so
// doesn't trigger the tautology guard. Slugs in this set are exempt
// from the shapeDictionaryTrickCard tautological-JOB filter so the
// self-token JOB renders honestly (e.g. "JOB: double knee") instead
// of falling through to the muted "JOB: notation pending" line.
const SUI_GENERIS_SELF_TOKEN_SLUGS: ReadonlySet<string> = new Set([
  'double-knee',
]);

/** True when `slug` is in either first-class tier. */
export function isFirstClass(slug: string): boolean {
  return FIRST_CLASS_TIER_1.has(slug) || FIRST_CLASS_TIER_2.has(slug);
}

/** Returns the first-class tier for `slug`, or null when not first-class. */
export function getFirstClassTier(slug: string): 'tier-1' | 'tier-2' | null {
  if (FIRST_CLASS_TIER_1.has(slug)) return 'tier-1';
  if (FIRST_CLASS_TIER_2.has(slug)) return 'tier-2';
  return null;
}

// Workbook governance status snapshot — slugs the workbook flags as
// doctrine-blocked (wave2_blocked, add_disagreement, derived_add_mismatch,
// curator_hold). The full registry lives in
// legacy_data/scripts/build_trick_reconciliation_workbook.py; this TS
// snapshot is consumed by the convergence checker for the H7 disqualifying
// gate. Update when workbook status changes for any of these slugs.
const DOCTRINE_BLOCKED_SLUGS: ReadonlySet<string> = new Set([
  // derived_add_mismatch
  // barraging-osis excluded: ruled a two-dex set
  // (modifier weight 1 → 2); 3+2=5 now converges.
  // witchdoctor excluded: ruling
  // (atomic-mirage(4) + symposium(+1) = 5) now mechanically supported
  // via COMPOSITE_DERIVATIONS map + deriveComputedAddFromComposite.
  'nemesis', 'sumo',
  // wave2_blocked
  'bullwhip', 'double-down', 'terrage', 'datw',
  // add_disagreement (open; not doctrine-locked)
  'omelette', 'fury', 'surging', 'sailing', 'shooting',
  // curator_hold
  // guay released: curator resolved as pickup-pattern dex
  // primitive with inside-stall terminus; promoted to first-class.
  'jani-walker', 'reaper', 'refraction', 'blistering', 'nuclear',
]);

// Rotational base tricks for ADD math. Mirrors ROTATIONAL_BASES used in
// hero-formula building. Modifiers on these bases use add_bonus_rotational
// instead of add_bonus.
const FIRST_CLASS_ROTATIONAL_BASES: ReadonlySet<string> = new Set([
  'whirl', 'mirage', 'torque', 'blender', 'swirl', 'drifter',
]);

// Curator-published flag-component decompositions for atomic singletons.
// Each atom's ADD value derives from the count of ATAM bracket-flags in
// its operational notation (Add-Categories doctrine: every [BOD] / [DEX]
// / [XBD] / [DEL] / [UNS] flag = 1 ADD).
//
// All entries transcribe verbatim from CORE_TRICK_SPEC.equivalences[1]
// (the curator-locked accounting string) and CORE_TRICK_SPEC.
// operationalNotation (the curator-authored movement-language chain).
// To add a new atom: add to CORE_TRICK_SPEC first (the single source
// of truth for atom content), then mirror the strings here. The map
// stays explicit rather than computed from CORE_TRICK_SPEC to keep
// the convergence-rule's H4 gate self-documenting.
//
// Orbit deliberately excluded: classified in CORE_TRICK_SPEC but
// base_trick is empty in the DB; convergence rule (isAtomic check)
// treats it as compound. Future slice should reconcile.
interface AtomicFlagDecomposition {
  decomposition:    string;  // e.g. 'spin(1) + xbod(1) + stall(1) = 3 ADD'
  totalAdd:         number;
  /** Optional curator-authored operational chain in a movement-language
   *  form (lower-case, parenthesized timing, square-bracketed surface
   *  tokens). Distinct from operational_notation column which uses
   *  shouty ATAM form. Surfaced as the strip's Operational row. */
  operationalChain?: string;
}
const ATOMIC_FLAG_DECOMPOSITIONS: ReadonlyMap<string, AtomicFlagDecomposition> = new Map([
  ['toe-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > toe',
  }],
  ['clipper-stall', {
    decomposition:    'xbody(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > clipper',
  }],
  ['mirage', {
    decomposition:    'dex(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > hippy in dex > op toe',
  }],
  ['legover', {
    decomposition:    'dex(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > leggy out dex > ss toe',
  }],
  ['pickup', {
    decomposition:    'dex(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > leggy in dex > ss toe',
  }],
  ['illusion', {
    decomposition:    'dex(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > leggy out dex > op toe',
  }],
  ['whirl', {
    decomposition:    'xbody(1) + dex(1) + stall(1) = 3 ADD',
    totalAdd:         3,
    operationalChain: '[set] > leggy in dex > ss clipper',
  }],
  ['butterfly', {
    decomposition:    'dex(1) + xbody(1) + stall(1) = 3 ADD',
    totalAdd:         3,
    operationalChain: '[set] > hippy out dex > ss clipper',
  }],
  ['swirl', {
    decomposition:    'xbody(1) + dex(1) + stall(1) = 3 ADD',
    totalAdd:         3,
    operationalChain: '[set] > leggy (xbd) out dex > ss clipper',
  }],
  ['osis', {
    decomposition:    'spin(1) + xbod(1) + stall(1) = 3 ADD',
    totalAdd:         3,
    operationalChain: '[set] > (downtime) spin > ss clipper',
  }],
  ['around-the-world', {
    // Pedagogical normalization: foundational tricks teach the
    // core ADD buckets directly. Prior 'full-orbit dex(1)' was
    // unnecessarily specialized for a foundational entry; ATW is now read
    // as plain dex + stall, matching the bucket vocabulary used by other
    // foundational primitives.
    decomposition:    'dex(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: 'toe > ss(midtime) in dex > ss toe',
  }],
  // ── Foundational 1-ADD surface vocabulary (added with the
  //    foundational-band first-class widening). Anatomical surface stalls
  //    + unusual-surface kicks + folk-name surfaces. ADD via the universal
  //    stall=1 rule for stalls; via the unusual-surface bucket for the two
  //    kicks. operationalChain mirrors the DB op-notation; ChainSource
  //    falls back to atomic when DB is somehow stripped.
  ['heel-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > heel',
  }],
  ['inside-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > inside',
  }],
  ['outside-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > outside',
  }],
  ['head-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > head',
  }],
  ['forehead-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > forehead',
  }],
  ['neck-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > neck',
  }],
  ['knee-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > knee',
  }],
  ['shoulder-stall', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > shoulder',
  }],
  ['sole-kick', {
    decomposition:    'UNS(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > sole kick',
  }],
  ['cloud-kick', {
    decomposition:    'UNS(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > cloud kick',
  }],
  ['peak-delay', {
    decomposition:    'stall(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: '[set] > peak',
  }],
  // ── Foundational 1-ADD flying-operator primitives. Operator-first
  //    chain form; flying owns the JOB operator slot. ADD bucket is BOD
  //    (curator: in ADD accounting, flying-operator primitives
  //    count under the body/BOD bucket; the movement-language operator
  //    "flying" still names the JOB chain). double-knee is sui-generis
  //    self-token (no [set] > prefix; exempt from the tautological-JOB
  //    guard via SUI_GENERIS_SELF_TOKEN_SLUGS).
  ['flying-inside', {
    decomposition:    'BOD(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: 'flying > inside',
  }],
  ['flying-outside', {
    decomposition:    'BOD(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: 'flying > outside',
  }],
  ['double-knee', {
    decomposition:    'BOD(1) = 1 ADD',
    totalAdd:         1,
    operationalChain: 'double knee',
  }],
  // ── Foundational 2-ADD primitives (pedagogical ADD-bucket
  //    normalization). Each exposes a core ADD bucket
  //    in a foundational, publication-quality entry. cloud-stall teaches
  //    the unusual-surface bucket pedagogically (parallel to sole-kick /
  //    cloud-kick); dragonfly-kick + flying-clipper extend the flying-
  //    operator pattern to the 2-ADD layer with explicit second buckets
  //    (dex, xbody). flying-clipper's base_trick='clipper' (not self) so
  //    the convergence-rule isAtomic gate doesn't fire; the card path
  //    looks up by slug and renders correctly regardless.
  ['cloud-stall', {
    decomposition:    'UNS(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > cloud',
  }],
  ['dragonfly-kick', {
    decomposition:    'BOD(1) + dex(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: 'flying > dragonfly',
  }],
  ['flying-clipper', {
    decomposition:    'BOD(1) + xbody(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: 'flying > clipper',
  }],
  // ── knee-clipper: curator clarification — folk name, not a
  //    literal clipper-surface stall. Reads as a flying dexterity knee
  //    kick: BOD(1) + xbody(1) = 2 ADD. JOB chain kept as the DB
  //    op_notation '[set] > knee-clipper' for now; the flying-family
  //    operator-first form ('flying > knee-clipper') would be a
  //    follow-up alignment.
  ['knee-clipper', {
    decomposition:    'BOD(1) + xbody(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > knee-clipper',
  }],
  // ── guay: pickup-pattern dex primitive ending in inside-stall.
  //    Curator resolution (released from DOCTRINE_BLOCKED curator_hold).
  ['guay', {
    decomposition:    'dex(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > leggy in dex > ss inside',
  }],
  // ── rake: swing primitive (scoop then toe-stall); the reverse of
  //    pendulum (pendulum is toe-then-swing). Swing element counts an
  //    ADD unbracketed, as with pendulum.
  ['rake', {
    decomposition:    'swing(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > swing toe',
  }],
  // ── ATAM bracket-flag derivations. Each
  //    decomposition translates the operational_notation's ATAM
  //    bracket flags ([BOD] [DEX] [XBD] [DEL] [UNS] [PDX]) into the
  //    foundational bucket vocabulary. operationalChain mirrors the
  //    curator-authored DB op_notation. base_trick varies; the card-
  //    render path uses slug-keyed lookup so the strip renders
  //    correctly regardless of the isAtomic convergence gate.
  ['squeeze', {
    decomposition:    'UNS(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[UNS] [DEL]',
  }],
  ['barrage', {
    decomposition:    'dex(1) + dex(1) + stall(1) = 3 ADD',
    totalAdd:         3,
    operationalChain: 'CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',
  }],
  ['barfly', {
    decomposition:    'dex(1) + dex(1) + xbody(1) + stall(1) = 4 ADD',
    totalAdd:         4,
    operationalChain: 'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
  }],
  ['high-plains-drifter', {
    decomposition:    'dex(1) + dex(1) + xbody(1) + stall(1) = 4 ADD',
    totalAdd:         4,
    operationalChain: 'CLIP > SAME IN [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]',
  }],
  ['paradon', {
    decomposition:    'dex(1) + dex(1) + xbody(1) + stall(1) = 4 ADD',
    totalAdd:         4,
    operationalChain: 'TOE > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
  }],
  ['barraging-osis', {
    decomposition:    'dex(1) + dex(1) + BOD(1) + xbody(1) + stall(1) = 5 ADD',
    totalAdd:         5,
    operationalChain: 'CLIP > OP IN [DEX] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',
  }],
  // ── Sole-stall foundational primitive.
  //    Parallel to cloud-stall (which was promoted with curator-locked
  //    decomposition in the foundational-band slice). sole-stall is the
  //    sole-of-foot stall — counts under the unusual-surface bucket.
  ['sole-stall', {
    decomposition:    'UNS(1) + stall(1) = 2 ADD',
    totalAdd:         2,
    operationalChain: '[set] > sole',
  }],

  // ── DATW + DLO + rev-whirl first-class promotion via the
  //    ATOMIC_FLAG path. Each row sets base_trick = self (via
  //    red_corrections) so the convergence-rule isAtomic gate fires;
  //    decomposition is the bracket-counted structural form;
  //    operationalChain is the canonical footbag.org notation.
  ['double-around-the-world', {
    decomposition:    'dex(1) + dex(1) + stall(1) = 3 ADD',
    totalAdd:         3,
    operationalChain: 'TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]',
  }],
  ['double-leg-over', {
    decomposition:    'dex(1) + dex(1) + stall(1) = 3 ADD',
    totalAdd:         3,
    operationalChain: 'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
  }],
  ['rev-whirl', {
    decomposition:    'xbody(1) + dex(1) + stall(1) = 3 ADD',
    totalAdd:         3,
    operationalChain: 'CLIP > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  }],
]);

// Curator-published composite-derivation map. Some compounds read most
// honestly as a curator-canonical composite-trick PLUS additional
// modifiers, rather than as a flat base + N modifiers. Example:
// witchdoctor (5 ADD) reads as atom-smasher(4) + symposium(+1) per the
// Per ruling ("Atomic Mirage already 4; witchdoctor = atomic
// mirage + symposium = 5"), NOT as flat atomic(+1) + symposium(+1) +
// mirage(2) which would arithmetically reach only 4.
//
// The map is the SOURCE OF TRUTH for which slugs use composite math.
// The convergence rule prefers the composite reading when an entry
// exists for `slug`; otherwise it falls back to flat deriveComputedAdd.
// Add a new entry when the curator publishes a composite reading.
// Remove an entry when the composite is retracted.
interface CompositeDerivation {
  /** Slug of the curator-canonical composite-base trick whose ADD
   *  carries through (e.g. 'atom-smasher' for witchdoctor). */
  compositeBaseSlug: string;
  /** ADD of the composite-base trick (curator-locked; redundant with
   *  freestyle_tricks.adds but stated here so the rule does not need
   *  to dereference DB rows). */
  compositeBaseAdd:  number;
  /** Modifier slugs applied ON TOP of the composite base, in declared
   *  order. Weights resolved against the modifier table at rule-time
   *  (rotational vs non-rotational chosen by the dictRow's base_trick). */
  additionalModifiers: readonly string[];
  /** Total ADD as the curator publishes it. Must equal
   *  `compositeBaseAdd + sum(modifier weights)` at rule-time and the
   *  freestyle_tricks.adds value. Belt-and-suspenders verification
   *  against curator transcription errors. */
  totalAdd:          number;
  /** Human-readable derivation string for diagnostics. */
  derivation:        string;
}
const COMPOSITE_DERIVATIONS: ReadonlyMap<string, CompositeDerivation> = new Map([
  ['witchdoctor', {
    compositeBaseSlug:   'atom-smasher',
    compositeBaseAdd:    4,
    additionalModifiers: ['symposium'],
    totalAdd:            5,
    derivation:          'atom-smasher(4) + symposium(+1) = 5 ADD',
  }],
]);

export type FirstClassStatus =
  | 'first-class'
  | 'convergence-ready'
  | 'governance-blocked'
  | 'coverage-pending';

export interface FirstClassConvergenceResult {
  status:     FirstClassStatus;
  diagnostic: string;
}

/**
 * Mechanical ADD-math derivation for the first-class convergence check.
 * Pure function; deterministic; reads only the provided rows. Returns
 * null when derivation is impossible (missing base, missing modifier-
 * table row, non-numeric ADD).
 *
 * The pilot scope handles atomic + simple +1-stack patterns. Composite-
 * modifier expansion (blurry = stepping + paradox; see workbook's
 * MODIFIER_COMPOSITIONS) is NOT applied at the TS layer — slugs whose
 * official ADD depends on composite-modifier expansion remain
 * non-first-class until their resolved-formula entry is published.
 */
function deriveComputedAdd(
  baseTrick: string | null,
  baseAdd: number | null,
  modifierSlugs: readonly string[],
  modifierTable: Map<string, { add_bonus: number; add_bonus_rotational: number }>,
): number | null {
  if (baseAdd === null) return null;
  const isRotational = baseTrick !== null && FIRST_CLASS_ROTATIONAL_BASES.has(baseTrick);
  let total = baseAdd;
  for (const slug of modifierSlugs) {
    const row = modifierTable.get(slug);
    if (!row) return null;
    total += isRotational ? row.add_bonus_rotational : row.add_bonus;
  }
  return total;
}

/**
 * Composite-base ADD derivation for slugs whose curator-canonical
 * reading is `compositeBase + additionalModifiers` rather than flat
 * `base + modifiers`. Used by assertFirstClassConvergence when a slug
 * appears in COMPOSITE_DERIVATIONS. Pure function; deterministic;
 * returns null when a modifier slug is missing from the table.
 *
 * Rotational selection: uses the dictRow's base_trick (passed in by
 * the caller) to decide add_bonus vs add_bonus_rotational, NOT the
 * composite base. This is intentional: the rotational/non-rotational
 * choice is a property of the underlying movement frame, not the
 * composite trick chosen as a teaching anchor.
 */
function deriveComputedAddFromComposite(
  composite: CompositeDerivation,
  modifierTable: Map<string, { add_bonus: number; add_bonus_rotational: number }>,
  isRotational: boolean,
): number | null {
  let total = composite.compositeBaseAdd;
  for (const slug of composite.additionalModifiers) {
    const row = modifierTable.get(slug);
    if (!row) return null;
    total += isRotational ? row.add_bonus_rotational : row.add_bonus;
  }
  return total;
}

/**
 * Apply the First-Class ADD Convergence Rule (H1-H8) to a candidate
 * slug. Returns the convergence status + a one-line diagnostic. The
 * returned `status` is consumed by the service to gate the
 * comparativeNotation surface and the isFirstClass field.
 *
 * Rule summary: resolved = notation-complete + accounting-converged +
 * doctrine-clean. The three-way arithmetic equality (executable
 * derivation == computed == official ADD) is the strict gate.
 */
export function assertFirstClassConvergence(
  slug: string,
  dictRow: { canonical_name?: string; adds?: string | number | null;
             notation?: string | null; base_trick?: string | null;
             operational_notation?: string | null } | null,
  modifierSlugs: readonly string[],
  modifierTable: Map<string, { add_bonus: number; add_bonus_rotational: number }>,
  baseAdd: number | null,
): FirstClassConvergenceResult {
  // H1: canonical row exists
  if (!dictRow) {
    return { status: 'governance-blocked', diagnostic: 'no canonical row' };
  }
  // H7: doctrine-clean
  if (DOCTRINE_BLOCKED_SLUGS.has(slug)) {
    return { status: 'governance-blocked', diagnostic: 'workbook doctrine blocker' };
  }
  // H2: compact notation populated
  if (!dictRow.notation || !dictRow.notation.trim()) {
    return { status: 'coverage-pending', diagnostic: 'compact notation absent' };
  }
  // H3: official ADD populated
  const officialAddStr = dictRow.adds;
  const officialAdd =
    typeof officialAddStr === 'number' ? officialAddStr :
    typeof officialAddStr === 'string' && officialAddStr.trim() !== '' ? Number(officialAddStr) :
    null;
  if (officialAdd === null || Number.isNaN(officialAdd)) {
    return { status: 'coverage-pending', diagnostic: 'official ADD absent' };
  }
  // H4: executable derivation exists — composite reading (curator-
  // published composite-base + modifiers) OR published compound formula
  // OR atomic flag-component decomposition. Composite takes precedence
  // for slugs in COMPOSITE_DERIVATIONS because the composite reading
  // is the curator-canonical interpretation (e.g. witchdoctor reads as
  // atom-smasher + symposium, not as flat atomic + symposium + mirage).
  const composite = COMPOSITE_DERIVATIONS.get(slug);
  const publishedFormula = RESOLVED_FORMULAS_BY_SLUG.get(slug);
  const isAtomic = dictRow.base_trick === slug && modifierSlugs.length === 0;
  const atomicDecomp = isAtomic ? ATOMIC_FLAG_DECOMPOSITIONS.get(slug) : undefined;
  if (!composite && !publishedFormula && !atomicDecomp) {
    return {
      status: 'convergence-ready',
      diagnostic: isAtomic
        ? 'no atomic flag-decomposition published; awaiting curator entry'
        : 'no published derivation; awaiting Sprint promotion',
    };
  }
  // H5 + H6: three-way convergence (executable derivation == computed == official)
  const isRotational = dictRow.base_trick !== null
    && dictRow.base_trick !== undefined
    && FIRST_CLASS_ROTATIONAL_BASES.has(dictRow.base_trick);
  let computed: number | null;
  if (composite) {
    computed = deriveComputedAddFromComposite(composite, modifierTable, isRotational);
  } else if (isAtomic) {
    computed = officialAdd;
  } else {
    computed = deriveComputedAdd(dictRow.base_trick ?? null, baseAdd, modifierSlugs, modifierTable);
  }
  if (computed === null) {
    return { status: 'coverage-pending', diagnostic: 'computed ADD not derivable' };
  }
  if (computed !== officialAdd) {
    return { status: 'governance-blocked', diagnostic: `computed ${computed} != official ${officialAdd}` };
  }
  if (composite && composite.totalAdd !== officialAdd) {
    return { status: 'governance-blocked', diagnostic: `composite-derivation total ${composite.totalAdd} != official ${officialAdd}` };
  }
  if (publishedFormula && publishedFormula.totalAdd !== officialAdd) {
    return { status: 'governance-blocked', diagnostic: `derivation total ${publishedFormula.totalAdd} != official ${officialAdd}` };
  }
  if (atomicDecomp && atomicDecomp.totalAdd !== officialAdd) {
    return { status: 'governance-blocked', diagnostic: `atomic decomp total ${atomicDecomp.totalAdd} != official ${officialAdd}` };
  }
  return { status: 'first-class', diagnostic: 'convergence-rule passed' };
}

/** Shape the Zone B comparative-notation row for a first-class trick.
 *  Returns null when the slug is not first-class. The JOB cell prefers
 *  curator-authored operational notation; falls back to a derived chain
 *  for atomic singletons. The ADD cell prefers RESOLVED_FORMULAS_SPRINT_1
 *  derivation; falls back to atomic-trivial `<base>(N) = N ADD`. The
 *  VIDEO cell summarises curated reference-media presence.
 *
 *  Provenance language from RESOLVED_FORMULAS_SPRINT_1.provenance is
 *  intentionally NOT included in the row; curator-internal text never
 *  reaches the rendered page (see [[feedback_public_facing_prose]]). */
function shapeComparativeNotation(
  slug: string,
  dictRow: { canonical_name?: string; adds?: string | number | null;
             base_trick?: string | null; notation?: string | null;
             operational_notation?: string | null } | null,
  modifierSlugs: readonly string[],
  tutorialMediaCount: number,
  demoMediaCount: number,
): ComparativeNotationRow | null {
  if (!dictRow) return null;
  const isAtomic = dictRow.base_trick === slug && modifierSlugs.length === 0;

  // TRICK row — slug-tag identity form.
  const trickTag = slugToHashtag(slug);

  // COMPACT NOTATION row — curator-authored compact form (lowercased
  // for in-card readability; DB stores SHOUTY uppercase).
  const compactNotation = (dictRow.notation ?? '').trim().toLowerCase()
    || (dictRow.canonical_name ?? slug).trim().toLowerCase();

  // Operational / Job row — pick the highest-priority curator source:
  // resolveOperationalNotationRaw consults CoreTrickSpec (12 atoms) →
  // RESOLVED_FORMULAS_SPRINT_1 overrides → DB operational_notation
  // column. When all three are empty, fall back to atomic-flag
  // decomposition's curator-authored movement chain; otherwise absent.
  // Tautological-suppression below filters out the uppercase compact-
  // form echo for atom singletons.
  const atomicDecompForOp = isAtomic ? ATOMIC_FLAG_DECOMPOSITIONS.get(slug) : undefined;
  const resolvedOpRaw = resolveOperationalNotationRaw(slug, dictRow.operational_notation);
  let jobLineage: string;
  let jobLineageSource: ComparativeNotationRow['jobLineageSource'];
  if (resolvedOpRaw && resolvedOpRaw.trim()) {
    jobLineage = resolvedOpRaw;
    jobLineageSource = 'curator';
  } else if (atomicDecompForOp?.operationalChain) {
    jobLineage = atomicDecompForOp.operationalChain;
    jobLineageSource = 'atomic';
  } else {
    jobLineage = '';
    jobLineageSource = 'absent';
  }

  // Tautological-suppression: if jobLineage (case-insensitive) equals
  // the compact form or canonical name, hide it. 'JOB: OSIS' is not
  // information; the compact row already carries that.
  const compactCompare = compactNotation.toLowerCase().trim();
  const canonicalCompare = (dictRow.canonical_name ?? slug).toLowerCase().trim();
  const lineageCompare = jobLineage.toLowerCase().trim();
  if (lineageCompare === compactCompare || lineageCompare === canonicalCompare) {
    jobLineage = '';
    jobLineageSource = 'absent';
  }

  // ADD DERIVATION row — prefer published compound derivation; fall
  // back to atomic flag-component decomposition from the curator-
  // published registry. No trivial-identity fallback.
  const published = RESOLVED_FORMULAS_BY_SLUG.get(slug);
  // EXPANDED row — full operational chain for entries whose jobLineage uses a
  // named-set shorthand. The detail page carries both forms; compact cards
  // keep the shorthand. Suppressed when it would echo the JOB row verbatim.
  let expandedNotation = (published?.expandedNotation ?? '').trim();
  if (expandedNotation && expandedNotation === jobLineage.trim()) expandedNotation = '';
  const atomicDecomp = isAtomic ? ATOMIC_FLAG_DECOMPOSITIONS.get(slug) : undefined;
  let addBreakdown: string;
  let addBreakdownSource: ComparativeNotationRow['addBreakdownSource'];
  if (published) {
    addBreakdown = stripDerivationAddTerminator(published.derivation);
    addBreakdownSource = 'curator';
  } else if (atomicDecomp) {
    addBreakdown = stripDerivationAddTerminator(atomicDecomp.decomposition);
    addBreakdownSource = 'atomic';
  } else {
    return null;  // shouldn't happen — convergence check should have rejected
  }

  // OFFICIAL ADD row — curator-locked numeric from DB.
  const addsRaw = dictRow.adds;
  const officialAdd =
    typeof addsRaw === 'number' ? addsRaw :
    typeof addsRaw === 'string' && addsRaw.trim() !== '' ? Number(addsRaw) :
    0;

  // VIDEO row.
  let videoState: ComparativeNotationRow['videoState'];
  let videoLabel: string;
  if (tutorialMediaCount > 0) {
    videoState = 'tutorial';
    videoLabel = tutorialMediaCount > 1 ? `Yes (${tutorialMediaCount} tutorials)` : 'Yes (tutorial)';
  } else if (demoMediaCount > 0) {
    videoState = 'demo';
    videoLabel = demoMediaCount > 1 ? `Yes (${demoMediaCount} demos)` : 'Yes (demo)';
  } else {
    videoState = 'none-yet';
    videoLabel = 'No';
  }

  // ALT row — alternate interpretive formula for the 5 curator-locked
  // rev(0) entries (illusion, pickup, rev-whirl, rev-swirl, orbit). For
  // any other slug, altFormula stays null. rev belongs in ALT, NOT in
  // the ADD row — the direct ADD derivation (xbody/dex/stall buckets)
  // stays uncluttered. rev(0) adds 0 ADD, so the total equals the base.
  const transformEntry = getReversePairTransform(slug);
  const altFormula: string | null = transformEntry
    ? `rev(0) + ${transformEntry.baseName}(${officialAdd})`
    : null;

  return {
    trickTag,
    compactNotation,
    jobLineage,
    jobLineageSource,
    expandedNotation,
    addBreakdown,
    addBreakdownSource,
    officialAdd,
    videoState,
    videoLabel,
    altFormula,
  };
}

/**
 * Extract modifier word(s) from a compound canonical name by removing base trick words.
 * Returns an array of modifier slugs (one per applied modifier word).
 *
 * Example: "blurry whirl", base="whirl" → ["blurry"]
 * Example: "paradox symposium whirl", base="whirl" → ["paradox", "symposium"]
 * Example: "atom smasher", base="mirage" → [] (name differs too much; use description fallback)
 */
function extractModifierSlugs(canonicalName: string, baseTrick: string): string[] {
  const nameTokens = canonicalName.toLowerCase().split(/\s+/);
  const baseTokens = baseTrick.toLowerCase().split(/\s+/);
  // Remove base tokens from name tokens (left-to-right, greedy)
  const remaining = [...nameTokens];
  for (const bt of baseTokens) {
    const idx = remaining.indexOf(bt);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return remaining; // these are the modifier words as slug-candidates
}

// Shaping context bundled per request to keep shapeTrickIndexRow's signature
// stable across the index, family, and ADD views.
interface TrickIndexShapingContext {
  slugsWithRecords: Set<string>;
  aliasesByTrickSlug: Map<string, string[]>;
  // Tier-aware media coverage. Map<slug, 'tutorial' | 'demo'>; absence
  // from the map means 'none'. shapeTrickIndexRow derives the row's
  // hasMedia boolean and mediaCoverage tier from this lookup.
  mediaCoverageBySlug: Map<string, TrickMediaCoverage>;
  // Per-row status overrides for the listAllWithPending path; absent when
  // shaping a plain active row (defaults: isActive=1, reviewStatus='curated').
  statusBySlug?: Map<string, { isActive: number; reviewStatus: string }>;
  // ADD-view two-line row contract: per-trick modifier links
  // (ordered) + a slug→numeric-adds lookup, so shapeDictionaryTrickCard
  // can derive the line-2 "ADD: mod(+b) + base(N)" formula mechanically
  // from validated structured data (not inference). Absent maps degrade
  // gracefully to a bare "ADD: N" line.
  modifierLinksByTrickSlug?: Map<string, { slug: string; name: string; addBonus: number; addBonusRotational: number }[]>;
  addsBySlug?: Map<string, number>;
}

const EXTERNAL_PLACEHOLDER_NOTE =
  'This trick appears in external freestyle sources but has not yet been fully adjudicated for the canonical dictionary.';

// Returns the numeric ADD bucket for a row, or null when the value isn't a
// finite non-negative integer (empty string, null, 'modifier', non-numeric
// text). Used by the ADD-grouping pass on the index page.
function parseAddNumeric(adds: string | null): number | null {
  if (adds === null || adds === undefined) return null;
  const trimmed = adds.trim();
  if (trimmed === '' || trimmed === 'modifier') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function byCanonicalNameAlpha(a: { canonicalName: string }, b: { canonicalName: string }): number {
  return a.canonicalName.localeCompare(b.canonicalName, undefined, { sensitivity: 'base' });
}

// ─────────────────────────────────────────────────────────────────────────
// DictionaryTrickCard builder. Consumes the raw DB row plus the alias-table
// data (already loaded by the dictionary builder) and produces the slim
// card view-model.
//
// Symbolic-equivalence layer (Canonical-Surface-Realignment S1+S3):
//   - Compound tricks: readings come from freestyleSymbolicEquivalences.ts
//     (curator-authored multi-reading chains; stopping-depth-aware).
//   - Atom-level canonical aliases: readings come from the allow-list in
//     freestyleAliasGovernance.ts (restraint-first; only entries explicitly
//     approved for browse surface).
//   - The two sources are merged. Empty result → template suppresses the
//     ≡ row entirely.
//
// `commonAliases` is also filtered through the allow-list so the legacy
// "aliases:" text row stops surfacing problematic entries (frigidosis,
// leg-over, reverse-swirl, etc.).
// ─────────────────────────────────────────────────────────────────────────
// ADD-view line-2 formula derivation. Priority: curator RESOLVED_FORMULAS
// → atomic flag decomposition → mechanical modifier-link derivation
// (sum-verified against canonical adds) → null (caller renders bare "ADD: N").
// Never fabricates: the modifier-link branch only emits when the component
// sum equals the row's canonical ADD, guarding against rotational-bonus
// mismatches and other drift.
const ADD_FORMULA_ROTATIONAL_BASES = new Set(['mirage', 'whirl', 'torque', 'blender', 'swirl', 'drifter']);
function deriveAddViewFormula(
  row: FreestyleTrickRowWithStatus,
  indexRow: FreestyleTrickIndexRow,
  ctx?: TrickIndexShapingContext,
): string | null {
  const published = RESOLVED_FORMULAS_BY_SLUG.get(indexRow.slug);
  if (published) return stripDerivationAddTerminator(published.derivation);
  const atomic = ATOMIC_FLAG_DECOMPOSITIONS.get(indexRow.slug);
  if (atomic) return stripDerivationAddTerminator(atomic.decomposition);
  const links = ctx?.modifierLinksByTrickSlug?.get(indexRow.slug);
  const baseSlug = row.base_trick;
  const totalAdds = Number(indexRow.adds);
  if (links && links.length && baseSlug && baseSlug !== indexRow.slug
      && ctx?.addsBySlug && Number.isFinite(totalAdds)) {
    const baseAdds = ctx.addsBySlug.get(baseSlug);
    if (baseAdds !== undefined) {
      const baseRotational = ADD_FORMULA_ROTATIONAL_BASES.has(baseSlug);
      const parts: string[] = [];
      let sum = baseAdds;
      for (const m of links) {
        const bonus = baseRotational ? m.addBonusRotational : m.addBonus;
        parts.push(`${m.name}(+${bonus})`);
        sum += bonus;
      }
      parts.push(`${baseSlug}(${baseAdds})`);
      if (sum === totalAdds) return parts.join(' + ');
    }
  }
  return null;
}

function shapeDictionaryTrickCard(
  row: FreestyleTrickRowWithStatus,
  indexRow: FreestyleTrickIndexRow,
  groupAnchor: string | null = null,
  ctx?: TrickIndexShapingContext,
): DictionaryTrickCard {
  // When the row is one of
  // the 12 curator-authoritative core atoms, source operational notation
  // from CoreTrickSpec.operationalNotation (TS content module, the same
  // single source the landing Core Tricks grid reads from).
  // This propagates the curator-authored atom notation to dictionary
  // browse cards (ADD / family / movement-system / topology / category
  // views), so atoms like mirage / whirl / butterfly / ATW no longer
  // render blank or with alias-only readings. Alias-governance entries
  // ('≡ ATW', etc.) are suppressed on browse cards for atoms so the
  // operational notation takes the visible slot; aliases remain
  // accessible on the trick-detail page + glossary.
  const coreAtomSpec = CORE_TRICK_SPEC.find(s => s.slug === indexRow.slug);
  const opNotationRaw = resolveOperationalNotationRaw(indexRow.slug, row.operational_notation);
  const opDisplay = shapeOperationalNotationDisplay(opNotationRaw);
  const dbSourceNote = (!coreAtomSpec && row.operational_notation_source && row.operational_notation_source.trim())
    ? row.operational_notation_source.trim()
    : null;
  // Suppress the op-notation chip on
  // browse cards for first-class tricks. Those rows already render a
  // labeled "JOB" line in the first-class secondary row; the duplicate
  // chip between hashtag and ADD chip was reading as a
  // "compound-description slot" leakage (echoing the JOB string). The
  // chip stays available for non-first-class tricks where it's the
  // only on-card notation cue.
  const isFirstClassForCard = isFirstClass(indexRow.slug);
  const operationalNotation: OperationalNotation | null = (opDisplay && !isFirstClassForCard)
    ? {
        raw:        opDisplay.raw,
        tokens:     opDisplay.tokens,
        sourceNote: dbSourceNote,
      }
    : null;

  // Merge equivalence readings from the curator chain registry (compounds)
  // and the alias-governance allow-list (atoms). Order: compound chains
  // first (when present), then atom-level allow-listed aliases.
  //
  // Tautological-reading filter (universal): drop any reading whose case-insensitive
  // trimmed form equals the canonical name, regardless of first-class
  // status. Examples that previously leaked through: "double around the
  // world" ≡ on the DATW card, "reverse whirl" ≡ on rev-whirl. Curator-
  // locked non-tautological folk-name readings (ripwalk → "stepping
  // butterfly", torque → "miraging osis", DLO → "miraging legover")
  // survive this filter unchanged — they ARE genuine human-readable
  // compound interpretations the user wants visible.
  const canonicalLowerForFilter = indexRow.canonicalName.toLowerCase().trim();
  const chain                = getSymbolicEquivalenceChain(indexRow.slug);
  const chainReadingsRaw     = chain ? [...chain.readings] : [];
  const chainReadings        = chainReadingsRaw.filter(
    r => r.toLowerCase().trim() !== canonicalLowerForFilter,
  );
  const browseSafeAliases    = filterAliasesForBrowse(indexRow.slug, indexRow.aliases);
  const symbolicEquivalences = [...chainReadings, ...browseSafeAliases];

  // Tokenize each ≡ reading. `groupAnchor` is the
  // active view's anchor slug (family / component / topology); tokens matching
  // it carry isFamilyAnchor=true for underline emphasis at render time.
  // By ADD + By Category pass null (no anchor; registry density).
  //
  // For core atoms (coreAtomSpec set), suppress the tokenized ≡ readings on
  // browse cards so the curator-authored operational notation takes the
  // visible slot. Aliases like 'ATW' remain accessible on the trick-detail
  // page + glossary; they no longer compete with op-notation on browse.
  //
  // The universal tautological filter
  // above (chainReadings) already drops readings that just echo the
  // canonical name (e.g. "reverse whirl" on rev-whirl, "double around
  // the world" on DATW). Genuine folk-name compound readings (DLO ≡
  // "miraging legover", ripwalk ≡ "stepping butterfly") survive that
  // filter — they ARE the kind of "human-readable compound reading"
  // the curator's audit said to keep visible. The op-notation chip
  // (which DID duplicate the JOB row) is suppressed separately above.
  const tokenizedEquivalences = coreAtomSpec
    ? []
    : shapeSemanticNotations(symbolicEquivalences, groupAnchor);

  // Atom reading fallback. When a
  // row's slug matches a curator-authoritative core atom AND no chain or
  // op-notation surfaces, fall back to the CORE_TRICK_SPEC editorial reading.
  // With operationalNotation sourced
  // from the curator content module for atoms, this fallback rarely fires
  // (only when an atom has no curator op-notation, which the 12-atom set
  // shouldn't). Preserved for safety + non-public utility per CR-5.
  const coreAtomLabel =
    coreAtomSpec
    && coreAtomSpec.equivalences.length > 0
    && tokenizedEquivalences.length === 0
    && !operationalNotation
      ? coreAtomSpec.equivalences[0]
      : '';

  // First-class display fields. Populated only for slugs in
  // FIRST_CLASS_TIER_1 ∪ FIRST_CLASS_TIER_2. The browse-card secondary
  // row shows the operational/Job chain (when meaningful — not equal
  // to the trick name) and the published ADD breakdown. Curator-internal
  // language never surfaces.
  const firstClassFlag = isFirstClass(indexRow.slug);
  let firstClassChainLabel: 'JOB' | 'OPERATIONAL' | null = null;
  let firstClassChainValue: string | null = null;
  let firstClassAddBreakdown: string | null = null;
  if (firstClassFlag) {
    const atomic = ATOMIC_FLAG_DECOMPOSITIONS.get(indexRow.slug);
    const published = RESOLVED_FORMULAS_BY_SLUG.get(indexRow.slug);
    const compactLower = (row.notation ?? indexRow.canonicalName).toLowerCase().trim();
    const canonicalLower = indexRow.canonicalName.toLowerCase().trim();
    // Chain: prefer DB operational_notation → fall back to atomic chain.
    let chainValue: string | null = null;
    let chainSource: 'curator' | 'atomic' | null = null;
    if (opNotationRaw && opNotationRaw.trim()) {
      chainValue = opNotationRaw;
      chainSource = 'curator';
    } else if (atomic?.operationalChain) {
      chainValue = atomic.operationalChain;
      chainSource = 'atomic';
    }
    if (chainValue) {
      const chainLower = chainValue.toLowerCase().trim();
      // Sui-generis self-token primitives (double-knee, …) carry a
      // canonical JOB equal to the trick name itself. The tautology
      // guard would otherwise mute that as "notation pending", which
      // misrepresents curator intent — these slugs are exempted.
      const isSelfTokenJob = SUI_GENERIS_SELF_TOKEN_SLUGS.has(indexRow.slug);
      const tautological = !isSelfTokenJob
        && (chainLower === compactLower || chainLower === canonicalLower);
      if (!tautological) {
        firstClassChainLabel = chainSource === 'atomic' ? 'OPERATIONAL' : 'JOB';
        firstClassChainValue = chainValue;
      }
    }
    if (published) {
      firstClassAddBreakdown = stripDerivationAddTerminator(published.derivation);
    } else if (atomic) {
      firstClassAddBreakdown = stripDerivationAddTerminator(atomic.decomposition);
    }
  }

  // First-class incomplete-state flag: when the trick is first-class but
  // the operational/Job chain has no upstream source (no curator
  // op-notation in DB, no atomic flag-decomposition chain). Used by the
  // partial to render an honest "Job notation pending" line instead of
  // silently hiding the chain row.
  const firstClassChainIncomplete = firstClassFlag && firstClassChainLabel === null;

  return {
    kind:                       resolveTrickKind(indexRow.slug),
    slug:                       indexRow.slug,
    hashtag:                    indexRow.hashtag,
    displayName:                indexRow.canonicalName,
    href:                       indexRow.detailHref,
    adds:                       indexRow.adds,
    addsLabel:                  indexRow.adds ? `${indexRow.adds} ADD` : '? ADD',
    symbolicEquivalences,
    tokenizedEquivalences,
    operationalNotation,
    operationalNotationStatus:  operationalNotation ? 'available' : 'pending',
    commonAliases:              browseSafeAliases,
    isExternalOnly:             indexRow.isExternalOnly,
    statusBadge:                indexRow.statusBadge,
    placeholderNote:            indexRow.placeholderNote,
    hasRecords:                 indexRow.hasRecords,
    hasReferenceMedia:          indexRow.mediaCoverage !== 'none',
    mediaCoverage:              indexRow.mediaCoverage,
    mediaCoverageLabel:         indexRow.mediaCoverageLabel,
    trickFamily:                indexRow.trickFamily,
    pendingDecomposition:       isUnresolvedCompound(indexRow.slug),
    coreAtomLabel,
    isFirstClass:               firstClassFlag,
    firstClassChainLabel,
    firstClassChainValue,
    firstClassAddBreakdown,
    firstClassChainIncomplete,
    addViewFormula:             deriveAddViewFormula(row, indexRow, ctx),
  };
}

function shapeTrickIndexRow(
  row: FreestyleTrickRow,
  ctx: TrickIndexShapingContext,
): FreestyleTrickIndexRow {
  // Aliases: prefer the freestyle_trick_aliases table (canonical) when ctx
  // carries them; fall back to deprecated aliases_json on rows the table
  // doesn't yet cover. Service-side de-dup if both somehow hold the same text.
  const aliasesFromTable = ctx.aliasesByTrickSlug.get(row.slug) ?? [];
  let aliases: string[] = [...aliasesFromTable];
  if (aliases.length === 0 && row.aliases_json) {
    try {
      aliases = JSON.parse(row.aliases_json) as string[];
    } catch { /* ignore malformed JSON */ }
  }

  const status = ctx.statusBySlug?.get(row.slug);
  const isActive = status?.isActive ?? 1;
  const reviewStatus = status?.reviewStatus ?? 'curated';
  const isExternalOnly = isActive === 0 && reviewStatus === 'pending';

  const detailHref = `/freestyle/tricks/${row.slug}`;
  const hasRecords = ctx.slugsWithRecords.has(row.slug);
  const mediaCoverage: TrickMediaCoverage = ctx.mediaCoverageBySlug.get(row.slug) ?? 'none';
  const hasMedia = mediaCoverage !== 'none';

  let statusBadge: string | null = null;
  let placeholderNote: string | null = null;
  if (isExternalOnly) {
    statusBadge = 'External source, not yet adjudicated';
    placeholderNote = EXTERNAL_PLACEHOLDER_NOTE;
  }

  return {
    slug:            row.slug,
    canonicalName:   row.canonical_name,
    hashtag:         slugToHashtag(row.slug),
    trickFamily:     row.trick_family,
    adds:            row.adds,
    category:        row.category,
    description:     row.description,
    notation:        row.notation,
    aliases,
    detailHref,
    hasRecords,
    recordHref:      hasRecords ? detailHref : null,  // backwards compat
    hasMedia,
    mediaCoverage,
    // Vocabulary normalized to `Tutorial available` /
    // `Demo available`. The 'none' branch returns '' because the card
    // partial gates the chip block on `hasReferenceMedia` — the prior
    // 'No video yet' string was unreachable noise.
    mediaCoverageLabel:
      mediaCoverage === 'tutorial' ? 'Tutorial available'
      : mediaCoverage === 'demo'   ? 'Demo available'
      : mediaCoverage === 'record' ? 'Record video'
      :                              '',
    isExternalOnly,
    statusBadge,
    placeholderNote,
  };
}

function shapeDictEntry(
  row: FreestyleTrickRow,
  allTricks: FreestyleTrickRow[],
  allModifiers: FreestyleTrickModifierRow[],
): FreestyleTrickDictEntry {
  let aliases: string[] = [];
  try {
    aliases = row.aliases_json ? (JSON.parse(row.aliases_json) as string[]) : [];
  } catch { /* ignore malformed JSON */ }

  const isModifier = row.category === 'modifier';
  const hasBase    = !!(row.base_trick && row.base_trick !== row.canonical_name);
  const isBase     = !hasBase && !isModifier;
  const isCompound = !!(hasBase && (row.category === 'compound' || row.category === 'dex'));

  const baseTrick     = hasBase ? row.base_trick! : null;
  const baseTrickSlug = baseTrick ? trickNameToSlug(baseTrick) : null;

  // Look up base trick row for its ADD value
  const baseRow     = baseTrickSlug ? allTricks.find(t => t.slug === baseTrickSlug) : null;
  const baseTrickAdds = baseRow?.adds ?? null;
  const baseAddsNum   = baseRow?.adds ? parseInt(baseRow.adds, 10) : null;

  // Extract modifiers and build ADD composition
  const modifierMap = new Map(allModifiers.map(m => [m.slug, m]));
  let appliedModifiers: AppliedModifier[] = [];
  let addComposition: string | null = null;

  if (hasBase && baseTrick && !isModifier) {
    const modifierSlugs = extractModifierSlugs(row.canonical_name, baseTrick);
    const isRotational  = ROTATIONAL_BASES.has(baseTrickSlug ?? '');

    appliedModifiers = modifierSlugs
      .map(slug => {
        const mod = modifierMap.get(slug);
        if (!mod) return null;
        const effectiveBonus = isRotational ? mod.add_bonus_rotational : mod.add_bonus;
        const cssRole = modifierCssRole(mod.slug, mod.modifier_type);
        return {
          name:                mod.modifier_name,
          addBonus:            mod.add_bonus,
          addBonusRotational:  mod.add_bonus_rotational,
          isRotationalBase:    isRotational,
          effectiveBonus,
          modifierType:        mod.modifier_type,
          cssRole,
        };
      })
      .filter((m): m is AppliedModifier => m !== null);

    if (appliedModifiers.length > 0 && baseAddsNum !== null) {
      const totalBonus = appliedModifiers.reduce((s, m) => s + m.effectiveBonus, 0);
      const tricksAdds = row.adds ? parseInt(row.adds, 10) : null;
      const partsStr   = appliedModifiers
        .map(m => `${m.name} (+${m.effectiveBonus}${m.isRotationalBase ? ' on rotational base' : ''})`)
        .join(' + ');
      addComposition = `${baseTrick} (${baseAddsNum}) + ${partsStr} = ${tricksAdds ?? baseAddsNum + totalBonus}`;
    }
  }

  const addsNumeric = row.adds ? parseInt(row.adds, 10) : null;

  // Part 1 — description refinement.
  // Three branches, in priority order:
  //   1. Curator-authored compound semantic description (override) —
  //      replaces a literal-notation echo with a compositional reading.
  //   2. Redundant DB description (literal JOB-notation echo) — suppress.
  //      Primitive trick pages stop rendering the "About" prose block
  //      when the description merely repeats the notation below.
  //   3. Genuine curator prose — pass through unchanged.
  const refinedDescription = (() => {
    const override = getCompoundSemanticDescription(row.slug);
    if (override !== null) return override;
    if (isDescriptionRedundantWithNotation(row.description, row.notation)) return null;
    return row.description;
  })();

  return {
    canonicalName:    row.canonical_name,
    adds:             row.adds,
    addsNumeric:      isNaN(addsNumeric ?? NaN) ? null : addsNumeric,
    category:         row.category,
    description:      refinedDescription,
    aliases,
    baseTrick,
    baseTrickSlug,
    baseTrickAdds,
    trickFamily:      row.trick_family ?? null,
    isBase,
    isModifier,
    isCompound,
    addComposition,
    appliedModifiers,
    familyNote:       (row.trick_family && FAMILY_NOTES[row.trick_family]) ? FAMILY_NOTES[row.trick_family] : null,
  };
}

function shapeModifierEntry(row: FreestyleTrickModifierRow): FreestyleModifierEntry {
  return {
    slug:                row.slug,
    name:                row.modifier_name,
    addBonus:            row.add_bonus,
    addBonusRotational:  row.add_bonus_rotational,
    modifierType:        row.modifier_type,
    notes:               row.notes,
  };
}

// ---------------------------------------------------------------------------
// Editorial prose surface
// ---------------------------------------------------------------------------
// Curator-authored prose backing the universal-shell template's single-page ordering.
// Prose lives in freestyle_tricks columns (short_description / execution_summary
// / learning_notes / prerequisite_notes). Service shapes the row into
// Ux2PilotData when ANY of the prose columns is populated. A row with all four
// columns null falls through to the legacy ordering branch in the shell. No
// service-layer allowlist; section presence is data-driven.

// Featured-media empty-state copy is derived from whether the trick has a
// record holder. Rows with records steer the reader to the Passback Records
// section below; rows without records steer to family-adjacent demonstrations.
const FEATURED_MEDIA_EMPTY_GENERIC =
  "Curated tutorial coming soon. Until then, see family-adjacent demonstrations below.";
const FEATURED_MEDIA_EMPTY_WITH_RECORD =
  "Curated tutorial coming soon. See the record-holder demonstration in Passback Records below.";

function shapeUx2PilotFromRow(
  row: FreestyleTrickRowWithParse | undefined,
  recordCount: number,
): Ux2PilotData | null {
  if (!row) return null;
  const hasProse =
    !!row.short_description ||
    !!row.execution_summary ||
    !!row.learning_notes ||
    !!row.prerequisite_notes;
  if (!hasProse) return null;
  return {
    shortDescription:        row.short_description ?? null,
    executionParagraphs:     splitProseParagraphs(row.execution_summary),
    learningParagraphs:      splitProseParagraphs(row.learning_notes),
    prerequisiteParagraphs:  splitProseParagraphs(row.prerequisite_notes),
    featuredMedia:           null,
    featuredMediaEmptyState:
      recordCount > 0
        ? FEATURED_MEDIA_EMPTY_WITH_RECORD
        : FEATURED_MEDIA_EMPTY_GENERIC,
  };
}

// cssRole lookup for the hero quick-stat formula.
// Maps a modifier's slug + type to one of three semantic-notation cssRole
// classes: 'set', 'rotation', 'modifier'. Rotation cssRole reserved for the
// three rotational-flavour body modifiers (spinning/whirling/swirling); other
// body modifiers and unrecognised types fall through to 'modifier'.
const ROTATION_BODY_MODIFIERS = new Set(['spinning', 'whirling', 'swirling']);

function modifierCssRole(slug: string, modifierType: string): string {
  if (modifierType === 'set') return 'set';
  if (ROTATION_BODY_MODIFIERS.has(slug)) return 'rotation';
  return 'modifier';
}

// Hero quick-stat formula builder. Atom rows render the
// short form "trick-name = N ADD". Compound rows render the additive form
// "modifier(+w) + ... + base(N) = TOTAL ADD" with role-coloured operands.
// Source of modifier data is freestyle_trick_modifier_links (authoritative for
// single-token canonical names like "matador" / "phoenix").
// Returns null when the trick is a modifier-only row or has no numeric adds.
function buildHeroFormula(
  canonicalName: string,
  isModifier: boolean,
  modifierLinks: FreestyleTrickModifierLinkDetailRow[],
  baseTrick: string | null,
  baseAdds: string | null,
  isRotationalBase: boolean,
  tricksAdds: string | null,
): HeroFormulaToken[] | null {
  if (isModifier) return null;
  const numericAdds = tricksAdds && /^\d+$/.test(tricksAdds) ? tricksAdds : null;
  if (numericAdds === null) return null;
  // Suppress the tautological
  // `<canonical_name> = N ADD` hero-formula for atomic and folk-name
  // rows where no modifier links exist. The hero ADD chip already
  // carries the numeric value; restating `cloud kick = 1 ADD` next to
  // the title was a redundant pseudo-formula in the "compound-description
  // slot" the curator's audit flagged. JOB notation in the lower
  // operational/notation-summary section carries the structural
  // information; the hero stays identity-only.
  if (modifierLinks.length === 0) {
    return null;
  }
  if (!baseTrick) {
    return null;
  }
  // Compound form: modifiers + base = total
  const tokens: HeroFormulaToken[] = [];
  modifierLinks.forEach((link, i) => {
    if (i > 0) {
      tokens.push({ kind: 'operator', isOperator: true, isResult: false, text: '+', weight: null, cssRole: null });
    }
    const effectiveBonus = isRotationalBase
      ? link.add_bonus_rotational
      : link.add_bonus;
    tokens.push({
      kind:    'modifier',
      isOperator: false,
      isResult:   false,
      text:    link.modifier_name,
      weight:  `(+${effectiveBonus})`,
      cssRole: modifierCssRole(link.modifier_slug, link.modifier_type),
    });
  });
  tokens.push({ kind: 'operator', isOperator: true, isResult: false, text: '+', weight: null, cssRole: null });
  tokens.push({
    kind:    'base',
    isOperator: false,
    isResult:   false,
    text:    baseTrick,
    weight:  baseAdds ? `(${baseAdds})` : null,
    cssRole: 'core-family',
  });
  // Drop the `=` operator + `result` (`N ADD`) tokens.
  // The hero ADD chip (`{adds} ADD`) already carries the total; the formula
  // row shows the operator-by-operator math without restating the result.
  return tokens;
}

// Modifier-layering builder. Activates only when
// modifier_links.length >= 3 (flagship-density threshold). Builds an
// innermost-out nested structure: the base trick is the innermost layer; each
// modifier wraps the next one outward; modifier_links[0] becomes the outermost
// wrapper (preserves canonical IFPA reading order: leftmost modifier = applied
// last / outermost in the visual stack). Returns null otherwise (atoms,
// 1-modifier or 2-modifier compounds, modifier-only rows, no base trick, no
// numeric adds).
function buildModifierLayering(
  modifierLinks: FreestyleTrickModifierLinkDetailRow[],
  baseTrick: string | null,
  baseAdds: string | null,
  isRotationalBase: boolean,
  tricksAdds: string | null,
  isModifier: boolean,
): ModifierLayering | null {
  if (isModifier) return null;
  if (modifierLinks.length < 3) return null;
  if (!baseTrick || !baseTrick.trim()) return null;
  const numericAdds = tricksAdds && /^\d+$/.test(tricksAdds) ? tricksAdds : null;
  if (numericAdds === null) return null;

  // Innermost = base trick.
  let layer: ModifierLayer = {
    kind:    'base',
    name:    baseTrick.toLowerCase(),
    weight:  baseAdds ? `(${baseAdds})` : '',
    cssRole: 'core-family',
    kindLabel: 'core',
    inner:   null,
  };

  // Wrap outward: iterate modifier_links in reverse so the first entry ends up
  // as the outermost wrapper.
  for (let i = modifierLinks.length - 1; i >= 0; i--) {
    const link = modifierLinks[i];
    const effectiveBonus = isRotationalBase
      ? link.add_bonus_rotational
      : link.add_bonus;
    const cssRole = modifierCssRole(link.modifier_slug, link.modifier_type);
    layer = {
      kind:    'modifier',
      name:    link.modifier_name.toLowerCase(),
      weight:  `(+${effectiveBonus})`,
      cssRole,
      kindLabel: cssRole,
      inner:   layer,
    };
  }

  return {
    rootLayer:  layer,
    totalLabel: `${numericAdds} ADD`,
  };
}

// Per-trick modifier-link map. Built once per request from
// the existing listTricksByModifier query (which returns one row per
// (modifier, trick) pair joined to modifier metadata). Used by buildParallel
// Tricks + buildSubstitutions to look up any trick's modifier set without
// hitting the DB per candidate.
interface ModifierLinkInfo {
  slug: string;          // modifier slug
  name: string;          // modifier_name (lowercase by service convention)
  type: string;          // 'body' | 'set'
  cssRole: string;       // 'set' | 'rotation' | 'modifier'
}

// ─────────────────────────────────────────────────────────────────────────
// Topology grouping primitives (module-scoped so both the dictionary index
// builder and the trick-detail builder consume the same definitions).
//
// Six pedagogically-grounded educational groups.
// Membership is computed deterministically from base_trick + modifier_links;
// no schema, no CSV.
// ─────────────────────────────────────────────────────────────────────────

const HIPPY_BASES = new Set(['mirage', 'butterfly']);
const LEGGY_BASES = new Set(['legover', 'pickup', 'whirl', 'swirl', 'illusion']);
const CLIPPER_LANDING_BASES = new Set(['butterfly', 'whirl', 'swirl', 'osis', 'blender']);

interface TopologyGroupDef {
  slug:        string;
  name:        string;
  definition:  string;
  // Membership predicate. Takes the trick row and a `hasModifierLink`
  // function (closure over the caller's link data). Returns true when this
  // group includes the trick.
  matches(
    row: { slug: string; base_trick: string | null },
    hasModifierLink: (modifierSlug: string) => boolean,
  ): boolean;
}

const TOPOLOGY_GROUPS: TopologyGroupDef[] = [
  {
    slug:       'hippy-downtime-dex',
    name:       'Hippy downtime dex',
    definition: 'Tricks whose downtime dex comes from the hip: the thigh swings broadly around the bag while the chest opens. Anchored on Mirage and Butterfly.',
    matches:    row => !!(row.base_trick && HIPPY_BASES.has(row.base_trick)),
  },
  {
    slug:       'leggy-dex',
    name:       'Leggy dex',
    definition: 'Tricks whose dex comes from the knee: the calf circles the bag while the thigh stays composed. Anchored on Legover, Pickup, Whirl, Swirl, Illusion.',
    matches:    row => !!(row.base_trick && LEGGY_BASES.has(row.base_trick)),
  },
  {
    slug:       'whirl-swirl-structures',
    name:       'Whirl / swirl structures',
    definition: 'Tricks built on the rotational dex pair: Whirl (leggy in to clipper) and Swirl (leggy out with crossbody entry to clipper).',
    matches:    row => row.base_trick === 'whirl' || row.base_trick === 'swirl',
  },
  {
    slug:       'pixie-uptime-dex',
    name:       'Pixie uptime dex',
    definition: 'Tricks with a pixie set treatment in the uptime: compressed pre-base set that compresses the rising-bag window.',
    matches:    (_row, hasLink) => hasLink('pixie'),
  },
  {
    slug:       'symposium-clipper-structures',
    name:       'Symposium clipper structures',
    definition: 'Clipper-landing tricks performed with a symposium discipline: the support leg leaves the ground during the dex.',
    matches:    (row, hasLink) => hasLink('symposium')
      && !!(row.base_trick && CLIPPER_LANDING_BASES.has(row.base_trick)),
  },
  {
    slug:       'ducking-clipper-structures',
    name:       'Ducking clipper structures',
    definition: 'Clipper-landing tricks with a ducking head-dip in the midtime: the bag passes around the neck while the rest of the trick continues.',
    matches:    (row, hasLink) => hasLink('ducking')
      && !!(row.base_trick && CLIPPER_LANDING_BASES.has(row.base_trick)),
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Per-trick reverse semantic-membership lookup. Used by the trick-detail
// page to close the discovery loop between browse views and trick pages.
//
// Reuses the same TOPOLOGY_GROUPS predicates the dictionary index uses;
// component memberships read off the trick's existing modifier links.
// No new query; the modifier links are already loaded by the caller.
// ─────────────────────────────────────────────────────────────────────────

export interface TrickTopologyMembership {
  topologySlug:       string;
  topologyName:       string;
  topologyDefinition: string;
  href:               string;
}

export interface TrickComponentMembership {
  componentSlug: string;
  componentName: string;
  axisKey:       'body' | 'set';
  href:          string;
}

export interface TrickSemanticMemberships {
  topology:  TrickTopologyMembership[];
  component: TrickComponentMembership[];
}

function computeTrickSymbolicMemberships(
  row: { slug: string; base_trick: string | null },
  modifierLinks: ModifierLinkInfo[],
): TrickSemanticMemberships {
  const linkSlugs = new Set(modifierLinks.map(l => l.slug));
  const hasModifierLink = (modifierSlug: string): boolean => linkSlugs.has(modifierSlug);

  const topology: TrickTopologyMembership[] = TOPOLOGY_GROUPS
    .filter(def => def.matches(row, hasModifierLink))
    .map(def => ({
      topologySlug:       def.slug,
      topologyName:       def.name,
      topologyDefinition: def.definition,
      href:               `/freestyle/tricks?view=topology#topology-${def.slug}`,
    }));

  // Component memberships from modifier links. Filter to body + set axes;
  // sort deterministically (axis then component name) so the rendered list
  // is stable across requests.
  const component: TrickComponentMembership[] = modifierLinks
    .filter(l => l.type === 'body' || l.type === 'set')
    .map(l => ({
      componentSlug: l.slug,
      componentName: l.name,
      axisKey:       l.type as 'body' | 'set',
      href:          `/freestyle/tricks?view=component#component-${l.slug}`,
    }))
    .sort((a, b) => {
      // Body axis first, then set axis; within axis, alphabetical by name.
      if (a.axisKey !== b.axisKey) return a.axisKey === 'body' ? -1 : 1;
      return a.componentName.localeCompare(b.componentName, undefined, { sensitivity: 'base' });
    });

  return { topology, component };
}

function buildModifierLinkMap(
  rows: FreestyleTrickModifierLinkRow[],
): Map<string, ModifierLinkInfo[]> {
  const map = new Map<string, ModifierLinkInfo[]>();
  for (const r of rows) {
    if (!map.has(r.trick_slug)) map.set(r.trick_slug, []);
    map.get(r.trick_slug)!.push({
      slug:    r.modifier_slug,
      name:    r.modifier_name.toLowerCase(),
      type:    r.modifier_type,
      cssRole: modifierCssRole(r.modifier_slug, r.modifier_type),
    });
  }
  return map;
}

// Parallel tricks builder. Definition: same trick_family
// + same adds value + different slug. Restricted to numeric adds (parallels
// only make sense at a defined difficulty tier). Cap at 4 results. Returns
// rows sorted by canonical_name for stable rendering.
function buildParallelTricks(
  trick: FreestyleTrickRow,
  allDictRows: FreestyleTrickRow[],
  modifierLinkMap: Map<string, ModifierLinkInfo[]>,
): ParallelTrick[] {
  if (!trick.adds || !/^\d+$/.test(trick.adds)) return [];
  if (!trick.trick_family) return [];
  return allDictRows
    .filter(r =>
      r.slug !== trick.slug &&
      r.trick_family === trick.trick_family &&
      r.adds === trick.adds,
    )
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
    .slice(0, 4)
    .map(r => {
      const mods = modifierLinkMap.get(r.slug) ?? [];
      const decompParts = mods.map(m => m.name);
      decompParts.push((r.base_trick ?? r.canonical_name).toLowerCase());
      return {
        slug:           r.slug,
        canonicalName:  r.canonical_name,
        detailHref:     `/freestyle/tricks/${r.slug}`,
        adds:           r.adds ?? '',
        decompSummary:  decompParts.join(' + '),
        modifierCount:  mods.length,
      };
    });
}

// Modifier substitutions builder. Definition: same
// base_trick + same modifier_count + share N-1 modifiers + different slug.
// The "share N-1" rule isolates exactly one modifier swap; substitutes with
// 2+ different modifiers fall outside the substitution lens. Cap at 4 results;
// sort by substitute's modifier_name for stable rendering.
function buildSubstitutions(
  trick: FreestyleTrickRow,
  currentTrickMods: ModifierLinkInfo[],
  allDictRows: FreestyleTrickRow[],
  modifierLinkMap: Map<string, ModifierLinkInfo[]>,
): ModifierSubstitution[] {
  if (!trick.base_trick) return [];
  if (currentTrickMods.length === 0) return [];
  const ourSlugSet = new Set(currentTrickMods.map(m => m.slug));
  const out: ModifierSubstitution[] = [];
  for (const r of allDictRows) {
    if (r.slug === trick.slug) continue;
    if (r.base_trick !== trick.base_trick) continue;
    const theirMods = modifierLinkMap.get(r.slug) ?? [];
    if (theirMods.length !== currentTrickMods.length) continue;
    const theirSlugSet = new Set(theirMods.map(m => m.slug));
    let shared = 0;
    for (const s of ourSlugSet) if (theirSlugSet.has(s)) shared++;
    if (shared !== currentTrickMods.length - 1) continue;
    const fromMod = currentTrickMods.find(m => !theirSlugSet.has(m.slug));
    const toMod = theirMods.find(m => !ourSlugSet.has(m.slug));
    if (!fromMod || !toMod) continue;
    out.push({
      slug:            r.slug,
      canonicalName:   r.canonical_name,
      detailHref:      `/freestyle/tricks/${r.slug}`,
      adds:            r.adds ?? '',
      swapFromName:    fromMod.name,
      swapFromCssRole: fromMod.cssRole,
      swapToName:      toMod.name,
      swapToCssRole:   toMod.cssRole,
    });
  }
  out.sort((a, b) => a.swapToName.localeCompare(b.swapToName));
  return out.slice(0, 4);
}

// Hero decomposition builder. Returns a role-coloured
// token sequence (modifier(s) + base) for any compound trick with at least
// one modifier link. Returns null for atoms (zero modifier links) and
// modifier-only rows. Tokens render in lowercase to match the canonical_name
// convention. The builder is defensive: any missing data (no base trick name,
// modifier-only row) yields null, falling back to the plain h1.
function buildHeroDecomposition(
  modifierLinks: FreestyleTrickModifierLinkDetailRow[],
  baseTrick: string | null,
  isModifier: boolean,
): HeroDecompositionToken[] | null {
  if (isModifier) return null;
  if (modifierLinks.length < 1) return null;
  if (!baseTrick || !baseTrick.trim()) return null;
  const tokens: HeroDecompositionToken[] = modifierLinks.map(link => ({
    text:    link.modifier_name.toLowerCase(),
    cssRole: modifierCssRole(link.modifier_slug, link.modifier_type),
    kind:    'modifier' as const,
  }));
  tokens.push({
    text:    baseTrick.toLowerCase(),
    cssRole: 'core-family',
    kind:    'base' as const,
  });
  return tokens;
}

// Family-tier grouping. Reorganises the flat family-member
// list into ADD-tier groups; preserves source order within each tier. Numeric
// tiers ascending; the non-numeric tier (rows with `adds` null or "modifier")
// renders last under a "Modifiers" label. Returns an empty array when the
// caller has not populated familyMembers (i.e., when the family has only one
// row -- itself; the shell omits the section anyway via hasFamilyMembers).
function buildFamilyTiers(members: FreestyleFamilyMember[]): FreestyleFamilyTier[] {
  if (members.length === 0) return [];
  const byTier = new Map<string, FreestyleFamilyMember[]>();
  for (const m of members) {
    const key = m.adds && /^\d+$/.test(m.adds) ? m.adds : 'modifier';
    if (!byTier.has(key)) byTier.set(key, []);
    byTier.get(key)!.push(m);
  }
  const numericTiers: FreestyleFamilyTier[] = Array.from(byTier.entries())
    .filter(([k]) => k !== 'modifier')
    .map(([k, list]) => ({
      addsLabel:   `${k} ADD`,
      addsNumeric: parseInt(k, 10),
      members:     list,
      hasCurrent:  list.some(m => m.isCurrentTrick),
    }))
    .sort((a, b) => (a.addsNumeric ?? 0) - (b.addsNumeric ?? 0));
  const modList = byTier.get('modifier');
  if (modList && modList.length > 0) {
    numericTiers.push({
      addsLabel:   'Modifiers',
      addsNumeric: null,
      members:     modList,
      hasCurrent:  modList.some(m => m.isCurrentTrick),
    });
  }
  return numericTiers;
}

// Density classification. Derived from existing data only;
// no schema dependency. Inputs: modifier-link count, semantic notation presence,
// operational notation presence, record count, media availability, ux2Pilot
// presence. Read-only signal that gates
// flagship-only surfaces (token-coloured h1, modifier-layering panel,
// modifier-ecosystem block) without per-slug allowlists.
function classifyDensityTier(args: {
  modifierLinkCount: number;
  hasSemanticNotation: boolean;
  hasOperationalNotation: boolean;
  recordCount: number;
  hasReferenceMedia: boolean;
  hasUx2Prose: boolean;
}): 'sparse' | 'standard' | 'flagship' {
  // Flagship: a row has been authored to flagship-tier richness, OR it carries
  // 3+ modifier-links AND has operational notation AND has records (the
  // densest naturally-occurring signal in the live dictionary).
  if (args.hasUx2Prose) return 'flagship';
  if (
    args.modifierLinkCount >= 3 &&
    args.hasOperationalNotation &&
    args.recordCount > 0
  ) {
    return 'flagship';
  }
  // Sparse: atom rows (no modifier-links) with no operational notation, no
  // record holders, and no tagged reference media. Toe Stall, base butterfly,
  // base mirage, etc. The page reads short and focused.
  if (
    args.modifierLinkCount === 0 &&
    !args.hasOperationalNotation &&
    args.recordCount === 0 &&
    !args.hasReferenceMedia
  ) {
    return 'sparse';
  }
  // Standard: everything in between. Most compound tricks land here.
  return 'standard';
}

/**
 * Shape a topology-histogram snapshot for rendering: quantize each row's count
 * to a 5%-step width bucket (5..100) of the largest row, so the bar can take a
 * `--w{bucket}` class instead of an inline width style (CSP-safe).
 */
function topologyHistogramRows(
  rows: readonly TopologyHistogramRow[],
): { label: string; count: number; tier: string; widthBucket: number }[] {
  const max = Math.max(...rows.map(r => r.count));
  return rows.map(r => ({
    label:       r.label,
    count:       r.count,
    tier:        r.tier,
    widthBucket: Math.min(100, Math.max(5, Math.round((r.count / max) * 20) * 5)),
  }));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const freestyleService = {
  getRecordsPage(): PageViewModel<FreestyleRecordsContent> {
    const rows = runSqliteRead('freestyleRecords.listPublic', () =>
      freestyleRecords.listPublic.all() as FreestyleRecordRow[],
    );

    const groups = groupByType(rows);
    const holderSet = new Set(rows.map(r => r.person_id ?? r.holder_name));

    return {
      seo: {
        title: 'Trick Records',
        description:
          'Documented freestyle footbag trick achievements: the most consecutive completions of a trick, on record.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_records',
        title:      'Trick Records',
        intro:      'Some freestyle tricks have been landed hundreds of times in a row.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Trick Records' },
        ],
      },
      content: {
        groups,
        totalRecords: rows.length,
        totalHolders: holderSet.size,
      },
    };
  },

  getLeadersPage(): PageViewModel<FreestyleLeadersContent> {
    const rows = runSqliteRead('freestyleRecords.listLeaders', () =>
      freestyleRecords.listLeaders.all() as FreestyleLeaderRow[],
    );

    const leaders = shapeLeaders(rows);
    const totalRecords = rows.reduce((sum, r) => sum + r.record_count, 0);

    return {
      seo: {
        title: 'Record Leaders',
        description: 'The players who hold the most documented freestyle trick records.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_leaders',
        title:      'Record Leaders',
        intro:      'Players with the most documented trick records.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Record Leaders' },
        ],
      },
      content: {
        leaders,
        totalHolders: leaders.length,
        totalRecords,
      },
    };
  },

  getTrickDetailPage(rawSlug: string): PageViewModel<FreestyleTrickContent> {
    // A record or media link may address a trick by an alias slug; resolve it
    // to the canonical trick so the alias URL renders the canonical page.
    const aliasCanonical = runSqliteRead('freestyleTrickAliases.getCanonicalForAlias', () =>
      freestyleTrickAliases.getCanonicalForAlias.get(rawSlug) as { trick_slug: string } | undefined,
    );
    const slug = aliasCanonical?.trick_slug ?? rawSlug;

    // Resolve slug → trick_name via public (non-superseded) records
    const publicRows = runSqliteRead('freestyleRecords.listPublic', () =>
      freestyleRecords.listPublic.all() as FreestyleRecordRow[],
    );

    // Also check dictionary for slug resolution (trick may have no records).
    // getBySlug returns the parser columns (jobs_notation_raw, structural
    // _parse_json, computed_*) alongside the base trick fields; only this
    // statement loads them, so grids stay lean.
    const dictRow = runSqliteRead('freestyleTricks.getBySlug', () =>
      freestyleTricks.getBySlug.get(slug) as FreestyleTrickRowWithParse | undefined,
    );

    // Match records to this trick by its canonical slug or any of its alias
    // slugs, so a record whose trick_name is spelled as an alias (e.g.
    // "2-Bag Juggle" for 2-bag-juggling) still lists on the canonical page.
    const aliasSlugs = runSqliteRead('freestyleTrickAliases.getAliasSlugsForTrick', () =>
      (freestyleTrickAliases.getAliasSlugsForTrick.all(slug) as { alias_slug: string }[]).map(a => a.alias_slug),
    );
    const matchSlugs = new Set<string>([slug, ...aliasSlugs]);
    const recordTrickName = publicRows.find(r => r.trick_name && matchSlugs.has(trickNameToSlug(r.trick_name)))?.trick_name;
    const trickName = recordTrickName
      ?? (dictRow ? dictRow.canonical_name.replace(/\b\w/g, c => c.toUpperCase()) : null);

    if (!trickName) {
      throw new NotFoundError(`No freestyle trick found for slug: ${slug}`);
    }

    // All records for this trick (current + superseded), ordered by value DESC
    const allTrickRows = runSqliteRead('freestyleRecords.listAllByTrickName', () =>
      freestyleRecords.listAllByTrickName.all(trickName) as FreestyleRecordRow[],
    );

    const currentRows = allTrickRows.filter(r => !r.superseded_by);
    const hasProgression = allTrickRows.some(r => r.superseded_by);

    const sortName = allTrickRows[0]?.sort_name ?? null;
    const topValue = currentRows[0]?.value_numeric ?? 0;

    // Load all tricks and all modifiers for composition computation in shapeDictEntry
    const allDictRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const allModifierRows = runSqliteRead('freestyleTrickModifiers.listAll', () =>
      freestyleTrickModifiers.listAll.all() as FreestyleTrickModifierRow[],
    );

    const dictEntry = dictRow ? shapeDictEntry(dictRow, allDictRows, allModifierRows) : null;

    // Family-context resolution. The family block must agree
    // with the family-view browse: resolve each row to the public family it
    // renders under, not the raw trick_family. Sub-labels fold to the family
    // whose terminal they conserve; labels that are not families (catch
    // surfaces, modifier ecosystems, sparse lineages) resolve to null, so the
    // family-context block suppresses rather than presenting a misleading
    // "<label> family". The same per-row resolution the browse uses builds the
    // folded-lineage member list, so a family and its folded sub-labels show a
    // consistent ladder. No trick_family data is overwritten; resolution is the
    // reversible content map.
    const familyOfRow = (r: { slug: string; trick_family: string | null }): string | null => {
      const raw = resolveFamilyOverride(r.slug) ?? r.trick_family;
      return raw ? resolveDisplayFamily(raw) : null;
    };
    const effectiveFamilySlug = dictRow ? familyOfRow(dictRow) : null;

    // Build family members list for difficulty ladder
    let familyMembers: FreestyleFamilyMember[] = [];
    if (dictRow && effectiveFamilySlug) {
      // Build set of slugs with records for linking
      const slugsWithRecords = new Set(
        publicRows.filter(r => r.trick_name).map(r => trickNameToSlug(r.trick_name!)),
      );
      familyMembers = allDictRows
        .filter(r =>
          r.category !== 'modifier' && r.category !== 'set' && r.category !== 'operator'
          && familyOfRow(r) === effectiveFamilySlug,
        )
        .map(r => ({
          slug:           r.slug,
          canonicalName:  r.canonical_name,
          adds:           r.adds,
          isCurrentTrick: r.slug === dictRow.slug,
          detailHref:     `/freestyle/tricks/${r.slug}`,
          hasRecords:     slugsWithRecords.has(r.slug),
        }));
    }

    const hasDictEntry     = dictEntry !== null;
    const hasRecords       = currentRows.length > 0;
    const trickTag         = slugToHashtag(slug);
    const seoTitle         = `Trick ${trickTag}`;
    const seoDescription   = hasRecords
      ? `Freestyle footbag passback records for ${trickName}. Current record: ${topValue} kicks.`
      : `${trickName}: ${dictEntry?.description ?? 'Freestyle footbag trick reference.'}`;

    return {
      seo: {
        title:       seoTitle,
        description: seoDescription,
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_trick_detail',
        title:      trickName,
        eyebrow:    hasDictEntry ? (dictEntry!.isModifier ? 'Modifier' : `${dictEntry!.adds ?? '?'} ADD`) : 'Trick Record',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Trick Dictionary', href: '/freestyle/tricks' },
          { label: trickName },
        ],
      },
      content: (() => {
        // Load modifier_links once; consumed by both notationGrammar (editorial
        // decomposition table) and the hero quick-stat formula.
        const modifierLinks: FreestyleTrickModifierLinkDetailRow[] = dictRow
          ? runSqliteRead('freestyleTrickModifiers.listLinksByTrickSlug', () =>
              freestyleTrickModifiers.listLinksByTrickSlug.all(slug) as FreestyleTrickModifierLinkDetailRow[],
            )
          : [];

        // Load all (modifier, trick) pairs once and build a Map for
        // parallel + substitution shaping. Reuses an existing prepared
        // statement (listTricksByModifier); no new query needed.
        const allLinkRows = runSqliteRead('freestyleTrickModifiers.listTricksByModifier', () =>
          freestyleTrickModifiers.listTricksByModifier.all() as FreestyleTrickModifierLinkRow[],
        );
        const modifierLinkMap = buildModifierLinkMap(allLinkRows);
        const currentTrickMods: ModifierLinkInfo[] =
          dictRow ? (modifierLinkMap.get(slug) ?? []) : [];

        // Load all curator-tagged media for this trick once. Split into
        // three buckets by source tier:
        //   - tutorialMedia: instructional (TT, AnzTrikz, FootbagSpot, etc.)
        //   - demoMedia: named-trick performance (Footbag Finland, Flipsider)
        //   - dropped (passback_records): renders in the Passback Records
        //     table below instead, to avoid duplicating record-clip data
        const allRefMedia = runSqliteRead('media.listMediaByTrickTag', () =>
          media.listMediaByTrickTag.all(`#${slug}`) as TrickRefMediaRow[],
        );
        // Batch-load hashtag chips for every reference-media row in one round-trip
        // (LANDING-AND-TRICKS-QA-REALIGNMENT-1 F7). Builds mediaId → raw-tag-array
        // map; shapeReferenceMedia applies the browse-surface suppression policy.
        const tagRows = allRefMedia.length > 0
          ? runSqliteRead('media.queryCuratorMediaTags',
              () => queryCuratorMediaTags(allRefMedia.map(r => r.id)))
          : [];
        const tagsByMediaId = new Map<string, string[]>();
        for (const t of tagRows) {
          const arr = tagsByMediaId.get(t.media_id);
          if (arr) arr.push(t.tag_display);
          else tagsByMediaId.set(t.media_id, [t.tag_display]);
        }
        const tutorialMedia: TrickReferenceMediaItem[] = [];
        const demoMedia: TrickReferenceMediaItem[] = [];
        for (const r of allRefMedia) {
          const tier = tierOf(r.source_id);
          if (tier === 'RECORD') continue;
          const shaped = shapeReferenceMedia(r, tagsByMediaId.get(r.id) ?? []);
          if (tier === 'TUTORIAL') {
            tutorialMedia.push(shaped);
          } else if (tier === 'DEMONSTRATION') {
            demoMedia.push(shaped);
          } else {
            // Unclassified source — default to tutorial bucket so new
            // sources surface visibly while curator updates the registry.
            tutorialMedia.push(shaped);
          }
        }
        const hasReferenceMedia = tutorialMedia.length > 0 || demoMedia.length > 0;
        const referenceMediaHeading: string | null =
          tutorialMedia.length > 0 && demoMedia.length > 0 ? 'Tutorials and demonstrations'
          : tutorialMedia.length > 0                       ? 'Tutorials'
          : demoMedia.length > 0                           ? 'Demonstrations'
          : null;

        const familySlug = effectiveFamilySlug;
        const familyName = familySlug
          ? (PUBLIC_FAMILY_LABEL.get(familySlug)
             ?? resolveFamilyDisplayName(familySlug)
             ?? (familySlug.charAt(0).toUpperCase() + familySlug.slice(1).replace(/-/g, ' ')))
          : null;
        // Pathway "Learn this trick" surfaces tutorial- and demo-tier counts
        // separately — wording must not conflate them.
        const pathways = shapeTrickPathways({
          tutorialCount: tutorialMedia.length,
          demoCount:     demoMedia.length,
          recordCount: currentRows.length,
          topRecordHolder: currentRows[0]?.holder_name ?? null,
          topRecordValue: topValue,
          familySlug,
          familyName,
          familyMemberCount: familyMembers.length,
        });

        // "Modifiers on this trick" rows (one per distinct modifier link):
        // browse-cluster label + Movement System axis deep-link + optional
        // composition gloss. Always shaped, independent of the >=3-link
        // modifier-layering panel below it.
        const modifierMemberships: FreestyleTrickModifierMembership[] = (() => {
          const seen = new Set<string>();
          const out: FreestyleTrickModifierMembership[] = [];
          for (const link of modifierLinks) {
            const ms = link.modifier_slug;
            if (seen.has(ms)) continue;
            seen.add(ms);
            const axis = resolveAxisForModifier(ms);
            out.push({
              name:         link.modifier_name,
              clusterLabel: clusterLabelForModifier(ms),
              axisName:     axis ? axis.axisName : null,
              axisKey:      axis ? axis.axisKey : null,
              gloss:        resolveModifierCompositionGloss(ms),
            });
          }
          return out;
        })();

        // Families beyond the primary one: branch->root containment (a branch
        // family's parent root, via familyWithAncestors) plus curator
        // dual-memberships. Lets a multi-family trick (e.g. a torque-family
        // trick, also an osis member) echo on its own page what By-family browse
        // already shows.
        // Family display tier (current editorial standard, reversible): a Minor
        // Lineage is shown with a muted qualifier rather than as a first-class
        // family. Derived live from descendant count; trick_family is untouched.
        const familyIsMinorLineage = (fam: string): boolean =>
          familyTier(fam) === 'minor-lineage';

        const additionalFamilies: { label: string; slug: string; isMinorLineage: boolean }[] = (() => {
          if (!effectiveFamilySlug) return [];
          const extras = new Set<string>([
            ...familyWithAncestors(effectiveFamilySlug),
            ...resolveFamilyDualMemberships(slug),
          ]);
          extras.delete(effectiveFamilySlug);
          return [...extras].map(fam => {
            const label = PUBLIC_FAMILY_LABEL.get(fam)
              ?? resolveFamilyDisplayName(fam)
              ?? (fam.charAt(0).toUpperCase() + fam.slice(1).replace(/-/g, ' '));
            return { label: `${label} family`, slug: fam, isMinorLineage: familyIsMinorLineage(fam) };
          });
        })();

        // Related tricks partitioned into labeled relationship groups by the
        // existing per-row `rule`. Pendulum/rake re-label the movement-neighbour
        // group as "Swing elements" (completed by the swing; open terminal).
        const relatedList: FreestyleRelatedTrick[] = dictRow ? buildRelatedTricks(dictRow, allDictRows) : [];
        const isSwingElement = slug === 'pendulum' || slug === 'rake';
        const relatedGroups: FreestyleRelatedGroup[] = ([
          { key: 'family',          label: 'Same family',         rationale: null },
          { key: 'modifier-prefix', label: 'Shares a modifier',   rationale: null },
          { key: 'neighborhood',    label: isSwingElement ? 'Swing elements' : 'Movement neighbours',
            rationale: isSwingElement
              ? 'Completed by the swing action itself; the terminal is open (stall, kick, hand catch, or a follow-on trick).'
              : null },
          { key: 'parent',          label: 'Built on',            rationale: null },
          { key: 'grandparent',     label: 'Structural ancestor', rationale: null },
        ] as const).flatMap(g => {
          const tricks = relatedList.filter(r => r.rule === g.key);
          return tricks.length ? [{ key: g.key, label: g.label, rationale: g.rationale, tricks }] : [];
        });

        // Quantity ladder (same base, increasing repetition count). Cross-family;
        // never re-homes trick_family. A member absent from the dictionary renders
        // as a missing rung.
        const quantityLadder: FreestyleQuantityLadderView | null = (() => {
          const lad = quantityLadderFor(slug);
          if (!lad) return null;
          return {
            ladderLabel: lad.label,
            rationale:   lad.rationale,
            steps: lad.members.map(m => {
              const row = allDictRows.find(r => r.slug === m);
              return {
                label:      row ? row.canonical_name : m.replace(/-/g, ' '),
                slug:       row ? m : null,
                detailHref: row ? `/freestyle/tricks/${m}` : null,
                adds:       row ? (row.adds ?? '') : '',
                isCurrent:  m === slug,
                present:    !!row,
              };
            }),
          };
        })();

        return {
          trickName,
          sortName,
          slug,
          trickTag,
          records:          currentRows.map(r => shapeFreestyleRecord(r)),
          recordCount:      currentRows.length,
          topValue,
          progression:      allTrickRows.map(r => shapeFreestyleRecord(r)),
          hasProgression,
          dictEntry,
          familyMembers,
          hasFamilyMembers: familyMembers.length > 1,
          familyChip:       familySlug
            ? { label: `${familyName} family`, slug: familySlug, isMinorLineage: familyIsMinorLineage(familySlug) }
            : null,
          familyTiers:      buildFamilyTiers(familyMembers),
          additionalFamilies,
          relatedTricks:    relatedList,
          relatedGroups,
          quantityLadder,
          modifierMemberships,
          symbolicRelatedTopology: buildSymbolicRelatedTopologyPanel(slug, allDictRows),
          symbolicEducationCtas:   buildSymbolicEducationCtas(slug),
          symbolicMemberships:     dictRow
            ? computeTrickSymbolicMemberships(
                { slug: dictRow.slug, base_trick: dictRow.base_trick },
                currentTrickMods.map(m => ({ slug: m.slug, name: m.name, type: m.type, cssRole: m.cssRole })),
              )
            : { topology: [], component: [] },
          previousTricks:   dictRow ? buildPreviousTricks(dictRow, allDictRows) : [],
          nextTricks:       dictRow ? buildNextTricks(dictRow, allDictRows) : [],
          tutorialMedia,
          demoMedia,
          hasReferenceMedia,
          referenceMediaHeading,
          pathways,
          notationGrammar: dictRow
            ? shapeNotationGrammar(
                dictRow,
                new Map(allDictRows.map(r => [r.slug, r])),
                modifierLinks,
              )
            : null,
          notationDisplay: dictRow
            ? shapeNotationDisplay(
                dictRow.notation,
                buildNotationLookupContext(
                  allDictRows,
                  allModifierRows,
                  runSqliteRead('freestyleTrickAliases.listAll', () =>
                    freestyleTrickAliases.listAll.all() as FreestyleTrickAliasRow[],
                  ),
                ),
              )
            : null,
          semanticNotation: dictRow
            ? shapeSemanticNotation(dictRow, new Map(allDictRows.map(r => [r.slug, r])))
            : null,
          operationalNotation: (() => {
            // O1a/O1b/O1d: shape into role-classified tokens for the trick-
            // detail template. Null when no source carries operational
            // notation; section omits entirely. Lookup chain: CoreTrickSpec
            // (12 atoms) → RESOLVED_FORMULAS_SPRINT_1 (curator-published
            // compound JOB overrides) → DB operational_notation column.
            // shapeOperationalNotationDisplay handles null/empty/whitespace-
            // only input safely. The optional curator-authored sourceNote
            // (provenance/citation line) renders only when the
            // operational_notation_source column is populated.
            const opNotationRaw = resolveOperationalNotationRaw(
              slug,
              dictRow?.operational_notation ?? null,
            );
            const display = shapeOperationalNotationDisplay(opNotationRaw);
            if (!display) return null;
            const rawSource = dictRow?.operational_notation_source;
            const sourceNote = rawSource && rawSource.trim() ? rawSource.trim() : null;
            return { raw: display.raw, tokens: display.tokens, sourceNote };
          })(),
          ux2Pilot: shapeUx2PilotFromRow(dictRow, currentRows.length),
          densityTier: classifyDensityTier({
            modifierLinkCount: dictEntry?.appliedModifiers?.length ?? 0,
            hasSemanticNotation: !!(dictRow?.notation && dictRow.notation.trim()),
            hasOperationalNotation: !!(
              dictRow?.operational_notation && dictRow.operational_notation.trim()
            ),
            recordCount: currentRows.length,
            hasReferenceMedia,
            hasUx2Prose: shapeUx2PilotFromRow(dictRow, currentRows.length) !== null,
          }),
          hasMediaBlock:
            hasReferenceMedia ||
            shapeUx2PilotFromRow(dictRow, currentRows.length) !== null,
          heroFormula: dictEntry
            ? buildHeroFormula(
                dictEntry.canonicalName,
                dictEntry.isModifier,
                modifierLinks,
                dictEntry.baseTrick,
                dictEntry.baseTrickAdds,
                ROTATIONAL_BASES.has(dictEntry.baseTrickSlug ?? ''),
                dictEntry.adds,
              )
            : null,
          heroDecomposition: dictEntry
            ? buildHeroDecomposition(
                modifierLinks,
                dictEntry.baseTrick,
                dictEntry.isModifier,
              )
            : null,
          modifierLayering: dictEntry
            ? buildModifierLayering(
                modifierLinks,
                dictEntry.baseTrick,
                dictEntry.baseTrickAdds,
                ROTATIONAL_BASES.has(dictEntry.baseTrickSlug ?? ''),
                dictEntry.adds,
                dictEntry.isModifier,
              )
            : null,
          hasModifierLinks: modifierLinks.length > 0,
          parallelTricks: dictRow
            ? buildParallelTricks(dictRow, allDictRows, modifierLinkMap)
            : [],
          substitutions: dictRow
            ? buildSubstitutions(
                dictRow,
                currentTrickMods,
                allDictRows,
                modifierLinkMap,
              )
            : [],
          ...(() => {
            // First-class trick cohort. Two gates: convergence-rule pass
            // AND cohort-tier membership (FIRST_CLASS_TIER_1 ∪
            // FIRST_CLASS_TIER_2 via isFirstClass helper). addAnalysis
            // (the collapsed disclosure) is suppressed for first-class
            // tricks so the comparativeNotation row doesn't double-render
            // the ADD breakdown.
            //
            // Core-atom suppression rule:
            // addAnalysis is also suppressed for any slug in
            // CORE_ATOM_SLUGS. Atoms are the floor of decomposition;
            // rendering a compositional ADD analysis on them implies
            // a deeper reading that does not exist. See isCoreAtom()
            // in freestyleCoreAtomEducational for the canonical set.
            const modifierBonusTable = new Map<string, { add_bonus: number; add_bonus_rotational: number }>();
            for (const row of allModifierRows) {
              modifierBonusTable.set(row.slug, {
                add_bonus:            row.add_bonus,
                add_bonus_rotational: row.add_bonus_rotational,
              });
            }
            const modifierSlugs = modifierLinks.map(l => l.modifier_slug);
            const baseRow = dictRow?.base_trick
              ? allDictRows.find(r => r.slug === dictRow.base_trick)
              : null;
            const baseAddNum = baseRow?.adds != null && baseRow.adds !== ''
              ? Number(baseRow.adds)
              : null;
            const convergence = assertFirstClassConvergence(
              slug,
              dictRow ?? null,
              modifierSlugs,
              modifierBonusTable,
              baseAddNum,
            );
            const firstClassPasses =
              convergence.status === 'first-class'
              && isFirstClass(slug);
            const comparativeNotation = firstClassPasses
              ? shapeComparativeNotation(
                  slug,
                  dictRow ?? null,
                  modifierSlugs,
                  tutorialMedia.length,
                  demoMedia.length,
                )
              : null;
            const addAnalysis = (firstClassPasses || isCoreAtom(slug))
              ? null
              : shapeTrickAddAnalysis(slug);
            return { isFirstClass: firstClassPasses, comparativeNotation, addAnalysis };
          })(),
          equivalenceTopology: (() => {
            // Surfaces an
            // alternate-derivation entry inside an [advanced] expandable
            // when authored AND ratified. curatorConfirmPending entries
            // are filtered here so pending entries never reach the
            // template — the publication-semantics gate lives at this
            // seam.
            //
            // Core-atom suppression rule:
            // atoms cannot carry an alternate-derivation entry; the
            // "alternate" frame presupposes a primary decomposition,
            // which atoms (by definition) lack.
            if (isCoreAtom(slug)) return null;
            const entry = getEquivalenceTopologyFor(slug);
            return entry && !entry.curatorConfirmPending
              ? shapeEquivalenceTopologyView(entry)
              : null;
          })(),
          primitiveNote: (() => {
            // Primitive-note callout. The companion to the core-atom
            // suppression rule above: where atoms suppress compound-
            // shaped partials, this surfaces a small pedagogical note
            // explaining the ontological role.
            //
            // Wording is locked here at the service layer (not in the
            // template) so the doctrine framing stays consistent across
            // all 12 atom pages. The glossary section
            // #primitives-and-compounds carries the full doctrine.
            //
            // Constraints (do not relax without curator review):
            // - never implies "simple" or "easy"
            // - never implies compounds are harder
            // - never implies ADD valuation
            // - never collapses movement semantics into scoring semantics
            if (!isCoreAtom(slug)) return null;
            return {
              label:     'Core movement atom',
              explainer: 'Foundational primitive: functions as a compositional base rather than a recursively decomposed structure.',
            };
          })(),
          transform: (() => {
            // Reverse-pair transform overlay. Populated only for the
            // five curator-locked
            // entries in REVERSE_PAIR_TRANSFORMS (illusion, pickup,
            // rev-whirl, rev-swirl, orbit). See the content module
            // for the forever-rule about scope.
            const entry = getReversePairTransform(slug);
            if (entry === null) return null;
            return {
              expression:    entry.expression,
              baseSlug:      entry.baseSlug,
              baseName:      entry.baseName,
              baseHref:      `/freestyle/tricks/${entry.baseSlug}`,
              baseAdd:       entry.baseAdd,
              totalAdd:      entry.baseAdd,  // rev(0) is +0 ADD
              rev0Explainer: REV_ZERO_EXPLAINER,
            };
          })(),
          intuition: (() => {
            // Movement-intuition prose. Curator-locked flagship enrichments only;
            // see freestyleTrickIntuition.ts for the authorship
            // discipline locked in the JSDoc there. Initial set: the
            // five core-atom flagships (mirage, whirl, butterfly, osis,
            // illusion) and one compound flagship (mobius).
            const entry = getTrickIntuition(slug);
            if (entry === null) return null;
            return {
              prose:       entry.prose,
              attribution: entry.attribution,
            };
          })(),
          // "Compressed from" / "Compressed reading" pedagogy line.
          // Strict allowlist of famous
          // structural compressions (smear, ripwalk, atom-smasher,
          // eggbeater, mobius). See FAMOUS_COMPRESSION_SLUGS doctrine.
          compressedFrom: shapeCompressedFrom(slug),
          interpretation: (() => {
            // Naming & interpretation overlay — opt-in, curator-locked.
            // Surfaces canonical + historical readings for tricks where
            // multiple naming traditions describe the same movement
            // (seed entry: eggbeater = atomic legover ≡ illusion + legover).
            // Layer separation enforced: alias slot, S5 primary-readings,
            // ADD math, and modifier families are all untouched. The
            // structural notes carry the "historical reading does not
            // imply a productive modifier family" framing explicitly so
            // it stays consistent across entries.
            const entry = getTrickInterpretation(slug);
            if (entry === null) return null;
            return {
              canonicalReading:   entry.canonicalReading,
              historicalReadings: [...entry.historicalReadings],
              structuralNotes:    [...entry.structuralNotes],
            };
          })(),
          // ── Trick-detail ontology doctrine ─────────────────────────────
          // L1-L6 layered ontology fields. Universal grammar:
          // any trick with curated content renders the
          // relevant sections. Tier is an authoring priority signal
          // (TIER_A_SLUGS / TIER_B_SLUGS in freestyleTrickTier.ts), NOT
          // a structural gate; suppression is content-driven (entry null
          // → section suppresses).
          trickTier:        resolveTrickTier(slug),
          mechanicalDelta:  (() => {
            // L2 — mechanical delta. The deepest ontology layer per the
            // doctrine; where paradox / x-dex / nuclear / rotational /
            // hidden-topology distinctions become understandable.
            const entry = getTrickMechanicalDelta(slug);
            if (entry === null) return null;
            const topologyLabelMap: Record<string, string> = {
              'atom':              'Atom: defining mechanical pattern',
              'paradox':           'Paradox topology',
              'x-dex':             'X-dex escalation',
              'rotational':        'Rotational',
              'no-plant':          'Suspension / no-plant',
              'cross-body':        'Cross-body',
              'compound':          'Compound-of-canonicals',
              'hidden-topology':   'Hidden topology',
            };
            return {
              parentLinks: entry.parentSlugs.map(s => ({
                slug:  s,
                label: s.replace(/-/g, ' '),
                href:  `/freestyle/tricks/${s}`,
              })),
              prose:                     entry.prose,
              topologyKind:              entry.topologyKind,
              topologyLabel:             topologyLabelMap[entry.topologyKind] ?? entry.topologyKind,
              interpretiveTraditions:    [...(entry.interpretiveTraditions ?? [])],
              hasInterpretiveTraditions: (entry.interpretiveTraditions ?? []).length > 0,
            };
          })(),
          ontologyRole: (() => {
            // L3 — ontology role. May overlap with L4 (productivity) on
            // some slugs; curator picks which slot carries the prose.
            const entry = getTrickOntologyRole(slug);
            if (entry === null) return null;
            return {
              role:  entry.role,
              prose: entry.prose,
            };
          })(),
          productivity: (() => {
            // L4 — productivity narrative. Curator-authored descendant
            // slugs (no NLP) so cross-references stay stable.
            const entry = getTrickProductivity(slug);
            if (entry === null) return null;
            return {
              prose: entry.prose,
              productiveDescendants: entry.productiveDescendants.map(d => ({
                slug:  d.slug,
                label: d.label,
                href:  `/freestyle/tricks/${d.slug}`,
                note:  d.note,
              })),
            };
          })(),
          familyEvolution: (() => {
            // L5 — family evolution narrative. Branching steps with
            // axis + prose + exemplar links. Renders as the
            // movement-language-history surface; NOT a list.
            const entry = getTrickFamilyEvolution(slug);
            if (entry === null) return null;
            return {
              steps: entry.narrativeSteps.map(s => ({
                branchAxis: s.branchAxis,
                prose:      s.prose,
                exemplarLinks: s.exemplarSlugs.map(es => ({
                  slug:  es,
                  label: es.replace(/-/g, ' '),
                  href:  `/freestyle/tricks/${es}`,
                })),
              })),
            };
          })(),
          progressiveReadings: (() => {
            // L6 — progressive equivalence unfolding. simple parent →
            // topology transformation → compositional extension →
            // compressed shorthand → descendant systems.
            const entry = getTrickProgressiveReadings(slug);
            if (entry === null) return null;
            return {
              stages: entry.stages.map(s => ({
                stage:    s.stage,
                reading:  s.reading,
                citation: s.citation,
              })),
            };
          })(),
          descriptionIsPlaceholder: (() => {
            // Placeholder-description suppressor.
            //
            // Catches "X-modified Y." /
            // "X-and-Y modified Z." / "Popular freestyle trick." patterns.
            //
            // Also catches
            // formula-embedded descriptions backfilled during bulk
            // promotion. Those rows carry the JOB chain
            // inline (e.g. "Stepping modifier on barfly base. 5 ADD =
            // stepping(+1) + barfly(4); JOB CLIP > OP IN [DEX] >> ...
            // Stepping leading-[DEX] chassis prefixed to barfly's
            // no-plant out-dex chain."). The JOB chain belongs in
            // notation/operational_notation — not in description prose
            // — so the page renders the structured-decomposition pill
            // instead. DB row is NEVER mutated; template suppresses
            // render only.
            //
            // Detection heuristic: any description containing `; JOB `
            // OR a bracket token (`[DEX]`, `[BOD]`, `[PDX]`, `[XBD]`,
            // `[DEL]`, `[UNS]`, `[XDEX]`) is a formula-embedded
            // backfill, not pedagogical prose. ~128 rows post-W9.
            const desc = dictRow?.description ?? null;
            if (!desc) return false;
            const trimmed = desc.trim();
            if (/^[A-Z][a-zA-Z-]+(?:-modified|-and-[a-zA-Z-]+ modified) [a-zA-Z][a-zA-Z -]*\.?$/.test(trimmed)) return true;
            if (/^Popular freestyle trick\.?$/i.test(trimmed)) return true;
            if (/^Common freestyle trick\.?$/i.test(trimmed)) return true;
            if (/; JOB /.test(trimmed)) return true;
            if (/\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/.test(trimmed)) return true;
            return false;
          })(),
          familyAnchorContext: (() => {
            // Family-anchor callout. When the
            // current trick is itself the family-anchor (slug ===
            // trick_family) AND the family carries a curator-authored
            // invariant, surface a callout in the trick-family
            // section so the trick-detail page teaches the
            // family-anchor role explicitly. Returns null otherwise.
            // A trick is a family-anchor only when it anchors its EFFECTIVE
            // (resolved, non-routed-out) family — so sub-labels that fold into
            // a family (e.g. mobius → torque) and route-out labels do not claim
            // anchor status, and the browse href targets a family section that
            // actually renders.
            if (!dictRow || !effectiveFamilySlug) return null;
            if (effectiveFamilySlug !== dictRow.slug) return null;
            const invariant = getFamilyInvariant(effectiveFamilySlug);
            if (!invariant) return null;
            const familyName = PUBLIC_FAMILY_LABEL.get(effectiveFamilySlug)
              ?? resolveFamilyDisplayName(effectiveFamilySlug)
              ?? (effectiveFamilySlug.charAt(0).toUpperCase()
                  + effectiveFamilySlug.slice(1).replace(/-/g, ' '));
            return {
              invariant,
              familyName,
              familyBrowseHref: `/freestyle/tricks?view=family#family-${effectiveFamilySlug}`,
            };
          })(),
          scoringNote: (() => {
            // Doctrine-divergence rendering. Consult the
            // DOCTRINE_DIVERGENCE_REGISTRY for documented divergence
            // between the IFPA-grammar-derived ADD and a community/
            // external source. Renders on trick-detail ONLY per the
            // framework's placement policy (browse cards stay clean).
            const entry = getDoctrineDivergence(slug);
            if (!entry) return null;
            if (entry.status !== 'published') return null;
            if (entry.noteVisibility === 'curator-only') return null;
            return {
              category:       entry.category,
              sourceSystem:   entry.sourceSystem,
              sourceClaim:    entry.sourceClaim,
              canonicalValue: entry.canonicalValue,
              provenanceNote: entry.provenanceNote,
              visibility:     entry.noteVisibility,
            };
          })(),
        };
      })(),
    };
  },

  getFreestyleCompetitionPage(): PageViewModel<FreestyleCompetitionContent> {
    const competitorRows = runSqliteRead('freestyleCompetition.listTopCompetitors', () =>
      freestyleCompetition.listTopCompetitors.all() as FreestyleCompetitorRow[],
    );
    const eraRows = runSqliteRead('freestyleCompetition.listEventsByEra', () =>
      freestyleCompetition.listEventsByEra.all() as FreestyleEraRow[],
    );
    const recentRows = runSqliteRead('freestyleCompetition.listRecentEvents', () =>
      freestyleCompetition.listRecentEvents.all() as FreestyleRecentEventRow[],
    );

    const totalEvents = eraRows.reduce((sum, r) => sum + r.events, 0);

    const topCompetitors: FreestyleCompetitorViewModel[] = competitorRows.map(r => ({
      personId:     r.person_id,
      name:         r.person_name,
      country:      r.country,
      golds:        r.golds,
      silvers:      r.silvers,
      bronzes:      r.bronzes,
      totalPodiums: r.total_podiums,
      profileHref:  personHref(r.member_slug, r.person_id),
    }));

    const eventsByEra: FreestyleEraViewModel[] = eraRows.map(r => ({
      era:    r.era,
      events: r.events,
    }));

    const recentEvents: FreestyleRecentEventViewModel[] = recentRows.map(r => ({
      eventId:   r.event_id,
      title:     r.event_title,
      startDate: r.start_date.substring(0, 10),
      city:      r.city,
      country:   r.country,
      href:      `/events/${r.tag_normalized}`,
    }));

    // Competition formats: static beginner prose, live event prevalence.
    const formatEventRows = runSqliteRead('freestyleCompetition.listFormatDisciplineEvents', () =>
      freestyleCompetition.listFormatDisciplineEvents.all() as FreestyleFormatEventRow[],
    );
    const formats: FreestyleFormatViewModel[] = COMPETITION_FORMATS.map(f => {
      const events = new Set<string>();
      for (const row of formatEventRows) {
        if (f.match.some(m => row.name.includes(m))) events.add(row.event_id);
      }
      const eventCount = events.size;
      return {
        key:        f.key,
        name:       f.name,
        blurb:      f.blurb,
        eventCount,
        eventLabel: eventCount > 0 ? `${eventCount} documented events` : '',
      };
    });

    // Milestones: most golds / most podiums / longest careers.
    const milestoneRows = runSqliteRead('freestyleCompetition.listCompetitorMilestones', () =>
      freestyleCompetition.listCompetitorMilestones.all() as FreestyleMilestoneRow[],
    );
    const careerRows = runSqliteRead('freestyleCompetition.listLongestCareers', () =>
      freestyleCompetition.listLongestCareers.all() as FreestyleCareerRow[],
    );
    const BUCKET = 8;
    const mostGolds: FreestyleMilestoneEntry[] = [...milestoneRows]
      .sort((a, b) => b.golds - a.golds || b.total_podiums - a.total_podiums)
      .slice(0, BUCKET)
      .map((r, i) => ({
        rank: i + 1, name: r.person_name, country: r.country,
        value: r.golds, detail: `${r.total_podiums} podiums`,
        profileHref: personHref(r.member_slug, r.person_id),
      }));
    const mostPodiums: FreestyleMilestoneEntry[] = [...milestoneRows]
      .sort((a, b) => b.total_podiums - a.total_podiums || b.golds - a.golds)
      .slice(0, BUCKET)
      .map((r, i) => ({
        rank: i + 1, name: r.person_name, country: r.country,
        value: r.total_podiums, detail: `${r.golds} gold`,
        profileHref: personHref(r.member_slug, r.person_id),
      }));
    const longestCareers: FreestyleMilestoneEntry[] = careerRows.map((r, i) => ({
      rank: i + 1, name: r.person_name, country: r.country,
      value: r.span, detail: `${r.first_year}–${r.last_year}`,
      profileHref: personHref(r.member_slug, r.person_id),
    }));
    const milestones: FreestyleMilestoneBucket[] = [
      { key: 'golds',   title: 'Most Documented Golds',     valueLabel: 'Golds',   entries: mostGolds },
      { key: 'podiums', title: 'Most Documented Podiums',   valueLabel: 'Podiums', entries: mostPodiums },
      { key: 'careers', title: 'Longest Documented Careers', valueLabel: 'Years',  entries: longestCareers },
    ].filter(b => b.entries.length > 0);

    // Most successful nations (by medalist nationality).
    const nationRows = runSqliteRead('freestyleCompetition.listNationPodiums', () =>
      freestyleCompetition.listNationPodiums.all() as FreestyleNationRow[],
    );
    const nations: FreestyleNationViewModel[] = nationRows.map((r, i) => ({
      rank: i + 1, country: r.country, podiums: r.podiums, golds: r.golds, competitors: r.competitors,
    }));

    // World champions: wins at World Championship events.
    const championRows = runSqliteRead('freestyleCompetition.listWorldChampions', () =>
      freestyleCompetition.listWorldChampions.all() as FreestyleWorldChampionRow[],
    );
    const worldChampions: FreestyleMilestoneEntry[] = championRows.map((r, i) => ({
      rank: i + 1, name: r.person_name, country: r.country,
      value: r.world_titles, detail: r.country ?? '',
      profileHref: personHref(r.member_slug, r.person_id),
    }));

    // Geographic evolution: podiums by medalist nationality and decade.
    const decadeNationRows = runSqliteRead('freestyleCompetition.listPodiumsByDecadeNation', () =>
      freestyleCompetition.listPodiumsByDecadeNation.all() as FreestyleDecadeNationRow[],
    );
    const decadeMap = new Map<string, { country: string; podiums: number }[]>();
    for (const r of decadeNationRows) {
      const list = decadeMap.get(r.decade) ?? [];
      list.push({ country: r.country, podiums: r.podiums });
      decadeMap.set(r.decade, list);
    }
    const geographyByDecade: FreestyleDecadeNationViewModel[] = [...decadeMap.keys()]
      .sort()
      .map(decade => {
        const all = decadeMap.get(decade)!;
        return { decade, nationCount: all.length, nations: all.slice(0, 6) };
      });

    return {
      seo: {
        title: 'Freestyle Competition',
        description:
          'Freestyle footbag competition history: the events, eras, and documented ' +
          'results that have shaped the sport since 1980.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_competition',
        title:      'Freestyle Competition',
        intro:
          'Freestyle competition has evolved through decades of events, routines, ' +
          'and documented results.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Competition' },
        ],
      },
      content: {
        formats,
        topCompetitors,
        milestones,
        nations,
        worldChampions,
        geographyByDecade,
        eventsByEra,
        recentEvents,
        totalEvents,
        dataNote: 'Freestyle singles only (Open, Intermediate, and Women\'s divisions). All placements ' +
                  'come directly from documented event results. Nationality is shown where recorded ' +
                  '(about two thirds of competitors); pre-1997 coverage is sparse and still being recovered ' +
                  'from the historical archive, so earlier eras are under-represented.',
      },
    };
  },

  getFreestylePartnershipsPage(): PageViewModel<FreestylePartnershipsContent> {
    const rows = runSqliteRead('freestylePartnerships.listTopPartnerships', () =>
      freestylePartnerships.listTopPartnerships.all() as FreestylePartnershipRow[],
    );

    function shapePartnership(r: FreestylePartnershipRow): FreestylePartnershipViewModel {
      const first = r.first_year;
      const last = r.last_year;
      let span: string | null = null;
      if (first !== null && last !== null) {
        span = first === last ? String(first) : `${first}–${last}`;
      }
      return {
        ...shapePartnershipPair(r),
        appearanceCount: r.appearance_count,
        winCount:        r.win_count,
        podiumCount:     r.podium_count,
        yearSpan:        span,
      };
    }

    const allRanked = rows.map(shapePartnership);

    // Build notable buckets (same pattern as net)
    const BUCKET_SIZE = 5;

    const byWins = [...rows].sort((a, b) =>
      b.win_count - a.win_count || b.podium_count - a.podium_count || b.appearance_count - a.appearance_count);
    const byPodiums = [...rows].sort((a, b) =>
      b.podium_count - a.podium_count || b.win_count - a.win_count || b.appearance_count - a.appearance_count);
    const bySpan = [...rows].sort((a, b) => {
      const sa = (a.last_year ?? 0) - (a.first_year ?? 0);
      const sb = (b.last_year ?? 0) - (b.first_year ?? 0);
      return sb - sa || b.appearance_count - a.appearance_count;
    });

    const buckets: FreestylePartnershipBucket[] = [];
    const wB = byWins.slice(0, BUCKET_SIZE).map(shapePartnership);
    if (wB.length) buckets.push({ title: 'Most Wins', partnerships: wB });
    const pB = byPodiums.slice(0, BUCKET_SIZE).map(shapePartnership);
    if (pB.length) buckets.push({ title: 'Most Podium Finishes', partnerships: pB });
    const sB = bySpan.slice(0, BUCKET_SIZE).map(shapePartnership);
    if (sB.length) buckets.push({ title: 'Longest Spans', partnerships: sB });

    return {
      seo: {
        title: 'Freestyle Partnerships',
        description: 'Top freestyle doubles partnerships in footbag history.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_partnerships',
        title:      'Freestyle Partnerships',
        intro:      'The most significant doubles partnerships in freestyle footbag, ranked by competitive appearances.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Partnerships' },
        ],
      },
      content: {
        buckets,
        allRanked,
        totalShown: allRanked.length,
        dataNote: 'Freestyle doubles and team routines only. Trick contests, shred, and circle events are excluded.',
      },
    };
  },

  getFreestyleHistoryPage(): PageViewModel<FreestyleHistoryContent> {
    return {
      seo: {
        title: 'Freestyle History',
        description:
          'The evolution of competitive freestyle footbag: pioneers, eras, the ADD system, ' +
          'and the shift from North American origins to European dominance.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_history',
        title:      'Freestyle History',
        intro:      'Four decades of freestyle footbag: how the moves, the names, and the competitive sport took shape.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'History' },
        ],
      },
      content: {
        eras:          HISTORY_ERAS,
        pioneers:      HISTORY_PIONEERS,
        addSystem:     HISTORY_ADD_SYSTEM,
        regionalShift:
          'Early freestyle innovation was driven largely by North American players. From the mid-2000s ' +
          'onward the competitive center of gravity shifted toward Europe, both in performance and in ' +
          'participation density. Václav Klouda (Czech Republic) has accumulated 109 podium finishes: ' +
          'more than any other player in the dataset. Damian Gielnicki, Mariusz Wilk, Stefan Siegert, ' +
          'Honza Weber, and Andreas Nawrath form a European technical cluster whose work produced both ' +
          'the highest-ADD sequences on record and some of the most diverse trick vocabularies in the data.',
        modernEra:
          'Modern freestyle is a refined, recombinational sport. The trick grammar settled into recognizable ' +
          'form by the late 2000s; today\'s competitive edge sits in how the established vocabulary is ' +
          'sequenced, executed, and made musical. Within the existing palette, the space of meaningful ' +
          'combinations is enormous: players continue to find new arrangements, new transitions, and new ' +
          'expressive possibilities inside it. The question hasn\'t become "what trick is left to invent?" ' +
          'so much as "how cleanly, how creatively, and how consistently can this language be played?"',
        evolution: [
          {
            period: '1980s',
            label:  'Clipper & Mirage',
            summary: 'The foundational vocabulary: clipper-set tricks, mirage and its dex variants, the early whirl and butterfly motifs. Routines were judged on execution and creativity rather than a difficulty score.',
          },
          {
            period: 'Early 1990s',
            label:  'Paradox & Symposium',
            summary: 'Modifiers entered the formal vocabulary. Paradox, symposium, and the body-position grammar that lets the same base trick branch into many distinct named compounds.',
          },
          {
            period: 'Mid-1990s to 2000s',
            label:  'ADD & Modifier Stacking',
            summary: 'The ADD system named what players had been doing intuitively. Modifier stacking (paradox + symposium, ducking + paradox) made multi-modifier compounds the heart of competitive routines.',
          },
          {
            period: '2000s',
            label:  'Blurry & Fearless',
            summary: 'The blurry modifier reshaped the top of the difficulty curve, anchoring runs that pushed past 5 ADD. "Fearless" runs (every trick at 5 ADD or more) became the marker of a top-tier performance.',
          },
          {
            period: '2010s to present',
            label:  'Consistency & Execution',
            summary: 'New-trick invention slowed; competitive depth grew. The frontier moved from "what new structure exists?" to "how cleanly can the established vocabulary be performed under pressure?" Sequencing, transitions, and routine architecture became the differentiators.',
          },
        ],
        comboEvolution: [
          'In the earliest period of the sport, freestyle wasn\'t really about combos at all. Players showed individual tricks within an open-floor performance, with kicks and stalls strung loosely between them. A "combo" was something audiences and judges noticed when it happened: not yet a structural unit you built and named.',
          'Through the late 1980s and into the early 1990s, players began linking dexterity tricks intentionally. Two-trick chains became the working unit: a clipper-set dex into a body trick, or a mirage into a butterfly. The community started naming patterns rather than just patches of execution.',
          'The paradox-and-symposium era of the mid-1990s expanded what a single trick could carry (modifiers gave you a way to layer body positions onto a base), and that, in turn, gave linking new richness. A run could now move from one well-defined compound to another, instead of dropping back to a base trick between every difficulty spike.',
          'The 2000s were the blurry/fearless density era. The blurry modifier reshaped the top of the curve, and "fearless" runs (every trick at 5 ADD or higher) became the marker of a top-tier performance. The combo question shifted from "how many tricks?" to "how high a sustained density can you hold across a run?"',
          'Modern competitive freestyle reads as a flow-and-execution sport. Trick vocabulary settled years ago; the differentiators are sequencing, transitions, musicality, and consistency over a full routine\'s length. "Guiltless" (≥3 ADD per trick) and "fearless" (≥5 ADD per trick) are baseline expectations at the top tier rather than highlights. The art now is in how the established palette is played.',
        ],
        earlyRoutineEvolution: [
          'Early freestyle judging was about routines first. Players choreographed a run, set it to music or mood, and were judged on creativity, execution, and the energy a performance carried. Difficulty mattered, but as a felt quality the judges and audience read together: not yet as a number.',
          'The ADD system, formalized in the early 1990s, gave the community a shared scale for that felt quality. Routines didn\'t stop being creative; they got a second axis. Players could now talk about a run\'s difficulty independently of its choreography, and the run-quality vocabulary in the glossary (Tiltless, Guiltless, Tripless, Fearless, Beastly, Godly) emerged to describe routines by the floor of difficulty they sustained.',
          'Today the vocabulary still works on both axes. Creative routines remain a competition format and an art form. Alongside them, ADD-aware difficulty standards (guiltless or fearless throughout, transitions held under pressure) describe what serious competitive runs look like at the top. The two ways of judging haven\'t replaced each other: they share the same competitive culture.',
        ],
        // History-page visuals are reserved for archival imagery (BAP / Hall
        // of Fame photos and similar). Until those assets are curated, every
        // media slot here renders without media rather than borrowing from
        // landing-page video — the landing page already carries the modern
        // routine references, and duplicating them here was crowding the
        // historically-spread tone this page should carry.
        heroMedia: {
          media:   null,
          caption: '',
          placeholderNote:
            'Archival imagery, event photos, and historical routine footage from the 1980s–2000s ' +
            'are being curated separately. This slot will carry era-spanning visuals once that ' +
            'curation lands; for now the page tells the story in text and links to player profiles.',
        },
        pioneersMedia: {
          media:   null,
          caption: '',
          placeholderNote: 'Archival photos and event footage from the 1980s–1990s pioneers era are being curated. Player profile pages link to documented competition records in the meantime.',
        },
        modernEraMedia: null,
      },
    };
  },

  getFreestyleTricksIndexPage(
    family?: string,
    view?: string,
  ): PageViewModel<FreestyleTricksIndexContent> {
    // Active + pending external rows. Pending rows surface as labeled
    // placeholders; they never claim canonical status.
    const allRowsUnfiltered = runSqliteRead('freestyleTricks.listAllWithPending', () =>
      freestyleTricks.listAllWithPending.all() as FreestyleTrickRowWithStatus[],
    );

    // Apply optional family filter (driven by ?family= hashtag click).
    const activeFamily = family && allRowsUnfiltered.some(r => r.trick_family === family)
      ? family
      : null;
    const allRows = activeFamily
      ? allRowsUnfiltered.filter(r => r.trick_family === activeFamily)
      : allRowsUnfiltered;

    // Status lookup for shaping (drives isExternalOnly / statusBadge).
    const statusBySlug = new Map<string, { isActive: number; reviewStatus: string }>();
    for (const r of allRowsUnfiltered) {
      statusBySlug.set(r.slug, { isActive: r.is_active, reviewStatus: r.review_status });
    }

    // Aliases via the canonical table; one round trip, group by slug.
    const aliasRows = runSqliteRead('freestyleTrickAliases.listAll', () =>
      freestyleTrickAliases.listAll.all() as FreestyleTrickAliasRow[],
    );
    const aliasesByTrickSlug = new Map<string, string[]>();
    for (const ar of aliasRows) {
      const list = aliasesByTrickSlug.get(ar.trick_slug);
      if (list) list.push(ar.alias_text);
      else aliasesByTrickSlug.set(ar.trick_slug, [ar.alias_text]);
    }

    // Tier-aware media coverage. For each trick slug, classify by the
    // strongest source linked to it: tutorial > demo (records collapse
    // into demo for chip purposes; the trick-detail page differentiates).
    // Absent slugs → 'none' (handled at lookup site).
    const mediaCoverageRows = runSqliteRead('freestyleMediaLinks.listCoveredTrickSlugsWithSource', () =>
      freestyleMediaLinks.listCoveredTrickSlugsWithSource.all() as FreestyleMediaCoveredSourceRow[],
    );
    const mediaCoverageBySlug = new Map<string, TrickMediaCoverage>();
    for (const r of mediaCoverageRows) {
      const isTutorial = tierOf(r.source_id) === 'TUTORIAL';
      const current = mediaCoverageBySlug.get(r.slug);
      // 'tutorial' wins over 'demo'; once tutorial set, never downgrade.
      if (isTutorial) {
        mediaCoverageBySlug.set(r.slug, 'tutorial');
      } else if (current !== 'tutorial') {
        mediaCoverageBySlug.set(r.slug, 'demo');
      }
    }

    // Slugs with passback records (record-indicator on rows).
    const publicRows = runSqliteRead('freestyleRecords.listPublic', () =>
      freestyleRecords.listPublic.all() as FreestyleRecordRow[],
    );
    const slugsWithRecords = new Set(
      publicRows
        .filter(r => r.trick_name)
        .map(r => trickNameToSlug(r.trick_name!)),
    );

    // A freestyle record's own video_url is a third coverage lane, ranked below
    // curated tutorial/demo reference media: surface it only when no reference
    // media already covers the trick. A record's trick_name may slugify to an
    // alias (e.g. "2-Bag Juggle" -> 2-bag-juggle), so resolve it onto the
    // canonical trick the browse rows are keyed by, the way the detail page does.
    const aliasToCanonical = new Map(
      runSqliteRead('freestyleTrickAliases.listAllAliasSlugs', () =>
        freestyleTrickAliases.listAllAliasSlugs.all() as { alias_slug: string; trick_slug: string }[],
      ).map(a => [a.alias_slug, a.trick_slug] as [string, string]),
    );
    for (const r of publicRows) {
      if (!r.trick_name || !r.video_url || r.video_url.trim() === '') continue;
      const raw = trickNameToSlug(r.trick_name);
      const slug = aliasToCanonical.get(raw) ?? raw;
      if (slug && !mediaCoverageBySlug.has(slug)) {
        mediaCoverageBySlug.set(slug, 'record');
      }
    }

    // ADD-view formula derivation context (two-line row contract).
    // modifierLinksByTrickSlug: ordered modifier list per trick (for the
    // "mod(+bonus) + base(N)" line-2 ADD formula). addsBySlug: numeric ADD
    // by slug (base lookup + sum-verification). Both built from the same
    // listTricksByModifier query the By-modifier view uses.
    const addFormulaLinkRows = runSqliteRead('freestyleTrickModifiers.listTricksByModifier', () =>
      freestyleTrickModifiers.listTricksByModifier.all() as FreestyleTrickModifierLinkRow[],
    );
    const modifierLinksByTrickSlug = new Map<string, { slug: string; name: string; addBonus: number; addBonusRotational: number }[]>();
    for (const lr of addFormulaLinkRows) {
      const arr = modifierLinksByTrickSlug.get(lr.trick_slug) ?? [];
      if (!arr.some(m => m.slug === lr.modifier_slug)) {
        arr.push({ slug: lr.modifier_slug, name: lr.modifier_name, addBonus: lr.add_bonus, addBonusRotational: lr.add_bonus_rotational });
      }
      modifierLinksByTrickSlug.set(lr.trick_slug, arr);
    }
    const addsBySlug = new Map<string, number>();
    for (const r of allRowsUnfiltered) {
      const n = Number(r.adds);
      if (Number.isFinite(n)) addsBySlug.set(r.slug, n);
    }

    const ctx: TrickIndexShapingContext = {
      slugsWithRecords,
      aliasesByTrickSlug,
      mediaCoverageBySlug,
      statusBySlug,
      modifierLinksByTrickSlug,
      addsBySlug,
    };

    // Active rows only for category / family groupings (existing semantics:
    // pending rows belong only in the ADD view as placeholders).
    const activeRows = allRows.filter(r => r.is_active === 1);

    // Only `kind === 'trick'`
    // rows surface on the five trick-browse views. Modifiers, set operators,
    // catch surfaces, and pending-review rows are routed to their own homes
    // (operator board, /freestyle/sets, glossary §2). See
    // src/content/freestyleTrickKindOverrides.ts.
    const isTrickRow = (row: { slug: string }): boolean =>
      resolveTrickKind(row.slug) === 'trick';

    // ---- Category groups (?view=category) -----------------------------
    //
    // Each group emits a `cards: DictionaryTrickCard[]`
    // array alongside the legacy `tricks` shape. Cards sort ADD ascending,
    // then trick name alphabetical. Empty categories don't render. The
    // legacy spreadsheet table is retired in the template.
    const categoryOrder = ['dex', 'body', 'set', 'compound'];
    const grouped = new Map<string, FreestyleTrickRowWithStatus[]>();
    for (const row of activeRows) {
      if (!isTrickRow(row)) continue;
      const cat = row.category ?? 'other';
      const bucket = grouped.get(cat) ?? [];
      bucket.push(row);
      grouped.set(cat, bucket);
    }

    const sortCategoryRows = (rows: FreestyleTrickRowWithStatus[]): FreestyleTrickRowWithStatus[] =>
      rows.slice().sort((a, b) => {
        const an = parseAddNumeric(a.adds);
        const bn = parseAddNumeric(b.adds);
        const ai = an ?? Number.POSITIVE_INFINITY;
        const bi = bn ?? Number.POSITIVE_INFINITY;
        if (ai !== bi) return ai - bi;
        return a.canonical_name.localeCompare(b.canonical_name, undefined, { sensitivity: 'base' });
      });

    const buildCategoryGroup = (cat: string, rows: FreestyleTrickRowWithStatus[]): FreestyleTrickGroup => {
      const sorted = sortCategoryRows(rows);
      const indexRows = sorted.map(r => shapeTrickIndexRow(r, ctx));
      const cards = sorted.map((r, i) => shapeDictionaryTrickCard(r, indexRows[i]!, null, ctx));
      return {
        category: cat,
        label:    CATEGORY_LABELS[cat] ?? cat,
        tricks:   indexRows,
        cards,
        anchorId: `category-${cat}`,
      };
    };

    const groups: FreestyleTrickGroup[] = categoryOrder
      .filter(cat => grouped.has(cat))
      .map(cat => buildCategoryGroup(cat, grouped.get(cat) ?? []));
    for (const [cat, rows] of grouped.entries()) {
      if (!categoryOrder.includes(cat) && cat !== 'modifier') {
        groups.push(buildCategoryGroup(cat, rows));
      }
    }

    // ---- Family groups (preserved for ?view=family) -------------------
    //
    // Each group also emits a `cards: DictionaryTrickCard[]`
    // array using anchor-first ordering (the family base trick first when
    // present, then ADD ascending, then name alphabetical) and an optional
    // crossLink to a symbolic educational surface (e.g., butterfly family →
    // walking-family progression). The legacy `members` array is preserved
    // for backwards compatibility while other surfaces migrate.
    // Curator-authored family overrides
    // re-bucket specific rows out of their DB trick_family value. See
    // src/content/freestyleFamilyOverrides.ts. Returns the override target
    // when present, otherwise falls back to the row's DB trick_family.
    const familyOf = (row: FreestyleTrickRowWithStatus): string | null =>
      resolveFamilyOverride(row.slug) ?? row.trick_family;

    // Family-view bucketing is multi-membership-aware.
    // Resolution maps each raw label to the public family it renders under: the
    // 24 roster families resolve to themselves; sub-labels fold to the family
    // whose terminal they conserve; everything else (catch surfaces, modifier
    // ecosystems, sparse lineages) resolves to null and is skipped, so only the
    // 24 roster families enter the family view (later split by display tier into
    // Family-Parent sections plus a Minor-Lineage band). A derived branch is
    // contained in its parent root
    // (every torque member is also an osis member), so each membership expands
    // to include its ancestor root and the row appears in both sections.
    // No trick_family data is overwritten.
    const familyMap = new Map<string, FreestyleTrickRowWithStatus[]>();
    const addMembership = (families: string[], slug: string): void => {
      for (const f of familyWithAncestors(slug)) {
        if (!families.includes(f)) families.push(f);
      }
    };
    for (const row of activeRows) {
      if (!isTrickRow(row)) continue;
      const rawFamily = familyOf(row);
      const families: string[] = [];
      const primaryFamily = rawFamily ? resolveDisplayFamily(rawFamily) : null;
      if (primaryFamily) addMembership(families, primaryFamily);
      for (const extra of resolveFamilyDualMemberships(row.slug)) {
        const resolved = resolveDisplayFamily(extra);
        if (resolved) addMembership(families, resolved);
      }
      for (const fslug of families) {
        const bucket = familyMap.get(fslug) ?? [];
        bucket.push(row);
        familyMap.set(fslug, bucket);
      }
    }
    // Section ordering: the 24 public families, the 20 roots first then the 4
    // derived branches. Only these render; any label that is not a family
    // resolved to null above and never entered familyMap.
    const FAMILY_ORDER = PUBLIC_FAMILY_ORDER;

    // Map of family-slug → optional symbolic cross-link. Conservative: only
    // surfaces that have shipped pedagogy / progression pages get a link.
    const FAMILY_CROSS_LINKS: Record<string, { label: string; href: string } | undefined> = {
      butterfly: { label: 'Walking-family progression', href: '/freestyle/progression/walking-family' },
    };

    const sortFamilyEntries = (
      familySlug: string,
      entries: FreestyleTrickRowWithStatus[],
    ): FreestyleTrickRowWithStatus[] => {
      return entries.slice().sort((a, b) => {
        // Anchor first: the family base trick (slug === familySlug) ranks above all others.
        if (a.slug === familySlug && b.slug !== familySlug) return -1;
        if (b.slug === familySlug && a.slug !== familySlug) return 1;
        // Then ADD ascending; rows without numeric ADD sink to the bottom.
        const an = parseAddNumeric(a.adds);
        const bn = parseAddNumeric(b.adds);
        const ai = an ?? Number.POSITIVE_INFINITY;
        const bi = bn ?? Number.POSITIVE_INFINITY;
        if (ai !== bi) return ai - bi;
        // Then trick name alphabetical.
        return a.canonical_name.localeCompare(b.canonical_name, undefined, { sensitivity: 'base' });
      });
    };

    const buildFamilyGroup = (
      familySlug: string,
      rows: FreestyleTrickRowWithStatus[],
    ): FreestyleFamilyGroup => {
      const sorted = sortFamilyEntries(familySlug, rows);
      const members = sorted.map(r => shapeTrickIndexRow(r, ctx));
      // Pass the familySlug as the group anchor
      // so semantic tokens matching it carry isFamilyAnchor=true (solid
      // underline at render time).
      const cards   = sorted.map((r, i) => shapeDictionaryTrickCard(r, members[i]!, familySlug, ctx));
      // Display name resolution: the curated public-family label wins
      // (e.g. 'double-leg-over' → 'Double Legover'); then the curator override;
      // otherwise default capitalize.
      const familyName =
        PUBLIC_FAMILY_LABEL.get(familySlug)
        ?? resolveFamilyDisplayName(familySlug)
        ?? (familySlug.charAt(0).toUpperCase() + familySlug.slice(1));
      return {
        familySlug,
        familyName,
        members,
        cards,
        crossLink: FAMILY_CROSS_LINKS[familySlug] ?? null,
        sharedStructure: getFamilyInvariant(familySlug),
        branchParentName: PUBLIC_FAMILY_PARENT_LABEL.get(familySlug) ?? null,
      };
    };

    const familyGroups: FreestyleFamilyGroup[] = [];
    for (const fslug of FAMILY_ORDER) {
      const rows = familyMap.get(fslug);
      if (rows && rows.length > 1) {
        familyGroups.push(buildFamilyGroup(fslug, rows));
      }
    }

    // ---- ADD groups (the new beginner default view) -------------------
    // Modifiers are excluded; pending placeholders are included alongside
    // canonical tricks within the same ADD bucket. Empty / non-numeric ADD
    // lands in 'Unrated / unresolved'.
    //
    // Builds the dictionary-trick-card view-model alongside
    // the legacy `tricks` shape. The By ADD template branch renders the
    // `cards` array via the shared partial; other views remain on `tricks`.
    interface AddBucketEntry { row: FreestyleTrickRowWithStatus; indexRow: FreestyleTrickIndexRow; }
    const addBuckets = new Map<number | null, AddBucketEntry[]>();
    for (const row of allRows) {
      if (!isTrickRow(row)) continue;
      const numeric = parseAddNumeric(row.adds);
      const bucket = addBuckets.get(numeric) ?? [];
      bucket.push({ row, indexRow: shapeTrickIndexRow(row, ctx) });
      addBuckets.set(numeric, bucket);
    }
    const addGroups: FreestyleTrickAddGroup[] = [];
    const buildGroup = (
      addNumeric: number | null,
      addLabel: string,
      entries: AddBucketEntry[],
    ): FreestyleTrickAddGroup => {
      const sorted = entries.slice().sort((a, b) => byCanonicalNameAlpha(a.indexRow, b.indexRow));
      return {
        addNumeric,
        addLabel,
        anchorId: addNumeric != null ? `add-${addNumeric}` : 'add-unrated',
        tricks: sorted.map(e => e.indexRow),
        cards:  sorted.map(e => shapeDictionaryTrickCard(e.row, e.indexRow, null, ctx)),
      };
    };
    const numericKeys = [...addBuckets.keys()].filter((k): k is number => k !== null).sort((a, b) => a - b);
    for (const k of numericKeys) {
      addGroups.push(buildGroup(k, `${k} ADD`, addBuckets.get(k) ?? []));
    }
    if (addBuckets.has(null)) {
      addGroups.push(buildGroup(null, 'Unrated / unresolved', addBuckets.get(null) ?? []));
    }
    // ADD jump-nav chips: levels 1..6 individually, all 7-and-up collapsed into
    // one "7+ ADD" chip pointing at the first high-ADD section. Each chip jumps
    // to that ADD section's in-page anchor.
    const addJumpChips: { label: string; href: string }[] = [];
    for (let n = 1; n <= 6; n++) {
      const g = addGroups.find(grp => grp.addNumeric === n);
      if (g) addJumpChips.push({ label: `${n} ADD`, href: `#${g.anchorId}` });
    }
    const firstHighAdd = addGroups
      .filter(grp => grp.addNumeric != null && (grp.addNumeric as number) >= 7)
      .sort((a, b) => (a.addNumeric as number) - (b.addNumeric as number))[0];
    if (firstHighAdd) addJumpChips.push({ label: '7+ ADD', href: `#${firstHighAdd.anchorId}` });

    // Trick count drives the totalTricks view-model field (used for
    // view-model completeness; never surfaced as a lead stat).
    const canonicalCount = allRows.filter(
      r => r.is_active === 1 && isTrickRow(r),
    ).length;

    // The documented-name universe splits into unique tricks and the alias /
    // duplicate-variant names that resolve to an already-counted trick. Both
    // alias-class buckets are name-level duplicates of an existing structure.
    const documentedAliasCount =
      OBSERVATIONAL_UNIVERSE_STATS.intakeBuckets.alias.names +
      OBSERVATIONAL_UNIVERSE_STATS.intakeBuckets.duplicate_variant.names;
    const uniqueDocumentedTrickCount =
      OBSERVATIONAL_UNIVERSE_STATS.universeTotal - documentedAliasCount;

    // ---- View toggle --------------------------------------------------
    const allowedViews: FreestyleTricksActiveView[] = ['add', 'family', 'category', 'sets', 'component', 'topology', 'movement-system', 'dex-count'];
    const requestedView = (view ?? 'add') as FreestyleTricksActiveView;
    // ?view=sets activates the dedicated By Set browse
    // mode; the soft-retired component view keeps resolving for inbound
    // legacy links.
    const resolvedView: FreestyleTricksActiveView = allowedViews.includes(requestedView)
      ? requestedView
      : 'add';
    const activeView = resolvedView;

    // ---- Dex-count groups (?view=dex-count) ---------------------------
    // Bucket active dictionary tricks by the number of [DEX] tokens in
    // their operational_notation. Tricks without op_notation fall into
    // a separate "Unknown" bucket. The four-tier ladder (0 / 1 / 2 / 3+)
    // matches the dex-count distribution observed in the canonical DB:
    // most named tricks fall in 1- or 2-dex; 3+ is the deep-compound tail.
    const countDexEvents = (row: FreestyleTrickRowWithStatus): number | null => {
      const opNotation = row.operational_notation;
      if (!opNotation) return isDexlessBodyAtom(row) ? 0 : null;
      const matches = opNotation.match(/\[DEX\]/g);
      return matches ? matches.length : 0;
    };
    const dexBuckets = new Map<number | null, AddBucketEntry[]>();
    for (const row of allRows) {
      if (!isTrickRow(row)) continue;
      if (row.is_active !== 1) continue;
      const raw = countDexEvents(row);
      // Bucket 3 and 4+ together for the "3+ dex events" label.
      const bucketKey: number | null = raw === null ? null : raw >= 3 ? 3 : raw;
      const bucket = dexBuckets.get(bucketKey) ?? [];
      bucket.push({ row, indexRow: shapeTrickIndexRow(row, ctx) });
      dexBuckets.set(bucketKey, bucket);
    }
    const dexCountGroups: FreestyleTrickDexCountGroup[] = [];
    const buildDexGroup = (
      dexCount: number | null,
      dexLabel: string,
      entries: AddBucketEntry[],
    ): FreestyleTrickDexCountGroup => {
      const sorted = entries.slice().sort((a, b) => byCanonicalNameAlpha(a.indexRow, b.indexRow));
      const bucketId = dexCount === null ? 'dex-unknown' : `dex-${dexCount}`;
      return {
        dexCount,
        dexLabel,
        bucketId,
        cards: sorted.map(e => shapeDictionaryTrickCard(e.row, e.indexRow, null, ctx)),
      };
    };
    const dexNumericKeys = [...dexBuckets.keys()].filter((k): k is number => k !== null).sort((a, b) => a - b);
    for (const k of dexNumericKeys) {
      const label =
        k === 0 ? '0 dex events' :
        k === 1 ? '1 dex event' :
        k === 2 ? '2 dex events' :
        '3+ dex events';
      dexCountGroups.push(buildDexGroup(k, label, dexBuckets.get(k) ?? []));
    }
    if (dexBuckets.has(null)) {
      dexCountGroups.push(buildDexGroup(null, 'Unknown / no notation', dexBuckets.get(null) ?? []));
    }

    // Load modifier reference table (still shaped; rendering currently disabled)
    const modifierRows = runSqliteRead('freestyleTrickModifiers.listAll', () =>
      freestyleTrickModifiers.listAll.all() as FreestyleTrickModifierRow[],
    );
    const modifiers = modifierRows.map(shapeModifierEntry);

    // ---- Set groups (?view=sets projection) ---------------------------
    // Group active dictionary tricks by which modifier(s) they use via the
    // freestyle_trick_modifier_links table. Each modifier becomes a section;
    // tricks within a section are alphabetical. Modifiers with zero matched
    // tricks are skipped (table-driven, not enumerated). Sets-type
    // modifiers are surfaced before body-type modifiers via the SQL ORDER BY.
    const allActiveTrickRowsForSets = allRows.filter(r => r.is_active === 1);
    const allActiveTrickRowsBySlug = new Map<string, FreestyleTrickRowWithStatus>();
    for (const r of allActiveTrickRowsForSets) allActiveTrickRowsBySlug.set(r.slug, r);

    const linkRows = runSqliteRead('freestyleTrickModifiers.listTricksByModifier', () =>
      freestyleTrickModifiers.listTricksByModifier.all() as FreestyleTrickModifierLinkRow[],
    );
    const setGroupAccumulator = new Map<string, {
      modifierSlug: string;
      modifierName: string;
      modifierType: string;
      addBonus: number;
      addBonusRotational: number;
      tricks: FreestyleTrickRowWithStatus[];
    }>();
    for (const lr of linkRows) {
      // Only include tricks that survive the activeFamily filter applied earlier
      // and that exist in the active set (modifier-category rows excluded).
      const trickRow = allActiveTrickRowsBySlug.get(lr.trick_slug);
      if (!trickRow) continue;
      let bucket = setGroupAccumulator.get(lr.modifier_slug);
      if (!bucket) {
        bucket = {
          modifierSlug: lr.modifier_slug,
          modifierName: lr.modifier_name,
          modifierType: lr.modifier_type,
          addBonus: lr.add_bonus,
          addBonusRotational: lr.add_bonus_rotational,
          tricks: [],
        };
        setGroupAccumulator.set(lr.modifier_slug, bucket);
      }
      // Avoid duplicate tricks within a bucket when a modifier appears at
      // multiple apply_orders for the same trick.
      if (!bucket.tricks.some(t => t.slug === trickRow.slug)) {
        bucket.tricks.push(trickRow);
      }
    }
    const setGroups: FreestyleSetGroup[] = [...setGroupAccumulator.values()].map(b => {
      // Sort tricks by ADD ascending then slug alphabetical for stable
      // section ordering. Shape both views: indexRow (intermediate) +
      // DictionaryTrickCard (the partial's view-model) so the cards
      // surface the full standardized JOB block + linked title + ADD chip
      // + media chip, consistent with by-ADD / by-family / by-movement-
      // system views.
      const sorted = [...b.tricks].sort((x, y) => {
        const ax = Number(x.adds ?? Number.POSITIVE_INFINITY);
        const ay = Number(y.adds ?? Number.POSITIVE_INFINITY);
        return ax - ay || x.slug.localeCompare(y.slug);
      });
      const indexRows = sorted.map(r => shapeTrickIndexRow(r, ctx));
      const cards     = sorted.map((r, i) => shapeDictionaryTrickCard(r, indexRows[i]!, null, ctx));
      return {
        modifierSlug: b.modifierSlug,
        modifierName: b.modifierName,
        modifierType: b.modifierType,
        addBonus: b.addBonus,
        addBonusRotational: b.addBonusRotational,
        cards,
        trickCount: sorted.length,
      };
    });

    // ---- Set Hub view (?view=sets) -------------------------------------
    // Sets are first-class
    // ontology objects; cards group by subtype (true-core / composite-derived
    // / rotational / whirl-swirl / uns / rooted-antisymposium). Alt-surfaces
    // are NOT here — they live on ?view=movement-system. Per-set detail
    // pages live at /freestyle/sets/<slug>.
    const sourceLabels: Record<CanonicalSetSourceKey, string> = {
      'canonical':        'Canonical',
      'platform-tracked': 'Platform-tracked',
      'holden-only':      'Holden-only',
    };
    const auditLabels: Record<CanonicalSetAuditKey, string> = {
      'aligned':     'Aligned with Holden',
      'partial':     'Partial: framing differs',
      'conflict':    'Documented disagreement',
      'holden-only': 'Holden-cited only',
    };
    const shapeSetCard = (s: typeof CANONICAL_SETS[number]): CanonicalSetCard => ({
      slug:                s.slug,
      hashtag:             s.hashtag,
      displayName:         s.displayName,
      formula:             s.formula,
      movementExplanation: s.movementExplanation,
      equivalenceReadings: s.equivalenceNotes.map(n => `${n.reading}: ${n.citation}`),
      source:              s.source,
      sourceLabel:         sourceLabels[s.source],
      sourceCitation:      s.sourceCitation,
      auditStatus:         s.auditStatus,
      auditStatusLabel:    s.auditStatus ? auditLabels[s.auditStatus] : undefined,
      derivedSystems:      s.derivedSystems.map(r => ({
        slug:  r.slug,
        label: r.label,
        href:  `#set-${r.slug}`,
      })),
      relatedSystems:      s.relatedSystems.map(r => ({
        slug:  r.slug,
        label: r.label,
        href:  `#set-${r.slug}`,
      })),
      detailHref:          `/freestyle/sets/${s.slug}`,
      showDetailLink:      true,
    });
    const subtypeSections: SetSubtypeSection[] = SET_SUBTYPE_SPECS.map(spec => {
      const cards = CANONICAL_SETS.filter(s => s.subtype === spec.key).map(shapeSetCard);
      return {
        key:   spec.key,
        label: spec.label,
        intro: spec.intro,
        count: cards.length,
        cards,
      };
    }).filter(section => section.count > 0);

    const altSurfacesCrossLink: AltSurfacesCrossLink = {
      heading: 'Looking for alternate surfaces?',
      framing:
        'Surface mechanics (sole, heel, cloud, knee, head, neck, shoulder, forehead, ' +
        'and flying entries) are a distinct ontology layer from sets. They live as a ' +
        'first-class section on the Movement Systems view.',
      movementSystemHref: '/freestyle/tricks?view=movement-system',
      ctaLabel:           'View alternative surfaces on Movement Systems',
    };

    const setsBrowseView: FreestyleSetsBrowseView = {
      intro:
        'Sets are first-class compositional vocabulary: the named movement primitives that ' +
        'open a trick. Each card is a set ontology object: hashtag, formula, movement ' +
        'explanation, equivalence notes, derived and related systems, and source ' +
        'provenance; each card links to its own set detail page. For the body-modifier ' +
        'vocabulary (paradox, spinning, ducking, symposium, etc.), see the Operators & ' +
        'Modifiers reference page.',
      totalSets:            subtypeSections.reduce((n, s) => n + s.count, 0),
      subtypeSections,
      altSurfacesCrossLink,
    };

    // ---- Component view (?view=component projection) --------------------
    // Body + set modifier axes only. Within each axis, groups render in priority order
    // (curator-tagged); remaining groups follow alphabetical. Within each
    // group, cards sort ADD ascending, then trick name alphabetical.
    // Empty groups are hidden.

    const BODY_PRIORITY = ['paradox', 'symposium', 'spinning', 'ducking', 'diving', 'weaving', 'gyro', 'stepping'];
    const SET_PRIORITY  = ['pixie', 'atomic', 'quantum', 'nuclear', 'fairy', 'furious'];

    // One-line body-mechanics definitions for the priority modifiers. Curator-authored;
    // a future slice may expand this map to additional modifiers.
    const COMPONENT_DEFINITIONS: Record<string, string> = {
      paradox:   'A hip pivot between two dexes on the same set: the body changes sides without changing the set foot.',
      symposium: 'A no-plant body discipline: the support leg stays off the ground during the dex.',
      spinning:  'A full-body 360° rotation carried through the dex moment.',
      ducking:   'A head dip that lets the bag pass around the neck; head moves toward the bag, bag falls opposite.',
      diving:    'A head arc (over and under the bag) with the bag falling to the same side.',
      weaving:   'Head moves toward the bag, bag falls to the same side.',
      gyro:      'A half-body 180° rotation carried through the dex moment.',
      whirling:  'A body rotation through the dex moment, distinct from spinning by tempo and direction (whirling + osis = blender per Red consult).',
      stepping:  'A foot relocation during uptime that compresses or lengthens the set.',
      pixie:     'A compressed pre-base uptime set; tighter motion than stepping.',
      atomic:    'A cross-body uptime set with x-dex character.',
      quantum:   'The compressed form of atomic: a tighter uptime treatment.',
      nuclear:   'A +2 set modifier; structurally paradox + illusion.',
      fairy:     'A pre-base uptime set treatment closely related to pixie.',
      furious:   'A +2 set modifier with a heavier uptime treatment.',
    };

    const componentSortByAddThenName = (
      a: { row: FreestyleTrickRow; indexRow: FreestyleTrickIndexRow },
      b: { row: FreestyleTrickRow; indexRow: FreestyleTrickIndexRow },
    ): number => {
      const an = parseAddNumeric(a.row.adds);
      const bn = parseAddNumeric(b.row.adds);
      const ai = an ?? Number.POSITIVE_INFINITY;
      const bi = bn ?? Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return a.row.canonical_name.localeCompare(b.row.canonical_name, undefined, { sensitivity: 'base' });
    };

    interface ComponentBucket {
      modifierSlug: string;
      modifierName: string;
      modifierType: string;
      entries:      { row: FreestyleTrickRowWithStatus; indexRow: FreestyleTrickIndexRow }[];
    }

    const componentAccumulator = new Map<string, ComponentBucket>();
    const allActiveByStatus = new Map<string, FreestyleTrickRowWithStatus>();
    for (const r of activeRows) allActiveByStatus.set(r.slug, r);
    for (const lr of linkRows) {
      const row = allActiveByStatus.get(lr.trick_slug);
      if (!row) continue;
      // Only true tricks appear in the
      // component view. Modifiers / operators / surfaces are routed elsewhere.
      if (!isTrickRow(row)) continue;
      // Only body + set axes here.
      if (lr.modifier_type !== 'body' && lr.modifier_type !== 'set') continue;
      let bucket = componentAccumulator.get(lr.modifier_slug);
      if (!bucket) {
        bucket = {
          modifierSlug: lr.modifier_slug,
          modifierName: lr.modifier_name,
          modifierType: lr.modifier_type,
          entries:      [],
        };
        componentAccumulator.set(lr.modifier_slug, bucket);
      }
      if (!bucket.entries.some(e => e.row.slug === row.slug)) {
        bucket.entries.push({ row, indexRow: shapeTrickIndexRow(row, ctx) });
      }
    }

    const buildComponentGroup = (bucket: ComponentBucket): ComponentGroup => {
      const sorted = bucket.entries.slice().sort(componentSortByAddThenName);
      // Pass the modifier-slug as the group anchor
      // so the shared component token underlines on browse-density render.
      return {
        componentSlug:  bucket.modifierSlug,
        componentName:  bucket.modifierName,
        bodyDefinition: COMPONENT_DEFINITIONS[bucket.modifierSlug] ?? null,
        memberCount:    sorted.length,
        anchorId:       `component-${bucket.modifierSlug}`,
        cards:          sorted.map(e => shapeDictionaryTrickCard(e.row, e.indexRow, bucket.modifierSlug, ctx)),
      };
    };

    const orderByPriorityThenAlpha = (
      buckets: ComponentBucket[],
      priority: string[],
    ): ComponentGroup[] => {
      const ordered: ComponentGroup[] = [];
      const claimed = new Set<string>();
      for (const slug of priority) {
        const bucket = buckets.find(b => b.modifierSlug === slug);
        if (bucket && bucket.entries.length > 0) {
          ordered.push(buildComponentGroup(bucket));
          claimed.add(slug);
        }
      }
      const remaining = buckets
        .filter(b => !claimed.has(b.modifierSlug) && b.entries.length > 0)
        .sort((a, b) => a.modifierName.localeCompare(b.modifierName, undefined, { sensitivity: 'base' }));
      for (const bucket of remaining) ordered.push(buildComponentGroup(bucket));
      return ordered;
    };

    const bodyBuckets = [...componentAccumulator.values()].filter(b => b.modifierType === 'body');
    const setBuckets  = [...componentAccumulator.values()].filter(b => b.modifierType === 'set');

    // ---- Topology view (?view=topology projection) ----------------------
    // Six pedagogically-grounded educational groups. TOPOLOGY_GROUPS +
    // HIPPY_BASES / LEGGY_BASES / CLIPPER_LANDING_BASES live at module scope
    // so the trick-detail page can reuse the same defs.

    const trickHasModifierLinkInAccumulator = (slug: string, modifierSlug: string): boolean => {
      const bucket = componentAccumulator.get(modifierSlug);
      if (!bucket) return false;
      return bucket.entries.some(e => e.row.slug === slug);
    };

    const buildTopologyGroup = (def: TopologyGroupDef): TopologyGroup => {
      const matched = activeRows
        .filter(r => isTrickRow(r)
                  && def.matches(r, mod => trickHasModifierLinkInAccumulator(r.slug, mod)))
        .sort((a, b) => {
          const an = parseAddNumeric(a.adds);
          const bn = parseAddNumeric(b.adds);
          const ai = an ?? Number.POSITIVE_INFINITY;
          const bi = bn ?? Number.POSITIVE_INFINITY;
          if (ai !== bi) return ai - bi;
          return a.canonical_name.localeCompare(b.canonical_name, undefined, { sensitivity: 'base' });
        });
      const indexRows = matched.map(r => shapeTrickIndexRow(r, ctx));
      // Pass the topology-slug as the group anchor.
      // Template renders dotted-underline emphasis on topology surfaces
      // (observational, not canonical) via ancestor-class selector.
      return {
        topologySlug:   def.slug,
        topologyName:   def.name,
        bodyDefinition: def.definition,
        memberCount:    matched.length,
        anchorId:       `topology-${def.slug}`,
        cards:          matched.map((r, i) => shapeDictionaryTrickCard(r, indexRows[i]!, def.slug, ctx)),
      };
    };

    const topologyView: TopologyBrowseView = {
      layerSource:       'observational',
      observationalNote:
        'Movement Neighborhoods group tricks that share a movement feel, timing pattern, or structural relationship across families. Six neighborhoods are recognized: Hippy downtime dex, Leggy dex, Whirl / swirl structures, Pixie uptime dex, Symposium clipper structures, and Ducking clipper structures. They are a way to explore similarity, not an official family classification. The family view remains the structural reference.',
      groups: TOPOLOGY_GROUPS
        .map(buildTopologyGroup)
        .filter(g => g.memberCount > 0),
    };

    const componentView: ComponentBrowseView = {
      duplicationNote:
        'Compounds appear in every component group they belong to. A trick with paradox AND spinning shows up under both: the duplication is intentional, since each grouping is a separate browse path.',
      axes: [
        {
          axisKey:   'body',
          axisLabel: 'Body modifiers',
          anchorId:  'axis-body',
          groups:    orderByPriorityThenAlpha(bodyBuckets, BODY_PRIORITY),
        },
        {
          axisKey:   'set',
          axisLabel: 'Set modifiers',
          anchorId:  'axis-set',
          groups:    orderByPriorityThenAlpha(setBuckets, SET_PRIORITY),
        },
      ],
    };

    // ---- Movement System view (content-module-driven) ----
    // Re-buckets the existing componentAccumulator under four curator-authored
    // pedagogical axes. Axes are walked in declaration order; modifier groups
    // within an axis follow the order of axis.modifierSlugs (curator-meaningful).
    // Axes with zero non-empty groups are pruned to avoid empty section
    // headings.

    const buildMovementSystemGroup = (modifierSlug: string): MovementSystemGroup | null => {
      const bucket = componentAccumulator.get(modifierSlug);
      if (!bucket || bucket.entries.length === 0) return null;
      const sorted = bucket.entries.slice().sort(componentSortByAddThenName);
      return {
        modifierSlug:   bucket.modifierSlug,
        modifierName:   bucket.modifierName,
        bodyDefinition: COMPONENT_DEFINITIONS[bucket.modifierSlug] ?? null,
        compositionGloss: resolveModifierCompositionGloss(bucket.modifierSlug),
        memberCount:    sorted.length,
        anchorId:       `movement-${bucket.modifierSlug}`,
        cards:          sorted.map(e => shapeDictionaryTrickCard(e.row, e.indexRow, bucket.modifierSlug, ctx)),
      };
    };

    // Build the alternative-surfaces subsection (compact educational
    // clusters; rendered after the 4 axes). Each group's trick list is
    // filtered to canonical-DB active rows so missing slugs degrade
    // gracefully (the content module is curator-paced; new alt-surface
    // canonical rows added later just appear once their row is active).
    const alternativeSurfaceGroups: AlternativeSurfaceGroupView[] =
      ALTERNATIVE_SURFACES.groups.map(group => {
        const tricks: AlternativeSurfaceTrickView[] = group.tricks
          .map(slug => allActiveTrickRowsBySlug.get(slug))
          .filter((row): row is FreestyleTrickRowWithStatus => row !== undefined)
          .map(row => ({
            slug:                row.slug,
            displayName:         row.canonical_name,
            href:                `/freestyle/tricks/${row.slug}`,
            adds:                row.adds ?? null,
            addsLabel:           row.adds ? `${row.adds} ADD` : '? ADD',
            operationalNotation: row.operational_notation ?? '',
          }));
        return {
          slug:   `alt-surface-${group.slug}`,
          label:  group.label,
          note:   group.note,
          tricks,
        };
      }).filter(g => g.tricks.length > 0);

    const movementSystemView: MovementSystemBrowseView = {
      observationalNote:
        'Four axes for navigating the freestyle movement language: how the set initiates ' +
        '(Set / Uptime), how the body enters (Entry Topologies), what the body does during the dex ' +
        '(Midtime Body), and discipline around plant and landing (No-Plant & Suspension). ' +
        'Each axis groups tricks by the modifiers they carry. Compounds may appear under multiple ' +
        'modifier headings within an axis; this is intentional.',
      axes: MOVEMENT_SYSTEM_AXES
        .map(axis => ({
          axisKey:        axis.axisKey,
          axisName:       axis.axisName,
          axisDefinition: axis.axisDefinition,
          anchorId:       `movement-axis-${axis.axisKey}`,
          groups:         axis.modifierSlugs
            .map(slug => buildMovementSystemGroup(slug))
            .filter((g): g is MovementSystemGroup => g !== null),
        }))
        .filter(a => a.groups.length > 0),
      alternativeSurfaces: {
        intro:  ALTERNATIVE_SURFACES.intro,
        groups: alternativeSurfaceGroups,
      },
    };

    // Cross-link block: when the dictionary is filtered to one family, surface
    // the modifiers used by tricks in that family as deep-links into the sets
    // projection. The accumulator is already family-scoped (allRows was
    // filtered by activeFamily upstream), so a non-empty bucket means at least
    // one in-family trick links to that modifier.
    const relatedSetGroups: FreestyleRelatedSetLink[] = activeFamily
      ? [...setGroupAccumulator.values()].map(b => ({
          modifierSlug: b.modifierSlug,
          modifierName: b.modifierName,
          modifierType: b.modifierType,
          count:        b.tricks.length,
          href:         `/freestyle/tricks?view=sets#set-${b.modifierSlug}`,
        }))
      : [];

    // Landing grid — 3-band conceptual grid for the
    // /freestyle/tricks landing surface. Bands: Difficulty / Structure /
    // Tracking & Expansion. Count governance:
    // each card's count = buckets / groups, NOT trick rows (since the same
    // trick appears in multiple axes — would mislead).
    const dexChipLabel = (dexCount: number | null): string =>
      dexCount === null ? 'Unknown'
      : dexCount === 0  ? '0 dex'
      : dexCount === 1  ? '1 dex'
      : dexCount === 2  ? '2 dex'
      : '3+ dex';
    const axisChipLabel = (axisKey: string, axisName: string): string => {
      switch (axisKey) {
        case 'set-uptime':          return 'Set/Uptime';
        case 'entry-topology':      return 'Entry';
        case 'midtime-body':        return 'Midtime Body';
        case 'no-plant-suspension': return 'No-Plant';
        default:                    return axisName;
      }
    };
    const fmtCount = (n: number): string => n.toLocaleString('en-US');

    // Public-family hit counts (curated 23-family browse layer): active-trick
    // count per raw trick_family, for the By-family jump menu.
    const familyTrickCounts = new Map<string, number>();
    for (const r of activeRows) {
      if (!isTrickRow(r)) continue;
      const f = (r.trick_family ?? '').trim();
      if (f) familyTrickCounts.set(f, (familyTrickCounts.get(f) ?? 0) + 1);
    }

    // Display tier (current editorial standard, reversible): split the rendered
    // family groups into first-class Family Parents and a compact Minor-Lineage
    // band. Derived live from the descendant count above; trick_family data is
    // untouched. Branch families inherit their root's tier presentation but the
    // count decides each one independently.
    const familyParentGroups = familyGroups.filter(
      g => familyTier(g.familySlug) === 'family-parent',
    );
    const minorLineages: FreestyleMinorLineage[] = familyGroups
      .filter(g => familyTier(g.familySlug) === 'minor-lineage')
      .map(g => ({
        slug:  g.familySlug,
        name:  g.familyName,
        count: FAMILY_DESCENDANT_COUNTS.get(g.familySlug) ?? g.cards.length,
        href:  `/freestyle/tricks?family=${g.familySlug}`,
      }));
    const familyParentRoster = PUBLIC_DISPLAY_FAMILIES.filter(
      f => familyTier(f.slug) === 'family-parent',
    );

    // Family-view jump index: anchor chips for the first-class family sections,
    // split into root vs derived-branch (branchParentName != null) so a reader
    // can skip directly to a family without scrolling. Derived from the already
    // rendered familyParentGroups; the minor-lineages band gets a single entry.
    const familyJumpChip = (g: FreestyleFamilyGroup): FreestyleFamilyJumpChip => ({
      slug: g.familySlug,
      name: g.familyName,
      count: g.cards.length,
      anchor: `#family-${g.familySlug}`,
    });
    const familyJumpIndex: FreestyleFamilyJumpIndex = {
      roots: familyParentGroups.filter(g => g.branchParentName === null).map(familyJumpChip),
      branches: familyParentGroups.filter(g => g.branchParentName !== null).map(familyJumpChip),
      hasMinorLineages: minorLineages.length > 0,
    };

    // Modifier clusters (organizational UX): bucket the active modifier setGroups
    // into curated higher-level clusters for the By-modifier jump menu + the
    // grouped sets page. Reversible content map; modifiers not listed in a
    // cluster fall through to 'other'; empty clusters are dropped.
    const setsClusterView: SetsClusterView[] = MODIFIER_CLUSTERS
      .map(c => ({
        key:    c.key,
        label:  c.label,
        blurb:  c.blurb,
        groups: setGroups.filter(g => clusterForModifier(g.modifierSlug) === c.key),
      }))
      .filter(c => c.groups.length > 0);
    const landingGrid: DictionaryLandingGrid = {
      bands: [
        {
          eyebrow: 'DIFFICULTY',
          cards: [
            {
              label:        'By ADD',
              href:         '/freestyle/tricks?view=add',
              count:        addGroups.length,
              countDisplay: fmtCount(addGroups.length),
              countSuffix:  'ADD buckets',
              lensQuestion: 'How layered is the trick?',
              chips:        addGroups.map(g => ({ label: g.addLabel, href: `/freestyle/tricks?view=add#${g.anchorId}`, count: g.tricks.length })),
            },
            {
              label:        'By dex count',
              href:         '/freestyle/tricks?view=dex-count',
              count:        dexCountGroups.length,
              countDisplay: fmtCount(dexCountGroups.length),
              countSuffix:  'dex buckets',
              lensQuestion: 'How many dexterity moves does it have?',
              chips:        dexCountGroups.map(g => ({ label: dexChipLabel(g.dexCount), href: `/freestyle/tricks?view=dex-count#${g.bucketId}`, count: g.cards.length })),
            },
          ],
        },
        {
          eyebrow: 'STRUCTURE',
          cards: [
            {
              label:        'By family',
              href:         '/freestyle/tricks?view=family',
              // First-class Family Parents (current editorial standard). Minor
              // lineages render in their own band inside the By-family view;
              // every family stays reachable via ?family={slug} either way.
              count:        familyParentRoster.length,
              countDisplay: fmtCount(familyParentRoster.length),
              countSuffix:  'families',
              lensQuestion: 'What core movement pattern does the trick build on?',
              chips:        familyParentRoster.map(f => ({ label: f.label, href: `/freestyle/tricks?family=${f.slug}`, count: familyTrickCounts.get(f.slug) ?? 0 })),
            },
            {
              label:        'By modifier',
              href:         '/freestyle/tricks?view=sets',
              // Grouped into higher-level clusters (organizational UX; individual
              // modifiers nest under each on the page). Broad operator/ingredient
              // lens, NOT an entry-only taxonomy.
              count:        setsClusterView.length,
              countDisplay: fmtCount(setsClusterView.length),
              countSuffix:  'modifier groups',
              lensQuestion: 'Which named moves, sets, or twists does it use?',
              chips:        setsClusterView.map(c => ({ label: c.label, href: `/freestyle/tricks?view=sets#cluster-${c.key}`, count: c.groups.reduce((n, g) => n + g.cards.length, 0) })),
              crossLink:    { label: 'For set systems as first-class objects, see Set Encyclopedia →', href: '/freestyle/sets' },
            },
            {
              label:        'By movement system',
              href:         '/freestyle/tricks?view=movement-system',
              count:        MOVEMENT_SYSTEM_AXES.length,
              countDisplay: fmtCount(MOVEMENT_SYSTEM_AXES.length),
              // The four primary compositional axes PLUS a separately-modeled
              // Alternative Surfaces grouping (parallel layer, not a fifth axis).
              countSuffix:  'axes + surfaces',
              lensQuestion: 'Which broad movement style does it belong to?',
              chips:        [
                ...movementSystemView.axes.map(a => ({ label: axisChipLabel(a.axisKey, a.axisName), href: `/freestyle/tricks?view=movement-system#${a.anchorId}`, count: a.groups.reduce((n, g) => n + g.cards.length, 0) })),
                { label: 'Alternative Surfaces', href: '/freestyle/tricks?view=movement-system#alt-surfaces', count: movementSystemView.alternativeSurfaces.groups.reduce((n, g) => n + g.tricks.length, 0) },
              ],
              crossLink:    { label: 'For modifier vocabulary, see Operators & Modifiers →', href: '/freestyle/operators' },
            },
            {
              label:        'Movement Neighborhoods',
              href:         '/freestyle/tricks?view=topology',
              count:        topologyView.groups.length,
              countDisplay: fmtCount(topologyView.groups.length),
              countSuffix:  'neighborhoods',
              lensQuestion: 'Tricks that move alike, even across different families.',
              chips:        topologyView.groups.map(g => ({ label: g.topologyName, href: `/freestyle/tricks?view=topology#${g.anchorId}`, count: g.memberCount })),
              crossLink:    { label: 'Compare to By family for the official grouping.', href: '/freestyle/tricks?view=family' },
            },
          ],
        },
        {
          eyebrow: 'TRACKING & EXPANSION',
          cards: [
            {
              label:        'Emerging vocabulary',
              href:         '/freestyle/observational',
              count:        OBSERVATIONAL_UNIVERSE_STATS.total,
              countDisplay: fmtCount(OBSERVATIONAL_UNIVERSE_STATS.total),
              countSuffix:  'unconfirmed names',
              lensQuestion: 'Names the community is still confirming, not separate tricks yet.',
              chips:        ['PassBack', 'Footbag.org', 'FootbagMoves', 'Stanford'].map(s => ({ label: s, href: '/freestyle/observational', count: null })),
            },
          ],
        },
      ],
    };

    // Per-view scale sentences. Counts are derived from the SAME group arrays
    // the templates render, so they always match the visible sections/cards.
    const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

    const familyMemberships = familyGroups.reduce((n, g) => n + g.cards.length, 0);
    const familyDistinct = new Set(familyGroups.flatMap(g => g.cards.map(c => c.slug))).size;
    const familyScale =
      `${familyGroups.length} family ${plural(familyGroups.length, 'grouping', 'groupings')} organize tricks by ` +
      'structural anchor; some are fine-grained and may later roll into broader family hierarchies. ' +
      `${familyMemberships} trick-row ${plural(familyMemberships, 'membership', 'memberships')} shown` +
      (familyMemberships > familyDistinct ? ', and some tricks belong to more than one family.' : '.');

    const dexRows = dexCountGroups.reduce((n, g) => n + g.cards.length, 0);
    const dexCountScale =
      `${dexCountGroups.length} dex ${plural(dexCountGroups.length, 'bucket', 'buckets')} · ` +
      `${dexRows} canonical trick ${plural(dexRows, 'row', 'rows')} represented.`;

    const movementMemberships = movementSystemView.axes.reduce(
      (n, a) => n + a.groups.reduce((m, g) => m + g.cards.length, 0), 0);
    const movementSystemScale =
      `${movementSystemView.axes.length} ${plural(movementSystemView.axes.length, 'system / axis', 'systems / axes')} · ` +
      `${movementMemberships} trick-row ${plural(movementMemberships, 'membership', 'memberships')} shown, ` +
      'plus a separately-grouped Alternative Surfaces layer below the axes. ' +
      'A compound can appear under more than one axis or modifier.';

    const setsMemberships = setGroups.reduce((n, g) => n + g.cards.length, 0);
    const setsScale =
      `${setGroups.length} ${plural(setGroups.length, 'modifier', 'modifiers')} · ` +
      `${setsMemberships} trick-row ${plural(setsMemberships, 'membership', 'memberships')} shown. ` +
      'A trick that uses more than one modifier appears under each.';

    const topologyMemberships = topologyView.groups.reduce((n, g) => n + g.cards.length, 0);
    const topologyScale =
      `${topologyView.groups.length} ${plural(topologyView.groups.length, 'neighborhood', 'neighborhoods')} · ` +
      `${topologyMemberships} trick-row ${plural(topologyMemberships, 'membership', 'memberships')} shown. ` +
      'Exploratory, pedagogical grouping, not a canonical taxonomy.';

    return {
      seo: {
        title: 'Freestyle Trick Dictionary',
        description:
          `The freestyle footbag trick dictionary: ${canonicalCount} named canonical tricks, ` +
          'browsable by difficulty, family, set, dex count, and movement system.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_tricks_index',
        title:      'Trick Dictionary',
        intro:      'The movement vocabulary of freestyle footbag.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Trick Dictionary' },
        ],
      },
      content: {
        addGroups,
        addJumpChips,
        dexCountGroups,
        setsBrowseView,
        activeView,
        groups,
        familyGroups: familyParentGroups,
        minorLineages,
        familyJumpIndex,
        setGroups,
        setsClusterView,
        componentView,
        topologyView,
        movementSystemView,
        modifiers,
        activeFamily,
        relatedSetGroups,
        totalTricks: canonicalCount,
        landingGrid,
        landingOnboarding: {
          heading: 'New to freestyle? Start here.',
          intro: [
            'This is a reference for tricks: the named moves players do. Every trick is a base move with modifiers layered on top, and the more you layer, the harder it gets.',
            'That difficulty has a score: ADD (added difficulty). A simple base is around 2 to 3; a heavily modified trick can reach 7 or more.',
          ],
          definitions: [
            { term: 'ADD', plain: 'how hard a trick is, as a number; the more you layer on, the higher it goes.' },
            { term: 'Dex', plain: 'a dexterity move, where you circle a leg around the bag.' },
            { term: 'Family', plain: 'a group of tricks built on the same base move.' },
            { term: 'Modifier', plain: 'a twist you add to a base move, like a spin or a hip-pivot.' },
          ],
          example: {
            label: 'Build-up example',
            steps: [
              { name: 'Whirl', note: 'a base move · 3 ADD' },
              { name: 'Spinning Whirl', note: '+ a spin · 4 ADD' },
              { name: 'Spinning Paradox Whirl', note: '+ a hip-pivot · 5 ADD' },
            ],
          },
          lenses: [
            { label: 'By difficulty (ADD)', note: 'easiest to hardest' },
            { label: 'By family', note: 'grouped by the base move' },
            { label: 'By modifier / set', note: 'grouped by the layers added' },
          ],
          links: [
            { label: 'What is an ADD?', href: '/freestyle/glossary#section-add-accounting' },
            { label: 'How trick names work', href: '/freestyle/glossary#section-notation' },
            { label: 'How to read the dictionary', href: '/freestyle/glossary#section-reading-the-dictionary' },
            { label: 'Beginner glossary', href: '/freestyle/glossary#section-core-concepts' },
          ],
        },
        dictionaryIntro:
          `${fmtCount(uniqueDocumentedTrickCount)} unique officially documented tricks, plus ` +
          `${fmtCount(documentedAliasCount)} documented aliases. ` +
          `${canonicalCount} first-class tricks are fully covered in this dictionary. ` +
          'The remaining documented names live in Emerging Vocabulary: observed, historical, alias, ' +
          'source-variant, or not-yet-promoted entries that are tracked but not yet treated as full ' +
          'dictionary pages. The dictionary lets you ' +
          'understand freestyle through three lenses: difficulty (how layered is a trick), ' +
          'structure (what kind of trick is it), and tracking & expansion (what\'s tracked ' +
          'beyond the documented set). Pick a lens below.',
        // Per-view context note for the advanced family browse view.
        familyViewIntro:
          'Family groupings cluster tricks that preserve a conserved terminal mechanic. ' +
          'Members of a family share the same shallow structural skeleton (entry + dex + ' +
          'terminator), even when they carry different modifiers or sit at different ADD ' +
          'values. This is distinct from the ADD view (which clusters by structural difficulty ' +
          'regardless of family) and the Movement System view (which clusters by the modifier ' +
          'axes that transform a base). The shared terminal structure under each family ' +
          'heading below is the invariant that makes the cohort cohere.',
        familyScale,
        dexCountScale,
        movementSystemScale,
        setsScale,
        topologyScale,
      },
    };
  },

  getFreestyleInsightsPage(): PageViewModel<FreestyleInsightsContent> {
    // Live dictionary-frequency of modifiers (how many canonical tricks carry
    // each). This is the one Insights metric that regenerates from the DB; the
    // sequence-derived tables remain curated until the sequence corpus is live.
    const modifierRows = runSqliteRead('freestyleTrickModifiers.listModifierUsage', () =>
      freestyleTrickModifiers.listModifierUsage.all() as FreestyleModifierUsageRow[],
    );
    const mostUsedModifiers: InsightsModifier[] = modifierRows.map((r, i) => ({
      rank:  i + 1,
      name:  r.modifier_name,
      type:  r.modifier_type === 'set'  ? 'set primitive'
           : r.modifier_type === 'body' ? 'body modifier'
           : r.modifier_type,
      count: r.trick_count,
    }));

    return {
      seo: {
        title: 'Freestyle Insights',
        description:
          'Patterns observed in a documented archive of competitive freestyle footbag sequences: ' +
          'the tricks, modifiers, and transitions that recur across the record.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_insights',
        title:      'Freestyle Insights',
        intro:      'Patterns observed in a documented archive of 395 Sick3 sequences.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Insights' },
        ],
      },
      content: {
        mostUsed:          INSIGHTS_MOST_USED,
        mostUsedModifiers,
        connectors:        INSIGHTS_CONNECTORS,
        transitions:       INSIGHTS_TRANSITIONS,
        notableSequences:  INSIGHTS_SEQUENCES,
        diversePlayers:    INSIGHTS_DIVERSE_PLAYERS,
      },
    };
  },

  /**
   * GET /freestyle/add-analysis
   *
   * Educational ADD-accounting page. Pure curator content; no DB access.
   * Content lives in src/content/freestyleAddAnalysisContent.ts so it
   * stays reversible without code changes.
   */
  getAddAnalysisPage(): PageViewModel<AddAnalysisContent> {
    return {
      seo: {
        title:       'ADD Analysis (Freestyle)',
        description:
          'How freestyle’s difficulty system is constructed, where its components come from, and why sources sometimes count the same trick differently.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_add_analysis',
        title:      'ADD Analysis',
        intro:      'How freestyle players describe trick difficulty, structure, and scoring.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'ADD Analysis' },
        ],
      },
      content: FREESTYLE_ADD_ANALYSIS_CONTENT,
    };
  },

  /**
   * GET /freestyle/combo-analysis
   *
   * Educational combo + run-architecture page. Operates at the SEQUENCE
   * level above the trick dictionary, parallel to ADD Analysis which
   * operates at the trick-decomposition level.
   *
   * Pure curator content; no DB access. Content lives in
   * src/content/freestyleComboAnalysisContent.ts per
   * [[feedback_reversible_content_governance]].
   */
  getComboAnalysisPage(): PageViewModel<ComboAnalysisContent> {
    return {
      seo: {
        title:       'Combo Analysis (Freestyle)',
        description:
          'How freestyle tricks connect into longer flowing combinations and runs: setup tricks, resolution tricks, recovery patterns, and the transitions that hold a run together.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_combo_analysis',
        title:      'Combo Analysis',
        intro:      'How freestyle tricks connect into longer flowing combinations and runs.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Combo Analysis' },
        ],
      },
      content: FREESTYLE_COMBO_ANALYSIS_CONTENT,
    };
  },

  getAboutPage(): PageViewModel<Record<string, never>> {
    return {
      seo: {
        title: 'About Freestyle',
        description:
          'About freestyle footbag: competition formats, judging, and community resources.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_about',
        title:      'About Freestyle Footbag',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'About' },
        ],
      },
      content: {},
    };
  },

  getJobsNotationArticlePage(): PageViewModel<{ articleTitle: string; articleText: string }> {
    return {
      seo: {
        title:       'By the Way, Not the Name: Ben Job (1995)',
        description: 'Ben Job\'s 1995 proposal of a compositional grammar for footbag freestyle tricks, the historical source for the dictionary notation.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_notation_article',
        title:      'By the Way, Not the Name',
        eyebrow:    'Ben Job, 1995',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Glossary', href: '/freestyle/glossary' },
          { label: 'Notation article' },
        ],
      },
      content: {
        articleTitle: JOBS_NOTATION_ARTICLE_TITLE,
        articleText:  JOBS_NOTATION_ARTICLE,
      },
    };
  },

  /**
   * GET /freestyle/learn
   *
   * Observational symbolic-grammar layer — index of all educational surfaces.
   * Per DISCOVERABILITY phase. Hand-authored content; no DB access.
   */
  getSymbolicLearnPage(): PageViewModel<SymbolicLearnIndexContent> {
    const content = buildSymbolicLearnIndex(this.getOperatorBoard('learn'));
    return {
      seo: {
        title:       'Educational pathways (Freestyle)',
        description:
          'Index of observational educational surfaces alongside the canonical freestyle trick dictionary: progressions, modifier pedagogy, and glossary connective panels.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_learn',
        title:      content.pageHeading,
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Learn' },
        ],
      },
      content,
    };
  },

  /**
   * GET /freestyle/modifier/:slug
   *
   * Observational symbolic-grammar layer — hand-authored modifier-family
   * teaching page. Pilot scope: spinning only.
   * Throws NotFoundError when no authored page exists for the requested slug.
   */
  getModifierFamilyPage(slug: string): PageViewModel<ModifierFamilyPageContent> {
    if (!hasModifierFamilyPage(slug)) {
      throw new NotFoundError(`No modifier-family page for slug "${slug}"`);
    }
    const allDictRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const content = buildModifierFamilyPage(slug, allDictRows);
    if (!content) {
      throw new NotFoundError(`No modifier-family page for slug "${slug}"`);
    }
    return {
      seo: {
        title:       `${content.displayName} (Freestyle modifier)`,
        description: content.pageSubtitle,
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    `freestyle_modifier_${slug}`,
        title:      content.pageTitle,
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: content.displayName },
        ],
      },
      content,
    };
  },

  /**
   * GET /freestyle/progression/walking-family
   *
   * Observational symbolic-grammar layer — hand-authored Walking Family
   * progression chain. Returns null content when any
   * required dictionary slug is missing (curated chain expects all 7 rows).
   */
  getWalkingFamilyProgressionPage(): PageViewModel<WalkingFamilyProgressionContent | null> {
    const allDictRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const content = buildWalkingFamilyProgression(allDictRows);
    return {
      seo: {
        title: 'Walking-family progression (Freestyle)',
        description:
          'Educational symbolic-grammar progression for the walking family: butterfly through ripwalk, dimwalk, sidewalk, dada-curve, matador, and phoenix. Observational layer.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_walking_progression',
        title:      'Walking-family progression',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Walking-family progression' },
        ],
      },
      content,
    };
  },

  getGlossaryPage(): PageViewModel<FreestyleGlossaryContent> {
    // Build the same lookup context the trick-detail renderer uses, so the
    // glossary's notation examples are classified by the SAME role registries
    // — keeping the page's claim ("color-coded structural roles") visibly
    // true at the site of the claim.
    const allDictRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const allModifiers = runSqliteRead('freestyleTrickModifiers.listAll', () =>
      freestyleTrickModifiers.listAll.all() as FreestyleTrickModifierRow[],
    );
    const allAliases = runSqliteRead('freestyleTrickAliases.listAll', () =>
      freestyleTrickAliases.listAll.all() as FreestyleTrickAliasRow[],
    );
    const ctx = buildNotationLookupContext(allDictRows, allModifiers, allAliases);

    // Three illustrative examples per the bootstrap plan + style guide:
    // beginner (single base), compound (modifier + base), modifier-heavy
    // (3 modifiers + base). Each shaped through the same renderer.
    const whirlExample        = shapeNotationDisplay('WHIRL', ctx);
    const paradoxWhirlExample = shapeNotationDisplay('PARADOX WHIRL', ctx);
    const gauntletExample     = shapeNotationDisplay('STEPPING DUCKING PARADOX TORQUE', ctx);

    // Foundational-tricks
    // grid shaped from CORE_TRICK_SPEC + freestyle_tricks for the §10
    // foundational-tricks section. Same view-model shape as the landing's
    // coreTricks, so the core-tricks-grid partial renders both surfaces
    // identically (registry-style readability).
    const coreTricks: FreestyleCoreTrickCard[] = shapeCoreTricks(allDictRows);

    // Set-primitive grid for the Modifiers & Operators section. Pixie and Fairy
    // are the set-tier primitives whose glossary term-anchor lives nowhere else;
    // the decomposable set operators and Stepping are rendered by their own
    // surfaces (intermediate-operators list, body-modifier reference) so each
    // operator's anchor stays on a single element.
    const setModifiers: FreestyleSetModifierEntry[] = shapeSetModifiers(
      this.getOperatorBoard('glossary'),
    );

    return {
      seo: {
        title: 'Freestyle Glossary',
        description:
          'Glossary of freestyle footbag terminology: the ADD system, run-quality labels, set components, and common abbreviations.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_glossary',
        title:      'Freestyle Glossary',
        intro:      'Plain-language definitions for the words and abbreviations players use when talking about freestyle.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Glossary' },
        ],
      },
      content: {
        operatorBoard:         this.getOperatorBoard('glossary'),
        intermediateOperators: OPERATOR_REFERENCE_ENTRIES,
        coreTricks,
        setModifiers,
        notationExamples: {
          whirl:        whirlExample,
          paradoxWhirl: paradoxWhirlExample,
          gauntlet:     gauntletExample,
        },
        connectivePanels: buildGlossaryConnectivePanels(allDictRows),
        abbreviations:   GLOSSARY_ABBREVIATIONS,
        familyTrees:     shapeFamilyTrees(allDictRows),
        setModifierFeelCards:  SET_MODIFIER_FEEL_CARDS,
        bodyModifierFeelCards: BODY_MODIFIER_FEEL_CARDS,
        familyCardGroups: buildFamilyCardTierGroups(),
        otherFoundationalAtoms: coreTricks.filter(t => {
          const familySlugs = new Set([
            ...ROOT_TERMINAL_FAMILIES.map(f => f.slug),
            ...BRANCH_FAMILIES.map(f => f.slug),
          ]);
          return !familySlugs.has(t.slug);
        }),
        firstClassFamilyRoster: PUBLIC_DISPLAY_FAMILIES
          .filter(f => !f.parent && familyTier(f.slug) === 'family-parent')
          .map(root => ({
            slug:  root.slug,
            label: root.label,
            branches: PUBLIC_DISPLAY_FAMILIES
              .filter(b => b.parent === root.slug)
              .map(b => ({ slug: b.slug, label: b.label })),
          })),
        minorLineageRoster: PUBLIC_DISPLAY_FAMILIES
          .filter(f => !f.parent && familyTier(f.slug) === 'minor-lineage')
          .map(f => ({ slug: f.slug, label: f.label, count: FAMILY_DESCENDANT_COUNTS.get(f.slug) ?? 0 })),
        familyHistogram: topologyHistogramRows(FAMILY_HISTOGRAM),
        entryHistogram:  topologyHistogramRows(ENTRY_HISTOGRAM),
        addWorkedExamples: ADD_WORKED_EXAMPLES.map((ex) => ({
          ...ex,
          statusLabel:
            ex.status === 'pending-doctrine' ? 'pending doctrine'
            : ex.status === 'doctrine-locked' ? 'settled'
            : ex.status,
        })),
        derivationAtlas:   DERIVATION_PILOT_ENTRIES,
        // §1 Core trick atoms — beginner-facing pedagogical cards.
        // Curator authoring principle: movement intuition
        // leads; compositional pointers are secondary. Sourced from
        // CORE_ATOM_EDUCATIONAL; href maps to canonical trick-detail.
        coreAtomEducationalCards: CORE_ATOM_EDUCATIONAL.map(c => ({
          slug:             c.slug,
          displayName:      c.displayName,
          adds:             `${c.adds} ADD`,
          detailHref:       `/freestyle/tricks/${c.slug}`,
          lead:             c.lead,
          movementIntuition: c.movementIntuition,
          foundationalNote: c.foundationalNote,
          familyRole:       c.familyRole,
        })),
      },
    };
  },

  getObservationalLayerPage(): PageViewModel<FreestyleObservationalContent> {
    // Layer-separation invariant: observational entries surface ONLY here.
    // Content-module-driven (the generated freestyleObservationalUniverse,
    // overlap-safe by construction) per [[feedback_reversible_content_
    // governance]]. No DB query, no canonical promotion, no request-time CSV
    // read; provisional ADD/decomposition are observationally extrapolated.
    const universe = OBSERVATIONAL_UNIVERSE;
    const stats = OBSERVATIONAL_UNIVERSE_STATS;

    // Curator-note overrides: preserve the hand-authored notes from the legacy
    // curator module, keyed by slug. Notes only — no lane forcing, no data.
    const curatorNotes = new Map<string, string>();
    for (const t of OBSERVATIONAL_TRICKS) {
      if (t.curatorNote) curatorNotes.set(t.folkSlug, t.curatorNote);
    }
    const shape = (r: ObservationalUniverseRow) => shapeObservationalCard(r, curatorNotes);
    const inSection = (s: string) => universe.filter(r => r.section === s);
    const isAliasArchive = (r: ObservationalUniverseRow) =>
      r.intakeBucket === 'alias' || r.intakeBucket === 'duplicate_variant';

    // ADD-first grouping for the Promotion-Ready and Needs-Authoring sections.
    // Groups by the provisional (derived) ADD already carried on each row — the
    // curator-blessed value that encodes the atomic +1 / X-dex-on-far-dex rules.
    // This never re-derives ADD. Numeric ascending; ADD Unknown last.
    const groupByAdd = (rows: ObservationalUniverseRow[]): ObservationalEcosystemGroup[] => {
      const byAdd = new Map<string, ObservationalUniverseRow[]>();
      for (const r of rows) {
        const key = /^[0-9]+$/.test(r.provisionalAdd) ? r.provisionalAdd : 'unknown';
        const list = byAdd.get(key);
        if (list) list.push(r); else byAdd.set(key, [r]);
      }
      return [...byAdd.keys()]
        .sort((a, b) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : Number(a) - Number(b)))
        .map(k => {
          const list = byAdd.get(k)!;
          return {
            ecosystem: k,
            label:     k === 'unknown' ? 'ADD Unknown' : `${k} ADD`,
            count:     list.length,
            cards:     list.map(shape),
          };
        });
    };

    // Section A — Awaiting Ruling, grouped by derived ADD (lowest first).
    // Net the alias/duplicate archive out symmetrically (folk/parser already do
    // this below) so the published section counts form a clean partition and the
    // alias archive is never double-counted on top of a section.
    const readyRows = inSection('ready').filter(r => !isAliasArchive(r));
    const readyCards = readyRows.map(shape);
    const readyGroups = groupByAdd(readyRows);

    // Section B — per-ecosystem frontier matrix (intelligibility lens) + the
    // curator-confirm cards.
    const ecoKeys = new Set<string>();
    for (const r of universe) ecoKeys.add(r.ecosystem || '(unclassified)');
    const ecosystemMatrix: ObservationalEcosystemRow[] = [...ecoKeys].map(eco => {
      const ofEco = universe.filter(r => (r.ecosystem || '(unclassified)') === eco);
      const c = (s: string) => ofEco.filter(r => r.section === s && !isAliasArchive(r)).length;
      return {
        ecosystem:  eco,
        label:      observedEcosystemLabel(eco),
        ready:      c('ready'),
        frontier:   c('frontier'),
        doctrine:   c('doctrine'),
        unresolved: c('folk') + c('parser'),
        total:      ofEco.length,
      };
    }).sort((a, b) => (b.ready - a.ready) || (b.total - a.total));
    const frontierRows = inSection('frontier').filter(r => !isAliasArchive(r));
    const frontierCards = frontierRows.map(shape);
    const frontierGroups = groupByAdd(frontierRows);

    // Section C — doctrine bottleneck clusters.
    const doctrineRows = inSection('doctrine');
    const doctrineClusters: ObservationalDoctrineCluster[] =
      ['blurry', 'dod-ddd', 'pogo', 'weaving', 'shooting', 'other']
        .map(key => {
          const rows = doctrineRows.filter(r => r.cluster === key);
          return {
            key,
            label:            observedEcosystemLabel(key),
            count:            rows.length,
            blockingQuestion: DOCTRINE_BLOCKING_QUESTIONS[key] ?? 'Ruling pending.',
            sampleNames:      rows.slice(0, 6).map(r => r.name),
          };
        })
        .filter(c => c.count > 0);

    // Sections D + E — summarized: sample cards + a full list behind disclosure.
    const summarizeRows = (rows: ObservationalUniverseRow[], intro: string): ObservationalSummarySection => ({
      total:       rows.length,
      intro,
      sampleCards: rows.slice(0, 6).map(shape),
      fullList:    rows.map(r => ({ name: r.name, source: r.source })),
    });
    // Folk / Unresolved excludes alias-bucket rows; those surface in the
    // Alias / Duplicate archive instead, so nothing is double-counted.
    const folk = summarizeRows(inSection('folk').filter(r => !isAliasArchive(r)),
      'Names whose canonical equivalence is uncertain: folk shorthand, historical ' +
      'vocabulary, legacy source names, and compression labels. Documented, not yet resolved.');
    const parser = summarizeRows(inSection('parser').filter(r => !isAliasArchive(r)),
      'Names the parser cannot yet fully read: unknown modifier tokens, ambiguous ' +
      'terminal mechanics, or unresolved syntax. Honest coverage gaps, not failures.');
    const aliasArchive = summarizeRows(universe.filter(isAliasArchive),
      'Documented names that resolve to an existing canonical trick, folded as aliases ' +
      'or wording / source duplicates. Kept for lookup; not part of the promotion frontier.');

    // Three-layer ontology (publication-integrity doctrine): a mature canonical
    // ontology, a substantial governed expansion frontier, and a broader lexical
    // archive. The frontier counts distinct mechanically-coherent candidate
    // structures; the archive (aliases, duplicates, single-source noise, unresolved
    // doctrine) is documented vocabulary, never counted as candidate tricks.
    // Frontier-health metrics (replace the prior ecosystem-centric stats).
    const readyN    = readyCards.length;
    const needsN    = frontierCards.length;
    const doctrineN = doctrineRows.length;
    const folkN     = folk.total + parser.total;
    const aliasN    = aliasArchive.total;
    const frontierSize  = readyN + needsN + doctrineN + folkN; // excludes the alias archive
    const pctUnderstood = frontierSize ? Math.round(((readyN + needsN) / frontierSize) * 100) : 0;
    const statBlocks: ObservationalStat[] = [
      { label: 'Awaiting Ruling',         value: String(readyN),      hint: 'structurally understood; blocked on a curator ruling, an operator chassis, or a missing base' },
      { label: 'Needs Authoring',         value: String(needsN),      hint: 'structure understood, awaiting notation or decomposition' },
      { label: 'Doctrine Blocked',        value: String(doctrineN),   hint: 'awaiting a curator or Red ruling' },
      { label: 'Folk / Unresolved',       value: String(folkN),       hint: 'documented names whose structure is not yet understood' },
      { label: 'Alias / Duplicate',       value: String(aliasN),      hint: 'resolve to an existing trick; archive, not frontier' },
      { label: 'Structurally Understood', value: `${pctUnderstood}%`, hint: 'promotion-ready + needs-authoring share of the non-alias frontier' },
    ];

    const sources = Object.keys(stats.sources).map(badge => ({
      badge, label: observedSourceLabel(badge),
    }));

    return {
      seo: {
        title: 'Emerging Vocabulary',
        description:
          'The frontier of the freestyle movement language: community-documented trick ' +
          'names classified by how close each is to canonical promotion.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_observational',
        title:      'Emerging Vocabulary',
        intro:      'A mature canonical ontology with a substantial, governed expansion frontier. This surface tracks the promotion frontier (mechanically coherent candidate structures on track to canonical) above the broader lexical archive of historical and community vocabulary. Every reading here is observationally extrapolated, never canonical.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Emerging Vocabulary' },
        ],
      },
      content: {
        stats: statBlocks,
        statsNote:
          `The promotion frontier, ordered by status. ${readyN} names are ready to promote, ` +
          `${needsN} need authoring, ${doctrineN} are doctrine-blocked, and ${folkN} remain folk ` +
          `or unresolved; a further ${aliasN} resolve to existing tricks (archived). ` +
          `${pctUnderstood}% of the non-alias frontier is structurally understood. Nothing here ` +
          `duplicates a published canonical trick.`,
        layerNote:
          'These are community-documented freestyle trick names being canonicalized. ' +
          'Provisional ADD and decomposition are observationally extrapolated: they ' +
          'are NOT canonical, carry a tracked tag rather than a hashtag, and have no ' +
          'detail page until a curator promotes them.',
        readyTotal:    readyCards.length,
        readyGroups,
        ecosystemMatrix,
        frontierTotal: frontierCards.length,
        frontierGroups,
        doctrineTotal: doctrineRows.length,
        doctrineClusters,
        folk,
        parser,
        aliasArchive,
        sources,
        canonicalReferences: [
          { label: 'Trick Dictionary (canonical)', href: '/freestyle/tricks' },
          { label: 'Operators & Modifiers',         href: '/freestyle/operators' },
          { label: 'ADD Analysis',                  href: '/freestyle/add-analysis' },
        ],
        generatedOn: stats.generatedOn,
        isEmpty:     universe.length === 0,
      },
    };
  },

  getOperatorsPage(): PageViewModel<FreestyleOperatorsContent> {
    // Compact, browseable index of the modifier vocabulary, grouped by the
    // movement-system axes, in the same row idiom as the trick dictionary and
    // set encyclopedia. The advanced-reference blocks below the index are
    // retained for now (theory split deferred) and render from the shared
    // advanced-reference partial.
    const modifierRows = runSqliteRead('freestyleTrickModifiers.listAll', () =>
      freestyleTrickModifiers.listAll.all() as FreestyleTrickModifierRow[],
    );
    return {
      seo: {
        title: 'Freestyle Operators & Modifiers',
        description:
          'Browseable index of the freestyle modifier vocabulary: each ' +
          'transformation with its type, ADD weight, status, and the tricks it produces.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_operators',
        title:      'Operators & Modifiers',
        intro:      'The movement ideas that transform one trick into many related variations.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Operators & Modifiers' },
        ],
      },
      content: {
        indexAxes: buildOperatorIndexAxes(modifierRows),
      },
    };
  },

  // Detail resolution for /freestyle/modifier/:slug. A hand-authored teaching
  // page wins; any other known modifier falls back to a data-driven stub; an
  // unknown slug throws NotFound (404). No modifier dead-ends.
  getModifierDetail(slug: string):
    | { kind: 'teaching'; vm: PageViewModel<ModifierFamilyPageContent> }
    | { kind: 'stub';     vm: PageViewModel<ModifierStubContent> } {
    if (hasModifierFamilyPage(slug)) {
      return { kind: 'teaching', vm: this.getModifierFamilyPage(slug) };
    }
    return { kind: 'stub', vm: this.getModifierStubPage(slug) };
  },

  getModifierStubPage(slug: string): PageViewModel<ModifierStubContent> {
    const row = runSqliteRead('freestyleTrickModifiers.getBySlug', () =>
      freestyleTrickModifiers.getBySlug.get(slug) as FreestyleTrickModifierRow | undefined,
    );
    if (!isKnownModifier(slug, row)) {
      throw new NotFoundError(`No modifier "${slug}"`);
    }
    const trickRows = runSqliteRead('freestyleTrickModifiers.listActiveTricksByModifierSlug', () =>
      freestyleTrickModifiers.listActiveTricksByModifierSlug.all(slug) as {
        slug: string; canonical_name: string; adds: number | null; trick_family: string | null;
      }[],
    );
    const displayName = row?.modifier_name ?? operatorFeelCard(slug)?.name ?? operatorTitleCase(slug);
    const axis        = OPERATOR_INDEX_AXES.find(a => a.modifierSlugs.includes(slug));
    const typeLabel   = axis?.typeLabel
      ?? (row ? MODIFIER_TYPE_LABEL[row.modifier_type] ?? 'Modifier' : 'Modifier');
    const status      = operatorStatus(slug);
    const relatedModifiers = (axis?.modifierSlugs ?? [])
      .filter(s => s !== slug)
      .map(s => ({ slug: s, name: operatorFeelCard(s)?.name ?? operatorTitleCase(s) }));
    const commonTricks = trickRows.slice(0, 12).map(t => ({
      slug: t.slug,
      name: t.canonical_name,
      adds: t.adds != null ? String(t.adds) : '?',
    }));
    return {
      seo: {
        title:       `${displayName} (Freestyle modifier)`,
        description: operatorDescriptor(slug) ?? `${displayName}: freestyle modifier reference.`,
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    `freestyle_modifier_${slug}`,
        title:      displayName,
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Operators & Modifiers', href: '/freestyle/operators' },
          { label: displayName },
        ],
      },
      content: {
        slug,
        displayName,
        hashtag:     `#${slug}`,
        typeLabel,
        addLabel:    operatorAddLabel(row),
        notation:    operatorNotation(slug),
        whatItIs:    operatorDescriptor(slug),
        decomposition:  getOperatorReferenceEntry(slug)?.decomposition ?? null,
        workedExamples: getOperatorReferenceEntry(slug)?.workedExamples ?? [],
        statusKey:   status.key,
        statusLabel: status.label,
        commonTricks,
        relatedModifiers,
      },
    };
  },

  /**
   * GET /freestyle/sets/:slug — Set detail page.
   * Returns null when the slug does not resolve to
   * a canonical-set entry; controller maps null → 404.
   */
  getCanonicalSetDetailPage(slug: string): PageViewModel<FreestyleSetDetailContent> | null {
    const set = findCanonicalSetBySlug(slug);
    if (!set) return null;

    const sourceLabels: Record<CanonicalSetSourceKey, string> = {
      'canonical':        'Canonical',
      'platform-tracked': 'Platform-tracked',
      'holden-only':      'Holden-only',
    };
    const auditLabels: Record<CanonicalSetAuditKey, string> = {
      'aligned':     'Aligned with Holden',
      'partial':     'Partial: framing differs',
      'conflict':    'Documented disagreement',
      'holden-only': 'Holden-cited only',
    };
    const subtypeLabel = SET_SUBTYPE_SPECS.find(s => s.key === set.subtype)?.label ?? set.subtype;

    // Example tricks: tricks linked to this set's slug in the modifier-link
    // table. Sets without a registered modifier (most holden-only entries)
    // produce an empty array.
    const linkRows = runSqliteRead('freestyleTrickModifiers.listTricksByModifier', () =>
      freestyleTrickModifiers.listTricksByModifier.all() as FreestyleTrickModifierLinkRow[],
    );
    const allActiveRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const rowsBySlug = new Map<string, FreestyleTrickRow>(
      allActiveRows.map(r => [r.slug, r]),
    );
    const linkedTrickSlugs = new Set<string>(
      linkRows.filter(l => l.modifier_slug === set.slug).map(l => l.trick_slug),
    );
    const exampleTricks: SetDetailExampleTrick[] = [...linkedTrickSlugs]
      .map(s => rowsBySlug.get(s))
      .filter((r): r is FreestyleTrickRow => r !== undefined)
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
      .map(row => ({
        slug:                row.slug,
        displayName:         row.canonical_name,
        href:                `/freestyle/tricks/${row.slug}`,
        adds:                row.adds ?? null,
        addsLabel:           row.adds ? `${row.adds} ADD` : '? ADD',
        operationalNotation: row.operational_notation ?? '',
      }));

    // Compositional-sets anchor — map subtype → family key on /freestyle/compositional-sets.
    const compositionalFamilyKey: Record<SetSubtypeKey, string> = {
      'true-core':            'single-dex-primitives',
      'composite-derived':    'multi-dex-compounds',
      'rotational':           'spinning-family',
      'whirl-swirl':          'whirl-swirl-family',
      'uns':                  'uns-sets',
      'rooted-antisymposium': 'antisymposium-and-components',
    };

    // Operator reference is only meaningful when the set has a registered
    // modifier (pixie/fairy/atomic/quantum/nuclear/stepping/surging). Other
    // sets have no operator-page anchor; omit the field.
    const REGISTERED_MODIFIER_SLUGS = new Set([
      'pixie', 'fairy', 'atomic', 'quantum', 'nuclear', 'stepping', 'surging',
    ]);
    const operatorReferenceHref = REGISTERED_MODIFIER_SLUGS.has(set.slug)
      ? `/freestyle/operators#${set.slug}`
      : undefined;

    const crossLinks: SetDetailCrossLinks = {
      setHubHref:             '/freestyle/tricks?view=sets',
      compositionalHubHref:   `/freestyle/compositional-sets#${compositionalFamilyKey[set.subtype]}`,
      movementSystemAxisHref: '/freestyle/tricks?view=movement-system#movement-axis-set-uptime',
      operatorReferenceHref,
      flatReferenceHref:      '/freestyle/sets/reference',
    };

    // S5 sibling navigation: previous / next set within the same subtype,
    // in CANONICAL_SETS declaration order (matches the encyclopedia card
    // grid order). Null on the first / last set within the subtype.
    const subtypeSiblings = CANONICAL_SETS.filter(s => s.subtype === set.subtype);
    const siblingIdx = subtypeSiblings.findIndex(s => s.slug === set.slug);
    const buildSibling = (s: typeof CANONICAL_SETS[number] | undefined): SetDetailSibling | null =>
      s ? { slug: s.slug, displayName: s.displayName, href: `/freestyle/sets/${s.slug}` } : null;
    const previousSet = siblingIdx > 0
      ? buildSibling(subtypeSiblings[siblingIdx - 1])
      : null;
    const nextSet = siblingIdx >= 0 && siblingIdx < subtypeSiblings.length - 1
      ? buildSibling(subtypeSiblings[siblingIdx + 1])
      : null;

    return {
      seo: {
        title:       `${set.displayName} (set system)`,
        description:
          `${set.displayName} canonical set ontology: formula, movement explanation, ` +
          `equivalence readings, derived and related systems, example tricks, and ` +
          `Holden / platform provenance.`,
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_set_detail',
        title:      `${set.displayName} ${set.hashtag}`,
        eyebrow:    subtypeLabel,
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle',    href: '/freestyle' },
          { label: 'Trick Dictionary', href: '/freestyle/tricks' },
          { label: 'Sets',         href: '/freestyle/tricks?view=sets' },
          { label: set.displayName },
        ],
      },
      content: {
        slug:                  set.slug,
        hashtag:               set.hashtag,
        displayName:           set.displayName,
        subtype:               set.subtype,
        subtypeLabel,
        formula:               set.formula,
        movementExplanation:   set.movementExplanation,
        equivalenceReadings:   set.equivalenceNotes.map(n => `${n.reading}: ${n.citation}`),
        derivedSystems:        set.derivedSystems.map(r => ({
          slug:  r.slug,
          label: r.label,
          href:  `/freestyle/sets/${r.slug}`,
        })),
        relatedSystems:        set.relatedSystems.map(r => ({
          slug:  r.slug,
          label: r.label,
          href:  `/freestyle/sets/${r.slug}`,
        })),
        exampleTricks,
        hasExampleTricks:      exampleTricks.length > 0,
        crossLinks,
        source:                set.source,
        sourceLabel:           sourceLabels[set.source],
        sourceCitation:        set.sourceCitation,
        auditStatus:           set.auditStatus,
        auditStatusLabel:      set.auditStatus ? auditLabels[set.auditStatus] : undefined,
        componentMechanicsNote:
          'Component mechanics (ducking, diving, bare spinning, bare inspinning, gyro) ' +
          'are body modifiers, not sets. See the Operators & Modifiers reference.',
        previousSet,
        nextSet,
      },
    };
  },

  /**
   * GET /freestyle/sets — Set Encyclopedia.
   *
   * Standalone minimalist surface listing canonical sets as first-class
   * ontology objects. Distinct from:
   *
   *   /freestyle/tricks?view=sets   — Trick Dictionary's Set Hub view
   *                                   (verbose cards, embedded in dictionary URL)
   *   /freestyle/compositional-sets — exploratory compositional-sets hub
   *                                   (family / ladder groupings + Holden audit)
   *   /freestyle/sets/:slug         — per-set detail pages (deep ontology)
   *   /freestyle/sets/reference     — flat Holden reference table
   *
   * Cards carry only: name + hashtag + compact formula + one-sentence
   * movement + one provenance line + up to 3 quick-relation tags + a
   * detail link. Deep content lives on the detail pages.
   */
  getSetsEncyclopediaPage(): PageViewModel<FreestyleSetsEncyclopediaView> {
    const sourceLabels: Record<CanonicalSetSourceKey, string> = {
      'canonical':        'Canonical',
      'platform-tracked': 'Platform-tracked',
      'holden-only':      'Holden-only',
    };

    // Compact provenance: combine source + audit status into ONE line.
    // Examples:
    //   canonical + aligned        → "Canonical · Holden aligned"
    //   platform-tracked + aligned → "Platform-tracked · Holden aligned"
    //   holden-only                → "Holden-only"
    //   platform-tracked + partial → "Platform-tracked · Holden partial"
    const buildProvenanceLine = (set: typeof CANONICAL_SETS[number]): string => {
      const sourcePart = sourceLabels[set.source];
      if (!set.auditStatus) return sourcePart;
      switch (set.auditStatus) {
        case 'aligned':     return `${sourcePart} · Holden aligned`;
        case 'partial':     return `${sourcePart} · Holden partial`;
        case 'conflict':    return `${sourcePart} · documented disagreement`;
        case 'holden-only': return sourcePart;
      }
    };

    // Compact movement: first sentence of the explanation. Splits on
    // ". " (period-space) which preserves abbreviations within a sentence.
    // Falls back to the full string when no sentence-break is found.
    const compactFirstSentence = (full: string): string => {
      const cleaned = full.trim();
      const sentenceBreak = cleaned.indexOf('. ');
      if (sentenceBreak === -1) return cleaned;
      // Include the period; drop the trailing space.
      return cleaned.slice(0, sentenceBreak + 1);
    };

    // Quick relations: up to 2 derived + 1 related, capped at 3 total.
    // Hrefs go to detail pages, NOT the in-page anchors (the Encyclopedia
    // links forward, not into itself).
    const shapeQuickRelations = (set: typeof CANONICAL_SETS[number]): SlugLinkVM[] => {
      const derived: SlugLinkVM[] = set.derivedSystems.slice(0, 2).map(r => ({
        slug:  r.slug,
        label: r.label,
        href:  `/freestyle/sets/${r.slug}`,
      }));
      const related: SlugLinkVM[] = set.relatedSystems.slice(0, 1).map(r => ({
        slug:  r.slug,
        label: r.label,
        href:  `/freestyle/sets/${r.slug}`,
      }));
      return [...derived, ...related].slice(0, 3);
    };

    // Card role: derived from subtype, with true-core split by formula prefix
    // (TOE → +1 entry; CLIP → clip entry). Composite / rotational / whirl-swirl
    // / uns / rooted map 1:1 from subtype.
    const deriveCardRole = (s: typeof CANONICAL_SETS[number]): { roleKey: EncyclopediaCardRole; roleLabel: string } => {
      switch (s.subtype) {
        case 'true-core': {
          const startsWithToe = /^\s*TOE\b/.test(s.formula);
          return startsWithToe
            ? { roleKey: 'plus-one-entry', roleLabel: '+1 entry' }
            : { roleKey: 'clip-entry',     roleLabel: 'CLIP entry' };
        }
        case 'composite-derived':    return { roleKey: 'composite',   roleLabel: 'composite' };
        case 'rotational':           return { roleKey: 'rotational',  roleLabel: 'rotational' };
        case 'whirl-swirl':          return { roleKey: 'whirl-swirl', roleLabel: 'whirl/swirl' };
        case 'uns':                  return { roleKey: 'uns-entry',   roleLabel: 'UNS entry' };
        case 'rooted-antisymposium': return { roleKey: 'rooted',      roleLabel: 'rooted' };
      }
    };

    // Flagship-foundational cohort: the 5 literal-primitive true-core sets
    // that anchor most of the compositional vocabulary. Mirrors the
    // flagship-marker discipline on /freestyle/glossary.
    const FLAGSHIP_SET_TOOLTIPS: Record<string, string> = {
      pixie:    'Flagship set: the simplest +1 uptime entry; anchors terraging / sailing / frantic.',
      fairy:    "Flagship set: pixie's directional mirror (out-dex); anchors the fairy-spinning family.",
      stepping: 'Flagship set: clipper-entry +1; anchors blurry / barraging / shooting / leaning.',
      atomic:   'Flagship set: out-dex toe entry resolving to op-side; anchors nuclear / fairy-atomic.',
      quantum:  "Flagship set: atomic's in-dex sibling; the curator-canonical pt2 replacement for toe-prefix naming.",
    };

    // Pre-load trick rows + modifier-link rows ONCE for the whole encyclopedia
    // page (43 cards). The per-card produces preview reads from these maps;
    // no per-card DB calls.
    const allTrickRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const trickRowBySlug = new Map<string, FreestyleTrickRow>(
      allTrickRows.map(r => [r.slug, r]),
    );
    const linkRowsAll = runSqliteRead('freestyleTrickModifiers.listTricksByModifier', () =>
      freestyleTrickModifiers.listTricksByModifier.all() as FreestyleTrickModifierLinkRow[],
    );
    const tricksByModifier = new Map<string, FreestyleTrickRow[]>();
    for (const link of linkRowsAll) {
      const row = trickRowBySlug.get(link.trick_slug);
      if (!row) continue;
      const bucket = tricksByModifier.get(link.modifier_slug);
      if (bucket) bucket.push(row);
      else tricksByModifier.set(link.modifier_slug, [row]);
    }

    // "Common in" preview: up to 3 canonical trick examples per set, sorted
    // by lowest ADD first (most foundational compounds surface first), then
    // alphabetical. Empty when no modifier-registry rows link the set.
    // Wording chosen over "produces" to avoid implying single-ingredient
    // determinism — a set is one factor among several in any compound.
    const shapeCommonInPreview = (s: typeof CANONICAL_SETS[number]): SlugLinkVM[] => {
      const tricks = tricksByModifier.get(s.slug) ?? [];
      // freestyle_tricks.adds is TEXT in the schema (e.g. "3", "4",
      // "modifier"). Parse to number for sort; non-numeric / null sorts
      // last by using a sentinel of 99.
      const parseAdds = (raw: string | null): number => {
        if (raw === null) return 99;
        const n = Number.parseInt(raw, 10);
        return Number.isFinite(n) ? n : 99;
      };
      return tricks
        .slice()
        .sort((a, b) => {
          const aAdd = parseAdds(a.adds);
          const bAdd = parseAdds(b.adds);
          if (aAdd !== bAdd) return aAdd - bAdd;
          return a.canonical_name.localeCompare(b.canonical_name);
        })
        .slice(0, 3)
        .map(r => ({
          slug:  r.slug,
          label: r.canonical_name,
          href:  `/freestyle/tricks/${r.slug}`,
        }));
    };

    // Public status pill: keeps internal source names off the card. A
    // documented disagreement (partial / conflict audit) reads "Under review";
    // canonical and platform-tracked sets read "Platform-tracked"; remaining
    // compilation-only sets read "Community-cited".
    const deriveStatusPill = (s: typeof CANONICAL_SETS[number]): { label: string; key: string } => {
      if (s.auditStatus === 'conflict' || s.auditStatus === 'partial') {
        return { label: 'Under review', key: 'under-review' };
      }
      if (s.source === 'canonical' || s.source === 'platform-tracked') {
        return { label: 'Platform-tracked', key: 'platform-tracked' };
      }
      return { label: 'Community-cited', key: 'community-cited' };
    };

    const shapeEncyclopediaCard = (s: typeof CANONICAL_SETS[number]): EncyclopediaSetCard => {
      const role = deriveCardRole(s);
      const flagshipTitle = FLAGSHIP_SET_TOOLTIPS[s.slug];
      return {
        slug:            s.slug,
        hashtag:         s.hashtag,
        displayName:     s.displayName,
        formula:         s.formula,
        compactMovement: compactFirstSentence(s.movementExplanation),
        provenanceLine:  buildProvenanceLine(s),
        statusPill:      deriveStatusPill(s),
        quickRelations:  shapeQuickRelations(s),
        detailHref:      `/freestyle/sets/${s.slug}`,
        roleKey:         role.roleKey,
        roleLabel:       role.roleLabel,
        isFlagship:      flagshipTitle !== undefined,
        flagshipTitle,
        commonIn:        shapeCommonInPreview(s),
      };
    };

    // First pass: build sections without forward-pointers, drop empties.
    type RawSection = Omit<
      EncyclopediaSubtypeSection,
      'nextSubtypeAnchor' | 'nextSubtypeLabel' | 'nextSubtypeTagline'
    >;
    const rawSections: RawSection[] = SET_SUBTYPE_SPECS.map(spec => {
      const cards = CANONICAL_SETS
        .filter(s => s.subtype === spec.key)
        .map(shapeEncyclopediaCard);
      return {
        key:   spec.key,
        label: spec.label,
        intro: spec.intro,
        count: cards.length,
        cards,
      };
    }).filter(section => section.count > 0);

    // S4 tagline: first sentence of the intro, lowercased, no trailing
    // period — short enough to land in a 1-line "Next — X: <tagline>"
    // footer. Truncates at the first period or em-dash, whichever comes
    // first. Lowercases the first letter so the clause reads naturally
    // after the colon.
    const deriveTagline = (intro: string): string => {
      const periodIdx  = intro.indexOf('.');
      const emDashIdx  = intro.indexOf('—'); // em dash
      const candidates = [periodIdx, emDashIdx].filter(i => i > 0);
      const cutIdx = candidates.length > 0 ? Math.min(...candidates) : intro.length;
      const head = intro.slice(0, cutIdx).trim();
      return head.length > 0
        ? head.charAt(0).toLowerCase() + head.slice(1)
        : intro;
    };

    // Second pass: inject forward-pointers based on rendered order.
    // Last section gets nulls (footer suppresses cleanly).
    const subtypeSections: EncyclopediaSubtypeSection[] = rawSections.map((section, i) => {
      const next = rawSections[i + 1];
      return {
        ...section,
        nextSubtypeAnchor:  next ? `set-subtype-${next.key}` : null,
        nextSubtypeLabel:   next?.label  ?? null,
        nextSubtypeTagline: next ? deriveTagline(next.intro) : null,
      };
    });

    const subtypeMiniToc: EncyclopediaMiniTocEntry[] = subtypeSections.map(section => ({
      anchorId: `set-subtype-${section.key}`,
      label:    section.label,
    }));

    const crossLinks: EncyclopediaCrossLinks = {
      dictionaryBysetLabel:  'Trick Dictionary: tricks grouped by modifier',
      dictionaryBysetHref:   '/freestyle/tricks?view=sets',
      compositionalHubLabel: 'Compositional Sets hub (family / ladder groupings)',
      compositionalHubHref:  '/freestyle/compositional-sets',
      operatorsPageLabel:    'Operators & Modifiers',
      operatorsPageHref:     '/freestyle/operators',
      flatReferenceLabel:    'Flat Holden reference table',
      flatReferenceHref:     '/freestyle/sets/reference',
    };

    return {
      seo: {
        title:       'Set Encyclopedia',
        description:
          'Canonical sets as first-class compositional vocabulary: the named uptime ' +
          'movement primitives that open a trick. One card per set; detail pages carry ' +
          'the deep ontology.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_sets_encyclopedia',
        title:      'Set Encyclopedia',
        eyebrow:    'Compositional vocabulary',
        intro:
          'Set systems as first-class ontology objects. Tap any card for the deep reading; ' +
          'this index keeps it compact and browsable.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Sets' },
        ],
      },
      content: {
        intro:
          'What is each set as a system? This index lists the named uptime movement ' +
          'primitives the rest of the language composes from. For "which tricks use this ' +
          'set?", see the Trick Dictionary\'s By Modifier view.',
        totalSets: subtypeSections.reduce((n, s) => n + s.count, 0),
        subtypeSections,
        subtypeMiniToc,
        crossLinks,
      },
    };
  },

  getMovesPage(): PageViewModel<FreestyleMovesContent> {
    const trickRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const trickSlugs = new Set<string>(trickRows.map(r => r.slug));

    const shape = (label: string, notation: string | null): FreestyleMoveLabel => {
      const slug = movesAnchorSlug(label);
      const isTrick = trickSlugs.has(slug);
      return {
        label,
        notation,
        matchSlug: isTrick ? slug : null,
        trickHref: isTrick ? `/freestyle/tricks/${slug}` : null,
        anchorId:  `move-${slug}`,
      };
    };
    const shapeBare = (label: string): FreestyleMoveLabel => shape(label, null);

    return {
      seo: {
        title: 'Freestyle Move Sets',
        description:
          'Reference guide to freestyle footbag move set notation: Pixie, Fairy, Nuclear, and more.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_moves',
        title:      'Freestyle Move Sets',
        intro:      'A reference guide to the set notation system used in new-school freestyle footbag.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Move Sets' },
        ],
      },
      content: {
        basicSets: [
          shape('Pixie',                       'TOE > SAME IN [DEX] >'),
          shape('Fairy',                       'TOE > SAME OUT [DEX] >'),
          shape('Nuclear',                     'CLIP > SAME OUT >'),
          shape('Miraging',                    'SET > OP IN [DEX] >'),
          shape('Stepping',                    'CLIP > OP IN [DEX] >'),
          shape('Quantum',                     'TOE > OP IN [DEX] > (op side component)'),
          shape('Slapping',                    'TOE > OP IN [DEX] > (same side component)'),
          shape('Bubba',                       'CLIP > OP OUT [DEX] >'),
          shape('Atomic',                      'TOE > OP OUT [DEX] > (op side component)'),
          shape('Tapping',                     'TOE > OP OUT [DEX] (plant) > (same side component)'),
          shape('Terraging (Double Pixie)',    'TOE > SAME IN [DEX] > SAME IN [DEX] >'),
          shape('Barraging (High Stepping)',   'CLIP > OP IN [DEX] > SAME IN [DEX] >'),
          shape('Sailing (Pixie Illusion)',    'TOE > SAME IN [DEX] > OP OUT [DEX] >'),
          shape('Blurry (Stepping Paradox)',   'CLIP > OP IN [DEX] > OP OUT [DEX] > (op side)'),
          shape('Frantic',                     'TOE > SAME IN [DEX] > OP IN [DEX] >'),
          shape('Flailing',                    'SET > (no plant while) OP OUT [BOD] [DEX] >'),
          shape('Fairy Atomic',                'TOE > SAME OUT [DEX] > OP OUT [DEX] >'),
          shape('Shooting',                    'CLIP > OP IN [DEX] > OP OUT [PDX][DEX] >'),
          shape('Furious',                     'CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >'),
          shape('Infracting',                  'Opposite of a Refraction, done as a set'),
        ],
        spinningVariants: [
          'Fairy Spinning', 'Pixie Inspinning', 'Sonic', 'Peeking', 'Leaning',
          'Go-Go', 'Surging', 'Twinspinning', 'Neutron',
        ].map(shapeBare),
        whirlSwirlVariants: [
          'Swirling', 'Whirling', 'Blazing', 'Scattered', 'Shattered',
          'Pogo', 'Blistering', 'Broken',
        ].map(shapeBare),
        unsVariants: [
          'Finchy', 'Pixie Pinching', 'Twisted', 'Snapping', 'Arctic',
        ].map(shapeBare),
        antisymposium: [
          'Rooting / Rooted', 'Zoid',
        ].map(shapeBare),
        components: [
          'Ducking', 'Diving', 'Spinning', 'Inspinning', 'Gyro',
        ].map(shapeBare),
      },
    };
  },

  getCompositionalSetsPage(): PageViewModel<FreestyleCompositionalSetsContent> {
    // Sibling to getMovesPage. /freestyle/sets is the flat reference
    // table (look up a formula); /freestyle/compositional-sets is the
    // systematic exploration view. Shared dictionary-lookup pattern
    // resolves canonical trick slugs so cards can link out.
    const trickRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const trickSlugs = new Set<string>(trickRows.map(r => r.slug));

    const resolveCard = (
      raw: {
        name: string;
        notation: string;
        statusHint: 'canonical' | 'platform-tracked' | 'holden-only';
        structuralNote: string | null;
      },
    ): CompositionalSetCardView => {
      // Canonical resolution: a card is canonical iff its display
      // name (slugified) matches a live dictionary slug. The
      // statusHint is curator-locked for the 'platform-tracked' and
      // 'holden-only' buckets; the live check upgrades to 'canonical'
      // whenever a slug exists, regardless of hint.
      const slug   = movesAnchorSlug(raw.name);
      const isCanonical = trickSlugs.has(slug);
      const status: CompositionalSetCardView['status'] = isCanonical
        ? 'canonical'
        : raw.statusHint === 'canonical'
          ? 'platform-tracked'  // demote: hint said canonical but no slug
          : raw.statusHint;
      return {
        name:           raw.name,
        notation:       raw.notation,
        status,
        statusLabel:    status === 'platform-tracked' ? 'platform-tracked'
                      : status === 'holden-only'      ? 'Holden-only'
                      : null,
        showStatusBadge: status !== 'canonical',
        trickHref:      isCanonical ? `/freestyle/tricks/${slug}` : null,
        anchorId:       `compset-${slug}`,
        structuralNote: raw.structuralNote,
      };
    };

    const families: CompositionalSetFamilyView[] = COMPOSITIONAL_SET_FAMILIES.map(f => ({
      key:     f.key,
      name:    f.name,
      intro:   f.intro,
      members: f.members.map(resolveCard),
    }));

    const ladders: UptimeReinterpretationLadderView[] = UPTIME_REINTERPRETATION_LADDERS.map(l => ({
      setName:          l.setName,
      setNotation:      l.setNotation,
      reinterpretation: l.reinterpretation,
      steps:            l.steps,
      sourceCitation:   l.sourceCitation,
      conflictNote:     l.conflictNote,
      anchorId:         `ladder-${movesAnchorSlug(l.setName)}`,
    }));

    // Audit summary + curated headline rows. The full row-by-row audit
    // stays curator-internal;
    // the public view surfaces only enough to make the categories
    // legible. Counts are derived from the content module so they
    // can never drift from the underlying data.
    const auditStatusLabels: Record<CompositionalAuditEntryView['status'], string> = {
      'aligned':     'Aligned',
      'partial':     'Partial fit',
      'conflict':    'Conflict',
      'holden-only': 'Holden-only',
    };
    const auditSummary: CompositionalAuditSummary = {
      aligned:    COMPOSITIONAL_AUDIT_ENTRIES.filter(e => e.status === 'aligned').length,
      partial:    COMPOSITIONAL_AUDIT_ENTRIES.filter(e => e.status === 'partial').length,
      conflict:   COMPOSITIONAL_AUDIT_ENTRIES.filter(e => e.status === 'conflict').length,
      holdenOnly: COMPOSITIONAL_AUDIT_ENTRIES.filter(e => e.status === 'holden-only').length,
      total:      COMPOSITIONAL_AUDIT_ENTRIES.length,
    };
    // Curated headline rows: 2 aligned (showing strong + structural
    // alignment), 2 partial, the 1 conflict, 3 Holden-only (showing
    // variety). Order: alignment → partial → conflict → Holden-only.
    const headlineNames = new Set<string>([
      'Blurry',       // aligned, strongest match (Holden parenthetical = platform doctrine)
      'Terraging',    // aligned, decomposition-implied
      'Atomic',       // partial, ontological framing diverges
      'Nuclear',      // partial, basic-vs-compound framing
      'Surging',      // conflict, the single substantive disagreement
      'Bubba',        // Holden-only, structurally clean single-dex
      'Sailing',      // Holden-only, multi-dex with rich decomposition
      'Twisted',      // Holden-only, UNS category
    ]);
    const headlineRows: CompositionalAuditEntryView[] = COMPOSITIONAL_AUDIT_ENTRIES
      .filter(e => headlineNames.has(e.holdenName))
      .map(e => ({
        holdenName:      e.holdenName,
        holdenReading:   e.holdenReading,
        platformReading: e.platformReading,
        status:          e.status,
        statusLabel:     auditStatusLabels[e.status],
        note:            e.note,
      }));

    // Premise examples — same four shown in the glossary primer, with
    // canonical-link resolution applied here so the view can render
    // each as an operator card with proper cross-link when present.
    const premiseExamples = [
      { name: 'Pixie',    notation: 'TOE > SAME IN [DEX] >' },
      { name: 'Stepping', notation: 'CLIP > OP IN [DEX] >' },
      { name: 'Blurry',   notation: 'CLIP > OP IN [DEX] > OP OUT [DEX] >' },
      { name: 'Mobius',   notation: 'SET > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
    ].map(ex => {
      const slug = movesAnchorSlug(ex.name);
      return {
        name:      ex.name,
        notation:  ex.notation,
        trickHref: trickSlugs.has(slug) ? `/freestyle/tricks/${slug}` : null,
      };
    });

    return {
      seo: {
        title:       'Compositional Sets',
        description: 'Systematic exploration of how named freestyle sets compose from a small grammar: uptime reinterpretation ladders, family branching, and operator cards.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_compositional_sets',
        title:      'Compositional Sets',
        intro:      'How named sets compose from a small grammar.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Compositional Sets' },
        ],
      },
      content: {
        premise: {
          canonicalFormula: '(toe | clip) > [(same | op)(in | out) dexterity]* > (same | op)(toe | clip)',
          softenerNote:
            'The dictionary\'s operational notation system descends from this compositional grammar, ' +
            'extending it with additional movement primitives and modifiers: swirl/twirl, body modifiers ' +
            '(ducking, diving, spinning), no-plant variants (symposium), unusual surfaces, and ' +
            'torque-class hybrids. The base grammar covers a large central region of the trick language; ' +
            'the extensions reach into the rest.',
          examples: premiseExamples,
        },
        families,
        ladders,
        audit: {
          summary:      auditSummary,
          headlineRows,
          fullAuditNote:
            'The headline rows above sample each category. The full row-by-row ' +
            'audit (covering every entry in the corpus with source citations) ' +
            'lives in the curator workspace alongside the platform\'s content ' +
            'modules. It is reviewed before any Holden-only entry is promoted to ' +
            'canonical or any conflict is resolved.',
        },
        crossLinks: {
          setsReferenceHref:    '/freestyle/sets/reference',
          operatorsHref:        '/freestyle/operators',
          glossaryNotationHref: '/freestyle/glossary#operational-notation',
        },
      },
    };
  },

  // ── Operator board — Tier-1 movement-language vocabulary.
  // Renders on the freestyle landing page, glossary §3, and /freestyle/learn
  // via the same operator-board partial. Tiers (the 13 operators) are
  // surface-invariant; heading + lede vary per surface (see
  // OPERATOR_BOARD_PROSE). Captions are curator-confirmed except on cells
  // still flagged curatorConfirmPending.
  getOperatorBoard(surface: OperatorBoardSurface = 'landing'): OperatorBoardData {
    const op = (
      glyph: string,
      name: string,
      action: string,
      compositionA: string,
      compositionResult: string,
      destination: { href: string; label: string } | null,
      curatorConfirmPending = false,
    ): OperatorBoardOperator => ({
      glyph, name, action, compositionA, compositionResult, curatorConfirmPending,
      href:      destination?.href      ?? null,
      hrefLabel: destination?.label     ?? null,
    });
    const NOTATION    = (slug: string) => ({ href: `/freestyle/sets/reference#move-${slug}`, label: 'Notation reference' });
    const GLOSSARY    = (slug: string) => ({ href: `/freestyle/glossary#term-${slug}`,     label: 'Glossary entry'     });
    const MOD_PEDAGOGY = (slug: string) => ({ href: `/freestyle/modifier/${slug}`,          label: 'Modifier page'      });

    // Every action string
    // is compressed to 4–10 words. The card hierarchy on the rendered surface
    // is glyph → name → INPUT → RESULT → action → deeplink — examples carry
    // the compositional teaching; actions annotate, not lecture.
    return {
      ...OPERATOR_BOARD_PROSE[surface],
      tiers: [
        {
          key:     'set',
          eyebrow: 'I · Sets',
          title:   'Set operators',
          intro:   'What sends the bag into the air.',
          operators: [
            op('PIX',   'Pixie',    'Same-side, in-direction toe-set dex.',          'PIX + BUTTERFLY',         'DIMWALK',            NOTATION('pixie')),
            op('AT',    'Atomic',   'Opposite-side, out-direction toe-set dex.',     'AT + MIRAGE',             'ATOM SMASHER',       NOTATION('atomic')),
            op('Q',     'Quantum',  'Opposite-side, in-direction toe-set dex.',      'Q + MIRAGE',              'TOE BLUR',           NOTATION('quantum')),
            op('BL',    'Blurry',   'Stepping + Paradox; flat +1 ADD.',              'BLURRY + WHIRL',          'BLURRY WHIRL',       GLOSSARY('blurry')),
            op('FAIRY', 'Fairy',    'Same-side, out-direction toe-set dex.',         'FAIRY + DRIFTER',         'FAIRY DRIFTER',      NOTATION('fairy')),
            op('STEP',  'Stepping', 'Plant foot relocates between set and catch.',   'STEP + BUTTERFLY',        'RIPWALK',            GLOSSARY('stepping')),
          ],
        },
        {
          key:     'body',
          eyebrow: 'II · Body',
          title:   'Body operators',
          intro:   'What the body does while the bag is up.',
          operators: [
            op('SPIN',  'Spinning',   'Full-body 360° rotation through the dex moment.', 'SPIN + BUTTERFLY',      'SPINNING BUTTERFLY', MOD_PEDAGOGY('spinning')),
            op('GY',    'Gyro',       'Half-rotation body modifier (180°).',           'GY + TORQUE',             'MOBIUS',             NOTATION('gyro')),
            op('DUCK',  'Duck / Dive','Head dip or arc; duck/dive/weave/zulu family.', 'PIX + DUCK + BUTTERFLY', 'PHOENIX',           MOD_PEDAGOGY('ducking')),
            op('PDX',   'Paradox',    'Hip pivot between two dexes; body switches sides.', 'PDX + LEG-OVER',     'PARADOX LEG-OVER',   MOD_PEDAGOGY('paradox')),
            op('SYMP',  'Symposium',  'Active leg jumps + lands solo while the other holds.', 'SYMP + ILLUSION', 'FLAIL',              GLOSSARY('symposium'), true),
          ],
        },
        {
          key:     'structural',
          eyebrow: 'III · Structure',
          title:   'Structural concepts',
          intro:   'Relationships across the trick.',
          operators: [
            op('XBODY', 'Cross-body','The bag crosses one plane around the body.',   'XBODY + MIRAGE',          'WHIRL',              null),
            op('SAME',  'Same-foot','Set foot = catch foot.',                        'SAME + BUTTERFLY',        'SAME-FOOT BUTTERFLY', null),
          ],
        },
      ],
    };
  },

  getLandingPage(): PageViewModel<FreestyleLandingContent> {
    const typeCounts = runSqliteRead('freestyleRecords.countPublicByType', () =>
      freestyleRecords.countPublicByType.all() as { record_type: string; n: number }[],
    );

    const trickRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );

    const totalRecords = typeCounts.reduce((sum, r) => sum + r.n, 0);

    const tricksMosaic = TRICKS_MOSAIC.map((atom) => {
      const clip = loadCuratorDemoVideo(mosaicClipFilename(atom.slug));
      return {
        slug: atom.slug,
        label: atom.label,
        href: `/freestyle/tricks/${atom.slug}`,
        mp4Url: clip?.mp4Url ?? null,
        posterUrl: clip?.posterUrl ?? null,
      };
    });

    const { cards: byTheNumbers, note: byTheNumbersNote } = buildFreestyleByNumbers(
      trickRows,
      runSqliteRead('freestyleTrickModifiers.listTricksByModifier', () =>
        freestyleTrickModifiers.listTricksByModifier.all() as FreestyleTrickModifierLinkRow[],
      ),
    );

    // Gate the Media-section gallery links on the gallery being seeded so the
    // landing never renders a broken link in an environment that lacks them.
    const galleryHref = (id: string): string | null =>
      runSqliteRead('media.getNamedGalleryById', () => media.getNamedGalleryById.get(id))
        ? `/media/${id}`
        : null;
    const mediaRecordsHref = galleryHref('gallery_passback_records');
    const mediaCuratedHref = galleryHref('gallery_curated_freestyle_tricks');
    const mediaShredHref = galleryHref('gallery_individual_shred_videos');

    return {
      seo: {
        title: 'Freestyle',
        description: 'Freestyle footbag: what it is, how to start, and the records, competition, and history behind the sport.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_landing',
        title:      'Freestyle Footbag',
        intro: 'Learn the movements, watch the sport, and explore the trick vocabulary.',
      },
      content: {
        mascotSrc: '/img/freestyle-mascot.svg',
        mascotAlt: 'Freestyle footbag mascot icon',
        intro: {
          heading: 'What is Freestyle Footbag?',
          paragraphs: [
            // Movement-language framing. The landing carries
            // only short framing; the glossary §1 "Language of Freestyle"
            // band covers compositional grammar in depth. No em dashes,
            // no historical filler, no overconfident atom counts.
            'Freestyle footbag is a movement discipline. Players link sequences of tricks: body actions like spins, jumps, and ducks layered over circling motions of the legs around a small bag held aloft by repeated foot contact. The bag traces an unbroken path through the air; the body moves around it.',
            'Trick names are compositional. A name like "spinning whirl" literally encodes structure: a body spin layered on top of the whirl base. Once you know the parts, you can read most trick names before you have ever seen the trick performed.',
            'The vocabulary builds from a small set of foundational moves that compose richly. Stalls (the bag at rest on the top of the foot, the side of the foot, or other body surfaces). Dexterities (circling motions of a leg around the bag). Body modifiers (spins, ducks, jumps, steps). Structural sets (the launching motion that opens the trick). Combinations are nearly endless, and the language of freestyle is what makes the combinations legible.',
          ],
        },
        demoVideo: loadCuratorDemoVideo('demo-freestyle.mp4'),
        // Merged Featured strip:
        // Competition Formats (4) + Demonstrations (2) rendered as one
        // compact curated grid. Formats lead because they're conceptual
        // anchors of the vocabulary; demonstrations follow as exemplars.
        // No prose paragraphs — captions are one-line context max.
        featured: [
          {
            key:     'routine',
            title:   'Routine',
            caption: 'Choreographed performance to music.',
            media:   expandYouTubeVideo('Z-KkyOpoBhM', 'Yoshihito Yamamoto, Worlds Online 2020 Qualification Routine'),
            tags:    [],
          },
          {
            key:     'circle',
            title:   'Circle',
            caption: 'Turn-based show-off format.',
            media:   expandYouTubeVideo('aMr5e5wlgeE', 'Worlds 2017 Open Circle Finals'),
            tags:    [],
          },
          {
            key:     'sick3',
            title:   'Sick 3',
            caption: 'Best-trick chain of three.',
            media:   expandYouTubeVideo('h6F0aPIpC1o', 'World Footbag Championships 2022: Sick 3'),
            tags:    [],
          },
          {
            key:     'shred30',
            title:   'Shred 30',
            caption: 'Thirty-second technical scoring.',
            media:   expandYouTubeVideo('wb75xzvAs68', 'Taishi Ishida, World Footbag Championships 2020 Shred 30'),
            tags:    [],
          },
          {
            key:     'reese-1988',
            title:   '1988 World Footbag Championships: Freestyle Routine',
            caption: 'Featuring Rick Reese (a representative of early freestyle).',
            media:   expandYouTubeVideo('Zdplm0_RaNY', 'Rick Reese, Worlds 1988 Freestyle Routine'),
            tags:    shapeMediaTagsForBrowse(
                       ['#freestyle', '#footbag_hof_archive', '#worlds_1988'],
                     ),
          },
          {
            key:     'conlon-1998',
            title:   "1998 World Footbag Championships Women's Freestyle Finals",
            caption: 'Samantha Conlon and Carol Wedemeyer.',
            media:   expandYouTubeVideo('2URvZFuxBls', "1998 Worlds Women's Freestyle Finals"),
            tags:    shapeMediaTagsForBrowse(
                       ['#freestyle', '#footbag_hof_archive'],
                     ),
          },
          {
            key:     'worlds-2023-team',
            title:   'World Footbag Championships 2023: Team Freestyle Finals (1st Place)',
            caption: 'Scott Davidson and Tuan Vu. Medellín, Colombia.',
            media:   expandYouTubeVideo('xoDEvsbQDYk', 'Worlds 2023 Team Freestyle Finals, 1st Place'),
            tags:    shapeMediaTagsForBrowse(
                       ['#freestyle', '#worlds_2023', '#team'],
                     ),
          },
          {
            key:     'san-marino-2026',
            title:   'Footbag 2026: San Marino',
            caption: 'Featuring Jim Penske; footage by jay7bah.',
            media:   expandYouTubeVideo('U6J2LXxUWro', 'Footbag 2026: San Marino'),
            tags:    shapeMediaTagsForBrowse(
                       ['#freestyle', '#by_jay7bah'],
                     ),
          },
        ],
        totalTricks:  trickRows.length,
        totalRecords,
        tricksMosaic,
        tricksMosaicHasClips: tricksMosaic.some((c) => c.mp4Url !== null),
        byTheNumbers,
        byTheNumbersNote,
        mediaRecordsHref,
        mediaCuratedHref,
        mediaShredHref,
      },
    };
  },
};
