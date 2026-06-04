"""
test_clubs_seed_load_not_in_production.py
=========================================

Static guard preventing accidental re-introduction of
`scripts/load_clubs_seed.py` into the production pipeline
(`legacy_data/run_pipeline.sh`).

Rationale: load_clubs_seed.py bulk-loads every seed/clubs.csv row into
the live `clubs` table, which defeats Phase H's classifier-driven
cutover gating (MIGRATION_PLAN §10.1). It survives as a dev-convenience
script invoked by scripts/reset-local-db.sh (David-owned). In production,
Phase H (clubs/scripts/06_cutover_pre_populated_clubs.py) is the sole
creator of live `clubs` rows, gated to the pre_populate-class candidates.

This test reads run_pipeline.sh and asserts the bulk loader is not
invoked anywhere. Comments that mention the script by name (documenting
why it's excluded) are allowed; only executable invocations are rejected.

Run from repo root:
    python -m pytest legacy_data/tests/test_clubs_seed_load_not_in_production.py -v
"""
import re
from pathlib import Path

RUN_PIPELINE = (
    Path(__file__).resolve().parents[1] / "run_pipeline.sh"
)


def _executable_invocations_of(script_name: str, text: str) -> list[tuple[int, str]]:
    """Return (line_number, line_text) for every line that LOOKS LIKE a
    shell invocation of `script_name` (e.g. `python scripts/foo.py ...`).

    Excludes lines that are pure shell comments (start with `#` after
    optional leading whitespace), so the explanatory header block does
    not trigger false positives.
    """
    pattern = re.compile(rf"\bpython\b\s+\S*{re.escape(script_name)}\b")
    hits: list[tuple[int, str]] = []
    for i, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if pattern.search(line):
            hits.append((i, stripped))
    return hits


def test_run_pipeline_sh_exists():
    """Sanity: run_pipeline.sh must exist at the expected path."""
    assert RUN_PIPELINE.is_file(), f"Missing: {RUN_PIPELINE}"


def test_load_clubs_seed_not_invoked_in_production_pipeline():
    """run_pipeline.sh must NOT invoke scripts/load_clubs_seed.py in any
    executable position. The bulk-load defeats Phase H gating
    (MIGRATION_PLAN §10.1).
    """
    text = RUN_PIPELINE.read_text()
    hits = _executable_invocations_of("load_clubs_seed.py", text)
    assert hits == [], (
        "run_pipeline.sh has resurrected an executable invocation of "
        "load_clubs_seed.py. This bulk-loads every seed/clubs.csv row "
        "into live `clubs` and defeats Phase H's classifier-driven "
        "cutover (MIGRATION_PLAN §10.1). The production pipeline must "
        "let Phase H create the pre_populate clubs exclusively. "
        f"Offending lines: {hits}"
    )


def test_load_club_members_seed_still_invoked():
    """Sanity: load_club_members_seed.py SHOULD remain invoked. Removing
    load_clubs_seed.py was the targeted fix; the members loader is
    untouched because its output is later DELETE+INSERTed by Phase G."""
    text = RUN_PIPELINE.read_text()
    hits = _executable_invocations_of("load_club_members_seed.py", text)
    assert hits, (
        "run_pipeline.sh no longer invokes load_club_members_seed.py. "
        "This wasn't part of the Path 1 scope; either restore it or "
        "update this test if the removal was intentional."
    )


def test_phase_h_still_invoked_in_production_pipeline():
    """Sanity: Phase H's 06_cutover_pre_populated_clubs.py must still run.
    It is now the SOLE creator of live `clubs` rows in production
    (per MIGRATION_PLAN §10.1)."""
    text = RUN_PIPELINE.read_text()
    hits = _executable_invocations_of("06_cutover_pre_populated_clubs.py", text)
    assert hits, (
        "run_pipeline.sh no longer invokes 06_cutover_pre_populated_clubs.py. "
        "Phase H is now the only path that creates live `clubs` rows in "
        "production; if Phase H is dropped, no `clubs` will exist after a "
        "fresh production pipeline run."
    )
