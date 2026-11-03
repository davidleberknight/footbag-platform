"""The platform's one folding rule, for every slug and hashtag body the pipeline makes.

The same rule the app applies (`src/services/slugify.ts`), reading the same committed table:
the Unicode CLDR "Latin-ASCII" transform in `src/public/js/latin-ascii.json`. Accents are
removed (decompose, drop the marks, recompose), each remaining character is mapped through
the table ("ß" reads "ss", "Ł" reads "L"), the result is lowercased, apostrophes are
deleted, and every other run of characters outside a to z and 0 to 9 becomes one
underscore, trimmed from both ends. Text in any other script folds to nothing.

A test in `legacy_data/tests/` holds this module to the probe list the app's own test
reads, so the pipeline and the app always make the same token from the same name.
"""
from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

TABLE_PATH = Path(__file__).resolve().parents[2] / "src" / "public" / "js" / "latin-ascii.json"

_OUTSIDE_TOKEN = re.compile(r"[^a-z0-9]+")


@lru_cache(maxsize=1)
def _table() -> dict[str, str]:
    if not TABLE_PATH.is_file():
        raise SystemExit(
            f"MISSING: {TABLE_PATH}\n"
            "  The pipeline folds slugs and hashtags with the app's one rule, whose letter table\n"
            "  is that committed file. Restore it from the repository (git checkout) and re-run\n"
            "  ./run_pipeline.sh full."
        )
    return json.loads(TABLE_PATH.read_text(encoding="utf-8"))["map"]


def fold_token(text: str) -> str:
    """Fold text into a slug or hashtag body with the one rule."""
    table = _table()
    decomposed = unicodedata.normalize("NFD", text or "")
    unaccented = unicodedata.normalize(
        "NFC", "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    )
    ascii_text = "".join(table.get(c, c) for c in unaccented)
    return _OUTSIDE_TOKEN.sub("_", ascii_text.lower().replace("'", "")).strip("_")
