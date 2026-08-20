import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Vitest configuration for the mutation-testing gate.
 *
 * The mutation runner reads a config file directly rather than going through
 * the `npm test` script, so the three tiers that script filters out on its
 * command line have to be excluded here instead. Without this the mutation run
 * would try to drive real staging AWS (smoke), a real browser (e2e), and the
 * operator dataset (the development crawl) — none of which are available or
 * appropriate under mutation, where every suite is re-run once per surviving
 * mutant.
 *
 * Everything else is inherited, so worker caps, timeouts, setup files, and the
 * temp-artifact sweep behave exactly as they do in an ordinary run.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [
        'tests/smoke/**',
        'tests/e2e/**',
        'tests/dev/**',
        // Two suites assert repository hygiene rather than application
        // behaviour, and neither can run inside a file-copy sandbox: the
        // password-leak check shells out to `git grep`, and the sandbox has no
        // git metadata; the staging-env check reads terraform, which is kept
        // out of the sandbox on purpose because two of its files are symlinks
        // to real secrets that a sandbox copy would dereference and write out.
        // Excluding them removes nothing from the mutation measurement, which
        // is about the application's own guards.
        'tests/integration/personaSeed.passwordLeak.test.ts',
        'tests/integration/verify-host-env.script.test.ts',
      ],
    },
  }),
);
