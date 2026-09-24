/**
 * Contract tests for scripts/verify-mail-records.sh: the served-record checks
 * the mail move waits on, before mail day for Google's signing key and after
 * the mail-day apply for every record it publishes.
 *
 * What carries the risk: a key that is served but is not the key the values
 * file publishes, split across strings the way a 2048-bit key always is; an
 * apex sender policy that still names the legacy host, or two policies at once;
 * the domain verification token lost from the apex text set; a nameserver that
 * is not authoritative answering in its place; and a public resolver still
 * serving the previous answer while the nameserver serves the new one. Each of
 * those must fail, and the script must never report a pass it did not observe.
 *
 * Hermetic: a stand-in dig, named through the script's test seam, serves each
 * server's answers from fixture files and logs its argv. The answer and header
 * shapes follow real dig output: a published Google Workspace 2048-bit key
 * arrives as two quoted strings in one record, the first of 255 characters (the
 * shape was taken from a live answer for a published key; the key text here is
 * synthetic), an authoritative header reads ";; flags: qr aa;", and a resolver's
 * reads ";; flags: qr rd ra;".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'verify-mail-records.sh');

const NS = 'ns-203.awsdns-25.com';
const RESOLVER = '8.8.8.8';

const KEY_HEAD = 'v=DKIM1; k=rsa; p=' + 'A'.repeat(255 - 'v=DKIM1; k=rsa; p='.length);
const KEY_TAIL = 'B'.repeat(137) + 'IDAQAB';
const KEY_TXT = `"${KEY_HEAD}" "${KEY_TAIL}"`;
const NEW_SPF = '"v=spf1 include:amazonses.com include:_spf.google.com ~all"';
const TOKEN = '"google-site-verification=WPyKAx6yf5JX7FuFKbDx5FWSwm7EI2g9r9erW_SxOQI"';
const LEGACY_SPF = 'v=spf1 a mx ip4:173.8.190.50 ip4:74.50.54.203 a:google.com ~all';

let dir: string;
let fakeDig: string;
let tfvars: string;

/** Serve `values` (rdata, one per line) for a name and type from one server. */
function serve(server: string, name: string, rtype: string, values: string[], ttl = 600): void {
  const sdir = path.join(dir, server);
  fs.mkdirSync(sdir, { recursive: true });
  fs.writeFileSync(
    path.join(sdir, `${name}_${rtype}`),
    values.map((v) => `${name}.\t${ttl}\tIN\t${rtype}\t${v}`).join('\n') + (values.length ? '\n' : ''),
  );
}

function serveEverywhere(name: string, rtype: string, values: string[]): void {
  serve(NS, name, rtype, values);
  serve(RESOLVER, name, rtype, values);
}

function seedMailDay(): void {
  serveEverywhere('footbag.org', 'MX', ['1 smtp.google.com.']);
  serveEverywhere('footbag.org', 'TXT', [TOKEN, NEW_SPF]);
  serveEverywhere('_dmarc.footbag.org', 'TXT', ['"v=DMARC1; p=none; rua=mailto:dmarc-reports@footbag.org; adkim=s; aspf=r; pct=100"']);
  serveEverywhere('mail.footbag.org', 'MX', ['10 feedback-smtp.us-east-1.amazonses.com.']);
  serveEverywhere('mail.footbag.org', 'TXT', ['"v=spf1 include:amazonses.com ~all"']);
  serveEverywhere('google._domainkey.footbag.org', 'TXT', [KEY_TXT]);
}

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FOOTBAG_DIG_BIN: fakeDig, FAKE_DIG_DIR: dir, FAKE_NS: NS },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

const signing = (): string[] => ['--stage', 'signing', '--nameserver', NS, '--resolver', RESOLVER, '--tfvars', tfvars];
const mailDay = (): string[] => ['--stage', 'mail-day', '--nameserver', NS, '--resolver', RESOLVER];

