"""
test_country_token_parity.py
============================

Pins the club pipeline's country tokens to the app's. A country's short token
("usa", "czech") fills the country slot of a club hashtag and names its clubs
page, and the token table lives twice: in the app's country module, keyed by
ISO code, and in the club curation module the seed and cutover loaders read,
keyed by canonical name. If they disagree, a club the pipeline seeds and the
same club promoted in the app derive different hashtags, and a seeded tag can
collide with a country page address.

Run from repo root:
    python -m pytest legacy_data/tests/test_country_token_parity.py -v
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = REPO_ROOT / "legacy_data" / "scripts"
COUNTRY_UTILS = REPO_ROOT / "src" / "services" / "countryUtils.ts"


def _load(name: str):
    sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _ts_table(const_name: str) -> dict[str, str]:
    source = COUNTRY_UTILS.read_text(encoding="utf-8")
    block = re.search(rf"const {const_name}: Record<string, string> = \{{(.*?)\n\}};", source, re.S)
    assert block, f"{const_name} not found in the app's country module"
    pairs = re.findall(r"^\s*(\w+): (['\"])(.*?)\2,", block.group(1), re.M)
    return {code: value for code, _quote, value in pairs}


def test_pipeline_tokens_equal_the_app_tokens():
    names = _ts_table("COUNTRY_NAME_BY_CODE")
    tokens = _ts_table("COUNTRY_TOKEN_BY_CODE")
    app = {names[code]: token for code, token in tokens.items()}
    assert len(tokens) > 0
    assert _load("club_curation").COUNTRY_TOKENS == app
