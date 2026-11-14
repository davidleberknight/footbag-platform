/**
 * scripts/mail-domain-cutover.sh: the production mail-record changes of the
 * mail cutover, each a values-file change and an apply checked to carry
 * nothing else.
 *
 * What carries the risk: a values-file rewrite that drops or alters a record
 * the zone serves, so mail for a domain stops; an apply that carries something
 * else pending in the tree; a step taken before the one it depends on (the
 * token before delegation, the mail apply before the web switch, the alert
 * address before its confirmation can reach Google); a stop that leaves the
 * values file holding an unapplied change; and a revert that deletes the apex
 * mail records instead of restoring them. So the cases below run every stage
 * against stand-ins for terraform, dig and the served-records verdict, each of
 * which records its call, and judge the run by the values file it leaves, what
 * was called, and its exit.
 *
 * Confirmations are answered through a pseudo-terminal, the same gate an
 * operator passes. The stand-in dig serves answers in real dig's shape (the
 * header and flag lines and the answer rows follow the stand-in in the
 * verify-mail-records suite, itself taken from live answers). Nothing real is
 * reached.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, mkdirSync, chmodSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/mail-domain-cutover.sh');
const ROUTE53_TF = join(process.cwd(), 'terraform/production/route53.tf');

const ZONE_NS = ['ns-203.awsdns-25.com', 'ns-1500.awsdns-59.org'];
const NS = 'ns-1500.awsdns-59.org'; // the first of the zone's servers in sorted order
const RESOLVER = '8.8.8.8';
const TOKEN = `google-site-verification=${'T'.repeat(43)}`;
const APEX_TOKEN = `google-site-verification=${'A'.repeat(43)}`;
const LEGACY_IFPA_MX = ['10 rimu3.footbag.org.', '20 llic.net.'];
const LEGACY_IFPA_SPF = 'v=spf1 a mx ip4:192.0.2.10 include:_spf.google.com ~all';
const GOOGLE_IFPA_SPF = 'v=spf1 include:_spf.google.com ~all';
const APEX_LEGACY_SPF = 'v=spf1 a mx ip4:192.0.2.10 include:_spf.google.com ~all';

const MOVES: [string, string][] = [
  ['aws_route53_record.legacy_mirror_mx["ifpa"]', 'aws_route53_record.workspace_mx["ifpa"]'],
  ['aws_route53_record.legacy_mirror_txt["ifpa"]', 'aws_route53_record.workspace_txt["ifpa"]'],
];
const VERIFY_CHANGE: [string, string][] = [['aws_route53_record.workspace_txt["ifpa"]', 'update']];
const MAIL_DAY: [string, string][] = [
  ['aws_ses_domain_mail_from.main[0]', 'create'],
  ['aws_route53_record.ses_mail_from_mx[0]', 'create'],
  ['aws_route53_record.ses_mail_from_spf[0]', 'create'],
  ['aws_route53_record.dmarc[0]', 'create'],
  ['aws_route53_record.spf[0]', 'update'],
  ['aws_route53_record.mx[0]', 'update'],
  ['aws_route53_record.workspace_mx["ifpa"]', 'update'],
  ['aws_route53_record.workspace_txt["ifpa"]', 'update'],
];
const OPS_ALERT: [string, string][] = [
  ['aws_sns_topic_subscription.alarm_ops_alert[0]', 'create'],
  ['aws_sns_topic_subscription.alarm_ops_alert_us_west_2[0]', 'create'],
];
const REVERT: [string, string][] = [
  ['aws_ses_domain_mail_from.main[0]', 'delete'],
  ['aws_route53_record.ses_mail_from_mx[0]', 'delete'],
  ['aws_route53_record.ses_mail_from_spf[0]', 'delete'],
  ['aws_route53_record.dmarc[0]', 'delete'],
  ['aws_route53_record.spf[0]', 'update'],
  ['aws_route53_record.mx[0]', 'update'],
];

interface Values {
  /** Where the ifpa mail routing and text entries are declared. */
  ifpa?: 'legacy' | 'workspace' | 'both' | 'none';
  ifpaMx?: string[];
  ifpaTxt?: string[];
  apexTxt?: string[];
  /** Writes apex_txt_records one string per line, as a hand edit may leave it. */
  apexTxtMultiline?: boolean;
  alias?: boolean;
  mail?: boolean;
  mirror?: boolean;
  opsAlert?: string;
}

