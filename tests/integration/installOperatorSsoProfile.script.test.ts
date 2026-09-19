/**
 * scripts/install-operator-sso-profile.sh — writing the federated sign-in
 * profile onto a workstation.
 *
 * The contract worth pinning is the refusal. A static access key and a sign-in
 * session cannot share one profile name: the SDK prefers the key and says
 * nothing about doing so, so a federated profile written over a key is present,
 * correct and never once used, while every command keeps going out on the
 * long-lived credential and reports success. Nothing downstream can notice,
 * because from the outside a successful call is a successful call. So the cases
 * below put a key under that name in each of the two files a key may live in
 * and require the run to stop.
 *
 * The rest is the stanza itself. The step this script replaces was an operator
 * answering six questions by hand, four of which have one right answer nobody
 * can guess, so the shape of what lands in the config file is the other half of
 * the contract: the session block the profile points at, the account, the
 * permission set, and the profile spelled with the prefix the config file uses
 * and the credentials file does not.
 *
 * Nothing here is a credential. A start URL, an account number and a role name
 * are public within the organization, and this script writes no secret at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/install-operator-sso-profile.sh');

const PORTAL = 'https://d-9067example.awsapps.com/start';
const FAKE_ACCOUNT = '000000000000';
// Shaped like the real thing so the shape check is exercised, but plainly not a
// credential: the id is neither 20 characters nor of the AKIA form.
const FAKE_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';

let workDir: string;
let configFile: string;
let credFile: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-ssoprofile-'));
  configFile = join(workDir, 'config');
  credFile = join(workDir, 'credentials');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function run(args: string[] = []) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      AWS_CONFIG_FILE: configFile,
      AWS_SHARED_CREDENTIALS_FILE: credFile,
      INSTALL_OPERATOR_SSO_ACCOUNT_ID: FAKE_ACCOUNT,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** The ordinary successful run, unattended so it needs no terminal. */
function install(extra: string[] = []) {
  return run(['--start-url', PORTAL, '--role', 'FootbagSuperAdmin', '--yes', ...extra]);
}

describe('install-operator-sso-profile.sh — the shadowing refusal', () => {
  it('refuses when a static key holds that profile name in the credentials file', () => {
    writeFileSync(
      credFile,
      `[footbag-operator]\naws_access_key_id = ${FAKE_KEY_ID}\naws_secret_access_key = notasecret\n`,
      'utf-8',
    );
    const r = install();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/static access key already occupies the profile 'footbag-operator'/);
    expect(r.stderr).toContain(FAKE_KEY_ID);
    expect(r.stderr).toContain(credFile);
  });

  it('refuses when the key is in the config file instead, where it is just as preferred', () => {
    writeFileSync(
      configFile,
      `[profile footbag-operator]\nregion = us-east-1\naws_access_key_id = ${FAKE_KEY_ID}\n`,
      'utf-8',
    );
    const r = install();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/static access key already occupies/);
    expect(r.stderr).toContain(configFile);
  });

  it('names the profile the key belongs under instead, rather than only refusing', () => {
    writeFileSync(credFile, `[footbag-operator]\naws_access_key_id = ${FAKE_KEY_ID}\n`, 'utf-8');
    const r = install();
    expect(r.stderr).toContain('footbag-operator-key');
    expect(r.stderr).toContain('bash scripts/install-operator-key.sh');
  });

  it('writes nothing on that refusal', () => {
    writeFileSync(credFile, `[footbag-operator]\naws_access_key_id = ${FAKE_KEY_ID}\n`, 'utf-8');
    install();
    expect(existsSync(configFile)).toBe(false);
  });

  it('is not skipped by --yes, which only answers the confirmation', () => {
    writeFileSync(credFile, `[footbag-operator]\naws_access_key_id = ${FAKE_KEY_ID}\n`, 'utf-8');
    const withFlag = install();
    expect(withFlag.status).toBe(1);
    expect(withFlag.stderr).toMatch(/static access key already occupies/);
  });

  it('is unmoved by a key sitting under some other profile, which shadows nothing', () => {
    writeFileSync(
      credFile,
      `[some-other-account]\naws_access_key_id = ${FAKE_KEY_ID}\naws_secret_access_key = notasecret\n`,
      'utf-8',
    );
    const r = install();
    expect(r.status).toBe(0);
    expect(readFileSync(configFile, 'utf-8')).toContain('[profile footbag-operator]');
  });
});

