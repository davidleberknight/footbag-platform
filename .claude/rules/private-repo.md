---
paths:
  - "footbag_private_repo/**"
---

# Private operations checkout

Rules for files under the `footbag_private_repo/` symlink (the maintainers'
private operations checkout). Workflow and tracker practice live in the
`tracker-ops` skill; this rule covers touching the files themselves.

- Handovers, plans and evidence files here describe tracker cards second-hand. Before relying
  on what one says about a card, read the card itself, body and every comment, per the
  `tracker-ops` skill's card-reading rule.
- Claude drafts here freely; a human reviews, commits, and pushes. Never run a git
  write in this checkout.
- A gitignored file carrying personal data lives here, never in the public checkout. Where code
  reads it at a fixed public path, move it here, leave a symlink at the old path, say in the
  public ignore file where it now lives, and add a row to this checkout's data inventory.
- No secret values, ever (the vault holds those; point at a vault entry by name).
  Member references follow the redaction rules in this checkout's
  `TRACKER_GUIDE.md`: record id and structural description, never name plus
  contact data.
- Linking is one-way: files here may cite public repo files and commit SHAs; never
  copy this repository's slug, owner, or issue numbers into public committed text.
- Cite the private ops docs here (`AWS_OPERATIONS.md`, `DEVOPS_GUIDE.md`, and
  `VAULT_GOVERNANCE.md`) by section title, never section number. Public text names them
  by filename and marks them private ("DEVOPS_GUIDE.md (private GitHub repo)"); a
  filename is not the slug, owner, or an issue number, so naming one leaks nothing.
  Every line naming one carries the word "private", so a mention never reads as a file
  in the public repository; the harness self-check enforces it.
