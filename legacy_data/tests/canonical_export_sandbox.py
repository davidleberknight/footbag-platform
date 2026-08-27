"""Builds a throwaway copy of the canonical exporter and synthetic inputs.

The exporter derives every path from its own file location, so copying it into a
temporary tree gives a fully self-contained run: real argument parsing, real
input reading, the real transformation chain, and real CSV writing, with a
default output target that is itself inside the temporary tree.

The synthetic `out/canonical` inputs below are built from the exporter's input
contract, not copied from any machine-local artifact. The committed
`canonical_input` snapshot and the local `out/canonical` material are both
deliberately untouched: the local copy predates the current identity-lock state,
so anything derived from it would bake a stale snapshot into the suite.

The optional identity-lock, hall-of-fame and alias inputs are left absent on
purpose. Each loader returns an empty mapping when its file is missing, which is
a supported configuration and keeps the fixture to the five files that matter.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"

OUTPUT_FILENAMES = [
    "events.csv",
    "event_disciplines.csv",
    "event_results.csv",
    "event_result_participants.csv",
    "persons.csv",
]

EVENTS = """event_key,legacy_event_id,year,event_name,event_slug,start_date,end_date,city,region,country,host_club,event_type,status,notes,source
1998_worlds,101,1998,World Championships,1998-worlds,1998-08-01,1998-08-07,Prague,,Czech Republic,,worlds,final,,synthetic
2001_euros,102,2001,European Championships,2001-euros,2001-07-02,2001-07-05,Berlin,,Germany,,continental,final,,synthetic
"""

DISCIPLINES = """event_key,discipline_key,discipline_name,discipline_category,team_type,sort_order,coverage_flag,notes
1998_worlds,singles_freestyle,Singles Freestyle,freestyle,singles,1,full,
1998_worlds,open_net,Open Net,net,doubles,2,full,
2001_euros,singles_freestyle,Singles Freestyle,freestyle,singles,1,full,
"""

RESULTS = """event_key,discipline_key,placement,score_text,notes,source
1998_worlds,singles_freestyle,1,,,synthetic
1998_worlds,singles_freestyle,2,,,synthetic
1998_worlds,open_net,1,,,synthetic
2001_euros,singles_freestyle,1,,,synthetic
2001_euros,singles_freestyle,2,,,synthetic
"""

PARTICIPANTS = """event_key,discipline_key,placement,participant_order,display_name,person_id,team_person_key,notes
1998_worlds,singles_freestyle,1,1,Ada Lovelace,P0001,,
1998_worlds,singles_freestyle,2,1,Grace Hopper,P0002,,
1998_worlds,open_net,1,1,Alan Turing,P0003,,
1998_worlds,open_net,1,2,Ada Lovelace,P0001,,
2001_euros,singles_freestyle,1,1,Grace Hopper,P0002,,
2001_euros,singles_freestyle,2,1,Karen Sparck Jones,P0004,,
"""

PERSONS = """person_id,person_name,member_id,legacy_user_id,legacy_email,country,first_year,last_year,event_count,placement_count
P0001,Ada Lovelace,,,,United Kingdom,1998,1998,1,2
P0002,Grace Hopper,,,,United States,1998,2001,2,2
P0003,Alan Turing,,,,United Kingdom,1998,1998,1,1
P0004,Karen Sparck Jones,,,,United Kingdom,2001,2001,1,1
"""

INPUTS = {
    "events.csv": EVENTS,
    "event_disciplines.csv": DISCIPLINES,
    "event_results.csv": RESULTS,
    "event_result_participants.csv": PARTICIPANTS,
    "persons.csv": PERSONS,
}


def build_sandbox(tmp_path: Path, omit_inputs: list[str] | None = None) -> Path:
    """Copy the exporter and its imports into a temporary tree with synthetic input.

    `omit_inputs` leaves the named canonical intermediates out, for the
    missing-intermediate cases. Returns the path of the copied exporter.
    """
    omit = set(omit_inputs or [])
    root = tmp_path / "sandbox" / "legacy_data"

    platform = root / "pipeline" / "platform"
    platform.mkdir(parents=True)
    for name in ("export_canonical_platform.py", "output_set.py"):
        shutil.copy2(LEGACY / "pipeline" / "platform" / name, platform / name)

    identity = root / "pipeline" / "identity"
    identity.mkdir(parents=True)
    for name in ("__init__.py", "alias_resolver.py", "person_consolidation.py"):
        shutil.copy2(LEGACY / "pipeline" / "identity" / name, identity / name)

    canonical = root / "out" / "canonical"
    canonical.mkdir(parents=True)
    for name, body in INPUTS.items():
        if name not in omit:
            (canonical / name).write_text(body, encoding="utf-8")

    return platform / "export_canonical_platform.py"


def default_output_dir(script: Path) -> Path:
    """The exporter's own committed target, inside the sandbox."""
    return script.parent.parent.parent / "event_results" / "canonical_input"


