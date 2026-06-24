/**
 * freestyleMediaTaxonomy.ts
 * =========================
 *
 * Single source of truth for curated freestyle MEDIA tagging + linkage
 * conventions. Declarative data only: no DB access, no service wiring, no
 * behavior. No consumers are wired yet; this module defines the vocabulary
 * that media-tag validation, coverage metrics, and media-strip surfaces will
 * read once they adopt it.
 *
 * Firewall (the reason this layer is separate from the trick dictionary):
 * a media tag or edge is a PEDAGOGICAL fact about a video ("this clip helps
 * you learn X" / "X is shown here"), never a STRUCTURAL claim about a trick
 * (equivalence, ADD, decomposition, family membership). Media metadata must
 * never mutate canonical trick data, and every linkage is media -> entity,
 * never entity -> entity: there are no trick-to-trick edges in this layer.
 *
 * Tag shape (mirrors the live media-tag invariant): utility tags are exact
 * lowercase words ('curated', 'freestyle'); a linkage tag is a lowercase
 * snake_case prefix over an existing entity slug ('family_whirl', 'set_pixie');
 * a bare kebab-case tag is a trick slug ('double-leg-over'). 'set_', 'operator_',
 * and 'family_' are accepted prefixes (the media-tag invariant recognizes them);
 * the remaining linkage prefixes declared here are the spec a future
 * validator/service change adopts (each carries `validatorRecognized`).
 */

/* ── Utility tags ──────────────────────────────────────────────────────────
 * Exact lowercase markers, not entity links. Every curated trick-media item
 * also carries its own `#<trick-slug>` plus the required utility markers. */

/** Exact-match utility tags the media layer recognizes (not entity links). */
export const UTILITY_EXACT_TAGS = [
  'freestyle',
  'trick',
  'curated',
  'tricks_of_the_trade',
  'passback_records',
] as const;

/** Utility markers every curated trick-media item carries (besides `#<slug>`). */
export const REQUIRED_SIDECAR_UTILITY_TAGS = ['freestyle', 'trick'] as const;

/* ── Media kinds ───────────────────────────────────────────────────────────
 * What a clip IS. Orthogonal to source trust tier (which answers how much we
 * trust the teaching intent of the source). Tag form: `kind_{key}`. */

export type MediaTeachingIntent =
  | 'instructional'
  | 'demonstration'
  | 'analysis'
  | 'archival';

export interface MediaKind {
  /** Stable key; tag form is `kind_{key}`. */
  key: string;
  label: string;
  /** Whether the clip teaches technique, just shows it, aids analysis, or archives. */
  teachingIntent: MediaTeachingIntent;
  /** One line on what this kind of clip is. */
  description: string;
}

export const MEDIA_KINDS: readonly MediaKind[] = [
  { key: 'tutorial',    label: 'Tutorial',            teachingIntent: 'instructional', description: 'Technique breakdown of how to do the trick.' },
  { key: 'demo',        label: 'Demo',                teachingIntent: 'demonstration', description: 'What the trick looks like done well; no teaching framing.' },
  { key: 'progression', label: 'Progression',         teachingIntent: 'instructional', description: 'An ordered ladder of steps toward a trick.' },
  { key: 'drill',       label: 'Drill',               teachingIntent: 'instructional', description: 'Repetition-focused practice of one element.' },
  { key: 'combo',       label: 'Combo',               teachingIntent: 'demonstration', description: 'A sequence showcase, not isolated teaching.' },
  { key: 'slowmo',      label: 'Slow motion',         teachingIntent: 'analysis',      description: 'Slowed footage used as an analysis aid.' },
  { key: 'routine',     label: 'Routine',             teachingIntent: 'demonstration', description: 'A full performance run.' },
  { key: 'historical',  label: 'Historical',          teachingIntent: 'archival',      description: 'Archival footage of historical interest.' },
  { key: 'series',      label: 'Instructional series', teachingIntent: 'instructional', description: 'One lesson within a grouped curriculum.' },
] as const;

/* ── Linkage namespaces ────────────────────────────────────────────────────
 * Prefixed tags that point a media item at an EXISTING entity slug. The slug
 * after the prefix must already be canonical; a linkage tag never creates an
 * entity or a membership. */

