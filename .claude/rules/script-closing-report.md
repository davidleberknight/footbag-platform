---
paths:
  - "scripts/**"
  - "deploy_to_aws.sh"
  - "run_dev.sh"
  - "run_all_tests.sh"
  - "legacy_data/*.sh"
  - "freestyle/*.sh"
---

# Script closing report

Every script a person or a runner invokes ends with one closing report that states every error
and warning the run met, and its exit status follows from them: non-zero when any is an error,
zero otherwise with the warnings still listed. A problem shown mid-stream and then followed by
success is a failed check.

- Collect, never drop: what the script finds itself, every tolerated failure with the tool's own
  message, and what the tools it runs print — a package manager's scriptlet errors and warnings,
  a service's error lines since the run began, a remote half's errors. Output streamed to the
  terminal and never harvested is a dropped problem.
- A step whose failure is expected is reported as a warning with its message, never swallowed
  with `|| true`, `2>/dev/null` or an "expected" echo.
- The closing line names what was proven and what was not; it never claims an outcome nothing
  checked.
- A remote half reports its problems to its caller, which lists them in its own report. The
  caller sends `scripts/lib/closing-report-remote.sh` on the stream after the password line and
  the `%q` values, ahead of the half; the half reports with `crr_error` and `crr_warn` and ends
  with `crr_finish`. A stdout contract (KEY=VALUE lines, a boot id) is read only from output the
  marked lines cannot interleave with.
- A script that runs another script on the library gets the child's problems in its own report
  (`FOOTBAG_CR_REPORT_TO`). A child that needs the terminal runs directly, never inside `cr_run`;
  hand off with a child call, never `exec`, which skips the report. A check that only decides a
  step's state runs with `FOOTBAG_CR_REPORT_TO` pointed at a private file, so its failure is the
  step's state and not the caller's error (`bh_probe_report` in
  `scripts/internal/bootstrap-host-steps.sh`).
- A script on the library sets no EXIT, INT, TERM or HUP trap of its own: it registers cleanup
  with `cr_cleanup`, an interrupt-only undo reads `cr_exit_status`, and a deliberate non-zero end
  that is not an error, such as a pending status a caller branches on, uses
  `cr_finish_with <status> <word>`. `cr_error` records and does not exit; a refusal still exits.
- Tolerate only the failure a tool documents: `|| [[ $? == 1 ]]` for grep or diff, never `|| true`.
- `cr_run` and `cr_tolerate` keep the command's whole output on disk while the run lasts, so a
  command whose output can carry a secret never goes through them; it goes through
  `cr_run_marked` or `cr_tolerate_marked`, which keep only the marked lines
  (`.claude/rules/script-secret-safety.md`).
- The mechanism is `scripts/lib/closing-report.sh` (and `closing-report-remote.sh` for a remote
  half); the conventions gate (`scripts/ci/check_closing_report.sh`) refuses an in-scope script
  that does not use it, against a baseline that only shrinks: a script moved onto the library has
  its baseline line deleted in the same change.
- Sourced libraries and sourced pieces (first line `# shellcheck shell=bash`), and CI gates whose
  single verdict line is their whole output, are exempt. A runbook verdict script whose single
  verdict line already decides its exit may stay on the baseline.
