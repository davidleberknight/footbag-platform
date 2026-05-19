# src/dev-shortcuts/

Self-contained subtree for the dev/staging-only admin shortcuts. Exists as one concern so it can be removed in one operation at production cutover.

## Files

- `seedConfig.ts`. Module-load guard plus shared constants for the dev-admin seed (env-var name, file paths, marker literals, password literal). Throws on import outside FOOTBAG_ENV in {development, staging}.
- `seed.ts`. Operator-runnable seed script. Reads JSON entries from the staging env-var or the dev JSONC file, inserts admin members directly. Idempotent. Exit 0 on success or already-marked rows, exit 1 on missing input / malformed JSON / missing DB, exit 2 on conflict (a real member exists at the seeded email).
- `runtime.ts`. The five registration-time and request-time shortcuts (autologin member-id, autologin password-version, register-allowlist bootstrap, skip-claim-email, tier2 invariant repair), plus the boot banner.

## Six shortcuts (umbrella)

| Mechanism | Trigger | Marker (reason_code) | Marker (action_type) |
|---|---|---|---|
| dev autologin | env: `FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID` | none | none |
| dev autologin password-version mirror | env: `FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION` | none | none |
| skip-claim-email | env: `FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL` | none | none |
| dev-admin seed (direct-insert) | flag: `--seed-dev-admins`; file: `.local/dev-admin-seed.json` or env: `FOOTBAG_DEV_ADMIN_SEED_JSON` | `dev_admin_seed.admin_tier2` | `grant_admin_dev_seed` |
| register-allowlist bootstrap | env: `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`; file: `.local/initial-admins.txt` | `dev_admin_register_allowlist.admin_tier2` | `grant_admin_dev_register_allowlist` |
| tier2 invariant repair | env: `FOOTBAG_DEV_ADMIN_GRANT_TIER2` | `dev_admin_invariant_repair` | `dev_admin_invariant_repair` |

All persisted rows from these shortcuts carry `created_by` values under `dev-shortcuts/*`.

## Cutover removal procedure

When production launch is imminent and the SSM-token `/admin/bootstrap-claim` path is ready:

1. `bash scripts/audit-dev-shortcuts.sh` against the production DB. All four prefix counts must return zero.
2. `grep -rn "CUTOVER-REMOVE" src/` to find every callsite. Delete each line plus any block it gates.
3. `git rm -r src/dev-shortcuts/`.
4. `git rm scripts/manage-dev-admin-seed.sh scripts/audit-dev-shortcuts.sh`.
5. Strip the `--seed-dev-admins` branch from `run_dev.sh` and `deploy_to_aws.sh` plus the deploy-chain scripts.
6. Strip the five `FOOTBAG_DEV_*` boot-fail-fast guards from `src/config/env.ts` (autologin member id, autologin password version, skip-claim-email, grant-tier2, initial-admin-emails).
7. Strip the Dockerfile dist-rm rules (no longer needed once the subtree is gone).
8. Delete the dev-admin-seed and register-allowlist regression tests.
9. `npm test && npm run build` should pass with zero references to anything dev-shortcut-related.

## Audit (any environment)

```sh
sqlite3 database/footbag.db "
  SELECT 'reason_code', COUNT(*) FROM member_tier_grants WHERE reason_code LIKE 'dev_admin_%'
  UNION ALL
  SELECT 'action_type', COUNT(*) FROM audit_entries     WHERE action_type LIKE 'grant_admin_dev_%'
  UNION ALL
  SELECT 'invariant_repair', COUNT(*) FROM audit_entries WHERE action_type = 'dev_admin_invariant_repair'
  UNION ALL
  SELECT 'created_by', COUNT(*) FROM member_tier_grants WHERE created_by LIKE 'dev-shortcuts/%';
"
```

All four counts must be zero on the production DB before cutover deploy.
