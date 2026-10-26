/**
 * Restoring an environment's host from its automatic snapshot, in its own region.
 *
 * This is the run the four-hour recovery objective for losing a host rests on,
 * and every step of it is destructive or outward-facing: it stops the live
 * instance, creates another, rewrites a firewall, moves the address CloudFront
 * reaches, puts the real database back onto the restored host, rewrites
 * Terraform state and re-pins the host key every operator script trusts. So the
 * suite drives the whole operation end to end against a stand-in Lightsail that
 * keeps state between calls, a stand-in Terraform whose plan follows that state,
 * a stand-in database restore and a stand-in host, and judges each case on where
 * the estate ends up rather than on which commands ran.
 *
 * What is pinned:
 *   - every refusal (no target, a role instead of the operator, Terraform and the
 *     static IP disagreeing, no usable snapshot, no terminal, a wrong word) leaves
 *     the estate untouched, beside a run the same guards let through;
 *   - a run stopped at any step is finished by running it again, without
 *     repeating what was already done;
 *   - the restored host is kept off the public path, its origin port closed and
 *     its service and backups held, until the last real backup is restored onto
 *     it, and only then is the origin port opened;
 *   - the static IP ends on the new instance, which carries the old firewall;
 *   - nothing leaves Terraform state unless the plan changes only the instance,
 *     its firewall and the static IP's attachment, and the new instance matches
 *     the old one and the tree;
 *   - the adoption applies nothing unless its plan imports the new instance and
 *     destroys and changes nothing else;
 *   - the old instance is stopped and never deleted except by --delete-old, after
 *     its own confirmation and a fresh proof of the restored host;
 *   - a restored host lost in its turn is restored again, not deadlocked;
 *   - an interrupt deletes only a new instance nothing points at yet, and no run
 *     leaves a saved plan or any other temporary file behind.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync, chmodSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';
import { requireToolInCI } from '../fixtures/toolAvailability';

const SCRIPT = join(process.cwd(), 'scripts/restore-host.sh');

/** A fixed clock, so the new instance's name and the elapsed time are known. */
const NOW = 1793000000;
const stampAt = (epoch: number) => new Date(epoch * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 12);
const STAMP = stampAt(NOW);
const OLD = 'footbag-staging-web';
const NEW = `${OLD}-r${STAMP}`;
const RECORD = `${OLD}-pre-restore-${STAMP}`;
const IP = '203.0.113.10';
/** The newest routine backup the old host wrote, five minutes before the run. */
const LAST_BACKUP = 'routine/2026/10/26/footbag-20261026T072800Z.db.gz';
/** Two automatic snapshots, the newer one used unless another date is asked for. */
const AUTO_SNAPSHOTS = [
  `2026-10-25\t${new Date((NOW - 34 * 3600) * 1000).toISOString()}\tSuccess`,
  `2026-10-26\t${new Date((NOW - 10 * 3600) * 1000).toISOString()}\tSuccess`,
].join('\n');
/** The live firewall's shape: the origin port pinned to CloudFront, SSH to operators. */
const OLD_PORTS = {
  portStates: [
    { fromPort: 22, toPort: 22, protocol: 'tcp', state: 'open', cidrs: ['198.51.100.4/32'], cidrListAliases: ['lightsail-connect'] },
    { fromPort: 80, toPort: 80, protocol: 'tcp', state: 'open', cidrs: ['192.0.2.0/24'] },
    { fromPort: 2222, toPort: 2222, protocol: 'tcp', state: 'open', cidrs: ['198.51.100.4/32'] },
  ],
};
/** What a new Lightsail Linux instance carries: SSH and HTTP open to everyone. */
const DEFAULT_PORTS = {
  portStates: [
    { fromPort: 22, toPort: 22, protocol: 'tcp', state: 'open', cidrs: ['0.0.0.0/0'], ipv6Cidrs: ['::/0'] },
    { fromPort: 80, toPort: 80, protocol: 'tcp', state: 'open', cidrs: ['0.0.0.0/0'], ipv6Cidrs: ['::/0'] },
  ],
};
/** The host keys Lightsail reports for an instance the stand-in created. */
const keyOf = (name: string) => `AAAAC3-${name}`;

const HAS_SCRIPT = requireToolInCI('script', '--version');
const HAS_SETSID = requireToolInCI('setsid', '--version');

let work: string;
let st: string;
let bin: string;
let tmp: string;
let valuesFile: string;
let pinFile: string;
let credFile: string;

const ORIGINAL_VALUES = 'environment = "staging"\nlightsail_bundle_id = "small_3_0"\n';

const p = (name: string) => join(st, name);
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const calls = () => read(p('calls.log'));
const callLines = () => calls().split('\n').filter(Boolean);
const countCalls = (sub: string) => callLines().filter((l) => l.split(' ')[1] === sub || l.split(' ')[0] === sub).length;
const instances = () => read(p('instances')).split('\n').filter(Boolean).map((l) => l.split('\t'));
const instanceState = (name: string) => instances().find((r) => r[0] === name)?.[1];
const staticIpOn = () => read(p('staticip')).split('\t')[1];
const portsIn = (file: string) => JSON.parse(read(file) || '{"portStates":[]}');
const ports = (name: string) => portsIn(p(`ports-${name}.json`));
const normalise = (doc: { portStates: Record<string, unknown>[] }) => JSON.stringify(
  doc.portStates.map((s) => ({
    fromPort: s.fromPort, cidrs: s.cidrs ?? [], ipv6Cidrs: s.ipv6Cidrs ?? [], aliases: s.cidrListAliases ?? [],
  })),
);
const normalisedPorts = (name: string) => normalise(ports(name));
const withoutOrigin = (doc: { portStates: Record<string, unknown>[] }) => ({ portStates: doc.portStates.filter((s) => s.fromPort !== 80) });
const openPorts = (doc: { portStates: Record<string, unknown>[] }) => doc.portStates.map((s) => s.fromPort);
const records = () => read(p('snapshots')).split('\n').filter(Boolean).map((l) => l.split('\t'));
const recordRow = (name = RECORD) => records().find((r) => r[0] === name);
const tmpLeft = () => (existsSync(tmp) ? readdirSync(tmp) : []);

function exe(path: string, body: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...body].join('\n') + '\n');
  chmodSync(path, 0o755);
}

/**
 * A Lightsail that remembers. Each call is logged as "<service> <subcommand>
 * <args>" and changes the files under the state directory the way the real
 * service changes the account, with one read of delay where the real service
 * takes time (a snapshot pending, an instance starting or stopping), so the
 * script's waits are exercised. A new instance refuses its first
 * PORTS_REFUSALS firewall writes (one by default), as a pending instance may.
 * FAIL_ON=<subcommand> refuses that call; TERM_AFTER=<subcommand> performs it
 * and then interrupts the script; STUCK_STOPPING leaves a stop in "stopping"
 * until it is forced; CREATED_BUNDLE gives a new instance another bundle than
 * asked for; BREAK_OUTPUT_AFTER=<subcommand> makes every later Terraform output
 * read fail.
 */
