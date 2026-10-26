/**
 * scripts/bootstrap-host.sh — standing a fresh instance up as a deployable
 * host, reporting how far any host has got, and the one route that replaces the
 * instance.
 *
 * Nothing real is reached. A stand-in host answers the status body with the
 * facts a finished host reports, and each case takes facts away or changes
 * them; stand-ins for terraform, the AWS CLI and every sibling script record
 * what the run asked of them. The bootstrap and the replacement each need a
 * terminal, so those runs go through a pseudo-terminal whose input already holds
 * any typed answer, while standard input stays the credential.
 *
 * What is pinned:
 *   - a finished host reads done on every step, and with any one step taken
 *     away that step reads pending, naming the command that finishes it;
 *   - the stand-in's facts are exactly the ones the real status body emits, so
 *     a fact the body stops reporting cannot leave a verdict passing on a value
 *     only the test supplies;
 *   - the bootstrap proves each step before skipping it, sends the first login
 *     as ec2-user with the password on the stream rather than in an argument,
 *     takes production's database back by restore once it is live, and stops
 *     before the milestone-gated steps, naming them;
 *   - every refusal, beside a run the same guard lets through;
 *   - the replacement snapshots first, waits for the snapshot, asks for its
 *     own typed word, and on a live production requires a fresh backup.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/bootstrap-host.sh');
const STATUS_HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-status-remote.sh');

const IP = '203.0.113.10';
// Key ids copied from the shapes the secret scan already allowlists.
const HOST_KEY = 'AKIAEXAMPLEEXAMPLE01';
const DEAD_KEY = 'AKIAEXAMPLEEXAMPLE02';
const OTHER_DEAD_KEY = 'AKIAEXAMPLEEXAMPLE03';
const HEALTHY_CONTAINERS =
  'footbag-web-1 Up 2 hours (healthy), footbag-worker-1 Up 2 hours (healthy), '
  + 'footbag-image-1 Up 2 hours (healthy), footbag-nginx-1 Up 2 hours (healthy)';
const COMPOSE = 'v2.29.7';
const CWAGENT = '1.300050.0b1';
const DIGEST = 'a'.repeat(64);

/** A host every bootstrap step has finished on, as the status body reports it. */
function finishedHost(target: 'staging' | 'production'): Record<string, string> {
  return {
    ACCOUNT_USER: 'footbag',
    ACCOUNT_WHEEL: 'yes',
    ACCOUNT_KEYS: '1',
    SSHD_PORTS: '22 2222',
    SSHD_ROOT: 'no',
    SSHD_PASSWORD: 'no',
    SSHD_KBD: 'no',
    SSHD_REVERT_PENDING: 'no',
    SSHD_LISTEN: '22 2222',
    ARCH: 'x86_64',
    DOCKER_ACTIVE: 'active',
    DOCKER_ENABLED: 'enabled',
    COMPOSE_VERSION: COMPOSE.slice(1),
    SQLITE: 'yes',
    RSYNC: 'yes',
    AWSCLI: 'yes',
    SRV_DIR: 'root:root 755',
    ENV_FILE: 'root:root 600',
    DB_DIR: '1000:1000',
    FOOTBAG_ENV: target,
    DB_FILE: 'present',
    REPLAY_PENDING: 'no',
    FEED_SES_QUEUE: 'set',
    FEED_ALARM_QUEUE: 'set',
    CRED_CHAIN: 'ok',
    CRED_KEY_ID: HOST_KEY,
    CWAGENT_ACTIVE: 'active',
    CWAGENT_ENABLED: 'enabled',
    CWAGENT_VERSION: CWAGENT,
    CWAGENT_KEY_ID: HOST_KEY,
    LOG_DRIVERS: 'footbag-web-1:awslogs footbag-worker-1:awslogs footbag-nginx-1:awslogs footbag-image-1:json-file',
    SERVICE_ENABLED: 'enabled',
    CONTAINERS: HEALTHY_CONTAINERS,
    TIMER_ACTIVE: 'active',
    TIMER_ENABLED: 'enabled',
    ZRAM_ACTIVE: 'no',
    ZRAM_SUPPRESSED: target === 'staging' ? 'yes' : 'no',
    SWAPFILE: 'yes',
  };
}

let work: string;
let state: string;

function sh(path: string, lines: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...lines].join('\n') + '\n');
  chmodSync(path, 0o755);
}

