/**
 * A maintainer's workstation, as far as the dev-and-tester lifecycle can reach
 * it: the directly authenticated identity's AWS key and profile, both runtime
 * chains sourced from it, the shared account's password files for both
 * environments, the pinned host keys, and the alias stanzas.
 *
 * A holder onboards, accepts, offboards and re-onboards themselves on this same
 * machine, so every one of those runs has to leave all of this exactly as it
 * found it. The suites seed it, run, and compare byte for byte. The credentials
 * file carries a section header with a trailing comment on purpose: a reader
 * that does not see such a line as a header deletes the section after it, and
 * on this machine that section is the administrator's key.
 *
 * Nothing in it is a credential: the key id is shaped like one only as far as
 * the file format needs, and every secret is a plain word.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const OPERATOR_SECTION =
  '[footbag-operator] # the administrators\' key; never touched by a named identity\n' +
  'aws_access_key_id = AKIAOPERATOR\n' +
  'aws_secret_access_key = operator-secret\n';

export const OPERATOR_PROFILES =
  '[profile footbag-operator]\n' +
  'region = us-east-1\n' +
  '\n' +
  '[profile footbag-staging-runtime]\n' +
  'role_arn = arn:aws:iam::000000000000:role/footbag-staging-app-runtime\n' +
  'source_profile = footbag-operator\n' +
  '\n' +
  '[profile footbag-production-runtime]\n' +
  'role_arn = arn:aws:iam::000000000000:role/footbag-production-app-runtime\n' +
  'source_profile = footbag-operator\n';

export const ADMIN_STANZAS =
  'Host footbag-staging\n' +
  '  Hostname 203.0.113.10\n' +
  '  Port 2222\n' +
  '  User footbag\n' +
  '  IdentityFile ~/.ssh/id_ed25519\n' +
  '\n' +
  'Host footbag-production\n' +
  '  Hostname 203.0.113.20\n' +
  '  Port 2222\n' +
  '  User footbag\n' +
  '  IdentityFile ~/.ssh/id_ed25519\n';

/** The files this fixture writes, relative to the home directory. */
export const ADMIN_FILES: Record<string, string> = {
  '.aws/credentials': OPERATOR_SECTION,
  '.aws/config': OPERATOR_PROFILES,
  'AWS/AWS_OPERATOR.txt': 'shared-staging-password\n',
  'AWS/AWS_OPERATOR_PRODUCTION.txt': 'shared-production-password\n',
  '.ssh/config': ADMIN_STANZAS,
};

/** Seeds every administrative file under `home`, plus any pin lines given. */
export function seedMaintainerMachine(home: string, pinLines: string[] = []): void {
  for (const [rel, body] of Object.entries(ADMIN_FILES)) {
    const path = join(home, rel);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, body, { mode: 0o600 });
  }
  if (pinLines.length) {
    writeFileSync(join(home, 'AWS', 'footbag_known_hosts'), pinLines.map((l) => `${l}\n`).join(''), { mode: 0o600 });
  }
}

/** Every administrative file as it stands now, for a byte-for-byte comparison later. */
export function snapshotAdminFiles(home: string): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const rel of [...Object.keys(ADMIN_FILES), 'AWS/footbag_known_hosts']) {
    const path = join(home, rel);
    out[rel] = existsSync(path) ? readFileSync(path, 'utf-8') : null;
  }
  return out;
}

/**
 * The administrative sections of a file that a run may legitimately add to: the
 * text must still be there whole and in order, whatever was appended beside it.
 */
export function stillHolds(home: string, rel: string, block: string): boolean {
  return readFileSync(join(home, rel), 'utf-8').includes(block);
}
