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
import { HAS_PTY_DRIVER, spawnAtTerminal } from '../fixtures/ptySession';

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
/** The audit row the restored backup recorded: the real database's newest. */
const RESTORED_AT = '2026-10-26T07:27:58.412Z';
/**
 * The bucket a healthy restore leaves: an earlier backup of the old host, whose
 * older audit row would read as the snapshot's database if the listing did not
 * start after the restored backup; the restored backup; and the restored host's
 * first upload after the restore, carrying a later audit row.
 */
const bucketRow = (key: string, id: string, at: string) => `${key}\t${id}\t${at}`;
const AFTER_RESTORE = 'routine/2026/10/26/footbag-20261026T074000Z.db.gz';
const HEALTHY_BUCKET = [
  bucketRow('routine/2026/10/26/footbag-20261026T072300Z.db.gz', 'audit_earlier', '2026-10-26T07:22:41.007Z'),
  bucketRow(LAST_BACKUP, 'audit_restored', RESTORED_AT),
  bucketRow(AFTER_RESTORE, 'audit_after', '2026-10-26T07:39:30.250Z'),
];
/** The newest audit row in the snapshot's day-old database. */
const SNAPSHOT_AT = '2026-10-25T14:02:11.930Z';
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
    // The CLI history setting, absent as on a workstation that never turned it on.
    '[[ "$svc $sub" == "configure get" ]] && exit 1',
    'case "$sub" in',
    '  get-instances)',
    '    cat "$S/instances" 2>/dev/null',
    '    flip "$S/instances" pending running',
    '    [[ -n "${STUCK_STOPPING:-}" ]] || flip "$S/instances" stopping stopped ;;',
    '  get-instance)',
    '    n="$(arg --instance-name "$@")"; r="$(row "$n")" || { echo "NotFoundException" >&2; exit 254; }',
    '    IFS=$\'\\t\' read -r _ _ az b k _ _ <<< "$r"',
    // The creation time, in the form the CLI renders it: the moment the stand-in
    // made the instance, or long before the run for one it found already there.
    '    if [[ "$(arg --query "$@")" == *createdAt* ]]; then cat "$S/created-$n" 2>/dev/null || echo "2026-03-13T00:29:59.387000-07:00"; exit 0; fi',
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
    // A named instance snapshot answers from its own file, one row per
    // snapshot: name, state, the instance it was taken of, when.
    '  get-instance-snapshot)',
    '    n="$(arg --instance-snapshot-name "$@")"',
    '    r="$(grep "^$n"$\'\\t\' "$S/instance-snapshots" 2>/dev/null)" || { echo "An error occurred (NotFoundException) when calling the GetInstanceSnapshot operation: The instance snapshot does not exist" >&2; exit 254; }',
    '    cut -f2- <<< "$r" ;;',
    '  create-instances-from-snapshot)',
    '    name="$(arg --instance-names "$@")"; src="$(arg --source-instance-name "$@")"',
    '    [[ -n "$src" ]] || src="$(grep "^$(arg --instance-snapshot-name "$@")"$\'\\t\' "$S/instance-snapshots" | cut -f3)"',
    '    printf "%s\\tpending\\t%s\\t%s\\t%s\\t%s\\t%s\\n" "$name" "$(arg --availability-zone "$@")" "${CREATED_BUNDLE:-$(arg --bundle-id "$@")}" "$(arg --key-pair-name "$@")" "$(arg --ip-address-type "$@")" "14:00" >> "$S/instances"',
    '    cp "$S/blueprint-$src" "$S/blueprint-$name"',
    '    date -u -d "@${RESTORE_HOST_NOW}" +%Y-%m-%dT%H:%M:%S.000000+00:00 > "$S/created-$name"',
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
    // The minting call answers in the shape the real one does, a private key
    // and certificate beside the host keys, and records the application id the
    // call carried, which is what the mint listing attributes it by.
    '  get-instance-access-details)',
    '    n="$(arg --instance-name "$@")"; echo "${AWS_SDK_UA_APP_ID:-none} $n" >> "$S/mints.log"',
    '    jq -Rn --arg sentinel "$MINT_SENTINEL" \'[inputs | select(length > 0) | split("\\t") | {algorithm: .[0], publicKey: .[1]}] | {accessDetails: {privateKey: $sentinel, certKey: "ssh-rsa-cert-v01@openssh.com fixture", username: "ec2-user", hostKeys: .}}\' < "$S/hostkeys-$n" ;;',
    // Lightsail refuses to delete an instance carrying an add-on (here the
    // automatic snapshot, the row's seventh field) without --force-delete-add-ons,
    // with the words a real staging run returned.
    '  delete-instance)',
    '    n="$(arg --instance-name "$@")"; r="$(row "$n")" || { echo "NotFoundException" >&2; exit 254; }',
    '    IFS=$\'\\t\' read -r _ _ _ _ _ _ addon <<< "$r"',
    '    if [[ -n "$addon" && "$addon" != None ]] && ! has --force-delete-add-ons "$@"; then',
    '      echo "An error occurred (InvalidInputException) when calling the DeleteInstance operation: You cannot delete the Instance $n with addons. Specify the forceDeleteAddons parameter to delete the Instance and its associated addons." >&2; exit 254',
    '    fi',
    '    grep -v "^$n"$\'\\t\' "$S/instances" > "$S/instances.tmp" || true; mv "$S/instances.tmp" "$S/instances" ;;',
    // Without --start-after, the newest-backup lookup the stop records. With it,
    // the backups listed after a key, from the stand-in bucket: one row per
    // object, its key, then the audit id and time its upload recorded.
    '  list-objects-v2)',
    '    sa="$(arg --start-after "$@")"',
    '    if [[ -z "$sa" ]]; then printf "%s\\n" "${LAST_BACKUP_KEY:-None}"; else',
    '      ks="$(cut -f1 "$S/bucket" 2>/dev/null | sort | awk -v p="$(arg --prefix "$@")" -v a="$sa" \'index($0, p) == 1 && $0 > a\' | paste -sd "\\t" -)"',
    '      printf "%s\\n" "${ks:-None}"; fi ;;',
    // The production email switch: its value and when it last changed, as
    // --query 'Parameter.[Value,LastModifiedDate]' --output text renders them.
    '  get-parameter) printf "%s\\t%s\\n" "${EMAIL_VALUE-dark}" "${EMAIL_CHANGED:-2026-10-01T00:00:00.000000+00:00}" ;;',
    '  head-object)',
    '    k="$(arg --key "$@")"; r="$(grep -F "$k"$\'\\t\' "$S/bucket")" || { echo "An error occurred (404) when calling the HeadObject operation: Not Found" >&2; exit 254; }',
    '    cut -f2,3 <<< "$r" ;;',
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
  // the installer's Terraform still names another instance. Each line carries
  // the environment's tag after the key, as the real installer writes it.
  exe(join(bin, 'pin-installer'), [
    `S=${JSON.stringify(st)}`,
    'echo "pin-installer $*" >> "$S/calls.log"',
    '[[ -n "${FAIL_ON:-}" && "$FAIL_ON" == "pin-installer" ]] && exit 1',
    `name="\${PIN_TF_NAME:-$(${JSON.stringify(join(bin, 'terraform'))} -chdir=terraform/staging output -raw lightsail_instance_name)}"`,
    `: > ${JSON.stringify(pinFile)}`,
    `while IFS=$'\\t' read -r alg pub; do printf '%s %s %s footbag-staging\\n[%s]:2222 %s %s footbag-staging\\n' ${IP} "$alg" "$pub" ${IP} "$alg" "$pub" >> ${JSON.stringify(pinFile)}; done < "$S/hostkeys-$name"`,
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
  // scripts/harden-sshd.sh's stand-in: a host whose sshd is hardened once an
  // apply has run on it, which a restored snapshot has not. It records how it
  // was asked and the password line it was handed; HARDEN_APPLY_NOOP makes an
  // apply that exits 0 and changes nothing.
  exe(join(bin, 'harden-sshd'), [
    `S=${JSON.stringify(st)}`,
    'echo "harden-sshd $*" >> "$S/calls.log"',
    'IFS= read -r line; printf "%s\\n" "$line" >> "$S/harden-sshd-stdin"',
    'case "$3" in',
    '  --apply)',
    '    [[ -n "${FAIL_ON:-}" && "$FAIL_ON" == "harden-apply" ]] && { echo "harden-sshd stand-in: refused" >&2; exit 1; }',
    '    [[ -n "${HARDEN_APPLY_NOOP:-}" ]] || : > "$S/sshd-hardened"',
    '    exit 0 ;;',
    '  --expect-hardened)',
    '    [[ -e "$S/sshd-hardened" ]] && exit 0',
    '    echo "harden-sshd stand-in: root login permitted" >&2; exit 1 ;;',
    'esac',
    'exit 64',
  ]);
  // scripts/bootstrap-host.sh's stand-in for --status: every step done unless
  // BOOTSTRAP_PENDING says one is pending, as the real script exits non-zero.
  exe(join(bin, 'bootstrap-host'), [
    `S=${JSON.stringify(st)}`,
    'echo "bootstrap-host $*" >> "$S/calls.log"',
    'IFS= read -r line; printf "%s\\n" "$line" >> "$S/bootstrap-host-stdin"',
    '[[ -n "${BOOTSTRAP_PENDING:-}" ]] && { echo "PENDING  ${BOOTSTRAP_PENDING}"; echo "1 step(s) pending or unread."; exit 1; }',
    'echo "Every step is done."',
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
 * still running. The journal read answers JOURNAL_REFUSALS refused backup runs
 * (two unless set), or that the journal is unreadable with JOURNAL_UNREADABLE.
 */
function writeSshStub(recorded?: string): void {
  exe(join(bin, 'ssh'), [
    `S=${JSON.stringify(st)}`,
    'for a in "$@"; do',
    `  if [[ "$a" == "-G" ]]; then printf "hostname ${IP}\\nuser footbag\\n"; exit 0; fi`,
    'done',
    'on="$(cut -f2 "$S/staticip")"',
    '[[ -f "$S/lost" ]] && grep -qxF "$on" "$S/lost" && { echo "ssh: connect to host: Connection timed out" >&2; exit 255; }',
    // A host that drops one connection and answers the next, as a brief network
    // fault looks.
    '[[ -f "$S/lost-once" ]] && grep -qxF "$on" "$S/lost-once" && { rm -f "$S/lost-once"; echo "ssh: connect to host: Connection timed out" >&2; exit 255; }',
    hostIdentityAnswer(recorded, recorded === undefined ? '' : 'https://staging.example.invalid'),
    'case "$*" in',
    '  *footbag-restore-hold*)',
    '    cat >/dev/null; echo "ssh hold" >> "$S/calls.log"',
    '    cp "$S/ports-${on}.json" "$S/ports-at-hold.json"',
    '    [[ -n "${HOLD_REFUSED:-}" ]] && { echo "---FOOTBAG-NOT-HELD---"; exit 1; }',
    '    echo "---FOOTBAG-HELD---"; exit 0 ;;',
    '  *footbag-restore-release*)',
    '    cat >/dev/null; echo "ssh release" >> "$S/calls.log"; echo "---FOOTBAG-RELEASED---"; exit 0 ;;',
    '  *footbag-restore-lineage*)',
    '    cat >/dev/null; echo "ssh lineage" >> "$S/calls.log"',
    '    [[ -n "${JOURNAL_UNREADABLE:-}" ]] && { printf "%s\\n" "---FOOTBAG-JOURNAL-UNREADABLE---" "No journal files were found."; exit 1; }',
    '    echo "---FOOTBAG-REFUSALS-${JOURNAL_REFUSALS:-2}---"; exit 0 ;;',
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
  writeFileSync(p('bucket'), HEALTHY_BUCKET.join('\n') + '\n');
  writeFileSync(p('tfstate'), 'aws_lightsail_instance.web\naws_lightsail_instance_public_ports.web\naws_lightsail_static_ip_attachment.web\naws_lightsail_static_ip.web\n');
  writeAwsStub();
  writeTerraformStub();
  writeSshStub();
  writeIdentity();
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

/** The private key the stand-in mint returns, which no output may carry. */
const MINT_SENTINEL = 'FIXTURE-MINTED-PRIVATE-KEY-SENTINEL';
const mints = () => read(p('mints.log')).split('\n').filter(Boolean);

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
    RESTORE_HOST_HARDEN_SSHD: join(bin, 'harden-sshd'),
    RESTORE_HOST_BOOTSTRAP_HOST: join(bin, 'bootstrap-host'),
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
    MINT_SENTINEL,
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
  const res = spawnAtTerminal(`${inner}; echo "EXIT=$?"`, { typed, env: env(extra) });
  const out = res.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

const MUTATING = [
  'create-instance-snapshot', 'stop-instance', 'create-instances-from-snapshot', 'put-instance-public-ports',
  'detach-static-ip', 'attach-static-ip', 'delete-instance', 'tag-resource', 'terraform-apply', 'hold', 'release',
];
const mutatingCalls = () => callLines().filter((l) => MUTATING.includes(l.split(' ')[1]) || l.startsWith('terraform-apply')
  || l.startsWith('terraform state rm') || l.startsWith('restore-db')
  || (l.startsWith('harden-sshd ') && l.endsWith(' --apply')));

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

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh, a full restore at a terminal', () => {
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

  it('mints once for the restored instance, attributed to the restore, and leaves the key nowhere', () => {
    // Defect caught: each step that needs the restored host's keys minting its
    // own certificate, so one restore fires the break-glass alarm several times;
    // a mint the listing cannot attribute; or the minted private key reaching
    // the terminal or left on disk.
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(mints()).toEqual([`footbag-restore-host ${NEW}`]);
    expect(r.out).not.toContain(MINT_SENTINEL);
    expect(tmpLeft()).toEqual([]);
  });

  it('runs the pin installer even when the pin already carries the restored instance\'s keys', () => {
    // A snapshot keeps the host keys and the static IP moves with the restore,
    // so the pin can already hold the new instance's keys while its instance
    // record still names the old instance. Defect caught: the installer skipped,
    // the record left naming the old instance, and every later check reading
    // the pin as stale, so onboarding refuses and the next bootstrap mints.
    const tagged = (k: string) => `${IP} ${k} footbag-staging\n[${IP}]:2222 ${k} footbag-staging\n`;
    writeFileSync(pinFile, tagged(`ssh-ed25519 ${keyOf(NEW)}`) + tagged(`ecdsa-sha2-nistp256 AAAAE2-${NEW}`), { mode: 0o600 });
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(callLines().filter((l) => l.startsWith('pin-installer '))).toEqual(['pin-installer --target staging']);
  });

  it('refuses to mint while the AWS CLI history would keep the response', () => {
    // Defect caught: the minted private key written into the CLI's history
    // database, which nothing shreds.
    const aws = read(join(bin, 'aws')).replace('[[ "$svc $sub" == "configure get" ]] && exit 1', '[[ "$svc $sub" == "configure get" ]] && { echo enabled; exit 0; }');
    exe(join(bin, 'aws'), aws.split('\n').slice(1));
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('cli_history disabled');
    expect(mints()).toEqual([]);
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

  // Defect caught: a hold that failed reported only as "did not stop", with the
  // host's own reason thrown away, so the operator cannot tell a refused stop
  // from a dropped session.
  it('says why the hold failed, in the host\'s own words', () => {
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { HOLD_REFUSED: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/did not stop \(---FOOTBAG-NOT-HELD---\)/);
  });

  it('stops with the origin port closed when no last backup was recorded, and restores the one named with --db-snapshot', () => {
    // Defect caught: a host opened to the public on the snapshot's database
    // because no backup was found to restore, or a named backup ignored.
    const chosen = 'hourly/2026/10/26/footbag-20261026T070000Z.db.gz';
    setBucket([bucketRow(chosen, 'audit_hourly', '2026-10-26T06:59:31.118Z'), ...HEALTHY_BUCKET]);
    const first = runAtTerminal(['--target', 'staging'], 'APPLY\n', { LAST_BACKUP_KEY: 'None' });
    expect(first.status).toBe(1);
    expect(first.out).toContain('--db-snapshot');
    // Defect caught: the empty bucket printed mid-stream and missing from the
    // closing report the operator reads to decide what to do next.
    expect(first.out).toMatch(/Warnings \(\d+\):[\s\S]*no database backup from the last two days/);
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

  it('refuses a listed object that is not a backup key, before recording or restoring it', () => {
    // Defect caught: whatever object sorts newest in the bucket (a stray
    // upload, a file with another name) recorded as the backup to put back and
    // handed to the database restore.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { LAST_BACKUP_KEY: 'routine/2026/10/26/notes.txt' });
    expect(r.status).toBe(1);
    expect(r.out).toContain("is not a backup key ('routine/2026/10/26/notes.txt')");
    expect(callLines().some((l) => l.includes('tag-resource') && l.includes('footbag-restore-last-backup'))).toBe(false);
    expect(callLines().some((l) => l.includes('create-instances-from-snapshot'))).toBe(false);
  });

  it('names a script, never an AWS command, in what it tells the operator to run', () => {
    // Defect caught: an operator told to type a raw AWS command under
    // pressure, where a script owns the step and checks its outcome.
    const source = readFileSync(SCRIPT, 'utf8');
    const told = source.split('\n').filter((l) => /\b(die|cr_error|cr_warn|cr_die)\b.*\baws (lightsail|s3|s3api|ssm|iam) /.test(l));
    expect(told).toEqual([]);
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
    if (key !== LAST_BACKUP) setBucket([bucketRow(key, 'audit_older', '2026-10-26T04:59:40.502Z'), ...HEALTHY_BUCKET]);
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
    // The new instance is made by the later run, so the restored host's first
    // upload comes after that run's clock.
    setBucket([...HEALTHY_BUCKET, bucketRow('routine/2026/10/26/footbag-20261026T084000Z.db.gz', 'audit_later', '2026-10-26T08:39:30.250Z')]);
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

  it('names the restored database among what was proven only when the restore recorded one', () => {
    // Defect caught: a closing line claiming the database "checked by hand"
    // when nothing checked it, so a host serving the snapshot's day-old data
    // reads as fully restored.
    const first = runAtTerminal(['--target', 'staging']);
    expect(first.status, first.out).toBe(0);
    const proven = (out: string) => out.slice(out.lastIndexOf('Proven:'), out.lastIndexOf('Not proven:') > out.lastIndexOf('Proven:') ? out.lastIndexOf('Not proven:') : undefined);
    expect(proven(first.out)).toContain(LAST_BACKUP);
    // The same finished restore with no database restore on its record.
    writeFileSync(p('snapshots'), read(p('snapshots')).split('\n').map((l) => {
      const f = l.split('\t');
      if (f[0] === RECORD) f[8] = 'None';
      return f.join('\t');
    }).join('\n'));
    const again = runAtTerminal(['--target', 'staging']);
    expect(again.status, again.out).toBe(0);
    expect(proven(again.out)).not.toContain(LAST_BACKUP);
    expect(again.out).toMatch(new RegExp(`Not proven:[\\s\\S]*${NEW}[^\\n]*records no database`));
    expect(again.out).toMatch(/Warnings \(\d+\):[\s\S]*records no database restore onto it/);
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

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh --instance-snapshot', () => {
  const STEP_SNAP = `${OLD}-pre-step-20261026T060000Z`;
  /** One instance snapshot as Lightsail lists it: name, state, the instance it was taken of, when. */
  const snapshotRow = (name: string, state: string, from: string) =>
    `${name}\t${state}\t${from}\t${new Date((NOW - 2 * 3600) * 1000).toISOString()}\n`;
  const createCall = () => callLines().find((l) => l.includes('create-instances-from-snapshot'));

  it('restores from the named step snapshot, and records it as the source', () => {
    // Defect caught: the flag ignored and the newest automatic snapshot used,
    // bringing back the very change the step snapshot exists to undo.
    writeFileSync(p('instance-snapshots'), snapshotRow(STEP_SNAP, 'available', OLD));
    const r = runAtTerminal(['--target', 'staging', '--instance-snapshot', STEP_SNAP]);
    expect(r.status, r.out).toBe(0);
    expect(createCall()).toContain(`--instance-snapshot-name ${STEP_SNAP}`);
    expect(createCall()).not.toContain('--restore-date');
    expect(recordRow()?.[5]).toBe(STEP_SNAP);
    expect(staticIpOn()).toBe(NEW);
    expect(read(p('tfname'))).toBe(NEW);
  });

  it('accepts a replacement\'s snapshot of an earlier restored instance of this environment', () => {
    // Defect caught: a snapshot of this environment's host refused because a
    // restore had since renamed the instance it was taken of.
    const earlier = `${OLD}-r202610010000`;
    const name = `${earlier}-pre-replace-20261001T000500Z`;
    writeFileSync(p(`blueprint-${earlier}`), 'ubuntu_24_04');
    writeFileSync(p('instance-snapshots'), snapshotRow(name, 'available', earlier));
    const r = runAtTerminal(['--target', 'staging', '--instance-snapshot', name]);
    expect(r.status, r.out).toBe(0);
    expect(createCall()).toContain(`--instance-snapshot-name ${name}`);
  });

  it.each([
    ['Lightsail does not hold', () => '', 'NotFoundException'],
    ['is still being taken', () => snapshotRow(STEP_SNAP, 'pending', OLD), 'pending'],
    ['was taken of the other environment\'s host', () => snapshotRow(STEP_SNAP.replace('staging', 'production'), 'available', 'footbag-production-web'), 'footbag-production-web'],
    ['carries a name no step or replacement gives', () => snapshotRow(`${OLD}-manual-1`, 'available', OLD), `${OLD}-manual-1`],
  ])('refuses a snapshot that %s, before anything changes', (_label, rows, named) => {
    // Defect caught: the live host stopped and an instance built from a
    // snapshot that does not exist, is incomplete, belongs to another
    // environment, or is not one of the snapshots taken as a way back.
    const content = rows();
    writeFileSync(p('instance-snapshots'), content);
    const name = content ? content.split('\t')[0] : STEP_SNAP;
    const r = runAtTerminal(['--target', 'staging', '--instance-snapshot', name]);
    expect(r.status).toBe(1);
    expect(r.out).toContain(named);
    expect(mutatingCalls()).toEqual([]);
    expect(instanceState(OLD)).toBe('running');
  });

  it('refuses --instance-snapshot beside --restore-date, which names another source', () => {
    // Defect caught: one of two sources silently winning.
    writeFileSync(p('instance-snapshots'), snapshotRow(STEP_SNAP, 'available', OLD));
    const r = runAtTerminal(['--target', 'staging', '--instance-snapshot', STEP_SNAP, '--restore-date', '2026-10-25']);
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toEqual([]);
  });

  it('resumes from the recorded instance snapshot, not from the newest automatic one', () => {
    // Defect caught: a run stopped before the create and started again without
    // the flag building the new host from today's automatic snapshot instead.
    writeFileSync(p('instance-snapshots'), snapshotRow(STEP_SNAP, 'available', OLD));
    const first = runAtTerminal(['--target', 'staging', '--instance-snapshot', STEP_SNAP], 'APPLY\n', {
      FAIL_ON: 'create-instances-from-snapshot',
    });
    expect(first.status).toBe(1);
    // A resume asked for another snapshot refuses rather than switching source.
    const other = `${OLD}-pre-step-20261025T060000Z`;
    writeFileSync(p('instance-snapshots'), snapshotRow(STEP_SNAP, 'available', OLD) + snapshotRow(other, 'available', OLD));
    const switched = runAtTerminal(['--target', 'staging', '--instance-snapshot', other]);
    expect(switched.status).toBe(1);
    expect(callLines().filter((l) => l.includes('create-instances-from-snapshot'))).toHaveLength(1);
    const second = runAtTerminal(['--target', 'staging']);
    expect(second.status, second.out).toBe(0);
    expect(second.out).toContain('Resuming the open restore');
    const creates = callLines().filter((l) => l.includes('create-instances-from-snapshot'));
    expect(creates[creates.length - 1]).toContain(`--instance-snapshot-name ${STEP_SNAP}`);
    expect(countCalls('get-auto-snapshots')).toBe(0);
  });
});

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh, a restored host that is lost in its turn', () => {
  it('supersedes the finished restore and restores the lost instance, keeping both earlier hosts', () => {
    // Defect caught: a second host loss before --delete-old deadlocked, the open
    // record neither resumable (its host is gone) nor replaceable (it is open).
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    writeFileSync(p('lost'), `${NEW}\n`);
    const later = NOW + 86400;
    const newer = `${OLD}-r${stampAt(later)}`;
    const record2 = `${NEW}-pre-restore-${stampAt(later)}`;
    // The second restored host's first upload, a day on.
    setBucket([...HEALTHY_BUCKET, bucketRow('routine/2026/10/27/footbag-20261027T074000Z.db.gz', 'audit_next_day', '2026-10-27T07:39:30.250Z')]);
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

  it('does not take a finished restore\'s host for lost on one dropped connection', () => {
    // Defect caught: a re-run of a finished restore that met one brief network
    // fault started a second restore of a host that was fine, replacing it.
    expect(runAtTerminal(['--target', 'staging']).status).toBe(0);
    const created = countCalls('create-instances-from-snapshot');
    writeFileSync(p('lost-once'), `${NEW}\n`);
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { RESTORE_HOST_NOW: String(NOW + 86400) });
    expect(r.out).not.toContain('is treated as lost');
    expect(countCalls('create-instances-from-snapshot')).toBe(created);
    expect(recordRow()?.[3]).not.toBe('superseded');
  });
});

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh, the bodies it runs on the restored host', () => {
  // The suite's ssh stand-in answers each body with its marker; these run the
  // bodies themselves against stand-in service tools, so what the host does is
  // what the markers claim.
  const body = (name: 'HOLD_BODY' | 'RELEASE_BODY' | 'LINEAGE_BODY'): string => {
    const source = readFileSync(SCRIPT, 'utf8');
    const quoted = source.match(new RegExp(`^${name}='([\\s\\S]*?)'$`, 'm'));
    if (quoted) return quoted[1];
    const heredoc = source.match(new RegExp(`^${name}="\\$\\(cat <<'BODY'\\n([\\s\\S]*?)\\nBODY\\n\\)"$`, 'm'));
    expect(heredoc, `${name} is in the script`).not.toBeNull();
    return heredoc![1];
  };
  let bodyRuns = 0;
  const runBody = (text: string, tools: Record<string, string>) => {
    const bin = p(`bodybin-${++bodyRuns}`);
    mkdirSync(bin, { recursive: true });
    for (const [name, script] of Object.entries(tools)) {
      writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${script}\n`);
      chmodSync(join(bin, name), 0o755);
    }
    return spawnSync('bash', ['-c', text], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }, ...SPAWN_GUARD });
  };

  // Defect caught: a hold that reports the service and backups stopped while
  // one of them still runs, so the snapshot's database serves or uploads.
  it('holds only once the service and the backups have all stopped', () => {
    const held = runBody(body('HOLD_BODY'), { systemctl: '[[ "$1" == is-active ]] && exit 3; exit 0' });
    expect(held.status).toBe(0);
    expect(held.stdout.trim()).toBe('---FOOTBAG-HELD---');
    const running = runBody(body('HOLD_BODY'), { systemctl: '[[ "$1" == is-active && "$3" == footbag.service ]] && exit 0; [[ "$1" == is-active ]] && exit 3; exit 0' });
    expect(running.status).toBe(1);
    expect(running.stdout.trim()).toBe('---FOOTBAG-NOT-HELD---');
  });

  // Defect caught: a release reported done while the backup timer stays off.
  it('reports the release only once the backup timer is running', () => {
    expect(runBody(body('RELEASE_BODY'), { systemctl: 'exit 0' }).stdout.trim()).toBe('---FOOTBAG-RELEASED---');
    expect(runBody(body('RELEASE_BODY'), { systemctl: '[[ "$1" == is-active ]] && exit 3; exit 0' }).stdout).not.toContain('---FOOTBAG-RELEASED---');
  });

  // Defect caught: the lineage read counting the wrong lines, or reading an
  // unreadable journal as no refusals.
  it('counts the backup refusals since boot, and says so when the journal cannot be read', () => {
    const refusals = runBody(body('LINEAGE_BODY'), {
      journalctl: 'printf "%s\\n" "backup-db: FAILURE (1 consecutive): this database does not continue the stored history, so it was not uploaded" "backup-db: ok" "backup-db: FAILURE (2 consecutive): this database does not continue the stored history, so it was not uploaded"',
    });
    expect(refusals.stdout.trim()).toBe('---FOOTBAG-REFUSALS-2---');
    expect(runBody(body('LINEAGE_BODY'), { journalctl: 'echo ok' }).stdout.trim()).toBe('---FOOTBAG-REFUSALS-0---');
    const unreadable = runBody(body('LINEAGE_BODY'), { journalctl: 'echo "No journal files were found." >&2; exit 1' });
    expect(unreadable.status).toBe(1);
    expect(unreadable.stdout).toContain('---FOOTBAG-JOURNAL-UNREADABLE---');
    expect(unreadable.stdout).toContain('No journal files were found.');
  });
});

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh, nothing leaves Terraform state unless the adoption is the only change', () => {
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

/** One list of the closing report, up to the next list or the verdict. */
function reportList(out: string, heading: RegExp): string {
  const all = [...out.matchAll(new RegExp(heading.source, 'g'))];
  if (all.length === 0) return '';
  const start = all[all.length - 1].index! + all[all.length - 1][0].length;
  const rest = out.slice(start);
  const next = rest.search(/\n(Errors \(\d+\):|Warnings \(\d+\):|Proven:|Not proven:|DONE|FAILED)/);
  return next < 0 ? rest : rest.slice(0, next);
}
const errorsOf = (out: string) => reportList(out, /Errors \(\d+\):/);
const provenOf = (out: string) => reportList(out, /Proven:/);
const unprovenOf = (out: string) => reportList(out, /Not proven:/);
const setBucket = (rows: string[]) => writeFileSync(p('bucket'), rows.join('\n') + '\n');
const STALE_KEY = (prefix: string) => `${prefix}/2026/10/26/footbag-20261026T073500Z.db.gz`;

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh, the snapshot\'s database never reaches the bucket', () => {
  it('proves every backup after the restored one continues it, and that the host refused the stale database', () => {
    // Defect caught: a restore reported done while nothing checked that the
    // restored host's day-old database stayed out of the bucket, so the next
    // database restore could bring back data erased since the snapshot. The
    // earlier backup in the bucket carries an older audit row than the restored
    // one: judged, it would fail the run, so a pass also shows the listing
    // starts at the new instance's creation, not at the start of the history.
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(errorsOf(r.out)).toBe('');
    expect(provenOf(r.out)).toContain(`every backup written since ${NEW} was created continues ${LAST_BACKUP}`);
    expect(provenOf(r.out)).toContain('refused the snapshot\'s database 2 time(s)');
  });

  it.each([
    ['in routine/', [...HEALTHY_BUCKET, bucketRow(STALE_KEY('routine'), 'audit_snapshot', SNAPSHOT_AT)], STALE_KEY('routine')],
    // The routine copy has expired under staging's one-day retention; the
    // hourly promotion of it is still held.
    ['only in hourly/, its routine copy expired', [...HEALTHY_BUCKET, bucketRow(STALE_KEY('hourly'), 'audit_snapshot', SNAPSHOT_AT)], STALE_KEY('hourly')],
  ])('fails, naming it, when an upload of the snapshot\'s database is %s', (_label, rows, stale) => {
    // Defect caught: a stale upload the restored host made before the hold
    // left in the bucket as a newer backup than the real one, with the drill
    // reported passed.
    setBucket(rows as string[]);
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).not.toBe(0);
    expect(errorsOf(r.out)).toContain(stale as string);
    expect(provenOf(r.out)).not.toContain('continues it');
  });

  it('fails when no backup reaches the bucket after the restore', () => {
    // Defect caught: backups left stopped on the restored host, or refusing
    // the restored database too, so the recovery point silently grows from
    // the moment of the restore.
    setBucket(HEALTHY_BUCKET.filter((row) => !row.startsWith(AFTER_RESTORE)));
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).not.toBe(0);
    expect(errorsOf(r.out)).toContain('not resuming');
  });

  it('fails when an upload after the restore carries no lineage record', () => {
    // Defect caught: an upload nothing can judge counted as continuing the
    // restored database.
    setBucket([...HEALTHY_BUCKET.filter((row) => !row.startsWith(AFTER_RESTORE)), bucketRow(AFTER_RESTORE, 'None', 'None')]);
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).not.toBe(0);
    expect(errorsOf(r.out)).toContain(`${AFTER_RESTORE} was written since ${NEW} was created and carries no lineage record`);
  });

  it('passes an upload whose newest audit row is the restored backup\'s own', () => {
    // Defect caught: a quiet site, where nothing was audited between the
    // restore and the next backup, failing the drill as if that upload were
    // stale.
    setBucket([...HEALTHY_BUCKET.filter((row) => !row.startsWith(AFTER_RESTORE)), bucketRow(AFTER_RESTORE, 'audit_restored', RESTORED_AT)]);
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(provenOf(r.out)).toContain(`every backup written since ${NEW} was created continues ${LAST_BACKUP}`);
  });

  it('does not count the old host\'s backups as resumed when an older backup was restored', () => {
    // Defect caught: with --db-snapshot naming a backup older than the old
    // host's last one, the old host's later uploads read as the restored host's
    // backups resuming, so a restored host whose backups never started passes.
    const chosen = 'hourly/2026/10/26/footbag-20261026T070000Z.db.gz';
    setBucket([bucketRow(chosen, 'audit_hourly', '2026-10-26T06:59:31.118Z'),
      ...HEALTHY_BUCKET.filter((row) => !row.startsWith(AFTER_RESTORE))]);
    expect(runAtTerminal(['--target', 'staging'], 'APPLY\n', { LAST_BACKUP_KEY: 'None' }).status).toBe(1);
    const r = runAtTerminal(['--target', 'staging', '--db-snapshot', chosen], 'APPLY\n', { LAST_BACKUP_KEY: 'None' });
    expect(r.status, r.out).not.toBe(0);
    expect(errorsOf(r.out)).toContain('not resuming');
    expect(provenOf(r.out)).not.toContain('continues');
  });

  it('judges against the restored backup\'s hourly copy once its routine copy has aged out', () => {
    // Defect caught: a run resumed after staging's one-day routine/ window
    // failing a healthy host because the restored backup's record is gone
    // from routine/ while its promoted copy still holds it.
    const hourlyCopy = LAST_BACKUP.replace(/^routine\//, 'hourly/');
    setBucket([bucketRow(hourlyCopy, 'audit_restored', RESTORED_AT), ...HEALTHY_BUCKET.filter((row) => !row.startsWith(LAST_BACKUP))]);
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain(`read from ${hourlyCopy}`);
    expect(provenOf(r.out)).toContain(`continues ${LAST_BACKUP}`);
  });

  it('reports as not proven, not as an error, a restored backup aged out of every generation', () => {
    // Defect caught: a healthy restore failed on a missing reference it can
    // never get back, or the same gap read as a pass.
    setBucket(HEALTHY_BUCKET.filter((row) => !row.startsWith(LAST_BACKUP)));
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(unprovenOf(r.out)).toContain('has aged out of every generation');
    expect(provenOf(r.out)).not.toContain('continues');
  });

  it('reports as not proven, not as passed, a restored backup that carries no lineage record', () => {
    // Defect caught: later uploads judged against an empty reference, so
    // every one reads as continuing it whatever it holds.
    setBucket([bucketRow(LAST_BACKUP, 'None', 'None'), bucketRow(STALE_KEY('routine'), 'audit_snapshot', SNAPSHOT_AT)]);
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(provenOf(r.out)).not.toContain('continues it');
    expect(unprovenOf(r.out)).toContain(`${LAST_BACKUP} carries no lineage record`);
  });

  it.each([
    ['shows no refused run', { JOURNAL_REFUSALS: '0' }, 'shows no refused run'],
    ['cannot be read', { JOURNAL_UNREADABLE: '1' }, 'No journal files were found.'],
  ])('reports the refusal as not proven when the host journal %s', (_label, extra, why) => {
    // Defect caught: the drill claiming the backup guard refused the stale
    // database when nothing on the host shows it ran.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', extra as NodeJS.ProcessEnv);
    expect(r.status, r.out).toBe(0);
    expect(provenOf(r.out)).not.toContain('refused the snapshot\'s database');
    expect(unprovenOf(r.out)).toContain(why as string);
  });
});

/** The same estate under production's names, for the checks that only production makes. */
function useProduction(): void {
  const prodOld = 'footbag-production-web';
  writeFileSync(p('instances'), `${prodOld}\trunning\tus-east-1a\tsmall_3_0\tfootbag-production-operator\tdualstack\t14:00\n`);
  writeFileSync(p(`blueprint-${prodOld}`), 'ubuntu_24_04');
  writeFileSync(p('staticip'), `True\t${prodOld}\t${IP}`);
  writeFileSync(p(`ports-${prodOld}.json`), JSON.stringify(OLD_PORTS));
  writeFileSync(p(`hostkeys-${prodOld}`), `ssh-ed25519\t${keyOf(prodOld)}\n`);
  writeFileSync(p('tfname'), prodOld);
  writeSshStub('production');
}
const isoAt = (epoch: number) => new Date(epoch * 1000).toISOString().replace('Z', '+00:00');

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh on production, the email switch', () => {
  // The newest automatic snapshot the fixture holds was taken ten hours before the run.
  it.each([
    ['reads armed', { EMAIL_VALUE: 'armed' }, /email switch reads 'armed', not dark/],
    // A value the parameter never holds is not dark: the guard refuses anything
    // but the one safe value, so a stale or hand-written value cannot pass it.
    ['reads a value it never holds', { EMAIL_VALUE: 'false' }, /email switch reads 'false', not dark/],
    ['was disarmed after the snapshot was taken', { EMAIL_CHANGED: isoAt(NOW - 3600) }, /last changed at .* after the automatic snapshot of 2026-10-26 was taken/],
  ])('refuses before changing anything when the switch %s', (_label, extra, message) => {
    // Defect caught: a restored production host booting with an armed mail
    // adapter from its snapshot and resending, from the snapshot's day-old
    // outbox, mail members were already sent.
    useProduction();
    const r = runAtTerminal(['--target', 'production'], 'APPLY\n', extra as NodeJS.ProcessEnv);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(message);
    expect(mutatingCalls()).toEqual([]);
  });

  it('goes on to the confirmation when the switch has read dark since before the snapshot', () => {
    // Defect caught: a guard that refuses every production restore, leaving
    // the host-loss path unusable on the one environment it exists for.
    useProduction();
    const r = runAtTerminal(['--target', 'production'], 'no\n', { EMAIL_CHANGED: isoAt(NOW - 20 * 3600) });
    expect(r.out).toContain('production email reads dark, and has since before the automatic snapshot of 2026-10-26');
    expect(r.out).toContain("Type 'APPLY' to restore production");
    expect(mutatingCalls()).toEqual([]);
  });
});

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh, the restored host proves itself', () => {
  it('fails, naming the installer, when the installer\'s Terraform still names the old instance', () => {
    // Defect caught: an installer that reads a Terraform still naming the old
    // instance pinning the stopped host's keys, and the run reporting the pin
    // re-taken.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { PIN_TF_NAME: OLD });
    expect(r.status).toBe(1);
    expect(r.out).toContain(`does not carry ${NEW}'s host keys`);
    expect(read(pinFile)).toMatch(new RegExp(`${keyOf(OLD)} footbag-staging$`, 'm'));
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

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh, the host state the snapshot carried back', () => {
  const hardenCalls = () => callLines().filter((l) => l.startsWith('harden-sshd '));
  const FIXTURE_PASS = 'fixture-sudo-password';

  // Defect caught: the restored host keeps the sshd posture its snapshot
  // carried, root or password login among it, and the restore reports done
  // with nothing having read it; or the bootstrap steps the snapshot predates
  // stay pending with no run naming them.
  it('applies the hardened sshd settings, proves them, reads every bootstrap step, and reports both proved', () => {
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(hardenCalls()).toEqual([
      'harden-sshd --target staging --expect-hardened',
      'harden-sshd --target staging --apply',
      'harden-sshd --target staging --expect-hardened',
    ]);
    expect(callLines().filter((l) => l.startsWith('bootstrap-host '))).toEqual(['bootstrap-host --target staging --status']);
    // After the host-key pin, which both children reach the host through.
    const at = (needle: string) => callLines().findIndex((l) => l.startsWith(needle));
    expect(at('harden-sshd --target staging --apply')).toBeGreaterThan(at('pin-installer'));
    expect(at('bootstrap-host')).toBeGreaterThan(at('harden-sshd --target staging --apply'));
    const proven = provenOf(r.out);
    expect(proven).toContain(`sshd on ${NEW} is hardened`);
    expect(proven).toContain(`every bootstrap step reads done on ${NEW}`);
    // Defect caught: the password handed to a child in argv, where any reader
    // of the process table can take it, rather than on stdin line 1.
    expect(read(p('harden-sshd-stdin')).split('\n').filter(Boolean)).toEqual([FIXTURE_PASS, FIXTURE_PASS, FIXTURE_PASS]);
    expect(read(p('bootstrap-host-stdin')).trim()).toBe(FIXTURE_PASS);
    expect(calls()).not.toContain(FIXTURE_PASS);
  });

  it('applies nothing to a host already hardened, and still proves it', () => {
    // Defect caught: every re-run re-applies, and on production asks for an
    // APPLY that changes nothing.
    writeFileSync(p('sshd-hardened'), '');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(hardenCalls()).toEqual(['harden-sshd --target staging --expect-hardened']);
    expect(provenOf(r.out)).toContain(`sshd on ${NEW} is hardened`);
  });

  it('fails the restore, naming the fix, when the hardening apply does not complete', () => {
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { FAIL_ON: 'harden-apply' });
    expect(r.status, r.out).toBe(1);
    expect(errorsOf(r.out)).toContain('scripts/harden-sshd.sh --target staging --apply did not complete');
    expect(errorsOf(r.out)).toContain('Fix with: < <credential file> bash scripts/harden-sshd.sh --target staging --apply');
    expect(provenOf(r.out)).not.toContain('is hardened');
    // Defect caught: the closing line announces a finished restore over a host
    // whose sshd was never proved, and the operator reads no further.
    expect(r.out).toContain(`== staging restored onto ${NEW}, but its host state is not proved`);
    expect(r.out).not.toContain('== staging restored: ');
    // The rest of the restore still stands and is still reported.
    expect(staticIpOn()).toBe(NEW);
    expect(instanceState(OLD)).toBe('stopped');
  });

  it('fails the restore when the apply exits 0 but the host still does not prove hardened', () => {
    // Defect caught: the apply's exit status taken as the outcome, so a host
    // whose drop-in changed nothing reads hardened.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { HARDEN_APPLY_NOOP: '1' });
    expect(r.status, r.out).toBe(1);
    expect(errorsOf(r.out)).toContain(`sshd on ${NEW} is not proved hardened after the apply`);
    expect(provenOf(r.out)).not.toContain('is hardened');
    expect(r.out).toContain(`== staging restored onto ${NEW}, but its host state is not proved`);
  });

  it('fails the restore, naming the fix, while a bootstrap step reads pending', () => {
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { BOOTSTRAP_PENDING: 'cwagent' });
    expect(r.status, r.out).toBe(1);
    expect(errorsOf(r.out)).toContain('scripts/bootstrap-host.sh --target staging --status reports a step pending');
    expect(errorsOf(r.out)).toContain('Finish them with: < <credential file> bash scripts/bootstrap-host.sh --target staging');
    expect(provenOf(r.out)).not.toContain('every bootstrap step reads done');
    expect(r.out).toContain(`== staging restored onto ${NEW}, but its host state is not proved`);
    expect(r.out).not.toContain('== staging restored: ');
    // The sshd proof is independent of it.
    expect(provenOf(r.out)).toContain(`sshd on ${NEW} is hardened`);
  });
});

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh, an interrupt undoes only what nothing points at', () => {
  it('deletes the new instance when interrupted before the static IP has moved', () => {
    // Defect caught: an abandoned host running a day-old database, uploading
    // backups and costing money, with nothing pointing at it.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { TERM_AFTER: 'create-instances-from-snapshot' });
    expect(r.status).toBe(143);
    expect(instanceState(NEW)).toBeUndefined();
    expect(staticIpOn()).toBe(OLD);
    expect(instanceState(OLD)).toBe('stopped');
  });

  it('lists a refused delete of the new instance as an error, with Lightsail\'s words', () => {
    // Defect caught: an abandoned host running a day-old database, its delete
    // refused on the way out and the refusal printed above a closing report
    // that never mentions it.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', {
      TERM_AFTER: 'create-instances-from-snapshot', FAIL_ON: 'delete-instance',
    });
    expect(r.status).toBe(143);
    expect(instanceState(NEW)).toBeDefined();
    expect(r.out).toMatch(new RegExp(`Errors \\(\\d+\\):[\\s\\S]*${NEW}[^\\n]*refused by the stand-in`));
  });

  it('deletes nothing when the run fails rather than being interrupted', () => {
    // Defect caught: the interrupt-only undo running on an ordinary failure,
    // deleting a new instance a re-run would have picked up.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { FAIL_ON: 'put-instance-public-ports' });
    expect(r.status).toBe(1);
    expect(instanceState(NEW)).toBeDefined();
    expect(countCalls('delete-instance')).toBe(0);
  });

  it('leaves everything in place when interrupted once the static IP is on the new instance', () => {
    // Defect caught: the trap deleting the host CloudFront now reaches.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { TERM_AFTER: 'attach-static-ip' });
    expect(r.status).toBe(143);
    expect(staticIpOn()).toBe(NEW);
    expect(instanceState(NEW)).toBeDefined();
    expect(countCalls('delete-instance')).toBe(0);
  });
});

describe.skipIf(!HAS_PTY_DRIVER)('restore-host.sh leaves no temporary file behind', () => {
  // Defect caught: a saved Terraform plan, a zip carrying resolved secrets from
  // state, or a copy of the operator's values file, left readable in the temp
  // directory after the run, whichever way it ended.
  it.each([
    ['a successful run', {}, 0],
    ['a run refused at the plan', { PLAN_EXTRA: '{"address":"aws_s3_bucket.media","change":{"actions":["delete"],"after":null}}' }, 1],
    ['a run interrupted during the apply', { TERM_AFTER: 'terraform-apply' }, 143],
  ])('after %s', (_label, extra, status) => {
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', extra);
    expect(r.status, r.out).toBe(status);
    expect(calls()).toContain('terraform plan');
    expect(tmpLeft()).toEqual([]);
  });
});

describe.skipIf(!HAS_PTY_DRIVER || !HAS_SETSID)('restore-host.sh --delete-old', () => {
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

describe.skipIf(!HAS_PTY_DRIVER || !HAS_SETSID)('restore-host.sh, the read-only modes', () => {
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
