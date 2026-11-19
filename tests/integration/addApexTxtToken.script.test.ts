/**
 * scripts/add-apex-txt-token.sh: publish a provider's verification token in the
 * footbag.org apex TXT set through the values file and a records-only apply,
 * then read it back from Route 53.
 *
 * What carries the risk: one record owns the whole apex TXT set, so a values
 * file that has drifted from the zone publishes its own list and silently drops
 * another provider's token; a token that is not what the provider matches is
 * published and never verifies; a stop or a declined confirmation leaves the
 * values file holding a token nothing applied, for the next routine apply to
 * publish unchecked; and a run reports success that Route 53 does not bear out.
 * So the cases run the script against stand-ins for the Route 53 listing, the
 * values file and the apply, and judge it by the values file it leaves, what it
 * called, and its exit.
 *
 * Confirmations are answered through a pseudo-terminal, the same gate an
 * operator passes. Nothing real is reached.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/add-apex-txt-token.sh');

const ZONE_ID = 'Z0TESTZONE';
const LEGACY_SPF = 'v=spf1 a mx ip4:192.0.2.10 ip4:192.0.2.20 include:_spf.google.com ~all';
const WORKSPACE_TOKEN = `google-site-verification=${'W'.repeat(43)}`;
const SEARCH_TOKEN = `google-site-verification=${'S'.repeat(43)}`;
const POSTMASTER_TOKEN = 'postmaster-verification=pm-0123456789abcdef';

/**
 * The Route 53 listing, in the shape a real read returned: the production zone's
 * apex TXT set read with `list-resource-record-sets --start-record-name
 * footbag.org --start-record-type TXT --max-items 1 --output json` on
 * 2026-11-19. Each value is one or more quoted 255-octet chunks; a listing with
 * no apex TXT set answers the next set in the zone instead. Values here are
 * stand-ins in the captured shape.
 */
function listing(strings: string[] | null): string {
  const quoted = (s: string) => {
    const chunks: string[] = [];
    for (let i = 0; i < s.length; i += 255) chunks.push(s.slice(i, i + 255));
    // Route 53 escapes a quote or backslash inside a character-string.
    return chunks.map((c) => `"${c.replace(/[\\"]/g, (m) => `\\${m}`)}"`).join(' ');
  };
  const set =
    strings === null
      ? {
          Name: 'google._domainkey.footbag.org.',
          Type: 'TXT',
          TTL: 300,
          ResourceRecords: [{ Value: '"v=DKIM1; k=rsa; p=MIIB"' }],
        }
      : {
          Name: 'footbag.org.',
          Type: 'TXT',
          TTL: 600,
          ResourceRecords: strings.map((s) => ({ Value: quoted(s) })),
        };
  return JSON.stringify(
    {
      ResourceRecordSets: [set],
      IsTruncated: true,
      NextRecordName: 'google._domainkey.footbag.org.',
      NextRecordType: 'TXT',
      MaxItems: '1',
    },
    null,
    4,
  );
}

const list = (xs: string[]) => `[${xs.map((x) => `"${x}"`).join(', ')}]`;

/** A values file in the production file's shape, with the apex list on one line. */
function values(apex: string[]): string {
  return [
    'environment = "production"',
    '',
    `apex_txt_records = ${list(apex)}`,
    '',
    'enable_legacy_mirror_records = true',
    `legacy_apex_spf              = "${LEGACY_SPF}"`,
    'ses_enable_mail_records     = false',
    '',
  ].join('\n');
}

interface World {
  /** The apex TXT strings Route 53 holds before the run; null for no apex set. */
  live?: string[] | null;
  /** What Route 53 holds once the stand-in apply has run; unchanged when absent. */
  after?: string[] | null;
  applyFails?: boolean;
  /** The apply exits non-zero after Route 53 has taken the change. */
  applyFailsAfterChange?: boolean;
  awsFails?: boolean;
  /** The Route 53 read fails from this call on (1 is the first read). */
  awsFailsFromCall?: number;
  zoneIdFails?: boolean;
  /** The name servers a public resolver hands out for footbag.org. */
  delegatedTo?: string[];
  digFails?: boolean;
}

/** The zone's own name servers, as Terraform reports them. */
const ZONE_NS = ['ns-203.awsdns-25.com', 'ns-1500.awsdns-59.org'];
/** The legacy host's name servers, which serve footbag.org until the move. */
const LEGACY_NS = ['dns1.llic.net.', 'dns2.llic.net.'];

