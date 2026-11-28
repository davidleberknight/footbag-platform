/**
 * scripts/lib/vendor-secret.sh `ssm_secret_reads_back`: the outcome of every
 * SecureString write. A successful put is not a stored value, so each script
 * that writes a secret reads it back decrypted and accepts only the value it
 * meant to write. Driven against a stand-in CLI answering with a stored value
 * the case chooses; the last group checks each writing script calls it after
 * its put.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const LIB = join(process.cwd(), 'scripts/lib/vendor-secret.sh');
const PARAM = '/footbag/staging/secrets/example';
const VALUE = 'fixture-secret-not-a-real-one';

let dir: string;

beforeEach(() => {
  dir = createScratchDir('ssm-secret-reads-back');
});
afterEach(() => removeScratch(dir));

/** Reads back `stored` (or fails the read when null), as the decrypted value. */
function check(expected: string, stored: string | null) {
  const aws = join(dir, 'aws');
  // The stored value travels in a file, so a multi-line key reaches the
  // stand-in's output exactly, as the CLI's text output carries it.
  const storedFile = join(dir, 'stored');
  if (stored !== null) writeFileSync(storedFile, `${stored}\n`);
  writeFileSync(aws, [
    '#!/usr/bin/env bash',
    `echo "$*" >> ${JSON.stringify(join(dir, 'calls.log'))}`,
    stored === null
      ? 'echo "An error occurred (ParameterNotFound) when calling the GetParameter operation" >&2; exit 254'
      : `cat ${JSON.stringify(storedFile)}`,
  ].join('\n') + '\n');
  chmodSync(aws, 0o755);
  const res = spawnSync('bash', ['-c', [
    `source ${JSON.stringify(LIB)}`,
    `VENDOR_SECRET_AWS_BIN=${JSON.stringify(aws)}`,
    `if ssm_secret_reads_back ${JSON.stringify(PARAM)} "$EXPECTED" --profile fixture; then echo OK; else echo "FAILED: $VENDOR_SECRET_ERROR"; fi`,
  ].join('\n')], {
    encoding: 'utf8',
    env: { ...process.env, ...NO_AWS_CREDENTIALS, EXPECTED: expected },
    ...SPAWN_GUARD,
  });
  return { out: `${res.stdout ?? ''}${res.stderr ?? ''}`, calls: readFileSync(join(dir, 'calls.log'), 'utf8') };
}

describe('ssm_secret_reads_back', () => {
  it('accepts a parameter that reads back as the value written, asking for it decrypted', () => {
    const r = check(VALUE, VALUE);
    expect(r.out).toContain('OK');
    expect(r.calls).toContain(`ssm get-parameter --name ${PARAM} --with-decryption --query Parameter.Value --output text --profile fixture`);
  });

  it('refuses a parameter holding another value, naming the parameter and not the value', () => {
    // Defect caught: a put that exited 0 while the parameter kept its old
    // value read as stored, and the operator handed out a key nothing holds.
    const r = check(VALUE, 'some-older-value');
    expect(r.out).toContain(`FAILED: ${PARAM} reads back as something other than what was written`);
    expect(r.out).not.toContain(VALUE);
  });

  it('refuses a parameter still on the Terraform placeholder', () => {
    const r = check(VALUE, 'TODO-set-via-cli-after-apply');
    expect(r.out).toContain(`FAILED: ${PARAM} still holds the Terraform placeholder after the write`);
  });

  it('accepts the placeholder when the placeholder is what was written, as a reset does', () => {
    // Defect caught: a deliberate reset to the placeholder read as a failed
    // write, so deactivating payments could never report done.
    expect(check('TODO-set-via-cli-after-apply', 'TODO-set-via-cli-after-apply').out).toContain('OK');
  });

  it('refuses when the value cannot be read back', () => {
    const r = check(VALUE, null);
    expect(r.out).toContain(`FAILED: wrote ${PARAM} but could not read it back to confirm`);
  });

  it('agrees with a key file whose last line ends in a newline', () => {
    // Defect caught: a PEM key file's trailing newline, which the CLI's text
    // output does not keep, read as a different value and failed every store.
    const key = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
    const file = join(dir, 'key.pem');
    writeFileSync(file, `${key}\n`);
    expect(check(readFileSync(file, 'utf8').replace(/\n+$/, ''), key).out).toContain('OK');
  });
});

describe('every script that writes a secret reads it back after the put', () => {
  // Defect caught: a write reported "stored" on the put's exit status alone.
  // These two scripts' writes are not driven end to end by their own suites,
  // so the order is checked in the source: the put, then the read-back, then
  // the success line.
  const cases: Array<[string, RegExp, RegExp]> = [
    ['scripts/provision-archive-signing-key.sh', /aws ssm put-parameter/, /echo "Stored the private key/],
    ['scripts/activate-payments.sh', /if ! aws ssm put-parameter/, /echo " {2}stored \$param_name/],
  ];
  it.each(cases)('%s', (file, put, said) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    const p = src.search(put);
    const r = src.indexOf('ssm_secret_reads_back', p);
    const s = src.search(said);
    expect(p, 'the put').toBeGreaterThan(-1);
    expect(r, 'no read-back after the put').toBeGreaterThan(p);
    expect(s, 'the success line comes before the read-back').toBeGreaterThan(r);
    expect(src).toContain('source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/vendor-secret.sh"');
  });
});
