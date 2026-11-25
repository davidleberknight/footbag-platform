/**
 * Integration tests for scripts/verify-preview.sh.
 *
 * The preview proof is what establishes, before launch, that the preview name
 * serves the platform and stays out of every search index, and that the
 * members-only archive refuses an unsigned request. A proof that cannot fail
 * would wave through a preview that search engines index, or an archive served
 * to anyone.
 *
 * curl and Terraform are replaced through the script's named seams. The
 * stand-in curl plays the edge: it answers each URL from a table with a status,
 * a header block written to the file the script names with -D, and a body
 * written to the file it names with -o. What the script reads is contracted
 * rather than scraped: `-w '%{http_code}'` prints the bare three-digit status by
 * definition, and the claims read one named HTTP header and the body the app
 * builds.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'verify-preview.sh');

const PREVIEW = 'https://preview.example.test';
const ARCHIVE = 'archive.example.test';

/** One edge answer: status, raw header block, body. */
type Answer = [code: string, headers: string, body: string];

/**
 * The edge as it should behave in the cutover window. Header names and values
 * are cased differently across rows, as real responses may be, so a
 * case-sensitive match fails the passing run.
 */
const CORRECT: Record<string, Answer> = {
  [`${PREVIEW}/`]: ['200', 'HTTP/2 200\r\nX-Robots-Tag: noindex, nofollow\r\n\r\n', '<html>platform</html>'],
  [`${PREVIEW}/robots.txt`]: ['200', 'HTTP/2 200\r\nx-robots-tag: noindex, nofollow\r\n\r\n', 'User-agent: *\r\nDisallow: /\r\n'],
  [`${PREVIEW}/sitemap.xml`]: ['200', 'HTTP/2 200\r\nX-ROBOTS-TAG: NOINDEX, NOFOLLOW\r\n\r\n', '<urlset/>'],
  [`${PREVIEW}/llms.txt`]: ['200', 'HTTP/2 200\r\nx-robots-tag: noindex, nofollow\r\n\r\n', '# footbag'],
  [`https://${ARCHIVE}/`]: ['403', 'HTTP/2 403\r\n\r\n', 'Sign in to read the archive'],
};

let dir: string;

beforeAll(() => {
  dir = createScratchDir('verify-preview');
  const curl = join(dir, 'curl-stub.sh');
  writeFileSync(
    curl,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\x1f" "$@" >> "$STUB_LOG"; printf "\\n" >> "$STUB_LOG"',
      'out=/dev/null; dump=/dev/null; url=""',
      'while [[ $# -gt 0 ]]; do',
      '  case "$1" in',
      '    -sS) shift ;;',
      '    --max-time|-w) shift 2 ;;',
      '    -o) out="$2"; shift 2 ;;',
      '    -D) dump="$2"; shift 2 ;;',
      '    *) url="$1"; shift ;;',
      '  esac',
      'done',
      'while IFS=$\'\\t\' read -r u code headers body; do',
      '  [[ "$u" == "$url" ]] || continue',
      '  printf "%b" "$headers" > "$dump"; printf "%b" "$body" > "$out"; printf "%s" "$code"; exit 0',
      'done < "$STUB_TABLE"',
      'echo "curl: (6) Could not resolve host: ${url}" >&2; printf "000"; exit 6',
    ].join('\n'),
  );
  chmodSync(curl, 0o755);

  writeFileSync(
    join(dir, 'terraform-stub.sh'),
    [
      '#!/usr/bin/env bash',
      // A read the case names fails the way Terraform reports an output it
      // cannot print, so the script's handling of a failed read is exercised.
      'if [[ "${@: -1}" == "${STUB_TF_FAIL:-}" ]]; then echo "Error: Output \\"${@: -1}\\" not found" >&2; exit 1; fi',
      'case "${@: -1}" in',
      '  preview_url) printf "%s" "$STUB_PREVIEW_URL" ;;',
      `  archive_domain) printf '%s' ${ARCHIVE} ;;`,
      '  *) exit 1 ;;',
      'esac',
    ].join('\n'),
  );
  chmodSync(join(dir, 'terraform-stub.sh'), 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  urls: string[];
}

/** The closing report's list of errors, so a case asserts what it lists. */
function errors(stderr: string): string {
  const at = stderr.search(/^Errors \(\d+\):$/m);
  if (at === -1) return '';
  const rest = stderr.slice(at);
  const end = rest.slice(1).search(/^(Warnings|Proven:|Not proven:|No errors)/m);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/** Escapes a value for the stub's one-line table cells, read back with printf %b. */
const cell = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');

function run(
  opts: {
    args?: string[];
    edge?: Record<string, Answer>;
    previewUrl?: string;
    /** A Terraform output whose read fails. */
    tfFail?: string;
  } = {},
): Run {
  const caseDir = createScratchDir('verify-preview-case');
  const log = join(caseDir, 'calls.log');
  const table = join(caseDir, 'table.tsv');
  const edge = opts.edge ?? CORRECT;
  writeFileSync(
    table,
    Object.entries(edge)
      .map(([u, [code, headers, body]]) => [u, code, cell(headers), cell(body)].join('\t'))
      .join('\n') + '\n',
  );
  const res = spawnSync('bash', [SCRIPT, ...(opts.args ?? ['--target', 'production'])], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(caseDir),
      VERIFY_PREVIEW_CURL_BIN: join(dir, 'curl-stub.sh'),
      VERIFY_PREVIEW_TERRAFORM_BIN: join(dir, 'terraform-stub.sh'),
      STUB_LOG: log,
      STUB_TABLE: table,
      STUB_PREVIEW_URL: opts.previewUrl ?? PREVIEW,
      STUB_TF_FAIL: opts.tfFail ?? '',
    },
    ...SPAWN_GUARD,
  });
  const urls = existsSync(log)
    ? readFileSync(log, 'utf-8')
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => l.split('\x1f').slice(0, -1).at(-1) ?? '')
    : [];
  rmSync(caseDir, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', urls };
}