describe('install-operator-sso-profile.sh — what it writes', () => {
  it('writes the session block and the profile that points at it', () => {
    const r = install();
    expect(r.status, r.stderr).toBe(0);
    const written = readFileSync(configFile, 'utf-8');

    expect(written).toContain('[sso-session footbag]');
    expect(written).toMatch(new RegExp(`sso_start_url\\s+= ${PORTAL.replace(/\//g, '\\/')}`));
    expect(written).toMatch(/sso_registration_scopes\s+= sso:account:access/);

    expect(written).toContain('[profile footbag-operator]');
    expect(written).toMatch(/sso_session\s+= footbag/);
    expect(written).toMatch(new RegExp(`sso_account_id\\s+= ${FAKE_ACCOUNT}`));
    expect(written).toMatch(/sso_role_name\s+= FootbagSuperAdmin/);
  });

  it('spells the profile with the prefix the config file uses, not the credentials one', () => {
    // The two files spell a named profile differently, and a stanza copied from
    // one into the other parses as a section nothing resolves.
    install();
    const written = readFileSync(configFile, 'utf-8');
    expect(written).toContain('[profile footbag-operator]');
    expect(written).not.toMatch(/^\[footbag-operator\]$/m);
  });

  it('writes the dev-and-tester permission set when that is the job', () => {
    const r = run(['--start-url', PORTAL, '--role', 'FootbagDevTester', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(configFile, 'utf-8')).toMatch(/sso_role_name\s+= FootbagDevTester/);
  });

  it('keeps everything already in the config file, byte for byte', () => {
    const existing = '[profile something-else]\nregion = eu-west-1\noutput = text\n';
    writeFileSync(configFile, existing, 'utf-8');
    install();
    expect(readFileSync(configFile, 'utf-8').startsWith(existing)).toBe(true);
  });

  it('does not glue its section onto a file whose last line has no newline', () => {
    writeFileSync(configFile, '[profile something-else]\nregion = eu-west-1', 'utf-8');
    install();
    expect(readFileSync(configFile, 'utf-8')).toMatch(/region = eu-west-1\n\[sso-session footbag\]/);
  });

  it('leaves the config file readable by its owner alone', () => {
    install();
    expect(statSync(configFile).mode & 0o777).toBe(0o600);
  });

  it('leaves the sign-in to the operator, and says so with the profile filled in', () => {
    const r = install();
    expect(r.stdout).toContain('aws sso login --profile footbag-operator');
  });

  it('writes no credential of any kind', () => {
    install();
    const written = readFileSync(configFile, 'utf-8');
    expect(written).not.toMatch(/aws_access_key_id/);
    expect(written).not.toMatch(/aws_secret_access_key/);
    expect(written).not.toMatch(/aws_session_token/);
  });
});

/**
 * The chained runtime profiles belong to whichever identity the operator acts
 * as, and under federation that is this one. Before they were written here, the
 * only script that wrote them chained them off the directly authenticated key,
 * which a dev-and-tester never holds — so that tier's permission set was a role
 * that existed on paper: staging's runtime trust already named it, and the one
 * suite that uses the chain refused with a message about the wrong thing.
 */
describe('install-operator-sso-profile.sh — the chained runtime profiles', () => {
  it('writes the staging chain, sourced from the profile it just wrote', () => {
    const r = install();
    expect(r.status, r.stderr).toBe(0);
    const written = readFileSync(configFile, 'utf-8');
    expect(written).toContain('[profile footbag-staging-runtime]');
    expect(written).toMatch(/role_arn\s+= arn:aws:iam::\d+:role\/footbag-staging-app-runtime/);
    expect(written).toMatch(/source_profile\s+= footbag-operator/);
  });

  it('writes the production chain for a super admin', () => {
    install();
    expect(readFileSync(configFile, 'utf-8')).toContain('[profile footbag-production-runtime]');
  });

  it('writes no production chain for a dev-and-tester, and says why', () => {
    // Production's runtime role does not trust that permission set, so the
    // profile would resolve and then fail to assume. Every workstation check
    // would report that as a fault rather than as the boundary working.
    const r = run(['--start-url', PORTAL, '--role', 'FootbagDevTester', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    const written = readFileSync(configFile, 'utf-8');
    expect(written).toContain('[profile footbag-staging-runtime]');
    expect(written).not.toContain('[profile footbag-production-runtime]');
    expect(r.stdout).toMatch(/does not trust the dev-and-tester set/);
  });

  it('gives a dev-and-tester a staging chain that needs no key they cannot hold', () => {
    run(['--start-url', PORTAL, '--role', 'FootbagDevTester', '--yes']);
    const written = readFileSync(configFile, 'utf-8');
    expect(written).toMatch(/source_profile\s+= footbag-operator$/m);
    expect(written).not.toMatch(/source_profile\s+= footbag-operator-key/);
  });

  it('leaves an existing chain alone and names what it points at', () => {
    // A config section is the operator's: it may carry a duration or an
    // mfa_serial set deliberately. A chain still sourcing the key works, since
    // both runtime trust policies name that user, but its calls are attributed
    // to the shared IAM user rather than to a person.
    writeFileSync(
      configFile,
      '[profile footbag-staging-runtime]\nrole_arn = arn:aws:iam::1:role/staging\nsource_profile = footbag-operator-key\nmfa_serial = arn:aws:iam::1:mfa/me\n',
      'utf-8',
    );
    const r = install();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/already present, left untouched/);
    expect(r.stdout).toMatch(/attributed to the shared IAM user/);
    const written = readFileSync(configFile, 'utf-8');
    expect(written).toContain('mfa_serial');
    expect(written).toMatch(/source_profile = footbag-operator-key/);
  });

  it('says nothing about attribution when the existing chain already sources the sign-in', () => {
    writeFileSync(
      configFile,
      '[profile footbag-staging-runtime]\nrole_arn = arn:aws:iam::1:role/staging\nsource_profile = footbag-operator\n',
      'utf-8',
    );
    const r = install();
    expect(r.stdout).not.toMatch(/attributed to the shared IAM user/);
  });
});

describe('install-operator-sso-profile.sh — re-running it', () => {
  it('leaves an existing profile of that name exactly as it is', () => {
    const existing = '[profile footbag-operator]\nsso_session = footbag\nsso_role_name = Something\n';
    writeFileSync(configFile, existing, 'utf-8');
    const r = install();
    expect(r.status).toBe(0);
    expect(readFileSync(configFile, 'utf-8')).toBe(existing);
    expect(r.stdout).toMatch(/already in/);
  });

  it('adds a second profile against a session block that already exists', () => {
    // One sign-in serves every profile pointing at it, so a workstation that
    // takes a second profile must not get a second copy of the session block:
    // duplicate sections are what the CLI resolves last-one-wins, silently.
    install();
    const r = run(['--start-url', PORTAL, '--role', 'FootbagDevTester', '--profile', 'footbag-staging-only', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    const written = readFileSync(configFile, 'utf-8');
    expect(written.match(/\[sso-session footbag\]/g)).toHaveLength(1);
    expect(written).toContain('[profile footbag-staging-only]');
    expect(r.stdout).toMatch(/already present, left untouched/);
  });

  it('is idempotent: a second run changes nothing', () => {
    install();
    const after = readFileSync(configFile, 'utf-8');
    const second = install();
    expect(second.status).toBe(0);
    expect(readFileSync(configFile, 'utf-8')).toBe(after);
  });
});

describe('install-operator-sso-profile.sh — the argument guards', () => {
  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it('refuses without the access portal URL, saying where to find it', () => {
    const r = run(['--role', 'FootbagSuperAdmin', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--start-url is required/);
    expect(r.stderr).toMatch(/invitation mail/);
  });

  it('refuses a portal URL that is not a link, which configures cleanly otherwise', () => {
    const r = run(['--start-url', 'my portal link', '--role', 'FootbagSuperAdmin', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/must begin with https:\/\//);
  });

  it('refuses without a permission set, naming both and what each carries', () => {
    const r = run(['--start-url', PORTAL, '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('FootbagSuperAdmin');
    expect(r.stderr).toContain('FootbagDevTester');
  });

  it('refuses a permission set that does not exist rather than writing it', () => {
    const r = run(['--start-url', PORTAL, '--role', 'FootbagSuperAdmn', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/is not one of the permission sets that exist/);
    expect(existsSync(configFile)).toBe(false);
  });

  it('refuses to write without a terminal unless the flag was given deliberately', () => {
    const r = run(['--start-url', PORTAL, '--role', 'FootbagSuperAdmin']);
    expect(r.status).toBe(1);
    expect(existsSync(configFile)).toBe(false);
  });

  it('does not take an exported accept-in-advance value for the typed word', () => {
    // The shared helper assigns that flag at source time, so a value inherited
    // from the operator's shell cannot stand in for the confirmation.
    const res = spawnSync('bash', [SCRIPT, '--start-url', PORTAL, '--role', 'FootbagSuperAdmin'], {
      encoding: 'utf-8',
      input: '',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        AWS_CONFIG_FILE: configFile,
        AWS_SHARED_CREDENTIALS_FILE: credFile,
        ASSUME_YES: 'yes',
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(existsSync(configFile)).toBe(false);
  });

  it('prints the refusal that matters as help, so it is known before the run', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/refuses to write this profile while a static access key/);
  });
});
