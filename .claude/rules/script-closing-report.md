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
- A remote half reports its problems to its caller, which lists them in its own report.
- Sourced libraries, and CI gates whose single verdict line is their whole output, are exempt.
