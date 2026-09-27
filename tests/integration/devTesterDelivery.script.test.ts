/**
 * scripts/lib/dev-tester-delivery.sh — the sealed delivery's one format, written
 * on a holder's machine and read on the newcomer's.
 *
 * The reader never sources the file: it arrives from outside, and a sourced file
 * is a program. So what is pinned here is that the reader takes exactly the keys
 * the writer emits and refuses everything else, and that the recipient tag the
 * two scripts compute is the one age itself writes into a sealed file's header.
 * That last case needs the real age binary and runs wherever it is installed;
 * in CI its absence fails the suite rather than skipping it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';

const LIB = join(process.cwd(), 'scripts/lib/dev-tester-delivery.sh');
const AGE = requireToolInCI('age', '--version');

let dir: string;

beforeEach(() => {
  dir = createScratchDir('delivery-format');
});

afterEach(() => {
  removeScratch(dir);
});

/** Runs a bash snippet with the library sourced, returning status and output. */
function withLib(body: string, env: Record<string, string> = {}) {
  const r = spawnSync('bash', ['-c', `set -u\nsource ${JSON.stringify(LIB)}\n${body}`], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const VALUES: Record<string, string> = {
  TARGET: 'staging',
  ACCOUNT: 'james_leberknight',
  OPERATOR: 'James Leberknight',
  HOST_PASSWORD: 'fixture+one/time=password',
  AWS_ACCESS_KEY_ID: 'AKIAFIXTURE000000001',
  AWS_SECRET_ACCESS_KEY: 'fixture/secret+access=key',
  AWS_ACCOUNT_ID: '000000000000',
  DEV_TESTER_ROLE_ARN: 'arn:aws:iam::000000000000:role/FootbagDevTester',
  STAGING_RUNTIME_ROLE_ARN: 'arn:aws:iam::000000000000:role/footbag-staging-app-runtime',
  HOST_ADDRESS: '203.0.113.10',
  HOST_PORT: '2222',
};
const PINS = ['203.0.113.10 ssh-ed25519 AAAAfixture', '[203.0.113.10]:2222 ssh-ed25519 AAAAfixture'];

function emitScript(overrides: Record<string, string> = {}): string {
  const v = { ...VALUES, ...overrides };
  return [
    ...Object.entries(v).map(([k, val]) => `DELIVERY_${k}=${JSON.stringify(val)}`),
    `DELIVERY_PINS=(${PINS.map((p) => JSON.stringify(p)).join(' ')})`,
    `delivery_bundle_emit > ${JSON.stringify(join(dir, 'bundle'))}`,
  ].join('\n');
}

function parse(bundle: string) {
  const path = join(dir, 'parse-me');
  writeFileSync(path, bundle);
  return withLib(
    `if delivery_bundle_parse ${JSON.stringify(path)}; then
       printf '%s\\n' "$DELIVERY_ACCOUNT" "$DELIVERY_OPERATOR" "$DELIVERY_HOST_PASSWORD" "\${#DELIVERY_PINS[@]}"
     else
       printf 'REFUSED %s\\n' "$DELIVERY_ERROR"; exit 1
     fi`,
  );
}

describe('the delivery format — written and read by the same library', () => {
  it('reads back exactly what it wrote, values taken literally', () => {
    const w = withLib(emitScript());
    expect(w.status, w.stderr).toBe(0);
    const r = parse(readFileSync(join(dir, 'bundle'), 'utf-8'));
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout.split('\n').slice(0, 4)).toEqual([
      'james_leberknight',
      'James Leberknight',
      'fixture+one/time=password',
      '2',
    ]);
  });

  it('refuses to write a value that spans lines, which would forge a second key', () => {
    // Through the environment, so the newline is a real one.
    const script = emitScript().replace(/^DELIVERY_OPERATOR=.*$/m, 'DELIVERY_OPERATOR="$FORGED"');
    const w = withLib(script, { FORGED: 'James\nHOST_PASSWORD=forged' });
    expect(w.status).not.toBe(0);
    expect(w.stderr).toMatch(/OPERATOR is empty or spans lines/);
  });

  it('refuses to write an empty value', () => {
    const w = withLib(emitScript({ AWS_ACCOUNT_ID: '' }));
    expect(w.status).not.toBe(0);
  });

  it('refuses a key it does not know, rather than ignoring or acting on it', () => {
    withLib(emitScript());
    const bundle = readFileSync(join(dir, 'bundle'), 'utf-8') + 'PATH=/tmp/evil\n';
    const r = parse(bundle);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/REFUSED unknown key 'PATH'/);
  });

  it('refuses a key that appears twice', () => {
    withLib(emitScript());
    const bundle = readFileSync(join(dir, 'bundle'), 'utf-8') + 'ACCOUNT=someone_else\n';
    const r = parse(bundle);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/appears twice/);
  });

  it('refuses a bundle missing a key', () => {
    withLib(emitScript());
    const bundle = readFileSync(join(dir, 'bundle'), 'utf-8').replace(/^HOST_PORT=.*\n/m, '');
    const r = parse(bundle);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/'HOST_PORT' is missing/);
  });

  it('refuses a bundle of another format', () => {
    withLib(emitScript());
    const bundle = readFileSync(join(dir, 'bundle'), 'utf-8').replace(/^FORMAT=.*$/m, 'FORMAT=other');
    const r = parse(bundle);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/format 'other'/);
  });

  it('never runs what it reads', () => {
    withLib(emitScript());
    const marker = join(dir, 'ran');
    const bundle = readFileSync(join(dir, 'bundle'), 'utf-8').replace(
      /^OPERATOR=.*$/m,
      `OPERATOR=$(touch ${marker})`,
    );
    const r = parse(bundle);
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[1]).toBe(`$(touch ${marker})`);
    expect(spawnSync('test', ['-e', marker], { ...SPAWN_GUARD }).status).toBe(1);
  });
});

