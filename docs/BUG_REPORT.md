# Bug Report Guide

This guide is for **invited testers and project contributors** filing bugs against the modernized footbag-platform. It is not for general end-user questions about the legacy footbag.org site or about footbag-as-a-sport. Those belong with the IFPA contact channel.

## Quick start

1. Open [Issues → New issue](https://github.com/davidleberknight/footbag-platform/issues/new/choose).
2. Pick the form that matches your report (see below).
3. Fill in the prompts. Each field is required only when it would help the maintainer reproduce or triage the bug.
4. Submit. The issue lands on the maintainer's triage board automatically.
5. Watch the issue for follow-up questions or for the linked PR that includes the regression test that closes it.

## Which form to pick

The picker offers four templates. Pick the most specific match.

### Bug report

General application bug not covered by the more specific forms. Use this for:

- Pages that render incorrectly or fail to load.
- Forms that reject valid input or accept invalid input.
- Computed values that look wrong.
- Anything else that doesn't fit one of the specific forms.

Fields you'll fill: Summary, Steps to reproduce, Expected behavior, Actual behavior, Environment (local / staging / production), Severity (blocker / major / normal / minor), Area, User role.

### Staging bug

Use this for bugs that reproduce on the staging environment but not locally, or that involve real AWS services (S3, SES, KMS, SSM, CloudFront).

Extra fields beyond the general bug report: Browser and OS (if relevant), Relevant AWS or log signal (with credentials redacted).

### Migration or onboarding bug

Use this for bugs in registration, email verification, legacy account claim, the onboarding wizard, the direct historical-person claim flow, or any dev-shortcut / persona-switch path.

Extra field: Affected flow (dropdown).

### Docs or policy issue

Use this for documentation drift, ambiguous policy text, or IFPA-Board-sensitive proposals (Category B per CONTRIBUTING.md). This is not a bug; it is a doc or policy concern.

Extra fields: Affected file or section, current text, proposed text or direction, governance category, IFPA Board status.

## Severity vocabulary

- **blocker**: blocks an entire flow or breaks production-bound work.
- **major**: significant functionality is broken or wrong; workaround exists or is acceptable.
- **normal**: visible defect; not blocking.
- **minor**: cosmetic, edge-case, or nice-to-have.

Triager may adjust. Pick your best read.

## Privacy guards

**Never** include in a public issue:

- Passwords, tokens, signing material, or any operator credentials.
- Real email addresses, phone numbers, or full names of current footbag-platform members.
- Real email addresses, phone numbers, or full names of historical persons unless they are already published in the legacy archive.
- Screenshots containing member data, identifying details, or operator UI screens with secrets.
- Raw `legacy_data/` archive contents.
- AWS account IDs, ARNs that contain account numbers, or any IAM/KMS material.

If you need to share sensitive material, request the private path in the issue thread. The maintainer will provide direction.

## Security vulnerabilities

**Do not file security vulnerabilities in public issues.** Use the private disclosure path in [SECURITY.md](../SECURITY.md):

- [GitHub private vulnerability reporting](https://github.com/davidleberknight/footbag-platform/security/advisories/new)

## What happens after you submit

1. **Auto-add to board.** Your issue lands on the maintainer's project board with Status = New.
2. **Triage.** The maintainer reviews, sets Status / Area / Environment / Severity / User role on the board, and may ask follow-up questions in the issue thread.
3. **Fix and regression test.** Per the project's testing rules, every bug fix lands with a regression test in the same PR. The PR references your issue with `Closes #N`.
4. **Close.** The issue closes when the PR merges, not before. This guarantees the fix is durable.

If your issue stays in Status = New for more than a few days, ping the maintainer in the issue thread.

## Related

- [.github/ISSUE_TEMPLATE/](../.github/ISSUE_TEMPLATE/): the form YAML files (look here if you want to see the exact prompts before opening a form).
- [CONTRIBUTING.md](../CONTRIBUTING.md): contributor onboarding and governance categories.
- [SECURITY.md](../SECURITY.md): vulnerability reporting.
- [TESTING.md](TESTING.md): the testing rules this tracker relies on (every bug fix lands with a regression test).
