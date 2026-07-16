"""
test_passback_snippet_no_proposed_difficulty.py
===============================================

PassBack tutorial snippet candidates carry no proposed compound difficulty. The
`adds_proposed` column in the staging CSV is optional metadata; a computed compound
sum on an unreviewed decomposition candidate must not ride into promotion or be read
as a difficulty claim, so the generator (legacy_data/tools/build_passback_intake.py,
build_snippet_candidates) emits it blank. This guard pins the committed staging
artifact so a regeneration that restores those values cannot land silently. The
canonical ADD lives on the matched trick row, never here.

Run from repo root:
    python -m pytest legacy_data/tests/test_passback_snippet_no_proposed_difficulty.py -v
"""
import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SNIPPET_CSV = REPO_ROOT / "curated" / "freestyle_media" / "video_snippet_candidates.csv"


def test_no_snippet_candidate_carries_a_proposed_difficulty():
    with SNIPPET_CSV.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    assert rows, "video_snippet_candidates.csv has no rows"
    offenders = [r["snippet_id"] for r in rows if (r.get("adds_proposed") or "").strip()]
    assert not offenders, (
        "PassBack snippet candidates must carry no proposed compound difficulty, but "
        f"these rows have a non-blank adds_proposed: {offenders}. The generator emits it "
        "blank; a regeneration that restored these values was committed."
    )
