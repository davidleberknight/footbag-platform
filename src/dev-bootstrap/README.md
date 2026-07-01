# src/dev-bootstrap/

Permanent development- and staging-only admin bootstrap: the registration-time
email-allowlist path. It is environment-isolated and excluded from the
production runtime image, exactly like the persona harness in `src/testkit/`;
it is never source-deleted.

The production first-admin mechanism is separate and permanent: the single-shot
SSM-token claim at `/admin/bootstrap-claim`, owned by `adminBootstrapService`.
Dev/staging and production share no env vars and no code paths beyond the shared
tier-grant primitive.

## What it does

A member who registers in development or staging with a normalized login email on
the operator allowlist is granted `is_admin=1` plus a Tier 2 ledger row plus an
audit row (`admin.dev_register_allowlist_grant`) in one transaction, then
completes the normal email-verification step before logging in. This is the
register-through-the-real-flow path: no direct row insert, and the new admin
verifies their email (the SES stub captures the link; read it at `/dev/outbox`)
before the account can log in.

Allowlist source:
- Local dev: the gitignored `.local/initial-admins.txt` file (one email per line;
  `#` starts a comment), read from the process working directory.
- Staging: the `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` env var, which the deploy
  pipeline parses from the same workstation file and writes to `/srv/footbag/env`.

## Files

- `runtime.ts`. `getInitialAdminEmails` (reads the allowlist) and
  `applyDevStagingBootstrapAdmin` (called from `registerMember` after the member
  row is inserted; grants admin + Tier 2 + audit when the email matches).

## Production exclusion (three independent layers)

1. `src/config/env.ts` boot fail-fast: refuses to start a production process when
   `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` is set.
2. Deploy pipeline: refuses to write `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` to a
   production host.
3. Production image: the Docker build strips `dist/dev-bootstrap` and recreates a
   no-op stub, so `applyDevStagingBootstrapAdmin` and `getInitialAdminEmails` are
   inert in production. Because `identityAccessService` statically imports the
   module, the stub is recreated rather than removed so every runtime image boots.

## Audit

Rows from this mechanism carry reason_code
`dev_admin_register_allowlist.admin_tier2` and action_type
`admin.dev_register_allowlist_grant`. `scripts/audit-dev-shortcuts.sh` confirms
zero such rows (and zero persona-harness rows) in a production database.
