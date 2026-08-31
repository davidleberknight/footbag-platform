/**
 * FreestyleCurationService -- admin-facing curation of freestyle dictionary content.
 *
 * Owns:
 *   - The admin browse of freestyle trick dictionary rows: listing every row
 *     regardless of activation or review status, text search over canonical name
 *     and slug, and filters by active flag and review status.
 *   - The admin edit surface for one trick: rendering its editable row fields
 *     and its attached aliases, sources, and modifier links, saving edits to the
 *     trick row's structural and editorial prose fields (so no database-backed
 *     field freezes once the live database is the source of truth), adding,
 *     reclassifying, or removing the trick's aliases,
 *     attaching or detaching links to the existing registry sources, and attaching
 *     or detaching links to the existing registry modifiers.
 *   - Moderation of the imported community trick tips: a cross-trick index that
 *     lists and searches every tip regardless of status, narrowed by status and by
 *     trick, editing a tip's advice
 *     text and its display order, hiding a tip and restoring it (a reversible
 *     status change, never a
 *     delete), and remapping a tip to an active canonical trick while preserving
 *     the original mapping as audit-trail provenance.
 *   - Creation of dictionary provenance-source registry rows: listing the existing
 *     sources and creating a new one with a curator-supplied permanent id, so
 *     post-cutover media and assertions can cite a new source. Editing, deleting,
 *     and merging sources are not owned here.
 *
 * Does not own:
 *   - The public freestyle section pages (FreestyleService is public, read-only).
 *   - Freestyle ontology and doctrine (the content modules and doctrine docs).
 *   - The modifier registry itself (new modifier rows are not created here), and
 *     the separate media-source registry.
 *
 * Write discipline: updateTrickScalars validates the submitted fields for row
 * shape (canonical name required, ADD numeric/empty/"modifier", category and
 * review status within the existing allowed values, active and the core-primitive
 * marker booleans, the browse sort position a whole number zero or greater with a
 * cleared field meaning the unset zero, each
 * editorial prose field within a length cap) plus one
 * structural doctrine checks. When the ADD is numeric and the execution notation
 * carries scoring brackets, the scoring-bracket count must equal the ADD; rows
 * with no scoring brackets are not checked, because a blank notation is the
 * recorded state of the rows whose operator contribution is still unruled, and
 * refusing them would lock a curator out of exactly the rows a ruling will move.
 * When the curator changes the display name, the name must fold back to the slug
 * under the curated exception list, the same gate the content pipeline applies,
 * so a save the pipeline would later reject is refused here instead; a name the
 * curator did not touch is never re-judged, which keeps a row whose stored name
 * predates the one-time normalization editable in its other fields.
 *
 * Terminal-contact validation is deliberately absent rather than missing: the
 * corpus uses several notation registers whose terminal is legitimately neither
 * a stall nor a kick, and the terminal-contact vocabulary is itself an open
 * doctrine question. Operator-reference consistency is likewise deferred: the
 * reference is a curated subset today, authoritative where an entry exists, and
 * a membership rule would refuse half the linked corpus.
 *
 * A save that changes either notation field or the
 * asserted ADD also clears the row's stored notation parse (the structural parse,
 * the computed ADD and its formula, and the parse status) in the same
 * transaction, and records that it did so on the audit entry: those fields are
 * derived from the notation and graded against the asserted ADD by the content
 * pipeline, which this surface cannot re-run, so keeping them would publish a
 * grammar panel describing notation the row no longer carries. A row with no
 * stored parse renders without the panel, which is the same state a
 * never-parsed row is in. addAlias derives the alias slug from the display
 * text with the pipeline's normalization, and rejects a slug that equals any
 * canonical trick slug (checked across every row regardless of status) or an
 * existing alias slug (the global primary key); it leaves source_id and notes
 * unset, and writes the alias's public-display state from the class the curator
 * picked rather than letting it take the column default, so the nickname class is
 * the only one a reader sees by default. updateAlias sets both fields on an
 * existing alias, keeping the class editable for the life of the row and letting a
 * curator display a non-nickname alias, or hide a nickname, as a deliberate
 * exception; where the display state disagrees with what the class implies it
 * requires a reason and writes it to the alias's notes in the same statement, so
 * an exception and its explanation cannot be stored apart, and it clears that note
 * when the row returns to agreeing with its class. An edit that leaves the reason
 * blank keeps the standing one, because the field records a judgement rather than
 * re-confirming it. It is scoped to the alias's own trick and records the previous
 * class and display state, whether the save diverges, and the reason, on its audit
 * entry. removeAlias is scoped to the alias's own trick. attachSource links one
 * existing registry source with an optional external URL and asserted ADD (the
 * other link columns stay unset), rejecting an unknown source id or a duplicate
 * link; detachSource is keyed on both the trick and the source. attachModifier
 * links one existing registry modifier at an apply order that defaults to 1 when
 * blank, rejecting an unknown modifier or the exact (trick, modifier, apply order)
 * triple already linked, while allowing the same modifier at a different order;
 * detachModifier is keyed on the full triple. Each write and its one audit entry
 * commit together in a single transaction; the trick slug identity key is not
 * editable. Every write path first runs the pre-go-live persona guard, so a seeded
 * test persona cannot author freestyle content in a developer checkout; in staging
 * and production the guard is a no-op and the admin remains the audit actor.
 *
 * Tip moderation write discipline: the import assigns tips a status of published,
 * hidden, or one of several unresolved buckets (unresolved_freestyle / _frontier /
 * _ambiguous, and future_net for net-technique tips); only published tips render
 * publicly. Moderation reads every status but writes only published or hidden, so
 * an unresolved bucket is never flattened. editTipText rejects empty or over-long
 * text. setTipDisplayOrder rejects a negative or non-integer order and treats a
 * cleared field as the unset zero; a duplicate order is allowed, because the read
 * statements already break the tie on id. hideTip acts only on a published tip (the only publicly visible kind) and
 * sets it hidden. restoreTip acts only on a hidden tip and, guarding that it still
 * points at an active canonical trick, sets it back to published; a hidden tip
 * whose trick is inactive or unresolved is not restored and must be remapped first.
 * remapTip requires an active canonical target slug (a missing, inactive,
 * non-canonical, or unchanged target is rejected), overwrites trick_slug, sets
 * status to published, and preserves the original slug and status in the audit
 * metadata. Each tip write and its one audit entry commit together, behind the same
 * persona guard.
 *
 * Source creation write discipline: createSource takes a curator-supplied id and
 * validates it as the permanent primary key (lowercase letters, digits, hyphen,
 * underscore; first and last character alphanumeric; unique, a duplicate rejected
 * distinctly). The source type must be one of the documented values, the label is
 * required, and the retrieval timestamp is required in the ISO-8601 UTC form the
 * existing rows use and is never silently defaulted. URL and notes are optional.
 * The insert and its one audit entry commit together behind the persona guard.
 *
 * Persistence: reads and writes freestyle_tricks, freestyle_trick_aliases,
 * freestyle_trick_source_links, freestyle_trick_modifier_links, freestyle_trick_tips,
 * and freestyle_trick_sources; reads freestyle_trick_modifiers. Appends
 * freestyle.trick.updated, freestyle.trick_alias.created/updated/deleted,
 * freestyle.trick_source_link.created/deleted,
 * freestyle.trick_modifier_link.created/deleted,
 * freestyle.trick_tip.edited/hidden/restored/remapped, and
 * freestyle.trick_source.created to audit_entries.
 */
