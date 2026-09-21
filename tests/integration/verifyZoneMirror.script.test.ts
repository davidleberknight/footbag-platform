/**
 * scripts/verify-zone-mirror.sh — the mirror answers what the legacy zone answers.
 *
 * The gate that releases the registrar change asks for every name verified as
 * served from the new nameservers against a committed capture of the old zone.
 * This script is that measurement, so what it must never do is report a match it
 * did not establish.
 *
 * Several cases pin normalisations that a working version got wrong, each of
 * which produced a false difference against a zone that was correct: comparing
 * one captured line against a whole served record set, so every multi-value set
 * read as a mismatch; comparing names case-sensitively, when DNS names are not
 * and the providers' spellings differ; and folding a lookup failure into the
 * answer, so a dropped packet was reported as the zone serving the wrong value.
 *
 * The rest pin the opposite and worse family, where the script reported a PASS it
 * had not earned. All three were reproduced against the real script before these
 * were written: pointed at a caching resolver it compared the legacy zone against
 * a capture of itself and scored better than the genuine run; given a capture in
 * another zone-file dialect it parsed zero records and passed; and folding case
 * over a text value it would have certified a mirror that lowercased the Google
 * site-verification token, which is the proof of ownership the Workspace recovery
 * path rests on.
 *
 * A comparison tool that turns a timeout into a difference is merely noisy. One
 * that turns a timeout, a wrong server, an unreadable capture or a destroyed
 * token into a match is the failure this whole gate exists to prevent.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/verify-zone-mirror.sh');

const TOKEN = 'google-site-verification=WPyKAx6yf5JX7FuFKbDx5FWSwm7EI2g9r9erW_SxOQI';

const CAPTURE = [
  'footbag.org.\t720\tIN\tSOA\tdns1.example.net. hostmaster.example.net. 1 2 3 4 5',
  'footbag.org.\t720\tIN\tNS\tdns1.example.net.',
  'footbag.org.\t86400\tIN\tMX\t10 mail1.footbag.org.',
  'footbag.org.\t86400\tIN\tMX\t20 mail2.example.net.',
  'footbag.org.\t720\tIN\tA\t198.51.100.10',
  `footbag.org.\t720\tIN\tTXT\t"${TOKEN}"`,
  'footbag.org.\t720\tIN\tSPF\t"v=spf1 a mx ~all"',
  'g.footbag.org.\t720\tIN\tMX\t10 ASPMX.L.GOOGLE.COM.',
  'www.footbag.org.\t720\tIN\tCNAME\tfootbag.org.',
  '',
].join('\n');

/** The record sets the mirror holds, as a listing answers: name then type. */
const MIRROR_LISTING = [
  'footbag.org.\tSOA',
  'footbag.org.\tNS',
  'footbag.org.\tMX',
  'footbag.org.\tA',
  'footbag.org.\tTXT',
  'g.footbag.org.\tMX',
  'www.footbag.org.\tA',
].join('\n');

function stub(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`, 'utf-8');
  chmodSync(path, 0o755);
  return path;
}

type Opts = {
  capture?: string;
  listing?: string;
  awsBody?: string;
  args?: string[];
};

function run(
  digBody: string,
  opts: Opts = {},
): { exitCode: number; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-zonemirror-'));
  try {
    const capture = join(dir, 'footbag.org.zone');
    writeFileSync(capture, opts.capture ?? CAPTURE, 'utf-8');
    const dig = stub(dir, 'dig', digBody);
    const aws = stub(
      dir,
      'aws',
      opts.awsBody ?? `cat <<'EOF'\n${opts.listing ?? MIRROR_LISTING}\nEOF`,
    );
    const args = opts.args ?? [
      '--capture',
      capture,
      '--nameserver',
      'ns-1.example.net',
      '--zone-id',
      'Z0TEST',
    ];
    const r = spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, FOOTBAG_DIG_BIN: dig, FOOTBAG_AWS_BIN: aws },
      ...SPAWN_GUARD,
    });
    return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Answers every name correctly, in the spelling a real server uses: lower case
 *  for names, whole record set per query, tab-separated, behind the comment
 *  header dig prints when +comments is asked for. The aa flag is what marks the
 *  answer authoritative, and the script refuses a server that does not set it. */
const FAITHFUL = `
name="\${@: -2:1}"; type="\${@: -1}"
echo ";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1"
echo ";; flags: qr aa rd; QUERY: 1, ANSWER: 1, AUTHORITY: 0"
case "\$name \$type" in
  "footbag.org. SOA") echo -e "footbag.org.\\t900\\tIN\\tSOA\\tns-1.example.net. a.example.net. 1 2 3 4 5" ;;
  "footbag.org. MX") echo -e "footbag.org.\\t60\\tIN\\tMX\\t10 mail1.footbag.org.\\nfootbag.org.\\t60\\tIN\\tMX\\t20 mail2.example.net." ;;
  "footbag.org. A") echo -e "footbag.org.\\t60\\tIN\\tA\\t198.51.100.10" ;;
  "footbag.org. TXT") echo -e "footbag.org.\\t60\\tIN\\tTXT\\t\\"${TOKEN}\\"" ;;
  "g.footbag.org. MX") echo -e "g.footbag.org.\\t60\\tIN\\tMX\\t10 AsPmx.L.Google.CoM." ;;
  "www.footbag.org. CNAME") echo "" ;;
  "www.footbag.org. A") echo -e "www.footbag.org.\\t60\\tIN\\tA\\t198.51.100.10" ;;
  *) echo "" ;;
