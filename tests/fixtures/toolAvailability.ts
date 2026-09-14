/**
 * External-tool availability, and what a missing tool is allowed to mean.
 *
 * A handful of suites need a binary the repository does not ship: ffmpeg and
 * ffprobe to encode and measure a real clip, Docker to exercise the deploy
 * wrapper. A developer legitimately may not have them, so those cases are
 * gated with `describe.skipIf` and skipped locally.
 *
 * On the runner that is not allowed. A skipped case reports green having
 * executed nothing, and the whole point of those cases is that they run
 * somewhere. That has happened here: sixteen encoder-gated cases once skipped
 * silently in CI and the suite reported success, which is why the workflow now
 * installs ffmpeg with a comment saying so. Nothing held that true, though —
 * delete the install step and the silence comes back, with no test and no gate
 * objecting.
 *
 * So the rule is: a capability skip is a local convenience and never a CI
 * outcome. `requireToolInCI` makes the suite fail at load when the tool is
 * absent and CI is set, which is the one place the missing provisioning step
 * can still be caught.
 */
import { spawnSync } from 'node:child_process';
import { SPAWN_GUARD } from './spawnGuard';

/** True when the named command answers, which is what `skipIf` reads locally. */
export function toolAvailable(command: string, versionArg = '-version'): boolean {
  return spawnSync(command, [versionArg], { stdio: 'ignore', ...SPAWN_GUARD }).status === 0;
}

/**
 * Probe a tool and refuse to let its absence pass quietly on the runner.
 *
 * Returns availability for the caller's `skipIf`; throws in CI when the tool is
 * missing, so a dropped provisioning step fails the build loudly instead of
 * turning its cases into silent passes.
 */
export function requireToolInCI(command: string, versionArg = '-version'): boolean {
  const available = toolAvailable(command, versionArg);
  if (!available && process.env.CI) {
    throw new Error(
      `${command} is not installed, and this suite's cases need it. ` +
      'Locally they skip; in CI they must run, so the workflow has to provision it. ' +
      'Restore the install step rather than letting these cases report green having executed nothing.',
    );
  }
  return available;
}
