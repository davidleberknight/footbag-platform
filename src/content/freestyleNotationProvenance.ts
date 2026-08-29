/**
 * How an authored movement notation came to be: the two claims a curator records
 * with it, and the conventions a derivation may name.
 *
 * Provenance is two orthogonal questions, not one class. Where the notation came
 * from is independent of what was done to it: a notation can come from a source's
 * own written form and be copied, or come from nothing but the platform's own
 * structural model and be derived under a ratified convention. One combined field
 * would lose the distinction, and the distinction is the whole reason the record
 * exists — a row derived under a convention can never corroborate that same
 * convention, and only these two fields together say whether it was.
 *
 * The vocabularies live here rather than in the schema so a ruling that renames a
 * value edits one file. The database enforces the structural invariants (a
 * notation says where it came from and how it was made; a derivation names its
 * convention and nothing else carries one); the service enforces membership of
 * these lists.
 *
 * Curator-facing labels are questions and answers, not class names. A curator
 * records what happened; the taxonomy is this module's problem, not theirs.
 */

export interface ProvenanceOption {
  /** The value stored on the ruling. */
  value: string;
  /** What a curator reads in the select. */
  label: string;
  /** One line under the control, saying what the answer means. */
  help: string;
}

/** Where the notation came from. Carries no claim about how good the evidence is:
 *  a shaky video and a definitive one are both footage, and how much either is
 *  worth is a separate judgement recorded in the provenance note. */
export const NOTATION_EVIDENCE_BASES: readonly ProvenanceOption[] = [
  {
    value: 'source-notation',
    label: 'The source wrote it this way',
    help:  'A cited source recorded the movement in written notation of its own.',
  },
  {
    value: 'source-prose',
    label: 'A source described it in words',
    help:  'A cited source described the movement in prose rather than notation.',
  },
  {
    value: 'footage',
    label: 'Someone watched it done',
    help:  'A record video or other observed execution.',
  },
  {
    value: 'testimony',
    label: "A person's account, relayed",
    help:  'A player or expert described it and a curator is relaying that account.',
  },
  {
    value: 'platform-structure',
    label: "The platform's own structure",
    help:  'Nothing outside the platform: the movement follows from how the parts compose.',
  },
];

/** What was done to produce the written notation. */
export const NOTATION_DERIVATION_METHODS: readonly ProvenanceOption[] = [
  {
    value: 'transcription',
    label: 'Copied as written',
    help:  "Kept in the source's own register, with no translation.",
  },
  {
    value: 'register-translation',
    label: 'Rewritten from another notation system',
    help:  "The source's own wording is preserved in the note below.",
  },
  {
    value: 'reconstruction',
    label: 'Worked out from the description or the video',
    help:  'Read off evidence that was not already notation.',
  },
  {
    value: 'convention-derivation',
    label: 'Derived under a ratified convention',
    help:  'Produced by applying a settled rule; name the rule below.',
  },
];

/** The method that must name a convention, and the only one that may. */
export const CONVENTION_DERIVATION = 'convention-derivation';

export interface NotationConvention {
  /** The value stored on the ruling. */
  id: string;
  /** What a curator reads in the select. */
  title: string;
  /** What the convention says, in one sentence. */
  summary: string;
}

/**
 * The conventions a derivation may name.
 *
 * Deliberately short. A convention belongs here when it is ruled and a notation
 * in the corpus was actually produced under it, because the registry's purpose is
 * to stop a derivation naming a rule nobody ratified. Transcribing every ruled
 * derivation into this list ahead of a row that uses one would put unexercised
 * entries in a control a curator picks from, which is how an unratified reading
 * eventually gets chosen by accident. Add an entry when a row needs it.
 */
export const NOTATION_CONVENTIONS: readonly NotationConvention[] = [
  {
    id:      'swirl-chain-terminal-replacement',
    title:   'Swirl-chain terminal replacement',
    summary: 'Appending swirl to a trick that ends in a clipper delay replaces that '
           + 'terminal with one more outward dex into a cross-body clipper delay, scoring '
           + 'one above the base; the appended dex inherits the base terminal’s side.',
  },
  {
    id:      'down-family-four-cell-grid',
    title:   'Down-family four-cell grid',
    summary: 'The down and barfly lineage is one family of four named cells, so a '
           + 'down-family chassis is written in the cell form the grid gives it rather '
           + 'than in whichever form a source happened to record.',
  },
];

const BASIS_VALUES = new Set(NOTATION_EVIDENCE_BASES.map((o) => o.value));
const METHOD_VALUES = new Set(NOTATION_DERIVATION_METHODS.map((o) => o.value));
const CONVENTION_IDS = new Set(NOTATION_CONVENTIONS.map((c) => c.id));

export const isNotationEvidenceBasis = (value: string): boolean => BASIS_VALUES.has(value);
export const isNotationDerivationMethod = (value: string): boolean => METHOD_VALUES.has(value);
export const isNotationConvention = (id: string): boolean => CONVENTION_IDS.has(id);

/** Curator-facing wording for a stored value, for surfaces that display a saved
 *  draft rather than offering the choice. An unknown value shows as itself. */
export function notationBasisLabel(value: string): string {
  return NOTATION_EVIDENCE_BASES.find((o) => o.value === value)?.label ?? value;
}
export function notationMethodLabel(value: string): string {
  return NOTATION_DERIVATION_METHODS.find((o) => o.value === value)?.label ?? value;
}
export function notationConventionTitle(id: string): string {
  return NOTATION_CONVENTIONS.find((c) => c.id === id)?.title ?? id;
}