esac`;

describe('verify-zone-mirror.sh', () => {
  it('passes a mirror that serves every captured value', () => {
    const r = run(FAITHFUL);
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/\[zone-mirror\] pass/);
    expect(r.stdout).toMatch(/differing: 0/);
  });

  // The count is not the artifact. A capture that silently lost ten names still
  // reports a pass, with the total moving and nothing naming what went, so the
  // report names every set it verified rather than summing them.
  it('names every record set it verified rather than only counting them', () => {
    const r = run(FAITHFUL);
    expect(r.stdout).toMatch(/IDENTICAL footbag\.org\. MX/);
    expect(r.stdout).toMatch(/IDENTICAL footbag\.org\. A/);
    expect(r.stdout).toMatch(/IDENTICAL g\.footbag\.org\. MX/);
  });

  // Both numbers appear because they differ, and the gate's figure is the first.
  it('states the name count and the name-and-type count separately', () => {
    const r = run(FAITHFUL);
    // Three names, six sets: the apex carries NS, MX, A and TXT between them.
    // The two numbers differing is the whole reason both are printed.
    expect(r.stdout).toMatch(/names compared: +3/);
    expect(r.stdout).toMatch(/name\+type sets: +6/);
  });

  it('records the capture by content as well as by path', () => {
    const r = run(FAITHFUL);
    expect(r.stdout).toMatch(/capture sha: +[0-9a-f]{64}/);
  });

  // A record set is one answer. Comparing a captured line against the whole set
  // reports every multi-value name as a difference.
  it('compares a multi-value record set as a set rather than line by line', () => {
    const r = run(FAITHFUL);
    expect(r.stdout).not.toMatch(/DIFFERS {3}footbag\.org\. MX/);
  });

  // Order is not meaning: a server may answer a set in any order.
  it('compares a record set irrespective of the order it is answered in', () => {
    const reversed = FAITHFUL.replace(
      '"footbag.org. MX") echo -e "footbag.org.\\t60\\tIN\\tMX\\t10 mail1.footbag.org.\\nfootbag.org.\\t60\\tIN\\tMX\\t20 mail2.example.net." ;;',
      '"footbag.org. MX") echo -e "footbag.org.\\t60\\tIN\\tMX\\t20 mail2.example.net.\\nfootbag.org.\\t60\\tIN\\tMX\\t10 mail1.footbag.org." ;;',
    );
    const r = run(reversed);
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
  });

  // DNS names are case-insensitive and the capture carries the provider's
  // upper-case spelling.
  it('does not report a difference on letter case in a name-valued record', () => {
    const r = run(FAITHFUL);
    expect(r.stdout).not.toMatch(/DIFFERS {3}g\.footbag\.org\./);
  });

  // The other half of that, and the one that matters. Case folding used to be
  // applied to every value, which would have certified a mirror that destroyed
  // the Google site-verification token by lowercasing it.
  it('does report a difference when a text value changes case', () => {
    const lowered = FAITHFUL.replace(TOKEN, TOKEN.toLowerCase());
    const r = run(lowered);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/DIFFERS {3}footbag\.org\. TXT/);
  });

  // A value over 255 bytes is split into several character strings on the wire,
  // and Route 53 requires the split. The pieces join with nothing between them.
  it('treats a text value split into character strings as the same value', () => {
    const head = TOKEN.slice(0, 20);
    const tail = TOKEN.slice(20);
    const split = FAITHFUL.replace(
      `\\"${TOKEN}\\"`,
      `\\"${head}\\" \\"${tail}\\"`,
    );
    const r = run(split);
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/DIFFERS {3}footbag\.org\. TXT/);
  });

  // A long text record is written across lines in parentheses. A parser that
  // splits on newlines drops the continuation, so the key material is never
  // compared and the first line alone reports a difference against a mirror that
  // is right.
  it('reads a capture whose text record is wrapped across lines', () => {
    const wrapped = CAPTURE.replace(
      `footbag.org.\t720\tIN\tTXT\t"${TOKEN}"`,
      `footbag.org.\t720\tIN\tTXT\t( "${TOKEN.slice(0, 20)}"\n\t"${TOKEN.slice(20)}" )`,
    );
    const r = run(FAITHFUL, { capture: wrapped });
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/IDENTICAL footbag\.org\. TXT/);
  });

  it('reports a genuine difference and fails', () => {
    const wrong = FAITHFUL.replace('198.51.100.10', '203.0.113.99');
    const r = run(wrong);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/DIFFERS {3}footbag\.org\. A/);
    expect(r.stderr).toMatch(/answer differently/);
  });

  // The case this gate exists for: a lookup that did not complete must never be
  // compared as an answer, in either direction.
  it('treats a timed-out lookup as unreadable rather than as a difference', () => {
    const timeout = FAITHFUL.replace(
      '"footbag.org. A") echo -e "footbag.org.\\t60\\tIN\\tA\\t198.51.100.10" ;;',
      '"footbag.org. A") echo ";; communications error to 203.0.113.1#53: timed out" ;;',
    );
    const r = run(timeout);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/UNREADABLE footbag\.org\. A/);
    expect(r.stdout).toMatch(/unreadable: 1/);
    expect(r.stdout).not.toMatch(/DIFFERS {3}footbag\.org\. A/);
    expect(r.stderr).toMatch(/not a match/);
  });

  // A refusal exits zero with an empty answer section, which is exactly what a
  // name holding nothing looks like. Only the status tells them apart.
  it('treats a refusal with an empty answer as unreadable, not as an absence', () => {
    const refused = FAITHFUL.replace(
      'status: NOERROR',
      '$( [ "${@: -1}" = "A" ] && echo "status: REFUSED" || echo "status: NOERROR" )',
    );
    const r = run(refused);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/UNREADABLE footbag\.org\. A/);
    expect(r.stdout).toMatch(/status REFUSED/);
  });

  // Output that is all comment lines matched nothing, and a no-match grep under
  // pipefail killed the run inside a command substitution: exit 1, no report at
  // all, nothing for an operator to act on in a cutover window.
  it('still prints its report when an answer is nothing but comments', () => {
    const commentsOnly = FAITHFUL.replace(
      '"footbag.org. A") echo -e "footbag.org.\\t60\\tIN\\tA\\t198.51.100.10" ;;',
      '"footbag.org. A") echo ";; Truncated, retrying in TCP mode." ;;',
    );
    const r = run(commentsOnly);
    expect(r.stdout).toMatch(/Zone mirror comparison/);
    expect(r.stdout).toMatch(/identical:/);
  });

  it('recognises the zone advertising its own nameservers as expected', () => {
    const r = run(FAITHFUL);
    expect(r.stdout).toMatch(/EXPECTED {2}footbag\.org\. NS/);
  });

  it('recognises that www answers only its own type in the mirror', () => {
    const r = run(FAITHFUL);
    expect(r.stdout).toMatch(/EXPECTED {2}www\.footbag\.org\. CNAME/);
  });

  // The capture carries www as a canonical name and no address, so nothing
  // driven from the capture alone ever asks the mirror for www's address, and
  // the departure branch marks the mismatch expected whether the mirror serves
  // an alias or serves nothing. www is in the served set; it gets asked.
  it('checks that www actually answers an address in the mirror', () => {
    const r = run(FAITHFUL);
    expect(r.stdout).toMatch(/CHECKED {3}www\.footbag\.org\. answers an address/);
  });

  it('fails when the mirror answers no address for www', () => {
    const noWww = FAITHFUL.replace(
      '"www.footbag.org. A") echo -e "www.footbag.org.\\t60\\tIN\\tA\\t198.51.100.10" ;;',
      '"www.footbag.org. A") echo "" ;;',
    );
    const r = run(noWww);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/DIFFERS {3}www\.footbag\.org\. A\/AAAA/);
    expect(r.stdout).toMatch(/has not actually happened/);
  });

  // Reproduced against the real script before this was written: pointed at a
  // public resolver it compared the LEGACY zone against a capture of itself,
  // scored better than the genuine run because even the www departure
  // disappears, and printed a pass. The aa flag is what distinguishes the two.
  it('refuses a nameserver that does not answer authoritatively', () => {
    const resolver = FAITHFUL.replace('qr aa rd', 'qr rd ra');
    const r = run(resolver);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/did not answer authoritatively/);
    expect(r.stderr).toMatch(/answers from cache/);
  });

  // A capture in another dialect parsed to zero records and printed pass, with
  // every count at zero. Nothing in the report said the file had not been read.
  it('refuses a capture it cannot parse rather than comparing nothing', () => {
    const relative = ['$ORIGIN footbag.org.', '$TTL 720', '@\tIN\tA\t198.51.100.10', 'www\tIN\tCNAME\t@', ''].join('\n');
    const r = run(FAITHFUL, { capture: relative });
    expect(r.exitCode).toBe(2);
    // Either refusal is the right one: a capture whose lines all fail to parse
    // reaches the zero-records branch first, and one with some of each reaches
    // the shortfall branch. What must never happen is a pass over a file that
    // was not read.
    expect(r.stderr).toMatch(/did not parse|parsed no records at all/);
    expect(r.stdout).not.toMatch(/\[zone-mirror\] pass/);
  });

  // The apex used to be taken from the first parsed row, which worked only
  // because the committed capture leads with the apex nameserver set.
  it('takes the apex from the start-of-authority record, not the first line', () => {
    const sorted = [
      'a-alias.footbag.org.\t720\tIN\tCNAME\tfootbag.org.',
      ...CAPTURE.trimEnd().split('\n'),
      '',
    ].join('\n');
    const r = run(FAITHFUL, { capture: sorted });
    // The apex departure is still recognised at footbag.org rather than at the
    // alias that now comes first.
    expect(r.stdout).toMatch(/EXPECTED {2}footbag\.org\. NS/);
  });

  // The direction a walk of the capture cannot see. The production tree declares
  // names that appear in no capture of the legacy zone, and several are on at
  // the moment this gate fires.
  it('fails on a name the mirror serves that the capture does not carry', () => {
    const extra = `${MIRROR_LISTING}\npreview.footbag.org.\tA`;
    const r = run(FAITHFUL, { listing: extra });
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/MIRROR-ONLY preview\.footbag\.org\. A/);
    expect(r.stderr).toMatch(/capture does not carry/);
  });

  it('says plainly when nothing is served that the capture lacks', () => {
    const r = run(FAITHFUL);
    expect(r.stdout).toMatch(/No name is served that the capture does not carry/);
  });

  // A child delegation is the one thing the closed-namespace decision forbids,
  // and a regression that widened the nameserver departure to every name would
  // make this script blind to it.
  it('compares a child nameserver record rather than excusing it as the apex set', () => {
    const child = CAPTURE.replace(
      'g.footbag.org.\t720\tIN\tMX\t10 ASPMX.L.GOOGLE.COM.',
      'sub.footbag.org.\t720\tIN\tNS\tns.elsewhere.example.',
    );
    const r = run(FAITHFUL, { capture: child });
    expect(r.stdout).toMatch(/DIFFERS {3}sub\.footbag\.org\. NS/);
    expect(r.stdout).not.toMatch(/EXPECTED {2}sub\.footbag\.org\. NS/);
  });

  it('refuses without a capture rather than choosing one', () => {
    const r = spawnSync('bash', [SCRIPT, '--nameserver', 'ns-1.example.net'], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--capture is required/);
  });

  it('refuses without a hosted zone, because one direction is not the measurement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'footbag-test-zonemirror-'));
    try {
      const capture = join(dir, 'footbag.org.zone');
      writeFileSync(capture, CAPTURE, 'utf-8');
      const r = spawnSync(
        'bash',
        [SCRIPT, '--capture', capture, '--nameserver', 'ns-1.example.net'],
        { encoding: 'utf-8', ...SPAWN_GUARD },
      );
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--zone-id is required/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses when the record sets cannot be listed', () => {
    const r = run(FAITHFUL, { awsBody: 'exit 255' });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/could not list the record sets/);
  });

  it('says on stderr when it is running against a stand-in', () => {
    const r = run(FAITHFUL);
    expect(r.stderr).toMatch(/stand-in for dig; this run proves nothing/);
    expect(r.stderr).toMatch(/stand-in for the AWS CLI; this run proves nothing/);
  });
});
