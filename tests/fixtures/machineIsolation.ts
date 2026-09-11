/**
 * Deny every test the state of the machine it happens to be running on.
 *
 * The companion declaration next to this one does it for AWS credentials. This
 * one does it for the rest of the workstation, and it exists because the same
 * failure repeated on a different input: two suites passed on a maintainer's
 * machine and failed on the runner, one because it reached an operator signing
 * key under the home directory, the other because it read a Terraform values
 * file that git ignores and no clone has. Neither test was wrong about the
 * contract it asserted. Both were satisfied by the filesystem rather than by the
 * code, and no amount of running them locally could have shown that, because the
 * branch where the contract breaks is unreachable on the machine that holds
 * those files.
 *
 * Three surfaces, each with its own reason:
 *
 * `HOME` is where operator credentials live. Several scripts a test spawns
 * default a key or a credential file to a path beneath it, so a test that does
 * not pass its own path silently exercises the maintainer's. Pointed at an empty
 * directory, those defaults resolve to nothing, which is what a runner sees.
 *
 * `FOOTBAG_ENV` is read in more than a hundred places and is coupled to
 * `NODE_ENV`, so a value exported for operator work makes configuration loading
 * throw across much of the suite. Blank is the same as unset to the loader, and
 * the suites that need a value set one themselves after this runs.
 *
 * The two media directories default to gitignored trees inside the checkout, and
 * on a maintainer's machine one of them holds real member media. That makes this
 * more than a parity concern: the rule that no test writes real data currently
 * rests on each media suite remembering to override the default, which is the
 * same per-file arrangement that failed for credentials. Pointed at a throwaway
 * directory by default, forgetting is no longer possible.
 *
 * Spread this into the `env` of every spawn a test makes, alongside the
 * credential declaration.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The throwaway root for one worker. Named with the shared `footbag-test-`
 * prefix so the session sweeper collects it if a worker dies before its own
 * cleanup runs.
 */
export function machineIsolationRoot(workerTag: string): string {
  return join(tmpdir(), `footbag-test-home-${workerTag}`);
}

/**
 * Variables removed rather than blanked. A blank string is still a value: it
 * defeats the `??` and `??=` fallbacks that suites and configuration loaders use
 * to supply their own default, so the suite reads the blank instead of the
 * default and fails on a guard that was never about the machine at all. Absent
 * is what a clean runner actually presents.
 */
export const MACHINE_ENV_TO_CLEAR = ['FOOTBAG_ENV'] as const;

export function noMachineState(root: string): Record<string, string> {
  const home = join(root, 'home');
  const media = join(root, 'media');
  const curatedMedia = join(root, 'curated-media');
  for (const dir of [home, media, curatedMedia]) {
    mkdirSync(dir, { recursive: true });
  }
  return {
    HOME: home,
    FOOTBAG_MEDIA_DIR: media,
    FOOTBAG_CURATED_MEDIA_DIR: curatedMedia,
  };
}
