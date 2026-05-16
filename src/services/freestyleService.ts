import {
  FreestyleLeaderRow, FreestyleRecordRow, FreestyleTrickRow, FreestyleTrickModifierRow,
  FreestyleTrickRowWithStatus, FreestyleTrickRowWithParse,
  FreestyleTrickAliasRow, FreestyleMediaCoveredSourceRow,
  FreestyleTrickModifierLinkRow, FreestyleTrickModifierLinkDetailRow,
  FreestyleCompetitorRow, FreestyleEraRow, FreestyleRecentEventRow,
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
} from '../content/freestyleOperatorReference';
import {
  BASIC_COMPONENTS,
  CORE_TRICK_SPEC,
} from '../content/freestyleLandingContent';
import {
  getSymbolicEquivalenceChain,
} from '../content/freestyleSymbolicEquivalences';
import {
  filterAliasesForBrowse,
} from '../content/freestyleAliasGovernance';
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
  InsightsDifficultyEra,
  FreestyleHistoryPioneer,
  FreestyleHistoryEra,
  INSIGHTS_MOST_USED,
  INSIGHTS_CONNECTORS,
  INSIGHTS_TRANSITIONS,
  INSIGHTS_SEQUENCES,
  INSIGHTS_DIVERSE_PLAYERS,
  INSIGHTS_DIFFICULTY_ERAS,
  INSIGHTS_NARRATIVES,
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
// Restraint-first: maintainer-named hard requirement 2026-05-14. Hashtag
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
  heading: string;
  paragraphs: string[];
}

export interface FreestyleGetStartedTile {
  label: string;
  href: string;
  comingSoon: boolean;
}

export interface FreestyleDemoVideo {
  mp4Url: string;
  posterUrl: string;
  caption: string;
}

// ── The Language of Freestyle Footbag — landing intro structure ───────────
// Per the IA realignment plan, the landing intro replaces a prose paragraph
// block with a Basic Components grid (Contact / Set / Dex / Spin / Duck /
// Delay) and a Core Tricks grid (eleven irreducible base tricks rendered as
// compact symbolic objects). The shapes below are view-model types only; the
// canonical sources are PassBack glossary (Basic Components labels + Dex
// sub-fields) and `freestyle_tricks` / `freestyle_trick_aliases` (Core
// Tricks data).
export interface FreestyleBasicComponentSubfield {
  label:  string;     // e.g. "Direction"
  values: string[];   // e.g. ["in-out", "out-in"]
}

export interface FreestyleBasicComponent {
  key:         string;                              // slug-form, e.g. "dex"
  name:        string;                              // display, e.g. "Dex"
  description: string;                              // concise PB-adapted definition
  subfields:   FreestyleBasicComponentSubfield[];   // empty when no sub-fields
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
// "Featured" strip (SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / C). The
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

export interface FreestyleLandingContent {
  mascotSrc: string;
  mascotAlt: string;
  intro: FreestyleLandingExplainer;
  demoVideo: FreestyleDemoVideo | null;
  // Three new structured surfaces (Batch 2 IA realignment):
  basicComponents: FreestyleBasicComponent[];
  coreTricks:      FreestyleCoreTrickCard[];
  // Merged Featured strip (SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / C):
  // formats + curated demonstrations rendered in one compact grid. Empty
  // array hides the section content.
  featured:        FreestyleFeaturedItem[];
  operatorBoard: OperatorBoardData;
  getStartedTiles: FreestyleGetStartedTile[];
  totalRecords: number;
  recordTypes: number;
  topHolders: FreestyleLeaderViewModel[];
  recentRecords: FreestyleRecordViewModel[];
  totalTricks: number;    // count of tricks in dictionary
  totalEvents: number;    // count of freestyle events from canonical results
}

// ── Operator Board ──────────────────────────────────────────────────────
// The landing-page mini-board introduces the Tier-1 operator vocabulary
// (14 operators across set / body / structural tiers). Sketch captions
// per OPERATOR_BOARD_MOCKUP_REVIEW.md §B; cells with curatorConfirmPending=true
// require a curator accuracy pass before any prose lock.
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
  // SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / D: ledes compressed from
  // ~25–30 words to one short sentence each; the tier eyebrow + card grid
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
  // Equivalence layer fields:
  readings:              SemanticNotationReading[];
  curatorConfirmPending: boolean;
  // Base-lineage layer fields:
  baseSlug:              string | null;
  baseName:              string | null;
  // Source attribution (const literal; never claims parser provenance)
  sourceLabel:           'editorial';
}

// Phase 1 cross-link surface for /freestyle/sets. Each row carries the
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
};

// Single source-of-truth tier registry for the badge logic and the
// trick-detail Reference Media split (Tutorials vs Demos). Phase 2a
// consolidated the prior TUTORIAL_SOURCE_IDS / DEMO_SOURCE_IDS Sets here
// so all source-id classification reads from one map; per-clip override
// (sidecar `tier` field → DB) is deferred to Phase 2c.
//
// Tier semantics:
//   - TUTORIAL:      explicit teaching intent (technique cues, breakdown).
//                    Drives "Tutorial available" badge and tutorialMedia bucket.
//   - DEMONSTRATION: single-clip "what the trick looks like done well" —
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

  // Mixed-character sources held at TUTORIAL pending Phase 2d per-clip
  // review. Blanket reclass would lose real instructional clips; the
  // proper fix needs the per-clip override path landing in Phase 2c.
  anz_trikz:             'TUTORIAL',
  footbagspot_passback:  'TUTORIAL',

  // Demonstration sources — single-trick showcase clips with no teaching
  // intent. shred_global reclassified Phase 2b (was TUTORIAL): every
  // entry is a single-trick demo by Paweł Ścierski / Will Digges /
  // Mike Angeski et al. with the caption pattern
  //   "Footbag Freestyle Trick: <name> (<add>add) by <player>".
  shred_global:          'DEMONSTRATION',
  footbag_finland:       'DEMONSTRATION',
  flipsider_footbag:     'DEMONSTRATION',

  // Record-tier — never bucketed as Tutorial/Demo on trick-detail.
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

// SURFACE-COMPRESSION-REALIGNMENT-1 Phase 2 / G: shared core-tricks shaper.
// Both getLandingPage and getGlossaryPage (§10) build the same compact
// symbolic-object grid; the helper centralizes the join between the
// curator-authoritative CORE_TRICK_SPEC and the freestyle_tricks DB rows
// (ADD value + optional symbolic notation).
function shapeCoreTricks(trickRows: FreestyleTrickRow[]): FreestyleCoreTrickCard[] {
  return CORE_TRICK_SPEC.map(spec => {
    const row = trickRows.find(t => t.slug === spec.slug);
    const parsedAdd = row && row.adds != null ? Number(row.adds) : NaN;
    const hasAdd = Number.isFinite(parsedAdd);
    // OP-NOTATION-WAVE-1A Bridge 1 (2026-05-15): surface the row's
    // operational_notation on the core-tricks grid (atom-layer per §13.9
    // for foundational rows; compound-layer per §13.2–§13.8 elsewhere).
    // Null when the row carries no notation yet — template suppresses the
    // notation slot in that case.
    const opNotation = row?.operational_notation?.trim();
    return {
      slug:                 spec.slug,
      displaySlug:          spec.displaySlug ?? spec.slug,
      semanticEquivalences: [...spec.equivalences],
      symbolicNotation:     opNotation && opNotation.length > 0 ? opNotation : null,
      addNumeric:           hasAdd ? parsedAdd : null,
      addPending:           !hasAdd,
    };
  });
}