function writeHost(facts: Record<string, string>): void {
  writeFileSync(join(state, 'host.status'), Object.entries(facts).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

function hostFacts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(state, 'host.status'), 'utf-8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

/** Bash a sibling stand-in sources on the named event, before it exits. */
function hook(event: string, lines: string[]): void {
  writeFileSync(join(state, 'hook', event), lines.join('\n') + '\n');
}

/** Facts a stand-in applies to the host when the named event happens. */
function onEvent(event: string, facts: Record<string, string>): void {
  writeFileSync(join(state, 'fix', event), Object.entries(facts).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

// Shared by every stand-in: merge state/fix/<event> into the host's facts.
const APPLY_FIX = [
  'apply_fix() {',
  `  local f="${'$'}{STATE}/fix/$1" line key`,
  '  [[ -e "$f" ]] || return 0',
  '  while IFS= read -r line; do',
  '    [[ -n "$line" ]] || continue',
  '    key="${line%%=*}"',
  '    grep -v "^${key}=" "$STATE/host.status" > "$STATE/host.tmp" || true',
  '    printf "%s\\n" "$line" >> "$STATE/host.tmp"',
  '    cat "$STATE/host.tmp" > "$STATE/host.status"',
  '  done < "$f"',
  '}',
];

beforeEach(() => {
  work = createScratchDir('bootstrap-host');
  state = join(work, 'state');
  for (const d of ['state', 'state/sessions', 'state/fix', 'state/exit', 'bin', 'siblings', 'path', 'home/AWS']) {
    mkdirSync(join(work, d), { recursive: true });
  }

  // The stand-in host. It records every session's command line and stream, and
  // answers the status body, the identity question and the key-id question
  // from the facts in state/host.status.
  sh(join(work, 'bin', 'ssh'), [
    `STATE=${JSON.stringify(state)}`,
    ...APPLY_FIX,
    'f="$(mktemp "$STATE/sessions/s.XXXXXX")"',
    'printf "%s\\n" "$*" > "$f.args"',
    'cat > "$f"',
    'fact() { grep "^$1=" "$STATE/host.status" | tail -1 | cut -d= -f2-; }',
    'printf "ssh %s\\n" "$*" >> "$STATE/calls.log"',
    'case "$*" in',
    // The unprivileged login probe. The refusal text is OpenSSH's own format
    // ("%s@%s: Permission denied (%s)." in sshconnect2.c, exit 255); the
    // unreachable text is the client\'s connect failure.
    '  *FOOTBAG-LOGIN-OK*)',
    '    if [[ -e "$STATE/unreachable" ]]; then echo "ssh: connect to host 203.0.113.10 port 2222: Connection refused" >&2; exit 255; fi',
    '    if [[ -e "$STATE/login-refused" ]]; then echo "footbag@203.0.113.10: Permission denied (publickey,gssapi-keyex,gssapi-with-mic)." >&2; exit 255; fi',
    '    echo "---FOOTBAG-LOGIN-OK---" ;;',
    '  *footbag-bootstrap-status*)',
    '    [[ -e "$STATE/unreachable" ]] && exit 255',
    '    if [[ -e "$STATE/sudo-refused" ]]; then echo "sudo: 1 incorrect password attempt" >&2; exit 1; fi',
    '    echo "---FOOTBAG-BOOTSTRAP-STATUS---"; cat "$STATE/host.status"; echo "---FOOTBAG-END---" ;;',
    '  *footbag-host-identity*)',
    '    printf -- "---FOOTBAG-HOST-ENV---\\n%s\\n---FOOTBAG-HOST-URL---\\nhttps://example.test\\n---FOOTBAG-END---\\n" "$(fact FOOTBAG_ENV)" ;;',
    '  *footbag-bootstrap-account*)',
    '    [[ -e "$STATE/exit/account" ]] && exit "$(cat "$STATE/exit/account")"',
    '    rm -f "$STATE/unreachable" "$STATE/login-refused"; apply_fix account ;;',
    '  *footbag-bootstrap-provision*)',
    '    apply_fix "provision-$(grep "^MODE=" "$f" | cut -d= -f2)" ;;',
    '  *footbag-bootstrap-reboot*)',
    '    printf -- "---FOOTBAG-BOOT-ID---\\nold-boot\\n---FOOTBAG-END---\\n"; apply_fix reboot ;;',
    // Stopping the live host's writes: its last backup lands in the bucket now,
    // unless the case says the backup service fails.
    '  *footbag-bootstrap-quiesce*)',
    '    mode="$(grep "^MODE=" "$f" | cut -d= -f2)"',
    '    if [[ "$mode" == stop ]]; then',
    '      [[ -e "$STATE/exit/quiesce" ]] && exit "$(cat "$STATE/exit/quiesce")"',
    '      [[ -e "$STATE/backup-fails" ]] || echo 0 > "$STATE/backup-age"',
    '      echo "---FOOTBAG-QUIESCED---"',
    '    fi ;;',
    '  *boot_id*) echo new-boot ;;',
    'esac',
    'exit 0',
  ]);

  // `ssh -G` on PATH, which is how the scripts read the alias's account and
  // address. It answers that question only.
  sh(join(work, 'path', 'ssh'), [
    'if [[ "${1:-}" == "-G" ]]; then',
    `  printf 'user footbag\\nhostname %s\\nport 2222\\n' "\${FAKE_ALIAS_HOST:-${IP}}"`,
    '  exit 0',
    'fi',
    'echo "path ssh stand-in: refusing to connect" >&2; exit 255',
  ]);

  // Terraform: plans exit as state/exit/plan-<tree> says (0 when absent), state
  // list answers state/tfstate, and output answers the address or the bucket.
  writeFileSync(join(state, 'tfstate'), 'aws_sns_topic_subscription.ses_feedback_feed[0]\n');
  sh(join(work, 'bin', 'terraform'), [
    `STATE=${JSON.stringify(state)}`,
    'echo "terraform $*" >> "$STATE/calls.log"',
    'tree=""; for a in "$@"; do case "$a" in -chdir=*) tree="$(basename "${a#-chdir=}")" ;; esac; done',
    'case "$*" in',
    '  *" plan "*) [[ -e "$STATE/exit/plan-$tree" ]] && exit "$(cat "$STATE/exit/plan-$tree")"; exit 0 ;;',
    '  *"state list"*) cat "$STATE/tfstate"; exit 0 ;;',
    '  *snapshots_bucket_name*) printf footbag-production-db-snapshots; exit 0 ;;',
    `  *lightsail_static_ip*) printf ${IP}; exit 0 ;;`,
    // The instance as Terraform records it: the original name, or the one a
    // restore from snapshot gave it when the case writes state/instance-name.
    '  *lightsail_instance_name*) if [[ -e "$STATE/instance-name" ]]; then cat "$STATE/instance-name"; else printf "footbag-%s-web" "$tree"; fi; exit 0 ;;',
    'esac',
    'exit 0',
  ]);

  // The AWS CLI.
  writeFileSync(join(state, `keys-footbag-staging-source-profile`), `${HOST_KEY}\n`);
  writeFileSync(join(state, `keys-footbag-staging-cwagent-publisher`), `${HOST_KEY}\n`);
  writeFileSync(join(state, `keys-footbag-production-source-profile`), `${HOST_KEY}\n`);
  writeFileSync(join(state, `keys-footbag-production-cwagent-publisher`), `${HOST_KEY}\n`);
  writeFileSync(join(state, 'marker'), 'false\n');
  sh(join(work, 'bin', 'aws'), [
    `STATE=${JSON.stringify(state)}`,
    'echo "aws $*" >> "$STATE/calls.log"',
    'user=""; prev=""; for a in "$@"; do [[ "$prev" == "--user-name" ]] && user="$a"; prev="$a"; done',
    'case "$1 $2" in',
    // The inactive keys answer the Status filter; every other listing answers
    // all of the user\'s keys.
    '  "iam list-access-keys") if [[ "$*" == *Inactive* ]]; then cat "$STATE/inactive-$user" 2>/dev/null; else cat "$STATE/keys-$user" 2>/dev/null; fi; exit 0 ;;',
    '  "ssm get-parameter") [[ -e "$STATE/marker" ]] || exit 255; cat "$STATE/marker"; exit 0 ;;',
    // A name Parameter Store does not hold comes back under InvalidParameters.
    '  "ssm get-parameters") [[ -e "$STATE/no-base-url" ]] && printf "%s\\n" "${4:-}"; exit 0 ;;',
    '  "lightsail get-instance") printf "running\\t%s\\n" "$(date -u -d "-30 days" +%Y-%m-%dT%H:%M:%S+00:00)"; exit 0 ;;',
    // Lines are name, createdAt, state. The listing honours the query's state
    // filter and its column list, as Lightsail would.
    '  "lightsail get-instance-snapshots")',
    '    [[ -e "$STATE/snapshots" ]] || exit 0',
    '    want="available"; [[ "$*" == *"\'pending\'"* ]] && want="available|pending"',
    '    grep -E "\\s(${want})$" "$STATE/snapshots" | { if [[ "$*" == *",state]"* ]]; then cat; else cut -f1,2; fi; }',
    '    exit 0 ;;',
    '  "lightsail create-instance-snapshot") date -u -d "-${FAKE_SNAP_CREATED_AGO:-0} seconds" +%Y-%m-%dT%H:%M:%S+00:00 > "$STATE/snapcreated"; exit 0 ;;',
    '  "lightsail get-instance-snapshot") printf "%s\\t%s\\n" "$(cat "$STATE/snapstate" 2>/dev/null || echo available)" "$(cat "$STATE/snapcreated" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S+00:00)"; exit 0 ;;',
    '  "s3api list-objects-v2") if [[ -e "$STATE/backup-age" ]]; then date -u -d "-$(cat "$STATE/backup-age") seconds" +%Y-%m-%dT%H:%M:%S+00:00; else echo None; fi; exit 0 ;;',
    'esac',
    'exit 0',
  ]);

  // Every sibling script, recording its arguments and the first line of its
  // stdin, applying the facts its success leaves, and exiting as told.
  const siblings = [
    'terraform-apply-all.sh', 'terraform-apply.sh', 'install-known-hosts.sh', 'set-host-env.sh',
    'install-host-credentials.sh', 'install-cwagent-staging.sh', 'install-cwagent-production.sh',
    'deploy_to_aws.sh', 'deploy-code.sh', 'restore-db.sh', 'install-backup-timer.sh', 'activate-notification-feeds.sh',
    'harden-sshd.sh', 'verify-cwagent-metrics.sh', 'verify-host-snapshots.sh', 'verify-host-env.sh',
  ];
  for (const name of siblings) {
    sh(join(work, 'siblings', name), [
      `STATE=${JSON.stringify(state)}`,
      ...APPLY_FIX,
      'line=""; [[ -t 0 ]] || IFS= read -r line || true',
      `printf '%s %s | stdin=%s\\n' ${JSON.stringify(name)} "$*" "$line" >> "$STATE/siblings.log"`,
      `ev=${JSON.stringify(name)}; for a in "$@"; do case "$a" in --check|--retire|--delete|--confirm|--apply|--rotate|--upgrade|--onto-empty|--first-install|--resume-erasure-replay) ev="${name}${'$'}{a}" ;; esac; done`,
      // A hook models what the real script does to the host or the account,
      // refusals included, so a run's verdict comes from the outcome it leaves.
      '[[ -e "$STATE/hook/$ev" ]] && source "$STATE/hook/$ev"',
      'apply_fix "$ev"',
      '[[ -e "$STATE/exit/$ev" ]] && exit "$(cat "$STATE/exit/$ev")"',
      'exit 0',
    ]);
  }

  // The restore, the first install and the production code deploy, each with
  // the precondition the real one holds the host to. The restore's erasure
  // replay runs in a container of the release, so it refuses a host the release
  // is not on, and it refuses a host that already holds a database; on success
  // it starts the service, whose unit stays disabled until the code deploy
  // enables it. A production code deploy fails its readiness check on a host
  // with no database.
  mkdirSync(join(state, 'hook'));
  hook('restore-db.sh--onto-empty', [
    'grep -qx "DB_FILE=present" "$STATE/host.status" && { echo "restore stand-in: a database exists" >&2; exit 1; }',
    '[[ -e "$STATE/release-installed" ]] || { echo "restore stand-in: no release on the host to replay the erasures in" >&2; exit 1; }',
    `printf '%s\\n' DB_FILE=present REPLAY_PENDING=no ${JSON.stringify(`CONTAINERS=${HEALTHY_CONTAINERS}`)} > "$STATE/fix/$ev"`,
  ]);
  hook('deploy-code.sh--first-install', [
    'grep -qx "DB_FILE=present" "$STATE/host.status" && { echo "first-install stand-in: a database exists" >&2; exit 1; }',
    'touch "$STATE/release-installed"',
  ]);
  hook('deploy_to_aws.sh', [
    'if [[ "$*" == *"--target production"* && "$*" != *--all-data* ]]; then',
    '  grep -qx "DB_FILE=present" "$STATE/host.status" || { echo "deploy stand-in: the stack did not report ready" >&2; exit 1; }',
    `  printf '%s\\n' SERVICE_ENABLED=enabled ${JSON.stringify(`CONTAINERS=${HEALTHY_CONTAINERS}`)} > "$STATE/fix/$ev"`,
    'fi',
  ]);
  writeFileSync(join(state, 'backup-age'), '60');

  writeFileSync(join(work, 'known_hosts'), `${IP} ssh-ed25519 AAAAstub\n`, { mode: 0o600 });
  writeFileSync(join(work, 'tfvars'), 'enable_feed_queues = false\n');
  writeFileSync(
    join(work, 'host-tools.env'),
    [
      'DOCKER_PACKAGE=docker', 'SQLITE_PACKAGE=sqlite', 'RSYNC_PACKAGE=rsync', 'AWSCLI_PACKAGE=awscli-2',
      `COMPOSE_VERSION=${COMPOSE}`, 'COMPOSE_URL=https://example.test/compose', `COMPOSE_SHA256=${DIGEST}`,
      `CWAGENT_VERSION=${CWAGENT}`, 'CWAGENT_URL=https://example.test/agent.rpm', `CWAGENT_SHA256=${DIGEST}`,
    ].join('\n') + '\n',
  );
  writeFileSync(join(work, 'credential.txt'), 'stub-sudo-pass\nSECOND-LINE-MARKER\n', { mode: 0o600 });
  writeHost(finishedHost('staging'));
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...NO_AWS_CREDENTIALS,
    ...awsIdentityStubEnv(work),
    PATH: `${join(work, 'path')}:${process.env.PATH ?? ''}`,
    HOME: join(work, 'home'),
    FOOTBAG_HOST_SSH_BIN: join(work, 'bin', 'ssh'),
    BOOTSTRAP_HOST_TF_BIN: join(work, 'bin', 'terraform'),
    TF_OUTPUT_BIN: join(work, 'bin', 'terraform'),
    BOOTSTRAP_HOST_AWS_BIN: join(work, 'bin', 'aws'),
    BOOTSTRAP_HOST_SCRIPTS_DIR: join(work, 'siblings'),
    BOOTSTRAP_HOST_TFVARS: join(work, 'tfvars'),
    BOOTSTRAP_HOST_POLL_SECS: '0',
    FOOTBAG_HOST_TOOLS_MANIFEST: join(work, 'host-tools.env'),
    FOOTBAG_KNOWN_HOSTS: join(work, 'known_hosts'),
    ...extra,
  };
}

/** A run with no terminal, the credential on stdin. */
function run(args: string[], extra: NodeJS.ProcessEnv = {}, input = 'stub-sudo-pass\n') {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(), encoding: 'utf-8', input, env: { ...process.env, ...env(extra) }, ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * A run under a pseudo-terminal: standard output and error are the terminal,
 * whose input already holds `typed`, and standard input is the credential file.
 */
function runTty(args: string[], typed = '', extra: NodeJS.ProcessEnv = {}) {
  const harness = join(work, 'pty.py');
  writeFileSync(harness, [
    'import fcntl, os, sys, termios',
    'cred, typed = sys.argv[1], sys.argv[2]',
    'argv = sys.argv[3:]',
    'master, slave = os.openpty()',
    'pid = os.fork()',
    'if pid == 0:',
    '    os.setsid()',
    '    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)',
    '    fd = os.open(cred, os.O_RDONLY)',
    '    os.dup2(fd, 0); os.dup2(slave, 1); os.dup2(slave, 2)',
    '    os.close(master)',
    "    os.execvp('bash', ['bash'] + argv)",
    'os.close(slave)',
    'if typed:',
    "    os.write(master, typed.encode().decode('unicode_escape').encode())",
    "out = b''",
    'while True:',
    '    try:',
    '        chunk = os.read(master, 4096)',
    '    except OSError:',
    '        break',
    '    if not chunk:',
    '        break',
    '    out += chunk',
    '_, status = os.waitpid(pid, 0)',
    'sys.stdout.buffer.write(out)',
    'sys.exit(os.waitstatus_to_exitcode(status))',
  ].join('\n'));
  const r = spawnSync('python3', ['-I', harness, join(work, 'credential.txt'), typed, SCRIPT, ...args], {
    cwd: process.cwd(), encoding: 'utf-8', env: { ...process.env, ...env(extra) }, ...SPAWN_GUARD,
  });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

/**
 * IAM as an installer leaves it, behind the installer's own refusals: a
 * rotation cannot mint a third key, a retirement refuses the key the host holds
 * and leaves the key inactive, a deletion takes only a key already inactive.
 */
function iamStandIn(installer: string, user: string, hostFact: 'CRED_KEY_ID' | 'CWAGENT_KEY_ID', rotateFix: string[]): void {
  const keys = `"$STATE/keys-${user}"`;
  const inactive = `"$STATE/inactive-${user}"`;
  hook(`${installer}--rotate`, [
    `held="$(tr -s '[:space:]' '\\n' < ${keys} 2>/dev/null | grep -c . || true)"`,
    '[[ "$held" -ge 2 ]] && { echo "iam stand-in: the user already holds two keys" >&2; exit 1; }',
    `printf '%s\\n' ${HOST_KEY} >> ${keys}`,
    `printf '%s\\n' ${rotateFix.map((l) => JSON.stringify(l)).join(' ')} > "$STATE/fix/$ev"`,
  ]);
  hook(`${installer}--upgrade`, []);
  hook(`${installer}--retire`, [
    'id="${*: -1}"',
    `[[ "$id" == "$(grep "^${hostFact}=" "$STATE/host.status" | cut -d= -f2-)" ]] && { echo "installer stand-in: that is the host's own key" >&2; exit 1; }`,
    `printf '%s\\n' "$id" >> ${inactive}`,
  ]);
  hook(`${installer}--delete`, [
    'id="${*: -1}"',
    `grep -qx -- "$id" ${inactive} 2>/dev/null || { echo "iam stand-in: $id is still active" >&2; exit 1; }`,
    `tr -s '[:space:]' '\\n' < ${keys} | grep -vx -- "$id" > "$STATE/keys.tmp" || true; cat "$STATE/keys.tmp" > ${keys}`,
    `grep -vx -- "$id" ${inactive} > "$STATE/keys.tmp" || true; cat "$STATE/keys.tmp" > ${inactive}`,
  ]);
}

function siblingCalls(): string[] {
  const p = join(state, 'siblings.log');
  return existsSync(p) ? readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean) : [];
}

function sessions(): Array<{ args: string; stream: string }> {
  const dir = join(state, 'sessions');
  return readdirSync(dir).filter((f) => !f.endsWith('.args')).map((f) => ({
    args: readFileSync(join(dir, `${f}.args`), 'utf-8'),
    stream: readFileSync(join(dir, f), 'utf-8'),
  }));
}

function setExit(event: string, code: number): void {
  writeFileSync(join(state, 'exit', event), `${code}\n`);
}

/** The row for one step, and the next-command line under it if there is one. */
function rowFor(out: string, title: string): { line: string; next: string } {
  const lines = out.split('\n');
  const i = lines.findIndex((l) => /^\s*\d+\.\s/.test(l) && l.includes(title));
  expect(i, `a row titled "${title}"`).toBeGreaterThanOrEqual(0);
  const next = lines[i + 1]?.trim().startsWith('next:') ? lines[i + 1] : '';
  return { line: lines[i], next };
}

describe('bootstrap-host.sh --status: the stand-in matches the real status body', () => {
  it('supplies exactly the facts the status body emits, no more and no fewer', () => {
    // Defect caught: the body stops reporting a fact (or renames it) and the
    // verdict that reads it keeps passing here on a value only the test
    // supplied, so a real host's missing step reads done.
    const emitted = [...readFileSync(STATUS_HALF, 'utf-8').matchAll(/^emit ([A-Z_]+) /gm)].map((m) => m[1]).sort();
    expect(Object.keys(finishedHost('staging')).sort()).toEqual(emitted);
  });
});

describe('bootstrap-host.sh --status: a finished host, then each step taken away', () => {
  it('reads every step done on a finished host and exits 0', () => {
    // The passing case for every removal below: without it, a status mode that
    // reported everything pending would pass them all.
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('Every step is done.');
    expect(r.stdout).not.toMatch(/\sPENDING\s/);
  });

  // Each row: how the step is taken away, the row's title, and the command its
  // pending row must name. Each removal reaches a different verdict branch.
  const removals: Array<{ step: string; title: string; next: RegExp; take: () => void }> = [
    { step: 'Terraform', title: 'Terraform', next: /terraform-apply-all\.sh --target staging/, take: () => setExit('plan-identity', 2) },
    { step: 'the pin', title: 'Pinned host key', next: /install-known-hosts\.sh --target staging/, take: () => setExit('install-known-hosts.sh--check', 1) },
    { step: 'the shared account', title: 'Shared account', next: /bootstrap-host\.sh --target staging/, take: () => writeFileSync(join(state, 'unreachable'), '') },
    { step: 'the second sshd port', title: 'Shared account', next: /bootstrap-host\.sh --target staging/, take: () => writeHost({ ...finishedHost('staging'), SSHD_PORTS: '22' }) },
    { step: 'the Compose plugin', title: 'Host tools', next: /bootstrap-host\.sh --target staging/, take: () => writeHost({ ...finishedHost('staging'), COMPOSE_VERSION: '2.20.0' }) },
    { step: 'the env file', title: '/srv/footbag and env file', next: /bootstrap-host\.sh/, take: () => writeHost({ ...finishedHost('staging'), ENV_FILE: 'root:root 644' }) },
    { step: 'the environment record', title: 'Host environment record', next: /set-host-env\.sh --target staging/, take: () => writeHost({ ...finishedHost('staging'), FOOTBAG_ENV: '' }) },
    { step: 'the database directory owner', title: 'Database directory', next: /bootstrap-host\.sh/, take: () => writeHost({ ...finishedHost('staging'), DB_DIR: '0:0' }) },
    { step: 'the credential chain', title: 'Host credential chain', next: /install-host-credentials\.sh --target staging --rotate/, take: () => writeHost({ ...finishedHost('staging'), CRED_CHAIN: 'fail' }) },
    { step: "the dead host's source key", title: 'Host credential chain', next: new RegExp(`--retire <id>.*${DEAD_KEY}`), take: () => writeFileSync(join(state, 'keys-footbag-staging-source-profile'), `${HOST_KEY}\t${DEAD_KEY}\n`) },
    { step: 'the agent', title: 'CloudWatch agent', next: /install-cwagent-staging\.sh --rotate/, take: () => writeHost({ ...finishedHost('staging'), CWAGENT_ACTIVE: 'inactive' }) },
    // A version bump on a host already publishing with the publisher's key is an
    // upgrade that keeps the key; only a host holding none needs a rotation.
    { step: 'the pinned agent version, on a host holding the publisher key', title: 'CloudWatch agent', next: /install-cwagent-staging\.sh --upgrade/, take: () => writeHost({ ...finishedHost('staging'), CWAGENT_VERSION: '1.0.0' }) },
    { step: 'the pinned agent version, on a host holding no publisher key', title: 'CloudWatch agent', next: /install-cwagent-staging\.sh --rotate/, take: () => writeHost({ ...finishedHost('staging'), CWAGENT_VERSION: '1.0.0', CWAGENT_KEY_ID: DEAD_KEY }) },
    { step: "the dead host's inactive source key", title: 'Host credential chain', next: new RegExp(`install-host-credentials\\.sh --target staging --delete <id>, for: ${DEAD_KEY}`), take: () => { writeFileSync(join(state, 'keys-footbag-staging-source-profile'), `${HOST_KEY}\t${DEAD_KEY}\n`); writeFileSync(join(state, 'inactive-footbag-staging-source-profile'), `${DEAD_KEY}\n`); } },
    { step: 'a backup object recent enough', title: 'Backup timer', next: /host-diagnostics\.sh --target staging/, take: () => writeFileSync(join(state, 'backup-age'), '3600') },
    { step: 'the queue addresses on the host', title: 'Notification feeds', next: /activate-notification-feeds\.sh --target staging --state on/, take: () => { writeFileSync(join(work, 'tfvars'), 'enable_feed_queues = true\n'); writeHost({ ...finishedHost('staging'), FEED_ALARM_QUEUE: 'unset' }); } },
    { step: 'the env file the verifier passes', title: 'Host environment record', next: /verify-host-env\.sh --target staging/, take: () => setExit('verify-host-env.sh', 1) },
    { step: 'sshd listening on the port its configuration names', title: 'Shared account', next: /bootstrap-host\.sh --target staging/, take: () => writeHost({ ...finishedHost('staging'), SSHD_LISTEN: '22' }) },
    { step: 'sshd listening on port 22 as its configuration names', title: 'Shared account', next: /bootstrap-host\.sh --target staging/, take: () => writeHost({ ...finishedHost('staging'), SSHD_LISTEN: '2222' }) },
    { step: 'the running sshd reloaded onto its configuration', title: 'sshd posture', next: /harden-sshd\.sh --target staging --apply/, take: () => writeHost({ ...finishedHost('staging'), SSHD_PORTS: '22 2222 2223' }) },
    { step: 'sudo taking the password on an account that logs in', title: 'Shared account', next: /check line 1 of .* the bootstrap|Lightsail browser console/, take: () => writeFileSync(join(state, 'sudo-refused'), '') },
    { step: 'the agent metrics', title: 'CloudWatch agent', next: /verify-cwagent-metrics\.sh --target staging/, take: () => setExit('verify-cwagent-metrics.sh', 1) },
    { step: 'a healthy worker', title: 'Deployed runtime', next: /deploy_to_aws\.sh --target staging --from-csv/, take: () => writeHost({ ...finishedHost('staging'), CONTAINERS: finishedHost('staging').CONTAINERS.replace('worker-1 Up 2 hours (healthy)', 'worker-1 Up 2 hours (unhealthy)') }) },
    { step: 'log shipping', title: 'Deployed runtime', next: /deploy_to_aws\.sh/, take: () => writeHost({ ...finishedHost('staging'), LOG_DRIVERS: 'footbag-web-1:json-file footbag-worker-1:awslogs footbag-nginx-1:awslogs' }) },
    { step: 'the service at boot', title: 'Deployed runtime', next: /deploy_to_aws\.sh/, take: () => writeHost({ ...finishedHost('staging'), SERVICE_ENABLED: 'disabled' }) },
    { step: 'the backup timer', title: 'Backup timer', next: /install-backup-timer\.sh --target staging/, take: () => writeHost({ ...finishedHost('staging'), TIMER_ACTIVE: 'inactive' }) },
    { step: 'the feeds the values file turns on', title: 'Notification feeds', next: /activate-notification-feeds\.sh --target staging --state on/, take: () => { writeFileSync(join(work, 'tfvars'), 'enable_feed_queues = true\n'); writeFileSync(join(state, 'tfstate'), 'aws_sqs_queue.other\n'); } },
    { step: 'the sshd posture', title: 'sshd posture', next: /harden-sshd\.sh --target staging --apply/, take: () => writeHost({ ...finishedHost('staging'), SSHD_PASSWORD: 'yes' }) },
    { step: 'the sshd confirmation', title: 'sshd posture', next: /harden-sshd\.sh --target staging --confirm/, take: () => writeHost({ ...finishedHost('staging'), SSHD_REVERT_PENDING: 'yes' }) },
    { step: 'the reboot that retires compressed swap', title: 'Swap', next: /bootstrap-host\.sh --target staging/, take: () => writeHost({ ...finishedHost('staging'), ZRAM_ACTIVE: 'yes' }) },
  ];

  it.each(removals)('reports $step pending with the command that finishes it', ({ title, next, take }) => {
    // Defect caught: a host missing this step reads done, so the operator is
    // told the host is ready when it is not.
    take();
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stdout).toBe(1);
    const row = rowFor(r.stdout, title);
    expect(row.line, row.line).toMatch(/\sPENDING\s/);
    expect(row.next, row.line).toMatch(next);
  });

  it('reports a missing recent snapshot pending, without counting it against a fresh host', () => {
    // The automatic snapshot appears a day after an instance is created, so a
    // just-built host is not failed for it; it is still shown, with its check.
    setExit('verify-host-snapshots.sh', 1);
    const r = run(['--target', 'staging', '--status']);
    const row = rowFor(r.stdout, 'Recent host snapshot');
    expect(row.line).toMatch(/\sPENDING\s/);
    expect(row.next).toMatch(/verify-host-snapshots\.sh --target staging/);
    expect(r.status).toBe(0);
  });

  it('names the rebuild deploy on production before go-live and the restore after it', () => {
    // Defect caught: a live production is told to run the rebuild deploy, which
    // would replace the member database, or a pre-live one is told to restore.
    writeHost({ ...finishedHost('production'), SERVICE_ENABLED: 'disabled' });
    const pre = run(['--target', 'production', '--status']);
    expect(rowFor(pre.stdout, 'Deployed runtime').next).toMatch(/deploy_to_aws\.sh --target production --all-data -W/);
    writeFileSync(join(state, 'marker'), 'true\n');
    const live = run(['--target', 'production', '--status']);
    const next = rowFor(live.stdout, 'Deployed runtime').next;
    expect(next).toMatch(/bootstrap-host\.sh --target production/);
    expect(next).toMatch(/restore-db\.sh --onto-empty/);
    expect(next).not.toMatch(/--all-data/);
  });

  it('keeps compressed swap on production without asking for a reboot', () => {
    // Production deliberately keeps its compressed swap; only staging's is
    // suppressed, so the same fact must not read pending there.
    writeHost({ ...finishedHost('production'), ZRAM_ACTIVE: 'yes' });
    const r = run(['--target', 'production', '--status']);
    expect(rowFor(r.stdout, 'Swap').line).toMatch(/\sDONE\s/);
  });

  it('flags a host that records the other environment, and exits non-zero', () => {
    // Defect caught: an alias pointing at the other host reports that host's
    // rows under this environment's name, and reads them as fine.
    writeHost({ ...finishedHost('staging'), FOOTBAG_ENV: 'production' });
    const r = run(['--target', 'staging', '--status']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/records FOOTBAG_ENV=production/);
    expect(rowFor(r.stdout, 'Host environment record').line).toMatch(/\sPENDING\s/);
  });

  it('names the instance Terraform records, which a restore from snapshot renames', () => {
    // Defect caught: the report names the original instance after a restore
    // brought the host back under a new name, so the operator is pointed at the
    // stopped old host.
    writeFileSync(join(state, 'instance-name'), 'footbag-staging-web-r202601010000');
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(rowFor(r.stdout, 'Pinned host key').line).toContain('footbag-staging-web-r202601010000');
  });

  it('reads the host rows as unknown, never done, without the credential', () => {
    const r = run(['--target', 'staging', '--status'], {}, '');
    // Spawned with an empty stdin, which is not a terminal; the password line is
    // empty, so the shared rule refuses rather than probing with nothing.
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/first line of stdin was empty/);
  });
});

describe('bootstrap-host.sh: argument and identity refusals', () => {
  it('requires a target and has no default', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target is required/);
  });

  it('refuses status and replacement in one run', () => {
    const r = run(['--target', 'staging', '--status', '--replace-instance']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/separate runs/);
  });

  it('refuses an assumed role, before anything is read or changed', () => {
    // Defect caught: the job role starts a bootstrap and fails partway, after
    // the Terraform step, on the first key it may not mint.
    const r = run(['--target', 'staging', '--status'], awsIdentityStubEnv(join(work, 'home'), {
      arn: 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/someone',
    }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/assumed role/);
    expect(sessions()).toHaveLength(0);
  });

  it('refuses the bootstrap without a terminal, before anything changes', () => {
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/needs a terminal/);
    expect(siblingCalls()).toHaveLength(0);
    expect(sessions()).toHaveLength(0);
  });
});

describe('bootstrap-host.sh: the bootstrap', () => {
  it('on a finished host proves every step and changes nothing, then names the milestones', () => {
    // The passing case for the refusals and first-run cases below. Defect
    // caught: a re-run repeats work it should have proved done, minting keys,
    // redeploying or rebooting a host that needed none of it.
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const calls = siblingCalls().map((c) => c.split(' ')[0]);
    expect(calls.filter((c) => !['terraform-apply-all.sh', 'install-known-hosts.sh', 'verify-cwagent-metrics.sh', 'verify-host-snapshots.sh', 'verify-host-env.sh'].includes(c))).toEqual([]);
    const labels = sessions().map((s) => s.args);
    expect(labels.some((a) => /footbag-bootstrap-(account|provision|reboot)/.test(a))).toBe(false);
    expect(r.out).toMatch(/Stopped before the milestone-gated steps/);
    expect(r.out).toMatch(/The host is bootstrapped/);
  });

  it('sends only the password line to the host and to every sibling that reads one', () => {
    // Defect caught: a second line of the credential file reaches a remote root
    // shell as a command, or a sibling reads past the password.
    runTty(['--target', 'staging']);
    for (const s of sessions()) {
      expect(s.stream).not.toContain('SECOND-LINE-MARKER');
      expect(s.args).not.toContain('stub-sudo-pass');
    }
    for (const c of siblingCalls()) {
      expect(c).not.toContain('SECOND-LINE-MARKER');
    }
  });

  it('on production names payments, first admin and the cutover alarm as the steps it stops before', () => {
    writeHost(finishedHost('production'));
    const r = runTty(['--target', 'production']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/activate-payments\.sh/);
    expect(r.out).toMatch(/admin-bootstrap-token\.sh/);
    expect(r.out).toMatch(/enable_cutover_login_alarm = true/);
    expect(siblingCalls().some((c) => /activate-payments|admin-bootstrap/.test(c))).toBe(false);
  });

  it('logs in first as ec2-user on port 22, carrying the password on the stream', () => {
    // A fresh instance answers only as ec2-user on 22. Defect caught: the
    // password travels in an argument, or the step is skipped and every later
    // step fails against an account that does not exist.
    writeFileSync(join(state, 'unreachable'), '');
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const login = sessions().find((s) => s.args.includes('footbag-bootstrap-account'));
    expect(login, 'a first-login session').toBeTruthy();
    expect(login!.args).toMatch(/-p 22 -l ec2-user footbag-staging/);
    expect(login!.args).toMatch(/sudo -n bash/);
    expect(login!.stream.split('\n')[0]).toMatch(/^FOOTBAG_PASSWORD=stub-sudo-pass$/);
    expect(login!.args).not.toContain('stub-sudo-pass');
  });

  it('stops when the first login does not leave the account answering', () => {
    writeFileSync(join(state, 'unreachable'), '');
    setExit('account', 255);
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/first login as ec2-user .* did not complete/);
    expect(sessions().some((s) => s.args.includes('footbag-bootstrap-provision'))).toBe(false);
  });

  it('installs the pinned tools when they are missing, and goes on only once they read done', () => {
    // Defect caught: the step is reported done because the install command ran,
    // not because docker and the pinned Compose plugin are actually there.
    writeHost({ ...finishedHost('staging'), COMPOSE_VERSION: 'none' });
    onEvent('provision-packages', { COMPOSE_VERSION: COMPOSE.slice(1) });
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const p = sessions().find((s) => s.args.includes('footbag-bootstrap-provision'));
    expect(p!.stream).toMatch(new RegExp(`^COMPOSE_SHA256=${DIGEST}$`, 'm'));
    expect(p!.stream.split('\n')[0]).toBe('stub-sudo-pass');
  });

  it('refuses when the tools still read missing after their install', () => {
    writeHost({ ...finishedHost('staging'), COMPOSE_VERSION: 'none' });
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Host tools still reads PENDING/);
  });

  it('refuses a placeholder pin before anything changes', () => {
    writeFileSync(join(work, 'host-tools.env'),
      readFileSync(join(work, 'host-tools.env'), 'utf-8').replace(`COMPOSE_SHA256=${DIGEST}`, 'COMPOSE_SHA256=REPLACE_WITH_SHA256'));
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/COMPOSE_SHA256 .* still a placeholder/);
    expect(siblingCalls()).toHaveLength(0);
    expect(sessions()).toHaveLength(0);
  });

  it('refuses an alias that points somewhere other than Terraform says, before reaching the host', () => {
    const r = runTty(['--target', 'staging'], '', { FAKE_ALIAS_HOST: '198.51.100.99' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/names '198\.51\.100\.99', but Terraform reports 203\.0\.113\.10/);
    expect(sessions()).toHaveLength(0);
  });

  it('refuses a host that records the other environment, before changing it', () => {
    writeHost({ ...finishedHost('staging'), FOOTBAG_ENV: 'production', COMPOSE_VERSION: 'none' });
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
    expect(sessions().some((s) => s.args.includes('footbag-bootstrap-provision'))).toBe(false);
  });

  it('gives a rebuilt host its own key and retires the dead host\'s, deleting it only on a later run', () => {
    // Defects caught: a rebuild ends with the dead host's key still active; the
    // retirement reaches the installer without the target it requires; or the
    // key is deleted in the same run that deactivated it, before anything that
    // still held it had a chance to fail visibly while it could be switched back.
    writeHost({ ...finishedHost('staging'), CRED_CHAIN: 'fail', CRED_KEY_ID: '' });
    writeFileSync(join(state, 'keys-footbag-staging-source-profile'), `${DEAD_KEY}\n`);
    iamStandIn('install-host-credentials.sh', 'footbag-staging-source-profile', 'CRED_KEY_ID', ['CRED_CHAIN=ok', `CRED_KEY_ID=${HOST_KEY}`]);
    const first = runTty(['--target', 'staging']);
    const creds = () => siblingCalls().filter((c) => c.startsWith('install-host-credentials.sh'));
    expect(creds(), first.out).toEqual([
      'install-host-credentials.sh --target staging --rotate | stdin=stub-sudo-pass',
      `install-host-credentials.sh --target staging --retire ${DEAD_KEY} | stdin=stub-sudo-pass`,
    ]);
    // The retired key is still on the user, so the run ends pending, naming its delete.
    expect(first.status).toBe(1);
    expect(first.out).toMatch(new RegExp(`--delete <id>, for: ${DEAD_KEY}`));

    rmSync(join(state, 'siblings.log'));
    const second = runTty(['--target', 'staging']);
    expect(second.status, second.out).toBe(0);
    expect(creds()).toEqual([`install-host-credentials.sh --target staging --delete ${DEAD_KEY} | stdin=`]);
    expect(readFileSync(join(state, 'keys-footbag-staging-source-profile'), 'utf-8').trim()).toBe(HOST_KEY);
  });

  it('retires nothing while the host\'s own key id reads empty', () => {
    // Defect caught: with the host's key id empty every key on the user looks
    // unused, so the run deactivates the key the host is running on.
    writeHost({ ...finishedHost('staging'), CRED_KEY_ID: '' });
    writeFileSync(join(state, 'keys-footbag-staging-source-profile'), `${HOST_KEY}\t${DEAD_KEY}\n`);
    iamStandIn('install-host-credentials.sh', 'footbag-staging-source-profile', 'CRED_KEY_ID', []);
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/own key id reads empty/);
    expect(siblingCalls().some((c) => /install-host-credentials\.sh .*--(retire|delete)/.test(c))).toBe(false);
  });

  it('frees a key slot when the user holds two keys and the host neither, then rotates on the next run', () => {
    // Defect caught: a user holding the two keys IAM allows while the host holds
    // neither can never be rotated, and the retirement that would free a slot
    // demands a proof from a host that has no working key; the bootstrap loops on
    // a rotation IAM refuses.
    writeHost({ ...finishedHost('staging'), CRED_CHAIN: 'fail', CRED_KEY_ID: '' });
    writeFileSync(join(state, 'keys-footbag-staging-source-profile'), `${DEAD_KEY}\t${OTHER_DEAD_KEY}\n`);
    iamStandIn('install-host-credentials.sh', 'footbag-staging-source-profile', 'CRED_KEY_ID', ['CRED_CHAIN=ok', `CRED_KEY_ID=${HOST_KEY}`]);
    const creds = () => siblingCalls().filter((c) => c.startsWith('install-host-credentials.sh'));

    const first = runTty(['--target', 'staging']);
    expect(first.status).toBe(1);
    expect(creds(), first.out).toEqual([`install-host-credentials.sh --target staging --retire ${DEAD_KEY} | stdin=stub-sudo-pass`]);
    expect(first.out).toMatch(/Re-run this script/);

    rmSync(join(state, 'siblings.log'));
    const second = runTty(['--target', 'staging']);
    expect(creds(), second.out).toEqual([
      `install-host-credentials.sh --target staging --delete ${DEAD_KEY} | stdin=`,
      'install-host-credentials.sh --target staging --rotate | stdin=stub-sudo-pass',
      `install-host-credentials.sh --target staging --retire ${OTHER_DEAD_KEY} | stdin=stub-sudo-pass`,
    ]);
  });

  it('upgrades the agent for a version bump, keeping its key rather than rotating it', () => {
    // Defect caught: moving the agent's pin mints a new publisher key on every
    // host, leaving a rotation half-done for a package change.
    writeHost({ ...finishedHost('staging'), CWAGENT_VERSION: '1.0.0' });
    onEvent('install-cwagent-staging.sh--upgrade', { CWAGENT_VERSION: CWAGENT });
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(siblingCalls().filter((c) => c.startsWith('install-cwagent-staging.sh'))).toEqual([
      'install-cwagent-staging.sh --upgrade | stdin=stub-sudo-pass',
    ]);
  });

  it('on a live production fresh host installs the release, restores with its replay, then deploys, and a re-run changes nothing', () => {
    // Defects caught: the restore runs before any release is on the host, so its
    // erasure replay has nothing to run in and the pending marker holds the site
    // down; or the code deploy runs first, starting the stack on an empty
    // database that fails readiness and that the restore then refuses as not
    // empty; or the rebuild deploy runs against a live production at all.
    writeHost({ ...finishedHost('production'), DB_FILE: 'absent', CONTAINERS: '', SERVICE_ENABLED: 'disabled' });
    writeFileSync(join(state, 'marker'), 'true\n');
    const r = runTty(['--target', 'production'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    const deploys = siblingCalls().filter((c) => /^(restore-db|deploy_to_aws|deploy-code)/.test(c));
    expect(deploys).toEqual([
      'deploy-code.sh --first-install --target production | stdin=stub-sudo-pass',
      'restore-db.sh --target production --onto-empty | stdin=stub-sudo-pass',
      'deploy_to_aws.sh --target production | stdin=',
    ]);
    // The service is up from the restore, and the code deploy has enabled it.
    expect(hostFacts().DB_FILE).toBe('present');
    expect(hostFacts().SERVICE_ENABLED).toBe('enabled');

    rmSync(join(state, 'siblings.log'));
    const again = runTty(['--target', 'production']);
    expect(again.status, again.out).toBe(0);
    expect(siblingCalls().filter((c) => /^(restore-db|deploy_to_aws|deploy-code)/.test(c))).toEqual([]);
  });

  it('on a live production installs nothing without the typed APPLY', () => {
    writeHost({ ...finishedHost('production'), DB_FILE: 'absent', CONTAINERS: '', SERVICE_ENABLED: 'disabled' });
    writeFileSync(join(state, 'marker'), 'true\n');
    const r = runTty(['--target', 'production'], 'no\\n');
    expect(r.status).toBe(1);
    expect(siblingCalls().some((c) => /^(restore-db|deploy_to_aws|deploy-code)/.test(c))).toBe(false);
  });

  it('on a live production with its database in place runs only the code deploy, never a restore', () => {
    // Defect caught: a host whose database is already back is restored over, or
    // has the first install pushed at it.
    writeHost({ ...finishedHost('production'), SERVICE_ENABLED: 'disabled' });
    writeFileSync(join(state, 'marker'), 'true\n');
    const r = runTty(['--target', 'production']);
    expect(r.status, r.out).toBe(0);
    expect(siblingCalls().filter((c) => /^(restore-db|deploy_to_aws|deploy-code)/.test(c))).toEqual([
      'deploy_to_aws.sh --target production | stdin=',
    ]);
  });

  it('on production before go-live runs the full rebuild deploy', () => {
    writeHost({ ...finishedHost('production'), SERVICE_ENABLED: 'disabled' });
    onEvent('deploy_to_aws.sh', { SERVICE_ENABLED: 'enabled' });
    const r = runTty(['--target', 'production']);
    expect(r.status, r.out).toBe(0);
    expect(siblingCalls().filter((c) => c.startsWith('deploy_to_aws.sh'))[0]).toMatch(/--target production --all-data -W/);
    expect(siblingCalls().some((c) => c.startsWith('restore-db.sh'))).toBe(false);
  });

  it('refuses the production deploy step while the go-live marker cannot be read', () => {
    writeHost({ ...finishedHost('production'), SERVICE_ENABLED: 'disabled' });
    rmSync(join(state, 'marker'));
    const r = runTty(['--target', 'production']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not read the production-live marker/);
    expect(siblingCalls().some((c) => /^(restore-db|deploy_to_aws)/.test(c))).toBe(false);
  });

  it('confirms an sshd change left unconfirmed rather than applying it again', () => {
    writeHost({ ...finishedHost('staging'), SSHD_REVERT_PENDING: 'yes' });
    onEvent('harden-sshd.sh--confirm', { SSHD_REVERT_PENDING: 'no' });
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const harden = siblingCalls().filter((c) => c.startsWith('harden-sshd.sh'));
    expect(harden).toEqual(['harden-sshd.sh --target staging --confirm | stdin=stub-sudo-pass']);
  });

  it('reboots staging once, behind its own typed APPLY, to retire compressed swap, and proves the new boot', () => {
    writeHost({ ...finishedHost('staging'), ZRAM_ACTIVE: 'yes' });
    onEvent('reboot', { ZRAM_ACTIVE: 'no' });
    const r = runTty(['--target', 'staging'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    expect(sessions().filter((s) => s.args.includes('footbag-bootstrap-reboot'))).toHaveLength(1);
    expect(r.out).toMatch(/Type 'APPLY' to reboot footbag-staging/);
    expect(r.out).toMatch(/rebooted \(boot id new-boot\)/);
  });

  it('does not reboot staging without the typed APPLY', () => {
    // Defect caught: the reboot, which takes the site down, rides on no
    // confirmation of its own.
    writeHost({ ...finishedHost('staging'), ZRAM_ACTIVE: 'yes' });
    const r = runTty(['--target', 'staging'], 'no\\n');
    expect(r.status).toBe(1);
    expect(sessions().some((s) => s.args.includes('footbag-bootstrap-reboot'))).toBe(false);
  });

  it('activates the feeds the values file turns on, and is done only once the host holds the queue addresses', () => {
    // Defect caught: the step reads done on the subscription in Terraform state
    // alone, while the worker on the host has no queue address to poll.
    writeFileSync(join(work, 'tfvars'), 'enable_feed_queues = true\n');
    writeFileSync(join(state, 'tfstate'), 'aws_sqs_queue.other\n');
    writeHost({ ...finishedHost('staging'), FEED_SES_QUEUE: 'unset', FEED_ALARM_QUEUE: 'unset' });
    hook('activate-notification-feeds.sh', [
      'printf "%s\\n" "aws_sns_topic_subscription.ses_feedback_feed[0]" > "$STATE/tfstate"',
    ]);
    // The activation subscribes the queue, but its deploy never wrote the
    // addresses: the run must not call that done.
    const stuck = runTty(['--target', 'staging']);
    expect(siblingCalls().filter((c) => c.startsWith('activate-notification-feeds.sh'))).toEqual([
      'activate-notification-feeds.sh --target staging --state on | stdin=stub-sudo-pass',
    ]);
    expect(stuck.status).toBe(1);
    expect(stuck.out).toMatch(/notification feeds still read PENDING/);

    // Once its deploy has written them, the same run finishes.
    rmSync(join(state, 'siblings.log'));
    writeFileSync(join(state, 'tfstate'), 'aws_sqs_queue.other\n');
    onEvent('activate-notification-feeds.sh', { FEED_SES_QUEUE: 'set', FEED_ALARM_QUEUE: 'set' });
    const done = runTty(['--target', 'staging']);
    expect(done.status, done.out).toBe(0);
    expect(rowFor(done.out, 'Notification feeds').line).toMatch(/\sDONE\s/);
  });

  it('stops after the apply, naming the next step, while the environment publishes no site address', () => {
    // Defect caught: a brand-new environment's first pass, which has no
    // CloudFront and so no published address, provisions the host and then
    // fails deep inside the deploy.
    writeFileSync(join(state, 'no-base-url'), '');
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/publishes no \/footbag\/staging\/app\/public_base_url/);
    expect(r.out).toMatch(/enable_cloudfront = true/);
    expect(sessions()).toHaveLength(0);
    expect(siblingCalls().map((c) => c.split(' ')[0])).toEqual(['terraform-apply-all.sh']);
  });

  it('reports a sudo refusal on an account that logs in and never takes the first-login path', () => {
    // Defect caught: any failed probe read as "no account", so a wrong password
    // line on a working host sent the run down the ec2-user path, which reset
    // the shared account's sudo password to that line.
    writeFileSync(join(state, 'sudo-refused'), '');
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/sudo refuses the password/);
    expect(sessions().some((s) => s.args.includes('footbag-bootstrap-account'))).toBe(false);
  });

  it('takes the first-login path when the host refuses footbag\'s key', () => {
    writeFileSync(join(state, 'login-refused'), '');
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/footbag did not answer: login-refused/);
    expect(sessions().some((s) => s.args.includes('footbag-bootstrap-account'))).toBe(true);
  });
});

