# src/dev-bootstrap/

Self-contained subtree for the **temporary** dev/staging-only admin bootstrap
stand-ins: code that exists only because a production feature is not built yet.
The whole subtree is removed in one operation at production cutover, when its
production replacement (the SSM-token `/admin/bootstrap-claim` first-admin flow,
the always-enforced admin↔Tier 2 invariant) lands.

**Not here:** the persona / test-data harness is **permanent test infrastructure**
and lives in `src/testkit/` (row builders, persona factory, canonical catalog,
seed runner, `/dev/switch` + `/dev/personas` routes, `personaSecrets`). It is
env-gated to development and staging and excluded from the production image at
build time, but it is **never source-deleted** and is not part of this cutover
procedure. `src/testkit/` must never import from `src/dev-bootstrap/`.

## Files

- `seedConfig.ts`. Module-load guard plus shared constants for the dev-admin seed (env-var name, file paths, marker literals, password literal). Throws on import outside FOOTBAG_ENV in {development, staging}.
- `seed.ts`. Operator-runnable dev-admin seed script. Reads JSON entries from the staging env-var or the dev JSONC file, inserts admin members directly. Idempotent. Exit 0 on success or already-marked rows, exit 1 on missing input / malformed JSON / missing DB, exit 2 on conflict (a real member exists at the seeded email).
- `runtime.ts`. The registration-time and request-time bootstrap conveniences (register-allowlist bootstrap, tier2 invariant repair), plus the boot banner.

## Bootstrap conveniences (removable at cutover)

| Mechanism | Trigger | Marker (reason_code) | Marker (action_type) |
|---|---|---|---|
| dev-admin seed (direct-insert) | flag: `--seed-dev-admins`; file: `.local/dev-admin-seed.json` or env: `FOOTBAG_DEV_ADMIN_SEED_JSON` | `dev_admin_seed.admin_tier2` | `admin.dev_seed_grant` |
| register-allowlist bootstrap | env: `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`; file: `.local/initial-admins.txt` | `dev_admin_register_allowlist.admin_tier2` | `admin.dev_register_allowlist_grant` |
| tier2 invariant repair | env: `FOOTBAG_DEV_ADMIN_GRANT_TIER2` | `dev_admin_invariant_repair` | `admin.dev_invariant_repair` |

All persisted rows from these mechanisms carry `created_by` values under the
historical `dev-shortcuts/*` namespace (kept stable so the cutover audit and
existing tests keep matching). The permanent persona harness in `src/testkit/`
uses the parallel `dev_persona_seed.tier_grant` reason_code and `testkit.persona_*` action_type markers and
`created_by 'dev-shortcuts/personas'`; the audit below covers both so any prod DB
shows zero residue.

## Cutover removal procedure

When production launch is imminent and the SSM-token `/admin/bootstrap-claim` path is ready:

1. `bash scripts/audit-dev-shortcuts.sh` against the production DB. All prefix counts must return zero.
2. `grep -rn "CUTOVER-REMOVE" src/` to find every callsite. Delete each line plus any block it gates.
3. `git rm -r src/dev-bootstrap/`. (Do NOT touch `src/testkit/`; the persona harness is permanent.)
4. `git rm scripts/manage-dev-admin-seed.sh scripts/audit-dev-shortcuts.sh`.
5. Strip the `--seed-dev-admins` branch from `run_dev.sh` and `deploy_to_aws.sh` plus the deploy-chain scripts.
6. Strip the `FOOTBAG_DEV_*` boot-fail-fast guards from `src/config/env.ts` (grant-tier2, initial-admin-emails).
7. Update the Dockerfile dist-rm rules to drop `dist/dev-bootstrap` (keep the `dist/testkit` strip; the harness stays prod-excluded by build).
8. Delete the dev-admin-seed and register-allowlist regression tests (keep the persona-harness tests).
9. `npm test && npm run build` should pass with zero references to anything dev-bootstrap-related.

## Audit (any environment)

```sh
sqlite3 database/footbag.db "
  SELECT 'reason_code', COUNT(*) FROM member_tier_grants WHERE reason_code LIKE 'dev_admin_%'
  UNION ALL
  SELECT 'action_type', COUNT(*) FROM audit_entries     WHERE action_type LIKE 'admin.dev_%_grant'
  UNION ALL
  SELECT 'invariant_repair', COUNT(*) FROM audit_entries WHERE action_type = 'admin.dev_invariant_repair'
  UNION ALL
  SELECT 'created_by', COUNT(*) FROM member_tier_grants WHERE created_by LIKE 'dev-shortcuts/%'
  UNION ALL
  SELECT 'persona_reason', COUNT(*) FROM member_tier_grants WHERE reason_code = 'dev_persona_seed.tier_grant'
  UNION ALL
  SELECT 'persona_action', COUNT(*) FROM audit_entries WHERE action_type IN ('testkit.persona_seed','testkit.persona_switch');
"
```

All counts must be zero on the production DB before cutover deploy.
