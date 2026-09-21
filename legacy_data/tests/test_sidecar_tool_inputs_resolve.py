"""
test_sidecar_tool_inputs_resolve.py
===================================

The tools that produce curated sidecars can find the files they read.

Neither tool has a companion suite that runs it, and neither is reached by any
orchestrator, so a moved input is invisible: the tool keeps importing, keeps
type-checking, and fails only when a curator runs it by hand, which happens
months apart. Both were unrunnable at once for that reason, and the shared slug
loader took the second one down with the first.

A path these tools read is committed, so its absence is a defect in the path
rather than a machine that is missing something. Asserting the loader returns a
populated dictionary as well as that the files exist is deliberate: a path can
resolve to something empty, and an empty slug set silently turns the tag
validator into a check that accepts anything.

Run from repo root:
    python -m pytest legacy_data/tests/test_sidecar_tool_inputs_resolve.py -v
"""
import importlib.util
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = REPO_ROOT / "scripts"


def _load(name: str):
    sys.path.insert(0, str(SCRIPTS))
    try:
        spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    finally:
        sys.path.remove(str(SCRIPTS))


def _is_tracked(path: Path) -> bool:
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(path.relative_to(REPO_ROOT))],
        cwd=REPO_ROOT, capture_output=True, text=True)
    return result.returncode == 0


def test_the_shared_slug_loader_reads_files_that_exist_and_are_committed():
    mod = _load("_trick_tag_invariant")
    active, pending, aliases, nontrick = mod.load_slug_sets_from_csvs(REPO_ROOT)
    assert len(active) > 500, (
        f"the loader resolved but returned only {len(active)} active slugs; a path "
        f"that resolves to something near-empty turns the tag validator into a "
        f"check that accepts anything"
    )
    assert aliases, "no aliases loaded; alias-only tags would stop being rejected"


def test_the_promotion_script_can_find_its_staging_csv():
    mod = _load("promote_snippet_candidates")
    assert mod.SNIPPETS_CSV.exists(), (
        f"{mod.SNIPPETS_CSV} does not exist, so the promotion script refuses every "
        f"run before it reads a single row"
    )
    assert _is_tracked(mod.SNIPPETS_CSV), (
        f"{mod.SNIPPETS_CSV} is not committed, so this passes only on the machine "
        f"that happens to hold it"
    )


def test_the_demo_acquirer_can_find_its_manifest():
    mod = _load("acquire_footbag_org_demos")
    assert mod.MANIFEST.exists(), f"{mod.MANIFEST} does not exist"
    assert _is_tracked(mod.MANIFEST), f"{mod.MANIFEST} is not committed"


def test_no_sidecar_tool_still_reads_from_the_pre_split_location():
    # The freestyle pipeline moved out of legacy_data/ and these tools kept
    # pointing at where it used to be. Nothing under scripts/ reads a freestyle
    # input through legacy_data any more.
    # A Path expression spells a separator as `" / "`, so the two names sit a
    # handful of quote-and-slash characters apart rather than adjacent.
    result = subprocess.run(
        ["git", "grep", "-n", "-E",
         r'legacy_data.{0,40}(trick_video_discovery|inputs.{0,20}(noise|base_dictionary))',
         "--", "scripts/"],
        cwd=REPO_ROOT, capture_output=True, text=True)
    assert result.returncode != 0, (
        f"a tool still reads a freestyle input from the pre-split location:\n"
        f"{result.stdout}"
    )
