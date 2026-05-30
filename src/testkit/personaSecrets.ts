/**
 * Persona-harness secret literal.
 *
 * Lives in src/testkit/ (permanent test scaffolding), kept separate from the
 * removable dev-bootstrap seed constants so the testkit never imports from the
 * dev-bootstrap subtree (dev-bootstrap is deleted at cutover; testkit is not).
 *
 * Module-load guard: throws on import unless FOOTBAG_ENV is 'development' or
 * 'staging', so a production process can never load the persona password
 * literal. The persona seed runner is the only importer, and it runs under a
 * dev/staging env. The harness's non-sensitive detection markers (reason_code,
 * audit action_types, created_by) live in personaFactory.ts, not here, because
 * Vitest imports that module with FOOTBAG_ENV unset and this guard would
 * otherwise throw. The non-sensitive .local extension file path
 * (TEST_PERSONA_DEV_FILE_PATH) lives in seedCli.ts for the same reason: the
 * /dev/personas listing route reaches it via a chain app.ts imports
 * unconditionally, so it must stay outside this guard.
 *
 * Password-leak protection (regression: tests/integration/personaSeed.passwordLeak.test.ts):
 * the literal appears in exactly this one checked-in file; it is argon2-hashed
 * at seed time and is never logged, never networked, never embedded in scripts.
 */

const allowedEnvs = new Set(['development', 'staging']);

if (!allowedEnvs.has(process.env.FOOTBAG_ENV ?? '')) {
  throw new Error(
    `personaSecrets may only be imported in FOOTBAG_ENV in {development, staging}; got '${process.env.FOOTBAG_ENV ?? '<unset>'}'`,
  );
}

/**
 * Fixed password applied to every persona created by the harness seed runner.
 * Argon2-hashed at seed time. Convenience for manual testing, not security.
 */
export const TEST_PERSONA_SEED_PASSWORD_LITERAL = 'test-persona-password';
