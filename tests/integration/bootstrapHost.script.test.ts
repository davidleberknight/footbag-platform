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
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { spawnAtTerminal } from '../fixtures/ptySession';
import { createScratchDir } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/bootstrap-host.sh');
const STATUS_HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-status-remote.sh');
const REMOTE_REPORT_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');

const IP = '203.0.113.10';
// Key ids copied from the shapes the secret scan already allowlists. Each host
// key is distinct, per environment and per user, so a run that reads one
// profile's key for another's, or one environment's for the other's, holds the
// wrong id where the case looks.
const KEYS = {
  staging: { src: 'AKIAEXAMPLEEXAMPLE11', cw: 'AKIAEXAMPLEEXAMPLE12' },
  production: { src: 'AKIAEXAMPLEEXAMPLE21', cw: 'AKIAEXAMPLEEXAMPLE22' },
} as const;
const SRC_KEY = KEYS.staging.src;
const CW_KEY = KEYS.staging.cw;
const DEAD_KEY = 'AKIAEXAMPLEEXAMPLE02';
const OTHER_DEAD_KEY = 'AKIAEXAMPLEEXAMPLE03';
/** The key an installer's rotation would mint; no case here should see it. */
const MINTED_KEY = 'AKIAEXAMPLEEXAMPLE99';
const HEALTHY_CONTAINERS =
  'footbag-web-1 Up 2 hours (healthy), footbag-worker-1 Up 2 hours (healthy), '
  + 'footbag-image-1 Up 2 hours (healthy), footbag-nginx-1 Up 2 hours (healthy)';
const COMPOSE = 'v2.29.7';
const CWAGENT = '1.300050.0b1';
const DIGEST = 'a'.repeat(64);
const SQLITE_PIN = '3.51.2';
const DOCKER_PIN = '25.0.16-1.amzn2023.0.5';
const AL_PIN = '2023.12.20261021';
// The checksum a rebuild records for the schema file this release carries, the
// value the deploy step compares the host's database against.
const SCHEMA_SHA = createHash('sha256').update(readFileSync(join(process.cwd(), 'database/schema.sql'))).digest('hex');
const OTHER_SCHEMA_SHA = 'b'.repeat(64);

