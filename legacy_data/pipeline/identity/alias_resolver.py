"""
Shared alias resolution for the identity pipeline.

Single source of truth consumed by:
  - persons/provisional/scripts/03_reconcile_provisional_to_historical.py
  - event_results/scripts/07_build_mvfp_seed_full.py
  - pipeline/qc/check_alias_duplicate_persons.py
  - any future identity-resolution step

Why centralized: before this module existed, multiple scripts each had their
own normalization and alias-loading logic, leading to a class of regression
bugs where a name would resolve via alias in one stage but fail in another,
producing duplicate person rows. All identity-resolution paths must use this
module so normalization and resolution rules are consistent.

Invariant: no new person_id should be assigned for a display_name whose
normalized form matches any alias in overrides/person_aliases.csv that
points to (or via its person_canon resolves to) an existing canonical person.

Public API:
    normalize_name(name)                  → str
    AliasResolver(aliases_csv, persons)   → instance with .resolve(name)
    AliasResolver.resolve(name)           → canonical_person_id or None
"""

from __future__ import annotations

import csv
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path


# Characters that appear as encoding / sanitization artifacts and should be
# removed before any other normalization. U+FEFF = BOM. U+FFFD = replacement
# char. U+00AD = soft hyphen.
_ARTIFACT_CHARS = ("\ufeff", "\ufffd", "\u00ad")

# Punctuation that should be stripped (kept as empty, not replaced with space)
# because it often appears inside words where splitting would create artifacts:
# "Léa L'espérance" → "lea lesperance", not "lea l esperance".
_STRIP_PUNCT_RE = re.compile(r"[''\u2018\u2019\u02bc.,`\"]")

# Separator-like characters collapsed to a single space.
_SEP_RE = re.compile(r"[-_/]+")