beforeEach(() => {
  dir = createScratchDir('verify-mail-records');
  fakeDig = path.join(dir, 'dig');
  fs.writeFileSync(
    fakeDig,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_DIG_DIR/dig.log"',
      'server=""; name=""; rtype=""',
      'for a in "$@"; do',
      '  case "$a" in',
      '    @*) server="${a#@}" ;;',
      '    +*) ;;',
      '    MX|TXT) rtype="$a" ;;',
      '    *) name="$a" ;;',
      '  esac',
      'done',
      'if [[ -f "$FAKE_DIG_DIR/$server/unreachable" ]]; then',
      '  printf \';; communications error to %s#53: timed out\\n;; no servers could be reached\\n\' "$server"',
      '  exit 9',
      'fi',
      'flags="qr rd ra"',
      '[[ "$server" == "$FAKE_NS" ]] && flags="qr aa"',
      '[[ -f "$FAKE_DIG_DIR/$server/flags" ]] && flags="$(cat "$FAKE_DIG_DIR/$server/flags")"',
      'printf \';; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1\\n\'',
      'printf \';; flags: %s; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\\n\\n\' "$flags"',
      'f="$FAKE_DIG_DIR/$server/${name}_${rtype}"',
      'if [[ -f "$f" && -s "$f" ]]; then printf \';; ANSWER SECTION:\\n\'; cat "$f"; fi',
      'exit 0',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  tfvars = path.join(dir, 'production.tfvars');
  // The values file holds the key as one HCL string with an escaped empty-quote
  // pair at the split and no outer quotes, the form the DNS provider documents
  // for a value longer than 255 characters.
  fs.writeFileSync(
    tfvars,
    [
      'ses_enable_mail_records = false',
      `google_dkim_txt = "${KEY_HEAD}\\"\\"${KEY_TAIL}"`,
      `legacy_apex_spf = "${LEGACY_SPF}"`,
      'legacy_mx_records = ["10 rimu3.footbag.org.", "20 llic.net."]',
      '',
    ].join('\n'),
  );
});

afterEach(() => {
  removeScratch(dir);
});

describe('verify-mail-records: the signing stage', () => {
  it('passes when both servers serve the key the values file publishes, joined across its strings', () => {
    serveEverywhere('google._domainkey.footbag.org', 'TXT', [KEY_TXT]);
    const res = run(signing());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('GATE: MAIL-RECORDS PASS (signing)');
  });

  it('fails when the served key differs from the values file, as a regenerated key would', () => {
    serveEverywhere('google._domainkey.footbag.org', 'TXT', [`"${KEY_HEAD}" "${'C'.repeat(143)}"`]);
    const res = run(signing());
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('GATE: MAIL-RECORDS FAIL (signing)');
  });

  it('fails when the key is not served at all', () => {
    const res = run(signing());
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('has no answer');
  });

  it('fails a nameserver that does not answer authoritatively', () => {
    serveEverywhere('google._domainkey.footbag.org', 'TXT', [KEY_TXT]);
    fs.writeFileSync(path.join(dir, NS, 'flags'), 'qr rd ra');
    const res = run(signing());
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('did not answer google._domainkey.footbag.org TXT authoritatively');
  });

  it('reports a resolver that has not caught up as propagation, and fails rather than passing', () => {
    serve(NS, 'google._domainkey.footbag.org', 'TXT', [KEY_TXT]);
    serve(RESOLVER, 'google._domainkey.footbag.org', 'TXT', ['"v=DKIM1; k=rsa; p=OLD"']);
    const res = run(signing());
    expect(res.status).toBe(1);
    expect(res.stdout).toContain(`${RESOLVER} does not serve it yet`);
  });

  it('refuses without a values file, and refuses one whose key is empty', () => {
    expect(run(['--stage', 'signing', '--nameserver', NS, '--resolver', RESOLVER]).status).toBe(2);
    fs.writeFileSync(tfvars, 'google_dkim_txt = ""\n');
    const res = run(signing());
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('google_dkim_txt is empty');
  });
});

describe('verify-mail-records: the mail-day stage', () => {
  it('passes when every mail-day record is served, and prints each observed value', () => {
    seedMailDay();
    const res = run(mailDay());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('GATE: MAIL-RECORDS PASS (mail-day)');
    expect(res.stdout).toContain(`observed: footbag.org MX from ${NS}: 1 smtp.google.com.`);
    expect(res.stdout).toContain('no sooner than 3600 seconds after the apply');
  });

  it('fails while the apex still routes mail to the legacy host', () => {
    seedMailDay();
    serveEverywhere('footbag.org', 'MX', ['10 rimu3.footbag.org.', '20 llic.net.']);
    expect(run(mailDay()).status).toBe(1);
  });

  it('fails while the apex sender policy still names the legacy host', () => {
    seedMailDay();
    serveEverywhere('footbag.org', 'TXT', [TOKEN, '"v=spf1 a mx ip4:74.50.54.203 a:google.com ~all"']);
    expect(run(mailDay()).status).toBe(1);
  });

  it('fails when two sender policies are published at once, which receivers treat as an error', () => {
    seedMailDay();
    serveEverywhere('footbag.org', 'TXT', [TOKEN, NEW_SPF, '"v=spf1 a mx ~all"']);
    expect(run(mailDay()).status).toBe(1);
  });

  it('fails when the apply has dropped the domain verification token from the apex text set', () => {
    seedMailDay();
    serveEverywhere('footbag.org', 'TXT', [NEW_SPF]);
    const res = run(mailDay());
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('verification token is kept');
  });

  it('fails when the reporting policy or the bounce domain is missing', () => {
    seedMailDay();
    serveEverywhere('_dmarc.footbag.org', 'TXT', []);
    expect(run(mailDay()).status).toBe(1);
    seedMailDay();
    serveEverywhere('mail.footbag.org', 'MX', []);
    expect(run(mailDay()).status).toBe(1);
  });

  it('fails when the signing key has gone missing by mail day', () => {
    seedMailDay();
    serveEverywhere('google._domainkey.footbag.org', 'TXT', []);
    expect(run(mailDay()).status).toBe(1);
  });

  it('fails when the resolver still serves the previous mail routing, naming it as propagation', () => {
    seedMailDay();
    serve(RESOLVER, 'footbag.org', 'MX', ['10 rimu3.footbag.org.', '20 llic.net.']);
    const res = run(mailDay());
    expect(res.status).toBe(1);
    expect(res.stdout).toContain(`${RESOLVER} does not serve it yet`);
  });

  it('fails a server it cannot reach instead of skipping it', () => {
    seedMailDay();
    fs.writeFileSync(path.join(dir, RESOLVER, 'unreachable'), '');
    const res = run(mailDay());
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not be asked of 8.8.8.8 (dig exit 9)');
  });

  it('asks the nameserver without recursion and the resolver with it', () => {
    seedMailDay();
    run(mailDay());
    const argv = fs.readFileSync(path.join(dir, 'dig.log'), 'utf8').split('\n');
    expect(argv.filter((l) => l.includes(`@${NS}`)).every((l) => l.startsWith('+norec'))).toBe(true);
    expect(argv.filter((l) => l.includes(`@${RESOLVER}`)).every((l) => l.startsWith('+rec'))).toBe(true);
  });
});

describe('verify-mail-records: the reporting policy on mail day', () => {
  it('fails a reporting policy stricter than the staged p=none start', () => {
    seedMailDay();
    serveEverywhere('_dmarc.footbag.org', 'TXT', ['"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@footbag.org"']);
    const res = run(mailDay());
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL: reporting policy is published');
  });
});

describe('verify-mail-records: the rollback stage', () => {
  const rollback = (): string[] => ['--stage', 'rollback', '--nameserver', NS, '--resolver', RESOLVER, '--tfvars', tfvars];
  const seedRolledBack = (): void => {
    // The provider serves Google-style host names in whatever case it stores them;
    // the comparison must not depend on it.
    serveEverywhere('footbag.org', 'MX', ['20 LLIC.NET.', '10 rimu3.footbag.org.']);
    serveEverywhere('footbag.org', 'TXT', [TOKEN, `"${LEGACY_SPF}"`]);
  };

  it('passes when the legacy mail routing and sender policy are served again', () => {
    seedRolledBack();
    const res = run(rollback());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('GATE: MAIL-RECORDS PASS (rollback)');
  });

  it('fails while the apex still routes mail to Google', () => {
    seedRolledBack();
    serveEverywhere('footbag.org', 'MX', ['1 smtp.google.com.']);
    expect(run(rollback()).status).toBe(1);
  });

  it('fails while the apex still carries the new sender policy', () => {
    seedRolledBack();
    serveEverywhere('footbag.org', 'TXT', [TOKEN, NEW_SPF]);
    expect(run(rollback()).status).toBe(1);
  });

  it('fails when the revert dropped the verification token', () => {
    seedRolledBack();
    serveEverywhere('footbag.org', 'TXT', [`"${LEGACY_SPF}"`]);
    expect(run(rollback()).status).toBe(1);
  });

  it('refuses without a values file to read the legacy values from', () => {
    const res = run(['--stage', 'rollback', '--nameserver', NS, '--resolver', RESOLVER]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--tfvars is required for the rollback stage');
  });
});

describe('verify-mail-records: preconditions', () => {
  it('refuses without a known stage, a nameserver or a resolver', () => {
    expect(run(['--nameserver', NS, '--resolver', RESOLVER]).status).toBe(2);
    expect(run(['--stage', 'later', '--nameserver', NS, '--resolver', RESOLVER]).status).toBe(2);
    expect(run(['--stage', 'mail-day', '--resolver', RESOLVER]).status).toBe(2);
    expect(run(['--stage', 'mail-day', '--nameserver', NS]).status).toBe(2);
  });

  it('says on stderr that a stand-in dig proves nothing about the zone', () => {
    seedMailDay();
    expect(run(mailDay()).stderr).toContain('proves nothing about the zone');
  });
});