// The secrets the host's credential files hold, recognisable wherever they
// leak: an argument, a log, a file left behind.
const SRC_SECRET = 'secret-value-not-real-SOURCE';
const AGENT_SECRET = 'secret-value-not-real-AGENT';
/** The three credential files on the instance being replaced, by path under its root. */
const OLD_HOST_FILES: Record<string, string> = {
  'root/.aws/credentials': (['staging', 'production'] as const).map((t) =>
    `[footbag-${t}-source-profile]\naws_access_key_id = ${KEYS[t].src}\naws_secret_access_key = ${SRC_SECRET}\n`).join('\n'),
  'root/.aws/config': ['staging', 'production'].map((t) =>
    `[profile footbag-${t}-source-profile]\nregion = us-east-1\n\n[profile footbag-${t}-runtime]\n`
    + `role_arn = arn:aws:iam::000000000000:role/footbag-${t}-app-runtime\nsource_profile = footbag-${t}-source-profile\nregion = us-east-1\n\n`
    + `[profile footbag-${t}-logs]\nrole_arn = arn:aws:iam::000000000000:role/footbag-${t}-logs-publisher\nsource_profile = footbag-${t}-source-profile\nregion = us-east-1\n`).join('\n'),
  'etc/amazon-cloudwatch-agent.aws/credentials': (['staging', 'production'] as const).map((t) =>
    `[footbag-${t}-cwagent]\naws_access_key_id = ${KEYS[t].cw}\naws_secret_access_key = ${AGENT_SECRET}\n`).join('\n'),
};

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
    DISTRO_SQLITE: 'no',
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
    DB_SCHEMA_BASELINE: SCHEMA_SHA,
    DB_ADMINS: '1',
    FEED_SES_QUEUE: 'set',
    FEED_ALARM_QUEUE: 'set',
    CRED_CHAIN: 'ok',
    CRED_KEY_ID: KEYS[target].src,
    CWAGENT_ACTIVE: 'active',
    CWAGENT_ENABLED: 'enabled',
    CWAGENT_SUBSTATE: 'running',
    CWAGENT_NRESTARTS: '0',
    CWAGENT_LAST_ERROR: '',
    CWAGENT_VERSION: CWAGENT,
    CWAGENT_KEY_ID: KEYS[target].cw,
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
    // A pin left from the instance a replacement destroyed: every session is
    // refused, as OpenSSH refuses a changed host key, until the pin step runs.
    '[[ -e "$STATE/pin-stale" ]] && { echo "Host key verification failed." >&2; exit 255; }',
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
    '    if [[ -e "$STATE/unreachable" ]]; then echo "ssh: connect to host 203.0.113.10 port 2222: Connection refused" >&2; exit 255; fi',
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
    // The new instance's first login as ec2-user: down for as many tries as
    // state/fresh-down counts, or for good when it holds "forever".
    '  *FOOTBAG-FRESH-LOGIN-OK*)',
    '    if [[ -e "$STATE/fresh-down" ]]; then',
    '      n="$(cat "$STATE/fresh-down")"',
    '      if [[ "$n" == forever ]]; then echo "ssh: connect to host 203.0.113.10 port 22: Connection refused" >&2; exit 255; fi',
    '      if (( n > 0 )); then echo $(( n - 1 )) > "$STATE/fresh-down"; echo "ssh: connect to host 203.0.113.10 port 22: Connection refused" >&2; exit 255; fi',
    '    fi',
    '    echo "---FOOTBAG-FRESH-LOGIN-OK---" ;;',
    // The carry half runs for real, against stand-in host tools and a file
    // tree per instance: the instance being replaced answers as footbag
    // through sudo with the password line first, and the new one as ec2-user
    // whose sudo takes none.
    '  *footbag-bootstrap-carry*)',
    '    if [[ "$*" == *"sudo -k -S"* ]]; then',
    '      if [[ -e "$STATE/unreachable" ]]; then echo "ssh: connect to host 203.0.113.10 port 2222: Connection refused" >&2; exit 255; fi',
    // A case can have the old host answer the key read with lines of its own.
    '      [[ -e "$STATE/old-host-says" ]] && { cat "$STATE/old-host-says"; exit 0; }',
    '      tail -n +2 "$f" | CARRY_ROOT_DIR="$STATE/oldhost" PATH="$STATE/hosttools:$PATH" bash; exit $?',
    '    fi',
    // On the install, a case can copy the run's temp tree as it stands while
    // the keys are on their way, or have the session drop before the half says
    // anything.
    '    if grep -qx "MODE=install" "$f"; then',
    '      [[ -e "$STATE/snap-tmp" ]] && cp -a "$TMPDIR" "$STATE/tmpsnap"',
    '      [[ -e "$STATE/install-dies" ]] && { echo "Connection to 203.0.113.10 closed by remote host." >&2; exit 255; }',
    '    fi',
    // A case can have the new instance's image carry no aws CLI yet.
    '    nocli=""; [[ -e "$STATE/new-host-no-cli" ]] && nocli="$STATE/no-such-aws-cli"',
    '    CARRY_ROOT_DIR="$STATE/newhost" CARRY_AWS_BIN="${nocli}" PATH="$STATE/hosttools:$PATH" bash < "$f"; exit $? ;;',
    // The installers ask which key a credentials file holds; the answer is the
    // host's fact for that file.
    '  *footbag-host-key-id*)',
    '    if grep -q "^CRED_FILE=/etc/amazon-cloudwatch-agent" "$f"; then k="$(fact CWAGENT_KEY_ID)"; else k="$(fact CRED_KEY_ID)"; fi',
    '    printf -- "---FOOTBAG-KEY-ID---\\n%s\\n---FOOTBAG-END---\\n" "$k" ;;',
    // Stopping the live host's writes: its last backup lands in the bucket now,
    // unless the case says the backup service fails.
    '  *footbag-bootstrap-quiesce*)',
    '    mode="$(grep "^MODE=" "$f" | cut -d= -f2)"',
    '    if [[ "$mode" == stop ]]; then',
    '      [[ -e "$STATE/exit/quiesce" ]] && exit "$(cat "$STATE/exit/quiesce")"',
    '      [[ -e "$STATE/backup-fails" ]] || echo 0 > "$STATE/backup-age"',
    '      echo "---FOOTBAG-QUIESCED---"',
    '    fi',
    '    [[ "$mode" == resume && -e "$STATE/resume-fails" ]] && exit 1',
    '    ;;',
    '  *boot_id*) echo new-boot ;;',
    // The real agent installer's install session: an upgrade keeps the key the
    // host holds and leaves the agent running at the pin.
    '  *) if grep -q "^CWAGENT_KEEP_CREDENTIALS=1$" "$f"; then apply_fix cwagent-upgrade; touch "$STATE/agent-installed"; fi ;;',
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
  // shred on PATH, recording what it was asked to destroy and then doing it,
  // so a case can tell a shredded file from one merely swept with its directory.
  sh(join(work, 'path', 'shred'), [
    `printf '%s\\n' "$*" >> ${JSON.stringify(join(state, 'shred.log'))}`,
    `PATH=${JSON.stringify(process.env.PATH ?? '')} exec shred "$@"`,
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
  for (const t of ['staging', 'production'] as const) {
    writeFileSync(join(state, `keys-footbag-${t}-source-profile`), `${KEYS[t].src}\n`);
    writeFileSync(join(state, `keys-footbag-${t}-cwagent-publisher`), `${KEYS[t].cw}\n`);
  }
  writeFileSync(join(state, 'marker'), 'false\n');
  sh(join(work, 'bin', 'aws'), [
    `STATE=${JSON.stringify(state)}`,
    'echo "aws $*" >> "$STATE/calls.log"',
    'user=""; prev=""; for a in "$@"; do [[ "$prev" == "--user-name" ]] && user="$a"; prev="$a"; done',
    'case "$1 $2" in',
    // Each Status filter answers its own keys, the active ones being the
    // user\'s keys less the inactive; an unfiltered listing answers them all.
    '  "iam list-access-keys")',
    '    inactive="$STATE/inactive-$user"; [[ -e "$inactive" ]] || inactive=/dev/null',
    '    if [[ "$*" == *Inactive* ]]; then cat "$inactive"',
    '    elif [[ "$*" == *Active* ]]; then tr -s "[:space:]" "\\n" < "$STATE/keys-$user" 2>/dev/null | grep -vxF -f <(tr -s "[:space:]" "\\n" < "$inactive" | grep .) || true',
    '    else cat "$STATE/keys-$user" 2>/dev/null; fi; exit 0 ;;',
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
    // The blueprint a new instance boots from: its version names the release
    // with a trailing build number. Asked about any other blueprint than the
    // one the tree declares, the listing holds nothing.
    '  "lightsail get-blueprints")',
    '    [[ -e "$STATE/blueprints-fail" ]] && { echo "An error occurred (AccessDeniedException) when calling the GetBlueprints operation: stand-in refusal" >&2; exit 254; }',
    '    [[ "$*" == *"--region us-east-1"* && "$*" == *"blueprintId==\'amazon_linux_2023\'"* ]] || exit 0',
    `    if [[ -e "$STATE/blueprint-version" ]]; then cat "$STATE/blueprint-version"; else echo ${AL_PIN}.0; fi; exit 0 ;;`,
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
    'build-sqlite3.sh', 'provision-ssm-secret.sh', 'provision-turnstile-key.sh',
    'confirm-alarm-subscription.sh',
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
  // Pinning reads the instance's current host key from the Lightsail API, so a
  // pin left stale by a replacement is current again once it runs.
  hook('install-known-hosts.sh', ['rm -f "$STATE/pin-stale"']);
  hook('restore-db.sh--onto-empty', [
    'grep -qx "DB_FILE=present" "$STATE/host.status" && { echo "restore stand-in: a database exists" >&2; exit 1; }',
    '[[ -e "$STATE/release-installed" ]] || { echo "restore stand-in: no release on the host to replay the erasures in" >&2; exit 1; }',
    `printf '%s\\n' DB_FILE=present REPLAY_PENDING=no ${JSON.stringify(`CONTAINERS=${HEALTHY_CONTAINERS}`)} > "$STATE/fix/$ev"`,
  ]);
  // The secrets the first deploy boots on report stored unless a case marks
  // one unset, in the shape each provision script's status prints.
  hook('provision-ssm-secret.sh', [
    'if [[ -e "$STATE/unset-session-secret" ]]; then echo "  value:     placeholder only; this environment has never been provisioned"',
    'else echo "  value:     set (64 characters); value not shown"; fi',
  ]);
  hook('provision-turnstile-key.sh', [
    '[[ -e "$STATE/unset-turnstile" ]] && { echo "  state:     placeholder"; exit 1; }',
    'echo "  state:     set"',
  ]);
  hook('deploy-code.sh--first-install', [
    'grep -qx "DB_FILE=present" "$STATE/host.status" && { echo "first-install stand-in: a database exists" >&2; exit 1; }',
    'touch "$STATE/release-installed"',
  ]);
  hook('deploy_to_aws.sh', [
    // A code deploy, on either environment: it fails readiness on a host with
    // no database, and otherwise enables the unit and leaves the stack healthy.
    'if [[ "$*" != *--all-data* && "$*" != *--from-csv* ]]; then',
    '  grep -qx "DB_FILE=present" "$STATE/host.status" || { echo "deploy stand-in: the stack did not report ready" >&2; exit 1; }',
    `  printf '%s\\n' SERVICE_ENABLED=enabled ${JSON.stringify(`CONTAINERS=${HEALTHY_CONTAINERS}`)} > "$STATE/fix/$ev"`,
    'fi',
    // A rebuild ships a database built from the release's schema file, which
    // records that file's checksum.
    'if [[ "$*" == *--all-data* || "$*" == *--from-csv* ]]; then',
    `  printf '%s\\n' DB_FILE=present DB_SCHEMA_BASELINE=${SCHEMA_SHA} SERVICE_ENABLED=enabled ${JSON.stringify(`CONTAINERS=${HEALTHY_CONTAINERS}`)} > "$STATE/fix/$ev"`,
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

  // The instance being replaced holds the three credential files, both
  // environments' profiles in each so either target reads its own.
  for (const [rel, body] of Object.entries(OLD_HOST_FILES)) {
    mkdirSync(join(state, 'oldhost', rel, '..'), { recursive: true });
    writeFileSync(join(state, 'oldhost', rel), body);
  }
  mkdirSync(join(state, 'newhost'), { recursive: true });
  // The host tools the carry half calls. install copies and records the mode,
  // owner and group it was asked for, since a test cannot chown; aws resolves
  // the runtime role from the credentials file it is pointed at, refusing a
  // file holding no key, as the real client would.
  const tools = join(state, 'hosttools');
  mkdirSync(tools);
  sh(join(tools, 'install'), [
    `STATE=${JSON.stringify(state)}`,
    'printf "install %s\\n" "$*" >> "$STATE/hosttools.log"',
    'mode=""; args=(); dir=0',
    'while [[ $# -gt 0 ]]; do case "$1" in -d) dir=1; shift ;; -m) mode="$2"; shift 2 ;; -o|-g) shift 2 ;; *) args+=("$1"); shift ;; esac; done',
    'if (( dir )); then mkdir -p "${args[0]}"; chmod "$mode" "${args[0]}"; exit 0; fi',
    'cp "${args[0]}" "${args[1]}"; chmod "$mode" "${args[1]}"',
  ]);
  sh(join(tools, 'getent'), [
    `STATE=${JSON.stringify(state)}`,
    '[[ "$1 $2" == "group awscreds" ]] || exit 2',
    '[[ -e "$STATE/awscreds-gid" ]] && { echo "awscreds:x:$(cat "$STATE/awscreds-gid"):"; exit 0; }',
    '[[ -e "$STATE/awscreds-made" ]] && { echo "awscreds:x:1500:"; exit 0; }',
    'exit 2',
  ]);
  sh(join(tools, 'groupadd'), [`STATE=${JSON.stringify(state)}`, 'touch "$STATE/awscreds-made"']);
  sh(join(tools, 'id'), [`STATE=${JSON.stringify(state)}`, '[[ -e "$STATE/footbag-on-new-host" ]]']);
  sh(join(tools, 'aws'), [
    `STATE=${JSON.stringify(state)}`,
    'profile=""; prev=""; for a in "$@"; do [[ "$prev" == --profile ]] && profile="$a"; prev="$a"; done',
    '[[ -e "$STATE/chain-refused" ]] && { echo "An error occurred (AccessDenied) when calling the AssumeRole operation: stand-in refusal" >&2; exit 254; }',
    'env="${profile#footbag-}"; env="${env%-runtime}"',
    `case "$env" in staging) key=${KEYS.staging.src} ;; production) key=${KEYS.production.src} ;; *) key=none ;; esac`,
    'grep -q "^aws_access_key_id = ${key}$" "$AWS_SHARED_CREDENTIALS_FILE" 2>/dev/null \\',
    '  || { echo "Unable to locate credentials. You can configure credentials by running \\"aws configure\\"." >&2; exit 253; }',
    'grep -q "^role_arn = .*footbag-${env}-app-runtime$" "$AWS_CONFIG_FILE" 2>/dev/null || { echo "The config profile ($profile) could not be found" >&2; exit 255; }',
    'echo "arn:aws:sts::000000000000:assumed-role/footbag-${env}-app-runtime/botocore-session-1"',
  ]);
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
 * which types `typed` (spelled with `\n` escaped) when asked, and standard
 * input is the credential file.
 */
function runTty(args: string[], typed = '', extra: NodeJS.ProcessEnv = {}) {
  const command = `${['bash', SCRIPT, ...args].map((a) => JSON.stringify(a)).join(' ')} < ${JSON.stringify(join(work, 'credential.txt'))}`;
  const r = spawnAtTerminal(command, {
    cwd: process.cwd(), typed: typed.replace(/\\n/g, '\n'), env: { ...process.env, ...env(extra) },
  });
  return { status: r.status, out: r.stdout + r.stderr };
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
    `printf '%s\\n' ${MINTED_KEY} >> ${keys}`,
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

/**
 * One list of the closing report: the "  - " items under the heading line
 * `title`, up to the next line that is not an item. Empty when the list is not
 * printed, which the report does for a list with nothing in it.
 */
function reportSection(report: string, title: string): string {
  const lines = report.split('\n');
  const at = lines.indexOf(title);
  if (at < 0) return '';
  const items: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (!line.startsWith('  - ')) break;
    items.push(line);
  }
  return items.join('\n');
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
    // A version bump on a host already publishing with the publisher's key is an
    // upgrade that keeps the key; only a host holding none needs a rotation.
    { step: 'the pinned agent version, on a host holding the publisher key', title: 'CloudWatch agent', next: /install-cwagent-staging\.sh --upgrade/, take: () => writeHost({ ...finishedHost('staging'), CWAGENT_VERSION: '1.0.0' }) },
    { step: 'the pinned agent version, on a host holding no publisher key', title: 'CloudWatch agent', next: /install-cwagent-staging\.sh --rotate/, take: () => writeHost({ ...finishedHost('staging'), CWAGENT_VERSION: '1.0.0', CWAGENT_KEY_ID: DEAD_KEY }) },
    { step: 'a backup object recent enough', title: 'Backup timer', next: /host-diagnostics\.sh --target staging systemd\s/, take: () => writeFileSync(join(state, 'backup-age'), '3600') },
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
    { step: 'a database built from the schema file this release carries', title: 'Deployed runtime', next: /deploy_to_aws\.sh --target staging --from-csv/, take: () => writeHost({ ...finishedHost('staging'), DB_SCHEMA_BASELINE: OTHER_SCHEMA_SHA }) },
    { step: 'a database with a recorded schema baseline', title: 'Deployed runtime', next: /deploy_to_aws\.sh --target staging --from-csv/, take: () => writeHost({ ...finishedHost('staging'), DB_SCHEMA_BASELINE: 'none' }) },
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

  // A key the user holds and the host does not use is the maintainer's to
  // retire or delete, never a script's. Defect caught: such a key holds the
  // step pending, so a rebuild that carried its keys can never pass its own
  // status proof without a retirement nobody decided on; or the row stops
  // naming the commands that would retire or delete it.
  const extraKeys: Array<{ state: string; inactive: string; next: RegExp }> = [
    { state: 'active', inactive: '', next: new RegExp(`install-host-credentials\\.sh --target staging --retire <id>, for: ${DEAD_KEY}`) },
    { state: 'inactive', inactive: `${DEAD_KEY}\n`, next: new RegExp(`install-host-credentials\\.sh --target staging --delete <id>, for: ${DEAD_KEY}`) },
  ];
  it.each(extraKeys)('reads a source-profile key the host does not use, $state, as INFO naming its command, and exits 0', ({ inactive, next }) => {
    writeFileSync(join(state, 'keys-footbag-staging-source-profile'), `${SRC_KEY}\t${DEAD_KEY}\n`);
    writeFileSync(join(state, 'inactive-footbag-staging-source-profile'), inactive);
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const row = rowFor(r.stdout, 'Host credential chain');
    expect(row.line, row.line).toMatch(/\sINFO\s/);
    expect(row.line, row.line).toContain(DEAD_KEY);
    expect(row.next, row.line).toMatch(next);
  });

  it('reads a publisher key the agent does not use as INFO, and exits 0', () => {
    writeFileSync(join(state, 'keys-footbag-staging-cwagent-publisher'), `${CW_KEY}\t${DEAD_KEY}\n`);
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const row = rowFor(r.stdout, 'CloudWatch agent');
    expect(row.line, row.line).toMatch(/\sINFO\s/);
    expect(row.next, row.line).toMatch(new RegExp(`install-cwagent-staging\\.sh --retire <id>, for: ${DEAD_KEY}`));
  });

  it('fails the agent row when its key is deactivated, though metrics still read within their window, naming --rotate as the maintainer\'s call', () => {
    // Defect caught: an agent whose key the publisher holds inactive reads
    // done, or INFO, on the strength of datapoints it published before the
    // deactivation, and the status proof passes on an agent that has stopped.
    writeFileSync(join(state, 'inactive-footbag-staging-cwagent-publisher'), `${CW_KEY}\n`);
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stdout).not.toBe(0);
    const row = rowFor(r.stdout, 'CloudWatch agent');
    expect(row.line, row.line).toMatch(new RegExp(`\\sFAILED\\s.*${CW_KEY}, which is not one of the publisher's active keys`));
    expect(row.next, row.line).toMatch(/install-cwagent-staging\.sh --rotate/);
    expect(row.next, row.line).toMatch(/the maintainer's call/);
  });

  it('counts a missing snapshot that is due as pending, so the status run exits non-zero', () => {
    // Defect caught: a host whose daily automatic snapshot has stopped, or was
    // never taken once due, ends its status run with exit 0, so a caller
    // branching on the exit reads a host with no recent recovery point as done.
    setExit('verify-host-snapshots.sh', 1);
    const r = run(['--target', 'staging', '--status']);
    const row = rowFor(r.stdout, 'Recent host snapshot');
    expect(row.line).toMatch(/\sPENDING\s/);
    expect(row.next).toMatch(/verify-host-snapshots\.sh --target staging/);
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(closingReport(r.stderr)).toMatch(/1 step\(s\) pending or unread/);
  });

  // The verifier's not-yet-due answer for a new instance: exit 3 with the line
  // naming the instance and the time its first automatic snapshot is due by.
  const SNAPSHOT_DUE_LINE = '== first automatic snapshot of footbag-staging-web-r1 is due by 2026-11-27T03:11Z: not yet due on staging, since it was created 2026-11-26T01:11:00+00:00 and the AutoSnapshot add-on is Enabled ==';
  function snapshotNotYetDue(): void {
    hook('verify-host-snapshots.sh', [`echo ${JSON.stringify(SNAPSHOT_DUE_LINE)}`]);
    setExit('verify-host-snapshots.sh', 3);
  }

  it('reads a new instance\'s first snapshot not yet due as INFO naming the due time, and passes', () => {
    // Defect caught: an instance a restore or a replacement has just created
    // reads its snapshot pending, the same as a host whose snapshots stopped,
    // so the two cannot be told apart from the status view.
    snapshotNotYetDue();
    const r = run(['--target', 'staging', '--status']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const row = rowFor(r.stdout, 'Recent host snapshot');
    expect(row.line).toMatch(/\sINFO\s/);
    expect(row.line).toContain('footbag-staging-web-r1');
    expect(row.line).toContain('due by 2026-11-27T03:11Z');
    expect(row.next).toMatch(/verify-host-snapshots\.sh --target staging/);
  });

  it('records the not-yet-due snapshot as unproved, never as proved or as a warning', () => {
    // Defect caught: the run's closing report says every step reads done and
    // lists nothing about the snapshot, so a host nobody has yet seen
    // snapshotted reads as fully proved.
    snapshotNotYetDue();
    const r = run(['--target', 'staging', '--status']);
    const report = closingReport(r.stderr);
    const item = '  - that the add-on takes the first automatic snapshot of footbag-staging-web-r1; due by 2026-11-27T03:11Z';
    expect(reportSection(report, 'Not proven:'), report).toContain(item);
    expect(reportSection(report, 'Proven:'), report).not.toContain('automatic snapshot');
    expect(report).toContain('No errors or warnings.');
  });

  it('reads exit 3 without the due line as pending, not as not yet due', () => {
    // Defect caught: any exit 3 is taken for a new instance, so a verifier that
    // stopped short for some other reason reads as nothing due.
    setExit('verify-host-snapshots.sh', 3);
    const r = run(['--target', 'staging', '--status']);
    expect(rowFor(r.stdout, 'Recent host snapshot').line).toMatch(/\sPENDING\s/);
  });

  it('reports a pending snapshot once, as the pending error, and a current one as proved', () => {
    // Defect caught: a pending snapshot reported twice, as a warning beside the
    // pending-count error, or a current snapshot left unproved, so the closing
    // report does not say what the run saw.
    setExit('verify-host-snapshots.sh', 1);
    const pending = run(['--target', 'staging', '--status']);
    expect(pending.status).not.toBe(0);
    const pendingReport = closingReport(pending.stderr);
    expect(pendingReport).toMatch(/Errors \(\d+\):\n {2}- 1 step\(s\) pending or unread/);
    expect(pendingReport).not.toMatch(/Warnings \(/);

    rmSync(join(state, 'exit', 'verify-host-snapshots.sh'));
    const current = run(['--target', 'staging', '--status']);
    const report = closingReport(current.stderr);
    expect(report).toContain('No errors or warnings.');
    expect(report).toMatch(/Proven:[\s\S]*the automatic snapshot of \S+: an automatic snapshot younger than a day/);
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

  it('holds a pre-live production on another schema pending for the rebuild, and leaves a live one to its migrations', () => {
    // Defects caught: a production not yet live keeps serving a release whose
    // code expects tables its database lacks, because the step reads done on
    // healthy containers; or a live production, whose schema changes go by
    // migration, is told to take the rebuild that would replace its members.
    writeHost({ ...finishedHost('production'), DB_SCHEMA_BASELINE: OTHER_SCHEMA_SHA });
    const pre = run(['--target', 'production', '--status']);
    const preRow = rowFor(pre.stdout, 'Deployed runtime');
    expect(preRow.line).toMatch(/\sPENDING\s.*different database\/schema\.sql.*first administrator/);
    expect(preRow.next).toMatch(/deploy_to_aws\.sh --target production --all-data -W/);
    writeFileSync(join(state, 'marker'), 'true\n');
    const live = run(['--target', 'production', '--status']);
    expect(rowFor(live.stdout, 'Deployed runtime').line).toMatch(/\sDONE\s/);
  });

  it('reads a database whose schema could not be read as unknown, never done', () => {
    // Defect caught: a failed read on the host passes the step, so a release on
    // the wrong schema reads ready.
    writeHost({ ...finishedHost('staging'), DB_SCHEMA_BASELINE: 'unread' });
    const r = run(['--target', 'staging', '--status']);
    expect(r.status).toBe(1);
    expect(rowFor(r.stdout, 'Deployed runtime').line).toMatch(/\sUNKNOWN\s/);
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
  it('finishes a new instance whose first snapshot is not yet due, recording it unproved', () => {
    // Defect caught: the bootstrap of an instance created minutes ago, the
    // fresh-instance drill's own case, ends claiming every step done with no
    // word that its snapshot is still to come, or fails for a snapshot that
    // could not have been taken yet.
    hook('verify-host-snapshots.sh', [
      'echo "== first automatic snapshot of footbag-staging-web-r1 is due by 2026-11-27T03:11Z: not yet due on staging, since it was created 2026-11-26T01:11:00+00:00 and the AutoSnapshot add-on is Enabled =="',
    ]);
    setExit('verify-host-snapshots.sh', 3);
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(rowFor(r.out, 'Recent host snapshot').line).toMatch(/\sINFO\s.*due by 2026-11-27T03:11Z/);
    expect(closingReport(r.out)).toContain('that the add-on takes the first automatic snapshot of footbag-staging-web-r1; due by 2026-11-27T03:11Z');
  });

  it('on a finished host proves every step and changes nothing, then names the milestones', () => {
    // The passing case for the refusals and first-run cases below. Defect
    // caught: a re-run repeats work it should have proved done, minting keys,
    // redeploying or rebooting a host that needed none of it.
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const calls = siblingCalls().map((c) => c.split(' ')[0]);
    expect(calls.filter((c) => !['terraform-apply-all.sh', 'install-known-hosts.sh', 'verify-cwagent-metrics.sh', 'verify-host-snapshots.sh', 'verify-host-env.sh', 'confirm-alarm-subscription.sh'].includes(c))).toEqual([]);
    const labels = sessions().map((s) => s.args);
    expect(labels.some((a) => /footbag-bootstrap-(account|provision)|footbag-reboot/.test(a))).toBe(false);
    expect(r.out).toMatch(/Stopped before the milestone-gated steps/);
    expect(r.out).toMatch(/The host is bootstrapped/);
  });

  // Defect caught: a bring-up that leaves the alarm email subscriptions it
  // created unconfirmed, so no alarm reaches anyone until someone remembers a
  // separate script; or one left pending failing the bring-up of a host that is
  // otherwise done.
  it('walks the alarm email confirmation at the terminal, and reports a topic left pending without failing', () => {
    const done = runTty(['--target', 'staging']);
    expect(done.status, done.out).toBe(0);
    const walk = siblingCalls().find((c) => c.startsWith('confirm-alarm-subscription.sh'))!;
    expect(walk).toMatch(/^confirm-alarm-subscription\.sh --target staging \| stdin=$/);

    rmSync(join(state, 'siblings.log'));
    writeFileSync(join(state, 'exit', 'confirm-alarm-subscription.sh'), '3');
    const pending = runTty(['--target', 'staging']);
    expect(pending.status, pending.out).toBe(0);
    expect(pending.out).toMatch(/alarm email subscriptions still waiting for confirmation/);
    expect(pending.out).toMatch(/The host is bootstrapped/);

    writeFileSync(join(state, 'exit', 'confirm-alarm-subscription.sh'), '1');
    const failed = runTty(['--target', 'staging']);
    expect(failed.status).toBe(1);
    expect(failed.out).toMatch(/the alarm email confirmation did not finish/);
  });

  it('names the gate script for the login alarm and the status view for the other alarm steps, never a values-file edit', () => {
    // Defects caught: a closing list telling the operator to edit the values file
    // and apply by hand, which skips the gate script's own guards (the
    // cutover-login alarm is refused outside pass 1) and its read-back; or one
    // that drops the alarm gates and subscriptions with nothing pointing at the
    // rows that now name each of their commands.
    writeHost(finishedHost('production'));
    const r = runTty(['--target', 'production']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/set-terraform-gate\.sh --target production \\/);
    expect(r.out).toMatch(/--gate enable_cutover_login_alarm --state on/);
    expect(r.out).toMatch(/bringup-status\.sh --target production --profile/);
    expect(r.out).not.toMatch(/= true in the values file, then/);
  });

  it('rebuilds a staging host whose database was built from another schema file', () => {
    // Defect caught: the bootstrap proves the deploy done on healthy containers
    // and leaves the release running against tables its code does not expect.
    writeHost({ ...finishedHost('staging'), DB_SCHEMA_BASELINE: OTHER_SCHEMA_SHA });
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(siblingCalls().some((c) => c.startsWith('deploy_to_aws.sh --target staging --from-csv'))).toBe(true);
  });

  it('refuses to rebuild a host whose database schema could not be read', () => {
    // Defect caught: a failed read on the host is taken as a schema change, and
    // the bootstrap replaces the database on the strength of it.
    writeHost({ ...finishedHost('staging'), DB_SCHEMA_BASELINE: 'unread' });
    const r = runTty(['--target', 'staging']);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/Nothing was deployed/);
    expect(siblingCalls().some((c) => c.startsWith('deploy_to_aws.sh'))).toBe(false);
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
    expect(r.out).toMatch(/--gate enable_cutover_login_alarm --state on/);
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
    // release other than the pinned one, reads as done because the tool exists,
    // so the bootstrap never brings it to its pin.
    // The distribution's sqlite package left installed under a pinned sqlite3
    // is the production host's state: sqlite3 reads at its pin while the
    // package holds sqlite-libs off the release, so a release step cannot land.
    const offPins: Array<Record<string, string>> = [
      { SQLITE_VERSION: '3.40.0' }, { DOCKER_RPM: '25.0.14-1.amzn2023.0.1' }, { AL_RELEASE: '2023.11.20260901' },
      { DISTRO_SQLITE: 'yes' }, { DISTRO_SQLITE: '' },
    ];
    for (const off of offPins) {
      writeHost({ ...finishedHost('staging'), ...off });
      const r = run(['--target', 'staging', '--status']);
      expect(rowFor(r.stdout, 'Host tools').line, JSON.stringify(off)).toMatch(/\sPENDING\s/);
    }
    writeHost(finishedHost('staging'));
    const ok = run(['--target', 'staging', '--status']);
    expect(rowFor(ok.stdout, 'Host tools').line).not.toMatch(/\sPENDING\s/);
  });

  it('reads the tools step pending on a release newer than the pin, on staging as on production', () => {
    // Defect caught: a staging host one release past its pin, or with a tool
    // off its pin, reads as done, so the bootstrap reports a finished host that
    // every deploy will then refuse.
    const offPins: Array<Record<string, string>> = [
      { AL_RELEASE: '2023.12.20261120' }, { DOCKER_RPM: '25.0.14-1.amzn2023.0.1' },
    ];
    for (const target of ['staging', 'production'] as const) {
      for (const off of offPins) {
        writeHost({ ...finishedHost(target), ...off });
        const line = rowFor(run(['--target', target, '--status']).stdout, 'Host tools').line;
        expect(line, `${target} ${JSON.stringify(off)}`).toMatch(/\sPENDING\s/);
        expect(line, `${target} ${JSON.stringify(off)}`).toContain(`host has ${Object.values(off)[0]}`);
      }
    }
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

  // The bootstrap mints, retires and deletes no key, whatever the host and the
  // user hold. Each row is a host the old code answered with a key call. Defect
  // caught: the bootstrap rotates or retires a host access key on its own, which
  // is the maintainer's decision, or goes on past a chain that does not work.
  const chainNotOk: Array<{ held: string; keys: string; hostKey: string }> = [
    { held: 'one key the host does not hold', keys: `${DEAD_KEY}\n`, hostKey: '' },
    { held: 'two keys and the host neither', keys: `${DEAD_KEY}\t${OTHER_DEAD_KEY}\n`, hostKey: '' },
    { held: 'the key the host holds, which no longer resolves the role', keys: `${SRC_KEY}\n`, hostKey: SRC_KEY },
  ];
  it.each(chainNotOk)('stops on a chain that does not resolve, the user holding $held, naming --rotate and minting nothing', ({ keys, hostKey }) => {
    writeHost({ ...finishedHost('staging'), CRED_CHAIN: 'fail', CRED_KEY_ID: hostKey });
    writeFileSync(join(state, 'keys-footbag-staging-source-profile'), keys);
    iamStandIn('install-host-credentials.sh', 'footbag-staging-source-profile', 'CRED_KEY_ID', ['CRED_CHAIN=ok', `CRED_KEY_ID=${MINTED_KEY}`]);
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/does not resolve its runtime role/);
    expect(r.out).toMatch(/< \S+ bash scripts\/install-host-credentials\.sh --target staging --rotate/);
    expect(siblingCalls().filter((c) => /^install-(host-credentials|cwagent)/.test(c)), r.out).toEqual([]);
    // Nothing after the chain ran: the run stopped there.
    expect(siblingCalls().some((c) => c.startsWith('deploy'))).toBe(false);
  });

  it('retires nothing while the host\'s own key id reads empty, and ends unproved rather than done', () => {
    // Defect caught: with the host's key id empty every key on the user looks
    // unused, so a run deactivates the key the host is running on; or the row
    // reads done on a host whose key cannot be told apart.
    writeHost({ ...finishedHost('staging'), CRED_KEY_ID: '' });
    writeFileSync(join(state, 'keys-footbag-staging-source-profile'), `${SRC_KEY}\t${DEAD_KEY}\n`);
    iamStandIn('install-host-credentials.sh', 'footbag-staging-source-profile', 'CRED_KEY_ID', []);
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(rowFor(r.out, 'Host credential chain').line).toMatch(/\sUNKNOWN\s.*key id it holds reads empty/);
    expect(siblingCalls().some((c) => /install-host-credentials\.sh/.test(c))).toBe(false);
  });

  it('stops when the agent holds none of the publisher\'s keys, naming its --rotate and minting nothing', () => {
    // Defect caught: an agent left without a usable key is given a new one by
    // the bootstrap, a rotation nobody decided on.
    writeHost({ ...finishedHost('staging'), CWAGENT_ACTIVE: 'inactive', CWAGENT_KEY_ID: DEAD_KEY });
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/< \S+ bash scripts\/install-cwagent-staging\.sh --rotate/);
    expect(siblingCalls().filter((c) => c.startsWith('install-cwagent')), r.out).toEqual([]);
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

  it.each([
    ['staging', undefined],
    ['production not yet live', 'false'],
  ])('with --restore-database on a fresh %s host, restores the newest backup the way a live production does', (_label, marker) => {
    // Defect caught: the host-rebuild drill proving only the pre-go-live
    // rebuild, so the one recovery go-live leaves (release installed unstarted,
    // the backup restored with its erasure replay, then the code deploy) is
    // first run in a real outage.
    const target = marker === undefined ? 'staging' : 'production';
    writeHost({ ...finishedHost(target), DB_FILE: 'absent', CONTAINERS: '', SERVICE_ENABLED: 'disabled' });
    if (marker !== undefined) writeFileSync(join(state, 'marker'), `${marker}\n`);
    const r = runTty(['--target', target, '--restore-database'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    expect(siblingCalls().filter((c) => /^(restore-db|deploy_to_aws|deploy-code)/.test(c))).toEqual([
      `deploy-code.sh --first-install --target ${target} | stdin=stub-sudo-pass`,
      `restore-db.sh --target ${target} --onto-empty | stdin=stub-sudo-pass`,
      `deploy_to_aws.sh --target ${target} | stdin=`,
    ]);
    expect(hostFacts().DB_FILE).toBe('present');
  });

  it('without --restore-database a fresh staging host still takes the rebuild, never the restore', () => {
    // Defect caught: the flag's path leaking into an ordinary bootstrap, so a
    // fresh staging host waits on a backup it may not have.
    writeHost({ ...finishedHost('staging'), DB_FILE: 'absent', CONTAINERS: '', SERVICE_ENABLED: 'disabled' });
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(siblingCalls().some((c) => c.startsWith('deploy_to_aws.sh --target staging --from-csv'))).toBe(true);
    expect(siblingCalls().some((c) => /^(restore-db|deploy-code)/.test(c))).toBe(false);
  });

  it('refuses --restore-database beside --status or --replace-instance', () => {
    for (const mode of ['--status', '--replace-instance']) {
      const r = runTty(['--target', 'staging', mode, '--restore-database']);
      expect(r.status, mode).toBe(2);
      expect(r.out, mode).toContain('--restore-database chooses how a bootstrap run brings back');
    }
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

  // Defect caught: the first deploy started on a secret still holding
  // Terraform's placeholder, so it failed at boot far from the cause, or the
  // site came up with a session secret anyone could read in the source.
  it('refuses the deploy step while the session secret is unset, naming the command that stores it', () => {
    writeHost({ ...finishedHost('staging'), SERVICE_ENABLED: 'disabled' });
    writeFileSync(join(state, 'unset-session-secret'), '');
    const r = runTty(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the session secret for staging is not stored/);
    expect(r.out).toMatch(/provision-ssm-secret\.sh --target staging --secret session_secret store/);
    expect(siblingCalls().some((c) => /^(deploy_to_aws|deploy-code)/.test(c))).toBe(false);
  });

  it('refuses the production deploy step while the Turnstile secret is the placeholder', () => {
    writeHost({ ...finishedHost('production'), SERVICE_ENABLED: 'disabled' });
    writeFileSync(join(state, 'unset-turnstile'), '');
    const r = runTty(['--target', 'production']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/provision-turnstile-key\.sh --target production store/);
    expect(siblingCalls().some((c) => /^(deploy_to_aws|deploy-code)/.test(c))).toBe(false);
  });

  it('checks the staging secrets only for what staging boots on', () => {
    // Staging carries no Turnstile secret of its own; asking for one would stop
    // every staging bootstrap.
    writeHost({ ...finishedHost('staging'), SERVICE_ENABLED: 'disabled' });
    writeFileSync(join(state, 'unset-turnstile'), '');
    runTty(['--target', 'staging']);
    expect(siblingCalls().some((c) => c.startsWith('provision-turnstile-key.sh'))).toBe(false);
    expect(siblingCalls().some((c) => c.startsWith('deploy_to_aws.sh'))).toBe(true);
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
    expect(r.out).toMatch(/swap after the reboot/);
    expect(r.out).not.toMatch(/WARN.*swap/);
    // Defect caught: a step that runs slow on a throttled host shows no time,
    // so nobody can tell which step a long bootstrap spent its time in.
    expect(r.out).toMatch(/^ {4}\(Rebooting footbag-staging once, .* took \d+m \d{2}s\)$/m);
  });

  it('fails when the reboot leaves compressed swap in use', () => {
    // Defect caught: the deploys a bootstrap makes leave the swap report to its
    // reboot step, so a reboot that did not retire it would be reported by
    // nobody.
    writeHost({ ...finishedHost('staging'), ZRAM_ACTIVE: 'yes' });
    onEvent('reboot', { ZRAM_ACTIVE: 'yes' });
    const r = runTty(['--target', 'staging'], 'APPLY\\n');
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/rebooted \(boot id new-boot\)/);
    expect(r.out).toMatch(/swap after the reboot/);
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
    // The next step is the script that makes the change, never a hand edit.
    expect(r.out).toMatch(/bash scripts\/enable-cloudfront\.sh --target staging/);
    expect(r.out).not.toMatch(/terraform\.tfvars set/);
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
    // The new instance's host key is pinned after the replacement, before
    // anything connects to it.
    expect(siblingCalls()).toEqual([
      `terraform-apply.sh --target staging --replace aws_lightsail_instance.web --instance-snapshot ${snap} | stdin=`,
      'install-known-hosts.sh --target staging | stdin=',
    ]);
    expect(r.out).toContain(snap);
  });

  it('goes ahead when the blueprint a new instance boots from is at or before the pin', () => {
    // Defect caught: a replacement refused while the image it boots is at the
    // pin, or one the bootstrap can step forward to it, so no host can ever be
    // replaced; or the blueprint check never asked Lightsail at all.
    for (const version of [`${AL_PIN}.0`, '2023.11.20260901.2']) {
      writeFileSync(join(state, 'blueprint-version'), `${version}\n`);
      rmSync(join(state, 'calls.log'), { force: true });
      const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
      expect(r.status, `${version}: ${r.out}`).toBe(0);
      const calls = lightsailCalls();
      const asked = calls.findIndex((c) => c.startsWith('aws lightsail get-blueprints'));
      expect(asked, version).toBeGreaterThanOrEqual(0);
      expect(asked, version).toBeLessThan(calls.findIndex((c) => c.includes('create-instance-snapshot')));
    }
  });

  it('refuses, with nothing changed, when the blueprint has moved past the pin, naming the bump', () => {
    // Defect caught: an instance is snapshotted and destroyed, and its
    // replacement boots a release past the pin that dnf cannot step back, so
    // the bootstrap refuses the new host and the environment is left with no
    // host it will accept.
    for (const target of ['staging', 'production'] as const) {
      writeHost(finishedHost(target));
      writeFileSync(join(state, 'marker'), 'true\n');
      writeFileSync(join(state, 'backup-age'), '60');
      writeFileSync(join(state, 'blueprint-version'), '2023.12.20261120.0\n');
      rmSync(join(state, 'calls.log'), { force: true });
      const r = runTty(['--target', target, '--replace-instance'], 'APPLY\\n');
      expect(r.status, `${target}: ${r.out}`).toBe(1);
      expect(r.out, target).toMatch(new RegExp(`2023\\.12\\.20261120, past the pinned ${AL_PIN.replace(/[.]/g, '\\.')}`));
      expect(r.out, target).toContain('bash scripts/bump-tool.sh AMAZON_LINUX_RELEASE 2023.12.20261120 --apply');
      expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot')), target).toBe(false);
      expect(sessions().some((s) => s.args.includes('footbag-bootstrap-quiesce')), target).toBe(false);
      expect(siblingCalls(), target).toHaveLength(0);
    }
  });

  it('refuses, with nothing changed, when the blueprint cannot be read', () => {
    // Defect caught: a failed or empty blueprint read taken as "nothing past
    // the pin", so the replacement goes ahead on an image nobody checked.
    const cases: Array<{ label: string; take: () => void; said: RegExp }> = [
      { label: 'the read fails', take: () => writeFileSync(join(state, 'blueprints-fail'), ''), said: /AccessDeniedException/ },
      { label: 'the blueprint is not listed', take: () => writeFileSync(join(state, 'blueprint-version'), ''), said: /amazon_linux_2023/ },
      { label: 'the version is not a release', take: () => writeFileSync(join(state, 'blueprint-version'), 'latest\n'), said: /'latest'/ },
    ];
    for (const c of cases) {
      rmSync(join(state, 'blueprints-fail'), { force: true });
      rmSync(join(state, 'blueprint-version'), { force: true });
      rmSync(join(state, 'calls.log'), { force: true });
      c.take();
      const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
      expect(r.status, `${c.label}: ${r.out}`).toBe(1);
      expect(r.out, c.label).toMatch(/could not read the Lightsail blueprint/);
      expect(r.out, c.label).toMatch(c.said);
      expect(lightsailCalls().some((l) => l.includes('create-instance-snapshot')), c.label).toBe(false);
      expect(siblingCalls(), c.label).toHaveLength(0);
    }
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
    writeHost(finishedHost('production'));
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

  it('on a live production never reuses an earlier snapshot, taking a fresh one after the final backup', () => {
    // Defect caught: a snapshot from an earlier attempt, taken while the live
    // host still took writes, kept as the way back, so going back to it loses
    // every write between it and the final backup.
    writeHost(finishedHost('production'));
    writeFileSync(join(state, 'marker'), 'true\n');
    writeFileSync(join(state, 'backup-age'), '60');
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    writeFileSync(join(state, 'snapshots'), `footbag-production-web-pre-replace-20990101T000000Z\t${recent}\tavailable\n`);
    const r = runTty(['--target', 'production', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    const log = readFileSync(join(state, 'calls.log'), 'utf-8');
    expect(log.indexOf('lightsail create-instance-snapshot')).toBeGreaterThan(log.indexOf('footbag-bootstrap-quiesce'));
    expect(siblingCalls()[0]).not.toContain('pre-replace-20990101T000000Z');
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

  it('on a live production whose service cannot be started again names the script that starts it', () => {
    // Defect caught: the site is left down and the operator is pointed at a
    // diagnostics script that has no way to start it, so the outage lasts
    // until someone works out the real command.
    writeHost(finishedHost('production'));
    writeFileSync(join(state, 'marker'), 'true\n');
    writeFileSync(join(state, 'backup-age'), '60');
    writeFileSync(join(state, 'backup-fails'), '');
    writeFileSync(join(state, 'resume-fails'), '');
    const r = runTty(['--target', 'production', '--replace-instance'], 'APPLY\\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the site is DOWN\. Start it with: < \S+ bash scripts\/restart-host\.sh --target production(\s|$)/);
    expect(lightsailCalls().some((c) => c.includes('create-instance-snapshot'))).toBe(false);
  });

  it('on production refuses while the go-live marker cannot be read', () => {
    writeHost(finishedHost('production'));
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

  it('only reads the instance being replaced: its identity and its keys, changing nothing there', () => {
    // Defect caught: the route reaches the old host for more than the key read,
    // or changes something on it, before the snapshot that is the way back.
    const before = hostFacts();
    const r = runTty(['--target', 'staging', '--replace-instance'], 'APPLY\\n');
    expect(r.status, r.out).toBe(0);
    const onOld = sessions().filter((s) => !s.args.includes('-l ec2-user')).map((s) => /bash -s (\S+)'?$/.exec(s.args.trim())?.[1]);
    expect(onOld.sort()).toEqual(['footbag-bootstrap-carry', 'footbag-host-identity']);
    expect(hostFacts()).toEqual(before);
    for (const [rel, body] of Object.entries(OLD_HOST_FILES)) {
      expect(readFileSync(join(state, 'oldhost', rel), 'utf-8'), rel).toBe(body);
    }
  });
});

describe('bootstrap-host.sh --replace-instance: the host AWS access keys are carried, never minted', () => {
  const KEY_CALL = /^aws iam (create-access-key|update-access-key|delete-access-key)/m;
  const SECRETS = [SRC_SECRET, AGENT_SECRET];

  /** A replacement with its own temp directory, so what it leaves there can be seen. */
  function replace(extra: NodeJS.ProcessEnv = {}, target: 'staging' | 'production' = 'staging') {
    const tmp = join(work, 'tmp');
    mkdirSync(tmp, { recursive: true });
    return runTty(['--target', target, '--replace-instance'], 'APPLY\\n', { TMPDIR: tmp, ...extra });
  }
  const b64 = (rel: string) => Buffer.from(OLD_HOST_FILES[rel]).toString('base64');
  /** The five lines an honest old host answers the key read with, for staging. */
  const HONEST_READ = [
    `CARRY_CREDS_B64=${b64('root/.aws/credentials')}`,
    `CARRY_CONFIG_B64=${b64('root/.aws/config')}`,
    `CARRY_AGENT_B64=${b64('etc/amazon-cloudwatch-agent.aws/credentials')}`,
    `CARRY_SRC_KEY=${SRC_KEY}`,
    `CARRY_CW_KEY=${CW_KEY}`,
  ];
  /** Everything a leak could be: the secrets, each file's base64, the assignment names. */
  const LEAK_SHAPES: Array<string | RegExp> = [
    SRC_SECRET, AGENT_SECRET, ...Object.keys(OLD_HOST_FILES).map(b64),
    /CARRY_(CREDS|CONFIG|AGENT)_B64=/,
  ];
  function leaksIn(text: string): string[] {
    return LEAK_SHAPES.filter((s) => (typeof s === 'string' ? text.includes(s) : s.test(text))).map(String);
  }
  function readIf(p: string): string {
    return existsSync(p) ? readFileSync(p, 'utf-8') : '';
  }
  function leftInTmp(): string[] {
    const tmp = join(work, 'tmp');
    return existsSync(tmp) ? readdirSync(tmp, { recursive: true }).map(String) : [];
  }
  function callsLog(): string {
    const p = join(state, 'calls.log');
    return existsSync(p) ? readFileSync(p, 'utf-8') : '';
  }
  function carryShredded(): boolean {
    const p = join(state, 'shred.log');
    return existsSync(p) && /^-u \S*\/carry\.\w+$/m.test(readFileSync(p, 'utf-8'));
  }
  function applied(): boolean {
    return siblingCalls().some((c) => c.startsWith('terraform-apply.sh'));
  }
  function snapshotTaken(): boolean {
    return /lightsail create-instance-snapshot/.test(callsLog());
  }
  /** Every argument list a stand-in recorded: ssh sessions, the AWS CLI, siblings, host tools. */
  function everyArgv(): string {
    const tools = join(state, 'hosttools.log');
    return [
      ...sessions().map((s) => s.args), callsLog(), siblingCalls().join('\n'),
      existsSync(tools) ? readFileSync(tools, 'utf-8') : '',
    ].join('\n');
  }

  it('installs the three files on the new instance byte for byte, with the password never sent there, and shreds its copy', () => {
    // Defects caught: the new instance gets different bytes, or the files at
    // other modes than the installers write; the install stream leads with a
    // password line, which ec2-user's sudo would leave for bash to run; the
    // workstation copy is left for the directory sweep rather than shredded.
    writeFileSync(join(state, 'snap-tmp'), '');
    const r = replace();
    expect(r.status, r.out).toBe(0);
    for (const [rel, body] of Object.entries(OLD_HOST_FILES)) {
      expect(readFileSync(join(state, 'newhost', rel), 'utf-8'), rel).toBe(body);
    }
    const modes = readFileSync(join(state, 'hosttools.log'), 'utf-8');
    expect(modes).toMatch(/^install -d -m 0750 -o root -g awscreds \S+\/newhost\/root\/\.aws$/m);
    expect(modes).toMatch(/^install -d -m 0700 -o root -g root \S+\/newhost\/etc\/amazon-cloudwatch-agent\.aws$/m);
    expect(modes).toMatch(/^install -m 0640 -o root -g awscreds \S+ \S+\/newhost\/root\/\.aws\/credentials$/m);
    expect(modes).toMatch(/^install -m 0640 -o root -g awscreds \S+ \S+\/newhost\/root\/\.aws\/config$/m);
    expect(modes).toMatch(/^install -m 0600 -o root -g root \S+ \S+\/newhost\/etc\/amazon-cloudwatch-agent\.aws\/credentials$/m);

    const install = sessions().find((s) => s.args.includes('-l ec2-user') && /^MODE=install$/m.test(s.stream))!;
    expect(install, 'an install session on the new instance').toBeTruthy();
    expect(install.args).toMatch(/-p 22 -l ec2-user footbag-staging sudo -n bash -s footbag-bootstrap-carry/);
    expect(install.stream.split('\n')[0]).toBe('MODE=install');
    expect(install.stream).not.toContain('stub-sudo-pass');
    const sent = (name: string) => Buffer.from(new RegExp(`^${name}=(\\S+)$`, 'm').exec(install.stream)![1], 'base64').toString();
    expect(sent('CARRY_CREDS_B64')).toBe(OLD_HOST_FILES['root/.aws/credentials']);
    expect(sent('CARRY_AGENT_B64')).toBe(OLD_HOST_FILES['etc/amazon-cloudwatch-agent.aws/credentials']);

    const read = sessions().find((s) => s.args.includes('footbag-bootstrap-carry') && !s.args.includes('-l ec2-user'))!;
    expect(read.stream.split('\n').slice(0, 2)).toEqual(['stub-sudo-pass', 'MODE=read']);
    expect(read.args).toMatch(/sudo -k -S -p "" bash -s footbag-bootstrap-carry/);

    // The read and the proof precede the destroy and follow the pin.
    const order = callsLog();
    expect(order.indexOf('footbag-bootstrap-carry')).toBeLessThan(order.indexOf('lightsail create-instance-snapshot'));
    expect(siblingCalls()).toEqual([
      expect.stringMatching(/^terraform-apply\.sh /), 'install-known-hosts.sh --target staging | stdin=',
    ]);

    for (const secret of SECRETS) expect(everyArgv(), secret).not.toContain(secret);
    expect(r.out, 'a secret on the terminal').not.toMatch(/secret-value-not-real/);
    // Not the secrets alone: the files' base64 and the assignments carrying it
    // are the secrets too, and a log or terminal holding them holds the keys.
    const places: Record<string, string> = {
      terminal: r.out, argv: everyArgv(), 'calls.log': callsLog(), 'siblings.log': siblingCalls().join('\n'),
      'shred.log': readIf(join(state, 'shred.log')), 'hosttools.log': readIf(join(state, 'hosttools.log')),
    };
    for (const [where, text] of Object.entries(places)) expect(leaksIn(text), where).toEqual([]);
    // While the keys were on their way to the new instance, the run's temp tree
    // held them in exactly one file, the restricted carry file: no log of a
    // session, no scratch copy.
    const snap = join(state, 'tmpsnap');
    const files = readdirSync(snap, { recursive: true }).map(String).filter((f) => statSync(join(snap, f)).isFile());
    expect(files.length, 'the temp tree was copied mid-run').toBeGreaterThan(0);
    const holding = files.filter((f) => leaksIn(readFileSync(join(snap, f), 'utf-8')).length > 0)
      .map((f) => ({ name: f.split('/').at(-1)!.replace(/\.\w+$/, ''), mode: statSync(join(snap, f)).mode & 0o777 }));
    expect(holding).toEqual([{ name: 'carry', mode: 0o600 }]);
    expect(carryShredded(), 'the carried copy shredded').toBe(true);
    expect(leftInTmp()).toEqual([]);
    expect(callsLog()).not.toMatch(KEY_CALL);
  });

  it('carries production\'s own two keys on a production replacement, never staging\'s', () => {
    // Defects caught: the read is sent with another environment than the
    // target, or a profile's key is taken for the other's, so the new host is
    // given keys that belong elsewhere or are checked against the wrong user.
    writeHost(finishedHost('production'));
    const r = replace({}, 'production');
    expect(r.status, r.out).toBe(0);
    for (const [rel, body] of Object.entries(OLD_HOST_FILES)) {
      expect(readFileSync(join(state, 'newhost', rel), 'utf-8'), rel).toBe(body);
    }
    const read = sessions().find((s) => s.args.includes('footbag-bootstrap-carry') && !s.args.includes('-l ec2-user'))!;
    expect(read.stream).toMatch(/^TARGET_ENV=production$/m);
    const install = sessions().find((s) => /^MODE=install$/m.test(s.stream))!;
    expect(install.stream).toMatch(new RegExp(`^CARRY_SRC_KEY=${KEYS.production.src}$`, 'm'));
    expect(install.stream).toMatch(new RegExp(`^CARRY_CW_KEY=${KEYS.production.cw}$`, 'm'));
    expect(install.stream).toMatch(/^TARGET_ENV=production$/m);
    expect(callsLog()).toMatch(new RegExp(`^aws iam list-access-keys --user-name footbag-production-source-profile .*Active`, 'm'));
    expect(callsLog()).toMatch(new RegExp(`^aws iam list-access-keys --user-name footbag-production-cwagent-publisher .*Active`, 'm'));
    expect(closingReport(r.out)).toMatch(new RegExp(`holds ${KEYS.production.src} and ${KEYS.production.cw}, carried from the old host`));
    expect(callsLog()).not.toMatch(KEY_CALL);
  });

  it('pins the new instance again when its first pin fails, and installs once it answers', () => {
    // Defect caught: a pin tried once, while the new instance is still booting
    // and Lightsail reports no host key for it, ends the replacement there with
    // the keys on no host, when a minute later both would have answered.
    hook('install-known-hosts.sh', [
      'n=$(( $(cat "$STATE/pin-tries" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE/pin-tries"',
      '(( n > 1 )) || { echo "install-known-hosts stand-in: Lightsail reports no host key for the instance yet" >&2; exit 1; }',
    ]);
    const r = replace();
    expect(r.status, r.out).toBe(0);
    expect(siblingCalls().filter((c) => c.startsWith('install-known-hosts.sh'))).toHaveLength(2);
    expect(readFileSync(join(state, 'newhost/root/.aws/credentials'), 'utf-8')).toBe(OLD_HOST_FILES['root/.aws/credentials']);
    // The login is never tried before a pin has gone through.
    expect(sessions().filter((s) => s.args.includes('FOOTBAG-FRESH-LOGIN-OK'))).toHaveLength(1);
  });

  it('a re-run whose pin is still the destroyed instance\'s pins afresh, then finds the carried keys', () => {
    // Defect caught: a run stopped between the destroy and the pin leaves the
    // old instance's host key on file; the re-run's check is refused by that
    // pin and reads the carry as lost, sending the maintainer to rotate keys
    // that are in fact on the new instance.
    writeFileSync(join(state, 'chain-refused'), '');
    expect(replace().status).toBe(1);
    rmSync(join(state, 'chain-refused'));
    writeFileSync(join(state, 'unreachable'), '');
    writeFileSync(join(state, 'pin-stale'), '');
    rmSync(join(state, 'calls.log'));
    rmSync(join(state, 'siblings.log'));
    const again = replace();
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/already holding the carried keys/);
    expect(siblingCalls()).toEqual(['install-known-hosts.sh --target staging | stdin=']);
    expect(snapshotTaken()).toBe(false);
    expect(applied()).toBe(false);
  });

  it('a re-run after a live production\'s replacement finds the carried keys, past the backup gate its old host can no longer meet', () => {
    // Defect caught: the backup-freshness gate, meant for a live host about to
    // be destroyed, refuses the re-run after the destroy, when the old host and
    // its backup timer are gone and the backups have rightly stopped.
    writeHost(finishedHost('production'));
    writeFileSync(join(state, 'marker'), 'true\n');
    writeFileSync(join(state, 'chain-refused'), '');
    expect(replace({}, 'production').status).toBe(1);
    rmSync(join(state, 'chain-refused'));
    writeFileSync(join(state, 'unreachable'), '');
    writeFileSync(join(state, 'backup-age'), '7200');
    rmSync(join(state, 'calls.log'));
    rmSync(join(state, 'siblings.log'));
    const again = replace({}, 'production');
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/already holding the carried keys/);
    expect(snapshotTaken()).toBe(false);
    expect(applied()).toBe(false);
  });

  it('checks each carried key is active in IAM with list-access-keys before anything is destroyed', () => {
    // Defect caught: a key IAM no longer holds active is carried to the new
    // host, which then cannot work, after the old one is gone.
    const ok = replace();
    expect(ok.status, ok.out).toBe(0);
    for (const user of ['footbag-staging-source-profile', 'footbag-staging-cwagent-publisher']) {
      expect(callsLog(), user).toMatch(new RegExp(`^aws iam list-access-keys --user-name ${user} .*Status==\`Active\``, 'm'));
    }

    rmSync(join(state, 'calls.log'));
    rmSync(join(state, 'siblings.log'));
    writeFileSync(join(state, 'keys-footbag-staging-cwagent-publisher'), `${DEAD_KEY}\n`);
    const r = replace();
    expect(r.status).toBe(1);
    expect(closingReport(r.out)).toMatch(new RegExp(`${CW_KEY}, the key the host holds for footbag-staging-cwagent-publisher, is not one of that user's active keys`));
    expect(snapshotTaken()).toBe(false);
    expect(applied()).toBe(false);
  });

  const refusals: Array<{ why: string; take: () => void; says: RegExp }> = [
    { why: 'the old host does not answer', take: () => writeFileSync(join(state, 'unreachable'), ''), says: /did not answer as the staging host, so its AWS access keys could not be read/ },
    { why: 'the old host holds no agent credentials', take: () => rmSync(join(state, 'oldhost/etc/amazon-cloudwatch-agent.aws/credentials')), says: /amazon-cloudwatch-agent\.aws\/credentials is not on this host/ },
    { why: 'the old host holds no config', take: () => rmSync(join(state, 'oldhost/root/.aws/config')), says: /root\/\.aws\/config is not on this host/ },
    { why: 'the old host answers with lines other than the files', take: () => writeFileSync(join(state, 'old-host-says'), `CARRY_CREDS_B64=AAAA\nrm -rf /srv/footbag\n`), says: /answered the key read with something other than the credential files/ },
    // The five honest lines, then a command on a last line with no newline,
    // which a line-by-line check skips and a replay of the file would run as
    // root on the new instance.
    { why: 'the old host appends a command on a last line with no newline', take: () => writeFileSync(join(state, 'old-host-says'), `${HONEST_READ.join('\n')}\ntouch ${join(state, 'ran-on-new-host')} >&2`), says: /answered the key read with something other than the credential files/ },
    { why: 'a base64 value has a length base64 never writes', take: () => writeFileSync(join(state, 'old-host-says'), `${['CARRY_CREDS_B64=AAAAA', ...HONEST_READ.slice(1)].join('\n')}\n`), says: /answered the key read with something other than the credential files/ },
    { why: 'a key id is a temporary session key, not a long-term user key', take: () => writeFileSync(join(state, 'old-host-says'), `${[...HONEST_READ.slice(0, 3), 'CARRY_SRC_KEY=ASIAEXAMPLEEXAMPLE11', HONEST_READ[4]].join('\n')}\n`), says: /answered the key read with something other than the credential files/ },
  ];
  it.each(refusals)('refuses before the snapshot and the destroy when $why', ({ take, says }) => {
    // Defect caught: the instance is destroyed with keys that were never read,
    // leaving them on no host; or a line the old host sent is replayed into a
    // root shell on the new one.
    take();
    const r = replace();
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(says);
    expect(r.out).toMatch(/Nothing was changed/);
    expect(snapshotTaken()).toBe(false);
    expect(applied()).toBe(false);
    expect(sessions().some((s) => /^MODE=install$/m.test(s.stream))).toBe(false);
    expect(existsSync(join(state, 'ran-on-new-host')), 'a line the old host sent ran on the new one').toBe(false);
    expect(callsLog()).not.toMatch(KEY_CALL);
    expect(leftInTmp()).toEqual([]);
  });

  it('accepts the five honest lines the old host answers with, the control for the refusals above', () => {
    // The same stand-in answer the refusals tamper with, untampered, carries.
    writeFileSync(join(state, 'old-host-says'), `${HONEST_READ.join('\n')}\n`);
    const r = replace();
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(join(state, 'newhost/root/.aws/credentials'), 'utf-8')).toBe(OLD_HOST_FILES['root/.aws/credentials']);
  });

  it('waits for the new instance to answer its first login, then installs', () => {
    // Defect caught: the install is tried once on an instance still booting,
    // and a replacement that would have succeeded a minute later ends with the
    // keys on no host.
    writeFileSync(join(state, 'fresh-down'), '3');
    const r = replace();
    expect(r.status, r.out).toBe(0);
    expect(sessions().filter((s) => s.args.includes('FOOTBAG-FRESH-LOGIN-OK')).length).toBe(4);
    expect(readFileSync(join(state, 'newhost/root/.aws/credentials'), 'utf-8')).toBe(OLD_HOST_FILES['root/.aws/credentials']);
  });

  // A failure after the apply, each way it can come: the new instance never
  // answers, the install lands and its proof fails, or the run is interrupted.
  // Defects caught: the run withdraws or rotates a key on its way out, which
  // is the maintainer's decision; the closing report leaves the operator to
  // work out where the keys are; the carried copy outlives the run.
  const ROTATE_BOTH = [
    /< \S+ bash scripts\/install-host-credentials\.sh --target staging --rotate/,
    /< \S+ bash scripts\/install-cwagent-staging\.sh --rotate/,
  ];
  it('reports the keys live in IAM and on no host when the new instance never answers, naming both rotations', () => {
    writeFileSync(join(state, 'fresh-down'), 'forever');
    // The wait is shortened only here, where running out is the verdict.
    const r = replace({ BOOTSTRAP_HOST_FRESH_LOGIN_WAIT_SECS: '1' });
    expect(r.status).toBe(1);
    const report = closingReport(r.out);
    expect(report).toMatch(new RegExp(`${SRC_KEY} \\(footbag-staging-source-profile\\) and ${CW_KEY} \\(footbag-staging-cwagent-publisher\\) are live in IAM and on no host`));
    for (const cmd of ROTATE_BOTH) expect(report).toMatch(cmd);
    expect(report).toMatch(/Nothing was deleted, deactivated or withdrawn/);
    expect(callsLog()).not.toMatch(KEY_CALL);
    expect(carryShredded()).toBe(true);
    expect(leftInTmp()).toEqual([]);
  });

  it('reports the keys installed but unproved when the chain does not resolve on the new instance', () => {
    writeFileSync(join(state, 'chain-refused'), '');
    const r = replace();
    expect(r.status).toBe(1);
    const report = closingReport(r.out);
    expect(report).toMatch(/are installed on the new instance, but its credential chain was not proved there/);
    expect(report).toMatch(/stand-in refusal/);
    expect(report).not.toMatch(/on no host/);
    expect(callsLog()).not.toMatch(KEY_CALL);
    expect(carryShredded()).toBe(true);
    expect(leftInTmp()).toEqual([]);
  });

  it('on an interrupt after the apply reports the keys on no host, naming both rotations, and shreds its copy', () => {
    hook('install-known-hosts.sh', ['[[ -e "$STATE/interrupt-at-pin" ]] && kill -INT "$PPID"', 'true']);
    writeFileSync(join(state, 'interrupt-at-pin'), '');
    const r = replace();
    expect(r.status).toBe(130);
    const report = closingReport(r.out);
    expect(report).toMatch(/interrupted/);
    expect(report).toMatch(/are live in IAM and on no host/);
    for (const cmd of ROTATE_BOTH) expect(report).toMatch(cmd);
    expect(sessions().some((s) => /^MODE=install$/m.test(s.stream))).toBe(false);
    expect(callsLog()).not.toMatch(KEY_CALL);
    expect(carryShredded()).toBe(true);
    expect(leftInTmp()).toEqual([]);
  });

  it('when the apply wrapper fails, says the old instance may be gone with the keys on no host, naming both rotations', () => {
    // Defect caught: a failed apply, which may have destroyed the instance,
    // ends with the report silent on where the host's keys are, or claiming
    // they are safe on a host that may no longer stand.
    setExit('terraform-apply.sh', 1);
    const r = replace();
    expect(r.status).toBe(1);
    const report = closingReport(r.out);
    expect(report).toMatch(/the replacement apply did not finish, so whether footbag-staging-web still stands is not known here/);
    expect(report).toMatch(new RegExp(`If it was destroyed, the host AWS access keys ${SRC_KEY} \\(footbag-staging-source-profile\\) and ${CW_KEY} \\(footbag-staging-cwagent-publisher\\) are live in IAM and on no host`));
    for (const cmd of ROTATE_BOTH) expect(report).toMatch(cmd);
    expect(report).toMatch(/Nothing was deleted, deactivated or withdrawn/);
    expect(callsLog()).not.toMatch(KEY_CALL);
    expect(carryShredded()).toBe(true);
  });

  it('when the install session drops mid-way, says whether the keys landed is not known, never that they are on no host', () => {
    // Defect caught: a session that dropped after the files may have been
    // promoted is reported as keys on no host, and the maintainer is sent to
    // rotate keys that are in fact on the new instance.
    writeFileSync(join(state, 'install-dies'), '');
    const r = replace();
    expect(r.status).toBe(1);
    const report = closingReport(r.out);
    expect(report).toMatch(new RegExp(`the run stopped while installing the host AWS access keys ${SRC_KEY} \\(footbag-staging-source-profile\\) and ${CW_KEY} \\(footbag-staging-cwagent-publisher\\) on the new instance, so whether they reached it is not known here`));
    expect(report).toMatch(/A re-run of this route proves them there if they did/);
    expect(report).not.toMatch(/were not installed on the new instance/);
    expect(callsLog()).not.toMatch(KEY_CALL);
    expect(carryShredded()).toBe(true);
  });

  it('a re-run after a stop finds the carried keys on the new instance, says so, and replaces nothing again', () => {
    // Defect caught: a re-run after a stop part way either replaces the new
    // instance again, or refuses a carry that in fact landed.
    writeFileSync(join(state, 'chain-refused'), '');
    expect(replace().status).toBe(1);
    rmSync(join(state, 'chain-refused'));
    // The alias now reaches the new instance, where footbag has no account yet.
    writeFileSync(join(state, 'unreachable'), '');
    rmSync(join(state, 'calls.log'));
    rmSync(join(state, 'siblings.log'));
    const again = replace();
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/already holding the carried keys/);
    expect(snapshotTaken()).toBe(false);
    expect(applied()).toBe(false);
    expect(callsLog()).not.toMatch(KEY_CALL);
  });

  it('on an image with no aws CLI yet installs the keys, proves their ids, and leaves the chain to the bootstrap', () => {
    // Defect caught: a fresh image that has no aws CLI until the bootstrap
    // installs one fails the replacement after the keys landed, so the drill
    // stops there and its resume can never pass; or the run claims a chain it
    // never asked about.
    writeFileSync(join(state, 'new-host-no-cli'), '');
    const r = replace();
    expect(r.status, r.out).toBe(0);
    for (const [rel, body] of Object.entries(OLD_HOST_FILES)) {
      expect(readFileSync(join(state, 'newhost', rel), 'utf-8'), rel).toBe(body);
    }
    const report = closingReport(r.out);
    expect(report).toMatch(/Not proven:[\s\S]*credential chain: its image has no aws CLI yet, so the bootstrap's credential step proves it/);
    expect(report).not.toMatch(/resolves the runtime role/);
    expect(callsLog()).not.toMatch(KEY_CALL);
    expect(carryShredded()).toBe(true);
    expect(leftInTmp()).toEqual([]);
  });

  it('a re-run on an image with no aws CLI yet finds the carried keys and replaces nothing again', () => {
    // Defect caught: a re-run after the keys landed on such an image reads
    // them as not carried, refuses, and leaves the drill unable to resume.
    writeFileSync(join(state, 'new-host-no-cli'), '');
    expect(replace().status).toBe(0);
    writeFileSync(join(state, 'unreachable'), '');
    rmSync(join(state, 'calls.log'));
    rmSync(join(state, 'siblings.log'));
    const again = replace();
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/already holding the carried keys/);
    expect(closingReport(again.out)).toMatch(/credential chain: its image has no aws CLI yet/);
    expect(snapshotTaken()).toBe(false);
    expect(applied()).toBe(false);
    expect(callsLog()).not.toMatch(KEY_CALL);
  });

  it('installs nothing on a new instance whose awscreds group has another id, and says the keys are on no host', () => {
    // Defect caught: the files land readable by a group the containers are not
    // in, and the failure reads later as unreadable credentials.
    writeFileSync(join(state, 'awscreds-gid'), '1001');
    const r = replace();
    expect(r.status).toBe(1);
    expect(closingReport(r.out)).toMatch(/group awscreds has gid 1001, expected 1500; nothing installed/);
    expect(closingReport(r.out)).toMatch(/live in IAM and on no host/);
    expect(existsSync(join(state, 'newhost/root/.aws/credentials'))).toBe(false);
  });

  it('never takes a host that has the shared account for its own carried instance', () => {
    // Defect caught: a re-run against an already bootstrapped host whose account
    // stopped answering reads its keys as "already carried", ending green with
    // nothing replaced and nothing proved about the instance it meant.
    writeFileSync(join(state, 'chain-refused'), '');
    expect(replace().status).toBe(1);
    rmSync(join(state, 'chain-refused'));
    writeFileSync(join(state, 'unreachable'), '');
    writeFileSync(join(state, 'footbag-on-new-host'), '');
    const again = replace();
    expect(again.status).toBe(1);
    expect(again.out).not.toMatch(/already holding the carried keys/);
    expect(again.out).toMatch(/could not be read\. Nothing was changed/);
  });

  it('a re-run after a stop that installed nothing refuses, naming the vault and the rotations', () => {
    writeFileSync(join(state, 'fresh-down'), 'forever');
    expect(replace({ BOOTSTRAP_HOST_FRESH_LOGIN_WAIT_SECS: '1' }).status).toBe(1);
    rmSync(join(state, 'fresh-down'));
    writeFileSync(join(state, 'unreachable'), '');
    rmSync(join(state, 'siblings.log'));
    const again = replace();
    expect(again.status).toBe(1);
    expect(again.out).toMatch(/reinstalled from the vault/);
    for (const cmd of ROTATE_BOTH) expect(again.out).toMatch(cmd);
    expect(applied()).toBe(false);
  });

  it('replace, then bootstrap through the real agent installer: no key is created, deactivated or deleted', () => {
    // The real installers run, against the same recording AWS stand-in for
    // their own key library. Defect caught: anything on the rebuild path mints,
    // retires or deletes a host access key.
    const r = replace();
    expect(r.status, r.out).toBe(0);
    const repo = process.cwd();
    for (const name of ['install-cwagent-staging.sh', 'install-host-credentials.sh']) {
      sh(join(work, 'siblings', name), [`printf '%s %s\\n' ${JSON.stringify(name)} "$*" >> ${JSON.stringify(join(state, 'siblings.log'))}`, `exec bash ${JSON.stringify(join(repo, 'scripts', name))} "$@"`]);
    }
    // The new instance as the bootstrap finds it: the keys the carry installed
    // there, read back from its files, and no agent running yet.
    const keyIn = (rel: string, profile: string) =>
      new RegExp(`\\[${profile}\\]\\naws_access_key_id = (\\S+)`).exec(readFileSync(join(state, 'newhost', rel), 'utf-8'))![1];
    writeHost({
      ...finishedHost('staging'),
      CRED_KEY_ID: keyIn('root/.aws/credentials', 'footbag-staging-source-profile'),
      CWAGENT_KEY_ID: keyIn('etc/amazon-cloudwatch-agent.aws/credentials', 'footbag-staging-cwagent'),
      CWAGENT_ACTIVE: 'inactive', CWAGENT_ENABLED: 'disabled', CWAGENT_VERSION: '',
    });
    onEvent('cwagent-upgrade', { CWAGENT_ACTIVE: 'active', CWAGENT_ENABLED: 'enabled', CWAGENT_VERSION: CWAGENT });
    const boot = runTty(['--target', 'staging'], '', { IAM_KEY_AWS_BIN: join(work, 'bin', 'aws') });
    expect(boot.status, boot.out).toBe(0);
    expect(existsSync(join(state, 'agent-installed')), 'the real installer reached the host').toBe(true);
    expect(siblingCalls().filter((c) => /^install-(cwagent|host-credentials)/.test(c)), boot.out).toEqual(['install-cwagent-staging.sh --upgrade']);
    expect(callsLog()).toMatch(/^aws iam list-access-keys --user-name footbag-staging-cwagent-publisher/m);
    expect(callsLog()).not.toMatch(KEY_CALL);
    const st = run(['--target', 'staging', '--status']);
    expect(st.status, st.stdout).toBe(0);
  });
});

describe('bootstrap-host.sh: the agent\'s metrics after an install', () => {
  // Metrics take minutes to arrive after an agent install. Defect caught: the
  // bootstrap ends at once with the agent row pending, so a status proof run
  // straight after reads PENDING for metrics still on their way; or it waits
  // without bound, or passes without them.
  function agentToInstall(): void {
    writeHost({ ...finishedHost('staging'), CWAGENT_ACTIVE: 'inactive', CWAGENT_ENABLED: 'disabled', CWAGENT_VERSION: '' });
    hook('install-cwagent-staging.sh--upgrade', ['touch "$STATE/agent-installed"']);
    onEvent('install-cwagent-staging.sh--upgrade', { CWAGENT_ACTIVE: 'active', CWAGENT_ENABLED: 'enabled', CWAGENT_VERSION: CWAGENT });
    setExit('verify-cwagent-metrics.sh', 1);
  }

  // The verifier as CloudWatch answers it: state/metrics-at holds the newest
  // datapoint's time, and a read passes when there is one, at or after its
  // --since when it is given one.
  const METRICS_BY_TIME = [
    'since=""; prev=""; for a in "$@"; do [[ "$prev" == --since ]] && since="$a"; prev="$a"; done',
    '[[ -e "$STATE/metrics-at" ]] || { echo "  FAIL  cpu_usage_active     cpu=cpu-total            no datapoints"; exit 1; }',
    '[[ -z "$since" ]] && exit 0',
    '(( $(date -u -d "$(cat "$STATE/metrics-at")" +%s) >= $(date -u -d "$since" +%s) )) && exit 0',
    'echo "  FAIL  cpu_usage_active     cpu=cpu-total            no datapoints"; exit 1',
  ];

  it('waits for metrics that arrive late, then passes', () => {
    agentToInstall();
    // The new agent's first datapoint arrives on the third read after the install.
    hook('verify-cwagent-metrics.sh', [
      'if [[ -e "$STATE/agent-installed" ]]; then',
      '  n=$(( $(cat "$STATE/metric-reads" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE/metric-reads"',
      '  (( n < 3 )) || date -u +%Y-%m-%dT%H:%M:%SZ > "$STATE/metrics-at"',
      'fi',
      ...METRICS_BY_TIME,
    ]);
    const r = runTty(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(Number(readFileSync(join(state, 'metric-reads'), 'utf-8'))).toBeGreaterThanOrEqual(3);
    // The run polled the metrics alone, straight after the install, rather than
    // passing because a later step's reads happened to see them arrive.
    const after = siblingCalls().slice(siblingCalls().findIndex((c) => c.startsWith('install-cwagent-staging.sh --upgrade')) + 1)
      .map((c) => c.split(' ')[0]);
    const polled = after.findIndex((c, i) => c === 'verify-cwagent-metrics.sh' && after[i + 1] === 'verify-cwagent-metrics.sh');
    expect(polled, after.join('\n')).toBeGreaterThanOrEqual(0);
    expect(after.slice(0, polled).filter((c) => c !== 'verify-cwagent-metrics.sh' && c !== 'verify-host-snapshots.sh'), 'nothing between the install and the wait').toEqual([]);
    expect(closingReport(r.out)).toMatch(/the agent's metrics arrive where the alarms read them/);
  });

  it('is not satisfied by datapoints published before the install, which the replaced host left in the series', () => {
    // Defect caught: the metrics carry no instance dimension, so a wait that
    // counts any datapoint in the window passes on the old host's last
    // minutes, and the bootstrap proves an agent that has published nothing.
    agentToInstall();
    writeFileSync(join(state, 'metrics-at'), new Date(Date.now() - 5 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z'));
    hook('verify-cwagent-metrics.sh', METRICS_BY_TIME);
    // Shortened only here, where running out is the verdict.
    const r = runTty(['--target', 'staging'], '', { BOOTSTRAP_HOST_METRICS_WAIT_SECS: '1' });
    expect(r.status).toBe(1);
    expect(closingReport(r.out)).toMatch(/metrics did not arrive within 1s of its install/);
    // Every read after the install asked only for datapoints from the install on.
    const after = siblingCalls().slice(siblingCalls().findIndex((c) => c.startsWith('install-cwagent-staging.sh --upgrade')) + 1);
    const waits = after.filter((c) => /^verify-cwagent-metrics\.sh .*--since \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ /.test(c));
    expect(waits.length, after.join('\n')).toBeGreaterThan(0);
  });

  it('fails past its bound, naming the metrics check', () => {
    agentToInstall();
    // Shortened only here, where running out is the verdict.
    const r = runTty(['--target', 'staging'], '', { BOOTSTRAP_HOST_METRICS_WAIT_SECS: '1' });
    expect(r.status).toBe(1);
    expect(closingReport(r.out)).toMatch(/metrics did not arrive within 1s .*bash scripts\/verify-cwagent-metrics\.sh --target staging/);
  });

  it('does not wait on a host whose agent it did not install', () => {
    // The passing control: an agent already running is judged on one read.
    setExit('verify-cwagent-metrics.sh', 1);
    const r = runTty(['--target', 'staging'], '', { BOOTSTRAP_HOST_METRICS_WAIT_SECS: '1' });
    expect(r.out).not.toMatch(/Waiting up to/);
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
    writeHost(finishedHost('production'));
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
      /** The host already has its disk swap file active. */
      swapActive?: boolean;
      /** The system-release the repositories dnf resolves for the pin serve (default: the pin). */
      reposServe?: string;
    }
    let releaseFile: string;
    let sqliteTarget: string;
    let dnfConf: string;
    let swapFile: string;
    let fstabFile: string;

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
      // The swap stand-ins: swapon lists the file once a swapon of it has run
      // (or from the start when the host already has one), and the rest only
      // record that they ran.
      swapFile = join(work, 'swapfile');
      fstabFile = join(work, 'fstab');
      writeFileSync(fstabFile, h.swapActive ? `${swapFile} none swap sw 0 0\n` : '');
      rmSync(`${log}.swap-on`, { force: true });
      if (h.swapActive) writeFileSync(`${log}.swap-on`, '');
      tool('swapon', [
        `[[ "$1" == --show* ]] && { [[ -e "$LOG.swap-on" ]] && echo ${JSON.stringify(swapFile)}; exit 0; }`,
        'touch "$LOG.swap-on"',
      ]);
      // fallocate creates the file, as the real one does, so the chmod after it
      // finds it; mkswap only records that it ran.
      tool('fallocate', ['touch "${*: -1}"']);
      tool('mkswap', ['exit 0']);
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
      // A release step on a small host with no disk swap is killed for want of
      // memory while it loads the release's metadata, as it was on staging's
      // 512 MB instance (exit 137, the kernel's SIGKILL).
      // The release the repositories dnf resolves for the pin actually serve:
      // the pin when the lock holds, another release when it does not. The
      // query and the upgrade read the same repositories, as the real ones do.
      const serves = h.reposServe ?? AL_PIN;
      tool('dnf', [
        '[[ "$1" =~ ^(upgrade|repoquery)$ && ! -e "$LOG.swap-on" ]] && { echo "Amazon Linux 2023 repository  76 MB/s |  90 MB  00:01"; exit 137; }',
        `[[ "$1" == repoquery && "$*" == *"--qf %{version}\\n system-release"* ]] && { echo ${serves}; exit 0; }`,
        // dnf upgrade only moves forward: a host already past the release the
        // repositories serve is left where it is ("Nothing to do"), as on staging.
        `cur="$(sed -n 's/^Amazon Linux release \\([0-9.]*\\).*/\\1/p' ${JSON.stringify(releaseFile)})"`,
        `[[ "$1" == upgrade && "$(printf '%s\\n%s\\n' "$cur" ${serves} | sort -V | tail -n 1)" == ${serves} ]] && echo "Amazon Linux release ${serves} (Amazon Linux)" > ${JSON.stringify(releaseFile)}`,
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
        'FOOTBAG_ENV=staging', `SWAPFILE_PATH=${swapFile}`, `FSTAB_FILE=${fstabFile}`,
      ].join('\n') + '\n';
    }

    it('turns on a disk swap file before the release step, so a small fresh host survives it', () => {
      // Defect caught: on a fresh 512 MB instance, which has only compressed
      // in-RAM swap until the deploy adds the disk file several steps later, the
      // release step's dnf was killed for want of memory and the bootstrap could
      // never get past its package step.
      provisionTools({ engine: 'none', release: '2023.6.20241010', distroSqlite: true });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status, r.out).toBe(0);
      const log = logged();
      expect(log).toMatch(new RegExp(`^fallocate -l 1G ${swapFile}$`, 'm'));
      expect(log.indexOf(`swapon ${swapFile}`)).toBeGreaterThan(-1);
      expect(log.indexOf(`swapon ${swapFile}`)).toBeLessThan(log.indexOf('dnf upgrade'));
      expect(readFileSync(fstabFile, 'utf-8')).toBe(`${swapFile} none swap sw 0 0\n`);
    });

    it('refuses a staging host one release past its pin before the swap file or any package is touched', () => {
      // Defect caught: a fresh staging instance whose image is one release past
      // the pin is provisioned with a warning, so staging rehearses a release on
      // an operating system production would refuse.
      const newer = '2023.12.20261120';
      provisionTools({ engine: 'none', release: newer, distroSqlite: true });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status, r.out).toBe(1);
      expect(r.out).not.toMatch(/---FOOTBAG-PROBLEM--- WARN/);
      expect(problems(r.out)).toHaveLength(1);
      expect(problems(r.out)[0]).toContain(`runs Amazon Linux ${newer}, newer than the pinned ${AL_PIN}`);
      expect(problems(r.out)[0]).toContain('nothing was changed on the host');
      expect(logged()).not.toMatch(/^(dnf|fallocate|mkswap) /m);
      expect(existsSync(swapFile)).toBe(false);
    });

    it('refuses a production host past its pin before the swap file or any package is touched', () => {
      // Defect caught: a fresh production instance whose image is past the pin
      // has its swap file made and a dnf upgrade run that cannot reach the pin,
      // and is refused only afterwards, so the refusal reports a changed host
      // for a step that could never have landed.
      const newer = '2099.1.20990101';
      provisionTools({ engine: 'none', release: newer, distroSqlite: true });
      const r = runHalf(PROVISION_HALF, pins().replace('FOOTBAG_ENV=staging', 'FOOTBAG_ENV=production'));
      expect(r.status).toBe(1);
      expect(problems(r.out)).toHaveLength(1);
      expect(problems(r.out)[0]).toContain('nothing was changed on the host');
      expect(logged()).not.toMatch(/^(dnf|fallocate|mkswap) /m);
      expect(existsSync(swapFile)).toBe(false);
      expect(readFileSync(releaseFile, 'utf-8')).toContain(newer);
    });

    it('refuses before any package moves when the repositories for the pin would carry the host past it', () => {
      // Defect caught: the release step trusts --releasever to hold the
      // upgrade at the pin; where a repository dnf reads is not locked to it,
      // the upgrade lands the host on a newer release, past the pin, and only
      // the check after it notices, once every package has moved.
      const past = '2099.1.20990101';
      provisionTools({ engine: 'none', release: '2023.6.20241010', distroSqlite: true, reposServe: past });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status).toBe(1);
      expect(problems(r.out)).toHaveLength(1);
      expect(problems(r.out)[0]).toContain(`serve system-release ${past}`);
      expect(problems(r.out)[0]).toContain('this run had already changed: provisioned the 1G');
      expect(problems(r.out)[0]).not.toContain('ran dnf upgrade');
      expect(logged()).not.toMatch(/^dnf (upgrade|install|remove) /m);
      expect(readFileSync(releaseFile, 'utf-8')).toContain('2023.6.20241010');

      // The same host with the lock holding lands exactly on the pin.
      rmSync(log, { force: true });
      provisionTools({ engine: 'none', release: '2023.6.20241010', distroSqlite: true });
      const held = runHalf(PROVISION_HALF, pins());
      expect(held.status, held.out).toBe(0);
      expect(readFileSync(releaseFile, 'utf-8')).toBe(`Amazon Linux release ${AL_PIN} (Amazon Linux)\n`);
      const order = logged();
      expect(order.indexOf('dnf repoquery')).toBeGreaterThan(-1);
      expect(order.indexOf('dnf repoquery')).toBeLessThan(order.indexOf('dnf upgrade'));
    });

    it('leaves an active swap file alone', () => {
      // Defect caught: a re-run reallocating the swap file under a host using it.
      provisionTools({ engine: 'pinned', release: AL_PIN, distroSqlite: false, installedSqlite: SQLITE_PIN, swapActive: true });
      const r = runHalf(PROVISION_HALF, pins());
      expect(r.status, r.out).toBe(0);
      expect(logged()).not.toMatch(/^(fallocate|mkswap) /m);
      expect(readFileSync(fstabFile, 'utf-8')).toBe(`${swapFile} none swap sw 0 0\n`);
    });

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

  describe('the carry body installing on the new instance', () => {
    const CARRY_HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-carry-remote.sh');
    const enc = (rel: string) => Buffer.from(OLD_HOST_FILES[rel]).toString('base64');
    function install(over: Record<string, string> = {}) {
      const values: Record<string, string> = {
        CARRY_CREDS_B64: enc('root/.aws/credentials'),
        CARRY_CONFIG_B64: enc('root/.aws/config'),
        CARRY_AGENT_B64: enc('etc/amazon-cloudwatch-agent.aws/credentials'),
        CARRY_SRC_KEY: SRC_KEY,
        CARRY_CW_KEY: CW_KEY,
        ...over,
      };
      const stream = ['MODE=install', 'TARGET_ENV=staging', ...Object.entries(values).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n';
      return runHalf(CARRY_HALF, stream, {
        CARRY_ROOT_DIR: join(state, 'newhost'),
        PATH: `${join(state, 'hosttools')}:${process.env.PATH ?? ''}`,
      });
    }
    const installed = () => ['root/.aws/credentials', 'root/.aws/config', 'etc/amazon-cloudwatch-agent.aws/credentials']
      .filter((rel) => existsSync(join(state, 'newhost', rel)));

    it('installs all three and proves the chain when every value decodes, the control for the refusals below', () => {
      const r = install();
      expect(r.status, r.out).toBe(0);
      expect(installed()).toHaveLength(3);
      expect(r.out).toMatch(/^---FOOTBAG-CARRY-INSTALLED---$/m);
      expect(r.out).toMatch(/^---FOOTBAG-CARRY-PROVED---$/m);
    });

    it('installs none of the three when the third value does not decode, and says nothing was installed', () => {
      // Defect caught: the first two files are promoted before the third is
      // found bad, leaving the new instance a credentials file and a config
      // with no agent key, and a caller told nothing landed.
      const r = install({ CARRY_AGENT_B64: '!!!!not-base64' });
      expect(r.status).toBe(1);
      expect(installed()).toEqual([]);
      const tools = join(state, 'hosttools.log');
      expect(existsSync(tools) ? readFileSync(tools, 'utf-8') : '').not.toMatch(/^install -m /m);
      expect(r.out).toMatch(/^---FOOTBAG-CARRY-NOTHING-INSTALLED---$/m);
      expect(r.out).toMatch(/^---FOOTBAG-PROBLEM--- ERROR the content carried for \S+amazon-cloudwatch-agent\.aws\/credentials is not base64; nothing installed$/m);
      expect(r.out).not.toMatch(/---FOOTBAG-CARRY-INSTALLED---/);
    });

    it('refuses files whose key id, read back after the install, is not the one the old host held', () => {
      // Defect caught: the files that land hold another key than the one the
      // run checked live in IAM and reported carried, and the run says carried.
      const r = install({ CARRY_SRC_KEY: DEAD_KEY });
      expect(r.status).toBe(1);
      expect(r.out).toMatch(new RegExp(`^---FOOTBAG-PROBLEM--- ERROR \\S+/root/\\.aws/credentials holds '${SRC_KEY}' under \\[footbag-staging-source-profile\\] after the install, not ${DEAD_KEY}$`, 'm'));
      expect(r.out).not.toMatch(/---FOOTBAG-CARRY-INSTALLED---/);
      expect(r.out).not.toMatch(/---FOOTBAG-CARRY-PROVED---/);
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

    describe('the database facts', () => {
      // A stand-in sqlite3 answers the two read-only queries the body asks,
      // from files a case writes, and records how it was opened.
      function dbTools(baseline: string | null, admins: string | null): string {
        for (const t of ['sshd', 'systemctl', 'docker', 'aws', 'swapon', 'ss', 'dnf']) tool(t, ['exit 1']);
        tool('sqlite3', [
          `echo "sqlite3 $*" >> ${JSON.stringify(log)}`,
          '[[ "$1" == -readonly ]] || { echo "stand-in: opened writable" >&2; exit 1; }',
          'case "$3" in',
          `  *schema_migrations*) ${baseline === null ? 'echo "Error: stand-in database is locked" >&2; exit 1' : `printf '%s\\n' ${JSON.stringify(baseline)}`} ;;`,
          `  *members_active*) ${admins === null ? 'echo "Error: stand-in no such table: members_active" >&2; exit 1' : `printf '%s\\n' ${JSON.stringify(admins)}`} ;;`,
          'esac',
        ]);
        const dbDir = join(work, 'db');
        mkdirSync(dbDir, { recursive: true });
        writeFileSync(join(dbDir, 'footbag.db'), '');
        return dbDir;
      }

      it('reports the schema checksum and the administrator count, opened read-only', () => {
        // Defects caught: the facts the deploy step and the first-admin row are
        // judged on never reach them, or the live database is opened writable.
        const dbDir = dbTools(SCHEMA_SHA, '2');
        const r = runHalf(STATUS_HALF, '', { FOOTBAG_TEST_DB_DIR: dbDir });
        expect(r.out).toMatch(new RegExp(`^DB_SCHEMA_BASELINE=${SCHEMA_SHA}$`, 'm'));
        expect(r.out).toMatch(/^DB_ADMINS=2$/m);
        expect(r.out).not.toMatch(/---FOOTBAG-PROBLEM--- WARN sqlite3/);
        expect(logged()).toMatch(/^sqlite3 -readonly /m);
      });

      it('reports a failed read as unread with the tool\'s reason, never as zero or none', () => {
        // Defects caught: a count that failed reported as no administrator, which
        // sends the operator to mint a second claim token, or a baseline read
        // that failed reported as a different schema, which offers a rebuild.
        const dbDir = dbTools(null, null);
        const r = runHalf(STATUS_HALF, '', { FOOTBAG_TEST_DB_DIR: dbDir });
        expect(r.out).toMatch(/^DB_SCHEMA_BASELINE=unread$/m);
        expect(r.out).toMatch(/^DB_ADMINS=unread$/m);
        expect(r.out).toMatch(/^---FOOTBAG-PROBLEM--- WARN sqlite3 could not read the schema baseline .*stand-in database is locked$/m);
        expect(r.out).toMatch(/^---FOOTBAG-PROBLEM--- WARN sqlite3 could not count the administrators .*no such table: members_active$/m);
      });

      it('reports none, not unread, for a database with no baseline row, and a non-number count as unread', () => {
        // Defects caught: a database built before the baseline row existed reads
        // as a failed read, so the step stays unknown and never offers the
        // rebuild; or a count answering something other than a number is
        // trusted as one.
        const dbDir = dbTools('', 'not a number');
        const r = runHalf(STATUS_HALF, '', { FOOTBAG_TEST_DB_DIR: dbDir });
        expect(r.out).toMatch(/^DB_SCHEMA_BASELINE=none$/m);
        expect(r.out).toMatch(/^DB_ADMINS=unread$/m);
      });

      it('reports none for both on a host with no database, opening nothing', () => {
        for (const t of ['sshd', 'systemctl', 'docker', 'aws', 'swapon', 'ss', 'dnf', 'sqlite3']) tool(t, ['exit 1']);
        const empty = join(work, 'no-db');
        mkdirSync(empty, { recursive: true });
        const r = runHalf(STATUS_HALF, '', { FOOTBAG_TEST_DB_DIR: empty });
        expect(r.out).toMatch(/^DB_SCHEMA_BASELINE=none$/m);
        expect(r.out).toMatch(/^DB_ADMINS=none$/m);
      });
    });
  });

  describe('the key-id body', () => {
    const KEYID_HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-keyid-remote.sh');
    function ask(file: string): string {
      return `CRED_FILE=${file}\nCRED_PROFILE=footbag-staging-source-profile\n`;
    }

    it('answers the key id the profile holds, and an empty one for a file that is not there', () => {
      const creds = join(work, 'credentials');
      writeFileSync(creds, `[footbag-staging-source-profile]\naws_access_key_id = ${SRC_KEY}\naws_secret_access_key = stub\n`);
      const r = runHalf(KEYID_HALF, ask(creds));
      expect(r.status, r.out).toBe(0);
      expect(r.out).toMatch(new RegExp(`^---FOOTBAG-KEY-ID---\\n${SRC_KEY}\\n---FOOTBAG-END---$`, 'm'));
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
