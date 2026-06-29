"""Tests for the opt-in live-roster drift check (M12 companion).

Network-free by construction: the parsers and the diff are pure functions
exercised against fixture HTML / name lists. The live fetch is opt-in and is
never invoked here or in CI.
"""
import importlib.util
from pathlib import Path

_MOD = Path(__file__).resolve().parents[1] / "member_data_scripts" / "diff_live_honor_rosters.py"
_spec = importlib.util.spec_from_file_location("diff_live_honor_rosters", _MOD)
drr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(drr)


# ── parse_hof: the four real markup shapes on the member directory ──
HOF_HTML = """
<p style="white-space:pre-wrap;"><a href="/our-members/bill-langbehn">Bill Langbehn</a></p>
<p data-x="true"><a href="https://www.footbaghalloffame.net/our-members/andy-linder">Andy Linder</a></p>
<p style="white-space:pre-wrap;">J<a href="/our-members/on-lind">on Lind</a></p>
<p>J<a href="/our-members/jukka-peltola">ukka Peltola</a></p>
<p><a href="/our-members/dropcap-tag"><strong>K</strong>endall K</a></p>
<a href="/about">Not a member link</a>
"""


def test_parse_hof_relative_and_absolute_hrefs():
    names = drr.parse_hof(HOF_HTML)
    assert "Bill Langbehn" in names      # relative href
    assert "Andy Linder" in names        # absolute href (host present)


def test_parse_hof_dropcap_first_letter_outside_anchor():
    names = drr.parse_hof(HOF_HTML)
    assert "Jon Lind" in names           # 'J' + 'on Lind'
    assert "Jukka Peltola" in names      # 'J' + 'ukka Peltola'


def test_parse_hof_strips_nested_tags():
    names = drr.parse_hof(HOF_HTML)
    assert "Kendall K" in names          # <strong>K</strong>endall K


def test_parse_hof_ignores_non_member_links():
    assert "Not a member link" not in drr.parse_hof(HOF_HTML)


# ── parse_bap ──
BAP_HTML = """
<h2 class="year-title">1992</h2>
<h3 class="member-name">Kenny Shults</h3>
<h3 class="member-name">Rick Reese</h3>
<h3 class="member-name">Genevi&egrave;ve Bousquet</h3>
<h3 class="other">Not a member</h3>
"""


def test_parse_bap_names_and_entity_unescape():
    names = drr.parse_bap(BAP_HTML)
    assert names[:2] == ["Kenny Shults", "Rick Reese"]
    assert "Geneviève Bousquet" in names   # &egrave; unescaped
    assert "Not a member" not in names      # only member-name h3s


# ── diff_roster: live-only / snapshot-only / normalization / ambiguity ──
def test_diff_live_only_and_snapshot_only():
    r = drr.diff_roster(["Alice A", "Bob B"], ["Bob B", "Carol C"])
    assert r["live_only"] == ["Alice A"]
    assert r["snapshot_only"] == ["Carol C"]


def test_diff_normalizes_whitespace_and_case_no_false_drift():
    r = drr.diff_roster(["Bob  Smith"], ["bob smith"])
    assert r["live_only"] == [] and r["snapshot_only"] == []


def test_diff_flags_ambiguous_same_key_distinct_display():
    r = drr.diff_roster(["Bob Smith", "BOB  SMITH"], ["Bob Smith"])
    assert r["ambiguities"]               # two display names collapse to one key
    assert r["live_only"] == []


def test_load_snapshot_names(tmp_path):
    p = tmp_path / "snap.csv"
    p.write_text("name,year_inducted\nKenny Shults,1992\n\nRick Reese,1992\n", encoding="utf-8")
    assert drr.load_snapshot_names(p) == ["Kenny Shults", "Rick Reese"]
