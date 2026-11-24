/**
 * Integration tests for scripts/verify-archive-member-access.sh.
 *
 * The check is what proves, on the deployed platform, that a member's one
 * sign-in reaches the Legacy Archive, that sign-out withdraws it, and that a
 * prospective member is refused. A check that cannot fail would wave through a
 * platform that mints no archive cookies, scopes them so the archive never
 * receives them, or leaves them working after sign-out on a shared machine.
 *
 * curl and Terraform are replaced through the script's named seams. The
 * stand-in curl plays the platform and the archive together, the way a browser
 * meets them: a sign-in answers with the Set-Cookie headers the case supplies
 * and stores in the jar only the archive cookies a browser would send to the
 * archive host (those scoped to its parent domain); a sign-out answers with the
 * case's clearing headers and drops what they clear; the archive answers 200 to
 * a request whose jar holds the archive signature and 403 otherwise. So a case
 * passes only when the platform's cookies would actually carry a member through.
 *
 * What the stand-in reads is contracted: `-w '%{http_code}'` prints the bare
 * status, and the headers and jar are files the case and the stand-in wrote.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'verify-archive-member-access.sh');

const MEMBER = 'member@example.test';
const PROSPECTIVE = 'prospective@example.test';
const MEMBER_PW = 'member-pw-not-in-argv';
const PROSPECTIVE_PW = 'prospective-pw-not-in-argv';

let dir: string;

beforeAll(() => {
  dir = createScratchDir('verify-member-access');
  writeFileSync(
    join(dir, 'curl-stub.sh'),
    [
      '#!/usr/bin/env bash',
      'printf "%s\\x1f" "$@" >> "$STUB_LOG"; printf "\\n" >> "$STUB_LOG"',
      'headers=/dev/null; jar=""; email=""; url=""',
      'while [[ $# -gt 0 ]]; do',
      '  case "$1" in',
      '    -sS) shift ;;',
      '    -o|-w|-H) shift 2 ;;',
      '    -D) headers="$2"; shift 2 ;;',
      '    -b|-c) jar="$2"; shift 2 ;;',
      '    --data-urlencode) [[ "$2" == email@* ]] && email="$(cat "${2#email@}")"; shift 2 ;;',
      '    *) url="$1"; shift ;;',
      '  esac',
      'done',
      'case "$url" in',
      '  https://unreachable.*) echo "curl: (6) Could not resolve host: ${url#https://}" >&2; exit 6 ;;',
      '  */login)',
      '    if [[ "$email" == "$STUB_MEMBER" ]]; then src="$STUB_MEMBER_HEADERS"; else src="$STUB_PROSPECTIVE_HEADERS"; fi',
      '    cp "$src" "$headers"',
      // A browser sends the archive only cookies scoped to the archive's parent.
      '    grep -i "^set-cookie: CloudFront-Signature=.*Domain=$STUB_ARCHIVE_PARENT" "$src" > "$jar" || [[ $? == 1 ]]',
      '    printf 303 ;;',
      '  */logout)',
      '    cp "$STUB_LOGOUT_HEADERS" "$headers"',
      '    if grep -qiE "^set-cookie: CloudFront-Signature=;.*(Expires=Thu, 01 Jan 1970|Max-Age=0)" "$STUB_LOGOUT_HEADERS"; then : > "$jar"; fi',
      '    printf 303 ;;',
      '  https://"$STUB_ARCHIVE_HOST"/*)',
      '    if [[ -s "$jar" ]]; then printf 200; else printf 403; fi ;;',
      '  *) printf 000 ;;',
      'esac',
    ].join('\n'),
  );
  chmodSync(join(dir, 'curl-stub.sh'), 0o755);
  writeFileSync(
    join(dir, 'terraform-stub.sh'),
    [
      '#!/usr/bin/env bash',
      'if [[ "${@: -1}" == "${STUB_TF_FAIL:-}" ]]; then echo "Error: Output \\"${@: -1}\\" not found" >&2; exit 1; fi',
      'case "${@: -1}" in',
      '  public_base_url) printf "%s" "$STUB_PLATFORM" ;;',
      '  archive_domain) printf "%s" "$STUB_ARCHIVE_HOST" ;;',
      '  archive_requires_signed_cookies) printf "%s" "$STUB_GATE" ;;',
      '  *) echo "Error: Output \\"${@: -1}\\" not found" >&2; exit 1 ;;',
      'esac',
    ].join('\n'),
  );
  chmodSync(join(dir, 'terraform-stub.sh'), 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const session = (extra = '') =>
  `Set-Cookie: __Host-footbag_session=tok; Max-Age=86400; Path=/; HttpOnly; Secure; SameSite=Lax${extra}`;
const archive = (domain: string | null, secure = true) =>
  ['CloudFront-Policy', 'CloudFront-Signature', 'CloudFront-Key-Pair-Id'].map(
    (n) => `Set-Cookie: ${n}=v; Max-Age=86400;${domain ? ` Domain=${domain};` : ''} Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`,
  );
const clearing = (domain: string | null, archiveToo = true) => [
  'Set-Cookie: __Host-footbag_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
  ...(archiveToo
    ? ['CloudFront-Policy', 'CloudFront-Signature', 'CloudFront-Key-Pair-Id'].map(
        (n) => `Set-Cookie: ${n}=;${domain ? ` Domain=${domain};` : ''} Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
      )
    : []),
];

interface Site {
  /** The platform's and archive's names; on the custom domain both sit under example.test. */
  customDomain: boolean;
  member: string[];
  prospective: string[];
  logout: string[];
  gate?: string;
  /** Overrides of the two names, for a case about how they relate. */
  platform?: string;
  archiveHost?: string;
  /** A Terraform output whose read fails. */
  tfFail?: string;
}

/** The platform as the design requires it, on the custom domain or before it. */
const correct = (customDomain: boolean): Site => {
  const domain = customDomain ? '.example.test' : null;
  return { customDomain, member: [session(), ...archive(domain)], prospective: [session()], logout: clearing(domain) };
};

function run(site: Site, args: string[] = ['--target', 'production', '--member-email', MEMBER, '--prospective-email', PROSPECTIVE]) {
  const caseDir = createScratchDir('verify-member-access-case');
  const write = (name: string, lines: string[]) => {
    const p = join(caseDir, name);
    writeFileSync(p, ['HTTP/2 303', ...lines, ''].join('\r\n'));
    return p;
  };
  const log = join(caseDir, 'calls.log');
  writeFileSync(log, '');
  const r = spawnSync('bash', [SCRIPT, ...args, '--profile', 'stub'], {
    encoding: 'utf-8',
    input: `${MEMBER_PW}\n${PROSPECTIVE_PW}\n`,
    env: {
      ...process.env,
      VERIFY_MEMBER_ACCESS_CURL_BIN: join(dir, 'curl-stub.sh'),
      VERIFY_MEMBER_ACCESS_TERRAFORM_BIN: join(dir, 'terraform-stub.sh'),
      STUB_LOG: log,
      STUB_MEMBER: MEMBER,
      STUB_MEMBER_HEADERS: write('member.headers', site.member),
      STUB_PROSPECTIVE_HEADERS: write('prospective.headers', site.prospective),
      STUB_LOGOUT_HEADERS: write('logout.headers', site.logout),
      STUB_PLATFORM: site.platform ?? (site.customDomain ? 'https://preview.example.test' : 'https://d1234abcdef8.cloudfront.net'),
      STUB_ARCHIVE_HOST: site.archiveHost ?? (site.customDomain ? 'archive.example.test' : 'placeholder.cloudfront.net'),
      STUB_ARCHIVE_PARENT: '.example.test',
      STUB_GATE: site.gate ?? 'true',
      STUB_TF_FAIL: site.tfFail ?? '',
    },
    ...SPAWN_GUARD,
  });
  const calls = readFileSync(log, 'utf-8');
  rmSync(caseDir, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls };
}

describe('verify-archive-member-access.sh on the archive custom domain', () => {
  it('passes a platform whose cookies carry a member through, and says so', () => {
    // Defect caught: a check that fails a correct platform would block the
    // launch step that proves members can read the archive.
    const r = run(correct(true));
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('PASS  member: archive served with no second sign-in');
    expect(r.stdout).toContain('PASS  member: archive refused after sign-out');
    expect(r.stdout).toContain('PASS  prospective member: archive refused');
    expect(r.stdout).toContain('MEMBER ACCESS CHECK PASSED: one sign-in reaches the archive');
    expect(r.stderr).toMatch(/NOTE: using a stand-in for curl/);
  });

  it('never puts a password in a process argument', () => {
    // Defect caught: a password readable by any account on the workstation
    // through the process table.
    const r = run(correct(true));
    expect(r.calls).not.toContain(MEMBER_PW);
    expect(r.calls).not.toContain(PROSPECTIVE_PW);
    expect(r.calls).toMatch(/password@/);
  });

  it('fails archive cookies left host-only, which the archive never receives', () => {
    // Defect caught: the cookie domain not published, so members sign in and
    // are then refused at the archive.
    const r = run({ ...correct(true), member: [session(), ...archive(null)] });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('FAIL  member: CloudFront-Signature scoped to .example.test');
    expect(r.stdout).toContain('FAIL  member: archive served with no second sign-in');
  });

  it('fails archive cookies without Secure', () => {
    // Defect caught: archive credentials sent over plain HTTP to any name
    // under the parent domain.
    const r = run({ ...correct(true), member: [session(), ...archive('.example.test', false)] });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('FAIL  member: CloudFront-Policy Secure');
  });

  it('fails a session cookie scoped beyond its own host', () => {
    // Defect caught: every footbag.org name receiving the member's session.
    const r = run({ ...correct(true), member: [session('; Domain=.example.test'), ...archive('.example.test')] });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('FAIL  member: session cookie host-only and Secure');
  });

  it('fails a sign-out that leaves the archive cookies working', () => {
    // Defect caught: a member who signs out on a shared machine leaves the next
    // person reading the archive for the rest of the cookie's lifetime.
    const r = run({ ...correct(true), logout: clearing('.example.test', false) });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('FAIL  member: sign-out clears CloudFront-Signature');
    expect(r.stdout).toContain('FAIL  member: archive refused after sign-out');
  });

  it('accepts a sign-out that clears with Max-Age=0, the other form a browser honours', () => {
    // Defect caught: a correct platform failed for clearing its cookies the
    // other standard way.
    const site = correct(true);
    const maxAge = site.logout.map((l) => l.replace('Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'Max-Age=0'));
    const r = run({ ...site, logout: maxAge });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('PASS  member: sign-out clears CloudFront-Signature');
    expect(r.stdout).toContain('PASS  member: sign-out clears __Host-footbag_session');
  });

  it('fails a prospective member given archive cookies', () => {
    // Defect caught: archive access granted before onboarding finishes, to
    // someone who is not a member.
    const r = run({ ...correct(true), prospective: [session(), ...archive('.example.test')] });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('FAIL  prospective member: no archive cookie');
    expect(r.stdout).toContain('FAIL  prospective member: archive refused');
  });
});

describe('verify-archive-member-access.sh before the archive custom domain', () => {
  it('passes host-only cookies and reports the archive rows as unproved, never as passed', () => {
    // Defect caught: a run on cloudfront.net names read as proof that members
    // reach the archive, when no cookie can cross to it yet.
    const r = run(correct(false));
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('PASS  member: CloudFront-Signature Secure, host-only');
    expect(r.stdout).not.toMatch(/archive served|archive refused/);
    expect(r.calls).not.toContain('placeholder.cloudfront.net');
    expect(r.stdout).toContain('MEMBER ACCESS CHECK PASSED as far as it can before the archive');
    expect(r.stderr).toMatch(/Not proven:[\s\S]*the click-through and both refusals/);
  });

  it('takes a two-label archive name for no parent domain, never a bare top-level domain', () => {
    // Defect caught: an archive answering on the bare domain read as sharing a
    // parent with the platform under the top-level domain alone, so cookies
    // scoped to a public suffix would be demanded and every browser refuses them.
    const r = run({ ...correct(false), platform: 'https://www.example.test', archiveHost: 'example.test' });
    expect(r.stdout).toContain('share no parent domain yet');
    expect(r.stdout).toContain('PASS  member: CloudFront-Signature Secure, host-only');
  });

  it('fails a parent cookie domain published before the custom domain', () => {
    // Defect caught: cookies every browser discards, set from a host outside
    // the domain they name.
    const r = run({ ...correct(false), member: [session(), ...archive('.example.test')] });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('FAIL  member: CloudFront-Policy host-only before the custom domain');
  });
});

describe('verify-archive-member-access.sh refusals', () => {
  it('refuses an environment whose archive edge does not require signed cookies, signing nobody in', () => {
    // Defect caught: a staging run reported as a pass when its platform signs
    // no archive cookies at all.
    const r = run({ ...correct(false), gate: 'false' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("archive edge does not require signed cookies (archive_requires_signed_cookies reads 'false')");
    expect(r.calls).toBe('');
  });

  it('stops on a Terraform output it cannot read, listing it in the closing report, and signs nobody in', () => {
    // Defect caught: a failed read that exits non-zero with an empty error
    // list, so the operator sees a failed run and no reason for it.
    const r = run({ ...correct(true), tfFail: 'public_base_url' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Errors \(\d+\):\n  - could not read the Terraform output public_base_url[^\n]*Error: Output "public_base_url" not found/);
    expect(r.calls).toBe('');
  });

  it('stops on a request that fails outright, listing it in the closing report', () => {
    // Defect caught: a platform that cannot be reached reported with no reason.
    const r = run({ ...correct(true), platform: 'https://unreachable.example.test' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Errors \(\d+\):\n  - the request to https:\/\/unreachable\.example\.test\/login failed: curl: \(6\)/);
  });

  it('refuses one account named as both, and runs with two', () => {
    // Defect caught: the prospective-member refusal proved against a member,
    // which can never be refused.
    const same = run(correct(true), ['--target', 'production', '--member-email', MEMBER, '--prospective-email', MEMBER]);
    expect(same.status).toBe(2);
    expect(same.stderr).toContain('name the same account');
    expect(run(correct(true)).status).toBe(0);
  });

  it('refuses a missing account or an unknown target', () => {
    expect(run(correct(true), ['--target', 'production', '--member-email', MEMBER]).status).toBe(2);
    const t = run(correct(true), ['--target', 'prod', '--member-email', MEMBER, '--prospective-email', PROSPECTIVE]);
    expect(t.status).toBe(2);
    expect(t.stderr).toContain("--target must be 'staging' or 'production'");
  });
});
