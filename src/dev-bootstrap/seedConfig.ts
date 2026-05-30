/**
 * Constants shared by the dev-admin-seed script and its tests.
 *
 * Module-load guard: this file throws on import in production, so a
 * misconfigured production process can never load the seed literals. Dev
 * and staging both load cleanly; the seed script decides what to do with
 * the input (file-path on dev, env-var on staging).
 *
 * Detection markers (grep-able evidence that a row originated from a
 * dev-admin seed; must be 0-count before any production deploy):
 *   - `member_tier_grants.reason_code = 'dev_admin_seed.admin_tier2'`
 *   - `audit_entries.action_type      = 'grant_admin_dev_seed'`
 *   - `member_tier_grants.created_by  = 'dev-shortcuts/seed'`
 *
 * Persona-harness detection markers (same zero-residue contract):
 *   - `member_tier_grants.reason_code = 'dev_persona_seed.tier_grant'`
 *   - `audit_entries.action_type      = 'dev_persona_seed'`     (seed)
 *   - `audit_entries.action_type      = 'dev_switch_persona'`   (cookie issuance)
 *   - file-path prefix `src/testkit/persona*`
 *
 * The fixed password literal below is hard-coded for dev/staging
 * convenience. Each seed run applies it via argon2 at seed time.
 */

const allowedEnvs = new Set(['development', 'staging']);

if (!allowedEnvs.has(process.env.FOOTBAG_ENV ?? '')) {
  throw new Error(
    `seedConfig may only be imported in FOOTBAG_ENV in {development, staging}; got '${process.env.FOOTBAG_ENV ?? '<unset>'}'`,
  );
}

/**
 * Fixed password applied to every account created by the dev-admin seed.
 * Argon2-hashed at seed time. Identical across dev and staging seeds; the
 * intent is convenience for manual testing, not real-account security.
 *
 * Password-leak protection invariants (regression test:
 * tests/integration/devAdminSeed.passwordLeak.test.ts):
 *
 *   1. The plaintext literal exists in exactly ONE checked-in code file:
 *      this one. No deploy script, seed script, or other source file may
 *      inline it (enforced by the regression test).
 *   2. The literal is never logged. The seed script emits loginEmail /
 *      outcome counts / env diagnostic only — never the password and
 *      never the argon2 hash.
 *   3. The literal never crosses the network. The staging transport
 *      env-var FOOTBAG_DEV_ADMIN_SEED_JSON carries only the JSON array
 *      of {loginEmail, displayName, realName, tier?} — no password.
 *      Hashing happens inside the staging container at exec time.
 *   4. The literal cannot be loaded under FOOTBAG_ENV=production: the
 *      module-import guard above throws.
 *   5. The bash-side env guards (manage-dev-admin-seed.sh,
 *      deploy_to_aws.sh --seed-dev-admins) refuse to invoke the seed
 *      under production-named targets.
 */
export const DEV_ADMIN_SEED_PASSWORD_LITERAL = 'dev-admin-seed-password';

export const DEV_ADMIN_SEED_REASON_CODE = 'dev_admin_seed.admin_tier2';
export const DEV_ADMIN_SEED_REASON_TEXT =
  'DEV-ADMIN SEED. Not a real tier purchase. Remove before any production deploy.';
export const DEV_ADMIN_SEED_AUDIT_ACTION_TYPE = 'grant_admin_dev_seed';
export const DEV_ADMIN_SEED_CREATED_BY = 'dev-shortcuts/seed';

/**
 * Env-var carrying the compact-JSON seed input on staging. The deploy
 * pipeline reads `.local/staging-admin-seed.json`, runs it through `jq -c`,
 * and pipes the result through the SSH cat-pipe. The seed script reads
 * this env-var first; if unset, it falls back to the dev file path below.
 */
export const DEV_ADMIN_SEED_ENV_VAR_NAME = 'FOOTBAG_DEV_ADMIN_SEED_JSON';

/**
 * Repo-root-relative path to the per-maintainer, gitignored dev seed
 * file. Used only when the env-var path is empty. The file is JSONC: the
 * parser strips `//` line comments before JSON.parse.
 */
export const DEV_ADMIN_SEED_DEV_FILE_PATH = '.local/dev-admin-seed.json';

/**
 * Repo-root-relative path to the staging seed file, read on the
 * workstation at deploy time, transported to staging via the SSH
 * cat-pipe. Never read by the seed script directly: by then the content
 * is in the env-var.
 */
export const DEV_ADMIN_SEED_STAGING_FILE_PATH = '.local/staging-admin-seed.json';
