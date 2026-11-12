---
name: check-vulnerabilities
description: Use when the maintainer asks which pinned versions carry a known flaw ("run the vulnerability report", "is anything we pin exploited", "check for CVEs"). Runs the on-request vulnerability report, reads the vendor's own advisory page for any pinned tool no advisory database covers, judges which findings apply, dismisses in GitHub the alerts it verifies are false alarms for this repository, and recommends one set of bumps, most urgent first, for /patch-versions. Never runs on a schedule and never bumps anything itself.
disable-model-invocation: true
---

# Check vulnerabilities

The maintainer decides when to patch; this runs only when asked. It moves no pin; its one write
is dismissing, in GitHub, an alert it has verified is a false alarm for this repository. The
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
   an empty table as clean. Then list the repository's open Dependabot and code-scanning alerts
   (`gh api --paginate "repos/<owner>/<repo>/dependabot/alerts?state=open&per_page=100"`, and the
   same under `code-scanning`), and add every alert the report lacks as a finding of its own.
2. For every pinned tool the report lists as covered by no advisory database, read the vendor's
   own page live: sqlite.org/cves.html for sqlite3, and the GitHub security advisories of jq, age
   and the AWS CLI. Name the page and the date read beside each result.
3. Verify, for each finding, whether it is a false alarm for this repository: read what the
   advisory needs to be exploited (the code path, the option, the input) and the code here that
   would reach it, and cite the file and line either way. It is a false alarm only when that shows
   the path is never reached here (a dev-only dependency that never reaches a host, a retiring
   data-load manifest, an option never set, an input that cannot arrive); otherwise it is real.
   Never drop a finding without that line.
4. Dismiss every verified false alarm that carries a GitHub alert, in the same run: write the plan
   (the alert number, a reason GitHub accepts for its kind, and the step 3 line as the comment, at
   most 280 characters) to the scratchpad, show it, and run `bash scripts/dismiss-github-alerts.sh
   --kind <dependabot|code-scanning> --repo <owner/name> --plan <file> --yes`. A false alarm with
   no GitHub alert (a pinned tool, an image) is stated in the report.
5. Recommend one set of bumps for the real findings, most urgent first: a flaw CISA lists as known
   exploited on a publicly exposed system ahead of everything; then other known-exploited flaws;
   then by EPSS and severity. Give each package, transitive ones included, the lowest release that
   clears every one of its open advisories (never one advisory's fix), how it moves (a direct pin,
   an override, a lockfile refresh within its parent's range, or a parent bump), a recommended
   time to move it, the owning script that moves it, and whether it moves a host pin (which means
   a host step on staging and then production). The maintainer picks.
6. Hand the picked set to `/patch-versions`.

## Stop when

The maintainer has the ranked findings, every gap the report or the vendor pages left, one
recommended bump set for the real ones, every verified false alarm dismissed and read back, and
no pin moved.
