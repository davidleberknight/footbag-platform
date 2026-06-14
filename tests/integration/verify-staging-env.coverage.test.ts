/**
 * verify-staging-env.sh ↔ src/config/env.ts coverage drift detection.
 *
 * The script's check matrix must cover every env var that env.ts treats as
 * required in production. Without this gate, adding a new `requireEnv()`
 * call or a "must be set explicitly in production" throw to env.ts would
 * silently leave the script uncovered: a misconfigured staging host would
 * then fail at container boot instead of at pre-deploy verification, and
 * the operator would lose the earlier-failure signal the script provides.
 *
 * Same risk inverted: deleting a check from the script doesn't trip env.ts
 * (which still enforces at boot), but it does erode the script's value as
 * a pre-deploy gate. This test catches that direction by asserting the
 * allowlist (env.ts vars intentionally not in the script) only contains
 * vars env.ts actually still requires.
 *
 * Mechanism: regex-scan both source files, diff, fail on uncovered vars
 * (modulo an explicit allowlist with per-entry rationale).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_TS_PATH = join(process.cwd(), 'src/config/env.ts');
const SCRIPT_PATH = join(process.cwd(), 'scripts/verify-staging-env.sh');

const envTsSource = readFileSync(ENV_TS_PATH, 'utf-8');
const scriptSource = readFileSync(SCRIPT_PATH, 'utf-8');

/**
 * Env vars env.ts requires in production. Extracted from three patterns:
 *
 *   1. `requireEnv('NAME')` — always required at module load.
 *   2. `'NAME ... must be set explicitly in production'` — production fail-fast.
 *   3. `'NAME is required when …'` — conditionally required. In the staging+prod
 *      runtime (JWT_SIGNER=kms, SES_ADAPTER=live, MEDIA_STORAGE_ADAPTER=s3,
 *      SECRETS_ADAPTER=live), the conditions are satisfied and these vars are
 *      effectively required.
 */
function extractRequiredProdEnvVars(src: string): Set<string> {
  const vars = new Set<string>();
  for (const m of src.matchAll(/requireEnv\('([A-Z_]+)'\)/g)) {
    vars.add(m[1]);
  }
  for (const m of src.matchAll(/'([A-Z_]+)[^']*must be set explicitly in production/g)) {
    vars.add(m[1]);
  }
  for (const m of src.matchAll(/'([A-Z_]+) is required when/g)) {
    vars.add(m[1]);
  }
  return vars;
}

/**
 * Env vars the verify script checks. Extracted from:
 *
 *   - check_* helper calls with a literal string arg:
 *     `check_equals "FOO" …`, `check_set "FOO" …`, `check_reachable_at_boot "FOO" …`,
 *     `check_unset "FOO" …`, `check_matches "FOO" …`.
 *   - Direct `HOST_ENV[FOO]` lookups for vars with custom inline guards
 *     (SESSION_SECRET length/changeme check, INTERNAL_EVENT_SECRET dev-default
 *     check, IMAGE_PROCESSOR_URL/VIDEO_PROCESSOR_URL localhost guards).
 */
function extractScriptCheckedVars(src: string): Set<string> {
  const vars = new Set<string>();
  for (const m of src.matchAll(/check_\w+\s+"([A-Z_]+)"/g)) {
    vars.add(m[1]);
  }
  for (const m of src.matchAll(/HOST_ENV\[([A-Z_]+)\]/g)) {
    vars.add(m[1]);
  }
  return vars;
}

/**
 * Env vars in env.ts that are intentionally not in verify-staging-env.sh's
 * check matrix. Add an entry only with a rationale that the next reader can
 * audit. The default expectation is that every required-in-prod env var has
 * a check; allowlist entries are exceptions, not "this would be too much
 * work to add" delays.
 */
const ALLOWLIST: Map<string, string> = new Map([
  // TURNSTILE_SITE_KEY is required only when CAPTCHA_ADAPTER=live, which is
  // production-only. Staging runs the captcha stub (no Turnstile challenge), so
  // the staging env check must not require it; it is verified out-of-band as part
  // of the production-only live-captcha config.
  ['TURNSTILE_SITE_KEY', 'rationale: required only under CAPTCHA_ADAPTER=live (production-only); staging uses the captcha stub'],
]);

describe('verify-staging-env.sh ↔ env.ts coverage drift', () => {
  it('every env.ts production-required variable is checked by verify-staging-env.sh', () => {
    const required = extractRequiredProdEnvVars(envTsSource);
    const checked = extractScriptCheckedVars(scriptSource);

    const uncovered: string[] = [];
    for (const v of required) {
      if (checked.has(v)) continue;
      if (ALLOWLIST.has(v)) continue;
      uncovered.push(v);
    }
    uncovered.sort();

    expect(
      uncovered,
      `env vars required in production by src/config/env.ts but NOT checked by scripts/verify-staging-env.sh: [${uncovered.join(', ')}]. Either add a check to the script, or add the var to the ALLOWLIST in this test with a rationale.`,
    ).toEqual([]);
  });

  it('allowlist is not stale: every allowlisted var is still required-in-prod by env.ts', () => {
    const required = extractRequiredProdEnvVars(envTsSource);
    const stale: string[] = [];
    for (const v of ALLOWLIST.keys()) {
      if (!required.has(v)) {
        stale.push(v);
      }
    }
    stale.sort();

    expect(
      stale,
      `ALLOWLIST entries that are no longer required in production by env.ts: [${stale.join(', ')}]. Remove these allowlist entries.`,
    ).toEqual([]);
  });

  it('regex sanity: extracted env.ts required-in-prod var set is non-trivial', () => {
    // Defense against a future refactor that silently breaks the regex
    // extraction. A required set of size 0 would let drift slip past
    // because there would be no required-vars to diff against.
    const required = extractRequiredProdEnvVars(envTsSource);
    expect(required.size).toBeGreaterThanOrEqual(10);
  });

  it('regex sanity: extracted script-checked var set is non-trivial', () => {
    // Same defense for the script-side extractor.
    const checked = extractScriptCheckedVars(scriptSource);
    expect(checked.size).toBeGreaterThanOrEqual(15);
  });
});