function writeAwsStub(): void {
  exe(join(bin, 'aws'), [
    `S=${JSON.stringify(st)}`,
    'svc="$1"; sub="$2"; shift 2',
    'echo "$svc $sub $*" >> "$S/calls.log"',
    '[[ -n "${FAIL_ON:-}" && "$sub" == "$FAIL_ON" ]] && { echo "refused by the stand-in" >&2; exit 1; }',
    'arg() { local k="$1"; shift; while [[ $# -gt 0 ]]; do [[ "$1" == "$k" ]] && { printf "%s" "$2"; return; }; shift; done; }',
    'has() { local k="$1"; shift; for a in "$@"; do [[ "$a" == "$k" ]] && return 0; done; return 1; }',
    'flip() { local f="$1" from="$2" to="$3"; [[ -f "$f" ]] && sed -i "s/\\t${from}\\t/\\t${to}\\t/" "$f"; }',
    'row() { grep "^$1"$\'\\t\' "$S/instances"; }',
    'case "$sub" in',
    '  get-instances)',
    '    cat "$S/instances" 2>/dev/null',
    '    flip "$S/instances" pending running',
    '    [[ -n "${STUCK_STOPPING:-}" ]] || flip "$S/instances" stopping stopped ;;',
    '  get-instance)',
    '    n="$(arg --instance-name "$@")"; r="$(row "$n")" || { echo "NotFoundException" >&2; exit 254; }',
    '    IFS=$\'\\t\' read -r _ _ az b k _ _ <<< "$r"',
    '    printf "%s\\t%s\\t%s\\t%s\\n" "$(cat "$S/blueprint-$n")" "$b" "$k" "$az" ;;',
    '  get-static-ip) cat "$S/staticip"; echo ;;',
    '  get-auto-snapshots) cat "$S/autosnaps"; echo ;;',
    '  get-instance-snapshots)',
    // The record's columns follow the tags the query asks for, as --query would.
    '    if [[ "$(arg --query "$@")" == *footbag-restore-db* ]]; then cat "$S/snapshots" 2>/dev/null; else cut -f1-8 "$S/snapshots" 2>/dev/null; fi',
    '    [[ -f "$S/snapshots" ]] && sed -i "s/\\tpending\\t/\\tavailable\\t/" "$S/snapshots" ;;',
    '  create-instance-snapshot)',
    '    name="$(arg --instance-snapshot-name "$@")"; from="$(arg --instance-name "$@")"',
    '    t() { local k="$1"; shift; for a in "$@"; do case "$a" in "key=$k,value="*) printf "%s" "${a#"key=$k,value="}"; return;; esac; done; printf None; }',
    '    printf "%s\\t%s\\tpending\\t%s\\t%s\\t%s\\t%s\\tNone\\tNone\\n" "$name" "$from" "$(t footbag-restore-state "$@")" "$(t footbag-restore-to "$@")" "$(t footbag-restore-source "$@")" "$(t footbag-restore-started "$@")" >> "$S/snapshots" ;;',
    '  tag-resource)',
    '    name="$(arg --resource-name "$@")"; kv="$(arg --tags "$@")"; k="${kv#key=}"; k="${k%%,*}"; v="${kv#*,value=}"',
    '    col=0; case "$k" in footbag-restore-state) col=4;; footbag-restore-last-backup) col=8;; footbag-restore-db) col=9;; esac',
    '    awk -F"\\t" -v OFS="\\t" -v n="$name" -v c="$col" -v v="$v" \'$1==n && c>0 {$c=v} {print}\' "$S/snapshots" > "$S/snapshots.tmp" && mv "$S/snapshots.tmp" "$S/snapshots" ;;',
    '  stop-instance)',
    '    n="$(arg --instance-name "$@")"',
    '    if has --force "$@"; then flip "$S/instances" stopping stopped; flip "$S/instances" running stopped; else flip "$S/instances" running stopping; fi ;;',
    '  create-instances-from-snapshot)',
    '    name="$(arg --instance-names "$@")"; src="$(arg --source-instance-name "$@")"',
    '    printf "%s\\tpending\\t%s\\t%s\\t%s\\t%s\\t%s\\n" "$name" "$(arg --availability-zone "$@")" "${CREATED_BUNDLE:-$(arg --bundle-id "$@")}" "$(arg --key-pair-name "$@")" "$(arg --ip-address-type "$@")" "14:00" >> "$S/instances"',
    '    cp "$S/blueprint-$src" "$S/blueprint-$name"',
    '    printf "ssh-ed25519\\tAAAAC3-%s\\necdsa-sha2-nistp256\\tAAAAE2-%s\\n" "$name" "$name" > "$S/hostkeys-$name"',
    '    printf "%s" "${PORTS_REFUSALS:-1}" > "$S/ports-refusals-$name"',
    '    cp "$S/default-ports.json" "$S/ports-$name.json" ;;',
    '  get-instance-port-states) cat "$S/ports-$(arg --instance-name "$@").json" 2>/dev/null || echo \'{"portStates":[]}\' ;;',
    '  put-instance-public-ports)',
    '    n="$(arg --instance-name "$@")"; left="$(cat "$S/ports-refusals-$n" 2>/dev/null || echo 0)"',
    '    if (( left > 0 )); then printf "%s" $(( left - 1 )) > "$S/ports-refusals-$n"; echo "OperationFailureException: the instance is pending" >&2; exit 254; fi',
    '    printf \'{"portStates":%s}\' "$(arg --port-infos "$@")" > "$S/ports-$n.json" ;;',
    '  detach-static-ip) printf "False\\tNone\\t%s" "$(cut -f3 "$S/staticip")" > "$S/staticip.tmp" && mv "$S/staticip.tmp" "$S/staticip" ;;',
    '  attach-static-ip) printf "True\\t%s\\t%s" "$(arg --instance-name "$@")" "$(cut -f3 "$S/staticip")" > "$S/staticip.tmp" && mv "$S/staticip.tmp" "$S/staticip" ;;',
    '  get-instance-access-details) cat "$S/hostkeys-$(arg --instance-name "$@")" ;;',
    '  delete-instance) n="$(arg --instance-name "$@")"; grep -v "^$n"$\'\\t\' "$S/instances" > "$S/instances.tmp" || true; mv "$S/instances.tmp" "$S/instances" ;;',
    '  list-objects-v2) printf "%s\\n" "${LAST_BACKUP_KEY:-None}" ;;',
    '  *) echo "stand-in aws: unhandled $svc $sub" >&2; exit 2 ;;',
    'esac',
    '[[ -n "${BREAK_OUTPUT_AFTER:-}" && "$sub" == "$BREAK_OUTPUT_AFTER" ]] && : > "$S/output-broken"',
    '[[ -n "${TERM_AFTER:-}" && "$sub" == "$TERM_AFTER" ]] && kill -TERM "$PPID"',
    'exit 0',
  ]);
}

/**
 * A Terraform whose answers follow the stand-in state. Its plan is derived the
 * way the real one would be from the tree the script needs: the instance's name
 * is the values file's lightsail_instance_name, or the original name when the
 * file records none. While the instance is in state under another name it plans
 * as a replacement (or, with TREE_IGNORES_NAME, as no change, the tree that
 * does not read the name), carrying the tree's placement (TREE_BUNDLE changes
 * the bundle); once it has left state, the import block takes the new instance
 * in and its firewall is created; once applied, nothing changes. PLAN_EXTRA adds
 * one change elsewhere in the tree to every plan, PLAN_EXTRA_AFTER_RM only to a
 * plan made after the instance left state. The state read carries the backup
 * alarm at ALARM_THRESHOLD minutes (15 unless set).
 */
