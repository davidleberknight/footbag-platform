"""
test_club_seed_encoding_invariants.py
=====================================

The committed club seeds carry no C1 control character.

U+0080 to U+009F are unassigned controls in Unicode and printable punctuation in
CP1252, so a club field carrying one is damaged by construction: it is a byte
that was read under the wrong codepage, and no club name, description or roster
value has any use for a control character. The em dash is the case that reached
the artifact, arriving as U+0097 where the mirror's own copy held the real
character.

The repair and the damage test live in the producers, and their own suites cover
them character by character. This is the assertion those suites cannot make: that
the file which actually ships is clean. A cleaner that works and a producer that
was not re-run afterwards give the same green suite and a damaged artifact, which
is the shape of how this got committed in the first place.

Stated over the file rather than over the one field that failed, because the
value that breaks next will be in a different column.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_seed_encoding_invariants.py -v
"""
import csv
from pathlib import Path

import pytest

SEED_DIR = Path(__file__).resolve().parents[1] / "seed"
SEEDS = ("clubs.csv", "club_members.csv")

C1_FIRST, C1_LAST = 0x80, 0x9F


def _c1_positions(text: str) -> list[tuple[int, str]]:
    return [(index, hex(ord(char))) for index, char in enumerate(text)
            if C1_FIRST <= ord(char) <= C1_LAST]


@pytest.mark.parametrize("name", SEEDS)
def test_the_committed_seed_carries_no_c1_control(name: str) -> None:
    path = SEED_DIR / name
    assert path.exists(), f"{path} is a committed artifact and should be here"

    found = _c1_positions(path.read_text(encoding="utf-8"))
    assert not found, (
        f"{name} carries {len(found)} C1 control character(s), the first at "
        f"offset {found[0][0]} ({found[0][1]}). That is a CP1252 byte read as "
        f"Latin-1 rather than decoded: the character the club actually typed is "
        f"still recoverable from it. Regenerate the seed through its producers "
        f"rather than editing the artifact.")


@pytest.mark.parametrize("name", SEEDS)
def test_every_field_of_every_row_is_clean(name: str) -> None:
    # Over the parsed rows as well as the raw text, so a finding can name the
    # row and column an operator has to look at rather than a byte offset.
    path = SEED_DIR / name
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert rows, f"{name} parsed into no rows"

    damaged = []
    for index, row in enumerate(rows, start=2):  # 1 is the header
        for column, value in row.items():
            if value and _c1_positions(value):
                damaged.append(f"line {index}, column {column!r}")

    assert not damaged, (
        f"{len(damaged)} field(s) in {name} carry a C1 control: "
        f"{damaged[:5]}. Each is a CP1252 punctuation byte that was passed "
        f"through instead of decoded.")
