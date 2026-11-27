/**
 * scripts/provision-origin-tls.sh: the origin certificate that encrypts the
 * CloudFront-to-origin hop on production.
 *
 * Two halves are driven here. The operator half is run end to end against
 * stand-ins for Terraform's outputs, public DNS, IAM's policy simulator and the
 * host: every precondition it refuses on is pinned beside a run that passes
 * them all and stops only at the typed confirmation, which a test has no
 * terminal to give. The host half is run directly, as the wrapper streams it,
 * against stand-in certbot, openssl, docker, systemctl, rpm, dnf and aws, with
 * scratch paths for the certificate directory, the AWS config and the systemd
 * drop-ins, because what it reports (issued or not, served or not) is what the
 * operator acts on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { connectingAs, SHARED_ACCOUNT } from '../fixtures/sshConfigStub';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/provision-origin-tls.sh');
const HALF = join(process.cwd(), 'scripts/internal/provision-origin-tls-remote.sh');
const REPORT_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');

const HOST = 'origin.example.org';
const ROLE = 'arn:aws:iam::000000000000:role/footbag-production-origin-tls';
const IP = '203.0.113.10';
const ZONE = 'Z0000000000EXAMPLE';

let work: string;

function exec(path: string, lines: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...lines].join('\n') + '\n');
  chmodSync(path, 0o755);
}

describe('provision-origin-tls.sh, the operator half', () => {
  let calls: string;

  beforeEach(() => {
    work = createScratchDir('origin-tls');
    calls = join(work, 'calls.log');
    // terraform output -raw <name>, answered from OUT_<name>.
    exec(join(work, 'terraform'), [
      'name="${!#}"',
      'var="OUT_${name}"',
      'printf "%s" "${!var-}"',
    ]);
    // dig +short ... @resolver <name> <type>, answered from DIG_<type>.
    exec(join(work, 'dig'), [
      'type="${!#}"',
      'var="DIG_${type}"',
      'printf "%b" "${!var-}"',
    ]);
    // iam simulate-principal-policy: the decision for the record name passed.
    exec(join(work, 'aws'), [
      `echo "aws $*" >> ${JSON.stringify(calls)}`,
      // Allowed only when every name in the request is allowed, as
      // ForAllValues evaluates a list.
      'for a in "$@"; do case "$a" in *NormalizedRecordNames,ContextKeyValues=*) n="${a#*ContextKeyValues=}"; n="${n%,ContextKeyType=*}" ;; esac; done',
      'ok=1; IFS=, read -ra names <<<"$n"; for one in "${names[@]}"; do',
      '  [[ "$one" == "${ALLOWED_NAME:-_acme-challenge.origin.example.org}" || " ${ALSO_ALLOWED:-} " == *" $one "* ]] || ok=0',
      'done',
      'if (( ok )); then echo allowed; else echo implicitDeny; fi',
    ]);
    // The host: answers the identity probe, records every other session.
    exec(join(work, 'ssh-host.sh'), [
      'case "$*" in *footbag-host-identity*) cat >/dev/null; printf -- "---FOOTBAG-HOST-ENV---\\nproduction\\n---FOOTBAG-HOST-URL---\\n\\n---FOOTBAG-END---\\n"; exit 0 ;; esac',
      'IFS= read -r pass',
      `body="$(cat)"; mode="$(grep -m1 '^MODE=' <<<"$body")"; echo "session $mode" >> ${JSON.stringify(calls)}`,
      'echo "---FOOTBAG-FINGERPRINT-DISK--- AA"; echo "---FOOTBAG-FINGERPRINT-SERVED--- AA"; echo "---FOOTBAG-NOT-AFTER--- 2027-02-23 12:00:00Z"',
    ]);
    writeFileSync(join(work, 'known_hosts'), 'footbag-production ssh-ed25519 AAAAstub\n', { mode: 0o600 });
  });
  afterEach(() => removeScratch(work));

  const READY: NodeJS.ProcessEnv = {
    OUT_origin_hostname: HOST,
    OUT_origin_tls_role_arn: ROLE,
    OUT_lightsail_static_ip: IP,
    OUT_route53_zone_id: ZONE,
    DIG_NS: 'ns-1.awsdns-01.org.\\nns-2.awsdns-02.net.\\n',
    DIG_A: `${IP}\\n`,
    DIG_CAA: '0 issue "letsencrypt.org"\\n0 issuewild ";"\\n',
  };

  function run(args: string[], env: NodeJS.ProcessEnv = {}, input = 'stub-sudo-pass\n') {
    const r = spawnSync('bash', [SCRIPT, ...args], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input,
      env: {
        ...process.env,
        ...connectingAs(SHARED_ACCOUNT, work),
        ...awsIdentityStubEnv(work),
        TF_OUTPUT_BIN: join(work, 'terraform'),
        FOOTBAG_ORIGIN_TLS_AWS_BIN: join(work, 'aws'),
        FOOTBAG_ORIGIN_TLS_DIG_BIN: join(work, 'dig'),
        FOOTBAG_HOST_SSH_BIN: join(work, 'ssh-host.sh'),
        FOOTBAG_KNOWN_HOSTS: join(work, 'known_hosts'),
        FOOTBAG_CR_REPORT_TO: '',
        ...READY,
        ...env,
      },
      ...SPAWN_GUARD,
    });
    const stderr = r.stderr ?? '';
    return {
      status: r.status,
      stdout: r.stdout ?? '',
      stderr,
      report: stderr.slice(stderr.indexOf('==== Closing report')),
      calls: existsSync(calls) ? readFileSync(calls, 'utf-8') : '',
    };
  }

  it('rejects an unknown argument', () => {
    // Defect caught: a mistyped flag read as the issuing run.
    const r = run(['--target', 'production', '--bogus']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown argument '--bogus'/);
  });

  it('refuses staging, which has no name of its own to certify', () => {
    // Defect caught: an issue attempted for a host whose hop is plaintext by
    // design, burning Let's Encrypt's rate limit on a name that cannot validate.
    const r = run(['--target', 'staging', '--dry-run']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target must be 'production'/);
  });

  it('prints the plan on a dry run and connects to nothing', () => {
    // Defect caught: a dry run that reads Terraform, DNS or the host, so the
    // plan cannot be read safely before the zone has moved.
    const r = run(['--target', 'production', '--dry-run'], {}, '');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/staging authority and then its production one/);
    expect(r.calls).toBe('');
  });

  it('refuses while the origin record and its role do not exist', () => {
    // Defect caught: an issue attempted before enable_origin_record, against
    // a name no zone answers for.
    const r = run(['--target', 'production'], { OUT_origin_hostname: '', OUT_origin_tls_role_arn: '' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/enable_origin_record is off/);
    expect(r.calls).toBe('');
  });

  it.each([
    ['the domain is still delegated away from Route 53', { DIG_NS: 'ns1.legacy-host.example.\\n' }, /still delegated to ns1\.legacy-host\.example\./],
    ['the origin name resolves elsewhere', { DIG_A: '198.51.100.7\\n' }, /resolves to '198\.51\.100\.7', not the host's static address/],
    ['the origin name does not resolve', { DIG_A: '' }, /resolves to '', not the host's static address/],
    ['the CAA record does not permit Let\'s Encrypt', { DIG_CAA: '0 issue "amazon.com"\\n' }, /does not permit Let's Encrypt/],
  ])('refuses before touching the host when %s', (_label, env, message) => {
    // Defect caught: a DNS-01 challenge Let's Encrypt cannot see, or one its
    // CAA check refuses, run against the host anyway and counted against the
    // name's failed-validation limit.
    const r = run(['--target', 'production'], env);
    expect(r.status).toBe(1);
    expect(r.report).toMatch(message);
    expect(r.calls).not.toMatch(/session MODE=issue/);
  });

  it('refuses when the role cannot write the challenge record', () => {
    // Defect caught: certbot's challenge failing on the host part way, after
    // certbot was installed and the profile written.
    const r = run(['--target', 'production'], { ALLOWED_NAME: 'nothing' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/may not write TXT _acme-challenge\.origin\.example\.org/);
    expect(r.calls).not.toMatch(/session MODE=issue/);
  });

  it.each([
    ['the apex', 'example.org'],
    ['www', 'www.example.org'],
    ['another TXT name', '_acme-challenge.example.org'],
    ['the origin record itself', 'origin.example.org'],
  ])('refuses when the role can also write %s', (_label, name) => {
    // Defect caught: a challenge role wider than its one record, so a host
    // compromise reaches the zone, accepted because issuance would still work.
    const r = run(['--target', 'production'], { ALSO_ALLOWED: name });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/its reach is wider than the challenge record/);
    expect(r.calls).not.toMatch(/session MODE=issue/);
  });

  it('passes every precondition and then waits for a typed APPLY it cannot get without a terminal', () => {
    // Defect caught: a precondition that refuses a correct estate, so the
    // script could never issue; or an issue sent without the confirmation.
    const r = run(['--target', 'production']);
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/delegated to Route 53, origin\.example\.org resolves to 203\.0\.113\.10/);
    expect(r.report).toMatch(/may write the TXT record _acme-challenge\.origin\.example\.org and was refused/);
    expect(r.report).toMatch(/not confirmed; nothing was changed/);
    expect(r.calls).not.toMatch(/session MODE=issue/);
    expect((r.calls.match(/simulate-principal-policy/g) ?? []).length).toBe(7);
    expect(r.calls).toMatch(/ContextKeyValues=_acme-challenge\.origin\.example\.org,example\.org,ContextKeyType=stringList/);
  });

  it('runs --status before the origin record exists, and nothing else', () => {
    // Defect caught: the read-only check of the host's certbot refused until
    // the zone moves, or an issue reachable with no record behind it.
    const r = run(['--target', 'production', '--status'], { OUT_origin_hostname: '', OUT_origin_tls_role_arn: '' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls).toMatch(/session MODE=status/);
  });

  it('reads the state on --status without simulating or issuing', () => {
    // Defect caught: a status read that changes the host or calls IAM.
    const r = run(['--target', 'production', '--status']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls).toMatch(/session MODE=status/);
    expect(r.calls).not.toMatch(/simulate|MODE=issue/);
  });
});

describe('provision-origin-tls-remote.sh, the host half', () => {
  let bin: string;
  let le: string;
  let calls: string;
  let served: string;
  let awsConfig: string;
  let systemdDir: string;

  beforeEach(() => {
    work = createScratchDir('origin-tls-half');
    bin = join(work, 'bin');
    le = join(work, 'letsencrypt');
    calls = join(work, 'calls.log');
    served = join(work, 'served');
    awsConfig = join(work, 'aws-config');
    systemdDir = join(work, 'systemd');
    mkdirSync(bin);
    mkdirSync(le);
    writeFileSync(awsConfig, '[profile footbag-production-source-profile]\nregion = us-east-1\n');
    const log = `echo "$(basename "$0") $*" >> ${JSON.stringify(calls)}`;
    exec(join(bin, 'rpm'), [`[[ -e ${JSON.stringify(join(work, 'installed'))} ]]`]);
    // dnf: repoquery answers with the queryformat the half asks for, from
    // OFFERED; install records the packages as installed.
    exec(join(bin, 'dnf'), [
      log,
      'if [[ " $* " == *" repoquery "* ]]; then printf "%b" "${OFFERED-certbot 2.6.0\\npython3-certbot-dns-route53 2.6.0\\n}"; exit 0; fi',
      `touch ${JSON.stringify(join(work, 'installed'))}`,
    ]);
    exec(join(bin, 'systemctl'), [
      log,
      'case "$1" in',
      '  cat) exit 0 ;;',
      `  enable) touch ${JSON.stringify(join(work, 'timer-on'))} ;;`,
      `  is-enabled) [[ -e ${JSON.stringify(join(work, 'timer-on'))} ]] && echo enabled || { echo disabled; exit 1; } ;;`,
      `  is-active) [[ -e ${JSON.stringify(join(work, 'timer-on'))} ]] && echo active || { echo inactive; exit 3; } ;;`,
      // systemctl show reads the drop-in the half wrote, as systemd would
      // after the reload, unless the drop-in is not taken up.
      `  show) [[ -n "\${DROPIN_IGNORED:-}" ]] && exit 0; f=${JSON.stringify(join(work, 'systemd', 'certbot-renew.service.d', 'footbag-aws-profile.conf'))}; [[ -r "$f" ]] && sed -n 's/^Environment=//p' "$f" | tr '\\n' ' ' ;;`,
      'esac',
    ]);
    exec(join(bin, 'aws'), [
      '[[ -n "${ASSUME_FAILS:-}" ]] && { echo "An error occurred (AccessDenied) when calling the AssumeRole operation" >&2; exit 254; }',
      'echo "arn:aws:sts::000000000000:assumed-role/footbag-production-origin-tls/botocore-session-1"',
    ]);
    // certbot writes the lineage it was asked for: the rehearsal from the
    // staging authority, the real one from the production authority.
    exec(join(bin, 'certbot'), [
      log,
      `le=${JSON.stringify(le)}`,
      'name=""; for ((i=1;i<=$#;i++)); do [[ "${!i}" == --cert-name ]] && { j=$((i+1)); name="${!j}"; }; done',
      'case "$1" in',
      '  certonly) [[ -n "${CERTBOT_FAILS:-}" ]] && { echo "Some challenges have failed."; exit 1; }',
      '    mkdir -p "$le/live/$name"',
      '    if [[ " $* " == *" --test-cert "* ]]; then echo STAGING-CERT > "$le/live/$name/cert.pem"; else echo PROD-CERT > "$le/live/$name/cert.pem"; fi ;;',
      '  delete) rm -rf "${le:?}/live/$name" ;;',
      '  renew) [[ -n "${RENEW_FAILS:-}" ]] && { echo "Failed to renew certificate origin"; exit 1; }; exit 0 ;;',
      'esac',
    ]);
    // openssl: the certificate's content stands in for its identity.
    exec(join(bin, 'openssl'), [
      'args=" $* "; file=""; for ((i=1;i<=$#;i++)); do [[ "${!i}" == -in ]] && { j=$((i+1)); file="${!j}"; }; done',
      'body() { if [[ -n "$file" ]]; then cat "$file"; else cat; fi; }',
      `case "$args" in`,
      `  *" -verify_return_error "*) [[ -s ${JSON.stringify(served)} && -z "\${CHAIN_INCOMPLETE:-}" ]] ;;`,
      `  *" s_client "*) [[ -s ${JSON.stringify(served)} ]] && cat ${JSON.stringify(served)}; exit 0 ;;`,
      '  *" -startdate "*) echo "notBefore=2026-11-25 12:00:00Z" ;;',
      '  *" -fingerprint "*) c="$(body)"; [[ -n "$c" ]] && echo "sha256 Fingerprint=$c" ; exit 0 ;;',
      '  *" -checkhost "*) [[ "$(body)" == PROD-CERT ]] && echo "Hostname origin.example.org does match certificate" || echo "Hostname origin.example.org does NOT match certificate"; exit 0 ;;',
      '  *" -checkend "*) [[ "$(body)" == PROD-CERT && -z "${EXPIRING:-}" ]] ;;',
      '  *" -issuer "*) [[ "$(body)" == STAGING-CERT ]] && echo "issuer=C=US, O=(STAGING) Let\'s Encrypt" || echo "issuer=C=US, O=Let\'s Encrypt, CN=R11"; exit 0 ;;',
      '  *" -enddate "*) echo "notAfter=2027-02-23 12:00:00Z" ;;',
      'esac',
    ]);
    // docker: a restart renders the listener, so nginx then serves what is on
    // disk, unless the render is broken.
    exec(join(bin, 'docker'), [
      log,
      'case "$1" in',
      '  ps) echo nginxid ;;',
      '  port) [[ -z "${NO_443:-}" ]] && echo "0.0.0.0:443" ; exit 0 ;;',
      `  restart) [[ -z "\${LISTENER_BROKEN:-}" ]] && cp ${JSON.stringify(join(le, 'live/origin/cert.pem'))} ${JSON.stringify(served)}; exit 0 ;;`,
      '  inspect) if [[ "$*" == *Mounts* ]]; then echo "/etc/nginx/nginx.conf.template /etc/letsencrypt/live /etc/letsencrypt/archive "; else echo healthy; fi ;;',
      '  exec) exit 0 ;;',
      'esac',
    ]);
  });
  afterEach(() => removeScratch(work));

  function half(env: NodeJS.ProcessEnv = {}) {
    const stream = [
      `MODE=${env.MODE ?? 'issue'}`,
      `ORIGIN_HOST=${env.ORIGIN_HOST ?? HOST}`,
      `ROLE_ARN=${env.ORIGIN_HOST === '' ? '' : ROLE}`,
      'FOOTBAG_ENV_VAL=production',
      `ORIGIN_TLS_LE_DIR=${le}`,
      `ORIGIN_TLS_AWS_CONFIG=${awsConfig}`,
      `ORIGIN_TLS_AWS_CREDENTIALS=${join(work, 'aws-credentials')}`,
      `ORIGIN_TLS_SYSTEMD_DIR=${systemdDir}`,
      'ORIGIN_TLS_HEALTH_WAIT=4',
      readFileSync(REPORT_LIB, 'utf-8'),
      readFileSync(HALF, 'utf-8'),
    ].join('\n');
    const r = spawnSync('bash', [], {
      encoding: 'utf-8',
      input: stream,
      env: { ...process.env, ...env, PATH: `${bin}:${process.env.PATH ?? ''}` },
      ...SPAWN_GUARD,
    });
    const stdout = r.stdout ?? '';
    const markedLine = (k: string) => new RegExp(`^---FOOTBAG-${k}--- (.*)$`, 'm').exec(stdout)?.[1];
    return {
      status: r.status,
      stdout,
      stderr: r.stderr ?? '',
      marked: markedLine,
      calls: existsSync(calls) ? readFileSync(calls, 'utf-8') : '',
    };
  }

  it('on a fresh host: installs certbot, rehearses on the staging authority, issues, renews, and serves the certificate', () => {
    // Defect caught: a production issue with no rehearsal first, a rehearsal
    // certificate left where a listener could serve it, a certificate with
    // no renewal timer or reload hook, or nginx never restarted onto it.
    const r = half();
    expect(r.status, r.stderr).toBe(0);
    const lines = r.calls.split('\n');
    const rehearsal = lines.findIndex((l) => /^certbot certonly .*--test-cert .*--cert-name origin-rehearsal|^certbot certonly --test-cert --cert-name origin-rehearsal/.test(l));
    const real = lines.findIndex((l) => /^certbot certonly --cert-name origin /.test(l) && !l.includes('--test-cert'));
    expect(lines.some((l) => /^dnf install -y certbot python3-certbot-dns-route53/.test(l))).toBe(true);
    expect(rehearsal).toBeGreaterThan(-1);
    expect(real).toBeGreaterThan(rehearsal);
    expect(lines.findIndex((l) => /^certbot delete --cert-name origin-rehearsal/.test(l))).toBeGreaterThan(rehearsal);
    expect(existsSync(join(le, 'live', 'origin-rehearsal'))).toBe(false);
    expect(lines[real]).toMatch(/--dns-route53 -d origin\.example\.org /);
    expect(r.calls).toMatch(/^systemctl enable --now certbot-renew\.timer$/m);
    expect(r.calls).toMatch(/^docker restart nginxid$/m);
    expect(r.calls).toMatch(/^docker exec nginxid nginx -s reload$/m);
    expect(r.marked('ISSUED')).toBe('new');
    expect(r.marked('FINGERPRINT-DISK')).toBe('PROD-CERT');
    expect(r.marked('FINGERPRINT-SERVED')).toBe('PROD-CERT');
  });

  it('gives the renewal timer the profile that reaches the challenge role, and installs the reload hook', () => {
    // Defect caught: a first issue that works by hand and a renewal, sixty
    // days later, that runs with no AWS identity and fails silently.
    const r = half();
    expect(r.status, r.stderr).toBe(0);
    const dropin = readFileSync(join(systemdDir, 'certbot-renew.service.d', 'footbag-aws-profile.conf'), 'utf-8');
    expect(dropin).toMatch(/^Environment=AWS_PROFILE=footbag-production-origin-tls$/m);
    expect(dropin).toMatch(new RegExp(`^Environment=AWS_CONFIG_FILE=${awsConfig.replace(/[/.]/g, '\\$&')}$`, 'm'));
    const config = readFileSync(awsConfig, 'utf-8');
    expect(config).toMatch(/\[profile footbag-production-origin-tls\]\nrole_arn = arn:aws:iam::000000000000:role\/footbag-production-origin-tls\nsource_profile = footbag-production-source-profile/);
    const hook = join(le, 'renewal-hooks', 'deploy', 'footbag-nginx-reload');
    expect(statSync(hook).mode & 0o111).not.toBe(0);
    expect(readFileSync(hook, 'utf-8')).toMatch(/nginx -t\n.*nginx -s reload/);
  });

  it('issues nothing and does not restart nginx when the certificate already holds and is served', () => {
    // Defect caught: every re-run issuing again and running into Let's
    // Encrypt's duplicate-certificate limit, or restarting a serving nginx.
    mkdirSync(join(le, 'live', 'origin'), { recursive: true });
    writeFileSync(join(le, 'live', 'origin', 'cert.pem'), 'PROD-CERT\n');
    writeFileSync(served, 'PROD-CERT\n');
    writeFileSync(join(work, 'installed'), '');
    const r = half();
    expect(r.status, r.stderr).toBe(0);
    expect(r.marked('ISSUED')).toBe('existing');
    expect(r.calls).not.toMatch(/^certbot certonly/m);
    expect(r.calls).not.toMatch(/^dnf /m);
    expect(r.calls).not.toMatch(/^docker restart/m);
  });

  it('replaces a certificate near expiry in place, keeping the listener\'s paths', () => {
    // Defect caught: a lineage that no longer holds left in place, or a new
    // lineage under another name the listener does not read.
    mkdirSync(join(le, 'live', 'origin'), { recursive: true });
    writeFileSync(join(le, 'live', 'origin', 'cert.pem'), 'PROD-CERT\n');
    const r = half({ EXPIRING: '1' });
    expect(r.status).not.toBe(0);
    expect(r.calls).toMatch(/^certbot certonly --cert-name origin --force-renewal /m);
  });

  it('fails when nginx does not serve the certificate on disk after the restart', () => {
    // Defect caught: a run reporting success while the 443 listener is
    // missing or serving another certificate, found only when CloudFront's
    // switch to https-only answers every visitor with 502.
    const r = half({ LISTENER_BROKEN: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/nginx serves 'nothing' on 443, not the certificate on disk \('PROD-CERT'\)/);
  });

  it('refuses to issue when the host cannot assume the challenge role', () => {
    // Defect caught: certbot started with no working identity, failing its
    // challenge part way and counting against the name's validation limit.
    const r = half({ ASSUME_FAILS: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/cannot assume .*footbag-production-origin-tls/);
    expect(r.calls).not.toMatch(/^certbot /m);
  });

  it('refuses a profile stanza that already names another role, rather than rewriting it', () => {
    // Defect caught: an operator's hand edit silently overwritten, or certbot
    // run under a role nobody simulated.
    writeFileSync(awsConfig, '[profile footbag-production-origin-tls]\nrole_arn = arn:aws:iam::000000000000:role/something-else\nsource_profile = footbag-production-source-profile\n');
    const r = half();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/already names a different role for footbag-production-origin-tls/);
    expect(r.calls).not.toMatch(/^certbot /m);
  });

  it('fails, and claims no certificate, when certbot\'s issue fails', () => {
    // Defect caught: a failed challenge read as an issued certificate.
    const r = half({ CERTBOT_FAILS: '1' });
    expect(r.status).not.toBe(0);
    expect(r.marked('ISSUED')).toBeUndefined();
    expect(r.stderr).toMatch(/Some challenges have failed/);
  });

  it('proves the renewal before handing back: the service carries the profile, and a dry run renews', () => {
    // Defect caught: a first issue that works and a first renewal, sixty days
    // later, that runs without the challenge role and lets the certificate
    // expire into a 502 for every visitor.
    const r = half();
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls).toMatch(/^certbot renew --cert-name origin --dry-run --no-random-sleep-on-renew$/m);
  });

  it('fails when the renewal service does not take up the profile', () => {
    // Defect caught: a drop-in written where systemd never reads it.
    const r = half({ DROPIN_IGNORED: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/certbot-renew\.service does not carry AWS_PROFILE=footbag-production-origin-tls/);
    expect(r.calls).not.toMatch(/^certbot renew/m);
  });

  it('fails when the dry-run renewal fails', () => {
    // Defect caught: a renewal path that cannot complete, found only at the
    // first real renewal.
    const r = half({ RENEW_FAILS: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/renewal dry run/);
  });

  it('refuses to issue while the running nginx does not publish 443', () => {
    // Defect caught: a certificate issued into a container created before
    // the compose file carried 443, which a restart cannot change, so the
    // run ends in a health wait and a wasted issue.
    const r = half({ NO_443: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/does not publish 443 with the certificate directories mounted/);
    expect(r.calls).not.toMatch(/^certbot /m);
    expect(r.calls).not.toMatch(/^dnf /m);
  });

  it('fails when the served chain does not verify for the origin name', () => {
    // Defect caught: a listener serving the right leaf with an incomplete
    // chain, which CloudFront refuses once the hop is https-only.
    const r = half({ CHAIN_INCOMPLETE: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/does not verify against the trusted roots/);
  });

  it('on a status read before the origin record exists, reports the certbot the host\'s repositories offer', () => {
    // Defect caught: the session after the zone move finding out mid-issue
    // that the locked release carries no certbot, when a read-only status
    // run could have said so beforehand.
    const r = half({ MODE: 'status', ORIGIN_HOST: '' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.marked('CERTBOT-OFFERED')).toBe('2.6.0');
    expect(r.calls).toMatch(/^dnf -q repoquery --available/m);
    expect(r.calls).not.toMatch(/^dnf install/m);
  });

  it('fails a status read when the host\'s repositories do not offer certbot and its Route 53 plugin', () => {
    // Defect caught: a repository without the plugin read as ready to issue.
    const r = half({ MODE: 'status', ORIGIN_HOST: '', OFFERED: 'certbot 2.6.0\\n' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/do not offer both certbot and python3-certbot-dns-route53/);
  });

  it('says on stderr that its paths are overridden', () => {
    // Defect caught: a stubbed run mistaken for one on a host.
    const r = half({ MODE: 'status' });
    expect(r.stderr).toMatch(/SYNTHETIC: origin TLS paths overridden/);
  });
});