function writeTerraformStub(): void {
  exe(join(bin, 'terraform'), [
    `S=${JSON.stringify(st)}`,
    'shift  # -chdir',
    'echo "terraform $*" >> "$S/calls.log"',
    `newname() { local n; n="$(sed -n 's/^lightsail_instance_name = "\\(.*\\)"$/\\1/p' "$VALUES" | tail -1)"; printf '%s' "\${n:-${OLD}}"; }`,
    'placement() { printf \'"blueprint_id":"ubuntu_24_04","bundle_id":"%s","key_pair_name":"footbag-staging-operator","availability_zone":"us-east-1a"\' "${TREE_BUNDLE:-small_3_0}"; }',
    'plan() {',
    '  local inst ports attach extra="${PLAN_EXTRA:-}" n; n="$(newname)"',
    '  if grep -qx aws_lightsail_instance.web "$S/tfstate"; then',
    '    if [[ "$(cat "$S/tfname")" == "$n" || -n "${TREE_IGNORES_NAME:-}" ]]; then',
    '      inst=\'{"address":"aws_lightsail_instance.web","change":{"actions":["no-op"],"after":{"name":"\'"$(cat "$S/tfname")"\'",\'"$(placement)"\'}}}\'',
    '      ports=\'{"address":"aws_lightsail_instance_public_ports.web","change":{"actions":["no-op"],"after":{}}}\'',
    '      attach=\'{"address":"aws_lightsail_static_ip_attachment.web","change":{"actions":["no-op"],"after":{}}}\'',
    '    else',
    '      inst=\'{"address":"aws_lightsail_instance.web","change":{"actions":["delete","create"],"after":{"name":"\'"$n"\'",\'"$(placement)"\'}}}\'',
    '      ports=\'{"address":"aws_lightsail_instance_public_ports.web","change":{"actions":["delete","create"],"after":{"instance_name":"\'"$n"\'"}}}\'',
    '      attach=\'{"address":"aws_lightsail_static_ip_attachment.web","change":{"actions":["delete","create"],"after":{"instance_name":"\'"$n"\'"}}}\'',
    '    fi',
    '  else',
    '    inst=\'{"address":"aws_lightsail_instance.web","change":{"actions":["update"],"importing":{"id":"\'"$n"\'"},"after":{"name":"\'"$n"\'",\'"$(placement)"\'}}}\'',
    '    ports=\'{"address":"aws_lightsail_instance_public_ports.web","change":{"actions":["create"],"after":{"instance_name":"\'"$n"\'"}}}\'',
    '    attach=\'{"address":"aws_lightsail_static_ip_attachment.web","change":{"actions":["no-op"],"after":{}}}\'',
    '    [[ -n "${PLAN_EXTRA_AFTER_RM:-}" ]] && extra="$PLAN_EXTRA_AFTER_RM"',
    '  fi',
    '  printf \'{"resource_changes":[%s,%s,%s%s]}\' "$inst" "$ports" "$attach" "${extra:+,$extra}"',
    '}',
    'case "$1" in',
    '  output)',
    '    case "$3" in',
    '      lightsail_instance_name) [[ -e "$S/output-broken" ]] && { echo "Error: no state" >&2; exit 1; }; cat "$S/tfname" ;;',
    '      snapshots_bucket_name) printf footbag-staging-snapshots ;;',
    '      *) exit 1 ;;',
    '    esac ;;',
    '  state)',
    '    case "$2" in',
    '      list) cat "$S/tfstate" ;;',
    '      rm) shift 2; for a in "$@"; do grep -vxF "$a" "$S/tfstate" > "$S/tfstate.tmp" || true; mv "$S/tfstate.tmp" "$S/tfstate"; done ;;',
    '    esac ;;',
    '  plan) for a in "$@"; do case "$a" in -out=*) printf "saved plan" > "${a#-out=}";; esac; done; echo "Plan: stand-in" ;;',
    '  show)',
    '    if [[ -z "${3:-}" ]]; then',
    '      printf \'{"values":{"root_module":{"resources":[{"address":"aws_cloudwatch_metric_alarm.db_backup_age[0]","type":"aws_cloudwatch_metric_alarm","name":"db_backup_age","values":{"threshold":%s}}]}}}\' "${ALARM_THRESHOLD:-15}"',
    '    else plan; fi ;;',
    '  *) exit 1 ;;',
    'esac',
    'exit 0',
  ]);
  // scripts/terraform-apply.sh's stand-in: applies the plan the stub would
  // show, which is to say the import lands, Terraform names the new instance,
  // and the declared firewall (the old one, origin port included) is written on
  // it, unless APPLY_LEAVES_PORTS says the apply did not reach the firewall.
  exe(join(bin, 'terraform-apply'), [
    `S=${JSON.stringify(st)}`,
    'echo "terraform-apply $*" >> "$S/calls.log"',
    '[[ -n "${FAIL_ON:-}" && "$FAIL_ON" == "terraform-apply" ]] && exit 1',
    'n="$(sed -n \'s/^lightsail_instance_name = "\\(.*\\)"$/\\1/p\' "$VALUES" | tail -1 | tr -d "\\n")"',
    'printf "%s" "$n" > "$S/tfname"',
    'for a in aws_lightsail_instance.web aws_lightsail_instance_public_ports.web; do grep -qxF "$a" "$S/tfstate" || echo "$a" >> "$S/tfstate"; done',
    '[[ -n "${APPLY_LEAVES_PORTS:-}" ]] || cp "$S/declared-ports.json" "$S/ports-$n.json"',
    '[[ -n "${TERM_AFTER:-}" && "$TERM_AFTER" == "terraform-apply" ]] && kill -TERM "$PPID"',
    'exit 0',
  ]);
  // scripts/install-known-hosts.sh's stand-in: pins the keys of the instance
  // Terraform names, as the real installer reads it, unless PIN_TF_NAME says
  // the installer's Terraform still names another instance.
  exe(join(bin, 'pin-installer'), [
    `S=${JSON.stringify(st)}`,
    'echo "pin-installer $*" >> "$S/calls.log"',
    '[[ -n "${FAIL_ON:-}" && "$FAIL_ON" == "pin-installer" ]] && exit 1',
    `name="\${PIN_TF_NAME:-$(${JSON.stringify(join(bin, 'terraform'))} -chdir=terraform/staging output -raw lightsail_instance_name)}"`,
    `: > ${JSON.stringify(pinFile)}`,
    `while IFS=$'\\t' read -r alg pub; do printf '%s %s %s\\n[%s]:2222 %s %s\\n' ${IP} "$alg" "$pub" ${IP} "$alg" "$pub" >> ${JSON.stringify(pinFile)}; done < "$S/hostkeys-$name"`,
    'exit 0',
  ]);
  // scripts/restore-db.sh's stand-in: records how it was asked, the password
  // line it was handed, the pin it would reach the host with, and the firewall
  // the restored host carried while its database was being replaced.
  exe(join(bin, 'restore-db'), [
    `S=${JSON.stringify(st)}`,
    'echo "restore-db $*" >> "$S/calls.log"',
    'IFS= read -r line; printf "%s" "$line" > "$S/restore-db-stdin"',
    'cat "${FOOTBAG_KNOWN_HOSTS:-/dev/null}" > "$S/restore-db-pin" 2>/dev/null || true',
    `cp "$S/ports-$(cut -f2 "$S/staticip").json" "$S/ports-at-db-restore.json"`,
    '[[ -n "${FAIL_ON:-}" && "$FAIL_ON" == "restore-db" ]] && { echo "restore-db stand-in: refused" >&2; exit 1; }',
    'echo "== restore complete on staging =="',
    'exit 0',
  ]);
  exe(join(bin, 'curl'), [
    `echo "curl $*" >> ${JSON.stringify(join(st, 'calls.log'))}`,
    'printf "%s" "${READY_CODE:-200}"',
  ]);
}

