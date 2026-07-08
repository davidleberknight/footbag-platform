"""
Post-cutover refusal for the destructive database-replacing deploy.

At cutover the live database becomes the single source of truth for content, and
the operator records that by appending FOOTBAG_CUTOVER_COMPLETE=1 to
/srv/footbag/env on the host. The guard script
scripts/internal/deploy-rebuild-cutover-guard.sh is prepended ahead of the deploy's
remote half in the root ssh stream, so on a post-cutover host it refuses before
any live mutation. Allowed when the env file is missing (the first-bootstrap
deploy) or carries no marker; refused when the marker line is present; no bypass
flag.

These tests exercise the guard standalone against fixture env files (they never
run a deploy), plus the wiring in scripts/deploy-rebuild.sh: the guard is
readability-checked and is concatenated into the ssh stream ahead of the remote
half, so deleting the wiring cannot pass silently.

Run from repo root:
    python -m pytest legacy_data/tests/test_deploy_rebuild_cutover_guard.py -v
"""
import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GUARD = REPO_ROOT / "scripts" / "internal" / "deploy-rebuild-cutover-guard.sh"
DEPLOY = REPO_ROOT / "scripts" / "deploy-rebuild.sh"


def run_guard(env_path):
    env = dict(os.environ)
    env["ENV_PATH"] = str(env_path)
    return subprocess.run(
        ["bash", str(GUARD)],
        env=env,
        capture_output=True,
        text=True,
    )


def test_allows_when_the_env_file_is_missing(tmp_path):
    # The first-bootstrap deploy runs before any env file exists on the host.
    result = run_guard(tmp_path / "no-such-env")
    assert result.returncode == 0


def test_allows_a_pre_cutover_host(tmp_path):
    env_file = tmp_path / "env"
    env_file.write_text(
        "FOOTBAG_ENV=production\nFOOTBAG_DB_PATH=/srv/footbag/db/footbag.db\n"
    )
    result = run_guard(env_file)
    assert result.returncode == 0


def test_refuses_when_the_marker_is_present(tmp_path):
    env_file = tmp_path / "env"
    env_file.write_text("FOOTBAG_CUTOVER_COMPLETE=1\n")
    result = run_guard(env_file)
    assert result.returncode != 0
    assert "post-cutover" in result.stderr
    assert "no bypass" in result.stderr


def test_refuses_the_marker_among_other_lines(tmp_path):
    env_file = tmp_path / "env"
    env_file.write_text(
        "FOOTBAG_ENV=production\n"
        "FOOTBAG_DB_PATH=/srv/footbag/db/footbag.db\n"
        "FOOTBAG_CUTOVER_COMPLETE=1\n"
        "PUBLIC_BASE_URL=https://example.test\n"
    )
    result = run_guard(env_file)
    assert result.returncode != 0
    assert "post-cutover" in result.stderr


def test_deploy_script_wires_the_guard_ahead_of_the_remote_half():
    # The guard only protects the deploy if the streaming invocation actually
    # prepends it. Compare executable lines (comments mention both filenames).
    deploy = DEPLOY.read_text()
    executable = "\n".join(
        line for line in deploy.splitlines() if not line.lstrip().startswith("#")
    )
    assert 'cat "$CUTOVER_GUARD" "$REMOTE_HALF"' in executable, (
        "deploy-rebuild.sh must prepend the cutover guard to the remote half"
    )
    assert '[[ -r "$CUTOVER_GUARD" ]]' in executable, (
        "deploy-rebuild.sh must readability-check the cutover guard"
    )