const list = (xs: string[]) => `[${xs.map((x) => `"${x}"`).join(', ')}]`;

/**
 * A values file in the production file's shape, written by hand: the legacy
 * ifpa routing over several lines as the zone capture was transcribed, every
 * other entry on one line, and the Workspace maps the my and g moves filled.
 */
function values(v: Values = {}): string {
  const where = v.ifpa ?? 'legacy';
  const mx = v.ifpaMx ?? LEGACY_IFPA_MX;
  const txt = v.ifpaTxt ?? [LEGACY_IFPA_SPF];
  const inLegacy = where === 'legacy' || where === 'both';
  const inWorkspace = where === 'workspace' || where === 'both';
  const lines = [
    'environment = "production"',
    '',
    ...(v.apexTxtMultiline
      ? ['apex_txt_records = [', ...(v.apexTxt ?? [APEX_TOKEN]).map((t) => `  "${t}",`), ']']
      : [`apex_txt_records = ${list(v.apexTxt ?? [APEX_TOKEN])}`]),
    '',
    `enable_legacy_mirror_records = ${v.mirror ?? true}`,
    `legacy_mx_records            = ${list(LEGACY_IFPA_MX)}`,
    `legacy_apex_spf              = "${APEX_LEGACY_SPF}"`,
    '',
    'legacy_mirror_mx_records = {',
    ...(inLegacy ? ['  "ifpa" = [', ...mx.map((m) => `    "${m}",`), '  ]'] : []),
    '  "rimu"  = ["10 rimu.llic.net."]',
    '}',
    '',
    'legacy_mirror_txt_records = {',
    ...(inLegacy ? [`  "ifpa"  = ${list(txt)}`] : []),
    '  "rimu3" = ["v=spf1 a mx ip4:192.0.2.10 a:google.com ~all"]',
    '}',
    '',
    'workspace_mx_records = {',
    '  "my" = [',
    '    "10 ASPMX.L.GOOGLE.COM.",',
    '  ]',
    ...(inWorkspace ? [`  "ifpa" = ${list(mx)}`] : []),
    '}',
    '',
    'workspace_txt_records = {',
    `  "my" = ["${GOOGLE_IFPA_SPF}"]`,
    ...(inWorkspace ? [`  "ifpa" = ${list(txt)}`] : []),
    '}',
    '',
    `enable_apex_alias_records     = ${v.alias ?? false}`,
    '',
    `ses_enable_mail_records     = ${v.mail ?? false}`,
    ...(v.opsAlert ? [`ops_alert_email = "${v.opsAlert}"`] : []),
  ];
  return `${lines.join('\n')}\n`;
}

/** The state after ifpa-verify: renamed, with the token beside the legacy policy. */
const VERIFIED: Values = { ifpa: 'workspace', ifpaTxt: [LEGACY_IFPA_SPF, TOKEN], alias: true };
/** The state after mail-day. */
const MAILED: Values = {
  ifpa: 'workspace',
  ifpaMx: ['1 smtp.google.com'],
  ifpaTxt: [TOKEN, GOOGLE_IFPA_SPF],
  alias: true,
  mail: true,
};

interface World {
  /** Resource changes the plan carries, as [address, action]. */
  plan?: [string, string][];
  /** Moves the plan carries, as [from, to]. */
  moves?: [string, string][];
  applyFails?: boolean;
  /** Name servers the public resolver hands out for footbag.org. */
  delegatedTo?: string[];
  /** Answers served, as "<server> <name> <type>" => rdata rows. */
  dns?: Record<string, string[]>;
  /** Answers the stand-in apply puts in place, as the zone serves them afterwards. */
  dnsAfterApply?: Record<string, string[]>;
  verifyFails?: boolean;
  /** The zone's nameserver answers without the authoritative flag. */
  nsNotAuthoritative?: boolean;
  /** Epoch seconds of a recorded mail-day apply, relative to now. */
  mailDayAgoSeconds?: number;
}

let dir: string;
let calls: string;
let tfvars: string;
let evidence: string;

const log = (label: string) => `printf '%s\\n' "${label} $*" >> ${JSON.stringify(calls)}`;

