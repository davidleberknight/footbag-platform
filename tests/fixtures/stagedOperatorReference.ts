/**
 * The staged freestyle operators, read the way the doctrine checks read them: the
 * full reference entries (every non-core operator with a recorded source, the
 * entries Freestyle Concepts lists) under the field names the Concepts reference
 * renders, and each core operator's definition. Pure: it reads only the staged
 * curator content, so a unit test can use it with no database.
 */
import { STAGED_OPERATORS } from '../../freestyle/inputs/curator_content/freestyleOperators';

/** One full reference entry, under the field names the Concepts reference renders. */
export interface StagedReferenceEntry {
  slug:                  string;
  name:                  string;
  category:              string;
  oneLineMeaning:        string;
  decomposition:         string | null;
  pendingNote:           string | null;
  workedExamples:        readonly string[];
  lineageNote:           string;
  curatorConfirmPending: boolean;
}

/** Every full reference entry, in staged order. */
export const STAGED_REFERENCE_ENTRIES: readonly StagedReferenceEntry[] = STAGED_OPERATORS
  .filter((o) => o.kind !== 'core' && o.sourceNote !== null)
  .map((o) => ({
    slug:                  o.slug,
    name:                  o.name,
    category:              o.kind,
    oneLineMeaning:        o.definition,
    decomposition:         o.decomposition,
    pendingNote:           o.decompositionNote,
    workedExamples:        o.workedExamples,
    lineageNote:           o.sourceNote ?? '',
    curatorConfirmPending: o.confirmationPending,
  }));

/** Every core operator's definition, in staged order. */
export const STAGED_CORE_DEFINITIONS: readonly { slug: string; definition: string }[] = STAGED_OPERATORS
  .filter((o) => o.kind === 'core')
  .map((o) => ({ slug: o.slug, definition: o.definition }));

/** One full reference entry, or null when the slug has none. */
export function stagedReferenceEntry(slug: string): StagedReferenceEntry | null {
  return STAGED_REFERENCE_ENTRIES.find((e) => e.slug === slug) ?? null;
}

/** One core operator's definition, or null when the slug is not a core operator. */
export function stagedCoreDefinition(slug: string): { slug: string; definition: string } | null {
  return STAGED_CORE_DEFINITIONS.find((d) => d.slug === slug) ?? null;
}
