---
paths:
  - "footbag_private_repo/**"
---

# Private operations checkout

Rules for files under the `footbag_private_repo/` symlink (the maintainers'
private operations checkout). Workflow and tracker practice live in the
`tracker-ops` skill; this rule covers touching the files themselves.

- Claude drafts here freely; a human reviews, commits, and pushes. Never run a git
  write in this checkout.
- No secret values, ever (the vault holds those; point at a vault entry by name).
  Member references follow the redaction rules in this checkout's
  `TRACKER_GUIDE.md`: record id and structural description, never name plus
  contact data.
- Linking is one-way: files here may cite public repo files and commit SHAs; never
  copy this repository's slug, owner, or issue numbers into public committed text.
- Cite the ops docs here (`AWS_OPERATIONS.md`, the operations guide,
  `VAULT_GOVERNANCE.md`) by section title, never section number.
