"""Which files in the overrides directory are instructions, and which are records.

A curated override outranks both the legacy dump and the mirror, so one with no
consumer is worse than none at all: the decision looks made, is discoverable, and
never reaches the data. That is true of a directive. It is not true of a record of
how a decision was reached, which is supposed to sit there and be read by people.

Three files had no consumer. They are not the same kind of thing, and this says
which is which so the next person sweeping the directory does not have to work it
out again, or delete something on the strength of the sweep alone.

RETIRED. The pre-1985 worlds comparison detail was every row of the adjudication
file that supersedes it, on all seven columns the two shared, with nothing
different in either direction. The adjudication file is the live one: it carries
the same rows plus the decision taken on each. Two copies of one comparison is how
somebody edits the half nothing reads.

REFERENCE, and unrecoverable. The summary of that comparison counts placements,
which the adjudication still supports, but it also counts each event's disciplines
before the merge. The merged-away events are gone from canonical data, so those
columns describe a state nothing can recompute. Retiring it would destroy the
only record of it.

REFERENCE. The worlds-family grouping names the event types that stand in for a
world championship, including the note that the NHSA nationals were the de-facto
world championships from 1980 to 1983. Nothing reads it, and nothing should have
to: the equivalence data already acts on that fact by merging those events into
the worlds events. The file is why, in a sentence, for a reader.

Run from repo root:
    python -m pytest legacy_data/tests/test_overrides_orphan_triage.py -v
"""
from __future__ import annotations

import csv
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OVERRIDES = REPO_ROOT / "legacy_data" / "overrides"

ADJUDICATION = OVERRIDES / "event_equivalence_pre1985_worlds_adjudication.csv"
SUMMARY = OVERRIDES / "event_equivalence_pre1985_worlds_summary.csv"
WORLDS_FAMILY = OVERRIDES / "worlds_family.csv"
RETIRED_DETAIL = OVERRIDES / "event_equivalence_pre1985_worlds_detail.csv"

#: The four pre-1985 pairs the comparison covered, survivor and merged-away event.
PAIRS = [
    ("1982_worlds_oregon_city", "1982_nhsa_national"),
    ("1983_worlds_boulder_nhsa", "1983_nhsa_national"),
    ("1983_worlds_boulder_wfa", "1983_national"),
    ("1984_worlds_golden_wfa", "1984_national"),
]


def _rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


#: Where a consumer could live. The three trees that hold pipeline, operator and
#: application code; not the repository root, where a commit script naming a file
#: it is committing would read as a consumer of it.
_CONSUMER_TREES = ("legacy_data", "scripts", "src")


def _reads(stem: str) -> list[str]:
    """Every script that names this artifact, tests excluded."""
    found = subprocess.run(
        ["grep", "-rl", stem, "--include=*.py", "--include=*.sh", "--include=*.ts",
         *_CONSUMER_TREES],
        cwd=REPO_ROOT, capture_output=True, text=True).stdout.split()
    return [
        p for p in found
        if "node_modules" not in p
        and "/tests/" not in p
        and not Path(p).name.startswith("test_")
    ]


class TestTheRetiredComparisonLostNothing:
    def test_the_detail_file_is_gone(self):
        assert not RETIRED_DETAIL.exists()

    def test_the_adjudication_still_carries_every_comparison_it_held(self):
        # 27 rows was the detail file's whole content, and each is here with the
        # decision taken on it. Pinned as a count because the file it came from no
        # longer exists to compare against.
        rows = _rows(ADJUDICATION)
        assert len(rows) == 27
        assert {(r["survivor"], r["doomed"]) for r in rows} == set(PAIRS[:1] + PAIRS[1:2] + PAIRS[3:])

    def test_every_comparison_carries_a_decision(self):
        # The reason the adjudication supersedes the detail rather than merely
        # duplicating it: an undecided row would make the two equivalent again.
        undecided = [
            f'{r["survivor"]}/{r["discipline_key"]}/p{r["placement"]}'
            for r in _rows(ADJUDICATION)
            if not (r.get("decision_status") or "").strip()
            or not (r.get("chosen_source") or "").strip()
        ]
        assert undecided == []

    def test_the_adjudication_is_read_by_the_pipeline(self):
        assert _reads("event_equivalence_pre1985_worlds_adjudication") != []


class TestTheSummaryIsAReferenceRecord:
    def test_nothing_reads_it(self):
        # If this ever gains a consumer it stops being a record and becomes a
        # directive, which is a different thing with different obligations.
        assert _reads("event_equivalence_pre1985_worlds_summary") == []

    def test_its_placement_counts_still_agree_with_the_live_file(self):
        # The half that can be recomputed. Disagreement would mean one of the two
        # moved without the other.
        by_pair: dict[tuple[str, str], Counter] = defaultdict(Counter)
        for r in _rows(ADJUDICATION):
            by_pair[(r["survivor"], r["doomed"])][r["status"]] += 1
        for s in _rows(SUMMARY):
            counts = by_pair[(s["survivor"], s["doomed"])]
            pair = f'{s["survivor"]} <- {s["doomed"]}'
            assert sum(counts.values()) == int(s["overlapping_placements"]), pair
            assert counts["IDENTICAL"] == int(s["identical_placements"]), pair
            assert counts["CONFLICT"] == int(s["conflicting_placements"]), pair

    def test_it_records_discipline_counts_nothing_can_recompute(self):
        # Why it is kept rather than retired with the detail file. These count the
        # disciplines each event carried before the merge, and the merged-away
        # events are gone from canonical data, so the numbers exist only here.
        events = {
            r["event_key"] for r in
            _rows(REPO_ROOT / "legacy_data" / "event_results" / "canonical_input" / "events.csv")
        }
        for _, doomed in PAIRS:
            assert doomed not in events, f"{doomed} is back; the counts are recomputable again"
        for s in _rows(SUMMARY):
            assert int(s["doomed_disc_count"]) > 0


class TestTheWorldsFamilyGroupingIsAReferenceNote:
    def test_nothing_reads_it(self):
        assert _reads("worlds_family") == []

    def test_it_names_event_types_no_code_branches_on(self):
        # A grouping the code acted on would be a directive. Nothing branches on
        # these, which is what makes it a note rather than an unwired instruction.
        for row in _rows(WORLDS_FAMILY):
            event_type = row["event_type"].strip()
            if not event_type:
                continue
            assert _reads(event_type) == [], event_type

    def test_the_fact_it_records_is_acted_on_by_the_equivalence_data(self):
        # It says the NHSA nationals were the de-facto world championships from
        # 1980 to 1983. The pipeline does not read that sentence; it merges those
        # events into the worlds events, which is the same claim as an action.
        equivalence = _rows(OVERRIDES / "event_equivalence.csv")
        merged = {
            r["event_id"] for r in equivalence
            if (r.get("action") or "").strip().lower() == "merge"
        }
        assert "1982_nhsa_national" in merged
        assert "1983_nhsa_national" in merged
