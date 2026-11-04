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
const REMOTE_REPORT_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');

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
const SQLITE_PIN = '3.51.2';
const DOCKER_PIN = '25.0.16-1.amzn2023.0.5';
const AL_PIN = '2023.12.20261021';

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
    SQLITE_VERSION: SQLITE_PIN,
    DOCKER_RPM: DOCKER_PIN,
    AL_RELEASE: AL_PIN,
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
    CWAGENT_SUBSTATE: 'running',
    CWAGENT_NRESTARTS: '0',
    CWAGENT_LAST_ERROR: '',
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
    REBOOT_NEEDED: 'no',
    REBOOT_NEEDED_SAID: '',
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
    // A case can have the status body mark a problem on its standard error, as
    // the real body does for a read that failed.
    '    [[ -e "$STATE/status-warn" ]] && echo "---FOOTBAG-PROBLEM--- WARN stand-in status warning" >&2',
    '    echo "---FOOTBAG-BOOTSTRAP-STATUS---"; cat "$STATE/host.status"; echo "---FOOTBAG-END---" ;;',
    '  *footbag-host-identity*)',
    '    printf -- "---FOOTBAG-HOST-ENV---\\n%s\\n---FOOTBAG-HOST-URL---\\nhttps://example.test\\n---FOOTBAG-END---\\n" "$(fact FOOTBAG_ENV)" ;;',
    '  *footbag-bootstrap-account*)',
    '    [[ -e "$STATE/exit/account" ]] && exit "$(cat "$STATE/exit/account")"',
    '    if [[ -e "$STATE/exit/account-22" && "$*" == *"-p 22 "* ]]; then echo "ssh: connect to host 203.0.113.10 port 22: Connection timed out" >&2; exit 255; fi',
    '    rm -f "$STATE/unreachable" "$STATE/login-refused"; apply_fix account ;;',
    // The provision half: the release preview answers the package count the
    // case sets, and a case can have the half report a problem on its stream.
    '  *footbag-bootstrap-provision*)',
    '    mode="$(grep "^MODE=" "$f" | cut -d= -f2)"',
    '    echo "provision $mode" >> "$STATE/calls.log"',
    '    if [[ "$mode" == preview ]]; then',
    '      [[ -e "$STATE/exit/preview" ]] && { echo "---FOOTBAG-PROBLEM--- ERROR preview stand-in: dnf check-update failed" >&2; exit "$(cat "$STATE/exit/preview")"; }',
    '      printf -- "---FOOTBAG-UPGRADE-COUNT---\\n%s\\n---FOOTBAG-END---\\n" "$(cat "$STATE/upgrade-count" 2>/dev/null || echo 0)"; exit 0',
    '    fi',
    '    [[ -e "$STATE/provision-problem" ]] && cat "$STATE/provision-problem" >&2',
    '    apply_fix "provision-$mode" ;;',
    '  *footbag-reboot*)',
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
    '    [[ -e "$STATE/snapshots-list-fails" ]] && { echo "An error occurred (AccessDeniedException) when calling the GetInstanceSnapshots operation: stand-in refusal" >&2; exit 254; }',
    '    [[ -e "$STATE/snapshots" ]] || exit 0',
    '    want="available"; [[ "$*" == *"\'pending\'"* ]] && want="available|pending"',
    '    grep -E "\\s(${want})$" "$STATE/snapshots" | { if [[ "$*" == *",state]"* ]]; then cat; else cut -f1,2; fi; }',
    '    exit 0 ;;',
    '  "lightsail create-instance-snapshot") date -u -d "-${FAKE_SNAP_CREATED_AGO:-0} seconds" +%Y-%m-%dT%H:%M:%S+00:00 > "$STATE/snapcreated"; exit 0 ;;',
    '  "lightsail get-instance-snapshot") printf "%s\\t%s\\n" "$(cat "$STATE/snapstate" 2>/dev/null || echo available)" "$(cat "$STATE/snapcreated" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S+00:00)"; exit 0 ;;',
    '  "s3api list-objects-v2") if [[ -e "$STATE/backup-time" ]]; then cat "$STATE/backup-time"; elif [[ -e "$STATE/backup-age" ]]; then date -u -d "-$(cat "$STATE/backup-age") seconds" +%Y-%m-%dT%H:%M:%S+00:00; else echo None; fi; exit 0 ;;',
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
    'build-sqlite3.sh',
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
    join(work, 'tool-versions.env'),
    [
      'DOCKER_PACKAGE=docker', `DOCKER_ENGINE_HOST=${DOCKER_PIN}`, `AMAZON_LINUX_RELEASE=${AL_PIN}`,
      `SQLITE_VERSION=${SQLITE_PIN}`, 'RSYNC_PACKAGE=rsync', 'AWSCLI_PACKAGE=awscli-2',
      `COMPOSE_VERSION=${COMPOSE}`, 'COMPOSE_URL=https://example.test/compose', `COMPOSE_SHA256=${DIGEST}`,
      `CWAGENT_VERSION=${CWAGENT}`, 'CWAGENT_URL=https://example.test/agent.rpm', `CWAGENT_SHA256=${DIGEST}`,
    ].join('\n') + '\n',
  );
  writeFileSync(join(work, 'credential.txt'), 'stub-sudo-pass\nSECOND-LINE-MARKER\n', { mode: 0o600 });
  // The binary the workstation would build and ship; its bytes only have to
  // survive the trip, so a marker stands in for the real build.
  writeFileSync(join(work, 'sqlite3-built'), 'BUILT-SQLITE3-MARKER\n');
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
    FOOTBAG_TOOL_VERSIONS: join(work, 'tool-versions.env'),
    FOOTBAG_KNOWN_HOSTS: join(work, 'known_hosts'),
    BOOTSTRAP_HOST_SQLITE3_BIN: join(work, 'sqlite3-built'),
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