/**
 * The host behind the alias: the alias lookup, then nothing at all while the
 * static IP is on an instance listed as lost, then which environment it is, and
 * the hold (service and backup timer stopped) and the release (backup timer
 * started) the restore asks for. HOLD_REFUSED makes the hold report the service
 * still running.
 */
function writeSshStub(recorded?: string): void {
  exe(join(bin, 'ssh'), [
    `S=${JSON.stringify(st)}`,
    'for a in "$@"; do',
    `  if [[ "$a" == "-G" ]]; then printf "hostname ${IP}\\nuser footbag\\n"; exit 0; fi`,
    'done',
    'on="$(cut -f2 "$S/staticip")"',
    '[[ -f "$S/lost" ]] && grep -qxF "$on" "$S/lost" && { echo "ssh: connect to host: Connection timed out" >&2; exit 255; }',
    hostIdentityAnswer(recorded, recorded === undefined ? '' : 'https://staging.example.invalid'),
    'case "$*" in',
    '  *footbag-restore-hold*)',
    '    cat >/dev/null; echo "ssh hold" >> "$S/calls.log"',
    '    cp "$S/ports-${on}.json" "$S/ports-at-hold.json"',
    '    [[ -n "${HOLD_REFUSED:-}" ]] && { echo "---FOOTBAG-NOT-HELD---"; exit 1; }',
    '    echo "---FOOTBAG-HELD---"; exit 0 ;;',
    '  *footbag-restore-release*)',
    '    cat >/dev/null; echo "ssh release" >> "$S/calls.log"; echo "---FOOTBAG-RELEASED---"; exit 0 ;;',
    'esac',
    'exit 0',
  ]);
}

function writeIdentity(arn = 'arn:aws:iam::041904915126:user/footbag-operator'): void {
  exe(join(bin, 'identity'), [`printf '%s\\n' ${JSON.stringify(arn)}`]);
}

beforeEach(() => {
  work = createScratchDir('restore-host');
  st = join(work, 'state');
  bin = join(work, 'bin');
  tmp = join(work, 'tmp');
  mkdirSync(st);
  mkdirSync(bin);
  mkdirSync(tmp);
  valuesFile = join(work, 'staging.tfvars');
  pinFile = join(work, 'footbag_known_hosts');
  credFile = join(work, 'cred');
  writeFileSync(credFile, 'fixture-sudo-password\n', { mode: 0o600 });
  writeFileSync(valuesFile, ORIGINAL_VALUES);
  writeFileSync(pinFile, `${IP} ssh-ed25519 ${keyOf(OLD)}\n[${IP}]:2222 ssh-ed25519 ${keyOf(OLD)}\n`, { mode: 0o600 });
  writeFileSync(p('instances'), `${OLD}\trunning\tus-east-1a\tsmall_3_0\tfootbag-staging-operator\tdualstack\t14:00\n`);
  writeFileSync(p(`blueprint-${OLD}`), 'ubuntu_24_04');
  writeFileSync(p('staticip'), `True\t${OLD}\t${IP}`);
  writeFileSync(p('autosnaps'), AUTO_SNAPSHOTS);
  writeFileSync(p(`ports-${OLD}.json`), JSON.stringify(OLD_PORTS));
  writeFileSync(p('declared-ports.json'), JSON.stringify(OLD_PORTS));
  writeFileSync(p('default-ports.json'), JSON.stringify(DEFAULT_PORTS));
  writeFileSync(p(`hostkeys-${OLD}`), `ssh-ed25519\t${keyOf(OLD)}\n`);
  writeFileSync(p('tfname'), OLD);
  writeFileSync(p('tfstate'), 'aws_lightsail_instance.web\naws_lightsail_instance_public_ports.web\naws_lightsail_static_ip_attachment.web\naws_lightsail_static_ip.web\n');
  writeAwsStub();
  writeTerraformStub();
  writeSshStub();
  writeIdentity();
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    TMPDIR: tmp,
    RESTORE_HOST_AWS_BIN: join(bin, 'aws'),
    RESTORE_HOST_TERRAFORM_BIN: join(bin, 'terraform'),
    RESTORE_HOST_CURL_BIN: join(bin, 'curl'),
    RESTORE_HOST_TF_APPLY: join(bin, 'terraform-apply'),
    RESTORE_HOST_PIN_INSTALLER: join(bin, 'pin-installer'),
    RESTORE_HOST_RESTORE_DB: join(bin, 'restore-db'),
    RESTORE_HOST_VALUES_FILE: valuesFile,
    RESTORE_HOST_NOW: String(NOW),
    RESTORE_HOST_POLL_TRIES: '3',
    RESTORE_HOST_POLL_SECS: '0',
    VALUES: valuesFile,
    LAST_BACKUP_KEY: LAST_BACKUP,
    AWS_PROFILE: 'stub-profile',
    AWS_IDENTITY_BIN: join(bin, 'identity'),
    AWS_PROFILE_BIN: join(bin, 'identity'),
    FOOTBAG_HOST_SSH_BIN: join(bin, 'ssh'),
    FOOTBAG_KNOWN_HOSTS: pinFile,
    ...extra,
  };
}