describe('verify-preview.sh proves the preview and archive claims or fails', () => {
  it('passes against an edge where preview serves the platform out of every index and the archive refuses', () => {
    // Defect caught: a proof that fails a healthy edge, so the operator learns to
    // ignore it, or one that never asks the edge, or a stubbed run that does
    // not say it proves nothing.
    const r = run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toContain('FAIL');
    expect(r.stdout.match(/^ {2}PASS /gm)?.length).toBe(6);
    expect([...r.urls].sort()).toEqual(Object.keys(CORRECT).sort());
    expect(r.stderr).toContain('NOTE: using a stand-in for curl');
    expect(r.stderr).toContain('NOTE: using a stand-in for Terraform');
  });

  it('refuses a run with no target, and staging by name, before reading anything', () => {
    // Defect caught: a forgotten --target defaulting to some environment, or a
    // staging run that checks names staging does not have and reports a result.
    for (const args of [[], ['--target', 'staging']]) {
      const r = run({ args });
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.urls, args.join(' ')).toEqual([]);
      if (args.length) expect(errors(r.stderr)).toContain('no preview name');
      else expect(errors(r.stderr)).toContain("got ''");
    }
  });

  // Each row breaks one claim alone, so the run must fail on exactly that one.
  const broken: Array<[claim: string, defect: string, url: string, answer: Answer]> = [
    ['1 preview root answers 200', 'preview not serving the platform is reported as ready', `${PREVIEW}/`,
      ['503', 'HTTP/2 503\r\nx-robots-tag: noindex, nofollow\r\n\r\n', 'error']],
    ['2 preview root is noindex, nofollow', 'preview pages indexed because the host holds the canonical base address', `${PREVIEW}/`,
      ['200', 'HTTP/2 200\r\ncontent-type: text/html\r\n\r\n', '<html>platform</html>']],
    ['3 robots.txt disallows all, no sitemap', 'a robots.txt the edge does not serve read as disallowing', `${PREVIEW}/robots.txt`,
      ['404', 'HTTP/2 404\r\nx-robots-tag: noindex, nofollow\r\n\r\n', 'User-agent: *\nDisallow: /\n']],
    ['3 robots.txt disallows all, no sitemap', 'a robots.txt that disallows nothing served on preview', `${PREVIEW}/robots.txt`,
      ['200', 'HTTP/2 200\r\nx-robots-tag: noindex, nofollow\r\n\r\n', 'User-agent: *\nAllow: /\n']],
    ['3 robots.txt disallows all, no sitemap', 'a sitemap advertised to crawlers from a disallowed name', `${PREVIEW}/robots.txt`,
      ['200', 'HTTP/2 200\r\nx-robots-tag: noindex, nofollow\r\n\r\n', 'User-agent: *\nDisallow: /\nSitemap: https://preview.example.test/sitemap.xml\n']],
    ['4 sitemap.xml is noindex', 'the sitemap itself indexed', `${PREVIEW}/sitemap.xml`,
      ['200', 'HTTP/2 200\r\n\r\n', '<urlset/>']],
    ['4 llms.txt is noindex', 'the agent site map indexed', `${PREVIEW}/llms.txt`,
      ['200', 'HTTP/2 200\r\n\r\n', '# footbag']],
    ['5 archive refuses an unsigned request', 'the members-only archive served to anyone', `https://${ARCHIVE}/`,
      ['200', 'HTTP/2 200\r\n\r\n', '<h1>archive</h1>']],
  ];
  it.each(broken)('fails on claim "%s" alone: %s', (claim, _defect, url, answer) => {
    const r = run({ edge: { ...CORRECT, [url]: answer } });
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain(`FAIL  ${claim}`);
    expect(r.stdout.match(/^ {2}FAIL /gm)?.length, r.stdout).toBe(1);
    // The operator reads the end of the run, so the failure is in its closing
    // report, not only in a row that scrolled past.
    expect(errors(r.stderr)).toContain(`claim ${claim}`);
    expect(r.stdout).not.toContain('PREVIEW PROOF PASSED');
  });

  it('stops on a Terraform output it cannot read, listing Terraform\'s own message, and requests nothing', () => {
    // Defect caught: a failed read dropped and reported only as an empty value,
    // so the operator never sees why Terraform could not answer.
    for (const output of ['preview_url', 'archive_domain']) {
      const r = run({ tfFail: output });
      expect(r.status, output).toBe(1);
      expect(errors(r.stderr), output).toContain(`could not read the Terraform output ${output}`);
      expect(errors(r.stderr), output).toContain(`Error: Output "${output}" not found`);
      expect(r.urls, output).toEqual([]);
    }
  });

  it('refuses an empty preview_url as no preview to check, and requests nothing', () => {
    // Defect caught: with the custom domain or the preview record off, requests
    // aimed at an empty base land on a bare path and a failure reads as a
    // broken edge instead of a preview that does not exist yet.
    const r = run({ previewUrl: '' });
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toContain('preview_url is empty');
    expect(errors(r.stderr)).toContain('no preview to check');
    expect(r.urls).toEqual([]);
  });
});