/** The closing report: everything from its heading to the end of the output. */
function closingReport(out: string): string {
  const at = out.lastIndexOf('Closing report');
  return at < 0 ? '' : out.slice(at);
}

/** The provision half's modes, in the order the run sent them. */
function provisionModes(): string[] {
  const p = join(state, 'calls.log');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8').split('\n').filter((l) => l.startsWith('provision ')).map((l) => l.slice('provision '.length));
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

  // A stopped agent is a failure with a cause, and the cause decides the
  // remedy. Defect caught: every stopped agent was advised a key rotation, so a
  // config the agent could not translate was answered with a new key and the
  // same failure.
  const stoppedAgent: Array<{ cause: string; facts: Record<string, string>; next: RegExp; notNext: RegExp }> = [
    {
      cause: 'a config its translator rejects, on a host holding the publisher key',
      facts: { CWAGENT_LAST_ERROR: '2026/11/01 01:34:42 E! Cannot translate JSON, ERROR is exit status 1' },
      next: /diagnose-cwagent\.sh --target staging, then .*install-cwagent-staging\.sh --upgrade/,
      notNext: /--rotate/,
    },
    {
      cause: 'credentials the service refuses',
      facts: { CWAGENT_LAST_ERROR: '2026-11-01T02:00:00Z E! cloudwatch: AccessDenied: User is not authorized to perform: cloudwatch:PutMetricData' },
      next: /install-cwagent-staging\.sh --rotate/,
      notNext: /--upgrade/,
    },
    {
      cause: 'a host holding none of the publisher keys',
      facts: { CWAGENT_KEY_ID: DEAD_KEY },
      next: /install-cwagent-staging\.sh --rotate/,
      notNext: /--upgrade/,
    },
  ];
  it.each(stoppedAgent)('reports a stopped agent FAILED, counted, with the remedy for $cause', ({ facts, next, notNext }) => {
    writeHost({ ...finishedHost('staging'), CWAGENT_ACTIVE: 'activating', CWAGENT_SUBSTATE: 'auto-restart', CWAGENT_NRESTARTS: '14', ...facts });
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stdout).toBe(1);
    const row = rowFor(r.stdout, 'CloudWatch agent');
    expect(row.line, row.line).toMatch(/\sFAILED\s/);
    expect(row.next, row.line).toMatch(next);
    expect(row.next, row.line).not.toMatch(notNext);
    expect(r.stdout).toMatch(/1 step\(s\) pending or unread/);
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
    expect(labels.some((a) => /footbag-bootstrap-(account|provision)|footbag-reboot/.test(a))).toBe(false);
    expect(r.out).toMatch(/Stopped before the milestone-gated steps/);
    expect(r.out).toMatch(/The host is bootstrapped/);
  });

  it('lists a problem the status body marked in the closing report, once however often the host is read', () => {
    // Defects caught: the status body's marked problems are thrown away with its
    // standard error, so a failed read on the host reads as a host in another
    // state with nothing said; or the run, which re-reads the host after every
    // step, lists the same problem once per read.
    writeFileSync(join(state, 'status-warn'), '');
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const statusSessions = sessions().filter((s) => s.args.includes('footbag-bootstrap-status'));
    expect(statusSessions.length).toBeGreaterThan(1);
    for (const s of statusSessions) {
      expect(s.stream).toBe(`stub-sudo-pass\n${readFileSync(REMOTE_REPORT_LIB, 'utf-8')}${readFileSync(STATUS_HALF, 'utf-8')}`);
    }
    const report = closingReport(r.out);
    expect(report.match(/status of footbag-staging: stand-in status warning/g) ?? []).toHaveLength(1);
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

  it('ships the pinned sqlite3 the workstation built, with every host pin, over the install pipe', () => {
    // Defect caught: the host installs whatever sqlite3 its distribution serves,
    // or a docker and release the list does not pin, because the pins never
    // reached the host's install step.
    writeHost({ ...finishedHost('staging'), SQLITE_VERSION: '3.40.0' });
    onEvent('provision-packages', { SQLITE_VERSION: SQLITE_PIN });
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const p = sessions().find((s) => s.args.includes('footbag-bootstrap-provision'));
    const shipped = /^SQLITE3_B64=(\S+)$/m.exec(p!.stream);
    expect(shipped, p!.stream).not.toBeNull();
    expect(Buffer.from(shipped![1], 'base64').toString()).toBe('BUILT-SQLITE3-MARKER\n');
    for (const pin of [`SQLITE_VERSION=${SQLITE_PIN}`, `DOCKER_ENGINE_HOST=${DOCKER_PIN}`, `AMAZON_LINUX_RELEASE=${AL_PIN}`]) {
      expect(p!.stream, pin).toMatch(new RegExp(`^${pin.replace(/[.]/g, '\\.')}$`, 'm'));
    }
  });

  it('reads the tools step pending while the host\'s sqlite3, docker or release differs from the list', () => {
    // Defect caught: a host on the distribution's older sqlite3, or an engine or
    // release other than the pinned one, reads as done because the tool exists.
    const offPins: Array<Record<string, string>> = [
      { SQLITE_VERSION: '3.40.0' }, { DOCKER_RPM: '25.0.14-1.amzn2023.0.1' }, { AL_RELEASE: '2023.11.20260901' },
    ];
    for (const off of offPins) {
      writeHost({ ...finishedHost('staging'), ...off });
      const r = run(['--target', 'staging', '--status']);
      const row = rowFor(r.stdout, 'Host tools');
      expect(row.line, JSON.stringify(off)).toMatch(/\sPENDING\s/);
    }
    writeHost(finishedHost('staging'));
    const ok = run(['--target', 'staging', '--status']);
    expect(rowFor(ok.stdout, 'Host tools').line).not.toMatch(/\sPENDING\s/);
  });

  it('refuses when the tools still read missing after their install', () => {
    writeHost({ ...finishedHost('staging'), COMPOSE_VERSION: 'none' });
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Host tools still reads PENDING/);
  });

  it('refuses a placeholder pin before anything changes', () => {
    writeFileSync(join(work, 'tool-versions.env'),
      readFileSync(join(work, 'tool-versions.env'), 'utf-8').replace(`COMPOSE_SHA256=${DIGEST}`, 'COMPOSE_SHA256=REPLACE_WITH_SHA256'));
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
    expect(sessions().filter((s) => s.args.includes('footbag-reboot'))).toHaveLength(1);
    expect(r.out).toMatch(/Type 'APPLY' to reboot footbag-staging/);
    expect(r.out).toMatch(/rebooted \(boot id new-boot\)/);
  });

  it('does not reboot staging without the typed APPLY', () => {
    // Defect caught: the reboot, which takes the site down, rides on no
    // confirmation of its own.
    writeHost({ ...finishedHost('staging'), ZRAM_ACTIVE: 'yes' });
    const r = runTty(['--target', 'staging'], 'no\\n');
    expect(r.status).toBe(1);
    expect(sessions().some((s) => s.args.includes('footbag-reboot'))).toBe(false);
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

describe('bootstrap-host.sh: the closing report', () => {
  it('fails the run when the provision half reports a problem mid-stream, though every step then reads done', () => {
    // Defect caught: a package scriptlet error the host printed scrolls past,
    // the steps all read done afterwards, and the run ends green. The passing
    // control is the run without the problem, which exits 0.
    writeHost({ ...finishedHost('staging'), COMPOSE_VERSION: 'none' });
    onEvent('provision-packages', { COMPOSE_VERSION: COMPOSE.slice(1) });
    writeFileSync(join(state, 'provision-problem'),
      '---FOOTBAG-PROBLEM--- ERROR dnf install: warning: %post(docker-stand-in) scriptlet failed, exit status 1\n');
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(1);
    expect(closingReport(r.out)).toContain('%post(docker-stand-in) scriptlet failed');

    rmSync(join(state, 'provision-problem'));
    writeHost({ ...finishedHost('staging'), COMPOSE_VERSION: 'none' });
    const clean = runTty(['--target', 'staging']);
    expect(clean.status, clean.out).toBe(0);
  });

  it('sends the remote reporting library ahead of every half that reports through it', () => {
    // Defect caught: a half calls the reporting functions the stream never
    // defined, so on the host it dies at its first problem with "command not
    // found" in place of the problem.
    writeHost({ ...finishedHost('staging'), COMPOSE_VERSION: 'none' });
    onEvent('provision-packages', { COMPOSE_VERSION: COMPOSE.slice(1) });
    writeFileSync(join(state, 'unreachable'), '');
    runTty(['--target', 'staging']);
    for (const label of ['footbag-bootstrap-provision', 'footbag-bootstrap-account']) {
      const s = sessions().find((x) => x.args.includes(label));
      expect(s, label).toBeTruthy();
      expect(s!.stream.indexOf('crr_finish()'), label).toBeGreaterThan(0);
      expect(s!.stream.indexOf('crr_finish()'), label).toBeLessThan(s!.stream.lastIndexOf('crr_finish'));
    }
  });

  it('lists a first login that failed on port 22 and went through on 2222', () => {
    // Defect caught: the operator's network drops port 22 and nothing says so,
    // so the next host's first login fails with no clue why.
    writeFileSync(join(state, 'unreachable'), '');
    setExit('account-22', 255);
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(closingReport(r.out)).toContain('port 22: Connection timed out');
  });

  it('removes the sqlite3 build directory it made, and gives the build no stdin', () => {
    // Defects caught: the build directory was made inside a subshell, so the
    // cleanup never saw it and every packages run left one behind; and the
    // build inherited the credential file as its stdin.
    hook('build-sqlite3.sh', [
      'out=""; prev=""; for a in "$@"; do [[ "$prev" == --output ]] && out="$a"; prev="$a"; done',
      'printf "BUILT-SQLITE3-MARKER\\n" > "$out"',
      'printf "%s\\n" "$out" > "$STATE/built-at"',
    ]);
    writeHost({ ...finishedHost('staging'), SQLITE_VERSION: '3.40.0' });
    onEvent('provision-packages', { SQLITE_VERSION: SQLITE_PIN });
    const r = runTty(['--target', 'staging'], '', { BOOTSTRAP_HOST_SQLITE3_BIN: '' });
    expect(r.status, r.out).toBe(0);
    const builtAt = readFileSync(join(state, 'built-at'), 'utf-8').trim();
    const p = sessions().find((s) => s.args.includes('footbag-bootstrap-provision'));
    expect(Buffer.from(/^SQLITE3_B64=(\S+)$/m.exec(p!.stream)![1], 'base64').toString()).toBe('BUILT-SQLITE3-MARKER\n');
    expect(existsSync(builtAt), builtAt).toBe(false);
    expect(existsSync(join(builtAt, '..')), builtAt).toBe(false);
    expect(siblingCalls().find((c) => c.startsWith('build-sqlite3.sh'))).toMatch(/\| stdin=$/);
  });
});

describe('bootstrap-host.sh: stepping the release on a host that is serving', () => {
  const OLD_RELEASE = '2023.11.20260901';

  it('previews the package count and asks for a typed APPLY before stepping the release', () => {
    // Defect caught: a re-run on a serving host upgrades every package under
    // the running containers with no warning of how much will change.
    writeHost({ ...finishedHost('staging'), AL_RELEASE: OLD_RELEASE });
    onEvent('provision-packages', { AL_RELEASE: AL_PIN });
    writeFileSync(join(state, 'upgrade-count'), '37\n');
    const r = runTty(['--target', 'staging'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    expect(provisionModes()).toEqual(['preview', 'packages']);
    expect(r.out).toMatch(/APPLY[^\n]*\b37\b/);
    // Defect caught: the preview arrives without the listing parser it counts
    // with, and every preview on a real host fails.
    const preview = sessions().find((s) => /^MODE=preview$/m.test(s.stream));
    const parser = readFileSync(join(process.cwd(), 'scripts/internal/dnf-check-update-remote.sh'), 'utf-8');
    const half = readFileSync(join(process.cwd(), 'scripts/internal/bootstrap-host-provision-remote.sh'), 'utf-8');
    expect(preview!.stream).toContain(`${parser}${half}`);
  });

  it('steps nothing without the typed APPLY', () => {
    writeHost({ ...finishedHost('staging'), AL_RELEASE: OLD_RELEASE });
    writeFileSync(join(state, 'upgrade-count'), '37\n');
    const r = runTty(['--target', 'staging'], 'no\\n');
    expect(r.status).toBe(1);
    expect(provisionModes()).toEqual(['preview']);
  });

  it('asks nothing on a host with no containers running, which a fresh host is', () => {
    // The passing control: the confirmation guards a serving host, and a fresh
    // instance must still bootstrap unattended past it.
    writeHost({ ...finishedHost('staging'), AL_RELEASE: OLD_RELEASE, CONTAINERS: '' });
    onEvent('provision-packages', { AL_RELEASE: AL_PIN });
    onEvent('deploy_to_aws.sh', { CONTAINERS: HEALTHY_CONTAINERS });
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(provisionModes()).toEqual(['packages']);
  });

  it('steps nothing when the package count cannot be read, and reports why', () => {
    // Defect caught: a failed count reads as zero packages, and the upgrade
    // runs without the operator having seen what it would change.
    writeHost({ ...finishedHost('staging'), AL_RELEASE: OLD_RELEASE });
    setExit('preview', 1);
    const r = runTty(['--target', 'staging'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(provisionModes()).toEqual(['preview']);
    expect(closingReport(r.out)).toContain('dnf check-update failed');
  });
});

describe('bootstrap-host.sh: a reboot the updated packages need', () => {
  it('reports a pending reboot in the status closing report, and nothing on a host that needs none', () => {
    writeHost({ ...finishedHost('staging'), REBOOT_NEEDED: 'yes' });
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stderr).toBe(0);
    expect(closingReport(r.stderr)).toMatch(/needs-restarting/);

    writeHost(finishedHost('staging'));
    const none = run(['--target', 'staging', '--status']);
    expect(closingReport(none.stderr)).not.toMatch(/needs-restarting/);
  });

  it('reports an unreadable reboot check as an error, never as a reboot needed', () => {
    // Defect caught: a host without the check, or one where it failed, is told
    // it needs a reboot, or is reported fine.
    writeHost({ ...finishedHost('staging'), REBOOT_NEEDED: 'error', REBOOT_NEEDED_SAID: 'stand-in: No such command' });
    const r = run(['--target', 'staging', '--status']);
    expect(r.status).toBe(1);
    expect(closingReport(r.stderr)).toContain('stand-in: No such command');
  });

  it('reboots production when the packages need it, behind its own typed APPLY, and proves the new boot loaded them', () => {
    writeHost({ ...finishedHost('production'), REBOOT_NEEDED: 'yes' });
    onEvent('reboot', { REBOOT_NEEDED: 'no' });
    const r = runTty(['--target', 'production'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    expect(sessions().filter((s) => s.args.includes('footbag-reboot'))).toHaveLength(1);
    expect(r.out).toMatch(/rebooted \(boot id new-boot\)/);
  });

  it('does not reboot production without the typed APPLY', () => {
    writeHost({ ...finishedHost('production'), REBOOT_NEEDED: 'yes' });
    const r = runTty(['--target', 'production'], 'no\\n');
    expect(r.status).toBe(1);
    expect(sessions().some((s) => s.args.includes('footbag-reboot'))).toBe(false);
  });

  it('fails a reboot after which the host still reports one needed', () => {
    // Defect caught: the reboot is reported done on the new boot id alone,
    // while the kernel or libraries it was for are still not the running ones.
    writeHost({ ...finishedHost('production'), REBOOT_NEEDED: 'yes' });
    const r = runTty(['--target', 'production'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(sessions().filter((s) => s.args.includes('footbag-reboot'))).toHaveLength(1);
  });

  it('never reboots on an unreadable reboot check', () => {
    writeHost({ ...finishedHost('production'), REBOOT_NEEDED: 'error', REBOOT_NEEDED_SAID: 'stand-in: check failed' });
    const r = runTty(['--target', 'production'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(sessions().some((s) => s.args.includes('footbag-reboot'))).toBe(false);
    expect(closingReport(r.out)).toContain('stand-in: check failed');
  });
});

describe('bootstrap-host.sh: the reasons a check gives are kept', () => {
  it('shows the host env verifier\'s FAIL lines in its row', () => {
    // Defect caught: the row says the verifier failed and drops what it said,
    // so the operator has to run it again to learn which value differs.
    setExit('verify-host-env.sh', 1);
    hook('verify-host-env.sh', ['echo "  PASS  FOOTBAG_ENV matches"', 'echo "  FAIL  STAND_IN_KEY differs from Terraform"']);
    const r = run(['--target', 'staging', '--status']);
    const row = rowFor(r.stdout, 'Host environment record').line;
    expect(row).toContain('STAND_IN_KEY differs from Terraform');
    expect(row).not.toContain('FOOTBAG_ENV matches');
  });

  it('keeps a check on the closing-report library out of its own report, and still shows the check\'s reason', () => {
    // Defect caught: a probed check that reports through the shared library
    // folding its failure into this run's report on every probe, so a run fails
    // over a state its own step fixes, or the row loses the reason because the
    // check printed no FAIL line.
    setExit('verify-host-env.sh', 1);
    hook('verify-host-env.sh', [
      `source '${join(process.cwd(), 'scripts/lib/closing-report.sh')}'`,
      'cr_error "STAND_IN_VALUE could not be read on the host"',
      'cr_finish',
    ]);
    const r = run(['--target', 'staging', '--status']);
    expect(rowFor(r.stdout, 'Host environment record').line).toContain('STAND_IN_VALUE could not be read on the host');
    expect(closingReport(r.stdout + r.stderr)).not.toContain('STAND_IN_VALUE could not be read on the host');
  });

  it('shows the metrics check\'s reason in the agent row', () => {
    setExit('verify-cwagent-metrics.sh', 1);
    hook('verify-cwagent-metrics.sh', ['echo "  FAIL  stand_in_metric        footbag-staging          no datapoints"']);
    const r = run(['--target', 'staging', '--status']);
    expect(rowFor(r.stdout, 'CloudWatch agent').line).toContain('stand_in_metric');
  });
});

describe('bootstrap-host.sh --replace-instance: problems the old code swallowed', () => {
  it('takes a fresh snapshot when the existing ones cannot be listed, and says why', () => {
    // Defect caught: a failed listing read as "no snapshot to reuse", in
    // silence, so a permissions fault went unseen until it mattered.
    writeFileSync(join(state, 'snapshots-list-fails'), '');
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(join(state, 'calls.log'), 'utf-8')).toMatch(/lightsail create-instance-snapshot/);
    expect(closingReport(r.out)).toContain('AccessDeniedException');
  });

  it('refuses a newest backup whose time cannot be read, rather than calling it decades old', () => {
    // Defect caught: an unreadable time parsed as epoch 0, so the operator was
    // told the backups had stopped and sent to find out why.
    writeFileSync(join(state, 'marker'), 'true\n');
    writeFileSync(join(state, 'backup-time'), 'stand-in-not-a-time\n');
    const r = runTty(['--target', 'production', '--replace-instance'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(closingReport(r.out)).toContain('stand-in-not-a-time');
    expect(r.out).not.toMatch(/older than one backup interval/);
    expect(readFileSync(join(state, 'calls.log'), 'utf-8')).not.toMatch(/create-instance-snapshot/);
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
  // Every half is sent behind the remote reporting library, and the provision
  // half behind the dnf listing parser too, as the callers send them.
  const REMOTE_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');
  const DNF_PARSER = join(process.cwd(), 'scripts/internal/dnf-check-update-remote.sh');
  function runHalf(half: string, input: string, extra: NodeJS.ProcessEnv = {}) {
    const parser = half === PROVISION_HALF ? readFileSync(DNF_PARSER, 'utf-8') : '';
    const r = spawnSync('bash', ['-s'], {
      input: input + readFileSync(REMOTE_LIB, 'utf-8') + parser + readFileSync(half, 'utf-8'),
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
    type Engine = 'none' | 'docker-ce' | 'pinned' | 'other';
    interface HostTools {
      engine: Engine; release: string; distroSqlite: boolean; installedSqlite?: string;
      /** /etc/dnf/dnf.conf as the host holds it. */
      dnfConf?: string;
      /** A line dnf prints during an install. */
      dnfSays?: string;
      /** How `dnf check-update` answers: its exit status and its listing. */
      checkUpdate?: { rc: number; out: string };
    }
    let releaseFile: string;
    let sqliteTarget: string;
    let dnfConf: string;

    /** A host in the given state; the stand-ins answer the way the real tools do. */
    function provisionTools(h: HostTools): void {
      releaseFile = join(work, 'amazon-linux-release');
      sqliteTarget = join(work, 'usr-bin-sqlite3');
      dnfConf = join(work, 'dnf.conf');
      writeFileSync(dnfConf, h.dnfConf ?? '[main]\ngpgcheck=1\ninstallonly_limit=3\n');
      writeFileSync(releaseFile, `Amazon Linux release ${h.release} (Amazon Linux)\n`);
      rmSync(sqliteTarget, { force: true });
      if (h.installedSqlite) sh(sqliteTarget, [`echo "${h.installedSqlite} 2026-01-09 stub"`]);
      tool('uname', ['echo x86_64']);
      const dockerVer = h.engine === 'pinned' ? DOCKER_PIN : '25.0.14-1.amzn2023.0.1';
      const dockerRpm = h.engine === 'pinned' || h.engine === 'other';
      tool('rpm', [
        `if [[ "$*" == *--qf*docker* ]]; then ${dockerRpm ? `echo -n ${dockerVer}; exit 0` : 'echo "package docker is not installed"; exit 1'}; fi`,
        `[[ "$*" == "-q docker" ]] && exit ${dockerRpm ? 0 : 1}`,
        `[[ "$*" == "-q sqlite" ]] && exit ${h.distroSqlite ? 0 : 1}`,
        '[[ "$*" == *docker-* ]] && exit 1',
        'exit 0',
      ]);
      tool('docker', [
        '[[ "$1" == --version ]] && { ' + (h.engine === 'none' ? 'exit 127' : 'echo "Docker version 25.0.3, build 4debf41"; exit 0') + '; }',
        `[[ "$1 $2" == "compose version" ]] && { echo ${COMPOSE.slice(1)}; exit 0; }`,
        'exit 0',
      ]);
      // Stepping the release rewrites the release file, as the system-release
      // package does when the upgrade lands.
      tool('dnf', [
        `[[ "$1" == upgrade ]] && echo "Amazon Linux release ${AL_PIN} (Amazon Linux)" > ${JSON.stringify(releaseFile)}`,
        h.dnfSays ? `[[ "$1" == install ]] && echo ${JSON.stringify(h.dnfSays)}` : ':',
        h.checkUpdate
          ? `[[ "$1" == check-update ]] && { printf '%b' ${JSON.stringify(h.checkUpdate.out)}; exit ${h.checkUpdate.rc}; }`
          : ':',
        'exit 0',
      ]);
      tool('install', ['[[ "$1" == -d ]] && { mkdir -p "${*: -1}"; exit 0; }', 'cp "${@: -2:1}" "${@: -1}"']);
      tool('systemctl', ['exit 0']);
      tool('id', ['exit 1']);
      tool('aws', ['exit 0']);
    }
    /** The pins the workstation sends, with a shipped binary reporting `reports`. */
    function pins(reports = SQLITE_PIN, mode = 'packages'): string {
      const shipped = Buffer.from(`#!/bin/sh\necho "${reports} 2026-01-09 shipped"\n`).toString('base64');
      return [
        `MODE=${mode}`, `DNF_CONF=${dnfConf}`, 'DOCKER_PACKAGE=docker', `DOCKER_ENGINE_HOST=${DOCKER_PIN}`, `AMAZON_LINUX_RELEASE=${AL_PIN}`,
        `SQLITE_VERSION=${SQLITE_PIN}`, `SQLITE3_B64=${shipped}`, 'RSYNC_PACKAGE=rsync', 'AWSCLI_PACKAGE=awscli-2',
        `COMPOSE_VERSION=${COMPOSE}`, 'COMPOSE_URL=https://example.test/compose', `COMPOSE_SHA256=${DIGEST}`,
        `AL_RELEASE_FILE=${releaseFile}`, `SQLITE_INSTALL_PATH=${sqliteTarget}`,
      ].join('\n') + '\n';
    }

    it('brings a fresh host to every pin: the release, docker, and the shipped sqlite3', () => {
      // Defect caught: a host installs whatever its distribution serves today, so
      // its engine, its sqlite3 and its packages differ from the ones the suite
      // and staging proved.
      provisionTools({ engine: 'none', release: '2023.6.20241010', distroSqlite: true });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status, r.out).toBe(0);
      const log = logged();
      expect(log).toMatch(new RegExp(`^dnf upgrade -y --releasever=${AL_PIN.replace(/[.]/g, '\\.')}$`, 'm'));
      expect(log).toMatch(new RegExp(`^dnf install -y docker-${DOCKER_PIN.replace(/[.]/g, '\\.')}$`, 'm'));
      expect(log).toMatch(/^dnf remove -y sqlite$/m);
      expect(readFileSync(sqliteTarget, 'utf-8')).toContain(`${SQLITE_PIN} 2026-01-09 shipped`);
    });

    it('changes nothing on a host already at every pin', () => {
      const conf = '[main]\ngpgcheck=1\nexcludepkgs=sqlite\n';
      provisionTools({ engine: 'pinned', release: AL_PIN, distroSqlite: false, installedSqlite: SQLITE_PIN, dnfConf: conf });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status, r.out).toBe(0);
      expect(logged()).not.toMatch(/^dnf /m);
      expect(readFileSync(sqliteTarget, 'utf-8')).toContain('stub');
      expect(readFileSync(dnfConf, 'utf-8')).toBe(conf);
    });

    /** The half's marked error lines. */
    function problems(out: string): string[] {
      return out.split('\n').filter((l) => l.startsWith('---FOOTBAG-PROBLEM--- ERROR '));
    }

    it('refuses an engine that is not the pinned distribution package, replacing nothing', () => {
      // Defect caught: a host carrying Docker CE from an older runbook, or the
      // distribution's docker at another version, has its engine swapped by a
      // bootstrap, under every running container, as a side effect.
      for (const engine of ['docker-ce', 'other'] as const) {
        rmSync(log, { force: true });
        provisionTools({ engine, release: AL_PIN, distroSqlite: false, installedSqlite: SQLITE_PIN });
        const r = runHalf(PROVISION_HALF, pins());
        expect(r.status, engine).toBe(1);
        expect(problems(r.out), engine).toHaveLength(1);
        expect(logged(), engine).not.toMatch(/^dnf (install|remove)/m);
      }
    });

    it('names the release step it already took when it then refuses the engine', () => {
      // Defect caught: the refusal said nothing was installed after the release
      // upgrade had already changed every package on the host, so the operator
      // believed the host was as it had been.
      provisionTools({ engine: 'docker-ce', release: '2023.6.20241010', distroSqlite: false, installedSqlite: SQLITE_PIN });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status).toBe(1);
      expect(problems(r.out)).toHaveLength(1);
      expect(problems(r.out)[0]).toContain(AL_PIN);
      expect(problems(r.out)[0]).toContain('2023.6.20241010');

      // At the pin already, the same refusal names no release step.
      rmSync(log, { force: true });
      provisionTools({ engine: 'docker-ce', release: AL_PIN, distroSqlite: false, installedSqlite: SQLITE_PIN });
      const atPin = runHalf(PROVISION_HALF, pins());
      expect(problems(atPin.out)[0]).not.toContain(AL_PIN);
    });

    it('refuses a shipped sqlite3 that reports any version but the pin, before removing the distribution one', () => {
      // Defects caught: a binary built from the wrong source lands where the
      // backup and the deploy call it; or the distribution's sqlite3 is removed
      // first, so a bad shipment leaves the host with no sqlite3 at all.
      provisionTools({ engine: 'pinned', release: AL_PIN, distroSqlite: true });
      const r = runHalf(PROVISION_HALF, pins('3.40.0'));
      expect(r.status).toBe(1);
      expect(problems(r.out).join('\n')).toContain('3.40.0');
      expect(existsSync(sqliteTarget)).toBe(false);
      expect(logged()).not.toMatch(/^dnf remove/m);
    });

    it('keeps dnf from reinstalling the distribution sqlite, once, whatever else dnf.conf excludes', () => {
      // Defect caught: a later dnf transaction pulls the distribution sqlite
      // back in, and its older binary replaces the pinned one the backup runs.
      const cases: Array<{ before: string; expect: RegExp }> = [
        { before: '[main]\ngpgcheck=1\n', expect: /^excludepkgs=sqlite$/m },
        { before: '[main]\ngpgcheck=1\nexcludepkgs=kernel-debug\n', expect: /^excludepkgs=kernel-debug,sqlite$/m },
        // A package that only begins with the name is not the one excluded.
        { before: '[main]\nexcludepkgs=sqlite-tools\n', expect: /^excludepkgs=sqlite-tools,sqlite$/m },
      ];
      for (const c of cases) {
        rmSync(log, { force: true });
        provisionTools({ engine: 'pinned', release: AL_PIN, distroSqlite: true, dnfConf: c.before });
        const first = runHalf(PROVISION_HALF, pins());
        expect(first.status, `${c.before}\n${first.out}`).toBe(0);
        const after = readFileSync(dnfConf, 'utf-8');
        expect(after, c.before).toMatch(c.expect);
        // A re-run adds nothing more.
        const again = runHalf(PROVISION_HALF, pins());
        expect(again.status, again.out).toBe(0);
        expect(readFileSync(dnfConf, 'utf-8'), c.before).toBe(after);
      }
    });

    it('refuses rather than reports dnf.conf fixed when its own read-back cannot find the exclusion', () => {
      // Defect caught: the edit lands after a comment on the excludepkgs line,
      // where the read-back cannot see it, and the half reports the host safe
      // from a reinstall it has not shown is blocked.
      provisionTools({ engine: 'pinned', release: AL_PIN, distroSqlite: true, dnfConf: '[main]\nexcludepkgs=kernel-debug # stand-in note\n' });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status, r.out).toBe(1);
      expect(problems(r.out).join('\n')).toContain(dnfConf);
      expect(logged()).not.toMatch(/^dnf remove/m);
    });

    it('marks a scriptlet failure dnf prints and fails the half, though dnf itself exits 0', () => {
      // Defect caught: dnf reports a package's install script failing and exits
      // 0, and the half reports the host provisioned.
      provisionTools({
        engine: 'none', release: AL_PIN, distroSqlite: false, installedSqlite: SQLITE_PIN,
        dnfSays: 'warning: %post(docker-25.0.16) scriptlet failed, exit status 1',
      });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status, r.out).toBe(1);
      expect(problems(r.out).join('\n')).toContain('%post(docker-25.0.16) scriptlet failed');
    });

    it('counts the packages a release step would change, and reports a failed count as an error', () => {
      // Defect caught: a count that failed reads as nothing to upgrade, and the
      // confirmation the operator sees understates what the step changes. The
      // listing is in the name.arch version repo layout dnf prints.
      const listing = [
        '',
        'docker.x86_64                 25.0.16-1.amzn2023.0.6        amazonlinux',
        'kernel.x86_64                 6.1.150-170.amzn2023          amazonlinux',
        'openssl-libs.x86_64           1:3.2.2-1.amzn2023.0.3        amazonlinux',
        '',
      ].join('\n');
      const count = (out: string) => /---FOOTBAG-UPGRADE-COUNT---\n(\S*)/.exec(out)?.[1];

      provisionTools({ engine: 'pinned', release: '2023.6.20241010', distroSqlite: false, checkUpdate: { rc: 100, out: listing } });
      const some = runHalf(PROVISION_HALF, pins(SQLITE_PIN, 'preview'));
      expect(some.status, some.out).toBe(0);
      expect(count(some.out)).toBe('3');
      expect(logged()).not.toMatch(/^dnf upgrade/m);

      provisionTools({ engine: 'pinned', release: '2023.6.20241010', distroSqlite: false, checkUpdate: { rc: 0, out: '' } });
      expect(count(runHalf(PROVISION_HALF, pins(SQLITE_PIN, 'preview')).out)).toBe('0');

      provisionTools({ engine: 'pinned', release: '2023.6.20241010', distroSqlite: false, checkUpdate: { rc: 1, out: 'Error: stand-in repository unreachable' } });
      const failed = runHalf(PROVISION_HALF, pins(SQLITE_PIN, 'preview'));
      expect(failed.status).toBe(1);
      expect(count(failed.out)).toBeUndefined();
      expect(problems(failed.out).join('\n')).toContain('stand-in repository unreachable');
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
      // The caller lists the failure in its own report only if it is marked.
      expect(failed.out).toMatch(/^---FOOTBAG-PROBLEM--- ERROR /m);
      expect(ok.out).not.toMatch(/---FOOTBAG-PROBLEM---/);
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

    it('reads a needed reboot from the exit status of needs-restarting -r, and any other answer as an error', () => {
      // Defect caught: a host where the check is missing or failed is reported
      // as needing a reboot, or as needing none.
      for (const t of ['sshd', 'systemctl', 'docker', 'aws', 'swapon', 'ss']) tool(t, ['exit 1']);
      const cases: Array<{ help: number; rc: number; want: string; said?: RegExp }> = [
        { help: 0, rc: 1, want: 'yes' },
        { help: 0, rc: 0, want: 'no' },
        { help: 0, rc: 2, want: 'error', said: /stand-in check output/ },
        { help: 1, rc: 1, want: 'error', said: /stand-in: No such command/ },
      ];
      for (const c of cases) {
        tool('dnf', [
          '[[ "$*" == "needs-restarting --help" ]] && { ' + (c.help ? 'echo "stand-in: No such command: needs-restarting"; ' : '') + `exit ${c.help}; }`,
          `[[ "$*" == "needs-restarting -r" ]] && { echo "stand-in check output"; exit ${c.rc}; }`,
          'exit 1',
        ]);
        const r = runHalf(STATUS_HALF, '');
        expect(r.out, JSON.stringify(c)).toMatch(new RegExp(`^REBOOT_NEEDED=${c.want}$`, 'm'));
        const said = /^REBOOT_NEEDED_SAID=(.*)$/m.exec(r.out)?.[1] ?? '';
        if (c.said) expect(said, JSON.stringify(c)).toMatch(c.said);
        else expect(said, JSON.stringify(c)).toBe('');
      }
    });

    it('marks a read that failed as a warning, beside the facts, and still answers', () => {
      // Defect caught: sshd unable to print its configuration, or docker unable
      // to inspect the containers it lists as running, reads as an sshd on no
      // port or containers shipping no logs, with the tool's reason thrown away.
      for (const t of ['systemctl', 'aws', 'swapon', 'dnf']) tool(t, ['exit 1']);
      tool('sshd', ['echo "/etc/ssh/sshd_config line 9: stand-in bad option" >&2', 'exit 255']);
      tool('ss', ['exit 0']);
      tool('docker', [
        '[[ "$1" == ps && "$2" == -q ]] && { echo abc123; exit 0; }',
        '[[ "$1" == inspect ]] && { echo "Error response from daemon: stand-in inspect refusal" >&2; exit 1; }',
        'exit 1',
      ]);
      const r = runHalf(STATUS_HALF, '');
      expect(r.status, r.out).toBe(0);
      expect(r.out).toMatch(/^---FOOTBAG-END---$/m);
      expect(r.out).toMatch(/^---FOOTBAG-PROBLEM--- WARN sshd -T .*stand-in bad option$/m);
      expect(r.out).toMatch(/^---FOOTBAG-PROBLEM--- WARN docker inspect .*stand-in inspect refusal$/m);
      expect(r.out).toMatch(/^LOG_DRIVERS=$/m);

      // The passing control: the same reads succeeding mark nothing.
      tool('sshd', ['printf "port 22\\nport 2222\\n"']);
      tool('docker', [
        '[[ "$1" == ps && "$2" == -q ]] && { echo abc123; exit 0; }',
        '[[ "$1" == inspect ]] && { echo "/footbag-web-1:awslogs"; exit 0; }',
        'exit 1',
      ]);
      const ok = runHalf(STATUS_HALF, '');
      expect(ok.out).not.toMatch(/---FOOTBAG-PROBLEM---/);
      expect(ok.out).toMatch(/^LOG_DRIVERS=footbag-web-1:awslogs$/m);
    });
  });

  describe('the key-id body', () => {
    const KEYID_HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-keyid-remote.sh');
    function ask(file: string): string {
      return `CRED_FILE=${file}\nCRED_PROFILE=footbag-staging-source-profile\n`;
    }

    it('answers the key id the profile holds, and an empty one for a file that is not there', () => {
      const creds = join(work, 'credentials');
      writeFileSync(creds, `[footbag-staging-source-profile]\naws_access_key_id = ${HOST_KEY}\naws_secret_access_key = stub\n`);
      const r = runHalf(KEYID_HALF, ask(creds));
      expect(r.status, r.out).toBe(0);
      expect(r.out).toMatch(new RegExp(`^---FOOTBAG-KEY-ID---\\n${HOST_KEY}\\n---FOOTBAG-END---$`, 'm'));
      const none = runHalf(KEYID_HALF, ask(join(work, 'absent')));
      expect(none.status, none.out).toBe(0);
      expect(none.out).toMatch(/^---FOOTBAG-KEY-ID---\n\n---FOOTBAG-END---$/m);
    });

    it('marks an error, and gives no key id, when the file is there and cannot be read', () => {
      // Defect caught: an unreadable credentials file answers "no key", and the
      // installer tells the operator the host was rebuilt and its key must be
      // rotated, on a host whose key is in service.
      const creds = join(work, 'credentials');
      writeFileSync(creds, '[footbag-staging-source-profile]\n');
      tool('awk', ['echo "awk: stand-in: cannot open file" >&2', 'exit 2']);
      const r = runHalf(KEYID_HALF, ask(creds));
      expect(r.status).toBe(1);
      expect(r.out).not.toMatch(/---FOOTBAG-KEY-ID---/);
      expect(r.out).toMatch(/^---FOOTBAG-PROBLEM--- ERROR could not read the key id in .*: awk: stand-in: cannot open file$/m);
    });
  });
});