export interface LinkageNamespace {
  /** Tag prefix; a linkage tag is `{prefix}{entity-slug}`, e.g. 'family_whirl'. */
  prefix: string;
  /** The entity kind the slug after the prefix must reference. */
  entity: string;
  description: string;
  /** True once the live media-tag validator recognizes this prefix. */
  validatorRecognized: boolean;
}

export const LINKAGE_NAMESPACES: readonly LinkageNamespace[] = [
  { prefix: 'family_',      entity: 'public family slug',       description: 'Media representative of, or touring, a trick family.',     validatorRecognized: true  },
  { prefix: 'operator_',    entity: 'operator / modifier slug', description: 'Media demonstrating an operator / modifier across bases.', validatorRecognized: true  },
  { prefix: 'set_',         entity: 'set slug',                 description: 'Media for a set / uptime system.',                        validatorRecognized: true  },
  { prefix: 'series_',      entity: 'tutorial-series key',     description: 'Membership in a grouped instructional series.',          validatorRecognized: false },
  { prefix: 'progression_', entity: 'progression ladder id',   description: 'Membership in an ordered learning ladder.',              validatorRecognized: false },
  { prefix: 'combo_',       entity: 'combo id',               description: 'Membership in a combo / run showcase.',                   validatorRecognized: false },
] as const;

/* ── Curated review states ─────────────────────────────────────────────────
 * The trust ladder for curated media, expressed via uploader + tags today,
 * not a schema column. Distinct from, and never merged with, the uncurated
 * community layer. */

export type CuratedReviewState =
  | 'unverified-curated'
  | 'curated'
  | 'expert-reviewed';

export interface CuratedReviewStateInfo {
  state: CuratedReviewState;
  description: string;
}

export const CURATED_REVIEW_STATES: readonly CuratedReviewStateInfo[] = [
  { state: 'unverified-curated', description: 'Curator-sourced but not yet source-attributed or verified.' },
  { state: 'curated',            description: 'Source-attributed; carries the #curated tag.' },
  { state: 'expert-reviewed',    description: 'Carries curator sign-off.' },
] as const;

/* ── Relationship types ────────────────────────────────────────────────────
 * The instructional edge vocabulary: a media item -> an entity it covers.
 * Vocabulary only here (no edges are authored in this module). The direct
 * `#<trick-slug>` tag is the `teaches` relation at `primary` strength; the
 * other relations express coverage the flat tag cannot. Every relation is a
 * pedagogical claim, never an ontology claim. */

export type MediaRelationStrength = 'primary' | 'strong' | 'partial' | 'incidental';

export interface MediaRelationType {
  key: string;
  /** Pedagogical meaning of a media -> entity edge of this type. */
  meaning: string;
  /** Entity kinds an edge of this type may target. */
  allowedTargets: readonly string[];
  /**
   * Always false. An instructional edge is never an ontology claim; the flag
   * is explicit so the invariant is testable, not so it can ever be flipped.
   */
  impliesOntologyClaim: false;
}

export const MEDIA_RELATION_TYPES: readonly MediaRelationType[] = [
  {
    key: 'teaches',
    meaning: 'Video instructs the target as a primary subject (dedicated `#<slug>` is this relation at primary strength).',
    allowedTargets: ['trick', 'set', 'modifier'],
    impliesOntologyClaim: false,
  },
  {
    key: 'components-covered',
    meaning: 'Video incidentally teaches or shows the target while teaching something else (a visible-teaching fact, not a decomposition).',
    allowedTargets: ['trick', 'modifier'],
    impliesOntologyClaim: false,
  },
  {
    key: 'demonstrates',
    meaning: 'Video shows the target performed, with no teaching intent.',
    allowedTargets: ['trick', 'set', 'combo'],
    impliesOntologyClaim: false,
  },
  {
    key: 'exemplar-of',
    meaning: 'Video is the representative example for an already-canonical family / operator / concept.',
    allowedTargets: ['family', 'modifier', 'concept'],
    impliesOntologyClaim: false,
  },
  {
    key: 'progression-step',
    meaning: 'Video is an ordered step within a learning ladder.',
    allowedTargets: ['progression'],
    impliesOntologyClaim: false,
  },
] as const;
