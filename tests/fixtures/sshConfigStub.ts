/**
 * A stand-in for `ssh -G`, which is how the operator scripts learn what account
 * an alias connects as.
 *
 * That account is not decoration. It selects which of the four credential files
 * a run reads, so on a machine with a real ~/.ssh/config it would decide the
 * verdict of every test that touches a credential, and the branch for the other
 * account would be unreachable on the machine that happens to hold the config.
 * Supplying it here is what makes both branches reachable everywhere.
 *
 * The stub answers the configuration query and refuses everything else. A
 * connection attempt exits non-zero with a message naming this file, because a
 * suite that appears to reach a host has proved nothing about one.
 */
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STUB = `#!/usr/bin/env bash
# Answers 'ssh -G <alias>' with the account under test, and nothing else.
if [[ "\${1:-}" == "-G" ]]; then
  if [[ -n "\${FAKE_SSH_USER-footbag}" ]]; then
    printf 'user %s\\n' "\${FAKE_SSH_USER-footbag}"
  fi
  printf 'hostname 203.0.113.10\\n'
  printf 'port 2222\\n'
  exit 0
fi
echo "stand-in ssh: refusing to open a connection from a test" >&2
exit 255
`;

let cached: string | undefined;

/**
 * The directory holding the stub, created once per test process. Suites that
 * already own a throwaway directory can pass one; otherwise a fresh one is made
 * and left to the operating system, as it holds nothing but this script.
 */
export function sshStubDir(parent?: string): string {
  if (!parent && cached) return cached;
  const base = parent ?? mkdtempSync(join(tmpdir(), 'footbag-test-sshstub-'));
  const dir = join(base, 'stubbin');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'ssh');
  writeFileSync(path, STUB, 'utf-8');
  chmodSync(path, 0o755);
  if (!parent) cached = dir;
  return dir;
}

/**
 * Environment that makes every `ssh -G` in the run report `user`. Pass the empty
 * string for an alias that resolves to no account at all, which is what an
 * unparseable configuration looks like from the caller's side.
 */
export function connectingAs(user: string, parent?: string): NodeJS.ProcessEnv {
  return {
    PATH: `${sshStubDir(parent)}:${process.env.PATH ?? ''}`,
    FAKE_SSH_USER: user,
  };
}

/** The shared host account, spelled once so a suite never has to guess it. */
export const SHARED_ACCOUNT = 'footbag';

/** A named operator account, which is any account that is not the shared one. */
export const NAMED_ACCOUNT = 'ada_lovelace';
