/**
 * scripts/write-zone-mirror-values.sh -- rewrite the legacy mirror in the
 * production values file from a fresh capture of the legacy zone.
 *
 * The suite drives the real script against a scratch repository whose values
 * file is a symlink into a scratch private checkout, the shape every machine has.
 * The script reaches no network and no AWS, so the whole write is exercised.
 *
 * What must never happen: a name the capture dropped left in the mirror (it keeps
 * answering after the legacy zone stopped), a name the capture holds left out (it
 * stops resolving at the nameserver change), a record another assignment owns
 * rewritten or silently dropped, a comment or unrelated value disturbed, the
 * symlink into the private checkout replaced by a file, or a refusal that still
 * writes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SOA = 'footbag.org.\t86400\tIN\tSOA\tdns1.example.net. hostmaster.example.net. 7 86400 7200 2419200 3600';

/** A complete transfer in dig's layout, SOA first and last, as capture-legacy-zone.sh writes it. */
function capture(records: string[]): string {
  return [SOA, ...records, SOA, ''].join('\n');
}

/** The zone the values file below was transcribed from. */
const BASE_RECORDS = [
  'footbag.org.\t86400\tIN\tNS\tdns1.example.net.',
  'footbag.org.\t86400\tIN\tA\t198.51.100.10',
  'footbag.org.\t86400\tIN\tMX\t20 mail2.example.net.',
  'footbag.org.\t86400\tIN\tMX\t10 rimu3.footbag.org.',
  'footbag.org.\t86400\tIN\tTXT\t"v=spf1 a mx ~all"',
  'footbag.org.\t86400\tIN\tSPF\t"v=spf1 a mx ~all"',
  'footbag.org.\t86400\tIN\tTXT\t"google-site-verification=token"',
  'www.footbag.org.\t86400\tIN\tCNAME\tfootbag.org.',
  'fi.footbag.org.\t86400\tIN\tCNAME\tfootbag.org.',
  'v.footbag.org.\t86400\tIN\tCNAME\twww.footbag.org.',
  'brat.footbag.org.\t86400\tIN\tA\t198.51.100.20',
  'rimu3.footbag.org.\t86400\tIN\tA\t198.51.100.10',
  'rimu3.footbag.org.\t86400\tIN\tMX\t10 rimu3.example.net.',
  'rimu3.footbag.org.\t86400\tIN\tTXT\t"v=spf1 a ~all"',
  'lists.footbag.org.\t86400\tIN\tCNAME\tmail2.example.net.',
  'wp.footbag.org.\t86400\tIN\tCNAME\tforg.footbag.org.',
  'google._domainkey.footbag.org.\t86400\tIN\tTXT\t"v=DKIM1; k=rsa; " "p=KEYPART"',
  'my.footbag.org.\t86400\tIN\tMX\t10 ASPMX.L.GOOGLE.COM.',
  'my.footbag.org.\t86400\tIN\tTXT\t"v=spf1 include:_spf.google.com ~all"',
  'docs.my.footbag.org.\t86400\tIN\tCNAME\tghs.google.com.',
];

const VALUES = [
  '# The values file for production.',
  'environment = "production"',
  'apex_txt_records = ["google-site-verification=token"]',
  '',
  '# Legacy answers carried through the transition.',
  'enable_legacy_mirror_records = true',
  'legacy_apex_ipv4             = "198.51.100.10"',
  'legacy_apex_spf              = "v=spf1 a mx ~all"',
  'legacy_mx_records            = ["10 rimu3.footbag.org.", "20 mail2.example.net."]',
  '',
  '# The names riding the apex or www.',
  'legacy_apex_cname_records = {',
  '  "fi" = "footbag.org."',
  '  "v"  = "www.footbag.org."',
  '}',
  '',
  'legacy_mirror_a_records = {',
  '  "brat"  = "198.51.100.20"',
  '  "rimu3" = "198.51.100.10"',
  '}',
  '',
  'legacy_mirror_cname_records = {',
  '  "lists" = "mail2.example.net."',
  '  "wp"    = "forg.footbag.org."',
  '}',
  '',
  'legacy_mirror_mx_records = {',
  '  "rimu3" = ["10 rimu3.example.net."]',
  '}',
  '',
  'legacy_mirror_txt_records = {',
  '  "rimu3" = ["v=spf1 a ~all"]',
  '}',
  '',
  'google_dkim_txt = "v=DKIM1; k=rsa; p=KEYPART"',
  '',
  '# The Workspace tenant: not the legacy mirror.',
  'workspace_mx_records = {',
  '  "my" = [',
  '    "10 ASPMX.L.GOOGLE.COM.",',
  '  ]',
  '}',
  'workspace_txt_records = {',
  '  "my" = ["v=spf1 include:_spf.google.com ~all"]',
  '}',
  'workspace_cname_records = {',
  '  "docs.my" = "ghs.google.com."',
  '}',
  '',
].join('\n');