let dir: string;
let calls: string;
let tfvars: string;

function stub(name: string, body: string): string {
  const path = join(dir, 'bin', name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function world(w: World): NodeJS.ProcessEnv {
  const live = join(dir, 'live.json');
  const after = join(dir, 'after.json');
  writeFileSync(live, listing(w.live === undefined ? [LEGACY_SPF, WORKSPACE_TOKEN] : w.live));
  writeFileSync(after, readFileSync(live, 'utf-8'));
  if (w.after !== undefined) writeFileSync(after, listing(w.after));

  const failFrom = w.awsFails ? 1 : (w.awsFailsFromCall ?? 0);
  const aws = stub(
    'aws',
    [
      `printf '%s\\n' "aws $*" >> ${JSON.stringify(calls)}`,
      `n=$(grep -c '^aws route53 ' ${JSON.stringify(calls)})`,
      `if (( ${failFrom} > 0 && n >= ${failFrom} )); then`,
      '  echo "An error occurred (AccessDenied) when calling the ListResourceRecordSets operation" >&2; exit 254',
      'fi',
      `cat ${JSON.stringify(live)}`,
    ].join('\n'),
  );
  const apply = stub(
    'apply',
    [
      `printf '%s\\n' "apply $*" >> ${JSON.stringify(calls)}`,
      w.applyFails ? 'exit 1' : `cp ${JSON.stringify(after)} ${JSON.stringify(live)}`,
      w.applyFailsAfterChange ? 'exit 1' : 'exit 0',
    ].join('\n'),
  );
  const tf = stub(
    'terraform',
    [
      `printf '%s\\n' "terraform $*" >> ${JSON.stringify(calls)}`,
      'case " $* " in',
      w.zoneIdFails
        ? '  *" output -raw route53_zone_id "*) echo "Error: No outputs found." >&2; exit 1 ;;'
        : `  *" output -raw route53_zone_id "*) printf '%s' ${ZONE_ID}; exit 0 ;;`,
      `  *" output -json route53_name_servers "*) printf '%s' '${JSON.stringify(ZONE_NS)}'; exit 0 ;;`,
      'esac',
      'exit 1',
    ].join('\n'),
  );
  // `dig +short` answers one name server per line, each with its trailing dot.
  const dig = stub(
    'dig',
    [
      `printf '%s\\n' "dig $*" >> ${JSON.stringify(calls)}`,
      w.digFails
        ? 'echo ";; connection timed out; no servers could be reached" >&2; exit 9'
        : `printf '%s\\n' ${(w.delegatedTo ?? ZONE_NS.map((n) => `${n.toUpperCase()}.`)).map((n) => JSON.stringify(n)).join(' ')}`,
    ].join('\n'),
  );

  const home = join(dir, 'home');
  mkdirSync(home, { recursive: true });
  return {
    ...process.env,
    ...awsIdentityStubEnv(dir),
    HOME: home,
    TF_OUTPUT_BIN: tf,
    ADD_APEX_TXT_AWS_BIN: aws,
    ADD_APEX_TXT_DIG_BIN: dig,
    ADD_APEX_TXT_APPLY_CMD: apply,
    ADD_APEX_TXT_TFVARS: tfvars,
  };
}

/** One shell word, every byte passed through as given, control characters included. */
const shellWord = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`;

/** Runs the script at a pseudo-terminal, typing `answers` at it. */
function run(w: World, args: string[], answers: string[] = ['APPLY']) {
  const env = world(w);
  const inner = ['bash', SCRIPT, ...args].map(shellWord).join(' ');
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
    tfvars: existsSync(tfvars) ? readFileSync(tfvars, 'utf-8') : '',
  };
}

const search = (token = SEARCH_TOKEN) => ['--target', 'production', '--provider', 'search-console', '--token', token];
const postmaster = (token = POSTMASTER_TOKEN) => ['--target', 'production', '--provider', 'postmaster', '--token', token];
const applies = (c: string[]) => c.filter((x) => x.startsWith('apply '));
const routeReads = (c: string[]) => c.filter((x) => x.startsWith('aws route53 '));

beforeEach(() => {
  dir = createScratchDir('add-apex-txt-token');
  mkdirSync(join(dir, 'bin'), { recursive: true });
  calls = join(dir, 'calls');
  tfvars = join(dir, 'production.tfvars');
  writeFileSync(tfvars, values([WORKSPACE_TOKEN]));
});

afterEach(() => {
  removeScratch(dir);
});

describe('add-apex-txt-token.sh: arguments', () => {
  it('refuses any target but production, reading and changing nothing', () => {
    const r = run({}, ['--target', 'staging', '--provider', 'search-console', '--token', SEARCH_TOKEN]);
    // Defect caught: a run named for another environment goes on to read and
    // apply production's zone.
    expect(r.status).toBe(2);
    expect(r.calls).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
  });

  it('refuses a Search Console token without Google\'s prefix, and takes a Postmaster token without one', () => {
    const bare = run({}, search('S'.repeat(43)));
    // Defect caught: a string Google never matches is published and the
    // property never verifies, with nothing saying why.
    expect(bare.status).toBe(2);
    expect(bare.out).toMatch(/google-site-verification=<value>/);
    expect(bare.calls).toEqual([]);

    const pm = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN, POSTMASTER_TOKEN] }, postmaster());
    // Defect caught: the prefix check is applied to every provider, so a
    // Postmaster token in its own format can never be published.
    expect(pm.status, pm.out).toBe(0);
  });

  it('refuses an unknown or missing provider, since the provider decides the token check', () => {
    const unknown = run({}, ['--target', 'production', '--provider', 'bing', '--token', POSTMASTER_TOKEN]);
    // Defect caught: a token for a provider the script has no rule for is
    // published unchecked, under a name nobody can trace later.
    expect(unknown.status).toBe(2);
    expect(unknown.out).toMatch(/--provider must be search-console or postmaster/);
    const missing = run({}, ['--target', 'production', '--token', POSTMASTER_TOKEN]);
    expect(missing.status).toBe(2);
    expect(missing.out).toMatch(/--provider is required/);
    expect(missing.calls).toEqual([]);
  });

  it('refuses an SPF string in any letter case, which would give the domain two SPF policies', () => {
    // SPF's version tag is matched without regard to case by receivers.
    for (const spf of ['v=spf1 include:example.com ~all', 'V=SPF1 include:example.com ~all']) {
      const r = run({}, postmaster(spf));
      // Defect caught: a second SPF string is published beside the record's own,
      // and receivers then treat the domain as having no SPF policy.
      expect(r.status, spf).toBe(2);
      expect(r.out, spf).toMatch(/SPF string/);
      expect(r.calls, spf).toEqual([]);
    }
  });

  it('refuses a token padded with spaces or carrying a control character', () => {
    const padded = run({}, postmaster(` ${POSTMASTER_TOKEN}`));
    // Defect caught: a pasted token with a stray space is published as a string
    // the provider never matches, and verification fails with no reason given.
    expect(padded.status).toBe(2);
    expect(padded.out).toMatch(/starts or ends with a space/);
    const control = run({}, postmaster(`${POSTMASTER_TOKEN}\u0007`));
    // Defect caught: a control character reaches the values file and the zone.
    expect(control.status).toBe(2);
    expect(control.out).toMatch(/--token carries a control character/);
    expect(control.calls).toEqual([]);
  });

  it('refuses a token carrying a quote, which would break out of its list', () => {
    const r = run({}, postmaster('pm-token" , "injected'));
    // Defect caught: the token closes its quote in the values file and writes
    // an extra string the operator never typed.
    expect(r.status).toBe(2);
    expect(r.calls).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
  });

  it('takes a token of exactly one TXT string and refuses one octet more', () => {
    // A TXT character-string holds at most 255 octets, the bound the script states.
    const longest = `pm=${'x'.repeat(252)}`;
    expect(longest).toHaveLength(255);
    const ok = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN, longest] }, postmaster(longest));
    // Defect caught: a token at the limit is refused, or one past it is written
    // as a string Route 53 splits into chunks the provider never matches.
    expect(ok.status, ok.out).toBe(0);

    const tooLong = run({}, postmaster(`${longest}x`));
    expect(tooLong.status).toBe(2);
    expect(tooLong.out).toMatch(/at most 255/);
  });
});

describe('add-apex-txt-token.sh: only once footbag.org is delegated to the zone', () => {
  it('refuses while the legacy name servers still serve the domain, reading and changing nothing', () => {
    const r = run({ delegatedTo: LEGACY_NS }, search());
    // Defect caught: a token published before the nameserver move makes the
    // zone differ from the legacy zone, and the mirror check that releases
    // the move fails.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/not yet delegated to the Route 53 zone/);
    expect(r.out).toMatch(/dns1\.llic\.net/);
    expect(routeReads(r.calls)).toEqual([]);
    expect(applies(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
  });

  it('refuses when a resolver hands out only some of the zone\'s name servers', () => {
    const r = run({ delegatedTo: [`${ZONE_NS[0]}.`] }, search());
    // Defect caught: an overlap is read as delegated, so a half-done
    // registrar change lets the token through before the move has landed.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/not yet delegated/);
    expect(applies(r.calls)).toEqual([]);
  });

  it('refuses when the resolver cannot be asked, rather than taking silence as delegated', () => {
    const r = run({ digFails: true }, search());
    // Defect caught: a failed lookup reads as an empty answer that is never
    // compared, and the run goes on before the move.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not ask 8\.8\.8\.8 who serves footbag\.org/);
    expect(routeReads(r.calls)).toEqual([]);
  });
});

describe('add-apex-txt-token.sh: the values file must match Route 53', () => {
  it('refuses when Route 53 serves a string the values file does not list, changing nothing', () => {
    const r = run({ live: [LEGACY_SPF, WORKSPACE_TOKEN, 'other-provider=abc'] }, search());
    // Defect caught: the apply publishes the values file's list and drops a
    // token the zone serves, withdrawing that provider's proof of ownership.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/disagree about the apex TXT strings/);
    expect(r.out).toMatch(/other-provider=abc/);
    expect(applies(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
  });

  it('refuses when Route 53 already serves the token but the values file does not list it', () => {
    const r = run({ live: [LEGACY_SPF, WORKSPACE_TOKEN, SEARCH_TOKEN] }, search());
    // Defect caught: the run reports nothing to do while the values file still
    // omits the token, so the next apply removes it from the zone.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/disagree about the apex TXT strings/);
    expect(applies(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
  });

  it('refuses, changing nothing, when Route 53 serves a string carrying a quote', () => {
    writeFileSync(tfvars, values([WORKSPACE_TOKEN, 'odd"value']));
    const r = run({ live: [LEGACY_SPF, WORKSPACE_TOKEN, 'odd"value'] }, search());
    // Defect caught: a served string breaks out of its quotes in the rewritten
    // list, and the values file no longer parses, or parses as something else.
    // The values file cannot carry such a string as Route 53 does, so the two
    // never agree and the drift refusal is the guard that stops it.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/disagree about the apex TXT strings/);
    expect(applies(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN, 'odd"value']));
  });

  it('refuses when there is no values file, rather than creating an empty one', () => {
    rmSync(tfvars);
    const r = run({}, search());
    // Defect caught: a new values file with only the token is written and
    // applied, dropping every string the zone serves.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/does not exist/);
    expect(existsSync(tfvars)).toBe(false);
    expect(applies(r.calls)).toEqual([]);
  });

  it('stops before reading Route 53 when the zone id cannot be read', () => {
    const r = run({ zoneIdFails: true }, search());
    // Defect caught: the listing runs against an empty zone id, and its error
    // hides that the tree's outputs are unreadable.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not read route53_zone_id/);
    expect(routeReads(r.calls)).toEqual([]);
  });

  it('reads a string Route 53 stores in several chunks as the one string the values file lists', () => {
    const long = `dkim-like=${'k'.repeat(300)}`;
    writeFileSync(tfvars, values([WORKSPACE_TOKEN, long]));
    const r = run({ live: [LEGACY_SPF, WORKSPACE_TOKEN, long], after: [LEGACY_SPF, WORKSPACE_TOKEN, long, SEARCH_TOKEN] }, search());
    // Defect caught: a string longer than one chunk reads as a different string,
    // so every run against a zone holding one is refused as drift.
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toContain(`"${long}"`);
  });

  it('refuses when Route 53 holds no apex TXT set, rather than reading the next set as the apex', () => {
    const r = run({ live: null }, search());
    // Defect caught: the listing's next set (a DKIM key) is taken for the apex,
    // and the run writes a list built from the wrong name.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/holds no TXT set at footbag\.org/);
    expect(applies(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
  });

  it('stops with the CLI\'s own words when Route 53 cannot be read', () => {
    const r = run({ awsFails: true }, search());
    // Defect caught: a failed read is taken as an empty zone, so the run either
    // refuses for the wrong reason or writes a list that drops every string.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not read the apex TXT set from Route 53/);
    expect(r.out).toMatch(/AccessDenied/);
    expect(applies(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
  });
});

describe('add-apex-txt-token.sh: writing, applying and reading back', () => {
  it('adds the token beside every string already served, applies records only, and proves it from Route 53', () => {
    const r = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN, SEARCH_TOKEN] }, search());
    // Defect caught: the token replaces the list rather than joining it, the
    // apply is not limited to record changes, or success is claimed without a
    // read-back.
    expect(r.status, r.out).toBe(0);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN, SEARCH_TOKEN]));
    expect(applies(r.calls)).toEqual(['apply --target production --dns-records-only']);
    expect(routeReads(r.calls)).toHaveLength(2);
    expect(r.calls.at(-1)).toMatch(/^aws route53 list-resource-record-sets --hosted-zone-id Z0TESTZONE /);
    expect(r.out).toMatch(/PASS: Route 53 serves the search-console token/);
  });

  it('changes nothing on a repeat run, asking for no confirmation', () => {
    writeFileSync(tfvars, values([WORKSPACE_TOKEN, SEARCH_TOKEN]));
    const r = run({ live: [LEGACY_SPF, WORKSPACE_TOKEN, SEARCH_TOKEN] }, search(), []);
    // Defect caught: a re-run adds the token twice or asks to apply a plan that
    // carries nothing, teaching the operator to type through the prompt.
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/already serves this token/);
    expect(applies(r.calls)).toEqual([]);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN, SEARCH_TOKEN]));
  });

  it('leaves the values file byte for byte as it was when the confirmation is declined', () => {
    const r = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN, SEARCH_TOKEN] }, search(), ['no']);
    // Defect caught: the values file is written before the confirmation, so a
    // declined run leaves a token for the next routine apply to publish.
    expect(r.status).toBe(1);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
    expect(applies(r.calls)).toEqual([]);
  });

  it('restores the values file when the apply fails and Route 53 is unchanged', () => {
    const r = run({ applyFails: true }, search());
    // Defect caught: a refused or declined apply leaves the token in the values
    // file, so the next routine apply publishes it unchecked and every later run
    // of this script refuses as drift.
    expect(r.status).toBe(1);
    expect(applies(r.calls)).toHaveLength(1);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN]));
    expect(r.out).toMatch(/apply did not complete/);
  });

  it('fails when the apply completes but Route 53 does not serve the token', () => {
    const r = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN] }, search());
    // Defect caught: the run trusts the apply's exit and reports a token
    // published that Route 53 does not hold.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/FAIL: the apply completed but Route 53 does not serve the token/);
    expect(r.out).not.toMatch(/PASS/);
  });

  it('fails when Route 53 serves only a string that contains the token', () => {
    const r = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN, `${SEARCH_TOKEN}-old`] }, search());
    // Defect caught: a near-match passes the read-back, so a token the provider
    // never matches is reported as published.
    expect(r.status).toBe(1);
    expect(r.out).not.toMatch(/PASS/);
  });

  it('fails when the read-back cannot reach Route 53, rather than reporting the token served', () => {
    const r = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN, SEARCH_TOKEN], awsFailsFromCall: 2 }, search());
    // Defect caught: an unreadable answer is taken as success, so a run proves
    // nothing yet reports the token published.
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not read the apex TXT set back/);
    expect(r.out).not.toMatch(/PASS/);
  });

  it('passes with a warning when the apply exits non-zero but Route 53 serves the token', () => {
    const r = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN, SEARCH_TOKEN], applyFailsAfterChange: true }, search());
    // Defect caught: the apply's non-zero exit is dropped from the closing
    // report, so a problem it hit after publishing is never read.
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/the apply ended with exit 1, but Route 53 serves the token/);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN, SEARCH_TOKEN]));
  });

  it('finishes a run stopped between the write and the apply, applying without writing again', () => {
    writeFileSync(tfvars, values([WORKSPACE_TOKEN, SEARCH_TOKEN]));
    const r = run({ after: [LEGACY_SPF, WORKSPACE_TOKEN, SEARCH_TOKEN] }, search(), []);
    // Defect caught: the half-done state is refused as drift, so the operator
    // has to edit the values file by hand to get out of it.
    expect(r.status, r.out).toBe(0);
    expect(applies(r.calls)).toEqual(['apply --target production --dns-records-only']);
    expect(r.tfvars).toBe(values([WORKSPACE_TOKEN, SEARCH_TOKEN]));
  });
});