describe('bootstrap-host.sh --replace-instance', () => {
  function lightsailCalls(): string[] {
    const p = join(state, 'calls.log');
    return existsSync(p) ? readFileSync(p, 'utf-8').split('\n').filter((l) => l.startsWith('aws lightsail')) : [];
  }

  it('snapshots first, waits for it, asks for APPLY, then replaces through the apply wrapper', () => {
    // Defect caught: the instance is replaced with no snapshot of it, or before
    // the snapshot is complete, which loses everything only its disk held.
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    const created = lightsailCalls().find((c) => c.includes('create-instance-snapshot'));
    expect(created).toMatch(/--instance-name footbag-staging-web --instance-snapshot-name footbag-staging-web-pre-replace-\d{8}T\d{6}Z/);
    const snap = /--instance-snapshot-name (\S+)/.exec(created!)![1];
    expect(siblingCalls()).toEqual([
      `terraform-apply.sh --target staging --replace aws_lightsail_instance.web --instance-snapshot ${snap} | stdin=`,
    ]);
    expect(r.out).toContain(snap);
  });

  it('takes no snapshot and replaces nothing without the typed word', () => {
    const r = runTty(['--target', 'staging', '--replace-instance'], 'no\\n');
    expect(r.status).toBe(1);
    expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot'))).toBe(false);
    expect(siblingCalls()).toHaveLength(0);
  });

  it('replaces nothing while the snapshot is not complete', () => {
    writeFileSync(join(state, 'snapstate'), 'error\n');
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/is 'error', not complete/);
    expect(siblingCalls()).toHaveLength(0);
  });

  it('reuses a complete snapshot of this instance from the last hour rather than taking another', () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    writeFileSync(join(state, 'snapshots'), `footbag-staging-web-pre-replace-20990101T000000Z\t${recent}\tavailable\n`);
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot'))).toBe(false);
    expect(siblingCalls()[0]).toContain('--instance-snapshot footbag-staging-web-pre-replace-20990101T000000Z');
  });

  it('reuses a snapshot of this instance still being taken, rather than starting another', () => {
    // Defect caught: a re-run while a slow first snapshot is still pending
    // starts a second one, and every re-run after it another.
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    writeFileSync(join(state, 'snapshots'), `footbag-staging-web-pre-replace-20990101T000000Z\t${recent}\tpending\n`);
    writeFileSync(join(state, 'snapcreated'), recent);
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot'))).toBe(false);
    expect(siblingCalls()[0]).toContain('--instance-snapshot footbag-staging-web-pre-replace-20990101T000000Z');
  });

  it('hands the apply wrapper nothing older than it accepts, refusing a snapshot still pending past that', () => {
    // Defect caught: the wait outlasts the wrapper's two-hour limit, so the run
    // replaces nothing after a long wait, or hands over a snapshot the wrapper
    // must then refuse.
    writeFileSync(join(state, 'snapstate'), 'pending\n');
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n', {
      // Created long enough ago that only the age bound can end the wait.
      FAKE_SNAP_CREATED_AGO: '7000',
    });
    expect(r.status).toBe(1);
    // Ended by the age bound, on the first read, not by a count of polls.
    expect(r.out).toMatch(/is 'pending', not complete, after 11[0-9] minutes/);
    expect(siblingCalls()).toHaveLength(0);
  });

  it('snapshots and replaces the instance Terraform records, under the name a restore gave it', () => {
    // Defect caught: after a restore renamed the host, the route snapshots the
    // stopped old instance under the original name and the wrapper, which reads
    // the name from Terraform, refuses the snapshot's prefix.
    writeFileSync(join(state, 'instance-name'), 'footbag-staging-web-r202601010000');
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    const created = lightsailCalls().find((c) => c.includes('create-instance-snapshot'));
    expect(created).toMatch(/--instance-name footbag-staging-web-r202601010000 --instance-snapshot-name footbag-staging-web-r202601010000-pre-replace-/);
    expect(lightsailCalls().some((c) => /get-instance .*--instance-name footbag-staging-web /.test(`${c} `))).toBe(false);
  });

  it('never reuses a snapshot taken before the running instance was created', () => {
    // Defect caught: a snapshot of the host replaced last time, under the same
    // name, stands in for one of the host about to be replaced now.
    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    writeFileSync(join(state, 'snapshots'), `footbag-staging-web-pre-replace-20000101T000000Z\t${old}\tavailable\n`);
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot'))).toBe(true);
  });

  it('on a live production refuses while the newest backup is older than one interval', () => {
    // Defect caught: a live host is replaced while its backups have stopped,
    // and the members' writes since the last backup go with it.
    writeFileSync(join(state, 'marker'), 'true\n');
    writeFileSync(join(state, 'backup-age'), '3600');
    const r = runTty(['--target', 'production', '--replace-instance'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/older than one backup interval/);
    expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot'))).toBe(false);
  });

  it('on a live production stops the service and proves its last backup before the snapshot', () => {
    // Defect caught: the live host keeps taking writes between its last backup
    // and its destruction, and those writes are lost with it.
    writeHost(finishedHost('production'));
    writeFileSync(join(state, 'marker'), 'true\n');
    writeFileSync(join(state, 'backup-age'), '60');
    const r = runTty(['--target', 'production', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    const log = readFileSync(join(state, 'calls.log'), 'utf-8');
    const stop = log.indexOf('footbag-bootstrap-quiesce');
    expect(stop, 'a quiesce session').toBeGreaterThanOrEqual(0);
    expect(stop).toBeLessThan(log.indexOf('lightsail create-instance-snapshot'));
    const quiesce = sessions().find((s) => s.args.includes('footbag-bootstrap-quiesce'))!;
    expect(quiesce.stream).toMatch(/^MODE=stop$/m);
    expect(quiesce.stream.split('\n')[0]).toBe('stub-sudo-pass');
    expect(siblingCalls()[0]).toMatch(/^terraform-apply\.sh --target production --replace aws_lightsail_instance\.web/);
  });

  it('on a live production replaces nothing, and starts the service again, when no backup lands after the stop', () => {
    writeHost(finishedHost('production'));
    writeFileSync(join(state, 'marker'), 'true\n');
    writeFileSync(join(state, 'backup-age'), '60');
    writeFileSync(join(state, 'backup-fails'), '');
    const r = runTty(['--target', 'production', '--replace-instance'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/no backup object .* is newer than the stop/);
    expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot'))).toBe(false);
    const modes = sessions().filter((s) => s.args.includes('footbag-bootstrap-quiesce')).map((s) => /^MODE=(\w+)$/m.exec(s.stream)![1]);
    expect(modes.sort()).toEqual(['resume', 'stop']);
    expect(siblingCalls()).toHaveLength(0);
  });

  it('on production refuses while the go-live marker cannot be read', () => {
    rmSync(join(state, 'marker'));
    const r = runTty(['--target', 'production', '--replace-instance'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not read the production-live marker/);
    expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot'))).toBe(false);
  });

  it('refuses without a terminal', () => {
    const r = run(['--target', 'staging', '--replace-instance']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/needs a terminal/);
    expect(lightsailCalls()).toHaveLength(0);
  });

  it('keeps the host facts untouched: replacement reaches no host', () => {
    const before = hostFacts();
    runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(sessions()).toHaveLength(0);
    expect(hostFacts()).toEqual(before);
  });
});

/**
 * The root-side halves, run as an ordinary user against stand-ins for the host
 * tools they call, so what each decides is read from what it ran.
 */
describe('bootstrap-host remote halves, against stand-in host tools', () => {
  const ACCOUNT_HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-account-remote.sh');
  const PROVISION_HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-provision-remote.sh');
  let tools: string;
  let log: string;

  function tool(name: string, lines: string[]): void {
    sh(join(tools, name), [`LOG=${JSON.stringify(log)}`, 'printf "%s %s\\n" "$(basename "$0")" "$*" >> "$LOG"', ...lines]);
  }
  function runHalf(half: string, input: string, extra: NodeJS.ProcessEnv = {}) {
    const r = spawnSync('bash', ['-s'], {
      input: input + readFileSync(half, 'utf-8'),
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${tools}:${process.env.PATH ?? ''}`, ...extra },
      ...SPAWN_GUARD,
    });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  }
  function logged(): string {
    return existsSync(log) ? readFileSync(log, 'utf-8') : '';
  }

  beforeEach(() => {
    tools = join(work, 'tools');
    log = join(work, 'tools.log');
    mkdirSync(tools);
    mkdirSync(join(work, 'ec2/.ssh'), { recursive: true });
    mkdirSync(join(work, 'footbag-home'), { recursive: true });
    writeFileSync(join(work, 'ec2/.ssh/authorized_keys'), 'ssh-ed25519 AAAAstub operator\n');
  });

  describe('the shared account', () => {
    // sshd already listens on both ports, so the run goes straight to the
    // account; the password status comes from state/passwd-status.
    function accountTools(exists: boolean, passwdStatus: string): void {
      tool('systemctl', ['exit 0']);
      tool('sshd', ['[[ "$1" == -T ]] && printf "port 22\\nport 2222\\n"', 'exit 0']);
      tool('id', [
        `[[ "$1" == -nG ]] && { echo "footbag wheel"; exit 0; }`,
        exists ? 'exit 0' : '[[ -e "$LOG.created" ]] && exit 0; exit 1',
      ]);
      tool('useradd', ['touch "$LOG.created"']);
      tool('usermod', ['exit 0']);
      tool('getent', [
        `[[ "$2" == ec2-user ]] && echo "ec2-user:x:1000:1000::${join(work, 'ec2')}:/bin/bash"`,
        `[[ "$2" == footbag ]] && echo "footbag:x:1001:1001::${join(work, 'footbag-home')}:/bin/bash"`,
        'exit 0',
      ]);
      tool('install', ['[[ "$1" == -d ]] && { mkdir -p "${*: -1}"; exit 0; }', 'touch "${*: -1}"']);
      tool('chown', ['exit 0']);
      tool('chmod', ['exit 0']);
      tool('passwd', [`echo ${JSON.stringify(passwdStatus)}`]);
      tool('chpasswd', ['cat > "$LOG.chpasswd"']);
    }
    const PASSWORD = "FOOTBAG_PASSWORD='host-pass'\n";

    it('leaves an existing account\'s usable password as it is', () => {
      // Defect caught: a re-run that reached the first-login path on a working
      // host reset the shared account's sudo password. The status lines are
      // passwd -S's two documented forms: the second field P (shadow-utils) or
      // PS (the libuser passwd) for a usable password.
      for (const status of ['footbag PS 2026-01-01 0 99999 7 -1 (Password set, SHA512 crypt.)', 'footbag P 01/01/2026 0 99999 7 -1']) {
        rmSync(log, { force: true });
        rmSync(`${log}.chpasswd`, { force: true });
        accountTools(true, status);
        const r = runHalf(ACCOUNT_HALF, PASSWORD);
        expect(r.status, `${status}\n${r.out}`).toBe(0);
        expect(existsSync(`${log}.chpasswd`), status).toBe(false);
        expect(r.out).toMatch(/already has a usable password; left as it is/);
      }
    });

    it('sets the password on an account it created, and on one with no usable password', () => {
      accountTools(false, 'footbag LK 2026-01-01 0 99999 7 -1 (Password locked.)');
      const created = runHalf(ACCOUNT_HALF, PASSWORD);
      expect(created.status, created.out).toBe(0);
      expect(readFileSync(`${log}.chpasswd`, 'utf-8')).toBe('footbag:host-pass\n');

      rmSync(`${log}.chpasswd`);
      accountTools(true, 'footbag LK 2026-01-01 0 99999 7 -1 (Password locked.)');
      const locked = runHalf(ACCOUNT_HALF, PASSWORD);
      expect(locked.status, locked.out).toBe(0);
      expect(readFileSync(`${log}.chpasswd`, 'utf-8')).toBe('footbag:host-pass\n');
    });

    it('refuses rather than guesses when the password status cannot be read', () => {
      accountTools(true, '');
      const r = runHalf(ACCOUNT_HALF, PASSWORD);
      expect(r.status).toBe(1);
      expect(existsSync(`${log}.chpasswd`)).toBe(false);
    });
  });

  describe('the host tools', () => {
    function provisionTools(engine: 'none' | 'docker-ce'): void {
      tool('uname', ['echo x86_64']);
      // The distribution's docker package is not installed; on a host built from
      // the older runbook, Docker CE is, and nothing provides "docker".
      tool('rpm', ['[[ "$*" == *docker* ]] && exit 1', 'exit 0']);
      tool('docker', [
        '[[ "$1" == --version ]] && { ' + (engine === 'docker-ce' ? 'echo "Docker version 25.0.3, build 4debf41"; exit 0' : 'exit 127') + '; }',
        `[[ "$1 $2" == "compose version" ]] && { echo ${COMPOSE.slice(1)}; exit 0; }`,
        'exit 0',
      ]);
      tool('dnf', ['exit 0']);
      tool('systemctl', ['exit 0']);
      tool('id', ['exit 1']);
      tool('aws', ['exit 0']);
    }
    const PINS = [
      'MODE=packages', 'DOCKER_PACKAGE=docker', 'SQLITE_PACKAGE=sqlite', 'RSYNC_PACKAGE=rsync', 'AWSCLI_PACKAGE=awscli-2',
      `COMPOSE_VERSION=${COMPOSE}`, 'COMPOSE_URL=https://example.test/compose', `COMPOSE_SHA256=${DIGEST}`,
    ].join('\n') + '\n';

    it('does not install the distribution docker over an engine that is already there', () => {
      // Defect caught: a host carrying Docker CE from the older runbook is asked
      // to install the distribution's docker, replacing the engine every
      // container runs on.
      provisionTools('docker-ce');
      const r = runHalf(PROVISION_HALF, PINS);
      expect(r.status, r.out).toBe(0);
      expect(logged()).not.toMatch(/^dnf .*docker/m);
    });

    it('installs the distribution docker on a host with no engine', () => {
      provisionTools('none');
      const r = runHalf(PROVISION_HALF, PINS);
      expect(r.status, r.out).toBe(0);
      expect(logged()).toMatch(/^dnf install -y docker$/m);
    });
  });

  describe('the live host stopped for its replacement', () => {
    const QUIESCE_HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-quiesce-remote.sh');

    it('stops the service before its last backup, and reports done only once the backup ran', () => {
      // Defect caught: the backup runs while the site still writes, or the run
      // reports the host quiesced when its backup failed, and the replacement
      // destroys writes no backup holds.
      tool('systemctl', ['[[ "$1 $2" == "start footbag-backup.service" && -e "$LOG.backup-fails" ]] && exit 1', 'exit 0']);
      const ok = runHalf(QUIESCE_HALF, 'MODE=stop\n');
      expect(ok.status, ok.out).toBe(0);
      const order = logged().split('\n').filter(Boolean);
      expect(order).toEqual(['systemctl stop footbag', 'systemctl start footbag-backup.service']);
      expect(ok.out).toMatch(/^---FOOTBAG-QUIESCED---$/m);

      writeFileSync(`${log}.backup-fails`, '');
      const failed = runHalf(QUIESCE_HALF, 'MODE=stop\n');
      expect(failed.status).toBe(1);
      expect(failed.out).not.toMatch(/---FOOTBAG-QUIESCED---/);
    });
  });

  describe('the status body', () => {
    it('reads the ports the running sshd is bound to, and only sshd\'s', () => {
      // Defect caught: the port rows read sshd -T, the configuration a fresh
      // daemon would start with, so a drop-in never reloaded reads as listening.
      // Lines in the shape iproute2's ss prints with -H -l -t -n -p, captured
      // from a workstation and given sshd process columns.
      tool('ss', [
        'cat <<\'SS\'',
        'LISTEN 0      128          0.0.0.0:2222      0.0.0.0:*    users:(("sshd",pid=812,fd=3))',
        'LISTEN 0      128             [::]:22           [::]:*    users:(("sshd",pid=812,fd=5))',
        'LISTEN 0      4096    127.0.0.53%lo:53      0.0.0.0:*    users:(("systemd-resolve",pid=530,fd=14))',
        'SS',
      ]);
      // Every other host tool it reads answers nothing, so the run reaches no
      // daemon on this machine.
      for (const t of ['sshd', 'systemctl', 'docker', 'aws', 'swapon']) tool(t, ['exit 1']);
      const r = runHalf(STATUS_HALF, '');
      expect(r.out).toMatch(/^SSHD_LISTEN=22 2222$/m);
    });
  });
});
