---
name: check-vulnerabilities
description: Use when the maintainer asks which pinned versions carry a known flaw ("run the vulnerability report", "is anything we pin exploited", "check for CVEs"). Runs the on-request vulnerability report, reads the vendor's own advisory page for any pinned tool no advisory database covers, judges which findings apply, and recommends one set of bumps, most urgent first, for /patch-versions. Never runs on a schedule and never bumps anything itself.
disable-model-invocation: true
---

# Check vulnerabilities

The maintainer decides when to patch; this runs only when asked, and it changes nothing. The
policy is the System Administrator patching story and the patch management section in
DEVOPS_GUIDE.md (private GitHub repo), and the Security Patching design decision; read the story
first, through the `footbag_private_repo/` link. Patching is best effort with no hard deadline:
this skill produces an order of urgency and may recommend when to move each pin, as advice the
maintainer weighs, never a limit.

## Procedure

1. Run the report: `bash scripts/check-vulnerabilities.sh`, in the background with its output in
   the scratchpad. Add `--target staging` or `--target production` (one host per run, with that
   host's operator credential on standard input, as its usage header says) only when the
   maintainer asks for a host's packages too. Read its closing
   report first: every feed or scan it could not reach is a gap, and say so rather than reading
   an empty table as clean.
2. For every pinned tool the report lists as covered by no advisory database, read the vendor's
   own page live: sqlite.org/cves.html for sqlite3, and the GitHub security advisories of jq, age
   and the AWS CLI. Name the page and the date read beside each result.
3. Judge applicability for each finding: whether the flawed code path is one this project runs
   (a dev-only dependency, a feature never enabled, a binary that never reaches a host). Say why
   in one line each, citing the advisory; never drop a finding without that line.
4. Recommend one set of bumps, most urgent first: a flaw CISA lists as known exploited on a
   publicly exposed system ahead of everything; then other known-exploited flaws; then by EPSS and
   severity. Give each its target version, a recommended time to move it, the owning script that
   moves it, and whether it moves a host pin (which means a host step on staging and then
   production). The maintainer picks.
5. Hand the picked set to `/patch-versions`.

## Stop when

The maintainer has the ranked findings, every gap the report or the vendor pages left, one
recommended bump set, and nothing has been changed.