def run(script: Path, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    """Run the sandboxed exporter through its real command line."""
    return subprocess.run(
        [sys.executable, str(script), *args],
        capture_output=True,
        text=True,
        cwd=str(cwd or script.parent),
    )


def run_with_failing_writer(script: Path, fail_on_call: int, *args: str):
    """Run the exporter with a fault injected at the writer boundary.

    Only `write_csv` is replaced, and only to raise on the nth call. Argument
    parsing, input reading and the whole transformation chain run for real, which
    is what makes the resulting assertion about publication and cleanup mean
    something.
    """
    runner = script.parent / "_inject_writer_failure.py"
    runner.write_text(
        "import sys\n"
        "from pathlib import Path\n"
        "sys.path.insert(0, str(Path(__file__).resolve().parent))\n"
        "import export_canonical_platform as exporter\n"
        f"_fail_on = {fail_on_call}\n"
        "_real = exporter.write_csv\n"
        "_calls = []\n"
        "def _failing(path, fieldnames, rows):\n"
        "    _calls.append(path)\n"
        "    if len(_calls) == _fail_on:\n"
        "        raise OSError('injected writer failure')\n"
        "    return _real(path, fieldnames, rows)\n"
        "exporter.write_csv = _failing\n"
        "exporter.main()\n",
        encoding="utf-8",
    )
    return subprocess.run(
        [sys.executable, str(runner), *args],
        capture_output=True,
        text=True,
        cwd=str(script.parent),
    )


_REPLACE_INJECTOR = '''import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import os as _real_os
import output_set
import export_canonical_platform as exporter

_fail_calls = {fail_calls}
_calls = []


class _OsProxy:
    """Delegates to the real os module, failing chosen replace calls.

    Only the publication primitive is intercepted, so the real argument parsing,
    input reading, transformation, staging and CSV writing all still run. Call
    numbering spans both publication and rollback, so a later number in the set
    injects a rollback failure.
    """

    def __getattr__(self, name):
        return getattr(_real_os, name)

    def replace(self, src, dst):
        _calls.append((str(src), str(dst)))
        if len(_calls) in _fail_calls:
            raise OSError("injected replace failure")
        return _real_os.replace(src, dst)


output_set.os = _OsProxy()
exporter.main()
'''


_COPY_INJECTOR = '''import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import os as _real_os
import shutil as _real_shutil
import output_set
import export_canonical_platform as exporter

_fail_on = {fail_on}
_copies = []


class _ShutilProxy:
    """Delegates to the real shutil, failing a chosen recovery-copy call."""

    def __getattr__(self, name):
        return getattr(_real_shutil, name)

    def copy2(self, src, dst):
        _copies.append((str(src), str(dst)))
        if len(_copies) == _fail_on:
            raise OSError("injected recovery-copy failure")
        return _real_shutil.copy2(src, dst)


class _OsProxy:
    """Delegates to the real os, announcing any publication replace call.

    Preservation runs before publication, so a preservation failure must produce
    no announcement at all.
    """

    def __getattr__(self, name):
        return getattr(_real_os, name)

    def replace(self, src, dst):
        print("REPLACE-CALLED", src, dst)
        return _real_os.replace(src, dst)


output_set.shutil = _ShutilProxy()
output_set.os = _OsProxy()
exporter.main()
'''


def run_with_failing_copy(script: Path, fail_on_call: int, *args: str):
    """Run the exporter with a fault injected at the recovery-copy boundary.

    Announces every publication replace on stdout so a test can prove none
    happened.
    """
    runner = script.parent / "_inject_copy_failure.py"
    runner.write_text(
        _COPY_INJECTOR.format(fail_on=fail_on_call), encoding="utf-8"
    )
    return subprocess.run(
        [sys.executable, str(runner), *args],
        capture_output=True,
        text=True,
        cwd=str(script.parent),
    )


def run_with_failing_replace(script: Path, fail_on_calls, *args: str):
    """Run the exporter with faults injected at the publication boundary.

    `fail_on_calls` is an int or a collection of 1-based `os.replace` call
    numbers. Numbering continues through rollback, so passing the publication
    failure plus the next call injects a rollback failure as well.
    """
    if isinstance(fail_on_calls, int):
        fail_on_calls = [fail_on_calls]
    runner = script.parent / "_inject_replace_failure.py"
    runner.write_text(
        _REPLACE_INJECTOR.format(fail_calls=repr(set(fail_on_calls))),
        encoding="utf-8",
    )
    return subprocess.run(
        [sys.executable, str(runner), *args],
        capture_output=True,
        text=True,
        cwd=str(script.parent),
    )


SENTINELS = {name: f"SENTINEL-{name}\n" for name in OUTPUT_FILENAMES}


def plant_prior_set(directory: Path) -> None:
    """Put a known, complete prior set in the destination."""
    directory.mkdir(parents=True, exist_ok=True)
    for name, body in SENTINELS.items():
        (directory / name).write_text(body, encoding="utf-8")


def classify_destination(directory: Path) -> str:
    """Report whether the destination holds the old set, a new set, or a mix."""
    present = {n for n in OUTPUT_FILENAMES if (directory / n).is_file()}
    if not present:
        return "empty"
    old = {
        n for n in present
        if (directory / n).read_text(encoding="utf-8") == SENTINELS[n]
    }
    if old == set(OUTPUT_FILENAMES):
        return "complete-old"
    if not old and present == set(OUTPUT_FILENAMES):
        return "complete-new"
    return f"MIXED (old={sorted(old)}, new={sorted(present - old)})"


def staged_leftovers(directory: Path) -> list[Path]:
    """Any staging, recovery or probe artifact the run should have cleaned up."""
    if not directory.is_dir():
        return []
    markers = (".partial-", ".recovery-", "write-probe")
    return sorted(
        p for p in directory.iterdir()
        if p.name.startswith(".") and any(m in p.name for m in markers)
    )


def recovery_leftovers(directory: Path) -> list[Path]:
    """Recovery copies still on disk, which a failed rollback must retain."""
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if ".recovery-" in p.name)
