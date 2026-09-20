"""
test_freestyle_media_coverage_embedded.py
=========================================

Verifies the embedded (indirect) instructional-coverage layer added to
`legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py`.

Contract pinned here:

  • The curator manifest (`embedded_coverage.csv`) parses into
    {embedded_trick_slug: [host_trick_slug, ...]}, and ships seeded with the
    orbit→around_the_world and illusion→mirage edges.
  • A core trick with no dedicated primary but an embedded edge classifies as
    EMBEDDED_ONLY, NOT CORE_GAP (orbit). Without the edge it stays CORE_GAP
    (regression guard: the bucket only moves because of embedded coverage).
  • Embedded coverage never downgrades a trick that already has a direct
    primary (illusion stays COMPLETE).
  • Embedded coverage is honesty-preserving: it is an independent flag and does
    not change a trick's status (direct strong-coverage stays direct).

These are pure-function assertions; they do not build the temp DB.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_media_coverage_embedded.py -v
"""
import importlib.util
import sqlite3
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = (
    REPO_ROOT / "freestyle" / "loaders"
    / "24_qc_freestyle_media_coverage.py"
)


# Dynamic import — the script filename starts with a digit, so the standard
# import form fails. spec_from_file_location is the canonical workaround.
def _load_module():
    spec = importlib.util.spec_from_file_location("media_coverage_24", SCRIPT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mod = _load_module()


def test_manifest_parses_seeded_edges():
    embedded = mod.load_embedded_coverage()
    assert embedded.get("orbit") == ["around_the_world"]
    assert embedded.get("illusion") == ["mirage"]


def test_embedded_edge_shifts_no_primary_off_the_gap_buckets():
    # orbit is a core atom with no dedicated primary; without an edge it is a
    # CORE_GAP, and with its embedded edge it must read as EMBEDDED_ONLY
    # (covered indirectly), leaving the gap list.
    assert mod.classify_priority("orbit", "ACTIVE_NO_PRIMARY", embedded_covered=True) == "EMBEDDED_ONLY"
    assert mod.classify_priority("orbit", "ACTIVE_NO_PRIMARY", embedded_covered=False) == "CORE_GAP"


def test_core_trick_core_gap_becomes_embedded_only():
    # For a trick that IS in CORE_TRICKS, an embedded edge moves the no-primary
    # bucket from CORE_GAP to EMBEDDED_ONLY — the headline value of this slice.
    core = next(iter(mod.CORE_TRICKS))
    assert mod.classify_priority(core, "ACTIVE_NO_PRIMARY", embedded_covered=False) == "CORE_GAP"
    assert mod.classify_priority(core, "ACTIVE_NO_PRIMARY", embedded_covered=True) == "EMBEDDED_ONLY"


def test_embedded_does_not_downgrade_covered_trick():
    # illusion has its own direct primary (ACTIVE_STRONG_PRIMARY) and is also
    # embedded; the embedded flag must never pull a covered trick out of COMPLETE.
    assert mod.classify_priority("illusion", "ACTIVE_STRONG_PRIMARY", embedded_covered=True) == "COMPLETE"


def test_embedded_flag_defaults_false_preserves_legacy_behavior():
    # The new parameter is optional; omitting it must equal passing False.
    for slug, status in (("orbit", "ACTIVE_NO_PRIMARY"), ("mirage", "ACTIVE_WEAK_PRIMARY")):
        assert mod.classify_priority(slug, status) == mod.classify_priority(slug, status, False)


def test_core_set_contains_all_twelve_atoms():
    # The media-priority core set is a superset of the 12 irreducible atoms.
    atoms = {
        "toe-stall", "clipper-stall", "around-the-world", "orbit", "legover",
        "pickup", "mirage", "illusion", "butterfly", "osis", "whirl", "swirl",
    }
    assert atoms <= mod.CORE_TRICKS


def test_clipper_kick_excluded_clipper_stall_included():
    # clipper-stall is the atom; the bare `clipper` slug is the Clipper Kick.
    assert "clipper-stall" in mod.CORE_TRICKS
    assert "clipper" not in mod.CORE_TRICKS


# ── unified-graph migration ────────────────────────────────────────────────

def test_classify_primary_strength_reads_the_clips_content_type_tag():
    # Coverage strength is what the clip says it is. A teaching claim has to be
    # made on the clip itself; it is never inferred from where the clip came
    # from, so the same clip reads the same way on every surface that asks.
    assert mod.classify_primary_strength({"#tutorial"}) == "STRONG_TUTORIAL"
    assert mod.classify_primary_strength({"#demo"}) == "HIGH_QUALITY_DEMO"
    assert mod.classify_primary_strength({"#record"}) == "WEAK_RECORD"


def test_classify_primary_strength_defaults_an_untyped_clip_to_demonstration():
    # The default is the weaker of the two strong labels, matching both public
    # readers: an untyped clip demonstrates, it does not claim to teach.
    assert mod.classify_primary_strength(set()) == "HIGH_QUALITY_DEMO"
    assert mod.classify_primary_strength({"#curated", "#freestyle"}) == "HIGH_QUALITY_DEMO"


def test_trick_tag_body_filters_non_trick_tags():
    assert mod.trick_tag_body("#double-leg-over") == "double-leg-over"
    # utility, source/domain-prefix tags are not trick references
    assert mod.trick_tag_body("#curated") is None
    assert mod.trick_tag_body("#freestyle") is None
    assert mod.trick_tag_body("#set_pixie") is None
    assert mod.trick_tag_body("#by_someone") is None


def _seed_minimal_db(path):
    con = sqlite3.connect(path)
    con.executescript("""
        CREATE TABLE freestyle_tricks (slug TEXT PRIMARY KEY, canonical_name TEXT,
            category TEXT, adds INTEGER, is_active INTEGER, review_status TEXT,
            base_trick TEXT, trick_family TEXT);
        CREATE TABLE media_items (id TEXT PRIMARY KEY, source_id TEXT, caption TEXT);
        CREATE TABLE media_tags (media_id TEXT, tag_display TEXT);
    """)
    con.executemany("INSERT INTO freestyle_tricks VALUES (?,?,?,?,?,?,?,?)", [
        ("torque", "Torque", "compound", 3, 1, "curated", "osis", "torque"),
        ("gauntlet", "Gauntlet", "compound", 5, 1, "curated", "", "gauntlet"),
        ("memberonly", "Member Only", "compound", 4, 1, "curated", "", "x"),
    ])
    # Both curated clips carry the same source id, and they classify
    # differently, because each says on itself what it is for.
    con.executemany("INSERT INTO media_items VALUES (?,?,?)", [
        ("m1", "tt_youtube", "35 - Torque Stall"),     # curated, says it teaches
        ("m2", "tt_youtube", "Gauntlet demo"),         # curated, says it demonstrates
        ("m3", "", "a member clip"),                   # NOT curated
    ])
    con.executemany("INSERT INTO media_tags VALUES (?,?)", [
        ("m1", "#curated"), ("m1", "#freestyle"), ("m1", "#trick"), ("m1", "#torque"),
        ("m1", "#tutorial"),
        ("m2", "#curated"), ("m2", "#freestyle"), ("m2", "#trick"), ("m2", "#gauntlet"),
        ("m2", "#demo"),
        ("m3", "#memberonly"),  # member upload, no #curated → must be excluded
    ])
    con.commit()
    con.close()


def test_build_rows_reads_unified_graph_and_counts_curated_media():
    # The migration's core: coverage comes from curated media_items/media_tags,
    # NOT the legacy freestyle_media_* graph. gauntlet is exactly the kind of
    # trick the legacy dashboard missed; it must now read as covered.
    with tempfile.NamedTemporaryFile(suffix=".db") as tf:
        _seed_minimal_db(tf.name)
        con = sqlite3.connect(tf.name)
        try:
            rows = {r["slug"]: r for r in mod.build_rows(con)}
        finally:
            con.close()

    assert rows["torque"]["primary_strength"] == "STRONG_TUTORIAL"
    assert rows["torque"]["status"] == "ACTIVE_STRONG_PRIMARY"
    assert rows["torque"]["priority_bucket"] == "COMPLETE"
    assert rows["torque"]["total_media_items"] == 1

    # gauntlet is covered by a clip from the same source that classifies as a
    # demonstration, which is still strong coverage. The two rows differ on
    # nothing but the content-type tag, which is what pins classification to the
    # clip rather than to where it came from.
    assert rows["gauntlet"]["primary_strength"] == "HIGH_QUALITY_DEMO"
    assert rows["gauntlet"]["is_strong"] == 1
    assert rows["gauntlet"]["status"] == "ACTIVE_STRONG_PRIMARY"

    # a trick with only a NON-curated (member) item is not counted as covered
    assert rows["memberonly"]["total_media_items"] == 0
    assert rows["memberonly"]["status"] == "ACTIVE_NO_PRIMARY"