/**
 * A machine missing a tool is stopped before anything changes, with every
 * missing tool named at once and the exact line that installs each, because the
 * person reading it is often on a machine set up before the tool was needed.
 */
describe('the tools the delivery needs, checked before anything changes', () => {
  const MISSING = '/nonexistent/footbag-test-no-such-tool';

  it('says nothing when every tool is present', () => {
    const r = withLib('delivery_require_tools ssh-keygen=ssh-keygen openssl=openssl; echo "rc=$?"');
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).toBe('');
  });

  it('names a missing age with the line that installs it, and says nothing changed', () => {
    const r = withLib(`delivery_require_tools age=${MISSING} openssl=openssl; echo "rc=$?"`);
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/age/);
    expect(r.stderr).toContain('sudo apt install age');
    expect(r.stderr).toMatch(/Nothing was changed on this machine/);
  });

  it('names a missing AWS CLI with its public install page, not the age line', () => {
    const r = withLib(`delivery_require_tools aws=${MISSING}; echo "rc=$?"`);
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html');
    expect(r.stderr).not.toContain('sudo apt install age');
  });

  it('lists every missing tool in one run, not only the first', () => {
    const r = withLib(`delivery_require_tools age=${MISSING} aws=${MISSING} openssl=${MISSING}; echo "rc=$?"`);
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('sudo apt install age');
    expect(r.stderr).toContain('getting-started-install.html');
    expect(r.stderr).toContain('sudo apt install openssl');
  });
});

describe.skipIf(!AGE)('the recipient tag is the one age writes', () => {
  it('matches the header of a file age sealed to the key, and the file opens with the pair', () => {
    const key = join(dir, 'id_ed25519_fixture');
    const kg = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'fixture', '-f', key], {
      ...SPAWN_GUARD,
    });
    expect(kg.status).toBe(0);
    const pub = readFileSync(`${key}.pub`, 'utf-8').trim();
    const plain = join(dir, 'plain');
    writeFileSync(plain, 'FORMAT=probe\n');
    chmodSync(plain, 0o600);
    const sealed = join(dir, 'sealed.age');
    const seal = spawnSync('age', ['-r', pub, '-o', sealed, plain], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(seal.status, seal.stderr).toBe(0);

    const r = withLib(
      `delivery_age_recipient_tag ${JSON.stringify(pub)}; echo; delivery_age_header_tags ${JSON.stringify(sealed)}`,
    );
    const [computed, fromHeader] = r.stdout.split('\n');
    expect(computed).toMatch(/^[A-Za-z0-9+/]{6}$/);
    expect(fromHeader).toBe(computed);

    const open = spawnSync('age', ['-d', '-i', key, sealed], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(open.status, open.stderr).toBe(0);
    expect(open.stdout).toBe('FORMAT=probe\n');
  });
});
