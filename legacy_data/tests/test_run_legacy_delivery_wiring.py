"""
test_run_legacy_delivery_wiring.py
==================================

Wiring contract for run_legacy_delivery.sh, the one command that processes a
legacy webmaster delivery. Proven from the script text rather than by running it,
because every step reads the real private checkout and the real legacy clone and
the build replaces the development database:

  * the steps run in their only correct order: refresh, refresh again with a
    byte-for-byte comparison, publish, the database-free audit, the member-load
    rehearsal with the final-load gate, the ruling re-fit check;
  * the cutover date is required, never defaulted;
  * it writes no decision and touches no repository: no git write, no re-fit
    apply, no deploy.

Run from repo root:
    python -m pytest legacy_data/tests/test_run_legacy_delivery_wiring.py -v
"""
import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "scripts" / "run_legacy_delivery.sh"
TEXT = SCRIPT.read_text()
CODE = "\n".join(line for line in TEXT.splitlines() if not line.lstrip().startswith("#"))


def test_the_steps_run_in_their_only_correct_order():
    # Out of order, a build loads the previous delivery's members or stale rulings.
    first = CODE.index('cr_run "refresh"')
    second = CODE.index('cr_run "second refresh"')
    compare = CODE.index("cmp -s")
    publish = CODE.index("publish_legacy_repo_data.py")
    audit = CODE.index("audit_member_data.py --pre-build")
    build = CODE.index("deploy-local-data.sh --all-data --apply-members --final-load")
    refit = CODE.index("refit_rulings.py")
    assert first < second < compare < publish < audit < build < refit


def test_the_rehearsal_runs_the_final_load_gate():
    # Without it a membership-only person left undecided passes the rehearsal and
    # stops the cutover load instead.
    assert "--final-load" in CODE[CODE.index("deploy-local-data.sh"):]


def test_a_non_repeatable_refresh_and_a_failed_pre_build_audit_stop_the_run():
    # A refresh that changes on a second run, or stale figures, must never reach
    # the build that replaces the database.
    after_cmp = CODE[CODE.index("cmp -s"):CODE.index("publish_legacy_repo_data.py")]
    assert "cr_die" in after_cmp
    after_audit = CODE[CODE.index("audit_member_data.py --pre-build"):CODE.index("deploy-local-data.sh")]
    assert "cr_die" in after_audit


def test_it_writes_no_decision_and_touches_no_repository():
    # Commits, re-fit applies and deploys are a person's; a script that did them
    # would record decisions nobody made. Git is used only to read: to compare the
    # export with what is committed and to keep the committed findings report.
    for pattern in (r"deploy_to_aws", r"sed -i"):
        assert not re.search(pattern, CODE), pattern
    for verb in re.findall(r"git -C \"\$\{PRIV\}\" (\S+)", CODE):
        assert verb in {"diff", "cat-file", "show"}, verb


def test_a_rerun_over_a_committed_delivery_keeps_its_findings_report():
    # Rewritten against the committed delivery, the report says nothing changed and
    # erases the record of what the delivery changed.
    keep = CODE[CODE.index("git -C \"${PRIV}\" diff --quiet"):CODE.index("==> 2. publish")]
    assert "REFRESH_REPORT.md" in CODE and "REFRESH_REPORT_DETAIL.tsv" in CODE
    assert keep.count('git -C "${PRIV}" show "HEAD:') == 2
    assert CODE.index('cr_run "second refresh"') < CODE.index('git -C "${PRIV}" diff --quiet')
    invocations = [ln for ln in CODE.splitlines() if '"${PY}"' in ln and "refit_rulings.py" in ln]
    assert invocations, "the re-fit check must run"
    assert all("--apply" not in ln for ln in invocations)


def test_the_build_step_reads_a_zero_violation_count_as_a_pass_and_failures_as_errors():
    # The build prints "violations: 0" when its gates pass; read as an error, it
    # failed every clean rehearsal, and a run that cries wolf teaches nobody to read it.
    line = next(ln for ln in TEXT.splitlines() if ln.startswith("BUILD_ERRORS="))
    probe = (f'source "{REPO_ROOT}/scripts/lib/closing-report.sh" >/dev/null 2>&1; {line}; '
             'printf "%s\\n" "$BUILD_ERRORS"')
    r = subprocess.run(["bash", "-c", probe], capture_output=True, text=True, timeout=60)
    pattern = r.stdout.strip()
    assert pattern

    def is_error(sample: str) -> bool:
        return subprocess.run(["grep", "-qE", pattern], input=sample, text=True,
                              timeout=60).returncode == 0

    assert not is_error("  violations: 0\n")
    assert is_error("  violations: 3\n")
    assert is_error("ERROR legacy chain: the publish stamp is missing\n")
    assert is_error("FAIL membership-only cohort: 20 drafted\n")


def test_the_cutover_date_is_required(tmp_path):
    # A defaulted date measures annual memberships against the run day, which
    # changes every time the publish is rebuilt.
    r = subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, timeout=60,
                       cwd=str(tmp_path))
    assert r.returncode == 2 and "--cutover-date YYYY-MM-DD is required" in r.stderr