/** No terminal at all: the condition of a scheduled job or an agent session. */
function runDetached(args: string[], extra: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('setsid', ['--wait', 'bash', SCRIPT, ...args], {
    encoding: 'utf8', input: 'fixture-sudo-password\n', env: env(extra), ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

/** At a terminal, typing `typed`, with the credential redirected in as the usage line says. */
function runAtTerminal(args: string[], typed = 'APPLY\n', extra: NodeJS.ProcessEnv = {}) {
  const inner = ['bash', JSON.stringify(SCRIPT), ...args.map((a) => JSON.stringify(a)), '<', JSON.stringify(credFile)].join(' ');
  const res = spawnSync('script', ['-qec', `${inner}; echo "EXIT=$?"`, '/dev/null'], {
    encoding: 'utf8', input: typed, env: env(extra), ...SPAWN_GUARD,
  });
  const out = res.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

const MUTATING = [
  'create-instance-snapshot', 'stop-instance', 'create-instances-from-snapshot', 'put-instance-public-ports',
  'detach-static-ip', 'attach-static-ip', 'delete-instance', 'tag-resource', 'terraform-apply', 'hold', 'release',
];
const mutatingCalls = () => callLines().filter((l) => MUTATING.includes(l.split(' ')[1]) || l.startsWith('terraform-apply')
  || l.startsWith('terraform state rm') || l.startsWith('restore-db'));

describe.skipIf(!HAS_SETSID)('restore-host.sh refusals, each before anything changes', () => {
  it('requires a target rather than defaulting to one', () => {
    // Defect caught: a forgotten flag restoring whichever environment a default
    // named, stopping its live host.
    const r = runDetached([]);
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/--target is required/);
    expect(calls()).toBe('');
  });

  it('refuses --yes, so no flag can stand in for the typed confirmation', () => {
    // Defect caught: an unattended run replacing a host because a flag answered
    // the confirmation in advance.
    const r = runDetached(['--target', 'staging', '--yes']);
    expect(r.status).toBe(2);
    expect(r.out).toContain('--yes is refused');
    expect(calls()).toBe('');
  });

  it('refuses an assumed role, which cannot read the host keys a restore must re-pin', () => {
    // Defect caught: a dev-and-tester's job-role session replacing the host and
    // then failing at the pin, leaving a host no script will connect to.
    writeIdentity('arn:aws:sts::041904915126:assumed-role/FootbagDevTester/someone');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('assumed role');
    expect(mutatingCalls()).toEqual([]);
  });

  it('refuses when the static IP is not on the instance Terraform names', () => {
    // Defect caught: a restore moving the address off a host that is not the
    // one Terraform manages, or snapshotting the wrong instance.
    writeFileSync(p('staticip'), `True\tsomething-else\t${IP}`);
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('reconcile that before restoring');
    expect(mutatingCalls()).toEqual([]);
  });

  it('refuses an instance with no successful automatic snapshot', () => {
    // Defect caught: the old host stopped and a create attempted from a snapshot
    // that does not exist, turning a drill into an outage.
    writeFileSync(p('autosnaps'), `2026-10-26\t${new Date((NOW - 3600) * 1000).toISOString()}\tFailed`);
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('no successful automatic snapshot');
    expect(mutatingCalls()).toEqual([]);
  });

  it('refuses a restore nobody confirmed at a terminal', () => {
    // Defect caught: a scheduled job or agent session stopping the live host.
    const r = runDetached(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('not confirmed');
    expect(mutatingCalls()).toEqual([]);
    expect(instanceState(OLD)).toBe('running');
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-host.sh, a full restore at a terminal', () => {
  it('does nothing when the typed word is anything but APPLY', () => {
    // Defect caught: a casual or lower-case answer accepted as consent to stop
    // the live host.
    const r = runAtTerminal(['--target', 'staging'], 'apply\n');
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toEqual([]);
  });

  it('restores: new instance from the newest snapshot, old firewall, static IP moved, database back, adopted, pinned, verified', () => {
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);

    // The new instance is built from the old one's newest automatic snapshot
    // with the old one's placement and size, tagged as the tree tags what it
    // manages. Defect caught: a restore from the wrong day, into a smaller bundle
    // or another zone, or an instance the dev-and-tester role's tag conditions
    // do not reach until the next apply.
    const create = callLines().find((l) => l.includes('create-instances-from-snapshot'))!;
    for (const part of [`--instance-names ${NEW}`, `--source-instance-name ${OLD}`, '--restore-date 2026-10-26',
      '--availability-zone us-east-1a', '--bundle-id small_3_0', '--key-pair-name footbag-staging-operator',
      'snapshotTimeOfDay=14:00', 'key=Project,value=footbag-platform', 'key=Environment,value=staging',
      'key=ManagedBy,value=terraform', 'key=Role,value=web']) {
      expect(create, part).toContain(part);
    }
    // Defect caught: the restored host left on the provider's default firewall,
    // SSH and the origin port open to every address.
    expect(normalisedPorts(NEW)).toBe(normalisedPorts(OLD));
    // Defect caught: CloudFront still pointed at the stopped host.
    expect(staticIpOn()).toBe(NEW);
    // Defect caught: the old host deleted by the restore itself, leaving nothing
    // to go back to before the drill has passed.
    expect(instanceState(OLD)).toBe('stopped');
    expect(countCalls('delete-instance')).toBe(0);
    // Adopted: the values file names it, keeping every other line, and the
    // stand-in Terraform now names it. Defect caught: the next plan replacing the
    // restored host with an empty one.
    expect(read(valuesFile)).toContain('lightsail_bundle_id = "small_3_0"');
    expect(read(valuesFile)).toContain(`lightsail_instance_name = "${NEW}"`);
    expect(read(p('tfname'))).toBe(NEW);
    // Defect caught: a pin left on the old keys, so every later script refuses
    // the restored host as an impostor.
    expect(read(pinFile)).toContain(`[${IP}]:2222 ssh-ed25519 ${keyOf(NEW)}`);
    // The host was asked which environment it is and the site for readiness.
    expect(r.out).toContain('records FOOTBAG_ENV=staging');
    expect(calls()).toContain('curl -sS -o /dev/null -w %{http_code} --max-time 10 https://footbag-staging.example.invalid/health/ready');
    // Defect caught: an elapsed time reported before the database is back, so a
    // restore that overran the objective in its last step reads as within it.
    const elapsedAt = r.out.lastIndexOf('elapsed 0h 00m, within the 4-hour in-region recovery objective');
    expect(elapsedAt).toBeGreaterThan(r.out.indexOf('== restore complete on staging =='));
  });

  it('stops before moving the address when the old firewall reads back empty', () => {
    // Defect caught: an empty rule set "copied", leaving the restored host on
    // the provider's default firewall, open to every address, and then given
    // the static IP.
    writeFileSync(p(`ports-${OLD}.json`), '{"portStates":[]}');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('reads back no firewall rules');
    expect(countCalls('put-instance-public-ports')).toBe(0);
    expect(staticIpOn()).toBe(OLD);
  });

  it('takes the steps in the one safe order', () => {
    // Defect caught: the old host stopped before its snapshot exists, the
    // address moved before the firewall is in place, the database restored
    // before the service is held, backups resumed before the real database is
    // in place, or state touched before the database is back.
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const at = (needle: string) => callLines().findIndex((l) => l.includes(needle));
    const order = ['create-instance-snapshot', 'stop-instance', 'create-instances-from-snapshot',
      'put-instance-public-ports', 'detach-static-ip', 'attach-static-ip', 'ssh hold', 'restore-db --target',
      'ssh release', 'terraform state rm', 'terraform-apply', 'pin-installer'];
    const positions = order.map(at);
    for (let i = 0; i < order.length; i++) expect(positions[i], order[i]).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) expect(positions[i], `${order[i - 1]} before ${order[i]}`).toBeGreaterThan(positions[i - 1]);
  });

  it('keeps the origin port closed and the host held until the last real backup is restored onto it', () => {
    // Defect caught: the restored host serving, mailing and taking payments from
    // the snapshot's day-old database through CloudFront, before the real one is
    // back; or the real backup restored over an unpinned or stale host key.
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    const sshOnly = normalise(withoutOrigin(OLD_PORTS));
    // The first firewall the new host carries, and the one it carries while its
    // service is held and its database replaced, are the old one without port 80.
    expect(normalise(portsIn(p('ports-at-hold.json')))).toBe(sshOnly);
    expect(normalise(portsIn(p('ports-at-db-restore.json')))).toBe(sshOnly);
    // The recorded backup, named exactly, with the password as its one stdin
    // line and a pin carrying the new instance's keys.
    expect(callLines().find((l) => l.startsWith('restore-db'))).toBe(`restore-db --target staging --snapshot ${LAST_BACKUP}`);
    expect(read(p('restore-db-stdin'))).toBe('fixture-sudo-password');
    expect(read(p('restore-db-pin'))).toContain(`${IP} ssh-ed25519 ${keyOf(NEW)}`);
    expect(read(p('restore-db-pin'))).not.toMatch(new RegExp(`${keyOf(OLD)}$`, 'm'));
    // And only then is port 80 open on it.
    expect(openPorts(ports(NEW))).toContain(80);
  });

  it.each([
    ['the hold reports the service still running', { HOLD_REFUSED: '1' }, 'restore-db --target'],
    ['the database restore fails', { FAIL_ON: 'restore-db' }, 'terraform-apply'],
  ])('stops with the origin port closed when %s', (_label, extra, absent) => {
    // Defect caught: a failure on the way to the real database answered by
    // opening the site anyway, on the snapshot's day-old data.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', extra);
    expect(r.status).toBe(1);
    expect(calls()).not.toContain(absent);
    expect(calls()).not.toContain('terraform state rm');
    expect(calls()).not.toContain('ssh release');
    expect(staticIpOn()).toBe(NEW);
    expect(openPorts(ports(NEW))).not.toContain(80);
  });

  it('stops with the origin port closed when no last backup was recorded, and restores the one named with --db-snapshot', () => {
    // Defect caught: a host opened to the public on the snapshot's database
    // because no backup was found to restore, or a named backup ignored.
    const chosen = 'hourly/2026/10/26/footbag-20261026T070000Z.db.gz';
    const first = runAtTerminal(['--target', 'staging'], 'APPLY\n', { LAST_BACKUP_KEY: 'None' });
    expect(first.status).toBe(1);
    expect(first.out).toContain('--db-snapshot');
    expect(calls()).not.toContain('restore-db --target');
    expect(openPorts(ports(NEW))).not.toContain(80);
    const second = runAtTerminal(['--target', 'staging', '--db-snapshot', chosen], 'APPLY\n', { LAST_BACKUP_KEY: 'None' });
    expect(second.status, second.out).toBe(0);
    expect(callLines().find((l) => l.startsWith('restore-db'))).toBe(`restore-db --target staging --snapshot ${chosen}`);
    expect(recordRow()?.[7]).toBe(chosen);
    expect(openPorts(ports(NEW))).toContain(80);
  });

  it('fails when the adoption apply leaves the origin port closed', () => {
    // Defect caught: a restore reported done while CloudFront cannot reach the
    // origin, so visitors see the maintenance page indefinitely.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { APPLY_LEAVES_PORTS: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('port 80');
    expect(r.out).not.toContain('restored: ');
  });

  it('fails when the adoption apply opens the origin port to every address', () => {
    // Defect caught: a restore reported done while the origin answers anyone,
    // not only CloudFront, so a forged X-Forwarded-For reaches the app.
    writeFileSync(p('declared-ports.json'), JSON.stringify({
      portStates: OLD_PORTS.portStates.map((s) => (s.fromPort === 80 ? { ...s, cidrs: ['0.0.0.0/0'] } : s)),
    }));
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('admits every address');
    expect(r.out).not.toContain('restored: ');
  });

  it('records the last real database backup before the restored host can upload its own', () => {
    // Defect caught: the restored host's day-old database, uploaded minutes
    // after it boots, taken as the newest backup and restored over the
    // operator's real data.
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(recordRow()?.[7]).toBe(LAST_BACKUP);
    const tagged = callLines().findIndex((l) => l.includes('tag-resource') && l.includes('footbag-restore-last-backup'));
    expect(tagged).toBeLessThan(callLines().findIndex((l) => l.includes('create-instances-from-snapshot')));
  });

  it.each([
    ['five minutes old, within the alarm threshold', LAST_BACKUP, '15', false],
    ['two and a half hours old, past the alarm threshold', 'routine/2026/10/26/footbag-20261026T050000Z.db.gz', '15', true],
    ['two and a half hours old, within a threshold Terraform sets at ten hours', 'routine/2026/10/26/footbag-20261026T050000Z.db.gz', '600', false],
  ])('judges the last backup %s', (_label, key, threshold, warns) => {
    // Defect caught: an operator restoring a backup hours older than the stop
    // without being told the rest of the data is only in the manual snapshot;
    // or a threshold that drifts from the alarm Terraform actually deploys.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { LAST_BACKUP_KEY: key, ALARM_THRESHOLD: threshold });
    expect(r.status, r.out).toBe(0);
    const warning = new RegExp(`older than the ${threshold}-minute backup alarm threshold[\\s\\S]*${RECORD}`);
    if (warns) expect(r.out).toMatch(warning);
    else expect(r.out).not.toMatch(/backup alarm threshold/);
    expect(r.out).toMatch(warns ? /written 2h 33m before the stop/ : /written \d+h \d{2}m before the stop/);
  });

  it('judges the last backup against the stop, not the moment a later run resumes', () => {
    // Defect caught: a resumed run an hour later reporting the backup an hour
    // staler than it was when the old host stopped, and warning on a good one.
    const first = runAtTerminal(['--target', 'staging'], 'APPLY\n', { FAIL_ON: 'create-instances-from-snapshot' });
    expect(first.out).toContain('written 0h 05m before the stop');
    const later = runAtTerminal(['--target', 'staging'], 'APPLY\n', { RESTORE_HOST_NOW: String(NOW + 3600) });
    expect(later.status, later.out).toBe(0);
    expect(later.out).toContain('written 0h 05m before the stop');
    expect(later.out).not.toMatch(/backup alarm threshold/);
  });

  it('uses an older snapshot only when asked for by date', () => {
    // Defect caught: --restore-date ignored, so a corrupt newest snapshot is
    // restored again whatever the operator asks.
    const r = runAtTerminal(['--target', 'staging', '--restore-date', '2026-10-25']);
    expect(r.status, r.out).toBe(0);
    expect(callLines().find((l) => l.includes('create-instances-from-snapshot'))).toContain('--restore-date 2026-10-25');
  });

  it('changes nothing on a second run once the restore is done, and still proves the host', () => {
    // Defect caught: a re-run creating a second instance, moving the address
    // again or restoring the database over a serving site; or one that reports
    // done without proving the host answers, or treats a healthy host as lost.
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    writeFileSync(p('calls.log'), '');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(mutatingCalls()).toEqual([]);
    expect(r.out).toContain('records FOOTBAG_ENV=staging');
    expect(instances().filter((row) => row[0].startsWith(`${OLD}-r`))).toHaveLength(1);
    expect(recordRow()?.[3]).toBe('open');
  });

  // Each row stops the run at a different step's mutating call. The second run
  // must finish the restore without repeating any step the first completed: one
  // record, one new instance, the address on it, the origin port open. Defect
  // caught: a stop part way that a re-run cannot finish, or finishes by creating
  // a second host or by opening the site on the snapshot's database.
  it.each([
    ['the old instance stop', 'stop-instance'],
    ['the create', 'create-instances-from-snapshot'],
    ['the firewall write', 'put-instance-public-ports'],
    ['the static IP attach', 'attach-static-ip'],
    ['the database restore', 'restore-db'],
    ['the Terraform apply', 'terraform-apply'],
    ['the pin', 'pin-installer'],
  ])('a run stopped at %s is finished by running it again', (_label, failOn) => {
    const first = runAtTerminal(['--target', 'staging'], 'APPLY\n', { FAIL_ON: failOn });
    expect(first.status, first.out).not.toBe(0);
    const second = runAtTerminal(['--target', 'staging']);
    expect(second.status, second.out).toBe(0);
    expect(countCalls('create-instance-snapshot')).toBe(1);
    expect(instances().filter((row) => row[0].startsWith(`${OLD}-r`)).map((row) => row[0])).toEqual([NEW]);
    expect(staticIpOn()).toBe(NEW);
    expect(read(p('tfname'))).toBe(NEW);
    expect(instanceState(OLD)).toBe('stopped');
    expect(openPorts(ports(NEW))).toContain(80);
    expect(calls()).toContain(`restore-db --target staging --snapshot ${LAST_BACKUP}`);
    expect(second.out).toContain('Resuming the open restore');
  });

  it('a run stopped in the middle of the state removal is finished by running it again', () => {
    // Defect caught: a re-run, after the old instance left state, refusing
    // because the replacement plan it checks for first can no longer be seen,
    // or closing the origin port again on a host whose database is already back.
    const first = runAtTerminal(['--target', 'staging']);
    expect(first.status, first.out).toBe(0);
    // Put the tree back to the moment after the removal and before the apply.
    writeFileSync(p('tfname'), OLD);
    writeFileSync(p('tfstate'), 'aws_lightsail_static_ip_attachment.web\naws_lightsail_static_ip.web\n');
    writeFileSync(p('calls.log'), '');
    const second = runAtTerminal(['--target', 'staging']);
    expect(second.status, second.out).toBe(0);
    expect(second.out).toContain('already out of state');
    expect(read(p('tfname'))).toBe(NEW);
    expect(calls()).not.toContain('restore-db --target');
    expect(countCalls('put-instance-public-ports')).toBe(0);
  });

  it('waits out a stop stuck in "stopping" only with its own typed APPLY to force it', () => {
    // Defect caught: a restore that gives up on a host stuck stopping, or one
    // that forces the stop of the live host without asking.
    const refused = runAtTerminal(['--target', 'staging'], 'APPLY\nno\n', { STUCK_STOPPING: '1' });
    expect(refused.status).toBe(1);
    expect(refused.out).toContain('stop-instance --force');
    expect(calls()).not.toContain('--force');
    expect(countCalls('create-instances-from-snapshot')).toBe(0);
    const forced = runAtTerminal(['--target', 'staging'], 'APPLY\nAPPLY\n', { STUCK_STOPPING: '1' });
    expect(forced.status, forced.out).toBe(0);
    expect(callLines().filter((l) => l.includes('stop-instance') && l.includes('--force'))).toHaveLength(1);
    expect(instanceState(OLD)).toBe('stopped');
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-host.sh, a restored host that is lost in its turn', () => {
  it('supersedes the finished restore and restores the lost instance, keeping both earlier hosts', () => {
    // Defect caught: a second host loss before --delete-old deadlocked, the open
    // record neither resumable (its host is gone) nor replaceable (it is open).
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    writeFileSync(p('lost'), `${NEW}\n`);
    const later = NOW + 86400;
    const newer = `${OLD}-r${stampAt(later)}`;
    const record2 = `${NEW}-pre-restore-${stampAt(later)}`;
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { RESTORE_HOST_NOW: String(later) });
    expect(r.status, r.out).toBe(0);
    expect(recordRow()?.[3]).toBe('superseded');
    expect(recordRow(record2)?.slice(1, 5)).toEqual([NEW, 'available', 'open', newer]);
    expect(staticIpOn()).toBe(newer);
    expect(read(p('tfname'))).toBe(newer);
    expect(instanceState(NEW)).toBe('stopped');
    expect(instanceState(OLD)).toBe('stopped');
    expect(countCalls('delete-instance')).toBe(0);
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-host.sh, nothing leaves Terraform state unless the adoption is the only change', () => {
  it('stops before touching state when the tree does not take the name from the values file', () => {
    // Defect caught: the old instance removed from state for a tree that still
    // names it, so the next plan creates an empty host under the old name.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { TREE_IGNORES_NAME: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('does not take the instance name from lightsail_instance_name');
    expect(calls()).not.toContain('terraform state rm');
    expect(calls()).not.toContain('terraform-apply');
  });

  it.each([
    ['destroys something', '{"address":"aws_s3_bucket.media","change":{"actions":["delete"],"after":null}}', 'would be destroyed or replaced'],
    ['changes something else in the tree', '{"address":"aws_cloudwatch_metric_alarm.x","change":{"actions":["update"],"after":{}}}', 'not part of the adoption'],
  ])('leaves state alone when the plan %s', (_label, extra, message) => {
    // Defect caught: unrelated drift refused only after the old instance has
    // left state, stranding the restored host outside Terraform; or an
    // unrelated backlog, or a destroy, carried into the apply.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { PLAN_EXTRA: extra });
    expect(r.status).toBe(1);
    expect(r.out).toContain(message);
    expect(calls()).not.toContain('terraform state rm');
    expect(read(p('tfstate'))).toContain('aws_lightsail_instance.web\n');
    expect(calls()).not.toContain('terraform-apply');
    // The address has moved and stays moved: the refusal reverts nothing.
    expect(staticIpOn()).toBe(NEW);
  });

  it('applies nothing when the plan made after the removal changes something else', () => {
    // Defect caught: a change that appears only once the old instance has left
    // state carried into the apply under cover of the import.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', {
      PLAN_EXTRA_AFTER_RM: '{"address":"aws_cloudwatch_metric_alarm.x","change":{"actions":["update"],"after":{}}}',
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('not part of the adoption');
    expect(calls()).not.toContain('terraform-apply');
  });

  it.each([
    ['the old instance', { CREATED_BUNDLE: 'nano_3_0' }],
    ['the tree', { TREE_BUNDLE: 'medium_3_0' }],
  ])('leaves state alone when the new instance does not match %s', (_label, extra) => {
    // Defect caught: an instance Lightsail built smaller, elsewhere or under
    // another key, or one the tree describes differently, adopted by removing
    // the old one from state, so the next plan replaces the restored host.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', extra);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/bundle/);
    expect(calls()).not.toContain('terraform state rm');
    expect(calls()).not.toContain('terraform-apply');
  });

  it('stops, and leaves the values file and state alone, when Terraform cannot be read after the address moves', () => {
    // Defect caught: a failed read of the instance Terraform names taken for
    // "not yet adopted", so the run rewrote the values file and state on a tree
    // it could not read.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { BREAK_OUTPUT_AFTER: 'attach-static-ip' });
    expect(r.status).toBe(1);
    expect(read(valuesFile)).toBe(ORIGINAL_VALUES);
    expect(calls()).not.toContain('terraform state rm');
    expect(calls()).not.toContain('terraform-apply');
  });

  it('names the pull when this workstation\'s values file lacks the restore\'s name', () => {
    // Defect caught: an operator on a second workstation told only that a plan
    // proposes a change, and chasing drift that is an unpulled commit.
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    writeFileSync(valuesFile, ORIGINAL_VALUES);
    writeFileSync(p('calls.log'), '');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/pull the private operations checkout/i);
    expect(r.out).toContain(NEW);
    expect(mutatingCalls()).toEqual([]);
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-host.sh, the restored host proves itself', () => {
  it('fails, naming the installer, when the installer\'s Terraform still names the old instance', () => {
    // Defect caught: an installer that reads a Terraform still naming the old
    // instance pinning the stopped host's keys, and the run reporting the pin
    // re-taken.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { PIN_TF_NAME: OLD });
    expect(r.status).toBe(1);
    expect(r.out).toContain(`does not carry ${NEW}'s host keys`);
    expect(read(pinFile)).toMatch(new RegExp(`${keyOf(OLD)}$`, 'm'));
  });

  it('fails when the host behind the alias records another environment, before its database is touched', () => {
    // Defect caught: an alias reaching the wrong host, its service stopped and
    // its database replaced, and the restore reported good on its strength.
    writeSshStub('production');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('did not confirm it is staging');
    expect(calls()).not.toContain('ssh hold');
    expect(calls()).not.toContain('restore-db --target');
  });

  it('fails when the site does not report ready, and leaves the old instance stopped, not deleted', () => {
    // Defect caught: a restore reported done while visitors see errors.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { READY_CODE: '503' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('did not report ready');
    expect(instanceState(OLD)).toBe('stopped');
    expect(countCalls('delete-instance')).toBe(0);
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-host.sh, an interrupt undoes only what nothing points at', () => {
  it('deletes the new instance when interrupted before the static IP has moved', () => {
    // Defect caught: an abandoned host running a day-old database, uploading
    // backups and costing money, with nothing pointing at it.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { TERM_AFTER: 'create-instances-from-snapshot' });
    expect(r.status).toBe(130);
    expect(instanceState(NEW)).toBeUndefined();
    expect(staticIpOn()).toBe(OLD);
    expect(instanceState(OLD)).toBe('stopped');
  });

  it('leaves everything in place when interrupted once the static IP is on the new instance', () => {
    // Defect caught: the trap deleting the host CloudFront now reaches.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { TERM_AFTER: 'attach-static-ip' });
    expect(r.status).toBe(130);
    expect(staticIpOn()).toBe(NEW);
    expect(instanceState(NEW)).toBeDefined();
    expect(countCalls('delete-instance')).toBe(0);
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-host.sh leaves no temporary file behind', () => {
  // Defect caught: a saved Terraform plan, a zip carrying resolved secrets from
  // state, or a copy of the operator's values file, left readable in the temp
  // directory after the run, whichever way it ended.
  it.each([
    ['a successful run', {}, 0],
    ['a run refused at the plan', { PLAN_EXTRA: '{"address":"aws_s3_bucket.media","change":{"actions":["delete"],"after":null}}' }, 1],
    ['a run interrupted during the apply', { TERM_AFTER: 'terraform-apply' }, 130],
  ])('after %s', (_label, extra, status) => {
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', extra);
    expect(r.status, r.out).toBe(status);
    expect(calls()).toContain('terraform plan');
    expect(tmpLeft()).toEqual([]);
  });
});

describe.skipIf(!HAS_SCRIPT || !HAS_SETSID)('restore-host.sh --delete-old', () => {
  it('refuses while Terraform still names the old instance', () => {
    // Defect caught: the old host deleted while Terraform still manages it, so
    // the next plan recreates an empty host in its place.
    const stopped = runAtTerminal(['--target', 'staging'], 'APPLY\n', { FAIL_ON: 'terraform-apply' });
    expect(stopped.status).not.toBe(0);
    expect(staticIpOn()).toBe(NEW);
    const r = runAtTerminal(['--target', 'staging', '--delete-old']);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`Terraform still names ${OLD}`);
    expect(instanceState(OLD)).toBe('stopped');
    expect(countCalls('delete-instance')).toBe(0);
  });

  it('refuses while the static IP is not on the restored instance', () => {
    // Defect caught: the old host deleted while CloudFront's address points at
    // it, leaving the site with no origin at all.
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    writeFileSync(p('staticip'), `True\t${OLD}\t${IP}`);
    const r = runAtTerminal(['--target', 'staging', '--delete-old']);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`the static IP is on ${OLD}, not ${NEW}`);
    expect(instanceState(OLD)).toBe('stopped');
    expect(countCalls('delete-instance')).toBe(0);
  });

  it('refuses without a terminal, and when the restored host does not prove itself', () => {
    // Defect caught: an unattended deletion, or one that trusts a restore whose
    // host has since stopped answering as its environment.
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    const detached = runDetached(['--target', 'staging', '--delete-old']);
    expect(detached.status).toBe(1);
    expect(detached.out).toContain('not confirmed');
    writeSshStub('production');
    const unproved = runAtTerminal(['--target', 'staging', '--delete-old']);
    expect(unproved.status).toBe(1);
    expect(countCalls('delete-instance')).toBe(0);
    expect(instanceState(OLD)).toBe('stopped');
  });

  it('refuses an old instance something has started again since the restore', () => {
    // Defect caught: deleting a host somebody brought back into use after the
    // restore, which the restore itself would only ever have left stopped.
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    writeFileSync(p('instances'), read(p('instances')).replace(`${OLD}\tstopped\t`, `${OLD}\trunning\t`));
    const r = runAtTerminal(['--target', 'staging', '--delete-old']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('Refusing to delete it');
    expect(instanceState(OLD)).toBe('running');
    expect(countCalls('delete-instance')).toBe(0);
  });

  it('deletes the old instance after its own APPLY, and closes the record', () => {
    // Defect caught: a finished drill whose old host is never removed, or one
    // whose record stays open so the next restore resumes a closed one.
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    const r = runAtTerminal(['--target', 'staging', '--delete-old']);
    expect(r.status, r.out).toBe(0);
    expect(instanceState(OLD)).toBeUndefined();
    expect(instanceState(NEW)).toBe('running');
    expect(recordRow()?.[3]).toBe('closed');
    expect(callLines().find((l) => l.includes('delete-instance'))).toContain(`--instance-name ${OLD}`);
  });
});

describe.skipIf(!HAS_SCRIPT || !HAS_SETSID)('restore-host.sh, the read-only modes', () => {
  it('--status reports each step of an open restore and changes nothing', () => {
    // Defect caught: a status read that resumes or mutates, or one that reports
    // a step done that is not.
    runAtTerminal(['--target', 'staging'], 'APPLY\n', { FAIL_ON: 'attach-static-ip' });
    writeFileSync(p('calls.log'), '');
    const r = runDetached(['--target', 'staging', '--status']);
    expect(r.status, r.out).toBe(0);
    expect(mutatingCalls()).toEqual([]);
    expect(r.out).toMatch(/static IP moved\s+pending/);
    expect(r.out).toMatch(/database restored\s+pending/);
    expect(r.out).toMatch(new RegExp(`new instance ${NEW}\\s+running`));
  });

  it('--dry-run reaches nothing at all', () => {
    // Defect caught: a dry run that calls AWS or Terraform.
    const r = runDetached(['--target', 'staging', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('dry run, nothing reached');
    expect(calls()).toBe('');
  });
});