// Phase 2 / H: set-modifier registry shaper. Projects (a) the Tier-1 set
// operators from the operator board + (b) intermediate set/compound-set
// entries from OPERATOR_REFERENCE_ENTRIES onto one flat
// FreestyleSetModifierEntry[] for the glossary §10 grid. De-dup: when a
// slug appears in both sources, the OPERATOR_REFERENCE entry wins (its
// `oneLineMeaning` + `decomposition` carry richer registry content).
function shapeSetModifiers(board: OperatorBoardData): FreestyleSetModifierEntry[] {
  const setTier = board.tiers.find(t => t.key === 'set');
  const tierEntries: FreestyleSetModifierEntry[] = (setTier?.operators ?? []).map(op => ({
    slug:           op.name.toLowerCase().replace(/\s+/g, '-'),
    name:           op.name,
    glyph:          op.glyph,
    oneLineMeaning: op.action,
    decomposition:  null,
    href:           op.href,
  }));
  const intermediateEntries: FreestyleSetModifierEntry[] = OPERATOR_REFERENCE_ENTRIES
    .filter(e => e.category === 'set' || e.category === 'compound-set')
    .map(e => ({
      slug:           e.slug,
      name:           e.name,
      glyph:          null,
      oneLineMeaning: e.oneLineMeaning,
      decomposition:  e.decomposition,
      href:           null,
    }));
  // De-dup by slug, intermediate-wins (richer data).
  const bySlug = new Map<string, FreestyleSetModifierEntry>();
  for (const e of tierEntries)         bySlug.set(e.slug, e);
  for (const e of intermediateEntries) bySlug.set(e.slug, e);
  return [...bySlug.values()];
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
  // wording cannot conflate them (Phase 3). When only demos exist the user
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
        href: '#reference-media',
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

/** Returns the canonical trick slug (or null if no row exists). Walks aliases once. */
function resolveTrickSlug(slug: string): string | null {
  const direct = freestyleTricks.getAnyStatusBySlug.get(slug) as
    | { slug: string }
    | undefined;
  if (direct) return direct.slug;
  const aliasRow = freestyleTrickAliases.getCanonicalForAlias.get(slug) as
    | { trick_slug: string }
    | undefined;
  if (aliasRow) {
    const target = freestyleTricks.getAnyStatusBySlug.get(aliasRow.trick_slug) as
      | { slug: string }
      | undefined;
    return target ? target.slug : null;
  }
  return null;
}

/** 'active' | 'pending' | 'unknown' for status taxonomy decisions. */
function lookupDictStatus(slug: string): 'active' | 'pending' | 'unknown' {
  const direct = freestyleTricks.getAnyStatusBySlug.get(slug) as
    | { is_active: number }
    | undefined;
  if (direct) return direct.is_active === 1 ? 'active' : 'pending';
  const aliasRow = freestyleTrickAliases.getCanonicalForAlias.get(slug) as
    | { trick_slug: string }
    | undefined;
  if (!aliasRow) return 'unknown';
  const target = freestyleTricks.getAnyStatusBySlug.get(aliasRow.trick_slug) as
    | { is_active: number }
    | undefined;
  if (!target) return 'unknown';
  return target.is_active === 1 ? 'active' : 'pending';
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
  // UX3c-b (2026-05-11): same family-member set as `familyMembers`, regrouped
  // by ADD value for tier-grouped rendering. Numeric tiers sort ascending;
  // non-numeric/null tier renders last as "Modifiers".
  familyTiers: FreestyleFamilyTier[];
  // Related Tricks (R1 same-family → R2 modifier-prefix → R3 grandparent),
  // ADD-bucket sampled within each rule, capped at 8. Empty when no dict entry.
  // This is the CANONICAL (Layer 1) IFPA-family-based relating.
  relatedTricks: FreestyleRelatedTrick[];
  // Observational symbolic-grammar topology panel (Layer 3). Null when:
  //   - slug is not in the UX-SHIP-1 Phase 1 allow-list (8 flagship slugs)
  //   - slug has no topology-axis group membership in the staging CSVs
  //   - the resolved topology group has no other active members after self-exclude
  // Distinct from `relatedTricks`: this surfaces SYMBOLIC topology (cross-cuts
  // IFPA family) rather than canonical family-based relating.
  // Per UX-SHIP-1 Phase 4 (Task B); observational layer per SYMBOLIC-GRAMMAR-2.
  symbolicRelatedTopology: SymbolicRelatedTopologyPanel | null;
  // Observational educational CTAs (DISCOVERABILITY phase). Trick-membership-
  // driven; empty array when no symbolic surface is relevant for this slug.
  // Renders subordinate to the canonical Related Tricks + Related Topology
  // panels. Currently triggers: butterfly-wing-topology → walking progression;
  // spinning-family / whirl-rotational-topology → spinning modifier page.
  symbolicEducationCtas: SymbolicEducationCta[];
  // UX-SHIP-1 Phase 5: reverse semantic linkage. Topology + component
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
  // Notation grammar diagnostic panel (Phase 3 read-only surface). Null when
  // the row has no structural_parse_json — page renders identically to before.
  notationGrammar: NotationGrammarPanel | null;
  // Phase 6 role-aware notation rendering. Pre-shaped tokens with role
  // classification + educational tooltip text. Null when notation is empty.
  // Display-only; never affects parser output or ADD math.
  notationDisplay: NotationDisplay | null;
  // NF-2B semantic-notation fallback ladder. Coexists with notationDisplay
  // (Layer 1); the ladder picks layer='equivalence' / 'base-lineage' /
  // 'curation-gap' or returns null (Layer 4 silence). See shapeSemanticNotation.
  semanticNotation: SemanticNotation | null;
  // O1a/O1b (2026-05-10) operational notation block. Renders in the
  // "Set notation (operational)" section between semantic notation and
  // editorial decomposition. Null when the row has no operational_notation
  // populated; section omits entirely when null. O1b adds role-classified
  // token highlighting (warm palette, distinct from semantic's cool palette);
  // see exploration/footbagmoves-federation/RENDERING_SURFACE_PROPOSAL.md
  // and src/services/operationalNotationRendering.ts.
  operationalNotation: OperationalNotation | null;
  // UX2 single-page pilot (2026-05-11). Populated only for the flagship
  // pilot trick (montage). Null for every other trick so the legacy template
  // continues to render unchanged. When populated, the universal shell
  // renders the UX2 section sequence instead of the legacy ordering.
  ux2Pilot: Ux2PilotData | null;
  // UX3b0 density classification (2026-05-11). Derived from existing data only
  // (modifier count, notation presence, operational notation presence, records,
  // media, ux2Pilot data presence). Read-only signal at UX3b0; future phases
  // use this to gate flagship-only visual surfaces (token-coloured h1,
  // modifier-layering visualisation, modifier-ecosystem panel) without per-slug
  // allowlists. Does not change rendering in UX3b0.
  densityTier: 'sparse' | 'standard' | 'flagship';
  // UX3c-a (2026-05-11): pre-shaped gate signal for the unified Media block.
  // True when either curated reference media exists (tutorial/demo grids
  // populated) OR editorial prose is authored (ux2Pilot non-null, signalling
  // the row deserves a flagship Media section with empty-state body).
  hasMediaBlock: boolean;
  // UX3c-c (2026-05-11) hero quick-stat ADD-derivation strip tokens; null when
  // the trick is a modifier-only row or has no numeric adds. Built from
  // freestyle_trick_modifier_links + base_trick adds + this row's adds.
  // Renders in the hero immediately below the hero-stats chips.
  heroFormula: HeroFormulaToken[] | null;
  // UX3d-a (2026-05-11) hero decomposition strip tokens; null when
  // modifier_links.length < 2. Renders between h1 and family-badge as a
  // prominent coloured-token row mirroring the original prototype's title
  // decomposition. Pure presentation; augments the title, does not replace.
  heroDecomposition: HeroDecompositionToken[] | null;
  // UX3d-b (2026-05-11) nested modifier-layering visualisation; null when
  // modifier_links.length < 3. The single panel renders below the operational
  // notation block; only Montage clears the threshold in the current
  // dictionary. Pure presentation.
  modifierLayering: ModifierLayering | null;
  // UX3d-c (2026-05-11) pre-shaped flag: true when the trick has at least one
  // modifier_links row. Used by trick-about.hbs to suppress the redundant
  // "ADD value" dl row on compound rows where the hero formula + modifier
  // layering already surface the total.
  hasModifierLinks: boolean;
  // UX3e-b (2026-05-11) parallel tricks panel data; empty array when no
  // parallels exist (atoms; tricks at unique adds within their family).
  // Cap 4 rows. Rendered between Related Tricks and the Media block as a
  // navigation surface, not a recommendation surface.
  parallelTricks: ParallelTrick[];
  // UX3e-b (2026-05-11) modifier substitutions panel data; empty array when
  // no substitution candidates exist. Cap 4 rows. Rendered immediately after
  // parallelTricks. The swap visualisation is the load-bearing signal:
  // "replace ducking with spinning and you get Spender."
  substitutions: ModifierSubstitution[];
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
  href: string | null;           // jump-link target ('#reference-media', '#passback-records', or family filter)
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
  // UX3c-c (2026-05-11) display-only fields for hero quick-stat formula.
  modifierType: string;         // 'body' | 'set' | other; sourced from freestyle_trick_modifiers.modifier_type
  cssRole: string;              // semantic-notation cssRole for token coloration: 'set' | 'rotation' | 'modifier'
}

// UX3c-c (2026-05-11): hero quick-stat ADD-derivation strip.
// One token sequence rendered in the hero, immediately below the hero-stats
// chips, summarising "modifier(+w) + ... + base(N) = TOTAL ADD" with each
// operand role-coloured (cool palette). Atom rows (no modifiers) render the
// short form: "trick-name = N ADD". Rendered by trick-hero.hbs as a single
// quiet line; no h2; no surrounding card. Pure presentation; never affects
// ADD math (asserted ADD remains editorial truth).
export interface HeroFormulaToken {
  kind: 'modifier' | 'base' | 'operator' | 'result';
  text: string;          // displayed token text
  weight: string | null; // muted parenthetical weight, e.g. "(+2)" or "(3)"; null for operators/result
  cssRole: string | null;// 'set' | 'rotation' | 'modifier' | 'core-family'; null for operators/result
}

// UX3d-a (2026-05-11) hero decomposition strip. Prominent role-coloured token
// row rendered between the h1 and the family badge for compound tricks where
// modifier_links.length >= 2. Augments the existing plain h1 (preserves
// readability and accessibility); does not replace the title text. Atom rows
// and 1-modifier compounds render null (plain h1 only). Pure presentation.
export interface HeroDecompositionToken {
  text: string;          // modifier or base name (lowercase, as in canonical_name)
  cssRole: string;       // 'set' | 'rotation' | 'modifier' | 'core-family'
  kind: 'modifier' | 'base';
}

// UX3e-b (2026-05-11) relationship surfaces.
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

// UX3d-b (2026-05-11) modifier layering. Prototype-inspired nested-box
// visualisation surfacing how modifiers stack onto the base trick. Activates
// only when modifier_links.length >= 3 (flagship-density threshold from the
// UX3 north-star §9.4). Each ModifierLayer wraps the next deeper layer; the
// innermost layer is the base trick (kind='base'). Rendered by the recursive
// partial src/views/partials/trick-modifier-layer.hbs. Pure presentation.
export interface ModifierLayer {
  kind: 'modifier' | 'base';
  name: string;            // lowercase token
  weight: string;          // '(+1)' for modifiers; '(3)' for base; empty when unknown
  cssRole: string;         // 'set' | 'rotation' | 'modifier' | 'core-family'
  inner: ModifierLayer | null;  // deeper layer; null at the base
}

export interface ModifierLayering {
  rootLayer: ModifierLayer; // outermost wrapper; recurse via `inner` to the base
  totalLabel: string;       // 'N ADD' summary line under the nested boxes
}

// ── Notation grammar (Phase 3, read-only display) ────────────────────────────
// Diagnostic surface for the structured-parse columns (Phase 0 schema, Phase 1/2/2.5
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
// decomposition view alongside the parser-derived one. Phase 5a (Architecture
// B1 strict): consults ONLY the explicit join table + base column. Does NOT
// re-tokenize canonical_name and does NOT parse description text. Always
// labeled `sourceLabel='editorial'` so the template can never present this
// claim as parser output.
//
// Forever-rules preserved (per PHASE5_STATUS_SHAPE_CONSULTS.md §7):
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

  // Two role layers per Phase 2.5: descriptive (what each token classified as
  // pre-D1) and add-contributing (post-D1, used for ADD math). Empty buckets
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
    description: 'The trick is its own canonical anchor; computed ADD equals the asserted value tautologically — a different kind of agreement than a structural derivation.',
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

// Editorial-decomposition shaping. Phase 5a (Architecture B1 strict):
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
// Forever-rules (PHASE5_STATUS_SHAPE_CONSULTS.md §7):
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

function tokenizeEquivalenceReading(reading: string): SemanticNotationToken[] {
  return reading
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map((token): SemanticNotationToken => {
      const normalized = token.toLowerCase();
      if (RECOGNIZED_LINK_SLUGS.has(normalized)) {
        return { kind: 'link', text: token, href: `/freestyle/glossary#term-${normalized}` };
      }
      return { kind: 'plain', text: token, href: null };
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

  // Unresolved tokens live inside descriptive_roles (Phase 2.5); flatten the
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

// UX3c-b (2026-05-11): family lineage grouped by ADD value. Numeric tiers sort
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

// Three-state media-coverage indicator for the trick-dictionary ADD view:
//   'tutorial' — at least one tutorial-tier source covers this trick
//   'demo'     — only demo-tier or record-tier sources cover (no tutorial)
//   'none'     — no media links exist for this trick
export type TrickMediaCoverage = 'tutorial' | 'demo' | 'none';

export interface FreestyleTrickIndexRow {
  slug: string;
  canonicalName: string;
  hashtag: string;              // derived presentation token: '#' + slug with hyphens stripped
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
  isExternalOnly: boolean;      // true when row is is_active=0 + review_status='pending' (external placeholder)
  statusBadge: string | null;   // pre-shaped status text; null for plain canonical rows
  placeholderNote: string | null; // pre-shaped note rendered under the row when isExternalOnly = true
}

export interface FreestyleTrickGroup {
  category: string;
  label: string;
  tricks: FreestyleTrickIndexRow[];
  // DSC-2 slice 3B: shared symbolic trick cards; spreadsheet retired.
  // ADD ascending then trick name alphabetical.
  cards: DictionaryTrickCard[];
  anchorId: string;   // `category-{slug}`
}

// ADD-grouped bucket for the beginner/default view. addNumeric is null for
// the "Unrated / unresolved" bucket; otherwise an integer 0..9.
export interface FreestyleTrickAddGroup {
  addNumeric: number | null;
  addLabel: string;            // pre-shaped: '1 ADD', '2 ADD', '0 ADD', 'Unrated / unresolved'
  tricks: FreestyleTrickIndexRow[];
  // DSC-2 slice 1: shared symbolic trick cards. Built alongside the legacy
  // `tricks` rows so other views can continue rendering inline markup while
  // the By ADD view migrates to the dictionary-trick-card partial.
  cards: DictionaryTrickCard[];
}

// ─────────────────────────────────────────────────────────────────────────
// DictionaryTrickCard — the canonical symbolic trick card view-model.
//
// Per DICTIONARY-SYMBOLIC-CARD-1 / SYMBOLIC_CARD_SPEC.md: one card system,
// progressive density, operational notation as the visual center of gravity.
// Used by the By ADD view in slice 1; future slices migrate the remaining
// browse modes onto the same shape.
// ─────────────────────────────────────────────────────────────────────────

export interface DictionaryTrickCard {
  slug:                       string;
  displayName:                string;                        // canonical_name
  href:                       string;                        // /freestyle/tricks/:slug ; suppressed when external-only placeholder
  adds:                       string | null;                 // numeric string for display; null when unrated
  addsLabel:                  string;                        // pre-shaped: '4 ADD' / '— ADD' (never empty)
  // Symbolic-equivalence readings rendered as `≡ <reading>` lines above the
  // notation row. Merged from two sources, both curator-authored and
  // restraint-governed (no DB-data leakage):
  //   1. freestyleSymbolicEquivalences.ts — compound chains (mobius, etc.)
  //   2. freestyleAliasGovernance.ts — atom-level canonical aliases (ATW, etc.)
  // Empty array when neither source has an entry; the template suppresses
  // the row in that case.
  symbolicEquivalences:       string[];
  operationalNotation:        OperationalNotation | null;    // role-tagged tokens; null when pending
  operationalNotationStatus:  'available' | 'pending';
  commonAliases:              string[];                      // service-side "common aliases only" filter applied here
  isExternalOnly:             boolean;                       // suppresses href; renders placeholder shell
  statusBadge:                string | null;                 // adjudication-state badge for external placeholders
  placeholderNote:            string | null;                 // adjudication-state explainer (status, not prose description)
  hasRecords:                 boolean;                       // tiny indicator only; not visually load-bearing
  hasReferenceMedia:          boolean;                       // true when any tutorial/demo media exists
  mediaCoverage:              TrickMediaCoverage;            // 'tutorial' | 'demo' | 'none' — drives optional chip
  trickFamily:                string | null;                 // reserved for future family-axis affordance
}

export interface FreestyleTricksCoverageSummary {
  canonicalCount: number;          // active rows (review_status != 'pending')
  pendingInternalCount: number;    // is_active=0 rows authored internally; reserved for future
  externalOnlyCount: number;       // is_active=0 + review_status='pending' (external placeholders)
  sourcesLoaded: string[];         // human-readable source names with local data
  sourcesUnavailable: string[];    // human-readable source names not yet loaded
  transparencyNote: string;        // pre-shaped: 'External-source placeholders are shown for transparency...'
}

export type FreestyleTricksActiveView = 'add' | 'family' | 'category' | 'sets' | 'component' | 'topology';

// One row in the ?view=sets projection. Each set/modifier carries the list
// of canonical tricks that use it via freestyle_trick_modifier_links.
// modifierType ('set' | 'body' | 'rotational-qualifier') drives the
// section-header grouping in the template.
export interface FreestyleSetGroup {
  modifierSlug: string;
  modifierName: string;
  modifierType: string;
  addBonus: number;
  addBonusRotational: number;
  tricks: FreestyleTrickIndexRow[];
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
// ComponentBrowseView (DSC-2 slice 3A).
//
// Browses tricks grouped by the structural component they share. Slice 3A
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
// TopologyBrowseView (DSC-2 slice 3 — topology axis).
//
// Pedagogically-grounded, high-confidence educational groups. Memberships
// computed deterministically from existing data (base_trick + modifier_links
// + a small curator-tagged dex-class map for hippy/leggy).
//
// The 6 CSV-defined topology groups in symbolic_topology_groups.csv are NOT
// surfaced here; those are an advanced taxonomy and stay deferred. The slice
// deliberately starts with a small, learner-friendly set per strategic
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

export interface FreestyleTricksIndexContent {
  // Default beginner/ADD view (always shaped; rendering controlled by activeView).
  addGroups: FreestyleTrickAddGroup[];
  coverage: FreestyleTricksCoverageSummary;
  activeView: FreestyleTricksActiveView;

  // Existing category-grouped view, preserved for ?view=category.
  groups: FreestyleTrickGroup[];
  familyGroups: FreestyleFamilyGroup[];  // compound tricks grouped by family (for family-browsing section)
  // Sets-grouped view: dictionary tricks bucketed by which modifier(s) they
  // use. Drives ?view=sets. Empty when no active tricks have modifier_links.
  setGroups: FreestyleSetGroup[];
  // DSC-2 slice 3A: component view (?view=component). Body + set modifier
  // axes only; topology + archetype axes deferred to a later slice.
  componentView: ComponentBrowseView;
  // DSC-2 slice 3-topology: topology view (?view=topology). Six pedagogically-
  // grounded educational groups computed from existing data (base_trick +
  // modifier_links + curator-tagged dex-class map). Observational layer.
  topologyView: TopologyBrowseView;
  modifiers: FreestyleModifierEntry[];   // body/set modifier reference table
  totalTricks: number;
  dictNote: string;                      // small subtle note rendered above the categories
  activeFamily: string | null;           // when set, dictionary is filtered to this family only (hashtag-click filter)
  // Empty unless activeFamily is set AND the family has modifier-linked tricks.
  relatedSetGroups: FreestyleRelatedSetLink[];
}

export interface FreestyleFamilyGroup {
  familySlug: string;
  familyName: string;         // capitalized family name (e.g. "Whirl")
  members: FreestyleTrickIndexRow[];
  // DSC-2 slice 2: shared symbolic trick cards, with anchor-first ordering.
  // Anchor = the family's base trick (slug === familySlug) when present.
  cards: DictionaryTrickCard[];
  // Optional cross-link to a symbolic educational surface for this family
  // (e.g., butterfly family → walking-family progression). Null when no
  // corresponding surface is shipped. Per UNIFIED_DICTIONARY_VIEW_PLAN.md §4.3.
  crossLink: { label: string; href: string } | null;
}

// ---------------------------------------------------------------------------
// Freestyle Insights types (service-layer constants, not DB-backed)
// ---------------------------------------------------------------------------

export interface FreestyleInsightsContent {
  mostUsed: InsightsTrick[];
  connectors: InsightsTrick[];
  transitions: InsightsTransition[];
  hardestSequences: InsightsSequence[];
  diversePlayers: InsightsDiversePlayer[];
  difficultyEras: InsightsDifficultyEra[];
  narratives: string[];
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

export interface FreestyleCompetitionContent {
  topCompetitors:  FreestyleCompetitorViewModel[];
  eventsByEra:     FreestyleEraViewModel[];
  recentEvents:    FreestyleRecentEventViewModel[];
  totalEvents:     number;
  dataNote:        string;
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

// ── Phase 2 / H: set-modifier registry entry ───────────────────────────
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

// Phase 2 / E: one step in the §3 worked-example compression flow.
// Each step is a small symbolic-object card (slug + ADD + tokenized
// `≡` readings). The readings are NotationDisplay objects shaped via
// shapeNotationDisplay so the operator/side/base classification renders
// with the same op-token CSS the rest of the page uses.
export interface FreestyleCompressionFlowStep {
  slug:       string;                       // 'osis', 'torque', 'mobius'
  addValue:   number;                       // numeric ADD; rendered as a chip
  readings:   NotationDisplay[];            // zero-or-more `≡ ...` lines, tokenized
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
export type ModifierFeelCluster = 'set' | 'body';

export interface ModifierFeelCard {
  slug:         string;                   // 'pixie', 'paradox' — anchors at `modifier-{slug}`
  name:         string;                   // 'Pixie', 'Paradox'
  cluster:      ModifierFeelCluster;
  glyph:        string | null;            // 'PIX', 'STEP' for Tier-1 set; null otherwise
  feel:         string;                   // one-sentence movement description
  intuition:    string;                   // one-line structural intuition
  example:      string;                   // canonical worked example(s)
  familyHint:   string | null;            // optional observational adjacency
  midtimeBody:  boolean;                  // flag for "midtime body modifiers" sub-cluster
}

// Curator-authored. 13 entries: 9 set + 4 body. Order matters
// (rendered top-to-bottom within each cluster, pedagogically sequenced).
// Doctrine-aware phrasing per SEMANTIC_COMPRESSION_DOCTRINE §3 verb levels.
const MODIFIER_FEEL_CARDS: readonly ModifierFeelCard[] = [
  {
    slug:        'pixie',
    name:        'Pixie',
    cluster:     'set',
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
    cluster:     'set',
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
    cluster:     'set',
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
    cluster:     'set',
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
    cluster:     'set',
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
    cluster:     'set',
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
    cluster:     'set',
    glyph:       null,
    feel:        'Nuclear stacks paradox-and-atomic into a single heavy launch character.',
    intuition:   'A set modifier that structurally reads as paradox + atomic.',
    example:     'Matador = Nuclear Butterfly; Sumo = Nuclear Mirage.',
    familyHint:  'Nuclear anchors matador, sumo, and venom.',
    midtimeBody: false,
  },
  {
    slug:        'barraging',
    name:        'Barraging',
    cluster:     'set',
    glyph:       null,
    feel:        'Barraging puts two same-direction dexes on a single set.',
    intuition:   'A count-bearing set primitive that structurally reads as (dex) + (dex); operator class under community review.',
    example:     'Baroque = Barraging Osis; Flurry = Barraging Legover.',
    familyHint:  'Barraging anchors flurry, baroque, and the historical high-stepping cohort.',
    midtimeBody: false,
  },
  {
    slug:        'furious',
    name:        'Furious',
    cluster:     'set',
    glyph:       null,
    feel:        'Furious extends the uptime with rotational character.',
    intuition:   'A set modifier with rotational policy; non-rotational reading under community review.',
    example:     'Fury = Furious Paradox Mirage; Nemesis = Furious Barfly.',
    familyHint:  null,
    midtimeBody: false,
  },
  {
    slug:        'paradox',
    name:        'Paradox',
    cluster:     'body',
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
    cluster:     'body',
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
    cluster:     'body',
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
    cluster:     'body',
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
    { short: 'SYMP',     meaning: 'Symposium — or symple; context decides.' },
    { short: 'DLO',      meaning: 'Double Leg Over.' },
    { short: 'ATW',      meaning: 'Around-the-World.' },
    { short: 'DATW',     meaning: 'Double Around-the-World.' },
    { short: 'BOP',      meaning: 'Butterfly, Osis, Paradox Mirage.' },
    { short: 'PS Whirl', meaning: 'Paradox Symposium Whirl.' },
  ],
  operationalTokens: [
    { short: 'DEX',  meaning: 'Dexterity component. The foot circles the bag.' },
    { short: 'XBD',  meaning: 'Cross-body component. Active foot crosses the body’s centerline.' },
    { short: 'BOD',  meaning: 'Body-position component. Spin, duck, dive, or paradox pose change.' },
    { short: 'CLIP', meaning: 'Clipper — inside-arch shoe surface.' },
    { short: 'TOE',  meaning: 'Toe surface — top of the shoe.' },
  ],
};

// Glossary view-model. Carries the shaped notation examples so the §8
// notation explainers render with the same role-aware classification the
// trick-detail page uses. Keeps the glossary's promise ("color-coded
// structural roles") visible on the page itself.
export interface FreestyleGlossaryContent {
  // Operator-board orientation strip embedded in §3 ("How Tricks Are Built").
  // Shared partial with the landing page; surface-specific heading + lede.
  operatorBoard:    OperatorBoardData;
  // Intermediate-operator reference rendered inside §3 as a quick-reference
  // subsection. Authoritative source for what each intermediate operator
  // means and how it decomposes; equivalence-chain tokens deep-link here.
  intermediateOperators: readonly OperatorReferenceEntry[];
  // SURFACE-COMPRESSION-REALIGNMENT-1 Phase 2 / G + H: foundational tricks
  // and set-modifier grids rendered as compact symbolic objects inside §10.
  // Same view-model shape as the landing's coreTricks for partial reuse.
  coreTricks:       FreestyleCoreTrickCard[];
  setModifiers:     FreestyleSetModifierEntry[];
  // Phase 2 / E: the §3 worked-example compression flow with role-tokenized
  // `≡` readings (each reading passed through shapeNotationDisplay so the
  // operator-vs-base-vs-side classification surfaces visually).
  compressionFlow:  FreestyleCompressionFlowStep[];
  notationExamples: {
    whirl:        NotationDisplay | null;
    paradoxWhirl: NotationDisplay | null;
    gauntlet:     NotationDisplay | null;
  };
  // Connective-tissue panels (observational symbolic-grammar layer) for
  // 6 high-value terms: paradox / symposium / ducking / spinning / whirl /
  // pixie. Each panel surfaces related tricks + related symbolic groups +
  // a notation hint + optional deep-link to a modifier-family page.
  // Per UX-SHIP-1 Phase 7 (Task E). Always populated (length=6); panels
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
  // §6 "Common Advanced Modifiers" feel cards. 13 entries: 9 set + 4 body.
  // Player-facing pedagogical view; complements Surface B's decomposition
  // reference (intermediate operators dl + execution mechanics + set
  // modifier registry). See SEMANTIC_COMPRESSION_DOCTRINE §3 for verb
  // discipline; the cards use Level-2 / Level-3 phrasing (movement-first).
  modifierFeelCards: readonly ModifierFeelCard[];
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
  // Phase: history-page editorial refinement (2026-05-10).
  // "Evolution of difficulty" framing — not a new ontology layer; an editorial
  // pass through the same eras with a difficulty-arc lens.
  evolution: FreestyleHistoryEvolutionEntry[];
  // Combo-evolution narrative (2026-05-10 second pass): how multi-trick
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
  const groupMap = new Map<string, FreestyleRecordRow[]>();
  for (const row of rows) {
    const bucket = groupMap.get(row.record_type) ?? [];
    bucket.push(row);
    groupMap.set(row.record_type, bucket);
  }
  return Array.from(groupMap.entries()).map(([recordType, typeRows]) => ({
    recordType,
    label:   labelForType(recordType),
    records: typeRows.map(shapeFreestyleRecord),
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
    '(whirling osis). These in turn anchor their own clusters — paradox torque and mobius ' +
    'on the torque side, paradox blender and spender on the blender side — making the osis ' +
    'one of the most generative bases in the advanced trick vocabulary.',
  mirage:
    'The mirage is the foundational 2-ADD rotational base. Compounds include smear (pixie ' +
    'mirage) and tap (tapping mirage) at 3 ADD; atom smasher (atomic mirage) and blur ' +
    '(canonically Stepping Paradox Mirage) at 4 ADD.',
  clipper:
    'The clipper is a 1-ADD body kick into clipper position. Its primary compound derivative ' +
    'is flying-clipper. Stall-based compounds (ducking clipper, spinning clipper, drifter) ' +
    'live under the clipper-stall family per the 2026-05-08 clipper migration.',
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
function shapeDictionaryTrickCard(
  row: FreestyleTrickRowWithStatus,
  indexRow: FreestyleTrickIndexRow,
): DictionaryTrickCard {
  const opDisplay = shapeOperationalNotationDisplay(row.operational_notation);
  const operationalNotation: OperationalNotation | null = opDisplay
    ? {
        raw:        opDisplay.raw,
        tokens:     opDisplay.tokens,
        sourceNote: row.operational_notation_source && row.operational_notation_source.trim()
          ? row.operational_notation_source.trim()
          : null,
      }
    : null;

  // Merge equivalence readings from the curator chain registry (compounds)
  // and the alias-governance allow-list (atoms). Order: compound chains
  // first (when present), then atom-level allow-listed aliases.
  const chain                = getSymbolicEquivalenceChain(indexRow.slug);
  const chainReadings        = chain ? [...chain.readings] : [];
  const browseSafeAliases    = filterAliasesForBrowse(indexRow.slug, indexRow.aliases);
  const symbolicEquivalences = [...chainReadings, ...browseSafeAliases];

  return {
    slug:                       indexRow.slug,
    displayName:                indexRow.canonicalName,
    href:                       indexRow.detailHref,
    adds:                       indexRow.adds,
    addsLabel:                  indexRow.adds ? `${indexRow.adds} ADD` : '— ADD',
    symbolicEquivalences,
    operationalNotation,
    operationalNotationStatus:  operationalNotation ? 'available' : 'pending',
    commonAliases:              browseSafeAliases,
    isExternalOnly:             indexRow.isExternalOnly,
    statusBadge:                indexRow.statusBadge,
    placeholderNote:            indexRow.placeholderNote,
    hasRecords:                 indexRow.hasRecords,
    hasReferenceMedia:          indexRow.mediaCoverage !== 'none',
    mediaCoverage:              indexRow.mediaCoverage,
    trickFamily:                indexRow.trickFamily,
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
    statusBadge = 'External source — not yet adjudicated';
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

  return {
    canonicalName:    row.canonical_name,
    adds:             row.adds,
    addsNumeric:      isNaN(addsNumeric ?? NaN) ? null : addsNumeric,
    category:         row.category,
    description:      row.description,
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

// Editorial content (INSIGHTS_* and HISTORY_*) moved to
// src/content/freestyleEditorial.ts; imported at the top of this file.

// ---------------------------------------------------------------------------
// UX3b1 editorial prose surface (2026-05-11)
// ---------------------------------------------------------------------------
// Curator-authored prose backing the universal-shell template's UX2 ordering.
// Prose lives in freestyle_tricks columns (short_description / execution_summary
// / learning_notes / prerequisite_notes / featured_media_id). Service shapes
// the row into Ux2PilotData when ANY of the prose columns is populated. A row
// with all five columns null falls through to the legacy ordering branch in
// the shell. No service-layer allowlist; section presence is data-driven.

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

// UX3c-c (2026-05-11) cssRole lookup for the hero quick-stat formula.
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

// UX3c-c (2026-05-11) hero quick-stat formula builder. Atom rows render the
// short form "trick-name = N ADD". Compound rows render the additive form
// "modifier(+w) + ... + base(N) = TOTAL ADD" with role-coloured operands.
// Source of modifier data is freestyle_trick_modifier_links (authoritative for
// Wave-1/Wave-2 single-token canonical names like "matador" / "phoenix").
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
  // Atom form: no modifier links OR no resolvable base distinct from self
  if (modifierLinks.length === 0 || !baseTrick) {
    return [
      { kind: 'base',     text: canonicalName, weight: null, cssRole: 'core-family' },
      { kind: 'operator', text: '=',           weight: null, cssRole: null },
      { kind: 'result',   text: `${numericAdds} ADD`, weight: null, cssRole: null },
    ];
  }
  // Compound form: modifiers + base = total
  const tokens: HeroFormulaToken[] = [];
  modifierLinks.forEach((link, i) => {
    if (i > 0) {
      tokens.push({ kind: 'operator', text: '+', weight: null, cssRole: null });
    }
    const effectiveBonus = isRotationalBase
      ? link.add_bonus_rotational
      : link.add_bonus;
    tokens.push({
      kind:    'modifier',
      text:    link.modifier_name,
      weight:  `(+${effectiveBonus})`,
      cssRole: modifierCssRole(link.modifier_slug, link.modifier_type),
    });
  });
  tokens.push({ kind: 'operator', text: '+', weight: null, cssRole: null });
  tokens.push({
    kind:    'base',
    text:    baseTrick,
    weight:  baseAdds ? `(${baseAdds})` : null,
    cssRole: 'core-family',
  });
  tokens.push({ kind: 'operator', text: '=', weight: null, cssRole: null });
  tokens.push({ kind: 'result', text: `${numericAdds} ADD`, weight: null, cssRole: null });
  return tokens;
}

// UX3d-b (2026-05-11) modifier-layering builder. Activates only when
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
    inner:   null,
  };

  // Wrap outward: iterate modifier_links in reverse so the first entry ends up
  // as the outermost wrapper.
  for (let i = modifierLinks.length - 1; i >= 0; i--) {
    const link = modifierLinks[i];
    const effectiveBonus = isRotationalBase
      ? link.add_bonus_rotational
      : link.add_bonus;
    layer = {
      kind:    'modifier',
      name:    link.modifier_name.toLowerCase(),
      weight:  `(+${effectiveBonus})`,
      cssRole: modifierCssRole(link.modifier_slug, link.modifier_type),
      inner:   layer,
    };
  }

  return {
    rootLayer:  layer,
    totalLabel: `${numericAdds} ADD`,
  };
}

// UX3e-b (2026-05-11) per-trick modifier-link map. Built once per request from
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
// Per DSC-2 topology slice — six pedagogically-grounded educational groups.
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
    definition: 'Tricks whose downtime dex comes from the hip — the thigh swings broadly around the bag while the chest opens. Anchored on Mirage and Butterfly.',
    matches:    row => !!(row.base_trick && HIPPY_BASES.has(row.base_trick)),
  },
  {
    slug:       'leggy-dex',
    name:       'Leggy dex',
    definition: 'Tricks whose dex comes from the knee — the calf circles the bag while the thigh stays composed. Anchored on Legover, Pickup, Whirl, Swirl, Illusion.',
    matches:    row => !!(row.base_trick && LEGGY_BASES.has(row.base_trick)),
  },
  {
    slug:       'whirl-swirl-structures',
    name:       'Whirl / swirl structures',
    definition: 'Tricks built on the rotational dex pair — Whirl (leggy in to clipper) and Swirl (leggy out with crossbody entry to clipper).',
    matches:    row => row.base_trick === 'whirl' || row.base_trick === 'swirl',
  },
  {
    slug:       'pixie-uptime-dex',
    name:       'Pixie uptime dex',
    definition: 'Tricks with a pixie set treatment in the uptime — compressed pre-base set that compresses the rising-bag window.',
    matches:    (_row, hasLink) => hasLink('pixie'),
  },
  {
    slug:       'symposium-clipper-structures',
    name:       'Symposium clipper structures',
    definition: 'Clipper-landing tricks performed with a symposium discipline — the support leg leaves the ground during the dex.',
    matches:    (row, hasLink) => hasLink('symposium')
      && !!(row.base_trick && CLIPPER_LANDING_BASES.has(row.base_trick)),
  },
  {
    slug:       'ducking-clipper-structures',
    name:       'Ducking clipper structures',
    definition: 'Clipper-landing tricks with a ducking head-dip in the midtime — the bag passes around the neck while the rest of the trick continues.',
    matches:    (row, hasLink) => hasLink('ducking')
      && !!(row.base_trick && CLIPPER_LANDING_BASES.has(row.base_trick)),
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Per-trick reverse semantic-membership lookup. Used by the trick-detail
// page to close the discovery loop between browse views and trick pages
// (UX-SHIP-1 Phase 5).
//
// Reuses the same TOPOLOGY_GROUPS predicates the dictionary index uses;
// component memberships read off the trick's existing modifier links.
// No new query; the modifier links are already loaded by the caller.
// ─────────────────────────────────────────────────────────────────────────

export interface TrickTopologyMembership {
  topologySlug: string;
  topologyName: string;
  href:         string;
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
      topologySlug: def.slug,
      topologyName: def.name,
      href:         `/freestyle/tricks?view=topology#topology-${def.slug}`,
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

// UX3e-b (2026-05-11) parallel tricks builder. Definition: same trick_family
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

// UX3e-b (2026-05-11) modifier substitutions builder. Definition: same
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

// UX3d-a (2026-05-11) hero decomposition builder. Returns a role-coloured
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

// UX3c-b family-tier grouping (2026-05-11). Reorganises the flat family-member
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

// UX3b0 density classification (2026-05-11). Derived from existing data only;
// no schema dependency. Inputs: modifier-link count, semantic notation presence,
// operational notation presence, record count, media availability, ux2Pilot
// presence. Stays read-only at UX3b0; future UX3 phases consume this signal
// to gate flagship-only surfaces (token-coloured h1, modifier-layering panel,
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
        title: 'Freestyle Records',
        description:
          'Per-trick consecutive records from the freestyle footbag passback community.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_records',
        title:      'Freestyle Records',
        intro:
          'Best known per-trick consecutive completions from the freestyle community. ' +
          'Records sourced from the passback video archive.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Records' },
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
        title: 'Freestyle Leaders',
        description: 'Rankings by number of per-trick consecutive records held.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_leaders',
        title:      'Freestyle Leaders',
        intro:      'Players ranked by number of current per-trick consecutive records held.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Leaders' },
        ],
      },
      content: {
        leaders,
        totalHolders: leaders.length,
        totalRecords,
      },
    };
  },

  getTrickDetailPage(slug: string): PageViewModel<FreestyleTrickContent> {
    // Resolve slug → trick_name via public (non-superseded) records
    const publicRows = runSqliteRead('freestyleRecords.listPublic', () =>
      freestyleRecords.listPublic.all() as FreestyleRecordRow[],
    );

    // Also check dictionary for slug resolution (trick may have no records).
    // getBySlug returns Phase-0 parser columns (jobs_notation_raw, structural
    // _parse_json, computed_*) alongside the base trick fields; only this
    // statement loads them — grids stay lean.
    const dictRow = runSqliteRead('freestyleTricks.getBySlug', () =>
      freestyleTricks.getBySlug.get(slug) as FreestyleTrickRowWithParse | undefined,
    );

    const recordTrickName = publicRows.find(r => r.trick_name && trickNameToSlug(r.trick_name) === slug)?.trick_name;
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

    // Build family members list for difficulty ladder
    let familyMembers: FreestyleFamilyMember[] = [];
    if (dictRow && dictRow.trick_family) {
      const familySlug = dictRow.trick_family;
      const familyRows = runSqliteRead('freestyleTricks.listByFamily', () =>
        freestyleTricks.listByFamily.all(familySlug) as FreestyleTrickRow[],
      );
      // Build set of slugs with records for linking
      const slugsWithRecords = new Set(
        publicRows.filter(r => r.trick_name).map(r => trickNameToSlug(r.trick_name!)),
      );
      familyMembers = familyRows.map(r => ({
        slug:           r.slug,
        canonicalName:  r.canonical_name,
        adds:           r.adds,
        isCurrentTrick: r.slug === dictRow.slug,
        detailHref:     `/freestyle/tricks/${r.slug}`,
        hasRecords:     slugsWithRecords.has(r.slug),
      }));
    }

    // SEO and page title: prefer "About" framing for dict-only tricks with no records
    const hasDictEntry     = dictEntry !== null;
    const hasRecords       = currentRows.length > 0;
    const seoTitle         = hasRecords ? `${trickName} — Passback Records` : `${trickName} — Trick Reference`;
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
        // decomposition table) and the UX3c-c hero quick-stat formula.
        const modifierLinks: FreestyleTrickModifierLinkDetailRow[] = dictRow
          ? runSqliteRead('freestyleTrickModifiers.listLinksByTrickSlug', () =>
              freestyleTrickModifiers.listLinksByTrickSlug.all(slug) as FreestyleTrickModifierLinkDetailRow[],
            )
          : [];

        // UX3e-b: load all (modifier, trick) pairs once and build a Map for
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
          (media as unknown as { listMediaByTrickTag: { all: (tag: string) => unknown[] } })
            .listMediaByTrickTag.all(`#${slug}`) as TrickRefMediaRow[],
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

        const familySlug = dictRow?.trick_family ?? null;
        const familyName = familySlug
          ? familySlug.charAt(0).toUpperCase() + familySlug.slice(1).replace(/-/g, ' ')
          : null;
        // Pathway "Learn this trick" surfaces tutorial- and demo-tier counts
        // separately — wording must not conflate them (Phase 3 fix).
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

        return {
          trickName,
          sortName,
          slug,
          records:          currentRows.map(shapeFreestyleRecord),
          recordCount:      currentRows.length,
          topValue,
          progression:      allTrickRows.map(shapeFreestyleRecord),
          hasProgression,
          dictEntry,
          familyMembers,
          hasFamilyMembers: familyMembers.length > 1,
          familyTiers:      buildFamilyTiers(familyMembers),
          relatedTricks:    dictRow ? buildRelatedTricks(dictRow, allDictRows) : [],
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
            // detail template. Null when the row has no operational_notation
            // populated; section omits entirely. shapeOperationalNotationDisplay
            // handles null/empty/whitespace-only input safely. O1d adds the
            // optional curator-authored sourceNote (provenance/citation line);
            // null when the operational_notation_source column is empty —
            // the source-note <p> renders only when populated.
            const display = shapeOperationalNotationDisplay(dictRow?.operational_notation);
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

    return {
      seo: {
        title: 'Freestyle Competition',
        description:
          `Freestyle footbag competition history — top competitors, podium counts, ` +
          `and event records from ${totalEvents} documented events (1980–present).`,
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_competition',
        title:      'Freestyle Competition',
        intro:
          `Competition history derived from ${totalEvents} documented freestyle events ` +
          `(1980–present). Podium counts reflect all freestyle singles formats.`,
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Competition' },
        ],
      },
      content: {
        topCompetitors,
        eventsByEra,
        recentEvents,
        totalEvents,
        dataNote: 'Freestyle singles only. Includes Open, Intermediate, and Women\'s divisions. ' +
                  'Data from canonical event results — all placements are sourced directly from documented competition records.',
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
          'The evolution of competitive freestyle footbag — pioneers, eras, the ADD system, ' +
          'and the shift from North American origins to European dominance.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_history',
        title:      'Freestyle History',
        intro:
          'From the early clipper-based vocabulary of the 1980s to the technical plateau of the ' +
          '2000s and the modern European era. Based on analysis of 774 documented competitive events (1980–2026).',
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
          'participation density. Václav Klouda (Czech Republic) has accumulated 109 podium finishes — ' +
          'more than any other player in the dataset. Damian Gielnicki, Mariusz Wilk, Stefan Siegert, ' +
          'Honza Weber, and Andreas Nawrath form a European technical cluster whose work produced both ' +
          'the highest-ADD sequences on record and some of the most diverse trick vocabularies in the data.',
        modernEra:
          'Modern freestyle is a refined, recombinational sport. The trick grammar settled into recognizable ' +
          'form by the late 2000s; today\'s competitive edge sits in how the established vocabulary is ' +
          'sequenced, executed, and made musical. Within the existing palette, the space of meaningful ' +
          'combinations is enormous — players continue to find new arrangements, new transitions, and new ' +
          'expressive possibilities inside it. The question hasn\'t become "what trick is left to invent?" ' +
          'so much as "how cleanly, how creatively, and how consistently can this language be played?"',
        evolution: [
          {
            period: '1980s',
            label:  'Clipper & Mirage',
            summary: 'The foundational vocabulary — clipper-set tricks, mirage and its dex variants, the early whirl and butterfly motifs. Routines were judged on execution and creativity rather than a difficulty score.',
          },
          {
            period: 'Early 1990s',
            label:  'Paradox & Symposium',
            summary: 'Modifiers entered the formal vocabulary. Paradox, symposium, and the body-position grammar that lets the same base trick branch into many distinct named compounds.',
          },
          {
            period: 'Mid-1990s — 2000s',
            label:  'ADD & Modifier Stacking',
            summary: 'The ADD system named what players had been doing intuitively. Modifier stacking — paradox + symposium, ducking + paradox — made multi-modifier compounds the heart of competitive routines.',
          },
          {
            period: '2000s',
            label:  'Blurry & Fearless',
            summary: 'The blurry modifier reshaped the top of the difficulty curve, anchoring runs that pushed past 5 ADD. "Fearless" runs (every trick at 5 ADD or more) became the marker of a top-tier performance.',
          },
          {
            period: '2010s — present',
            label:  'Consistency & Execution',
            summary: 'New-trick invention slowed; competitive depth grew. The frontier moved from "what new structure exists?" to "how cleanly can the established vocabulary be performed under pressure?" Sequencing, transitions, and routine architecture became the differentiators.',
          },
        ],
        comboEvolution: [
          'In the earliest period of the sport, freestyle wasn\'t really about combos at all. Players showed individual tricks within an open-floor performance, with kicks and stalls strung loosely between them. A "combo" was something audiences and judges noticed when it happened — not yet a structural unit you built and named.',
          'Through the late 1980s and into the early 1990s, players began linking dexterity tricks intentionally. Two-trick chains became the working unit: a clipper-set dex into a body trick, or a mirage into a butterfly. The community started naming patterns rather than just patches of execution.',
          'The paradox-and-symposium era of the mid-1990s expanded what a single trick could carry — modifiers gave you a way to layer body positions onto a base — and that, in turn, gave linking new richness. A run could now move from one well-defined compound to another, instead of dropping back to a base trick between every difficulty spike.',
          'The 2000s were the blurry/fearless density era. The blurry modifier reshaped the top of the curve, and "fearless" runs (every trick at 5 ADD or higher) became the marker of a top-tier performance. The combo question shifted from "how many tricks?" to "how high a sustained density can you hold across a run?"',
          'Modern competitive freestyle reads as a flow-and-execution sport. Trick vocabulary settled years ago; the differentiators are sequencing, transitions, musicality, and consistency over a full routine\'s length. "Guiltless" (≥3 ADD per trick) and "fearless" (≥5 ADD per trick) are baseline expectations at the top tier rather than highlights. The art now is in how the established palette is played.',
        ],
        earlyRoutineEvolution: [
          'Early freestyle judging was about routines first. Players choreographed a run, set it to music or mood, and were judged on creativity, execution, and the energy a performance carried. Difficulty mattered, but as a felt quality the judges and audience read together — not yet as a number.',
          'The ADD system, formalized in the early 1990s, gave the community a shared scale for that felt quality. Routines didn\'t stop being creative; they got a second axis. Players could now talk about a run\'s difficulty independently of its choreography, and the run-quality vocabulary in the glossary — Tiltless, Guiltless, Tripless, Fearless, Beastly, Godly — emerged to describe routines by the floor of difficulty they sustained.',
          'Today the vocabulary still works on both axes. Creative routines remain a competition format and an art form. Alongside them, ADD-aware difficulty standards (guiltless or fearless throughout, transitions held under pressure) describe what serious competitive runs look like at the top. The two ways of judging haven\'t replaced each other — they share the same competitive culture.',
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

    const ctx: TrickIndexShapingContext = {
      slugsWithRecords,
      aliasesByTrickSlug,
      mediaCoverageBySlug,
      statusBySlug,
    };

    // Active rows only for category / family groupings (existing semantics:
    // pending rows belong only in the ADD view as placeholders).
    const activeRows = allRows.filter(r => r.is_active === 1);

    // ---- Category groups (?view=category) -----------------------------
    //
    // DSC-2 slice 3B: each group now emits a `cards: DictionaryTrickCard[]`
    // array alongside the legacy `tricks` shape. Cards sort ADD ascending,
    // then trick name alphabetical. Empty categories don't render. The
    // legacy spreadsheet table is retired in the template.
    const categoryOrder = ['dex', 'body', 'set', 'compound'];
    const grouped = new Map<string, FreestyleTrickRowWithStatus[]>();
    for (const row of activeRows) {
      if (row.category === 'modifier') continue;
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
      const cards = sorted.map((r, i) => shapeDictionaryTrickCard(r, indexRows[i]!));
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
    // DSC-2 slice 2: each group now also emits a `cards: DictionaryTrickCard[]`
    // array using anchor-first ordering (the family base trick first when
    // present, then ADD ascending, then name alphabetical) and an optional
    // crossLink to a symbolic educational surface (e.g., butterfly family →
    // walking-family progression). The legacy `members` array is preserved
    // for backwards compatibility while other surfaces migrate.
    const familyMap = new Map<string, FreestyleTrickRowWithStatus[]>();
    for (const row of activeRows) {
      if (!row.trick_family || row.category === 'modifier') continue;
      const bucket = familyMap.get(row.trick_family) ?? [];
      bucket.push(row);
      familyMap.set(row.trick_family, bucket);
    }
    const FAMILY_ORDER = ['whirl', 'butterfly', 'osis', 'mirage', 'clipper', 'legover', 'torque', 'blender'];

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
      const cards   = sorted.map((r, i) => shapeDictionaryTrickCard(r, members[i]!));
      return {
        familySlug,
        familyName: familySlug.charAt(0).toUpperCase() + familySlug.slice(1),
        members,
        cards,
        crossLink: FAMILY_CROSS_LINKS[familySlug] ?? null,
      };
    };

    const familyGroups: FreestyleFamilyGroup[] = [];
    for (const fslug of FAMILY_ORDER) {
      const rows = familyMap.get(fslug);
      if (rows && rows.length > 1) {
        familyGroups.push(buildFamilyGroup(fslug, rows));
      }
    }
    for (const [fslug, rows] of familyMap.entries()) {
      if (!FAMILY_ORDER.includes(fslug) && rows.length > 1) {
        familyGroups.push(buildFamilyGroup(fslug, rows));
      }
    }

    // ---- ADD groups (the new beginner default view) -------------------
    // Modifiers are excluded; pending placeholders are included alongside
    // canonical tricks within the same ADD bucket. Empty / non-numeric ADD
    // lands in 'Unrated / unresolved'.
    //
    // DSC-2 slice 1: builds the dictionary-trick-card view-model alongside
    // the legacy `tricks` shape. The By ADD template branch renders the
    // `cards` array via the shared partial; other views remain on `tricks`.
    interface AddBucketEntry { row: FreestyleTrickRowWithStatus; indexRow: FreestyleTrickIndexRow; }
    const addBuckets = new Map<number | null, AddBucketEntry[]>();
    for (const row of allRows) {
      if (row.category === 'modifier' || row.adds === 'modifier') continue;
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
        tricks: sorted.map(e => e.indexRow),
        cards:  sorted.map(e => shapeDictionaryTrickCard(e.row, e.indexRow)),
      };
    };
    const numericKeys = [...addBuckets.keys()].filter((k): k is number => k !== null).sort((a, b) => a - b);
    for (const k of numericKeys) {
      addGroups.push(buildGroup(k, `${k} ADD`, addBuckets.get(k) ?? []));
    }
    if (addBuckets.has(null)) {
      addGroups.push(buildGroup(null, 'Unrated / unresolved', addBuckets.get(null) ?? []));
    }

    // ---- Coverage summary --------------------------------------------
    // Counts mirror what the ADD view actually shows: modifiers are excluded
    // from the listing, so excluding them from the summary keeps the two
    // numbers consistent for visitors.
    const canonicalCount = allRows.filter(
      r => r.is_active === 1 && r.category !== 'modifier' && r.adds !== 'modifier',
    ).length;
    const externalOnlyCount = allRows.filter(
      r =>
        r.is_active === 0 &&
        r.review_status === 'pending' &&
        r.category !== 'modifier' &&
        r.adds !== 'modifier',
    ).length;
    const coverage: FreestyleTricksCoverageSummary = {
      canonicalCount,
      pendingInternalCount: 0,
      externalOnlyCount,
      sourcesLoaded: ['footbag.org'],
      sourcesUnavailable: ['footbagmoves.com (corpus not yet loaded)'],
      transparencyNote:
        'External-source placeholders are shown for transparency and coverage tracking.',
    };

    // ---- View toggle --------------------------------------------------
    // DSC-2 slice 3A: ?view=sets is an alias of ?view=component. Both
    // requests resolve to the same activeView so the new component browse
    // experience renders for inbound legacy links without breaking them.
    const allowedViews: FreestyleTricksActiveView[] = ['add', 'family', 'category', 'sets', 'component', 'topology'];
    const requestedView = (view ?? 'add') as FreestyleTricksActiveView;
    const resolvedView: FreestyleTricksActiveView = allowedViews.includes(requestedView)
      ? (requestedView === 'sets' ? 'component' : requestedView)
      : 'add';
    const activeView = resolvedView;

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
    const allActiveTrickRowsBySlug = new Map<string, FreestyleTrickRow>();
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
      tricks: FreestyleTrickRow[];
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
    const setGroups: FreestyleSetGroup[] = [...setGroupAccumulator.values()].map(b => ({
      modifierSlug: b.modifierSlug,
      modifierName: b.modifierName,
      modifierType: b.modifierType,
      addBonus: b.addBonus,
      addBonusRotational: b.addBonusRotational,
      tricks: b.tricks.map(r => shapeTrickIndexRow(r, ctx)),
      trickCount: b.tricks.length,
    }));

    // ---- Component view (?view=component projection, DSC-2 slice 3A) ----
    // Body + set modifier axes only. Topology and movement-archetype axes
    // are deferred. Within each axis, groups render in priority order
    // (curator-tagged); remaining groups follow alphabetical. Within each
    // group, cards sort ADD ascending, then trick name alphabetical.
    // Empty groups are hidden.

    const BODY_PRIORITY = ['paradox', 'symposium', 'spinning', 'ducking', 'diving', 'weaving', 'gyro', 'stepping'];
    const SET_PRIORITY  = ['pixie', 'atomic', 'quantum', 'nuclear', 'fairy', 'furious'];

    // One-line body-mechanics definitions for the priority modifiers. Curator-authored;
    // a future slice may expand this map to additional modifiers.
    const COMPONENT_DEFINITIONS: Record<string, string> = {
      paradox:   'A hip pivot between two dexes on the same set — the body changes sides without changing the set foot.',
      symposium: 'A no-plant body discipline — the support leg stays off the ground during the dex.',
      spinning:  'A full-body 360° rotation carried through the dex moment.',
      ducking:   'A head dip that lets the bag pass around the neck; head moves toward the bag, bag falls opposite.',
      diving:    'A head arc — over and under the bag — with the bag falling to the same side.',
      weaving:   'Head moves toward the bag, bag falls to the same side.',
      gyro:      'A half-body 180° rotation carried through the dex moment.',
      stepping:  'A foot relocation during uptime that compresses or lengthens the set.',
      pixie:     'A compressed pre-base uptime set; tighter motion than stepping.',
      atomic:    'A cross-body uptime set with x-dex character.',
      quantum:   'The compressed form of atomic — a tighter uptime treatment.',
      nuclear:   'A +2 set modifier; structurally paradox + atomic.',
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
      // Only body + set axes in slice 3A.
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
      return {
        componentSlug:  bucket.modifierSlug,
        componentName:  bucket.modifierName,
        bodyDefinition: COMPONENT_DEFINITIONS[bucket.modifierSlug] ?? null,
        memberCount:    sorted.length,
        anchorId:       `component-${bucket.modifierSlug}`,
        cards:          sorted.map(e => shapeDictionaryTrickCard(e.row, e.indexRow)),
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

    // ---- Topology view (?view=topology projection, DSC-2 slice 3-topology) ----
    // Six pedagogically-grounded educational groups. TOPOLOGY_GROUPS +
    // HIPPY_BASES / LEGGY_BASES / CLIPPER_LANDING_BASES live at module scope
    // so the trick-detail page (UX-SHIP-1 Phase 5) can reuse the same defs.

    const trickHasModifierLinkInAccumulator = (slug: string, modifierSlug: string): boolean => {
      const bucket = componentAccumulator.get(modifierSlug);
      if (!bucket) return false;
      return bucket.entries.some(e => e.row.slug === slug);
    };

    const buildTopologyGroup = (def: TopologyGroupDef): TopologyGroup => {
      const matched = activeRows
        .filter(r => r.category !== 'modifier'
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
      return {
        topologySlug:   def.slug,
        topologyName:   def.name,
        bodyDefinition: def.definition,
        memberCount:    matched.length,
        anchorId:       `topology-${def.slug}`,
        cards:          matched.map((r, i) => shapeDictionaryTrickCard(r, indexRows[i]!)),
      };
    };

    const topologyView: TopologyBrowseView = {
      layerSource:       'observational',
      observationalNote:
        'Observational symbolic-grammar layer. These groupings describe how tricks share body mechanics — hippy vs leggy, whirl vs swirl, uptime vs midtime patterns. They are observed, not canonical; the dictionary\'s family classifications remain the canonical structure.',
      groups: TOPOLOGY_GROUPS
        .map(buildTopologyGroup)
        .filter(g => g.memberCount > 0),
    };

    const componentView: ComponentBrowseView = {
      duplicationNote:
        'Compounds appear in every component group they belong to. A trick with paradox AND spinning shows up under both — the duplication is intentional, since each grouping is a separate browse path.',
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

    return {
      seo: {
        title: 'Freestyle Trick Dictionary',
        description:
          'Reference guide to freestyle footbag tricks — ADD values, categories, ' +
          'descriptions, and aliases for 70+ documented tricks.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_tricks_index',
        title:      'Trick Dictionary',
        intro:
          'Browse freestyle tricks by ADD difficulty. Each trick includes notation, ' +
          'aliases, family, and available media.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Trick Dictionary' },
        ],
      },
      content: {
        addGroups,
        coverage,
        activeView,
        groups,
        familyGroups,
        setGroups,
        componentView,
        topologyView,
        modifiers,
        activeFamily,
        relatedSetGroups,
        totalTricks: canonicalCount,
        dictNote:
          'This dictionary is being expanded and aligned with established freestyle notation. ' +
          'New entries are staged for review before publication.',
      },
    };
  },

  getFreestyleInsightsPage(): PageViewModel<FreestyleInsightsContent> {
    return {
      seo: {
        title: 'Freestyle Insights',
        description:
          'Data-driven insights into freestyle footbag: most-used tricks, difficulty trends, ' +
          'top transitions, and sequence analysis from 774 documented competitive events.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_insights',
        title:      'Freestyle Insights',
        intro:
          'Trick and sequence analysis derived from 774 documented competitive events (1980–2026) ' +
          'and 395 Sick3 format sequences spanning 22 years of ADD-scored competition.',
      },
      navigation: {
        breadcrumbs: [
          { label: 'Freestyle', href: '/freestyle' },
          { label: 'Insights' },
        ],
      },
      content: {
        mostUsed:         INSIGHTS_MOST_USED,
        connectors:       INSIGHTS_CONNECTORS,
        transitions:      INSIGHTS_TRANSITIONS,
        hardestSequences: INSIGHTS_SEQUENCES,
        diversePlayers:   INSIGHTS_DIVERSE_PLAYERS,
        difficultyEras:   INSIGHTS_DIFFICULTY_ERAS,
        narratives:       INSIGHTS_NARRATIVES,
      },
    };
  },

  getAboutPage(): PageViewModel<Record<string, never>> {
    return {
      seo: {
        title: 'About Freestyle',
        description:
          'About freestyle footbag — competition formats, judging, and community resources.',
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
        title:       'Educational pathways — Freestyle',
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
   * teaching page. Per UX-SHIP-1 Phase 6 (Task D), pilot scope: spinning only.
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
        title:       `${content.displayName} — Freestyle modifier`,
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
   * progression chain. Per UX-SHIP-1 Phase 5. Returns null content when any
   * required dictionary slug is missing (curated chain expects all 7 rows).
   */
  getWalkingFamilyProgressionPage(): PageViewModel<WalkingFamilyProgressionContent | null> {
    const allDictRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );
    const content = buildWalkingFamilyProgression(allDictRows);
    return {
      seo: {
        title: 'Walking-family progression — Freestyle',
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

    // SURFACE-COMPRESSION-REALIGNMENT-1 Phase 2 / G: foundational-tricks
    // grid shaped from CORE_TRICK_SPEC + freestyle_tricks for the §10
    // foundational-tricks section. Same view-model shape as the landing's
    // coreTricks, so the core-tricks-grid partial renders both surfaces
    // identically (registry-style readability).
    const coreTricks: FreestyleCoreTrickCard[] = shapeCoreTricks(allDictRows);

    // Phase 2 / H: set-modifier registry grid shaped from the Tier-1
    // operator-board set tier + OPERATOR_REFERENCE_ENTRIES set/compound-set
    // categories. Pixie / Fairy / Stepping come from the board; Atomic /
    // Quantum / Blurry / Nuclear / Barraging / Furious from the reference
    // module. Tier-1 entries carry a `glyph` field; intermediate entries
    // carry null `glyph` and surface their `decomposition` instead.
    const setModifiers: FreestyleSetModifierEntry[] = shapeSetModifiers(
      this.getOperatorBoard('glossary'),
    );

    // Phase 2 / E: §3 symbolic-compression worked example with tokenized
    // ≡ readings. Each reading runs through shapeNotationDisplay so the
    // operator / side / core-family classification surfaces as op-token
    // CSS roles. Three steps: #osis (atom) → #torque (1 operator added) →
    // #mobius (2 operators added; two stopping-depth readings).
    const compressionFlow: FreestyleCompressionFlowStep[] = [
      {
        slug:     'osis',
        addValue: 3,
        readings: [],
      },
      {
        slug:     'torque',
        addValue: 4,
        readings: [shapeNotationDisplay('MIRAGING OSIS', ctx)].filter(
          (r): r is NotationDisplay => r !== null,
        ),
      },
      {
        slug:     'mobius',
        addValue: 5,
        readings: [
          shapeNotationDisplay('SPINNING SS TORQUE', ctx),
          shapeNotationDisplay('SPINNING SS MIRAGING OSIS', ctx),
        ].filter((r): r is NotationDisplay => r !== null),
      },
    ];

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
        compressionFlow,
        notationExamples: {
          whirl:        whirlExample,
          paradoxWhirl: paradoxWhirlExample,
          gauntlet:     gauntletExample,
        },
        connectivePanels: buildGlossaryConnectivePanels(allDictRows),
        abbreviations:   GLOSSARY_ABBREVIATIONS,
        familyTrees:     shapeFamilyTrees(allDictRows),
        modifierFeelCards: MODIFIER_FEEL_CARDS,
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

  // ── Operator board — Tier-1 movement-language vocabulary.
  // Renders on the freestyle landing page, glossary §3, and /freestyle/learn
  // via the same operator-board partial. Tiers (the 14 operators) are
  // surface-invariant; heading + lede vary per surface (see
  // OPERATOR_BOARD_PROSE). Captions are sketch-level pending curator
  // confirmation on the four cells flagged with curatorConfirmPending.
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
    const NOTATION    = (slug: string) => ({ href: `/freestyle/sets#move-${slug}`,         label: 'Notation reference' });
    const GLOSSARY    = (slug: string) => ({ href: `/freestyle/glossary#term-${slug}`,     label: 'Glossary entry'     });
    const MOD_PEDAGOGY = (slug: string) => ({ href: `/freestyle/modifier/${slug}`,          label: 'Modifier page'      });

    // SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / D: every action string
    // compressed to 4–10 words. The card hierarchy on the rendered surface
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
            op('BL',    'Blurry',   'Stepping + Paradox; flat +1 ADD.',              'BLURRY + BUTTERFLY',      'RIPWALK',            GLOSSARY('blurry')),
            op('FAIRY', 'Fairy',    'Same-side, out-direction toe-set dex.',         'FAIRY + ATOMIC',          'FAIRY ATOMIC',       NOTATION('fairy'),    true),
            op('STEP',  'Stepping', 'Plant foot relocates between set and catch.',   'STEP + BUTTERFLY',        'RIPWALK',            GLOSSARY('stepping')),
          ],
        },
        {
          key:     'body',
          eyebrow: 'II · Body',
          title:   'Body operators',
          intro:   'What the body does while the bag is up.',
          operators: [
            op('SPIN',  'Spinning', 'Body rotates around the vertical axis.',        'SPIN + TORQUE',           'MOBIUS',             MOD_PEDAGOGY('spinning')),
            op('GY',    'Gyro',     'Half-rotation body modifier (180°).',           'GY + BUTTERFLY',          'GYRO BUTTERFLY',     NOTATION('gyro')),
            op('DUCK',  'Ducking',  'Body drops under the bag.',                     'PIX + DUCK + BUTTERFLY',  'PHOENIX',            MOD_PEDAGOGY('ducking')),
            op('PDX',   'Paradox',  'Hip pivot between two dexes; body switches sides.', 'PDX + LEG-OVER',     'PARADOX LEG-OVER',   MOD_PEDAGOGY('paradox')),
            op('SYMP',  'Symposium','Active leg jumps + lands solo while the other holds.', 'SYMP + ILLUSION', 'FLAIL',              GLOSSARY('symposium'), true),
          ],
        },
        {
          key:     'structural',
          eyebrow: 'III · Structure',
          title:   'Structural concepts',
          intro:   'Relationships across the trick.',
          operators: [
            op('XDEX',  'Cross-dex','Dex circles the bag opposite the plant foot.',  'XDEX + INSIDE',           'CLIPPER',            null, true),
            op('SAME',  'Same-foot','Set foot = catch foot.',                        'SAME + BUTTERFLY',        'SAME-FOOT BUTTERFLY', null),
            op('OP',    'Opposite', 'Set foot ≠ catch foot (the default).',          'OP + BUTTERFLY',          'BUTTERFLY',          null),
          ],
        },
      ],
    };
  },

  getLandingPage(): PageViewModel<FreestyleLandingContent> {
    const typeCounts = runSqliteRead('freestyleRecords.countPublicByType', () =>
      freestyleRecords.countPublicByType.all() as { record_type: string; n: number }[],
    );

    const leaderRows = runSqliteRead('freestyleRecords.listLeaders', () =>
      freestyleRecords.listLeaders.all() as FreestyleLeaderRow[],
    );

    const recentRows = runSqliteRead('freestyleRecords.listRecentPublic', () =>
      freestyleRecords.listRecentPublic.all() as FreestyleRecordRow[],
    );

    const trickRows = runSqliteRead('freestyleTricks.listAll', () =>
      freestyleTricks.listAll.all() as FreestyleTrickRow[],
    );

    const eraRows = runSqliteRead('freestyleCompetition.listEventsByEra', () =>
      freestyleCompetition.listEventsByEra.all() as FreestyleEraRow[],
    );

    const totalRecords = typeCounts.reduce((sum, r) => sum + r.n, 0);
    const totalEvents  = eraRows.reduce((sum, r) => sum + r.events, 0);

    return {
      seo: {
        title: 'Freestyle',
        description: 'Freestyle footbag — competition history, passback records, trick dictionary, and history.',
      },
      page: {
        sectionKey: 'freestyle',
        pageKey:    'freestyle_landing',
        title:      'Freestyle Footbag',
        intro: 'A compositional movement language built from sets, dexes, and body operators.',
      },
      content: {
        mascotSrc: '/img/freestyle-mascot.svg',
        mascotAlt: 'Freestyle footbag mascot icon',
        intro: {
          heading: 'The Language of Freestyle Footbag',
          paragraphs: [
            'A small vocabulary of body actions composes into named tricks. The grammar below — basic components, core tricks, then operators — is how the language reads.',
          ],
        },
        demoVideo: loadCuratorDemoVideo('demo-freestyle.mp4'),
        basicComponents: BASIC_COMPONENTS.map(c => ({
          key:         c.key,
          name:        c.name,
          description: c.description,
          subfields:   c.subfields.map(sf => ({ label: sf.label, values: [...sf.values] })),
        })),
        coreTricks: shapeCoreTricks(trickRows),
        // Merged Featured strip (SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / C):
        // Competition Formats (4) + Demonstrations (2) rendered as one
        // compact curated grid. Formats lead because they're conceptual
        // anchors of the vocabulary; demonstrations follow as exemplars.
        // No prose paragraphs — captions are one-line context max.
        featured: [
          {
            key:     'routine',
            title:   'Routine',
            caption: 'Choreographed performance to music.',
            media:   expandYouTubeVideo('Z-KkyOpoBhM', 'Yoshihito Yamamoto — Worlds Online 2020 Qualification Routine'),
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
            media:   expandYouTubeVideo('h6F0aPIpC1o', 'World Footbag Championships 2022 — Sick 3'),
            tags:    [],
          },
          {
            key:     'shred30',
            title:   'Shred 30',
            caption: 'Thirty-second technical scoring.',
            media:   expandYouTubeVideo('wb75xzvAs68', 'Taishi Ishida — World Footbag Championships 2020 Shred 30'),
            tags:    [],
          },
          {
            key:     'conlon-1998',
            title:   "1998 World Footbag Championships Women's Freestyle Finals",
            caption: 'Samantha Conlon and Carol Wedemeyer',
            media:   expandYouTubeVideo('2URvZFuxBls', "1998 Worlds Women's Freestyle Finals"),
            tags:    shapeMediaTagsForBrowse(
                       ['#freestyle', '#footbag_hof_archive', '#curated'],
                     ),
          },
          {
            key:     'san-marino-2026',
            title:   'Footbag 2026: San Marino',
            caption: 'Footage by jay7bah',
            media:   expandYouTubeVideo('U6J2LXxUWro', 'Footbag 2026: San Marino'),
            tags:    shapeMediaTagsForBrowse(
                       ['#freestyle', '#curated', '#by_jay7bah'],
                     ),
          },
        ],
        operatorBoard: this.getOperatorBoard(),
        getStartedTiles: [
          { label: 'Where to buy footbags', href: '#', comingSoon: true },
          { label: 'Where to buy shoes',    href: '#', comingSoon: true },
          { label: 'Beginner tutorials',    href: '#', comingSoon: true },
        ],
        totalRecords,
        recordTypes:   typeCounts.length,
        topHolders:    shapeLeaders(leaderRows).slice(0, 5),
        recentRecords: recentRows.map(shapeFreestyleRecord),
        totalTricks:   trickRows.length,
        totalEvents,
      },
    };
  },
};