function stub(name: string, body: string): string {
  const path = join(dir, 'bin', name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** The zone as the values file says, served by the zone's nameserver and the resolver. */
function servedAsValues(v: Values): Record<string, string[]> {
  const mx = (v.ifpaMx ?? LEGACY_IFPA_MX).map((m) => (m.endsWith('.') ? m : `${m}.`));
  const txt = (v.ifpaTxt ?? [LEGACY_IFPA_SPF]).map((t) => `"${t}"`);
  const out: Record<string, string[]> = {};
  for (const server of [NS, RESOLVER]) {
    out[`${server} ifpa.footbag.org MX`] = mx;
    out[`${server} ifpa.footbag.org TXT`] = txt;
    out[`${server} footbag.org TXT`] = [`"${APEX_LEGACY_SPF}"`, `"${APEX_TOKEN}"`];
  }
  return out;
}

function world(w: World): NodeJS.ProcessEnv {
  const state = join(dir, 'state');
  const dns = join(dir, 'dns');
  mkdirSync(state, { recursive: true });
  mkdirSync(dns, { recursive: true });
  const changes = (w.plan ?? []).map(([address, action]) => ({ address, change: { actions: [action] } }));
  const moved = (w.moves ?? []).map(([from, to]) => ({
    address: to,
    previous_address: from,
    change: { actions: ['no-op'] },
  }));
  writeFileSync(join(state, 'plan.json'), JSON.stringify({ resource_changes: [...changes, ...moved] }));
  writeFileSync(join(state, 'ns.json'), JSON.stringify(ZONE_NS));

  const serveInto = (root: string, answers: Record<string, string[]>) => {
    for (const [key, rows] of Object.entries(answers)) {
      const [server, name, rtype] = key.split(' ');
      mkdirSync(join(root, server), { recursive: true });
      writeFileSync(
        join(root, server, `${name}_${rtype}`),
        rows.map((r) => `${name}.\t60\tIN\t${rtype}\t${r}`).join('\n') + (rows.length ? '\n' : ''),
      );
    }
  };
  serveInto(dns, { [`${RESOLVER} footbag.org NS`]: (w.delegatedTo ?? ZONE_NS).map((n) => `${n}.`), ...(w.dns ?? {}) });
  const after = join(dir, 'dns-after');
  rmSync(after, { recursive: true, force: true });
  mkdirSync(after, { recursive: true });
  serveInto(after, w.dnsAfterApply ?? {});

  if (w.mailDayAgoSeconds !== undefined) {
    const epoch = Math.floor(Date.now() / 1000) - w.mailDayAgoSeconds;
    writeFileSync(
      join(evidence, 'mail-day-applied.2026-12-15T090000Z.txt'),
      `applied_at=2026-12-15T09:00:00Z\napplied_at_epoch=${epoch}\n`,
    );
  }

  const tf = stub(
    'terraform',
    [
      `printf '%s\\n' "terraform $2" >> ${JSON.stringify(calls)}`,
      'case "$2" in',
      '  plan) exit 0 ;;',
      `  show) cat ${JSON.stringify(join(state, 'plan.json'))} ;;`,
      w.applyFails
        ? '  apply) exit 1 ;;'
        : `  apply) cp -R ${JSON.stringify(after)}/. ${JSON.stringify(dns)}/ ;;`,
      `  output) cat ${JSON.stringify(join(state, 'ns.json'))} ;;`,
      'esac',
    ].join('\n'),
  );
  const dig = stub(
    'dig',
    [
      'server=""; name=""; rtype=""',
      'for a in "$@"; do',
      '  case "$a" in',
      '    @*) server="${a#@}" ;;',
      '    +*) ;;',
      '    MX|TXT|NS) rtype="$a" ;;',
      '    *) name="$a" ;;',
      '  esac',
      'done',
      'flags="qr rd ra"',
      w.nsNotAuthoritative ? '' : `[[ "$server" == ${JSON.stringify(NS)} ]] && flags="qr aa"`,
      "printf ';; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1\\n'",
      "printf ';; flags: %s; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\\n\\n' \"$flags\"",
      `f=${JSON.stringify(dns)}/"$server/\${name}_\${rtype}"`,
      "if [[ -f \"$f\" && -s \"$f\" ]]; then printf ';; ANSWER SECTION:\\n'; cat \"$f\"; fi",
      'exit 0',
    ].join('\n'),
  );
  const verify = stub('verify', `${log('verify')}\nexit ${w.verifyFails ? 1 : 0}`);

  const home = join(dir, 'home');
  mkdirSync(home, { recursive: true });
  return {
    ...process.env,
    ...awsIdentityStubEnv(dir),
    HOME: home,
    MAIL_CUTOVER_TF_BIN: tf,
    MAIL_CUTOVER_DIG_BIN: dig,
    MAIL_CUTOVER_VERIFY_CMD: verify,
    MAIL_CUTOVER_TFVARS: tfvars,
    MAIL_CUTOVER_RECORD_DIR: evidence,
  };
}

/** Runs the script at a pseudo-terminal, typing `answers` at it. */
function run(w: World, args: string[], answers: string[] = ['APPLY', 'APPLY', 'APPLY']) {
  const env = world(w);
  const inner = ['bash', SCRIPT, '--target', 'production', ...args].map((a) => JSON.stringify(a)).join(' ');
  const res = spawnSync('script', ['-qec', inner, '/dev/null'], {
    env,
    input: answers.map((a) => `${a}\n`).join(''),
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return {
    status: res.status,
    // The pseudo-terminal ends lines with CR LF.
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`.replace(/\r/g, ''),
    calls: existsSync(calls) ? readFileSync(calls, 'utf-8').trim().split('\n') : [],
    tfvars: readFileSync(tfvars, 'utf-8'),
    stamps: readdirSync(evidence).filter((f) => f.startsWith('mail-day-applied.')),
  };
}

const terraformCalls = (calls: string[]) => calls.filter((c) => c.startsWith('terraform ') && c !== 'terraform output');

beforeEach(() => {
  dir = createScratchDir('mail-domain-cutover');
  mkdirSync(join(dir, 'bin'), { recursive: true });
  calls = join(dir, 'calls');
  tfvars = join(dir, 'production.tfvars');
  evidence = join(dir, 'evidence');
  mkdirSync(evidence, { recursive: true });
  writeFileSync(tfvars, values());
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('mail-domain-cutover.sh: arguments', () => {
  // Defect caught: a flag given to a stage that does not use it is ignored, so
  // the operator believes a token or address was published when nothing was;
  // or a stage that needs one runs without it.
  it('takes exactly the flags each stage uses', () => {
    for (const args of [
      ['--stage', 'ifpa-move', '--token', TOKEN],
      ['--stage', 'ifpa-verify', '--resolver', RESOLVER],
      ['--stage', 'ops-alert'],
      ['--stage', 'revert'],
      ['--stage', 'unknown'],
    ]) {
      const r = run({}, args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.calls, args.join(' ')).toEqual([]);
    }
    for (const args of [
      ['--stage', 'ifpa-move'],
      ['--stage', 'ifpa-verify', '--token', TOKEN, '--resolver', RESOLVER],
      ['--stage', 'mail-day', '--resolver', RESOLVER],
      ['--stage', 'ops-alert', '--address', 'ops-alert@footbag.org'],
      ['--stage', 'revert', '--resolver', RESOLVER],
    ]) {
      const r = run({}, [...args, '--dry-run']);
      expect(r.status, `${args.join(' ')}\n${r.out}`).toBe(0);
      expect(r.calls).toEqual([]);
      expect(r.tfvars).toBe(values());
    }
  });

  // Defect caught: a truncated or mistyped token is published, and the domain
  // never verifies; or an alert address off the domain is subscribed.
  it('refuses a malformed token and an address off footbag.org, and takes well-formed ones', () => {
    for (const args of [
      ['--stage', 'ifpa-verify', '--token', 'google-site-verification=short', '--resolver', RESOLVER],
      ['--stage', 'ifpa-verify', '--token', TOKEN.replace('google-site-verification=', ''), '--resolver', RESOLVER],
      ['--stage', 'ops-alert', '--address', 'ops-alert@example.com'],
    ]) {
      expect(run({}, [...args, '--dry-run']).status, args.join(' ')).toBe(2);
    }
  });

  // Defect caught: the production zone's records are changed from a run naming
  // another environment, or no environment at all.
  it('runs against production only', () => {
    const env = world({});
    for (const target of [[], ['--target', 'staging']]) {
      const res = spawnSync('bash', [SCRIPT, ...target, '--stage', 'ifpa-move', '--dry-run'], {
        env,
        encoding: 'utf-8',
        ...SPAWN_GUARD,
      });
      expect(res.status, target.join(' ')).toBe(2);
    }
  });
});

describe('mail-domain-cutover.sh: ifpa-move', () => {
  // Defect caught: the rename drops or alters a record the zone serves, so the
  // IFPA list domain's mail stops or its sender policy changes, or it touches
  // another map's entries.
  it('moves the ifpa entries into the Workspace maps, values unchanged, and applies only the two moves', () => {
    const r = run({ moves: MOVES }, ['--stage', 'ifpa-move'], ['APPLY', 'APPLY']);
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values({ ifpa: 'workspace' }));
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show', 'terraform apply']);
  });

  // Defect caught: the stage's guard and the tree disagree, so the stage either
  // refuses in a correct checkout or renames nothing in a checkout that deletes
  // and recreates the records.
  it('runs in a tree that declares both ifpa moves', () => {
    const tf = readFileSync(ROUTE53_TF, 'utf-8');
    for (const [from, to] of MOVES) {
      expect(tf).toContain(`moved {\n  from = ${from}\n  to   = ${to}\n}`);
    }
  });

  // Defect caught: something else pending in the tree is applied under cover of
  // the rename, or a rename the tree turns into a delete and create goes ahead.
  it('refuses a plan carrying anything beyond the two moves, and restores the values file', () => {
    for (const w of [
      { moves: MOVES, plan: [['aws_route53_record.apex_a[0]', 'update']] },
      { moves: [MOVES[0]] },
      { plan: [['aws_route53_record.workspace_mx["ifpa"]', 'create'], ['aws_route53_record.legacy_mirror_mx["ifpa"]', 'delete']] },
    ] as World[]) {
      const r = run(w, ['--stage', 'ifpa-move'], ['APPLY', 'APPLY']);
      expect(r.status, JSON.stringify(w)).not.toBe(0);
      expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show']);
      expect(r.tfvars).toBe(values());
      rmSync(calls, { force: true });
    }
  });

  // Defect caught: a re-run after the rename repeats it or refuses, instead of
  // proving it done from the values file and an empty plan.
  it('reports a finished rename as done without applying', () => {
    writeFileSync(tfvars, values({ ifpa: 'workspace' }));
    const r = run({}, ['--stage', 'ifpa-move'], []);
    expect(r.status, r.out).toBe(0);
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show']);
    expect(r.out).toContain('Already done');
    expect(r.tfvars).toBe(values({ ifpa: 'workspace' }));
  });

  // Defect caught: a values file declaring the domain twice, or not at all, is
  // rewritten into one that drops its mail routing.
  it('refuses ifpa declared in both kinds of map, or in neither', () => {
    for (const where of ['both', 'none'] as const) {
      writeFileSync(tfvars, values({ ifpa: where }));
      const r = run({ moves: MOVES }, ['--stage', 'ifpa-move']);
      expect(r.status, where).not.toBe(0);
      expect(r.calls, where).toEqual([]);
      expect(r.tfvars).toBe(values({ ifpa: where }));
    }
  });

  // Defect caught: a declined confirmation still writes or applies, or a stop
  // before the apply leaves the values file holding an unapplied change.
  it('changes nothing when either confirmation is declined', () => {
    let r = run({ moves: MOVES }, ['--stage', 'ifpa-move'], ['no']);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.tfvars).toBe(values());

    r = run({ moves: MOVES }, ['--stage', 'ifpa-move'], ['APPLY', 'no']);
    expect(r.status).not.toBe(0);
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show']);
    expect(r.tfvars).toBe(values());
  });

  // Defect caught: an apply that failed part way has its values change undone,
  // so the values file no longer says what AWS may already hold.
  it('keeps the values change after a failed apply, and a re-run finishes it', () => {
    let r = run({ moves: MOVES, applyFails: true }, ['--stage', 'ifpa-move'], ['APPLY', 'APPLY']);
    expect(r.status).not.toBe(0);
    expect(r.tfvars).toBe(values({ ifpa: 'workspace' }));

    rmSync(calls, { force: true });
    r = run({ moves: MOVES }, ['--stage', 'ifpa-move'], ['APPLY']);
    expect(r.status, r.out).toBe(0);
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show', 'terraform apply']);
  });
});

describe('mail-domain-cutover.sh: ifpa-verify', () => {
  const moved: Values = { ifpa: 'workspace' };
  const args = ['--stage', 'ifpa-verify', '--token', TOKEN, '--resolver', RESOLVER];

  // Defect caught: the token replaces the legacy sender policy, or is published
  // somewhere other than the IFPA list domain's text records, or the stage
  // reports success without the token being served.
  it('adds the token beside the legacy sender policy and proves it served', () => {
    const withToken: Values = { ...moved, ifpaTxt: [LEGACY_IFPA_SPF, TOKEN] };
    writeFileSync(tfvars, values(moved));
    const r = run(
      { plan: VERIFY_CHANGE, dns: servedAsValues(moved), dnsAfterApply: servedAsValues(withToken) },
      args,
      ['APPLY', 'APPLY'],
    );
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values(withToken));
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show', 'terraform apply']);
  });

  // Defect caught: the stage reports the token published while the world cannot
  // yet see it; or a re-run once it can repeats the apply instead of checking.
  it('fails while the resolver does not serve the token yet, and a re-run only checks again', () => {
    const withToken: Values = { ...moved, ifpaTxt: [LEGACY_IFPA_SPF, TOKEN] };
    writeFileSync(tfvars, values(moved));
    const lagging = servedAsValues(withToken);
    lagging[`${RESOLVER} ifpa.footbag.org TXT`] = [`"${LEGACY_IFPA_SPF}"`];
    let r = run({ plan: VERIFY_CHANGE, dns: servedAsValues(moved), dnsAfterApply: lagging }, args, ['APPLY', 'APPLY']);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain(`${RESOLVER} does not serve the verification token`);
    expect(r.tfvars).toBe(values(withToken));

    rmSync(calls, { force: true });
    r = run({ dns: servedAsValues(withToken) }, args, []);
    expect(r.status, r.out).toBe(0);
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show']);
  });

  // Defect caught: the token is published before the registry hands the world
  // the Route 53 zone, so Google reads the legacy zone and never sees it.
  it('refuses until footbag.org is delegated to the Route 53 zone', () => {
    writeFileSync(tfvars, values(moved));
    const r = run({ plan: VERIFY_CHANGE, dns: servedAsValues(moved), delegatedTo: ['dns1.llic.net'] }, args);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('not yet delegated');
    expect(terraformCalls(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values(moved));
  });

  // Defect caught: the apply also changes a record the operator has not seen,
  // because the zone already serves something the values file does not hold.
  it('refuses when the zone serves the ifpa records differently from the values file', () => {
    writeFileSync(tfvars, values(moved));
    const drifted = servedAsValues({ ...moved, ifpaMx: ['10 rimu3.footbag.org.'] });
    const r = run({ plan: VERIFY_CHANGE, dns: drifted }, args);
    expect(r.status).not.toBe(0);
    expect(terraformCalls(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values(moved));
  });

  // Defect caught: an answer from a server that is not authoritative for the
  // zone, a cache or a stale secondary, is taken as what the zone serves, so the
  // drift check compares against the wrong records.
  it('refuses when the nameserver does not answer authoritatively', () => {
    writeFileSync(tfvars, values(moved));
    const r = run({ plan: VERIFY_CHANGE, dns: servedAsValues(moved), nsNotAuthoritative: true }, args);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('did not answer ifpa.footbag.org MX authoritatively');
    expect(terraformCalls(r.calls)).toEqual([]);
  });

  // Defect caught: a values file written without the trailing dot DNS adds to a
  // mail host reads as drift against the zone, so the stage refuses a zone that
  // serves exactly what the values file holds.
  it('matches mail hosts written with or without the trailing dot', () => {
    const undotted: Values = { ...moved, ifpaMx: ['10 rimu3.footbag.org', '20 llic.net'] };
    writeFileSync(tfvars, values(undotted));
    const withToken: Values = { ...undotted, ifpaTxt: [LEGACY_IFPA_SPF, TOKEN] };
    const r = run(
      { plan: VERIFY_CHANGE, dns: servedAsValues(undotted), dnsAfterApply: servedAsValues(withToken) },
      args,
      ['APPLY', 'APPLY'],
    );
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values(withToken));
  });

  // Defect caught: the token is added to the legacy-mirror map, which the launch
  // apply removes, taking the domain's verification with it.
  it('refuses before the rename', () => {
    const r = run({ plan: VERIFY_CHANGE, dns: servedAsValues({}) }, args);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('--stage ifpa-move first');
    expect(r.calls).toEqual([]);
    expect(r.tfvars).toBe(values());
  });
});

describe('mail-domain-cutover.sh: mail-day', () => {
  const args = ['--stage', 'mail-day', '--resolver', RESOLVER];

  // Defect caught: the mail apply leaves the IFPA list domain on the legacy
  // host, keeps its legacy sender policy, drops its token, records no apply
  // time for the alert stage, or reports success without the served check.
  it('turns the mail records on, moves the IFPA list domain to Google, records the time and checks what is served', () => {
    writeFileSync(tfvars, values(VERIFIED));
    const r = run({ plan: MAIL_DAY, dns: servedAsValues(VERIFIED) }, args);
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values(MAILED));
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show', 'terraform apply']);
    expect(r.stamps).toHaveLength(1);
    expect(r.calls.filter((c) => c.startsWith('verify'))).toEqual([
      `verify --stage mail-day --nameserver ${NS} --resolver ${RESOLVER} --tfvars ${tfvars}`,
    ]);
  });

  // Defect caught: the apply rewrites the apex text set without a string the
  // zone serves, deleting a verification token some provider's recovery rests on.
  it('carries every apex text string the zone serves into the values file', () => {
    writeFileSync(tfvars, values(VERIFIED));
    const extra = 'google-site-verification=' + 'X'.repeat(43);
    const dns = servedAsValues(VERIFIED);
    dns[`${NS} footbag.org TXT`] = [`"${APEX_LEGACY_SPF}"`, `"${APEX_TOKEN}"`, `"${extra}"`];
    const r = run({ plan: MAIL_DAY, dns }, args);
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values({ ...MAILED, apexTxt: [APEX_TOKEN, extra] }));
  });

  // Defect caught: an apex text list written over several lines is rewritten by
  // its first line only, leaving the old strings behind as lines that no longer
  // parse, so the values file is broken on cutover day.
  it('rewrites an apex text list written over several lines as one list', () => {
    writeFileSync(tfvars, values({ ...VERIFIED, apexTxtMultiline: true }));
    const extra = 'google-site-verification=' + 'X'.repeat(43);
    const dns = servedAsValues(VERIFIED);
    dns[`${NS} footbag.org TXT`] = [`"${APEX_LEGACY_SPF}"`, `"${APEX_TOKEN}"`, `"${extra}"`];
    const r = run({ plan: MAIL_DAY, dns }, args);
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values({ ...MAILED, apexTxt: [APEX_TOKEN, extra] }));
  });

  // Defect caught: the mail apply runs before, or in the same apply as, the web
  // switch, against the cutover order.
  it('refuses while the web switch is off', () => {
    writeFileSync(tfvars, values({ ...VERIFIED, alias: false }));
    const r = run({ plan: MAIL_DAY, dns: servedAsValues(VERIFIED) }, args);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.tfvars).toBe(values({ ...VERIFIED, alias: false }));
  });

  // Defect caught: inbound mail moves to Google before anyone confirmed Gmail is
  // on and the inside tests passed, which no lookup can see.
  it('changes nothing until the inside checks are confirmed', () => {
    writeFileSync(tfvars, values(VERIFIED));
    const r = run({ plan: MAIL_DAY, dns: servedAsValues(VERIFIED) }, args, ['no', 'APPLY', 'APPLY']);
    expect(r.status).not.toBe(0);
    // The inside-checks confirmation is asked first and its refusal ends the run,
    // so the values-file confirmation is never reached.
    expect(r.out).toContain("Type 'APPLY' if all three passed");
    expect(r.out).not.toContain("Type 'APPLY' to write this change to the values file");
    expect(terraformCalls(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values(VERIFIED));
    expect(r.stamps).toEqual([]);
  });

  // Defect caught: a partial plan is applied as though it were the mail apply;
  // or, after an apply that stopped part way, a re-run refuses the remainder and
  // the cutover is stuck half done.
  it('refuses a partial plan on a fresh run, and applies the remainder on a re-run', () => {
    writeFileSync(tfvars, values(VERIFIED));
    let r = run({ plan: MAIL_DAY.slice(1), dns: servedAsValues(VERIFIED) }, args);
    expect(r.status).not.toBe(0);
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show']);
    expect(r.tfvars).toBe(values(VERIFIED));

    writeFileSync(tfvars, values(MAILED));
    rmSync(calls, { force: true });
    r = run({ plan: [['aws_route53_record.mx[0]', 'update']], dns: servedAsValues(MAILED) }, args, ['APPLY']);
    expect(r.status, r.out).toBe(0);
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show', 'terraform apply']);
  });

  // Defect caught: a run whose served records do not pass reports success.
  it('fails when the served records do not pass', () => {
    writeFileSync(tfvars, values(VERIFIED));
    const r = run({ plan: MAIL_DAY, dns: servedAsValues(VERIFIED), verifyFails: true }, args);
    expect(r.status).not.toBe(0);
    expect(r.tfvars).toBe(values(MAILED));
  });
});

describe('mail-domain-cutover.sh: ops-alert', () => {
  const args = ['--stage', 'ops-alert', '--address', 'ops-alert@footbag.org'];

  // Defect caught: the subscription is created while resolvers may still route
  // its confirmation to the legacy host, so it is never confirmed and the alert
  // group silently receives nothing.
  it('waits 3600 seconds after the recorded mail-day apply', () => {
    writeFileSync(tfvars, values(MAILED));
    let r = run({ plan: OPS_ALERT, mailDayAgoSeconds: 600 }, args);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.tfvars).toBe(values(MAILED));

    rmSync(join(evidence, 'mail-day-applied.2026-12-15T090000Z.txt'));
    r = run({ plan: OPS_ALERT, mailDayAgoSeconds: 3700 }, args, ['APPLY', 'APPLY']);
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values({ ...MAILED, opsAlert: 'ops-alert@footbag.org' }));
    expect(terraformCalls(r.calls)).toEqual(['terraform plan', 'terraform show', 'terraform apply']);
  });

  // Defect caught: the wait is skipped because no apply time was recorded, or the
  // subscription goes out while mail still lands on the legacy host.
  it('refuses with no recorded mail-day apply, or with the mail records off', () => {
    writeFileSync(tfvars, values(MAILED));
    let r = run({ plan: OPS_ALERT }, args);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);

    writeFileSync(tfvars, values({ ...VERIFIED, mail: false }));
    r = run({ plan: OPS_ALERT, mailDayAgoSeconds: 7200 }, args);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
  });

  // Defect caught: an alert address already set is silently replaced, dropping
  // the confirmed subscription its watchers rely on.
  it('refuses to change an alert address already set', () => {
    writeFileSync(tfvars, values({ ...MAILED, opsAlert: 'watch@footbag.org' }));
    const r = run({ plan: OPS_ALERT, mailDayAgoSeconds: 7200 }, args);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.tfvars).toBe(values({ ...MAILED, opsAlert: 'watch@footbag.org' }));
  });
});

describe('mail-domain-cutover.sh: revert', () => {
  const args = ['--stage', 'revert', '--resolver', RESOLVER];

  // Defect caught: the revert also sends the IFPA list domain back to the legacy
  // host, carries more than the apex reversal, or is not proved served.
  it('turns the apex mail records off, leaves the IFPA list domain on Google and checks the rollback', () => {
    writeFileSync(tfvars, values(MAILED));
    const r = run({ plan: REVERT }, args, ['APPLY', 'APPLY']);
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values({ ...MAILED, mail: false }));
    expect(r.calls.filter((c) => c.startsWith('verify'))).toEqual([
      `verify --stage rollback --nameserver ${NS} --resolver ${RESOLVER} --tfvars ${tfvars}`,
    ]);
  });

  // Defect caught: with the mirror already removed, turning the flag off deletes
  // the apex mail routing and text records instead of restoring them.
  it('refuses once the legacy mirror is off', () => {
    writeFileSync(tfvars, values({ ...MAILED, mirror: false }));
    const r = run({ plan: REVERT }, args);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.tfvars).toBe(values({ ...MAILED, mirror: false }));
  });

  // Defect caught: the alert group loses its mail on the revert and nothing tells
  // the operator, so the watch runs with alarms reaching only the account mailbox.
  it('warns when the alert group is subscribed, and still succeeds', () => {
    writeFileSync(tfvars, values({ ...MAILED, opsAlert: 'ops-alert@footbag.org' }));
    const r = run({ plan: REVERT }, args, ['APPLY', 'APPLY']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('ops_alert_email is ops-alert@footbag.org, whose mail now goes to the legacy host');
    expect(r.out).toContain('1 warning');
  });
});