import {
  freestyleTricks,
  freestyleEvAdjudications,
  type FreestyleEvAdjudicationRow,
  freestyleTrickAliases,
  freestyleTrickSources,
  freestyleTrickSourceLinks,
  freestyleTrickModifiers,
  freestyleTrickModifierLinks,
  freestyleTrickTips,
  transaction,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { ForbiddenError, NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { checkAddMatchesScoringBrackets } from '../lib/freestyleNotation';
import { trickNameToSlug } from './freestyleRecordShaping';
import {
  DISPLAY_NAME_ROW_EXCEPTIONS,
  GENUINE_HYPHEN_TOKENS,
} from '../content/freestyleDisplayNameExceptions';
import { EMERGING_DECISION_GROUPS } from '../content/freestyleObservationalUniverse';
import {
  NOTATION_EVIDENCE_BASES,
  NOTATION_DERIVATION_METHODS,
  NOTATION_CONVENTIONS,
  CONVENTION_DERIVATION,
  isNotationEvidenceBasis,
  isNotationDerivationMethod,
  isNotationConvention,
  notationBasisLabel,
  notationMethodLabel,
  notationConventionTitle,
  type ProvenanceOption,
  type NotationConvention,
} from '../content/freestyleNotationProvenance';
import { countScoringBrackets } from '../lib/freestyleNotation';
import { config } from '../config/env';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';

// A pre-check rejects a duplicate before each insert, but two writers in separate
// processes can both pass that check and race to the same key; the primary-key /
// unique constraint is the authoritative backstop. Map its violation to the same
// ValidationError the pre-check raises, so the losing writer sees the clean
// "already exists" message instead of an unhandled 500.
function isDuplicateKeyError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

interface CurationTrickDbRow {
  slug: string;
  canonical_name: string;
  adds: string | null;
  trick_family: string | null;
  is_active: number;
  review_status: string;
}

export interface FreestyleBrowseRow {
  slug: string;
  displayName: string;
  adds: string;
  family: string;
  isActive: boolean;
  activeLabel: string;
  reviewStatusLabel: string;
  editHref: string;
}

interface FilterOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface FreestyleBrowseFilters {
  query: string;
  activeOptions: FilterOption[];
  reviewStatusOptions: FilterOption[];
  isFiltered: boolean;
}

export interface FreestyleBrowseContent {
  rows: FreestyleBrowseRow[];
  totalCount: number;
  filters: FreestyleBrowseFilters;
  hasRows: boolean;
}

export interface FreestyleBrowseFilterInput {
  query?: string;
  active?: string;        // '', 'active', or 'inactive'
  reviewStatus?: string;  // '', 'curated', 'expert_reviewed', or 'pending'
}

export interface FreestyleTrickEditAlias {
  slug: string;
  text: string;
  type: string;
  typeOptions: FilterOption[];
  isDisplayed: boolean;
  displayLabel: string;
  /** True when the publication state is set against what the class implies, so
   *  the form can mark the reason required and say which way it diverges. */
  divergesFromClass: boolean;
  /** The standing reason for that divergence, shown so a curator sees why the
   *  exception exists before changing it. */
  divergenceReason: string;
  /** What the alias's source says it is. Provenance, not a publication judgement:
   *  it survives a change to the class or the display state. */
  provenanceNote: string;
  /** Sources this alias may cite, with its own selected, so the form round-trips
   *  provenance rather than offering only to clear it. */
  sourceOptions: FilterOption[];
  /** True when the application already owns the row. */
  isCuratorOwned: boolean;
  /** Said plainly on a committed row, because saving takes it over. */
  ownerLabel: string;
  updateHref: string;
  deleteHref: string;
}

export interface FreestyleTrickEditSource {
  sourceId: string;
  label: string;
  type: string;
  url: string | null;
  externalUrl: string | null;
  assertedAdds: number | null;
  detachHref: string;
}

export interface FreestyleTrickEditModifierLink {
  slug: string;
  name: string;
  type: string;
  addBonus: number;
  applyOrder: number;
  detachHref: string;
}

export interface FreestyleTrickEditFields {
  canonicalName: string;
  adds: string;
  movementNotation: string;
  executionNotation: string;
  family: string;
  baseTrick: string;
  category: string;
  isActive: boolean;
  activeLabel: string;
  sortOrder: string;
  reviewStatus: string;
  reviewStatusLabel: string;
  description: string;
  shortDescription: string;
  executionSummary: string;
  learningNotes: string;
  prerequisiteNotes: string;
  pronunciation: string;
  operationalNotationSource: string;
}

export interface FreestyleTrickEditContent {
  slug: string;
  fields: FreestyleTrickEditFields;
  categoryOptions: FilterOption[];
  reviewStatusOptions: FilterOption[];
  aliases: FreestyleTrickEditAlias[];
  sources: FreestyleTrickEditSource[];
  modifierLinks: FreestyleTrickEditModifierLink[];
  hasAliases: boolean;
  hasSources: boolean;
  hasModifierLinks: boolean;
  backHref: string;
  saved: boolean;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
  addAliasHref: string;
  aliasTypeOptions: FilterOption[];
  /** Sources a new alias may cite, headed by the no-source curator assertion. */
  aliasSourceOptions: FilterOption[];
  aliasFormText: string;
  aliasError: string;
  hasAliasError: boolean;
  attachSourceHref: string;
  sourceOptions: FilterOption[];
  hasUnlinkedSources: boolean;
  sourceFormExternalUrl: string;
  sourceFormAssertedAdds: string;
  sourceError: string;
  hasSourceError: boolean;
  attachModifierHref: string;
  modifierOptions: FilterOption[];
  modifierFormApplyOrder: string;
  modifierError: string;
  hasModifierError: boolean;
}

/** The alias fields the add-alias form submits. */
export interface FreestyleAliasInput {
  aliasText?: string;
  aliasType?: string;
  /** The source this alias's evidence comes from; empty means a curator assertion. */
  sourceId?: string;
  /** What that source says the alias is. */
  provenanceNote?: string;
}

/** The fields the per-alias edit form submits. */
export interface FreestyleAliasClassInput {
  aliasType?: string;
  aliasDisplay?: string;
  /** Why this alias is published against what its class implies, or held back
   *  against it. Required only when the two disagree. */
  divergenceReason?: string;
  /** The source this alias's evidence comes from. Absent leaves it as it was;
   *  the empty string is the deliberate choice of "a curator's own assertion". */
  sourceId?: string;
  /** What the source says the alias is. Absent leaves it as it was. */
  provenanceNote?: string;
}

/** The source-link fields the attach-source form submits. */
export interface FreestyleSourceLinkInput {
  sourceId?: string;
  externalUrl?: string;
  assertedAdds?: string;
}

/** The modifier-link fields the attach-modifier form submits. */
export interface FreestyleModifierLinkInput {
  modifierSlug?: string;
  applyOrder?: string;
}

/**
 * The editable scalar fields submitted by the edit form: the structural fields
 * plus the editorial prose fields, so every database-backed field on the trick
 * row has an in-app edit path and no content freezes once the live database is
 * the source of truth.
 */
export interface FreestyleTrickScalarInput {
  canonicalName?: string;
  adds?: string;
  movementNotation?: string;
  executionNotation?: string;
  family?: string;
  baseTrick?: string;
  category?: string;
  reviewStatus?: string;
  isActive?: boolean;
  sortOrder?: string;
  description?: string;
  shortDescription?: string;
  executionSummary?: string;
  learningNotes?: string;
  prerequisiteNotes?: string;
  pronunciation?: string;
  operationalNotationSource?: string;
}

/** Options for re-rendering the edit page after a save or a validation failure. */
export interface EditPageOptions {
  saved?: boolean;
  submitted?: FreestyleTrickScalarInput;
  fieldErrors?: Record<string, string>;
  aliasError?: string;
  aliasSubmitted?: FreestyleAliasInput;
  sourceError?: string;
  sourceSubmitted?: FreestyleSourceLinkInput;
  modifierError?: string;
  modifierSubmitted?: FreestyleModifierLinkInput;
}

interface CurationEditDbRow {
  slug: string;
  canonical_name: string;
  adds: string | null;
  notation: string | null;
  operational_notation: string | null;
  trick_family: string | null;
  base_trick: string | null;
  category: string | null;
  is_active: number;
  sort_order: number;
  review_status: string;
  description: string | null;
  short_description: string | null;
  execution_summary: string | null;
  learning_notes: string | null;
  prerequisite_notes: string | null;
  pronunciation: string | null;
  operational_notation_source: string | null;
}
interface AliasDbRow {
  alias_slug: string;
  alias_text: string;
  alias_type: string;
  alias_display: number;
  /** Where the evidence for this alias came from, or null for a curator's own assertion. */
  source_id: string | null;
  /** What that source says the alias is. Provenance, never a publication judgement. */
  provenance_note: string | null;
  /** Why the display state diverges from the class, when it does. */
  display_reason: string | null;
  /** Who owns the row and may rewrite it. Independent of where its evidence came from. */
  alias_origin_producer: string;
}
interface FullAliasDbRow extends AliasDbRow { trick_slug: string; }
interface SourceLinkDbRow {
  source_id: string;
  source_label: string;
  source_type: string;
  source_url: string | null;
  external_url: string | null;
  asserted_adds: number | null;
}
interface SourceLinkKeyDbRow {
  trick_slug: string;
  source_id: string;
  external_url: string | null;
  asserted_adds: number | null;
}
interface SourceRegistryRow { id: string; source_label: string; }
interface ModifierLinkDbRow {
  modifier_slug: string;
  modifier_name: string;
  modifier_type: string;
  add_bonus: number;
  apply_order: number;
}
interface ModifierRegistryRow { slug: string; modifier_name: string; modifier_type: string; }
interface ModifierLinkKeyDbRow { trick_slug: string; modifier_slug: string; apply_order: number; }

// The category set is broad and has no schema CHECK, so the allowed values are
// read from the data rather than hardcoded (the data carries values beyond the
// schema comment's examples, and some rows carry none).
function allowedCategories(): string[] {
  return (freestyleTricks.listDistinctCategories.all() as { category: string }[]).map((r) => r.category);
}

const REVIEW_STATUS_LABELS: Record<string, string> = {
  curated: 'Curated',
  expert_reviewed: 'Expert reviewed',
  pending: 'Pending',
};
const REVIEW_STATUS_VALUES = ['curated', 'expert_reviewed', 'pending'];

// The review statuses the admin surface manages. Deliberately the same three the
// browse filter offers; the schema's fourth value is not part of this surface.
const EDITABLE_REVIEW_STATUSES = REVIEW_STATUS_VALUES;

const CANONICAL_NAME_MAX = 200;
// Upper bound on each editorial prose field, a safety cap against oversized
// payloads rather than an editorial length rule; the longest field (learning
// notes) comfortably fits.
const PROSE_MAX = 4000;

// The alias classes the column stores, offered whole by the alias forms. No CHECK
// constrains the column, so the admin surface is the enforcement point, and a
// curator who cannot name a row's real class cannot classify it correctly.
const ALIAS_TYPE_LABELS: Record<string, string> = {
  common:     'Common (community nickname)',
  historical: 'Historical (superseded name)',
  technical:  'Technical (abbreviation or spelling variant)',
  structural: 'Structural (decomposition used as a name)',
  positional: 'Positional (same-side or opposite-side marker)',
  typo:       'Typo (misspelling)',
  suppressed: 'Suppressed',
  ambiguous:  'Ambiguous',
};
const ALIAS_TYPES = Object.keys(ALIAS_TYPE_LABELS);

// The nickname class, and the only one a reader sees by default. Public "Also
// called" display follows the class: an alias's type decides its display state
// when it is created, and a curator changes that state only as a deliberate
// exception (a structural reading a trick's page genuinely needs beside it).
const NICKNAME_ALIAS_TYPES = ['common'];
// The single definition of what a class implies about publication. Both the add
// and the edit path read it, and the curated-override loader carries the same
// rule in Python because the two cannot share an implementation; a test pins the
// two definitions equivalent rather than a configuration layer existing to hold
// one line.
const displayDefaultForAliasType = (aliasType: string): number =>
  (NICKNAME_ALIAS_TYPES.includes(aliasType) ? 1 : 0);
/** Shortest reason that can carry a judgement rather than a keystroke. */
const ALIAS_REASON_MIN = 12;
const ALIAS_REASON_MAX = 500;
/** Room for what a source says an alias is, without room for an essay. */
const ALIAS_PROVENANCE_NOTE_MAX = 500;

/**
 * Why this display name may not be stored under this slug, or null when it may.
 *
 * The same three tests the content pipeline's naming gate applies, in the same
 * order, so a name accepted here is one the pipeline will accept on its next
 * run. A name is fine when the curator has approved it verbatim for this slug;
 * otherwise it must carry no underscore, its hyphens must sit only inside the
 * approved compound adjectives, and folding it must reproduce the slug.
 *
 * The slug is never rewritten to follow the name. It is the primary key every
 * identifier surface derives from, so the name follows it, not the reverse.
 */
function displayNameViolation(slug: string, name: string): string | null {
  if (DISPLAY_NAME_ROW_EXCEPTIONS.get(slug) === name) return null;
  if (name.includes('_')) {
    return 'Display name carries an underscore. Write the readable name; the slug keeps the underscores.';
  }
  const withoutApprovedHyphens = GENUINE_HYPHEN_TOKENS.reduce(
    (acc, token) => acc.replace(new RegExp(`\\b${token}\\b`, 'gi'), ''),
    name,
  );
  if (withoutApprovedHyphens.includes('-')) {
    return 'Display name carries a hyphen used as a separator. Only genuine compound adjectives keep one.';
  }
  if (trickNameToSlug(name) !== slug) {
    return `Display name does not fold back to the slug "${slug}". Rename it so it does, or record a curator exception.`;
  }
  return null;
}
const ALIAS_TEXT_MAX = 200;

// Pre-go-live guardrail, parallel to the curated-media one. It fires only where a
// curator write touches the committed pre-go-live source of truth in a developer
// checkout (config.allowCuratedSidecarWrites, which is on in dev and the
// integration-test fixture and off in staging and production). There, a seeded
// test persona must never author freestyle dictionary content; real maintainer
// accounts carry ordinary member ids and pass. In staging and production this is
// a no-op, so any admin may curate. The admin remains the audit actor of record.
function assertActorMayCurateFreestyle(actorMemberId: string): void {
  if (config.allowCuratedSidecarWrites && isSeededTestPersonaMemberId(actorMemberId)) {
    throw new ForbiddenError(
      'Freestyle dictionary content cannot be edited by a test persona in a pre-go-live developer checkout.',
    );
  }
}

// ── The notation-authoring backlog ─────────────────────────────────────────

interface NotationBacklogDbRow {
  candidate_id: string;
  submitted_name: string;
  normalized_name: string;
  ev_state: string;
  evidence_state: string;
  object_type: string;
  blocker_id: string;
  blocker_subtype: string;
  owner: string;
  source: string;
  confidence: string;
  matched_existing_object: string;
  match_type: string;
  proposed_formula: string;
  residual_home: string;
  note: string;
  published_trick_slug: string | null;
}

export interface FreestyleNotationBacklogRow {
  candidateId: string;
  submittedName: string;
  normalizedName: string;
  evidenceLabel: string;
  rulingLabel: string;
  objectType: string;
  blockerId: string;
  blockerTitle: string;
  blockerSubtype: string;
  owner: string;
  source: string;
  confidence: string;
  matchedObject: string;
  matchType: string;
  proposedFormula: string;
  residualHome: string;
  note: string;
  trickSlug: string;
  hasTrickRow: boolean;
  trickHref: string;
  authorHref: string;
}

export interface FreestyleNotationBacklogGroup {
  blockerId: string;
  blockerTitle: string;
  count: number;
  rows: FreestyleNotationBacklogRow[];
}

export interface FreestyleNotationBacklogContent {
  groups: FreestyleNotationBacklogGroup[];
  totalCount: number;
  hasRows: boolean;
  draftsHref: string;
  draftCount: number;
}

// ── Authoring one ruling's notation ────────────────────────────────────────

interface AuthoringDbRow extends NotationBacklogDbRow {
  final_disposition: string;
  version: number;
  authored_notation: string | null;
  notation_evidence_basis: string | null;
  notation_derivation_method: string | null;
  notation_convention_id: string | null;
  notation_provenance_note: string | null;
  notation_authored_at: string | null;
  notation_authored_by: string | null;
}

export interface FreestyleNotationAuthoringInput {
  notation?: string;
  evidenceBasis?: string;
  derivationMethod?: string;
  conventionId?: string;
  provenanceNote?: string;
}

export interface FreestyleNotationAuthoringContent {
  candidateId: string;
  submittedName: string;
  /** What the ruling already settled, so the curator is not asked to restate it. */
  settled: FreestyleNotationBacklogRow;
  /** The form's current values: the saved draft, or what was just submitted. */
  fields: {
    notation: string;
    evidenceBasis: string;
    derivationMethod: string;
    conventionId: string;
    provenanceNote: string;
  };
  basisOptions: FilterOption[];
  methodOptions: FilterOption[];
  conventionOptions: FilterOption[];
  basisHelp: ProvenanceOption[];
  methodHelp: ProvenanceOption[];
  conventionSummaries: NotationConvention[];
  /** Information, not a gate: the difficulty this notation will have to match is
   *  asserted when the canonical trick is created, and does not exist yet. */
  scoringBracketCount: number;
  bracketCountLine: string;
  isAuthored: boolean;
  authoredAt: string;
  authoredBy: string;
  saveHref: string;
  backlogHref: string;
  /** Messages for the banner, the way every other admin form on this surface
   *  reports a refusal. Keyed messages stay on the service contract; the page
   *  renders the list. */
  errorList: string[];
  hasErrors: boolean;
  saved: boolean;
}

export interface FreestyleNotationDraftRow {
  candidateId: string;
  submittedName: string;
  notation: string;
  scoringBracketCount: number;
  basisLabel: string;
  methodLabel: string;
  conventionTitle: string;
  provenanceNote: string;
  authoredAt: string;
  authoredBy: string;
  blockerId: string;
  owner: string;
  authorHref: string;
  publishHref: string;
  publishable: boolean;
}

export interface FreestyleNotationDraftsContent {
  rows: FreestyleNotationDraftRow[];
  totalCount: number;
  hasRows: boolean;
  backlogHref: string;
}

// ── Publishing an authored draft as a canonical trick ──────────────────────

/** Only what a curator decides at publication. Everything the draft already
 *  settled (the movement, what it rests on, how it was produced) is carried from
 *  the ruling and never re-entered here, so the two can never disagree. */
export interface FreestyleTrickPublicationInput {
  canonicalName?: string;
  adds?: string;
  baseTrick?: string;
  category?: string;
  familyOverride?: string;
  description?: string;
  /** Pipe-separated display texts; each becomes one alias row. */
  aliases?: string;
  sourceId?: string;
  sourceUrl?: string;
  sourceAssertedNotation?: string;
  /** Pipe-separated registry modifier slugs, in the order they apply. */
  modifierLinks?: string;
}

export interface FreestyleTrickPublicationContent {
  candidateId: string;
  submittedName: string;
  /** What the ruling settled, shown so the curator is not asked to restate it. */
  settled: FreestyleNotationBacklogRow;
  /** Carried from the draft: displayed, never re-entered. */
  notation: string;
  scoringBracketCount: number;
  evidenceBasisLabel: string;
  derivationLabel: string;
  conventionTitle: string;
  provenanceNote: string;
  fields: {
    canonicalName: string;
    adds: string;
    baseTrick: string;
    category: string;
    familyOverride: string;
    description: string;
    aliases: string;
    sourceId: string;
    sourceUrl: string;
    sourceAssertedNotation: string;
    modifierLinks: string;
  };
  categoryOptions: FilterOption[];
  sourceOptions: FilterOption[];
  /** Whether the notation's own evidence basis obliges a source link, and
   *  whether that link must record what the source itself wrote. */
  sourceRequired: boolean;
  assertedNotationRequired: boolean;
  /** Why this ruling cannot be published, empty when it can. */
  refusal: string;
  publishable: boolean;
  publishHref: string;
  draftsHref: string;
  errorList: string[];
  hasErrors: boolean;
}

// Readable words for the two ledger vocabularies this queue displays. A curator
// reading a work queue should not have to translate the record's own shorthand,
// and an unmapped value falls through as itself rather than being hidden.
const EVIDENCE_STATE_LABELS: Record<string, string> = {
  'compositional-name-only': 'Name only, composition understood',
  'partial-structure':       'Partial structure',
  'folk-name-only':          'Folk name only',
  'contradictory':           'Contradictory evidence',
  'none':                    'No evidence recorded',
  'not-applicable':          'Not applicable',
};

const EV_STATE_LABELS: Record<string, string> = {
  authoring:           'Awaiting authoring',
  parser:              'Parser-held',
  doctrine:            'Doctrine-held',
  undefined_operator:  'Undefined operator',
  deferred:            'Deferred',
};

// The curator decision groups by the id each ruling carries, so the queue says
// what released a name rather than only which code gated it. Titles come from
// the generated corpus module, which is the single home for the group registry;
// a group with no entry shows its id alone rather than an invented title.
const DECISION_GROUP_TITLES: Record<string, string> = Object.fromEntries(
  EMERGING_DECISION_GROUPS.map((g) => [g.id, g.title]),
);

// A movement notation is a line, not an essay: the longest in the corpus is well
// under this, and the cap is here to reject a pasted document rather than to
// shape authoring.
const NOTATION_MAX = 500;

/** One ruling's settled facts, shaped the same way wherever they are shown: in
 *  the queue, and beside the notation field on the authoring form. */
function shapeBacklogRow(r: NotationBacklogDbRow): FreestyleNotationBacklogRow {
  return {
    candidateId:     r.candidate_id,
    submittedName:   r.submitted_name,
    normalizedName:  r.normalized_name,
    evidenceLabel:   EVIDENCE_STATE_LABELS[r.evidence_state] ?? r.evidence_state,
    rulingLabel:     EV_STATE_LABELS[r.ev_state] ?? r.ev_state,
    objectType:      r.object_type,
    blockerId:       r.blocker_id,
    blockerTitle:    DECISION_GROUP_TITLES[r.blocker_id] ?? '',
    blockerSubtype:  r.blocker_subtype,
    owner:           r.owner,
    source:          r.source,
    confidence:      r.confidence,
    matchedObject:   r.matched_existing_object,
    matchType:       r.match_type,
    proposedFormula: r.proposed_formula,
    residualHome:    r.residual_home,
    note:            r.note,
    trickSlug:       r.published_trick_slug ?? '',
    hasTrickRow:     r.published_trick_slug !== null,
    trickHref:       r.published_trick_slug ? `/admin/freestyle/tricks/${r.published_trick_slug}/edit` : '',
    authorHref:      `/admin/freestyle/notation-backlog/${r.candidate_id}/author`,
  };
}

// ── Publication and the adjudication record ────────────────────────────────
//
// A trick held out of the dictionary with is_active = 0 and review_status
// 'pending' is a candidate: the observational surface lists exactly that set and
// joins each one's ruling to it. Leaving that set IS publication, so a save that
// takes a row out of it is the moment the name stops being a candidate.
//
// Where the name carries a ruling, publication resolves it: the ruling records
// that the name became canonical and which trick row it resolved to. The ruling
// itself stays. It is the record of how the name was decided, and deleting it on
// publication would destroy exactly the history the migration off the committed
// ledger existed to keep.

/** True when this save takes the row out of the held-out candidate set. */
function publicationCrossed(
  current: { is_active: number; review_status: string },
  next: { isActive: number; reviewStatus: string },
): boolean {
  const wasCandidate = current.is_active === 0 && current.review_status === 'pending';
  const isCandidate  = next.isActive === 0 && next.reviewStatus === 'pending';
  return wasCandidate && !isCandidate;
}

/** The ledger's comparison key: alphanumerics of the name, lowercased. */
function adjudicationNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Publishing a draft as a canonical trick ────────────────────────────────

/** Why this ruling cannot be published, or null when it can.
 *
 *  Read entirely from the durable adjudication fields; there is no workflow
 *  state and this gate does not add one. Each clause refuses a different way of
 *  publishing something nobody decided:
 *
 *  - A resolved ruling has already been published or archived.
 *  - A ruling with no authored movement has nothing to publish.
 *  - A set-operator or an observational name is not a trick.
 *  - A doctrine or undefined-operator state is an identity hold, whether or not
 *    a question id is attached to it.
 *  - A question id always names an OPEN doctrine question, because the content
 *    build refuses a row citing a closed one. Publishing would settle the name
 *    by action rather than by ruling.
 *  - A source-recovery hold means nobody has established where the name came
 *    from. A movement being supported says nothing about whether the name is
 *    attested, and publishing would answer that by side effect. */
function publicationRefusal(row: AuthoringDbRow): string | null {
  if (row.final_disposition !== 'C') {
    return 'This ruling is already resolved, so there is nothing left to publish.';
  }
  if (!row.authored_notation) {
    return 'Author the movement notation before publishing.';
  }
  if (row.object_type !== 'complete-trick') {
    return `This ruling is about a ${row.object_type}, which is not a trick.`;
  }
  if (row.ev_state === 'doctrine' || row.ev_state === 'undefined_operator') {
    return 'This name is held on an identity question, so it cannot be published yet.';
  }
  if (row.blocker_id.startsWith('Q')) {
    return `This name is held on the open doctrine question ${row.blocker_id}, `
         + 'so publishing it would settle the question by action rather than by ruling.';
  }
  if (row.blocker_id === 'source-recovery') {
    return 'This name is held pending recovery of its source, so its attestation is '
         + 'not established. A movement notation does not settle that.';
  }
  return null;
}

// The two evidence bases that claim an outside source: one says the source wrote
// a notation, the other says it wrote prose. Both oblige the published trick to
// link to the source it rests on. Footage, testimony and platform structure rest
// on no registered source, and a link is never invented to make one look sourced.
const NOTATION_BASES_NEEDING_SOURCE = new Set(['source-notation', 'source-prose']);

/** The citation line a reader sees beneath the notation, written from the same
 *  claims the structured columns carry: what the notation rests on, what was
 *  done to produce it, the convention where one governed it, and the curator's
 *  own note when the ruling carried one. Readers get a sentence; an audit gets
 *  the fields. */
function publicationCitationLine(row: AuthoringDbRow): string {
  const basis  = notationBasisLabel(row.notation_evidence_basis ?? '');
  const method = notationMethodLabel(row.notation_derivation_method ?? '');
  const parts = [`${basis}, ${method.toLowerCase()}`];
  if (row.notation_convention_id) {
    parts.push(`under the ${notationConventionTitle(row.notation_convention_id).toLowerCase()}`);
  }
  const line = `Notation: ${parts.join(', ')}.`;
  return row.notation_provenance_note ? `${line} ${row.notation_provenance_note}` : line;
}

/**
 * Resolve the published name's ruling, inside the caller's transaction.
 *
 * Three cases, and the quiet one is the common one:
 *
 *  - No ruling for this name. Most canonical tricks were never adjudicated, so
 *    this is ordinary and silent. Warning here would train a curator to ignore
 *    the warning that matters.
 *  - A ruling bound to this trick, or bound to nothing and matching the name.
 *    Resolved, and the link recorded where it was absent.
 *  - A ruling for this name bound to a DIFFERENT trick row. Two records disagree
 *    about which trick the name is, and publishing through that would write the
 *    contradiction into the record where nobody is looking. Refused, the way
 *    this service already refuses an alias that collides with a canonical slug.
 *
 * Returns the resolved ruling's id for the audit entry, or null when there was
 * nothing to resolve.
 */
function resolveAdjudicationOnPublication(
  slug: string,
  canonicalName: string,
  actorMemberId: string,
  // The funnel knows exactly which ruling it is publishing, so it names it
  // rather than letting the lookup find one: a curator may publish under a
  // display name that no longer matches the corpus spelling the ruling was filed
  // under, and matching by name would then resolve nothing.
  knownCandidateId?: string,
): string | null {
  const byId = knownCandidateId
    ? (freestyleEvAdjudications.getForAuthoring.get(knownCandidateId) as
        FreestyleEvAdjudicationRow | undefined)
    : undefined;
  const linked = byId
    ?? (freestyleEvAdjudications.getByTrickSlug.get(slug) as FreestyleEvAdjudicationRow | undefined);
  const byName = linked
    ?? (freestyleEvAdjudications.getByNormalizedName.get(adjudicationNameKey(canonicalName)) as
      FreestyleEvAdjudicationRow | undefined);
  if (!byName) return null;

  if (byName.published_trick_slug !== null && byName.published_trick_slug !== slug) {
    throw new ValidationError(
      `The ruling for "${byName.submitted_name}" is recorded against `
      + `"${byName.published_trick_slug}", so publishing it as "${slug}" would make two `
      + 'records disagree about which trick this name is. Resolve the ruling first.',
      { fieldErrors: { isActive: 'This name is already ruled to be a different trick.' } },
    );
  }

  freestyleEvAdjudications.resolveOnPublication.run(slug, slug, actorMemberId, byName.candidate_id);
  return byName.candidate_id;
}

// Imported community tips carry more advice than a one-liner but are not essays;
// cap edited text at the same length as the trick editorial-prose fields.
const TIP_TEXT_MAX = PROSE_MAX;

interface TipModerationDbRow {
  id: number;
  trick_slug: string;
  tip_text: string;
  status: string;
  display_order: number;
  created_at_legacy: number | null;
}

export interface TipModerationRow {
  id: number;
  trickSlug: string;
  tipText: string;
  status: string;
  statusLabel: string;
  isPublished: boolean;
  isHidden: boolean;
  isUnresolved: boolean;
  // An unresolved tip carries the original import name inside its slug; expose it
  // so the moderator sees what a remap would resolve.
  unresolvedName: string;
  // The render sequence on the trick page, as the display-order form's value.
  displayOrder: string;
}

export interface FreestyleTipModerationContent {
  rows: TipModerationRow[];
  totalCount: number;
  query: string;
  statusOptions: FilterOption[];
  // The applied status, as the plain value the per-row action forms round-trip so
  // an action returns the moderator to the same filtered list.
  statusFilter: string;
  trickSlug: string;
  isFiltered: boolean;
  hasRows: boolean;
  // Set when a moderation action failed validation and the index is re-rendered
  // in place with the message.
  error?: string;
}

// The import assigns a richer status vocabulary than published/hidden: a tip whose
// legacy trick name has no canonical trick yet is bucketed by why it is unresolved,
// and net-technique tips are parked for future Net pages. Moderation reads all of
// these but only ever writes published or hidden; an unresolved tip leaves its
// bucket only by being remapped to a canonical trick.
const TIP_STATUS_LABELS: Record<string, string> = {
  published:            'Published',
  hidden:               'Hidden',
  unresolved_freestyle: 'Unresolved (freestyle)',
  unresolved_frontier:  'Unresolved (frontier)',
  unresolved_ambiguous: 'Unresolved (ambiguous)',
  future_net:           'Future net',
};

function shapeTipModerationRow(r: TipModerationDbRow): TipModerationRow {
  const isPublished = r.status === 'published';
  const isHidden = r.status === 'hidden';
  const hasUnresolvedSlug = r.trick_slug.startsWith('unresolved:');
  return {
    id:             r.id,
    trickSlug:      r.trick_slug,
    tipText:        r.tip_text,
    status:         r.status,
    statusLabel:    TIP_STATUS_LABELS[r.status] ?? r.status,
    isPublished,
    isHidden,
    // Every status that is neither published nor hidden is an unresolved-family
    // status: the tip is not public and awaits a remap to a canonical trick.
    isUnresolved:   !isPublished && !isHidden,
    unresolvedName: hasUnresolvedSlug ? r.trick_slug.slice('unresolved:'.length) : '',
    displayOrder:   String(r.display_order),
  };
}

// Every status the tip column carries, in the order the moderation filter offers
// them: the two moderation writes first, then the four import-assigned buckets.
const TIP_STATUS_VALUES = Object.keys(TIP_STATUS_LABELS);

const SOURCE_ID_MAX = 100;
const SOURCE_LABEL_MAX = 200;
const SOURCE_URL_MAX = 500;
const SOURCE_NOTES_MAX = PROSE_MAX;
const SOURCE_TYPES = ['curated', 'scraped', 'expert', 'imported'];

// A curator-supplied source id is a permanent primary key referenced by the
// trick-to-source links, so it can never be renamed through this surface and its
// shape is constrained: lowercase letters, digits, hyphen, and underscore,
// beginning and ending with a letter or digit.
const SOURCE_ID_PATTERN = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/;
// The retrieval timestamp matches the ISO-8601 UTC form the existing source rows
// carry, for example 2026-04-20T00:00:00.000Z.
const SOURCE_RETRIEVED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface SourceCurationDbRow {
  id: string;
  source_type: string;
  source_label: string;
  source_url: string | null;
  retrieved_at: string;
  notes: string | null;
}

export interface FreestyleSourceInput {
  id?: string;
  sourceType?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  notes?: string;
}

export interface FreestyleSourceRegistryRow {
  id: string;
  sourceType: string;
  sourceLabel: string;
  sourceUrl: string;
  retrievedAt: string;
  notes: string;
}

export interface FreestyleSourceRegistryContent {
  rows: FreestyleSourceRegistryRow[];
  totalCount: number;
  hasRows: boolean;
  typeOptions: FilterOption[];
  // The form's submitted values on a re-render (so a rejected create preserves
  // what the curator typed), any inline error, and the retrieval-timestamp field
  // value: the submitted value when re-rendering, otherwise a current-timestamp
  // prefill the curator confirms or edits before submitting.
  submitted: FreestyleSourceInput;
  retrievedAtValue: string;
  error?: string;
}

export const freestyleCurationService = {
  getBrowsePage(filter: FreestyleBrowseFilterInput = {}): PageViewModel<FreestyleBrowseContent> {
    const query = (filter.query ?? '').trim();
    const activeFilter = filter.active === 'active' || filter.active === 'inactive' ? filter.active : '';
    const reviewFilter = REVIEW_STATUS_VALUES.includes(filter.reviewStatus ?? '') ? (filter.reviewStatus as string) : '';

    const needle = query.toLowerCase();
    const all = freestyleTricks.listForCuration.all() as CurationTrickDbRow[];

    const rows: FreestyleBrowseRow[] = all
      .filter((r) => {
        if (needle && !(r.canonical_name.toLowerCase().includes(needle) || r.slug.toLowerCase().includes(needle))) {
          return false;
        }
        if (activeFilter === 'active' && r.is_active !== 1) return false;
        if (activeFilter === 'inactive' && r.is_active !== 0) return false;
        if (reviewFilter && r.review_status !== reviewFilter) return false;
        return true;
      })
      .map((r) => ({
        slug: r.slug,
        displayName: r.canonical_name,
        adds: r.adds ?? '',
        family: r.trick_family ?? '',
        isActive: r.is_active === 1,
        activeLabel: r.is_active === 1 ? 'Active' : 'Inactive',
        reviewStatusLabel: REVIEW_STATUS_LABELS[r.review_status] ?? r.review_status,
        editHref: `/admin/freestyle/tricks/${r.slug}/edit`,
      }));

    const activeOptions: FilterOption[] = [
      { value: '',         label: 'Any Active State', selected: activeFilter === '' },
      { value: 'active',   label: 'Active',           selected: activeFilter === 'active' },
      { value: 'inactive', label: 'Inactive',         selected: activeFilter === 'inactive' },
    ];
    const reviewStatusOptions: FilterOption[] = [
      { value: '', label: 'Any Review Status', selected: reviewFilter === '' },
      ...REVIEW_STATUS_VALUES.map((v) => ({ value: v, label: REVIEW_STATUS_LABELS[v], selected: reviewFilter === v })),
    ];

    return {
      seo:  { title: 'Freestyle Content' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_browse', title: 'Freestyle Content' },
      content: {
        rows,
        totalCount: rows.length,
        filters: {
          query,
          activeOptions,
          reviewStatusOptions,
          isFiltered: query !== '' || activeFilter !== '' || reviewFilter !== '',
        },
        hasRows: rows.length > 0,
      },
    };
  },

  // The notation-authoring backlog: the rulings whose identity and difficulty
  // are settled and whose movement is not. Read-only, and read from the
  // adjudication table rather than the generated corpus module, because the
  // table is what a curator will author into and a queue read from the
  // projection would lag whatever was just written.
  //
  // Each row carries what is already settled about the name, so a curator
  // authoring notation is not asked to re-establish facts the funnel has:
  // what the ruling decided, what evidence it rests on, what released it, who
  // owns it, where the difficulty derivation came from, and the trick row if
  // one already exists. Aliases and folk names still live in the corpus module
  // and join later, with the authoring form that needs them.
  getNotationBacklogPage(): PageViewModel<FreestyleNotationBacklogContent> {
    const rows = freestyleEvAdjudications.listNotationBacklog.all() as NotationBacklogDbRow[];

    // A candidate that already has a held-out trick row links to it; one that
    // exists only as a ruling has nothing to link to yet, which is the ordinary
    // case in this queue.
    const shaped: FreestyleNotationBacklogRow[] = rows.map(shapeBacklogRow);

    // Grouped by what released each name, because a curator works a decision
    // group at a time: one answer settles a whole cluster.
    const byBlocker = new Map<string, FreestyleNotationBacklogRow[]>();
    for (const row of shaped) {
      const list = byBlocker.get(row.blockerId) ?? [];
      list.push(row);
      byBlocker.set(row.blockerId, list);
    }
    const groups: FreestyleNotationBacklogGroup[] = [...byBlocker.entries()].map(([id, list]) => ({
      blockerId:    id,
      blockerTitle: DECISION_GROUP_TITLES[id] ?? '',
      count:        list.length,
      rows:         list,
    }));

    const drafts = freestyleEvAdjudications.listAuthoredDrafts.all() as { candidate_id: string }[];

    return {
      seo:  { title: 'Notation Authoring Backlog' },
      page: {
        sectionKey: 'admin',
        pageKey:    'admin_freestyle_notation_backlog',
        title:      'Notation Authoring Backlog',
        intro:      'Rulings whose identity and difficulty are settled and whose movement notation is not yet authored.',
      },
      content: {
        groups,
        totalCount: shaped.length,
        hasRows:    shaped.length > 0,
        draftsHref: '/admin/freestyle/notation-drafts',
        draftCount: drafts.length,
      },
    };
  },

  // The authoring form for one ruling. Shows what the ruling already settled
  // beside the notation field, so a curator authoring a movement is not asked to
  // re-establish the identity, the evidence or the decision that released it.
  // Returns null for an unknown id (the controller maps null to 404).
  getNotationAuthoringPage(
    candidateId: string,
    opts: { submitted?: FreestyleNotationAuthoringInput; fieldErrors?: Record<string, string>; saved?: boolean } = {},
  ): PageViewModel<FreestyleNotationAuthoringContent> | null {
    const row = freestyleEvAdjudications.getForAuthoring.get(candidateId) as AuthoringDbRow | undefined;
    if (!row) return null;

    const sub = opts.submitted;
    const fields = {
      notation:         sub ? (sub.notation ?? '') : (row.authored_notation ?? ''),
      evidenceBasis:    sub ? (sub.evidenceBasis ?? '') : (row.notation_evidence_basis ?? ''),
      derivationMethod: sub ? (sub.derivationMethod ?? '') : (row.notation_derivation_method ?? ''),
      conventionId:     sub ? (sub.conventionId ?? '') : (row.notation_convention_id ?? ''),
      provenanceNote:   sub ? (sub.provenanceNote ?? '') : (row.notation_provenance_note ?? ''),
    };

    const brackets = countScoringBrackets(fields.notation);
    const fieldErrors = opts.fieldErrors ?? {};

    return {
      seo:  { title: `Author Notation: ${row.submitted_name}` },
      page: {
        sectionKey: 'admin',
        pageKey:    'admin_freestyle_notation_authoring',
        title:      `Author notation: ${row.submitted_name}`,
        intro:      'Write the movement, and record where it came from and what was done to produce it.',
      },
      content: {
        candidateId:   row.candidate_id,
        submittedName: row.submitted_name,
        settled:       shapeBacklogRow(row),
        fields,
        basisOptions: NOTATION_EVIDENCE_BASES.map((o) => ({
          value: o.value, label: o.label, selected: fields.evidenceBasis === o.value,
        })),
        methodOptions: NOTATION_DERIVATION_METHODS.map((o) => ({
          value: o.value, label: o.label, selected: fields.derivationMethod === o.value,
        })),
        conventionOptions: NOTATION_CONVENTIONS.map((c) => ({
          value: c.id, label: c.title, selected: fields.conventionId === c.id,
        })),
        basisHelp:           [...NOTATION_EVIDENCE_BASES],
        methodHelp:          [...NOTATION_DERIVATION_METHODS],
        conventionSummaries: [...NOTATION_CONVENTIONS],
        scoringBracketCount: brackets,
        // Said as information rather than as a verdict: the difficulty this count
        // will have to match is asserted when the canonical trick is created, so
        // there is nothing yet to check it against.
        bracketCountLine: brackets === 1
          ? 'This notation carries 1 scoring bracket.'
          : `This notation carries ${brackets} scoring brackets.`,
        isAuthored:  row.authored_notation !== null,
        authoredAt:  row.notation_authored_at ?? '',
        authoredBy:  row.notation_authored_by ?? '',
        saveHref:    `/admin/freestyle/notation-backlog/${row.candidate_id}/author`,
        backlogHref: '/admin/freestyle/notation-backlog',
        errorList: Object.values(fieldErrors),
        hasErrors: Object.keys(fieldErrors).length > 0,
        saved: opts.saved === true,
      },
    };
  },

  // Save an authored notation and its provenance. Validates the shape of the
  // record only: that the two claims are answered from the vocabularies, that a
  // derivation names a registered convention and nothing else carries one, and
  // that the notation is present and within its cap. What makes a notation
  // publishable — the difficulty it must match, the collisions it must avoid, the
  // family it must inherit — is checked when the canonical trick is created,
  // because none of it can be checked against a record that does not exist yet.
  //
  // The previous notation and its provenance go into the audit entry. The ledger
  // is curation history rather than personal data, and a notation that was
  // replaced is exactly what an audit of this surface needs to be able to read.
  saveAuthoredNotation(
    candidateId: string,
    input: FreestyleNotationAuthoringInput,
    actorMemberId: string,
  ): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const current = freestyleEvAdjudications.getForAuthoring.get(candidateId) as AuthoringDbRow | undefined;
    if (!current) throw new NotFoundError(`No adjudication "${candidateId}"`);

    const fieldErrors: Record<string, string> = {};

    const notation = (input.notation ?? '').trim();
    if (!notation) {
      fieldErrors.notation = 'A movement notation is required.';
    } else if (notation.length > NOTATION_MAX) {
      fieldErrors.notation = `Notation must be ${NOTATION_MAX} characters or fewer.`;
    }

    const evidenceBasis = (input.evidenceBasis ?? '').trim();
    if (!evidenceBasis) {
      fieldErrors.evidenceBasis = 'Say where the notation came from.';
    } else if (!isNotationEvidenceBasis(evidenceBasis)) {
      fieldErrors.evidenceBasis = 'Choose one of the listed answers.';
    }

    const derivationMethod = (input.derivationMethod ?? '').trim();
    if (!derivationMethod) {
      fieldErrors.derivationMethod = 'Say what was done to produce it.';
    } else if (!isNotationDerivationMethod(derivationMethod)) {
      fieldErrors.derivationMethod = 'Choose one of the listed answers.';
    }

    // The convention belongs to exactly one method. Typing a rule nobody ratified
    // is what the registry exists to prevent: a derivation that names an
    // unratified convention cannot later be excluded from corroborating it.
    const conventionId = (input.conventionId ?? '').trim();
    if (derivationMethod === CONVENTION_DERIVATION) {
      if (!conventionId) {
        fieldErrors.conventionId = 'Name the convention this was derived under.';
      } else if (!isNotationConvention(conventionId)) {
        fieldErrors.conventionId = 'Choose a ratified convention from the list.';
      }
    } else if (conventionId) {
      fieldErrors.conventionId = 'A convention belongs only to a derivation.';
    }

    const provenanceNote = (input.provenanceNote ?? '').trim();
    if (provenanceNote.length > PROSE_MAX) {
      fieldErrors.provenanceNote = `Provenance note must be ${PROSE_MAX} characters or fewer.`;
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Some fields need attention.', { fieldErrors });
    }

    transaction(() => {
      freestyleEvAdjudications.saveAuthoredNotation.run(
        notation,
        evidenceBasis,
        derivationMethod,
        derivationMethod === CONVENTION_DERIVATION ? conventionId : null,
        provenanceNote === '' ? null : provenanceNote,
        actorMemberId,
        actorMemberId,
        candidateId,
      );
      appendAuditEntry({
        actionType:    'freestyle.adjudication_notation.authored',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_ev_adjudication',
        entityId:      candidateId,
        metadata:      {
          submittedName:    current.submitted_name,
          notation,
          evidenceBasis,
          derivationMethod,
          conventionId:     derivationMethod === CONVENTION_DERIVATION ? conventionId : null,
          scoringBrackets:  countScoringBrackets(notation),
          // What this replaced. Null throughout on a first authoring, which is
          // how the log distinguishes writing from rewriting.
          previousNotation:         current.authored_notation,
          previousEvidenceBasis:    current.notation_evidence_basis,
          previousDerivationMethod: current.notation_derivation_method,
          previousConventionId:     current.notation_convention_id,
        },
      });
    });
  },

  // The publication form for one authored draft. Everything the draft already
  // holds is shown and never re-asked; what remains is what only a curator can
  // decide about the canonical row. Returns null for an unknown ruling.
  getTrickPublicationPage(
    candidateId: string,
    opts: { submitted?: FreestyleTrickPublicationInput; fieldErrors?: Record<string, string> } = {},
  ): PageViewModel<FreestyleTrickPublicationContent> | null {
    const row = freestyleEvAdjudications.getForAuthoring.get(candidateId) as AuthoringDbRow | undefined;
    if (!row) return null;

    const refusal = publicationRefusal(row);
    const sub = opts.submitted;
    const fieldErrors = opts.fieldErrors ?? {};
    const notation = row.authored_notation ?? '';

    return {
      seo:  { title: `Publish: ${row.submitted_name}` },
      page: {
        sectionKey: 'admin',
        pageKey:    'admin_freestyle_trick_publication',
        title:      `Publish: ${row.submitted_name}`,
        intro:      'Create the canonical trick from this authored draft.',
      },
      content: {
        candidateId:   row.candidate_id,
        submittedName: row.submitted_name,
        settled:       shapeBacklogRow(row),
        // Inherited from the draft, displayed and never re-entered.
        notation,
        scoringBracketCount: countScoringBrackets(notation),
        evidenceBasisLabel:  notationBasisLabel(row.notation_evidence_basis ?? ''),
        derivationLabel:     notationMethodLabel(row.notation_derivation_method ?? ''),
        conventionTitle:     row.notation_convention_id ? notationConventionTitle(row.notation_convention_id) : '',
        provenanceNote:      row.notation_provenance_note ?? '',
        // What only a curator can decide.
        fields: {
          canonicalName: sub ? (sub.canonicalName ?? '') : row.submitted_name.toLowerCase(),
          adds:          sub ? (sub.adds ?? '') : '',
          baseTrick:     sub ? (sub.baseTrick ?? '') : '',
          category:      sub ? (sub.category ?? '') : 'compound',
          familyOverride: sub ? (sub.familyOverride ?? '') : '',
          description:   sub ? (sub.description ?? '') : '',
          aliases:       sub ? (sub.aliases ?? '') : '',
          sourceId:      sub ? (sub.sourceId ?? '') : '',
          sourceUrl:     sub ? (sub.sourceUrl ?? '') : '',
          sourceAssertedNotation: sub ? (sub.sourceAssertedNotation ?? '') : '',
          modifierLinks: sub ? (sub.modifierLinks ?? '') : '',
        },
        categoryOptions: allowedCategories().map((c) => ({
          value: c, label: c, selected: (sub?.category ?? 'compound') === c,
        })),
        sourceOptions: (freestyleTrickSources.listAll.all() as { id: string; source_label: string }[])
          .map((s) => ({ value: s.id, label: s.source_label, selected: (sub?.sourceId ?? '') === s.id })),
        // A source link is required only where the notation claims to rest on a
        // source; footage, testimony and platform structure require none, and
        // one is never invented to make a row look sourced.
        sourceRequired:          NOTATION_BASES_NEEDING_SOURCE.has(row.notation_evidence_basis ?? ''),
        assertedNotationRequired: (row.notation_evidence_basis ?? '') === 'source-notation',
        refusal:    refusal ?? '',
        publishable: refusal === null,
        publishHref: `/admin/freestyle/notation-backlog/${row.candidate_id}/publish`,
        draftsHref:  '/admin/freestyle/notation-drafts',
        errorList:  Object.values(fieldErrors),
        hasErrors:  Object.keys(fieldErrors).length > 0,
      },
    };
  },

  // Create the canonical trick from an authored draft, and resolve the ruling in
  // the same transaction. Everything is validated before anything is written: a
  // trick that exists while its aliases were refused is a worse outcome than a
  // refusal, and there is no second transaction that could leave one behind.
  publishCanonicalTrick(
    candidateId: string,
    input: FreestyleTrickPublicationInput,
    actorMemberId: string,
  ): string {
    assertActorMayCurateFreestyle(actorMemberId);
    const draft = freestyleEvAdjudications.getForAuthoring.get(candidateId) as AuthoringDbRow | undefined;
    if (!draft) throw new NotFoundError(`No adjudication "${candidateId}"`);

    // 1. The ruling is publishable at all.
    const refusal = publicationRefusal(draft);
    if (refusal) throw new ValidationError(refusal, { fieldErrors: { publication: refusal } });

    const fieldErrors: Record<string, string> = {};
    const notation = draft.authored_notation ?? '';
    const basis = draft.notation_evidence_basis ?? '';

    // 3. The name folds to a slug, under the same rule the trick editor applies.
    const canonicalName = (input.canonicalName ?? '').trim();
    if (!canonicalName) {
      fieldErrors.canonicalName = 'Canonical name is required.';
    } else if (canonicalName.length > CANONICAL_NAME_MAX) {
      fieldErrors.canonicalName = `Canonical name must be ${CANONICAL_NAME_MAX} characters or fewer.`;
    } else {
      const naming = displayNameViolation(trickNameToSlug(canonicalName), canonicalName);
      if (naming) fieldErrors.canonicalName = naming;
    }
    const slug = canonicalName ? trickNameToSlug(canonicalName) : '';
    if (canonicalName && !slug) {
      fieldErrors.canonicalName = 'The name must contain at least one letter or number.';
    }

    // 4. Nothing already owns that slug or name, as a trick or as an alias.
    if (slug) {
      if (freestyleTricks.getForCurationBySlug.get(slug)) {
        fieldErrors.canonicalName = `"${slug}" is already a trick in the dictionary.`;
      } else if (freestyleTrickAliases.getByAliasSlug.get(slug)) {
        fieldErrors.canonicalName = `"${slug}" is already an alias of another trick.`;
      }
    }

    // 5. The difficulty and the scoring brackets agree, checked by the one
    //    implementation that already does this for the trick editor.
    const adds = (input.adds ?? '').trim();
    if (!/^\d+$/.test(adds)) {
      fieldErrors.adds = 'ADD must be a whole number.';
    } else {
      const bracketCheck = checkAddMatchesScoringBrackets(adds, notation);
      if (bracketCheck && !bracketCheck.ok) {
        const noun = bracketCheck.bracketCount === 1 ? 'scoring bracket' : 'scoring brackets';
        fieldErrors.adds =
          `The authored notation shows ${bracketCheck.bracketCount} ${noun} but ADD is `
          + `${bracketCheck.add}; they must match.`;
      }
    }

    // 6. The base exists, because the family is derived from it.
    const baseTrick = (input.baseTrick ?? '').trim();
    if (!baseTrick) {
      fieldErrors.baseTrick = 'Name the base trick this is built on.';
    } else if (!freestyleTricks.getForCurationBySlug.get(baseTrick)) {
      fieldErrors.baseTrick = `"${baseTrick}" is not a trick in the dictionary.`;
    }

    const category = (input.category ?? '').trim();
    if (!category) {
      fieldErrors.category = 'Choose a category.';
    } else if (!allowedCategories().includes(category)) {
      fieldErrors.category = 'Choose a category the dictionary already uses.';
    }

    // 7. The family defaults to the base's own slug, never to the family the base
    //    sits in. Inheriting the base's family transitively would put a compound
    //    straight into its grandparent's family and silently make the override
    //    unnecessary in exactly the cases that need one: a base that is itself a
    //    compound of another family. The dictionary carries those as explicit
    //    corrections, and publication has to produce the same default the rest of
    //    the dictionary was built with, or a row published here would be
    //    classified by a different rule from its neighbours.
    //
    //    The first three branches are the dictionary's rule written whole. Only
    //    the last is reachable from this form, because publication refuses a row
    //    with no base and refuses a name whose slug is already taken, which is
    //    what a trick standing as its own base would need. They are kept so the
    //    two derivations can be read against each other rather than inferred.
    const derivedFamily = (() => {
      if (category === 'modifier') return '';
      if (!baseTrick) return slug;
      return baseTrick === slug ? slug : baseTrick;
    })();
    const familyOverride = (input.familyOverride ?? '').trim();
    if (familyOverride
        && (freestyleTricks.countFamilyMembers.get(familyOverride) as { n: number }).n === 0) {
      fieldErrors.familyOverride = `No trick carries the family "${familyOverride}".`;
    }
    const family = familyOverride || derivedFamily;

    // 8. Aliases: same rules the alias editor applies, checked before any write.
    const aliasTexts = (input.aliases ?? '').split('|').map((a) => a.trim()).filter(Boolean);
    const aliasRows: { slug: string; text: string }[] = [];
    for (const text of aliasTexts) {
      const aliasSlug = trickNameToSlug(text);
      if (!aliasSlug) {
        fieldErrors.aliases = `"${text}" does not produce a usable alias.`;
      } else if (aliasSlug === slug) {
        fieldErrors.aliases = `"${text}" is the trick's own name, not an alias of it.`;
      } else if (freestyleTricks.getForCurationBySlug.get(aliasSlug)) {
        fieldErrors.aliases = `"${aliasSlug}" is already a canonical trick slug.`;
      } else if (freestyleTrickAliases.getByAliasSlug.get(aliasSlug)) {
        fieldErrors.aliases = `"${aliasSlug}" is already an alias.`;
      } else if (aliasRows.some((a) => a.slug === aliasSlug)) {
        fieldErrors.aliases = `"${aliasSlug}" is listed twice.`;
      } else {
        aliasRows.push({ slug: aliasSlug, text });
      }
    }

    // 9. Source links must match what the notation claims to rest on.
    const sourceId = (input.sourceId ?? '').trim();
    const sourceUrl = (input.sourceUrl ?? '').trim();
    const assertedNotation = (input.sourceAssertedNotation ?? '').trim();
    if (sourceId && !freestyleTrickSources.getById.get(sourceId)) {
      fieldErrors.sourceId = 'Choose a registered source.';
    }
    if (NOTATION_BASES_NEEDING_SOURCE.has(basis) && !sourceId) {
      fieldErrors.sourceId =
        'The notation rests on a source, so the trick must link to the source it rests on.';
    }
    if (basis === 'source-notation' && sourceId && !assertedNotation) {
      fieldErrors.sourceAssertedNotation =
        'The notation was taken from a source that wrote one, so record what that source wrote.';
    }
    if (assertedNotation && !sourceId) {
      fieldErrors.sourceAssertedNotation = 'Name the source that stated this notation.';
    }

    // 10. Modifier links, when given, name real modifiers.
    const modifierSlugs = (input.modifierLinks ?? '').split('|').map((m) => m.trim()).filter(Boolean);
    for (const modifierSlug of modifierSlugs) {
      if (!freestyleTrickModifiers.getBySlug.get(modifierSlug)) {
        fieldErrors.modifierLinks = `"${modifierSlug}" is not a registered modifier.`;
      }
    }

    const description = emptyToNull(input.description);
    if (description && description.length > PROSE_MAX) {
      fieldErrors.description = `Description must be ${PROSE_MAX} characters or fewer.`;
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Some fields need attention.', { fieldErrors });
    }

    const sortOrder = ((freestyleTricks.maxSortOrder.get() as { max_sort: number }).max_sort) + 1;

    transaction(() => {
      freestyleTricks.insertPublished.run(
        slug, canonicalName, adds, baseTrick, family === '' ? null : family, category, description,
        notation,
        // The reader-facing citation line, written from the same claims the
        // structured columns carry, because a reader gets prose and an audit
        // gets fields.
        publicationCitationLine(draft),
        draft.notation_evidence_basis,
        draft.notation_derivation_method,
        draft.notation_convention_id,
        sortOrder,
      );
      for (const alias of aliasRows) {
        // Class and display follow the alias contract's default: a community
        // nickname is displayed, and a divergence needs a reason, which is the
        // alias editor's business and not this form's.
        // No source and no provenance note: these aliases are the curator's own,
        // given on the publication form alongside the trick, and the row records
        // that rather than implying evidence nobody cited. Editing one later can
        // attach a source without any of this changing who owns it.
        freestyleTrickAliases.insert.run(alias.slug, alias.text, slug, 'common', 1, null, null);
      }
      if (sourceId) {
        freestyleTrickSourceLinks.insertForPublication.run(
          slug, sourceId, sourceUrl === '' ? null : sourceUrl,
          assertedNotation === '' ? null : assertedNotation,
        );
      }
      modifierSlugs.forEach((modifierSlug, i) => {
        freestyleTrickModifierLinks.insert.run(slug, modifierSlug, i + 1);
      });

      const resolved = resolveAdjudicationOnPublication(slug, canonicalName, actorMemberId, candidateId);

      appendAuditEntry({
        actionType:    'freestyle.trick.published',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick',
        entityId:      slug,
        metadata:      {
          candidateId,
          submittedName: draft.submitted_name,
          canonicalName,
          adds,
          baseTrick,
          family,
          familyOverridden: familyOverride !== '',
          category,
          aliasSlugs: aliasRows.map((a) => a.slug),
          sourceId: sourceId === '' ? null : sourceId,
          modifierSlugs,
          notationEvidenceBasis:    draft.notation_evidence_basis,
          notationDerivationMethod: draft.notation_derivation_method,
          notationConventionId:     draft.notation_convention_id,
          resolvedAdjudication:     resolved,
        },
      });
    });

    return slug;
  },

  // Record that a ruling became a trick that already exists.
  //
  // Ten names were promoted through the committed-file pipeline before the funnel
  // existed. That route could not touch the ruling record, so each still reads as
  // an open decision while the trick it produced has been live for weeks. Nothing
  // is visibly wrong; the record is simply missing the link that says which trick
  // each name became.
  //
  // This writes only the ruling's side of that relationship. It creates no trick,
  // changes no trick, and moves no ownership: the ten belong to the committed
  // inputs and stay there, which is why this cannot go through the publication
  // path, and why routing it there would be wrong even if that path allowed it.
  // Publication creates something; this records something that already happened.
  //
  // The caller supplies both the ruling and the slug. Nothing is inferred from a
  // name here: a reconciliation that guessed which trick a ruling meant would be
  // making the decision it is supposed to be recording.
  //
  // Returns 'reconciled' when it wrote, or 'already' when the ruling already says
  // exactly this, which makes a second run a no-op rather than a second version
  // bump and a second audit row.
  reconcileHistoricalPublication(
    candidateId: string,
    slug: string,
    actorMemberId: string,
  ): 'reconciled' | 'already' {
    assertActorMayCurateFreestyle(actorMemberId);

    const ruling = freestyleEvAdjudications.getForAuthoring.get(candidateId) as
      AuthoringDbRow | undefined;
    if (!ruling) throw new NotFoundError(`No adjudication "${candidateId}"`);

    const trick = freestyleTricks.getForCurationBySlug.get(slug) as
      { slug: string; canonical_name: string } | undefined;
    if (!trick) {
      throw new ValidationError(
        `"${slug}" is not a trick in the dictionary, so there is nothing to record `
        + 'this ruling against.',
        { fieldErrors: { slug: 'No such trick.' } },
      );
    }

    // The ruling and the trick must be the same name. Comparing the ledger's own
    // key against the trick's canonical name folded the same way is what makes
    // this a record of an identity rather than an assertion of one.
    if (adjudicationNameKey(trick.canonical_name) !== ruling.normalized_name) {
      throw new ValidationError(
        `"${candidateId}" is the ruling for "${ruling.submitted_name}", which is not `
        + `the same name as "${trick.canonical_name}". Reconciliation records an `
        + 'identity that already holds; it does not decide one.',
        { fieldErrors: { slug: 'The ruling and the trick are different names.' } },
      );
    }

    if (ruling.published_trick_slug !== null && ruling.published_trick_slug !== slug) {
      throw new ValidationError(
        `The ruling for "${ruling.submitted_name}" is already recorded against `
        + `"${ruling.published_trick_slug}", so recording it against "${slug}" would `
        + 'make two records disagree about which trick this name is.',
        { fieldErrors: { slug: 'This ruling already names a different trick.' } },
      );
    }

    // Already exactly what this would write. Not an error and not a second write:
    // the point of the operation is the end state, and it is already there.
    if (ruling.published_trick_slug === slug
        && ruling.ev_state === 'canonical'
        && ruling.final_disposition === 'A'
        && ruling.match_type === 'promoted-canonical') {
      return 'already';
    }

    // A ruling that is not still open cannot become canonical by this route. Its
    // disposition has already been settled some other way, and overwriting that
    // is a decision rather than a reconciliation.
    if (ruling.final_disposition !== 'C') {
      throw new ValidationError(
        `The ruling for "${ruling.submitted_name}" reads disposition `
        + `"${ruling.final_disposition}", not the open "C" this repair expects, so it `
        + 'has already been resolved some other way.',
        { fieldErrors: { candidateId: 'This ruling is no longer open.' } },
      );
    }

    const before = {
      evState:         ruling.ev_state,
      finalDisposition: ruling.final_disposition,
      matchType:       ruling.match_type,
      publishedTrickSlug: ruling.published_trick_slug,
    };

    transaction(() => {
      // The same statement a publication uses, so a reconciled ruling reads
      // exactly like one resolved the ordinary way. It touches the ruling alone.
      freestyleEvAdjudications.resolveOnPublication.run(slug, slug, actorMemberId, candidateId);

      appendAuditEntry({
        actionType:    'freestyle.adjudication.reconciled',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_ev_adjudication',
        entityId:      candidateId,
        metadata:      {
          candidateId,
          submittedName: ruling.submitted_name,
          canonicalSlug: slug,
          // The trick was not created or changed here; it predates this record.
          trickPreexisting: true,
          before,
          after: {
            evState: 'canonical',
            finalDisposition: 'A',
            matchType: 'promoted-canonical',
            publishedTrickSlug: slug,
          },
        },
      });
    });

    return 'reconciled';
  },

  // The authored drafts: a movement written, no canonical trick yet. The backlog
  // drops a ruling the moment its notation is saved, so without this view the
  // work would be invisible the next morning.
  getNotationDraftsPage(): PageViewModel<FreestyleNotationDraftsContent> {
    const rows = freestyleEvAdjudications.listAuthoredDrafts.all() as AuthoringDbRow[];

    const shaped: FreestyleNotationDraftRow[] = rows.map((r) => ({
      candidateId:         r.candidate_id,
      submittedName:       r.submitted_name,
      notation:            r.authored_notation ?? '',
      scoringBracketCount: countScoringBrackets(r.authored_notation ?? ''),
      basisLabel:          notationBasisLabel(r.notation_evidence_basis ?? ''),
      methodLabel:         notationMethodLabel(r.notation_derivation_method ?? ''),
      conventionTitle:     r.notation_convention_id ? notationConventionTitle(r.notation_convention_id) : '',
      provenanceNote:      r.notation_provenance_note ?? '',
      authoredAt:          r.notation_authored_at ?? '',
      authoredBy:          r.notation_authored_by ?? '',
      blockerId:           r.blocker_id,
      owner:               r.owner,
      authorHref:          `/admin/freestyle/notation-backlog/${r.candidate_id}/author`,
      publishHref:         `/admin/freestyle/notation-backlog/${r.candidate_id}/publish`,
      // A draft whose ruling cannot be published still lists here and still
      // edits; the publication page states the refusal rather than the row
      // hiding a link with no explanation.
      publishable:         publicationRefusal(r) === null,
    }));

    return {
      seo:  { title: 'Authored Notation Drafts' },
      page: {
        sectionKey: 'admin',
        pageKey:    'admin_freestyle_notation_drafts',
        title:      'Authored Notation Drafts',
        intro:      'Movements written and not yet published as canonical tricks.',
      },
      content: {
        rows:        shaped,
        totalCount:  shaped.length,
        hasRows:     shaped.length > 0,
        backlogHref: '/admin/freestyle/notation-backlog',
      },
    };
  },

  // Edit page: the trick's editable scalar fields plus its attached aliases,
  // sources, and modifier links (the attached rows are read-only here). Returns
  // null when the slug has no row (the controller maps null to 404). `opts`
  // re-renders the form after a save (saved banner) or a validation failure
  // (the admin's submitted values plus per-field errors).
  getTrickEditPage(slug: string, opts: EditPageOptions = {}): PageViewModel<FreestyleTrickEditContent> | null {
    const row = freestyleTricks.getForCurationBySlug.get(slug) as CurationEditDbRow | undefined;
    if (!row) return null;

    // Each alias carries its own class selector and display state, so both fields
    // that decide whether it reaches a reader are editable here rather than only
    // settable when the alias is first added.
    const aliases: FreestyleTrickEditAlias[] = (freestyleTrickAliases.listForCuration.all(slug) as AliasDbRow[])
      .map((a) => ({
        slug: a.alias_slug,
        text: a.alias_text,
        type: a.alias_type,
        typeOptions: ALIAS_TYPES.map((t) => ({
          value: t,
          label: ALIAS_TYPE_LABELS[t] ?? t,
          selected: t === a.alias_type,
        })),
        isDisplayed: a.alias_display === 1,
        displayLabel: a.alias_display === 1 ? 'Shown beside the trick name' : 'Search only',
        divergesFromClass: a.alias_display !== displayDefaultForAliasType(a.alias_type),
        divergenceReason: (a.display_reason ?? '').trim(),
        provenanceNote: (a.provenance_note ?? '').trim(),
        // The source options carry the row's own selection, so the form round-trips
        // provenance instead of silently offering to clear it.
        sourceOptions: [
          { value: '', label: 'No source (curator assertion)', selected: !a.source_id },
          ...(freestyleTrickSources.listAll.all() as { id: string; source_label: string }[])
            .map((s) => ({ value: s.id, label: s.source_label, selected: s.id === a.source_id })),
        ],
        // Shown so a curator can see that editing this row will take it over.
        isCuratorOwned: a.alias_origin_producer === 'curator-application',
        ownerLabel: a.alias_origin_producer === 'curator-application'
          ? 'Maintained here'
          : 'From committed input; editing takes ownership',
        updateHref: `/admin/freestyle/tricks/${slug}/aliases/${encodeURIComponent(a.alias_slug)}`,
        deleteHref: `/admin/freestyle/tricks/${slug}/aliases/${encodeURIComponent(a.alias_slug)}/delete`,
      }));

    // On a failed add-alias re-render, keep the submitted text and type; otherwise
    // the form starts empty with the default type.
    const aliasFormText = opts.aliasSubmitted?.aliasText ?? '';
    const selectedAliasType = opts.aliasSubmitted?.aliasType ?? 'common';
    const aliasTypeOptions: FilterOption[] = ALIAS_TYPES.map((t) => ({
      value: t,
      label: ALIAS_TYPE_LABELS[t] ?? t,
      selected: t === selectedAliasType,
    }));
    // The registry's real sources, plus the ordinary case of none. "No source" is
    // a curator asserting the alias themselves, not a placeholder for provenance
    // somebody should supply later, and it says nothing about who owns the row.
    const aliasSourceOptions: FilterOption[] = [
      { value: '', label: 'No source (curator assertion)', selected: true },
      ...(freestyleTrickSources.listAll.all() as { id: string; source_label: string }[])
        .map((s) => ({ value: s.id, label: s.source_label, selected: false })),
    ];
    const aliasError = opts.aliasError ?? '';
    const sourceLinks = freestyleTrickSourceLinks.listForCuration.all(slug) as SourceLinkDbRow[];
    const sources: FreestyleTrickEditSource[] = sourceLinks.map((s) => ({
      sourceId:     s.source_id,
      label:        s.source_label,
      type:         s.source_type,
      url:          s.source_url,
      externalUrl:  s.external_url,
      assertedAdds: s.asserted_adds,
      detachHref:   `/admin/freestyle/tricks/${slug}/sources/${encodeURIComponent(s.source_id)}/delete`,
    }));

    // The attach-source select offers only registry sources not already linked to
    // this trick; the service still rejects a duplicate defensively.
    const linkedSourceIds = new Set(sourceLinks.map((s) => s.source_id));
    const sourceSelectedId = opts.sourceSubmitted?.sourceId ?? '';
    const sourceOptions: FilterOption[] = (freestyleTrickSources.listAll.all() as SourceRegistryRow[])
      .filter((r) => !linkedSourceIds.has(r.id))
      .map((r) => ({ value: r.id, label: r.source_label, selected: r.id === sourceSelectedId }));
    const sourceError = opts.sourceError ?? '';

    // The attach-modifier select offers every registry modifier: the same modifier
    // can legitimately recur on a trick at a different apply order, so it is not
    // filtered by what is already linked.
    const modifierSelectedSlug = opts.modifierSubmitted?.modifierSlug ?? '';
    const modifierOptions: FilterOption[] = (freestyleTrickModifiers.listAll.all() as ModifierRegistryRow[])
      .map((m) => ({
        value: m.slug,
        label: `${m.modifier_name} (${m.modifier_type})`,
        selected: m.slug === modifierSelectedSlug,
      }));
    const modifierError = opts.modifierError ?? '';
    const modifierLinks: FreestyleTrickEditModifierLink[] = (freestyleTrickModifiers.listLinksByTrickSlug.all(slug) as ModifierLinkDbRow[])
      .map((m) => ({
        slug: m.modifier_slug,
        name: m.modifier_name,
        type: m.modifier_type,
        addBonus: m.add_bonus,
        applyOrder: m.apply_order,
        detachHref: `/admin/freestyle/tricks/${slug}/modifiers/${encodeURIComponent(m.modifier_slug)}/${m.apply_order}/delete`,
      }));

    // On a validation re-render, show what the admin submitted; otherwise the DB.
    const sub = opts.submitted;
    const category     = sub ? (sub.category ?? '') : (row.category ?? '');
    const reviewStatus = sub ? (sub.reviewStatus ?? '') : row.review_status;
    const isActive     = sub ? sub.isActive === true : row.is_active === 1;

    const fields: FreestyleTrickEditFields = {
      canonicalName:     sub ? (sub.canonicalName ?? '') : row.canonical_name,
      adds:              sub ? (sub.adds ?? '') : (row.adds ?? ''),
      movementNotation:  sub ? (sub.movementNotation ?? '') : (row.notation ?? ''),
      executionNotation: sub ? (sub.executionNotation ?? '') : (row.operational_notation ?? ''),
      family:            sub ? (sub.family ?? '') : (row.trick_family ?? ''),
      baseTrick:         sub ? (sub.baseTrick ?? '') : (row.base_trick ?? ''),
      category,
      isActive,
      activeLabel:       isActive ? 'Active' : 'Inactive',
      sortOrder:         sub ? (sub.sortOrder ?? '') : String(row.sort_order),
      reviewStatus,
      reviewStatusLabel: REVIEW_STATUS_LABELS[reviewStatus] ?? reviewStatus,
      description:               sub ? (sub.description ?? '') : (row.description ?? ''),
      shortDescription:          sub ? (sub.shortDescription ?? '') : (row.short_description ?? ''),
      executionSummary:          sub ? (sub.executionSummary ?? '') : (row.execution_summary ?? ''),
      learningNotes:             sub ? (sub.learningNotes ?? '') : (row.learning_notes ?? ''),
      prerequisiteNotes:         sub ? (sub.prerequisiteNotes ?? '') : (row.prerequisite_notes ?? ''),
      pronunciation:             sub ? (sub.pronunciation ?? '') : (row.pronunciation ?? ''),
      operationalNotationSource: sub ? (sub.operationalNotationSource ?? '') : (row.operational_notation_source ?? ''),
    };

    const categoryOptions: FilterOption[] = [
      { value: '', label: '(None)', selected: category === '' },
      ...allowedCategories().map((c) => ({ value: c, label: c, selected: c === category })),
    ];
    const reviewStatusOptions: FilterOption[] = EDITABLE_REVIEW_STATUSES
      .map((v) => ({ value: v, label: REVIEW_STATUS_LABELS[v], selected: v === reviewStatus }));

    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);

    return {
      seo:  { title: 'Freestyle Content' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_edit', title: row.canonical_name },
      content: {
        slug: row.slug,
        fields,
        categoryOptions,
        reviewStatusOptions,
        aliases,
        sources,
        modifierLinks,
        hasAliases:       aliases.length > 0,
        hasSources:       sources.length > 0,
        hasModifierLinks: modifierLinks.length > 0,
        backHref:         '/admin/freestyle/tricks',
        saved:            opts.saved === true,
        fieldErrors,
        errorList,
        hasErrors:        errorList.length > 0,
        addAliasHref:     `/admin/freestyle/tricks/${row.slug}/aliases`,
        aliasTypeOptions,
        aliasSourceOptions,
        aliasFormText,
        aliasError,
        hasAliasError:    aliasError !== '',
        attachSourceHref: `/admin/freestyle/tricks/${row.slug}/sources`,
        sourceOptions,
        hasUnlinkedSources:     sourceOptions.length > 0,
        sourceFormExternalUrl:  opts.sourceSubmitted?.externalUrl ?? '',
        sourceFormAssertedAdds: opts.sourceSubmitted?.assertedAdds ?? '',
        sourceError,
        hasSourceError:   sourceError !== '',
        attachModifierHref: `/admin/freestyle/tricks/${row.slug}/modifiers`,
        modifierOptions,
        modifierFormApplyOrder: opts.modifierSubmitted?.applyOrder ?? '',
        modifierError,
        hasModifierError: modifierError !== '',
      },
    };
  },

  // Scalar-row update: validate the editable row fields (row-shape rules only,
  // not the doctrine QC), including the editorial prose fields so no
  // database-backed field freezes once the live database is the source of truth,
  // then update the trick and append one audit entry in a single transaction.
  // slug is the identity key and is not editable; attached aliases, sources, and
  // modifier links are untouched. Throws NotFoundError for an unknown slug and
  // ValidationError (with per-field messages) on bad input.
  //
  // A save that takes a trick out of the held-out pending state publishes it,
  // and publication also resolves the name's adjudication where one exists; see
  // resolveAdjudicationOnPublication below for what that means and why it
  // commits inside this method's transaction rather than after it.
  updateTrickScalars(slug: string, input: FreestyleTrickScalarInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const current = freestyleTricks.getForCurationBySlug.get(slug) as CurationEditDbRow | undefined;
    if (!current) throw new NotFoundError(`No freestyle trick "${slug}"`);

    const fieldErrors: Record<string, string> = {};

    const canonicalName = (input.canonicalName ?? '').trim();
    if (!canonicalName) {
      fieldErrors.canonicalName = 'Canonical name is required.';
    } else if (canonicalName.length > CANONICAL_NAME_MAX) {
      fieldErrors.canonicalName = `Canonical name must be ${CANONICAL_NAME_MAX} characters or fewer.`;
    }

    const addsRaw = (input.adds ?? '').trim();
    const adds = addsRaw === '' ? null : addsRaw;
    if (adds !== null && adds !== 'modifier' && !/^\d+$/.test(adds)) {
      fieldErrors.adds = 'ADD must be empty, a whole number, or "modifier".';
    }

    const categoryRaw = (input.category ?? '').trim();
    const category = categoryRaw === '' ? null : categoryRaw;
    if (category !== null && !allowedCategories().includes(category)) {
      fieldErrors.category = 'Category must be one of the existing category values.';
    }

    const reviewStatus = (input.reviewStatus ?? '').trim();
    if (!EDITABLE_REVIEW_STATUSES.includes(reviewStatus)) {
      fieldErrors.reviewStatus = 'Review status must be curated, expert reviewed, or pending.';
    }

    const isActive = input.isActive === true ? 1 : 0;

    // Browse sort position. The column is NOT NULL and its unset state is zero
    // (the load order the retiring content pipeline stamped), so a cleared field
    // means "unset" rather than "unknown" and stores zero. A negative or
    // non-integer value is rejected: ordering is a whole-number position, and
    // silently coercing one would move the row somewhere the curator did not ask.
    const sortOrderRaw = (input.sortOrder ?? '').trim();
    let sortOrder = 0;
    if (sortOrderRaw !== '') {
      if (!/^\d+$/.test(sortOrderRaw)) {
        fieldErrors.sortOrder = 'Sort position must be a whole number, zero or greater.';
      } else {
        sortOrder = Number(sortOrderRaw);
      }
    }

    const movementNotation  = emptyToNull(input.movementNotation);
    const executionNotation = emptyToNull(input.executionNotation);
    const family            = emptyToNull(input.family);
    const baseTrick         = emptyToNull(input.baseTrick);

    // Editorial prose fields are free text; the only row-shape rule is a length
    // cap that rejects an oversized payload. Empty clears the field to null.
    const description               = emptyToNull(input.description);
    const shortDescription          = emptyToNull(input.shortDescription);
    const executionSummary          = emptyToNull(input.executionSummary);
    const learningNotes             = emptyToNull(input.learningNotes);
    const prerequisiteNotes         = emptyToNull(input.prerequisiteNotes);
    const pronunciation             = emptyToNull(input.pronunciation);
    const operationalNotationSource = emptyToNull(input.operationalNotationSource);
    const proseFields: Array<[keyof FreestyleTrickScalarInput, string | null, string]> = [
      ['description', description, 'Description'],
      ['shortDescription', shortDescription, 'Short description'],
      ['executionSummary', executionSummary, 'Execution summary'],
      ['learningNotes', learningNotes, 'Learning notes'],
      ['prerequisiteNotes', prerequisiteNotes, 'Prerequisite notes'],
      ['pronunciation', pronunciation, 'Pronunciation'],
      ['operationalNotationSource', operationalNotationSource, 'Execution-notation source'],
    ];
    for (const [key, value, label] of proseFields) {
      if (value !== null && value.length > PROSE_MAX) {
        fieldErrors[key] = `${label} must be ${PROSE_MAX} characters or fewer.`;
      }
    }

    // Scoring-bracket parity: when the ADD is numeric and the execution notation
    // carries scoring brackets, their count must equal the ADD. Rows with no
    // scoring brackets (a blank field, or primitive markers like `[set] > toe`)
    // are not checked here.
    const bracketCheck = checkAddMatchesScoringBrackets(adds, executionNotation ?? '');
    if (bracketCheck && !bracketCheck.ok) {
      const noun = bracketCheck.bracketCount === 1 ? 'scoring bracket' : 'scoring brackets';
      fieldErrors.executionNotation =
        `Execution notation shows ${bracketCheck.bracketCount} ${noun} but ADD is ${bracketCheck.add}; they must match.`;
    }

    // The naming rule, applied only to a name the curator actually changed. A row
    // whose stored name predates the one-time normalization stays editable in its
    // other fields: refusing it would strand exactly the rows most in need of
    // correction behind a rule about a field the curator did not touch.
    // Only when the name is otherwise sound: an empty name has already failed on
    // a plainer ground, and replacing that message with one about folding back to
    // a slug would answer a question the curator did not ask.
    if (!fieldErrors.canonicalName && canonicalName !== current.canonical_name) {
      const naming = displayNameViolation(slug, canonicalName);
      if (naming) fieldErrors.canonicalName = naming;
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Some fields need attention.', { fieldErrors });
    }

    const changedFields: string[] = [];
    if (canonicalName !== current.canonical_name)               changedFields.push('canonical_name');
    if (adds !== (current.adds ?? null))                        changedFields.push('adds');
    if (movementNotation !== (current.notation ?? null))        changedFields.push('notation');
    if (executionNotation !== (current.operational_notation ?? null)) changedFields.push('operational_notation');
    if (family !== (current.trick_family ?? null))              changedFields.push('trick_family');
    if (baseTrick !== (current.base_trick ?? null))             changedFields.push('base_trick');
    if (category !== (current.category ?? null))                changedFields.push('category');
    if (isActive !== current.is_active)                         changedFields.push('is_active');
    if (sortOrder !== current.sort_order)                       changedFields.push('sort_order');
    if (reviewStatus !== current.review_status)                 changedFields.push('review_status');
    if (description !== (current.description ?? null))          changedFields.push('description');
    if (shortDescription !== (current.short_description ?? null)) changedFields.push('short_description');
    if (executionSummary !== (current.execution_summary ?? null)) changedFields.push('execution_summary');
    if (learningNotes !== (current.learning_notes ?? null))     changedFields.push('learning_notes');
    if (prerequisiteNotes !== (current.prerequisite_notes ?? null)) changedFields.push('prerequisite_notes');
    if (pronunciation !== (current.pronunciation ?? null))      changedFields.push('pronunciation');
    if (operationalNotationSource !== (current.operational_notation_source ?? null)) changedFields.push('operational_notation_source');

    // The stored notation parse is derived from the two notation fields and is
    // graded against the asserted ADD, so an edit to any of the three leaves it
    // describing a row that no longer exists. Nothing in the application can
    // re-derive it (the parse is produced by the content pipeline), so the honest
    // outcome is to drop it and let the public grammar panel fall silent until it
    // is derived again, rather than keep serving a parse of the previous notation.
    const parseInputsChanged = changedFields.some(
      (field) => field === 'notation' || field === 'operational_notation' || field === 'adds',
    );

    // The row leaving the held-out candidate set is publication, and the ruling
    // for the name resolves with it. Both writes and the audit entry commit
    // together: a published trick whose ruling still reads as an open candidate,
    // or a resolved ruling whose trick never went live, are each a record that
    // contradicts itself, and a second transaction is how that happens.
    const publishing = publicationCrossed(current, { isActive, reviewStatus });

    transaction(() => {
      freestyleTricks.updateScalars.run(
        canonicalName, adds, movementNotation, executionNotation,
        family, baseTrick, category, isActive, sortOrder, reviewStatus,
        description, shortDescription, executionSummary, learningNotes,
        prerequisiteNotes, pronunciation, operationalNotationSource, slug,
      );
      if (parseInputsChanged) {
        freestyleTricks.clearDerivedParse.run(slug);
      }
      const resolvedAdjudication = publishing
        ? resolveAdjudicationOnPublication(slug, canonicalName, actorMemberId)
        : null;
      appendAuditEntry({
        actionType:    'freestyle.trick.updated',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick',
        entityId:      slug,
        metadata:      {
          changedFields,
          derivedParseCleared: parseInputsChanged,
          published: publishing,
          // Present only when a ruling was resolved, so the trail says which
          // record moved rather than only that a publication happened.
          ...(resolvedAdjudication ? { resolvedAdjudication } : {}),
        },
      });
    });
  },

  // Add one alias to a trick. The alias slug is derived from the submitted display
  // text with the same normalization the pipeline uses, so it is always in the
  // lowercase-underscore form. Rejected (ValidationError, re-rendered inline) when
  // the text is empty or over-long, the type is not a recognized one, the derived
  // slug is empty, or the slug collides: an alias slug may not equal any canonical
  // trick slug (checked across every row regardless of status), nor an existing
  // alias slug (the global primary key). The insert and its audit entry commit in
  // one transaction. source_id and notes are left unset in this surface.
  addAlias(trickSlug: string, input: FreestyleAliasInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const trick = freestyleTricks.getForCurationBySlug.get(trickSlug) as CurationEditDbRow | undefined;
    if (!trick) throw new NotFoundError(`No freestyle trick "${trickSlug}"`);

    const aliasText = (input.aliasText ?? '').trim();
    if (!aliasText) {
      throw new ValidationError('Alias text is required.');
    }
    if (aliasText.length > ALIAS_TEXT_MAX) {
      throw new ValidationError(`Alias text must be ${ALIAS_TEXT_MAX} characters or fewer.`);
    }

    const aliasType = (input.aliasType ?? '').trim();
    if (!ALIAS_TYPES.includes(aliasType)) {
      throw new ValidationError('Choose an alias type.');
    }

    const aliasSlug = trickNameToSlug(aliasText);
    if (!aliasSlug) {
      throw new ValidationError('Alias text must contain at least one letter or number.');
    }

    // An alias may never equal a canonical trick slug, active or not.
    if (freestyleTricks.getForCurationBySlug.get(aliasSlug)) {
      throw new ValidationError(`"${aliasSlug}" is already a canonical trick slug, so it cannot be an alias.`);
    }

    // alias_slug is the global primary key: reject a duplicate distinctly from a
    // slug already owned by a different trick.
    const existing = freestyleTrickAliases.getByAliasSlug.get(aliasSlug) as FullAliasDbRow | undefined;
    if (existing) {
      if (existing.trick_slug === trickSlug) {
        throw new ValidationError(`"${aliasSlug}" is already an alias of this trick.`);
      }
      throw new ValidationError(`"${aliasSlug}" is already an alias of another trick ("${existing.trick_slug}").`);
    }

    const aliasDisplay = displayDefaultForAliasType(aliasType);

    // A new alias may cite a real source or none. None is not a gap to be filled
    // later: it is the ordinary case of a curator asserting an alias on their own
    // authority, and it says nothing about who owns the row, which is always the
    // curator here.
    const sourceId = (input.sourceId ?? '').trim() || null;
    if (sourceId !== null && !freestyleTrickSources.getById.get(sourceId)) {
      throw new ValidationError('Choose a source that exists, or none.');
    }
    const provenanceNote = (input.provenanceNote ?? '').trim() || null;
    if ((provenanceNote ?? '').length > ALIAS_PROVENANCE_NOTE_MAX) {
      throw new ValidationError(
        `The provenance note must be ${ALIAS_PROVENANCE_NOTE_MAX} characters or fewer.`);
    }

    try {
      transaction(() => {
        freestyleTrickAliases.insert.run(
          aliasSlug, aliasText, trickSlug, aliasType, aliasDisplay,
          sourceId, provenanceNote);
        appendAuditEntry({
          actionType:    'freestyle.trick_alias.created',
          category:      'content',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_trick_alias',
          entityId:      aliasSlug,
          metadata:      { trickSlug, aliasSlug, aliasText, aliasType, aliasDisplay },
        });
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ValidationError(`"${aliasSlug}" is already an alias.`);
      }
      throw err;
    }
  },

  // Set an existing alias's semantic class and its public-display state. Both
  // fields decide whether the alias reaches a reader, so both are editable here:
  // the class is the judgement (nickname, superseded name, abbreviation,
  // decomposition, positional marker, misspelling) and the display state follows
  // it, a curator setting the two against each other only where a trick's page
  // genuinely needs the exception. Rejected (ValidationError) when the class is not
  // a stored one. Unknown or wrong-trick alias is a NotFoundError (mapped to 404).
  // The update and its audit entry, carrying both the previous and the new values,
  // commit in one transaction.
  updateAlias(
    trickSlug: string,
    aliasSlug: string,
    input: FreestyleAliasClassInput,
    actorMemberId: string,
  ): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const existing = freestyleTrickAliases.getByAliasSlug.get(aliasSlug) as FullAliasDbRow | undefined;
    if (!existing || existing.trick_slug !== trickSlug) {
      throw new NotFoundError(`No alias "${aliasSlug}" on trick "${trickSlug}"`);
    }

    const aliasType = (input.aliasType ?? '').trim();
    if (!ALIAS_TYPES.includes(aliasType)) {
      throw new ValidationError('Choose an alias type.');
    }
    // An unchecked checkbox submits nothing, so absence is the hidden state.
    const aliasDisplay = input.aliasDisplay === 'on' || input.aliasDisplay === '1' ? 1 : 0;

    // A publication state that follows the class needs no defending. One set
    // against it is a judgement the class cannot record, and an unexplained one
    // is indistinguishable later from a mistake: the curated overrides all carry
    // a reason by convention, and this is where that convention becomes a rule,
    // because after cutover this surface is the only writer.
    const diverges = aliasDisplay !== displayDefaultForAliasType(aliasType);
    const submittedReason = (input.divergenceReason ?? '').trim();
    // An existing reason still standing is the row's own explanation, so leaving
    // the field untouched on an unrelated edit is not an unexplained exception.
    const reason = submittedReason || (diverges ? (existing.display_reason ?? '').trim() : '');
    if (diverges && reason.length < ALIAS_REASON_MIN) {
      throw new ValidationError(
        aliasDisplay === 1
          ? 'Publishing an alias whose class would keep it hidden needs a reason saying why this trick needs it beside the name.'
          : 'Holding back an alias whose class would publish it needs a reason saying why a reader should not see it.',
      );
    }
    if (reason.length > ALIAS_REASON_MAX) {
      throw new ValidationError(`The reason must be ${ALIAS_REASON_MAX} characters or fewer.`);
    }
    // Agreeing with the class clears any reason a previous exception left, so a
    // stale explanation cannot outlive the exception it explained. It reaches the
    // reason only: provenance is a different fact, and clearing it here is what
    // used to erase where an alias came from every time somebody adjusted its
    // class.
    const displayReason = diverges ? reason : null;

    // Provenance changes only when the curator edits it. A field the form did not
    // submit is absent rather than empty, and absent means "leave it as it was";
    // the empty string is a deliberate choice, and on the source it means the
    // curator is asserting the alias on nobody else's authority.
    const sourceId = input.sourceId === undefined
      ? existing.source_id
      : (input.sourceId.trim() || null);
    if (sourceId !== null && !freestyleTrickSources.getById.get(sourceId)) {
      throw new ValidationError('Choose a source that exists, or none.');
    }
    const provenanceNote = input.provenanceNote === undefined
      ? existing.provenance_note
      : (input.provenanceNote.trim() || null);
    if ((provenanceNote ?? '').length > ALIAS_PROVENANCE_NOTE_MAX) {
      throw new ValidationError(
        `The provenance note must be ${ALIAS_PROVENANCE_NOTE_MAX} characters or fewer.`);
    }

    transaction(() => {
      freestyleTrickAliases.updateClassForTrick.run(
        aliasType, aliasDisplay, displayReason, sourceId, provenanceNote,
        aliasSlug, trickSlug);
      appendAuditEntry({
        actionType:    'freestyle.trick_alias.updated',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_alias',
        entityId:      aliasSlug,
        metadata:      {
          trickSlug,
          aliasSlug,
          aliasText:          existing.alias_text,
          aliasType,
          aliasDisplay,
          previousAliasType:    existing.alias_type,
          previousAliasDisplay: existing.alias_display,
          // Recorded on the entry as well as the row: the row keeps only the
          // standing reason, while the log keeps the one given at the time.
          divergesFromClass:    diverges,
          divergenceReason:     displayReason,
          // Provenance and ownership travel on the entry too, because this edit
          // is what moves the row out of committed authority and the trail should
          // say so rather than leaving it to be inferred from a later refresh.
          sourceId,
          provenanceNote,
          previousSourceId:       existing.source_id,
          previousProvenanceNote: existing.provenance_note,
          previousOwner:          existing.alias_origin_producer,
          owner:                  'curator-application',
        },
      });
    });
  },

  // Remove one alias from a trick. Scoped to the trick both in the ownership check
  // and in the delete statement, so an edit page cannot remove another trick's
  // alias. The delete and its audit entry (carrying the removed text and type, so
  // the change is recoverable) commit in one transaction. Unknown or wrong-trick
  // alias is a NotFoundError (mapped to 404).
  removeAlias(trickSlug: string, aliasSlug: string, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const existing = freestyleTrickAliases.getByAliasSlug.get(aliasSlug) as FullAliasDbRow | undefined;
    if (!existing || existing.trick_slug !== trickSlug) {
      throw new NotFoundError(`No alias "${aliasSlug}" on trick "${trickSlug}"`);
    }

    transaction(() => {
      freestyleTrickAliases.deleteForTrick.run(aliasSlug, trickSlug);
      appendAuditEntry({
        actionType:    'freestyle.trick_alias.deleted',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_alias',
        entityId:      aliasSlug,
        metadata:      {
          trickSlug,
          aliasSlug,
          aliasText: existing.alias_text,
          aliasType: existing.alias_type,
        },
      });
    });
  },

  // Attach one existing registry source to a trick. Rejected (ValidationError,
  // re-rendered inline) when no source is chosen, the id is not a registry source,
  // the trick is already linked to it (the composite primary key), or the asserted
  // ADD is neither empty nor a whole number. external_url is trimmed to NULL when
  // blank; external_ref, asserted_notation, asserted_category, and notes stay unset
  // in this surface. The insert and its audit entry commit in one transaction.
  // Creating new registry sources is not part of this surface.
  attachSource(trickSlug: string, input: FreestyleSourceLinkInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const trick = freestyleTricks.getForCurationBySlug.get(trickSlug) as CurationEditDbRow | undefined;
    if (!trick) throw new NotFoundError(`No freestyle trick "${trickSlug}"`);

    const sourceId = (input.sourceId ?? '').trim();
    const source = (freestyleTrickSources.listAll.all() as SourceRegistryRow[]).find((r) => r.id === sourceId);
    if (!source) {
      throw new ValidationError('Choose a source from the list.');
    }

    if (freestyleTrickSourceLinks.getLink.get(trickSlug, sourceId)) {
      throw new ValidationError(`This trick is already linked to "${source.source_label}".`);
    }

    const externalUrl = emptyToNull(input.externalUrl);
    const assertedRaw = (input.assertedAdds ?? '').trim();
    if (assertedRaw !== '' && !/^\d+$/.test(assertedRaw)) {
      throw new ValidationError('Asserted ADD must be empty or a whole number.');
    }
    const assertedAdds = assertedRaw === '' ? null : parseInt(assertedRaw, 10);

    try {
      transaction(() => {
        freestyleTrickSourceLinks.insert.run(trickSlug, sourceId, externalUrl, assertedAdds);
        appendAuditEntry({
          actionType:    'freestyle.trick_source_link.created',
          category:      'content',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_trick_source_link',
          entityId:      `${trickSlug}:${sourceId}`,
          metadata:      { trickSlug, sourceId, externalUrl, assertedAdds },
        });
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ValidationError(`This trick is already linked to "${source.source_label}".`);
      }
      throw err;
    }
  },

  // Detach one source link from a trick. getLink is keyed on both the trick and
  // the source, so an unknown or wrong-trick link is a NotFoundError (mapped to
  // 404) and an edit page can never detach another trick's link. The delete and
  // its audit entry (carrying the removed link's fields for recovery) commit in
  // one transaction.
  detachSource(trickSlug: string, sourceId: string, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const link = freestyleTrickSourceLinks.getLink.get(trickSlug, sourceId) as SourceLinkKeyDbRow | undefined;
    if (!link) {
      throw new NotFoundError(`No source link "${sourceId}" on trick "${trickSlug}"`);
    }

    transaction(() => {
      freestyleTrickSourceLinks.deleteForTrick.run(trickSlug, sourceId);
      appendAuditEntry({
        actionType:    'freestyle.trick_source_link.deleted',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_source_link',
        entityId:      `${trickSlug}:${sourceId}`,
        metadata:      {
          trickSlug,
          sourceId,
          externalUrl:  link.external_url,
          assertedAdds: link.asserted_adds,
        },
      });
    });
  },

  // Attach one registry modifier to a trick at an apply order. The apply order
  // defaults to 1 when blank (the schema default), and the resolved integer is
  // what is stored and audited. Rejected (ValidationError, re-rendered inline)
  // when no modifier is chosen, the slug is not a registry modifier, the apply
  // order is not a whole number of 1 or more, or the exact triple (trick,
  // modifier, apply order) is already linked. The same modifier at a different
  // apply order is allowed. The insert and its audit entry commit in one
  // transaction. The modifier registry itself is not edited here.
  attachModifier(trickSlug: string, input: FreestyleModifierLinkInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const trick = freestyleTricks.getForCurationBySlug.get(trickSlug) as CurationEditDbRow | undefined;
    if (!trick) throw new NotFoundError(`No freestyle trick "${trickSlug}"`);

    const modifierSlug = (input.modifierSlug ?? '').trim();
    const modifier = freestyleTrickModifiers.getBySlug.get(modifierSlug) as ModifierRegistryRow | undefined;
    if (!modifier) {
      throw new ValidationError('Choose a modifier from the list.');
    }

    const orderRaw = (input.applyOrder ?? '').trim();
    let applyOrder: number;
    if (orderRaw === '') {
      applyOrder = 1;
    } else if (/^\d+$/.test(orderRaw) && parseInt(orderRaw, 10) >= 1) {
      applyOrder = parseInt(orderRaw, 10);
    } else {
      throw new ValidationError('Apply order must be a whole number of 1 or more.');
    }

    if (freestyleTrickModifierLinks.getLink.get(trickSlug, modifierSlug, applyOrder)) {
      throw new ValidationError(`"${modifier.modifier_name}" is already linked at apply order ${applyOrder}.`);
    }

    try {
      transaction(() => {
        freestyleTrickModifierLinks.insert.run(trickSlug, modifierSlug, applyOrder);
        appendAuditEntry({
          actionType:    'freestyle.trick_modifier_link.created',
          category:      'content',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_trick_modifier_link',
          entityId:      `${trickSlug}:${modifierSlug}:${applyOrder}`,
          metadata:      { trickSlug, modifierSlug, applyOrder, modifierName: modifier.modifier_name },
        });
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ValidationError(`"${modifier.modifier_name}" is already linked at apply order ${applyOrder}.`);
      }
      throw err;
    }
  },

  // Detach one modifier link from a trick. Keyed on the full triple (trick,
  // modifier, apply order), so an unknown or wrong-trick link is a NotFoundError
  // (mapped to 404) and an edit page can never detach a different link. The delete
  // and its audit entry commit in one transaction.
  detachModifier(trickSlug: string, modifierSlug: string, applyOrder: number, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const link = freestyleTrickModifierLinks.getLink.get(trickSlug, modifierSlug, applyOrder) as ModifierLinkKeyDbRow | undefined;
    if (!link) {
      throw new NotFoundError(`No modifier link "${modifierSlug}" at apply order ${applyOrder} on trick "${trickSlug}"`);
    }

    transaction(() => {
      freestyleTrickModifierLinks.deleteForTrick.run(trickSlug, modifierSlug, applyOrder);
      appendAuditEntry({
        actionType:    'freestyle.trick_modifier_link.deleted',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_modifier_link',
        entityId:      `${trickSlug}:${modifierSlug}:${applyOrder}`,
        metadata:      { trickSlug, modifierSlug, applyOrder },
      });
    });
  },

  // Moderation index for the imported community tips: every tip regardless of
  // status (published, hidden, or unresolved), so a curator can find, edit, hide,
  // restore, and remap them once the database is the source of truth. Optional
  // free-text search matches the advice text or the (canonical or
  // unresolved:<name>) slug; the status and trick filters narrow further, so a
  // moderator can pull every tip on one trick, or every tip still sitting in an
  // unresolved bucket. The trick filter matches the stored slug exactly, because
  // its purpose is "this trick's tips" rather than another substring search; an
  // unrecognised status is treated as no filter, so a hand-edited query string
  // cannot silently empty the index. Read-only; no persona guard on the read.
  getTipModerationPage(
    filter: { query?: string; status?: string; trickSlug?: string; error?: string } = {},
  ): PageViewModel<FreestyleTipModerationContent> {
    const query = (filter.query ?? '').trim();
    const statusFilter = TIP_STATUS_VALUES.includes(filter.status ?? '') ? (filter.status as string) : '';
    const trickSlug = (filter.trickSlug ?? '').trim();

    // The slug side of the search treats every separator as a space, so the
    // needle has to arrive the same way: a curator typing the natural spaced
    // name, the underscored slug form, or the stored hyphenated one all reach
    // the same placeholder row.
    const slugNeedle = query.replace(/[-_:]+/g, ' ');
    const dbRows = query
      ? (freestyleTrickTips.searchForModeration.all(`%${query}%`, `%${slugNeedle}%`) as TipModerationDbRow[])
      : (freestyleTrickTips.listForModeration.all() as TipModerationDbRow[]);
    const rows = dbRows
      .filter((r) => {
        if (statusFilter && r.status !== statusFilter) return false;
        if (trickSlug && r.trick_slug !== trickSlug) return false;
        return true;
      })
      .map(shapeTipModerationRow);

    const statusOptions: FilterOption[] = [
      { value: '', label: 'Any Status', selected: statusFilter === '' },
      ...TIP_STATUS_VALUES.map((v) => ({ value: v, label: TIP_STATUS_LABELS[v], selected: v === statusFilter })),
    ];

    return {
      seo:  { title: 'Freestyle Tips' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_tips', title: 'Freestyle Tips' },
      content: {
        rows,
        totalCount: rows.length,
        query,
        statusOptions,
        statusFilter,
        trickSlug,
        isFiltered: query !== '' || statusFilter !== '' || trickSlug !== '',
        hasRows: rows.length > 0,
        error: filter.error,
      },
    };
  },

  // Edit one tip's advice text. Rejects empty or over-long text. The update and
  // its audit entry commit in one transaction; the tip's status and trick mapping
  // are untouched here.
  editTipText(tipId: number, tipTextInput: string, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const tip = freestyleTrickTips.getByIdForModeration.get(tipId) as TipModerationDbRow | undefined;
    if (!tip) throw new NotFoundError(`No freestyle tip #${tipId}`);

    const tipText = (tipTextInput ?? '').trim();
    if (!tipText) {
      throw new ValidationError('Tip text is required.');
    }
    if (tipText.length > TIP_TEXT_MAX) {
      throw new ValidationError(`Tip text must be ${TIP_TEXT_MAX} characters or fewer.`);
    }

    transaction(() => {
      freestyleTrickTips.updateText.run(tipText, tipId);
      appendAuditEntry({
        actionType:    'freestyle.trick_tip.edited',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_tip',
        entityId:      String(tipId),
        metadata:      { tipId, trickSlug: tip.trick_slug },
      });
    });
  },

  // Set one tip's display order, the sequence its trick page renders tips in. The
  // column is NOT NULL and its unset state is zero, so a cleared field means
  // "unset" and stores zero; a negative or non-integer value is rejected rather
  // than coerced, because coercing it would move the tip somewhere the moderator
  // did not ask for. Two tips may share an order, which the id tiebreak in the
  // read statements already resolves, so a duplicate is not an error. The update
  // and its audit entry commit in one transaction; text, status and mapping are
  // untouched.
  setTipDisplayOrder(tipId: number, displayOrderInput: string, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const tip = freestyleTrickTips.getByIdForModeration.get(tipId) as TipModerationDbRow | undefined;
    if (!tip) throw new NotFoundError(`No freestyle tip #${tipId}`);

    const raw = (displayOrderInput ?? '').trim();
    if (raw !== '' && !/^\d+$/.test(raw)) {
      throw new ValidationError('Display order must be a whole number, zero or greater.');
    }
    const displayOrder = raw === '' ? 0 : Number(raw);

    transaction(() => {
      freestyleTrickTips.updateDisplayOrder.run(displayOrder, tipId);
      appendAuditEntry({
        actionType:    'freestyle.trick_tip.reordered',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_tip',
        entityId:      String(tipId),
        metadata:      { tipId, trickSlug: tip.trick_slug, fromDisplayOrder: tip.display_order, toDisplayOrder: displayOrder },
      });
    });
  },

  // Hide a tip from the public trick page without deleting it. Only a published
  // tip is publicly visible, so only a published tip can be hidden; an unresolved
  // tip is already non-public and is resolved by remapping, not hiding. The row
  // and text remain; only status changes to hidden.
  hideTip(tipId: number, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const tip = freestyleTrickTips.getByIdForModeration.get(tipId) as TipModerationDbRow | undefined;
    if (!tip) throw new NotFoundError(`No freestyle tip #${tipId}`);
    if (tip.status !== 'published') {
      throw new ValidationError('Only a published tip can be hidden.');
    }

    transaction(() => {
      freestyleTrickTips.updateStatus.run('hidden', tipId);
      appendAuditEntry({
        actionType:    'freestyle.trick_tip.hidden',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_tip',
        entityId:      String(tipId),
        metadata:      { tipId, trickSlug: tip.trick_slug, fromStatus: tip.status },
      });
    });
  },

  // Restore a hidden tip to the public page. Restore is the inverse of hide, which
  // only ever hides a published tip, so restore only ever produces published. It
  // guards that the tip still points at an active canonical trick, so a tip whose
  // trick has since been retired or was never resolved is not restored to a page
  // that would not render it; that tip must be remapped to an active trick instead.
  // Restore never writes an unresolved status, so an unresolved bucket is preserved.
  restoreTip(tipId: number, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const tip = freestyleTrickTips.getByIdForModeration.get(tipId) as TipModerationDbRow | undefined;
    if (!tip) throw new NotFoundError(`No freestyle tip #${tipId}`);
    if (tip.status !== 'hidden') {
      throw new ValidationError('Only a hidden tip can be restored.');
    }

    const target = freestyleTricks.getForCurationBySlug.get(tip.trick_slug) as CurationEditDbRow | undefined;
    if (!target || target.is_active !== 1) {
      throw new ValidationError('This tip is not mapped to an active trick, so it cannot be restored to the public page. Remap it to an active trick instead.');
    }

    transaction(() => {
      freestyleTrickTips.updateStatus.run('published', tipId);
      appendAuditEntry({
        actionType:    'freestyle.trick_tip.restored',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_tip',
        entityId:      String(tipId),
        metadata:      { tipId, trickSlug: tip.trick_slug, toStatus: 'published' },
      });
    });
  },

  // Remap a tip to an active canonical trick. The target must be an active
  // canonical trick slug: a missing slug is a NotFoundError, and an inactive or
  // non-canonical target (including an alias slug, which has no canonical row) is
  // rejected so the tip never lands on a page that will not render it. The row's
  // trick_slug is overwritten and its status becomes published; the original slug
  // (an unresolved:<name> or a prior mapping) is preserved as provenance in the
  // audit entry, which is the immutable record of what the tip used to point at.
  remapTip(tipId: number, targetSlugInput: string, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const tip = freestyleTrickTips.getByIdForModeration.get(tipId) as TipModerationDbRow | undefined;
    if (!tip) throw new NotFoundError(`No freestyle tip #${tipId}`);

    const targetSlug = (targetSlugInput ?? '').trim();
    if (!targetSlug) {
      throw new ValidationError('Choose a trick to remap this tip to.');
    }

    const target = freestyleTricks.getForCurationBySlug.get(targetSlug) as CurationEditDbRow | undefined;
    if (!target) {
      throw new ValidationError(`"${targetSlug}" is not a canonical trick slug.`);
    }
    if (target.is_active !== 1) {
      throw new ValidationError(`"${targetSlug}" is not an active trick, so a tip cannot be remapped to it.`);
    }
    if (targetSlug === tip.trick_slug) {
      throw new ValidationError('This tip is already mapped to that trick.');
    }

    const fromSlug = tip.trick_slug;
    transaction(() => {
      freestyleTrickTips.remap.run(targetSlug, tipId);
      appendAuditEntry({
        actionType:    'freestyle.trick_tip.remapped',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_tip',
        entityId:      String(tipId),
        metadata:      { tipId, fromSlug, fromStatus: tip.status, toSlug: targetSlug },
      });
    });
  },

  // The dictionary provenance-source registry: the existing registry rows plus the
  // create form. This is the trick-dictionary provenance registry (who or what
  // asserted a trick's existence, ADD, or notation), distinct from the separate
  // media-source registry. Read-only; no persona guard on the read. `opts` re-renders
  // the create form after a validation failure with the submitted values and error.
  getSourceRegistryPage(opts: { submitted?: FreestyleSourceInput; error?: string } = {}): PageViewModel<FreestyleSourceRegistryContent> {
    const dbRows = freestyleTrickSources.listForCuration.all() as SourceCurationDbRow[];
    const rows: FreestyleSourceRegistryRow[] = dbRows.map((r) => ({
      id:          r.id,
      sourceType:  r.source_type,
      sourceLabel: r.source_label,
      sourceUrl:   r.source_url ?? '',
      retrievedAt: r.retrieved_at,
      notes:       r.notes ?? '',
    }));
    const submitted = opts.submitted ?? {};
    const typeOptions: FilterOption[] = SOURCE_TYPES.map((t) => ({
      value: t, label: t, selected: submitted.sourceType === t,
    }));

    return {
      seo:  { title: 'Freestyle Sources' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_sources', title: 'Dictionary Provenance Source Creation' },
      content: {
        rows,
        totalCount: rows.length,
        hasRows: rows.length > 0,
        typeOptions,
        submitted,
        retrievedAtValue: (submitted.retrievedAt ?? '').trim() || new Date().toISOString(),
        error: opts.error,
      },
    };
  },

  // Create one dictionary provenance-source row. The curator supplies the id, which
  // becomes the permanent primary key the trick-to-source links reference, so it is
  // shape-validated and must be unique; a duplicate is rejected distinctly. The
  // source type must be one of the documented values, the label is required, and the
  // retrieval timestamp is required in the ISO-8601 UTC form the existing rows use
  // (never silently defaulted, since it is provenance that may describe an earlier
  // retrieval). URL and notes are optional. The insert and its audit entry commit in
  // one transaction behind the persona guard; no other row is created or edited.
  createSource(input: FreestyleSourceInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);

    const id = (input.id ?? '').trim();
    if (!id) {
      throw new ValidationError('Source ID is required.');
    }
    if (id.length > SOURCE_ID_MAX) {
      throw new ValidationError(`Source ID must be ${SOURCE_ID_MAX} characters or fewer.`);
    }
    if (!SOURCE_ID_PATTERN.test(id)) {
      throw new ValidationError('Source ID may use only lowercase letters, digits, hyphens, and underscores, and must begin and end with a letter or digit.');
    }
    if (freestyleTrickSources.getById.get(id)) {
      throw new ValidationError(`Source ID "${id}" already exists. A source ID is a permanent identifier and must be unique.`);
    }

    const sourceType = (input.sourceType ?? '').trim();
    if (!SOURCE_TYPES.includes(sourceType)) {
      throw new ValidationError('Choose a source type from the list.');
    }

    const sourceLabel = (input.sourceLabel ?? '').trim();
    if (!sourceLabel) {
      throw new ValidationError('Source label is required.');
    }
    if (sourceLabel.length > SOURCE_LABEL_MAX) {
      throw new ValidationError(`Source label must be ${SOURCE_LABEL_MAX} characters or fewer.`);
    }

    const retrievedAt = (input.retrievedAt ?? '').trim();
    if (!retrievedAt) {
      throw new ValidationError('A retrieval timestamp is required.');
    }
    if (!SOURCE_RETRIEVED_AT_PATTERN.test(retrievedAt) || Number.isNaN(Date.parse(retrievedAt))) {
      throw new ValidationError('The retrieval timestamp must be an ISO-8601 UTC value such as 2026-04-20T00:00:00.000Z.');
    }

    const sourceUrl = (input.sourceUrl ?? '').trim();
    if (sourceUrl.length > SOURCE_URL_MAX) {
      throw new ValidationError(`Source URL must be ${SOURCE_URL_MAX} characters or fewer.`);
    }
    const notes = (input.notes ?? '').trim();
    if (notes.length > SOURCE_NOTES_MAX) {
      throw new ValidationError(`Notes must be ${SOURCE_NOTES_MAX} characters or fewer.`);
    }

    try {
      transaction(() => {
        freestyleTrickSources.insert.run(id, sourceType, sourceLabel, sourceUrl || null, retrievedAt, notes || null);
        appendAuditEntry({
          actionType:    'freestyle.trick_source.created',
          category:      'content',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_trick_source',
          entityId:      id,
          metadata:      { id, sourceType, sourceLabel },
        });
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ValidationError(`Source ID "${id}" already exists.`);
      }
      throw err;
    }
  },
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}
