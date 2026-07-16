// Unicode confusable-skeleton computation for display-name spoofing defence.
//
// Implements the skeleton transform from Unicode Technical Standard #39 (Unicode
// Security Mechanisms): skeleton(X) = toNFD( map( toNFD(X) ) ), where `map`
// replaces each code point with its prototype from the confusables mapping data
// (the "MA" mapped-all class). Two names are confusable when their skeletons are
// equal, which is the impersonation vector this guards: an all-one-script lookalike
// of another member's name (the mixed-script case is already rejected upstream).
//
// Deliberate deviation from the pure UTS #39 skeleton, documented so it can be
// reconciled against the official baseline: the input is lowercased before the
// transform, to stay consistent with the display-name identity already stored as
// `display_name_normalized` (a plain lowercase). This is a pre-fold step, not a
// change to the confusables mapping table; no mapping is added to or removed from
// the vendored data here.
//
// DATA SOURCE. The confusables mapping MUST come from the official Unicode
// `confusables.txt` file, vendored unchanged with its version, license, provenance,
// and checksum. This module ships only the parser + transform; it does NOT ship the
// official data. Unicode does not guarantee confusable mappings or stored skeletons
// are stable across versions, so a persisted skeleton column must be recomputed when
// the data version changes. Production registration enforcement, the persisted
// skeleton column, its uniqueness index, and the existing-member collision audit are
// all gated on vendoring the official file (tracked as blocked in the plan). A small
// hand-authored fixture drives the tests and is explicitly NOT the official data and
// NOT complete threat coverage.

export interface ConfusablesTable {
  /** Version string parsed from the data header (e.g. "17.0.0"). */
  readonly version: string;
  /** Map from a single source code point to its prototype string. */
  readonly mapping: ReadonlyMap<number, string>;
}

export class ConfusablesDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfusablesDataError';
  }
}

// A data line: "0430 ;  0061 ;  MA  # ( а → a ) ...". Source is one hex code point;
// target is a space-separated hex code-point sequence (the prototype); the third
// field is the class and the rest is a comment.
const DATA_LINE = /^([0-9A-Fa-f]{4,6})\s*;\s*([0-9A-Fa-f]{4,6}(?:\s+[0-9A-Fa-f]{4,6})*)\s*;\s*([A-Z]+)/;
const VERSION_LINE = /^#\s*Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/i;

/**
 * Parse Unicode `confusables.txt`-format data into a lookup table. Validates the
 * header and fails loudly (throws `ConfusablesDataError`) on a missing/unrecognized
 * header, a missing version, or a malformed data line, so unexpected or truncated
 * data can never silently degrade the check into a weaker one.
 */
export function parseConfusablesTable(text: string): ConfusablesTable {
  if (typeof text !== 'string' || text.length === 0) {
    throw new ConfusablesDataError('confusables data is empty');
  }
  const lines = text.split(/\r?\n/);

  // Header sanity: the first non-blank line must announce confusables data, and a
  // version line must appear in the header block.
  const firstContent = lines.find(l => l.trim().length > 0) ?? '';
  if (!/confusables(\.txt)?/i.test(firstContent)) {
    throw new ConfusablesDataError(
      'confusables data header not recognized (expected a leading "confusables" banner)',
    );
  }
  let version = '';
  const mapping = new Map<number, string>();

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith('#')) {
      const vm = VERSION_LINE.exec(line);
      if (vm && !version) version = vm[1];
      continue;
    }
    const m = DATA_LINE.exec(line);
    if (!m) {
      throw new ConfusablesDataError(`malformed confusables data line ${i + 1}: ${raw}`);
    }
    const source = Number.parseInt(m[1], 16);
    const prototype = m[2]
      .split(/\s+/)
      .map(h => String.fromCodePoint(Number.parseInt(h, 16)))
      .join('');
    mapping.set(source, prototype);
  }

  if (!version) {
    throw new ConfusablesDataError('confusables data has no "# Version:" line');
  }
  if (mapping.size === 0) {
    throw new ConfusablesDataError('confusables data contained no mappings');
  }
  return { version, mapping };
}

/**
 * The UTS #39 confusable skeleton of a name, with the documented lowercase pre-fold.
 * Deterministic: the same input and table always produce the same output, which is
 * what lets a backfill and a runtime check agree. Comparing two skeletons for
 * equality is the confusable test.
 */
export function confusableSkeleton(name: string, table: ConfusablesTable): string {
  const folded = name.normalize('NFC').toLowerCase().normalize('NFD');
  let mapped = '';
  for (const ch of folded) {
    const proto = table.mapping.get(ch.codePointAt(0)!);
    mapped += proto !== undefined ? proto : ch;
  }
  return mapped.normalize('NFD');
}

/** Whether two names collapse to the same skeleton (i.e. are confusable). */
export function namesAreConfusable(a: string, b: string, table: ConfusablesTable): boolean {
  return confusableSkeleton(a, table) === confusableSkeleton(b, table);
}