# Collapse runs of whitespace.
_WS_RE = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    """Canonical name normalization used by every identity-resolution stage.

    Pipeline (each step is necessary; removing any of them reintroduces a
    known class of duplicate-person regression):

      1. Drop encoding artifacts (BOM, U+FFFD, soft hyphen).
      2. NFKD decomposition + drop combining marks → accents/diacritics stripped
         ("Bélanger" → "Belanger", "Zülli" → "Zulli", "Rafał" → "Rafal").
      3. Lowercase.
      4. Collapse hyphens / underscores / slashes to a single space
         ("J-F" → "j f", "Jean-Marie" → "jean marie").
      5. Strip a small set of punctuation characters that appear inside words
         (apostrophes, periods, commas, backticks, straight/curly quotes)
         ("L'espérance" → "lesperance", "J.-F." → "j f ").
      6. Collapse whitespace and strip.
    """
    if not name:
        return ""
    s = str(name)
    for ch in _ARTIFACT_CHARS:
        s = s.replace(ch, "")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = _SEP_RE.sub(" ", s)
    s = _STRIP_PUNCT_RE.sub("", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


@dataclass
class AliasResolver:
    """Resolve raw display names to a canonical person_id via the alias registry.

    Parameters
    ----------
    aliases_csv : Path
        Path to legacy_data/overrides/person_aliases.csv
    canonical_persons : iterable of (person_id, person_name) tuples
        All rows from the canonical persons source being reconciled against
        (typically legacy_data/event_results/canonical_input/persons.csv).

    Resolution rules (apply in order):

      (a) Build a "canonical index": normalized canonical_name → person_id.
      (b) For each alias row:
           - If person_canon normalizes to an entry in the canonical index,
             use that person_id as the alias target. This catches self-pointing
             aliases whose target person_id is the duplicate row itself — the
             alias is rebound to the canonical row identified by person_canon.
           - Otherwise, if the row's person_id is already in the canonical
             index (i.e. it IS a canonical row), accept it.
           - Otherwise, skip the alias (stale / unresolvable).
      (c) Skip alias entries whose normalized alias == the target's normalized
          canonical name AND the target is the duplicate row (self-loop).

    After construction, call `.resolve(display_name)` → canonical_person_id
    or None.
    """

    aliases_csv: Path
    canonical_persons: list = field(default_factory=list)

    _alias_to_pid: dict = field(init=False, default_factory=dict)
    _pid_to_name: dict = field(init=False, default_factory=dict)
    _norm_name_to_pid: dict = field(init=False, default_factory=dict)
    _loaded: int = field(init=False, default=0)
    _skipped_self_pointing: int = field(init=False, default=0)
    _skipped_stale_target: int = field(init=False, default=0)

    def __post_init__(self) -> None:
        # Build canonical index: normalized name → pid, and pid → display name
        for pid, name in self.canonical_persons:
            pid = (pid or "").strip()
            name = (name or "").strip()
            if not pid or not name:
                continue
            self._pid_to_name[pid] = name
            # First canonical row for a given normalized name wins; subsequent
            # collisions are treated as pre-existing data duplicates outside
            # this resolver's scope (Pattern C in the diagnosis).
            self._norm_name_to_pid.setdefault(normalize_name(name), pid)

        if not self.aliases_csv.exists():
            return

        with open(self.aliases_csv, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                alias_raw = (row.get("alias") or "").strip()
                target_pid = (row.get("person_id") or "").strip()
                canon_raw = (row.get("person_canon") or "").strip()
                if not alias_raw:
                    continue

                alias_norm = normalize_name(alias_raw)
                canon_norm = normalize_name(canon_raw)

                # Prefer person_canon lookup — this re-binds self-pointing
                # aliases to the correct canonical row.
                chosen_pid = self._norm_name_to_pid.get(canon_norm, "")

                # Fallback: if canon_norm didn't resolve, accept target_pid
                # only if it's a known canonical row.
                if not chosen_pid and target_pid in self._pid_to_name:
                    chosen_pid = target_pid

                if not chosen_pid:
                    self._skipped_stale_target += 1
                    continue

                # Skip self-loops: an alias that normalizes to the chosen
                # person's own name AND the alias_norm has no other resolution
                # value isn't harmful, but counts it so callers can see the
                # pattern in logs.
                if chosen_pid in self._pid_to_name:
                    if alias_norm == normalize_name(self._pid_to_name[chosen_pid]):
                        # Not skipped — this is the tautological case where
                        # the alias IS the canonical name. Still allow it into
                        # the map so downstream lookups of this form resolve.
                        pass

                # If two different aliases (or the same alias twice) land on
                # different targets, first write wins. Collisions are rare and
                # usually benign.
                prior = self._alias_to_pid.get(alias_norm)
                if prior and prior != chosen_pid:
                    self._skipped_self_pointing += 1
                    continue

                self._alias_to_pid[alias_norm] = chosen_pid
                self._loaded += 1

    def resolve(self, display_name: str) -> str | None:
        """Return canonical person_id for display_name, or None if no match.

        Lookup order:
          1. Alias index (priority) — an alias entry is an explicit instruction
             that the alias text and its canonical target are the same person.
             Takes precedence even when the alias text also exists as a
             canonical row, because that canonical row is exactly the duplicate
             we are trying to merge AWAY from.
          2. Canonical-name index (fallback) — covers cases where the raw
             display name matches a canonical person under a different
             case/diacritic form and no alias is needed.
        """
        key = normalize_name(display_name)
        if not key:
            return None
        pid = self._alias_to_pid.get(key)
        if pid:
            return pid
        return self._norm_name_to_pid.get(key)

    def canonical_name(self, pid: str) -> str:
        """Display name for a canonical person_id (for match_status rows)."""
        return self._pid_to_name.get(pid, "")

    def stats(self) -> dict:
        return {
            "aliases_loaded": self._loaded,
            "aliases_skipped_stale_target": self._skipped_stale_target,
            "aliases_skipped_conflict": self._skipped_self_pointing,
            "canonical_persons": len(self._pid_to_name),
        }


def load_default_resolver(
    aliases_csv: Path | None = None,
    canonical_persons_csv: Path | None = None,
) -> AliasResolver:
    """Convenience constructor: load aliases and canonical persons from default
    pipeline paths.

    aliases_csv defaults to          legacy_data/overrides/person_aliases.csv
    canonical_persons_csv defaults to legacy_data/event_results/canonical_input/persons.csv
    """
    this_file = Path(__file__).resolve()
    legacy_root = this_file.parents[2]  # identity/ → pipeline/ → legacy_data/

    if aliases_csv is None:
        aliases_csv = legacy_root / "overrides" / "person_aliases.csv"
    if canonical_persons_csv is None:
        canonical_persons_csv = legacy_root / "event_results" / "canonical_input" / "persons.csv"

    canonical: list[tuple[str, str]] = []
    if canonical_persons_csv.exists():
        with open(canonical_persons_csv, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                pid = (row.get("person_id") or "").strip()
                name = (row.get("person_name") or row.get("person_canon") or row.get("name") or "").strip()
                if pid and name:
                    canonical.append((pid, name))

    return AliasResolver(aliases_csv=aliases_csv, canonical_persons=canonical)
