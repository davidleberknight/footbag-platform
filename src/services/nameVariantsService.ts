/**
 * Curated name-variant lookups for the claim step's name key.
 *
 * Read-only helpers over the two curated tables: `name_variants`, whose rows tie
 * one whole name to another, and `given_name_variants`, whose rows tie a
 * nickname to the first name it shortens. The matching module composes them;
 * nothing here decides a match or links anything.
 *
 * HIGH-only enforcement lives at load time (see
 * `legacy_data/scripts/load_name_variants_seed.py`). Rows present in the
 * DB are production-eligible by construction; this read path trusts that
 * invariant and does not re-filter.
 */
import { nameVariants as nameVariantsDb } from '../db/db';

/**
 * NFKC + lowercase + trim + collapse-internal-whitespace.
 *
 * This is the same rule applied by `load_name_variants_seed.py::db_normalize`
 * at load time and documented on the `name_variants` table in
 * `database/schema.sql`. Every comparison against stored rows must route
 * through this function.
 */
export function normalizeForMatch(raw: string): string {
  const nfkc = (raw ?? '').normalize('NFKC').toLowerCase().trim();
  if (!nfkc) return '';
  return nfkc.split(/\s+/).filter(Boolean).join(' ');
}

interface NameVariantRow {
  canonical_normalized: string;
  variant_normalized: string;
}

interface GivenNameVariantRow {
  short_form_normalized: string;
  long_form_normalized: string;
}

/**
 * The first names a curated nickname pair ties to this one, in either
 * direction ("bob" reaches "robert" and back). The input is a folded first
 * name; the result never includes it.
 */
export function nicknameAlternates(firstName: string): string[] {
  if (!firstName) return [];
  const rows = nameVariantsDb.findGivenNameAlternates.all(firstName, firstName) as GivenNameVariantRow[];
  const out = new Set<string>();
  for (const row of rows) {
    const other = row.short_form_normalized === firstName ? row.long_form_normalized : row.short_form_normalized;
    if (other && other !== firstName) out.add(other);
  }
  return [...out];
}

/**
 * The whole names a curated name-variant row ties to this one, in either
 * direction. Rows apply to whole names only, so the input is a full name in
 * the `normalizeForMatch` form the rows are stored in.
 */
export function wholeNameVariants(normalizedName: string): string[] {
  if (!normalizedName) return [];
  const rows = nameVariantsDb.findByEitherColumn.all(normalizedName, normalizedName) as NameVariantRow[];
  const out = new Set<string>();
  for (const row of rows) {
    const other = row.canonical_normalized === normalizedName ? row.variant_normalized : row.canonical_normalized;
    if (other && other !== normalizedName) out.add(other);
  }
  return [...out];
}
