# Handoff to David — correct stale member-intake status language in root/deploy scripts

The legacy member-import reconciliation pipeline is complete and smoke-validated:
`run_legacy_members.sh --load` runs the identity reconciliation (Stage A
duplicate-account review, Stage B historical-person link proposals) and the QC
gate read-only, and `--load --apply` snapshots `legacy_members` for rollback,
loads the reconciled members, and applies the proposed `historical_persons.legacy_member_id`
links — each write guarded against production/staging and individually reversible.
A full maintainer-machine apply plus rollback and idempotency re-run passed on the
delivered dump (recorded in `legacy_data/member_data_scripts/SMOKE_SIGNOFF.md`).

Three root/deploy scripts still say the member load is deferred **because the
identity reconciliation is not implemented / not wired yet**. That reason is now
false. The proposed edits below **keep the deferral and its preview-only behavior
unchanged** and only replace the reason: the member load is deferred because a
real member import is a **local maintainer cutover operation** that must not run
as part of an ordinary dev or deploy preview path. These are comment/help-text
edits with no behavior change. All three files are outside the legacy_data lane,
so they are yours to apply; they have been left untouched.

---

## 1. `run_dev.sh` — `--all-data` help (around lines 99–104)

**BEFORE**
```
  --all-data       The --from-csv build PLUS the legacy member-data intake:
                   extract the footbag.org dump into the git-ignored intermediate
                   CSV and validate/preview it. The member LOAD is deferred (the
                   identity reconciliation is not implemented yet), so member data
                   is not applied; a notice says so and the run still succeeds.
```

**AFTER**
```
  --all-data       The --from-csv build PLUS the legacy member-data intake:
                   extract the footbag.org dump into the git-ignored intermediate
                   CSV and validate/preview it. The member LOAD is deferred here by
                   design: a real member import is a local maintainer cutover
                   operation (run_legacy_members.sh --load --apply), not part of an
                   ordinary dev preview, so this build previews only; a notice says
                   so and the run still succeeds.
```

---

## 2. `scripts/deploy-to-aws.sh`

### 2a — `--all-data` help (around lines 57–62)

**BEFORE**
```
  --all-data                   The --from-csv build PLUS the legacy member-data
                               intake: extract the footbag.org dump into the
                               git-ignored intermediate CSV and validate/preview
                               it. The member LOAD is deferred (identity
                               reconciliation not implemented yet), so member
                               data is not applied or deployed; a notice says so.
```

**AFTER**
```
  --all-data                   The --from-csv build PLUS the legacy member-data
                               intake: extract the footbag.org dump into the
                               git-ignored intermediate CSV and validate/preview
                               it. The member LOAD is deferred here by design: a
                               real member import is a local maintainer cutover
                               operation, never a deploy step, so member data is
                               previewed only -- not applied or deployed; a notice
                               says so.
```

### 2b — variable comment (around line 158)

**BEFORE**
```
ALL_DATA="no"        # --from-csv build + legacy member-data intake (member load deferred)
```

**AFTER**
```
ALL_DATA="no"        # --from-csv build + legacy member-data intake (member load preview only; real import is a local maintainer cutover step)
```

### 2c — Step 1 echo (around line 525)

**BEFORE**
```
  echo "==> Step 1 (local DB rebuild + member intake, load deferred): scripts/deploy-local-data.sh --all-data"
```

**AFTER**
```
  echo "==> Step 1 (local DB rebuild + member intake preview; real member load is a separate local cutover step): scripts/deploy-local-data.sh --all-data"
```

---

## 3. `scripts/deploy-local-data.sh`

### 3a — `--all-data` help (around lines 50–56)

**BEFORE**
```
  --all-data      The --from-csv build (no mirror) PLUS the legacy member-data
                  intake: extract the footbag.org dump into the git-ignored
                  intermediate CSV and validate/preview it. The member LOAD is
                  deferred (the identity reconciliation in
                  legacy_data/member_data_scripts/reconcile_legacy_members.py is
                  not implemented yet), so the member data is not applied; a
                  notice says so and the run still succeeds.
```

**AFTER**
```
  --all-data      The --from-csv build (no mirror) PLUS the legacy member-data
                  intake: extract the footbag.org dump into the git-ignored
                  intermediate CSV and validate/preview it. The member LOAD is
                  deferred here by design: a real member import is a local
                  maintainer cutover operation (run_legacy_members.sh --load
                  --apply), not part of an ordinary build, so this build previews
                  only; a notice says so and the run still succeeds.
```

### 3b — intake comment block (around lines 242–247)

**BEFORE**
```
  # The legacy member intake. Extraction needs the dump. This build only previews
  # the load (--load --dry-run): it produces / validates the intermediate CSV but
  # does NOT apply the member data. A full --load runs the identity reconciliation
  # (Stage A duplicate-account review, Stage B historical-person link proposals,
  # the QC gate, and the honors backfill over those proposals); applying the
  # result is a separate, human-approved step that is not wired yet.
```

**AFTER**
```
  # The legacy member intake. Extraction needs the dump. This build only previews
  # the load (--load --dry-run): it produces / validates the intermediate CSV but
  # does NOT apply the member data. A full --load runs the identity reconciliation
  # (Stage A duplicate-account review, Stage B historical-person link proposals,
  # the QC gate, and the honors backfill over those proposals), and --load --apply
  # performs the guarded writes; applying is deliberately NOT run here, because a
  # real member import is a local maintainer cutover operation, not part of a
  # build or deploy path.
```

### 3c — NOTE block (around lines 259–263)

**BEFORE**
```
  echo "NOTE: member data was NOT loaded. This build only previews the intake"
  echo "      (validate + dry-run). A full --load runs the identity reconciliation"
  echo "      and QC gate; applying the member data is a separate, human-approved"
  echo "      step that is not wired yet. --all-data has built the enrichment DB"
  echo "      and the intermediate CSV."
```

**AFTER**
```
  echo "NOTE: member data was NOT loaded. This build only previews the intake"
  echo "      (validate + dry-run). Applying the member data (run_legacy_members.sh"
  echo "      --load --apply) is a separate local maintainer cutover step, run by"
  echo "      hand and never as part of this build. --all-data has built the"
  echo "      enrichment DB and the intermediate CSV."
```

---

## Standing decision to flag: `deploy-to-aws.sh --all-data`

`deploy-to-aws.sh --all-data` currently reaches the real member data only in
**preview** — it delegates to `deploy-local-data.sh --all-data`, which runs
`--load --dry-run` and writes nothing. **That preview-only behavior should stay.**
Now that `--load --apply` exists and works, pointing the deploy at it would be a
one-line change, so this warrants an explicit deploy-safety decision rather than
drifting in over time:

- A deploy must never silently ship real member data. The real import is a
  maintainer-machine cutover step run by hand, with its guards (refuses
  production/staging and `/srv/footbag/`), its pre-write snapshot and rollback
  artifacts, and a human reviewing the reconciliation review CSVs before applying.
- If a future deploy is ever meant to carry applied member data, that should be a
  separate, deliberate feature with its own gate — not an implicit consequence of
  `--all-data`. Until then, the AFTER wording above (preview-only, "never a deploy
  step") is the intended contract.