let dir: string;
let repo: string;
let privateValues: string;
let link: string;
let captureFile: string;

beforeEach(() => {
  dir = createScratchDir('write-zone-mirror');
  repo = join(dir, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  cpSync(join(process.cwd(), 'scripts/write-zone-mirror-values.sh'), join(repo, 'scripts/write-zone-mirror-values.sh'));
  cpSync(join(process.cwd(), 'scripts/lib'), join(repo, 'scripts/lib'), { recursive: true });
  mkdirSync(join(dir, 'private'));
  mkdirSync(join(repo, 'terraform/production'), { recursive: true });
  privateValues = join(dir, 'private', 'production.tfvars');
  writeFileSync(privateValues, VALUES, { encoding: 'utf-8', mode: 0o600 });
  link = join(repo, 'terraform/production/terraform.tfvars');
  symlinkSync('../../../private/production.tfvars', link);
  captureFile = join(dir, 'footbag.org.fresh.zone');
});

afterEach(() => {
  removeScratch(dir);
});

function run(args: string[]) {
  const r = spawnSync('bash', [join(repo, 'scripts/write-zone-mirror-values.sh'), ...args], {
    encoding: 'utf-8',
    cwd: dir,
    env: { ...process.env, FOOTBAG_CR_REPORT_TO: '' },
    ...SPAWN_GUARD,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const values = () => readFileSync(privateValues, 'utf-8');
const withCapture = (records: string[]) => writeFileSync(captureFile, capture(records), 'utf-8');
const VALID = () => ['--target', 'production', '--capture', captureFile];
const without = (...needles: string[]) => BASE_RECORDS.filter((r) => !needles.some((n) => r.startsWith(n)));

/** The body of one map assignment, so a case asserts on the map it is about. */
function mapBody(text: string, name: string): string {
  const start = text.indexOf(`${name} = {`);
  if (start === -1) return '';
  return text.slice(start, text.indexOf('\n}', start) + 2);
}

describe('write-zone-mirror-values.sh: arguments and preconditions', () => {
  it('refuses to run without a target or a capture, and on any target but production', () => {
    withCapture(BASE_RECORDS);
    expect(run(['--capture', captureFile]).stderr).toMatch(/--target is required/);
    const staging = run(['--target', 'staging', '--capture', captureFile]);
    expect(staging.exitCode).toBe(2);
    expect(staging.stderr).toMatch(/must be production/);
    const noCapture = run(['--target', 'production']);
    expect(noCapture.exitCode).toBe(2);
    expect(noCapture.stderr).toMatch(/--capture is required/);
    const missing = run(['--target', 'production', '--capture', join(dir, 'absent.zone')]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toMatch(/not a readable file/);
    expect(values()).toBe(VALUES);
  });

  it('accepts the capture it was transcribed from as already mirrored, changing nothing', () => {
    withCapture(BASE_RECORDS);
    const r = run(VALID());
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/already mirrors this capture/);
    expect(r.stdout).not.toMatch(/--with-removals/);
    expect(values()).toBe(VALUES);
  });
});

describe('write-zone-mirror-values.sh: the rewrite', () => {
  it('drops every name the capture no longer holds, from each map it was in, and asks for the removals', () => {
    // Defect caught: a name the legacy zone dropped stays in the mirror and keeps
    // answering after the nameserver change, or the re-sync is not told a
    // removal is coming and stops on its own plan.
    withCapture(without('brat.', 'v.', 'wp.'));
    const r = run(VALID());
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    const after = values();
    expect(mapBody(after, 'legacy_mirror_a_records')).not.toMatch(/"brat"/);
    expect(mapBody(after, 'legacy_mirror_a_records')).toMatch(/"rimu3" = "198\.51\.100\.10"/);
    expect(mapBody(after, 'legacy_apex_cname_records')).not.toMatch(/"v"/);
    expect(mapBody(after, 'legacy_apex_cname_records')).toMatch(/"fi" = "footbag\.org\."/);
    expect(mapBody(after, 'legacy_mirror_cname_records')).not.toMatch(/"wp"/);
    expect(mapBody(after, 'legacy_mirror_cname_records')).toMatch(/"lists" = "mail2\.example\.net\."/);
    for (const removed of [
      'legacy_mirror_a_records["brat"]',
      'legacy_apex_cname_records["v"]',
      'legacy_mirror_cname_records["wp"]',
    ]) {
      expect(r.stdout, removed).toContain(removed);
    }
    expect(r.stdout).toMatch(/resync-zone-mirror\.sh --target production --capture \S+ --with-removals/);
  });

  it('adds a new name and follows a changed value, without asking for removals', () => {
    // Defect caught: a name the legacy webmaster added is left out and stops
    // resolving the moment delegation moves, with no error anywhere.
    withCapture([
      ...without('lists.'),
      'lists.footbag.org.\t86400\tIN\tCNAME\tmail3.example.net.',
      'shop.footbag.org.\t86400\tIN\tA\t198.51.100.30',
    ]);
    const r = run(VALID());
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    const after = values();
    expect(mapBody(after, 'legacy_mirror_a_records')).toMatch(/"shop"\s+= "198\.51\.100\.30"/);
    expect(mapBody(after, 'legacy_mirror_cname_records')).toMatch(/"lists"\s+= "mail3\.example\.net\."/);
    expect(r.stdout).not.toMatch(/--with-removals/);
  });

  it('leaves comments, unrelated values, the owned records and the symlink exactly as they were', () => {
    // Defect caught: a rewrite that regenerates the whole file loses the
    // operator's comments or the Workspace tenant's records, or replaces the
    // link into the private checkout with a plain file the checkout never sees.
    withCapture(without('brat.'));
    expect(run(VALID()).exitCode).toBe(0);
    const before = VALUES.split('\n');
    const after = values().split('\n');
    const removed = before.filter((l) => !after.includes(l));
    // The one line the dropped name held is the whole change.
    expect(removed).toEqual(['  "brat"  = "198.51.100.20"']);
    expect(after.filter((l) => !before.includes(l))).toEqual([]);
    for (const kept of [
      '# The values file for production.',
      'apex_txt_records = ["google-site-verification=token"]',
      'google_dkim_txt = "v=DKIM1; k=rsa; p=KEYPART"',
      '    "10 ASPMX.L.GOOGLE.COM.",',
      '  "docs.my" = "ghs.google.com."',
    ]) {
      expect(after, kept).toContain(kept);
    }
    // The signing key and the apex token are not carried into the mirror maps.
    expect(mapBody(values(), 'legacy_mirror_txt_records')).not.toMatch(/DKIM|google-site-verification/);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it('is idempotent: a second run on the same capture writes nothing', () => {
    withCapture(without('brat.'));
    expect(run(VALID()).exitCode).toBe(0);
    const written = values();
    const again = run(VALID());
    expect(again.exitCode, again.stderr).toBe(0);
    expect(again.stdout).toMatch(/already mirrors this capture/);
    expect(values()).toBe(written);
  });

  it('shows the change on a dry run and writes nothing', () => {
    withCapture(without('brat.'));
    const r = run([...VALID(), '--dry-run']);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^-\s+"brat"\s+= "198\.51\.100\.20"$/m);
    expect(values()).toBe(VALUES);
  });
});

describe('write-zone-mirror-values.sh: refusals write nothing', () => {
  // Each is a capture the mirror's declared resources cannot carry, or a change
  // that is a person's decision rather than a transcription. The passing runs
  // above use the same capture with only that one thing different.
  const refusals: Array<{ why: string; records: string[]; expect: RegExp }> = [
    { why: 'an address type no resource carries',
      records: [...BASE_RECORDS, 'ipv6.footbag.org.\t86400\tIN\tAAAA\t2001:db8::1'], expect: /AAAA record at ipv6/ },
    { why: 'two addresses at one name',
      records: [...BASE_RECORDS, 'brat.footbag.org.\t86400\tIN\tA\t198.51.100.21'], expect: /brat carries more than one A/ },
    { why: 'a TXT split into several strings at a mirrored name',
      records: [...without('rimu3.footbag.org.\t86400\tIN\tTXT'), 'rimu3.footbag.org.\t86400\tIN\tTXT\t"v=spf1" " a ~all"'],
      expect: /split into several strings at rimu3/ },
    { why: 'www no longer a CNAME onto the apex',
      records: [...without('www.'), 'www.footbag.org.\t86400\tIN\tA\t198.51.100.10'], expect: /www is now A/ },
    { why: 'a Workspace record gone from the legacy zone',
      records: without('docs.my.'), expect: /no longer holds docs\.my CNAME/ },
    { why: 'a delegated child zone',
      records: [...BASE_RECORDS, 'sub.footbag.org.\t86400\tIN\tNS\tns.example.net.'], expect: /delegated child zone at sub/ },
  ];

  for (const c of refusals) {
    it(`refuses ${c.why}`, () => {
      withCapture(c.records);
      const r = run(VALID());
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(c.expect);
      expect(r.stderr).toMatch(/Nothing has changed/);
      expect(values()).toBe(VALUES);
    });
  }

  it('refuses a capture that is not a complete transfer', () => {
    writeFileSync(captureFile, [SOA, ...BASE_RECORDS, ''].join('\n'), 'utf-8');
    const r = run(VALID());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/not a complete transfer/);
    expect(values()).toBe(VALUES);
  });

  it('refuses a values file that assigns one of its maps twice, since Terraform would apply the second', () => {
    writeFileSync(privateValues, `${VALUES}legacy_mirror_a_records = {}\n`, 'utf-8');
    withCapture(without('brat.'));
    const r = run(VALID());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/legacy_mirror_a_records is assigned 2 times/);
    expect(values()).toBe(`${VALUES}legacy_mirror_a_records = {}\n`);
  });
});
