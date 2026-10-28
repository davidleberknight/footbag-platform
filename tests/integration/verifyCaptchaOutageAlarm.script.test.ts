/**
 * Proving on staging that a human-verification outage refuses sign-in with a
 * retry-later answer and alarms.
 *
 * What these pin: the proof runs on staging only and refuses production by
 * name; it refuses to start when the alarm is missing or already firing, or
 * when staging is not serving the stub captcha answer; it posts the outage
 * answer through the front door with the site's own Origin; and it passes only
 * when the post answers 503 with a numeric Retry-After, the outage line reaches
 * the log group and the alarm fires, failing by name on each one that does not.
 *
 * AWS, Terraform and curl are stand-ins answering from fixtures; every call is
 * recorded so a case can assert what was, and was not, sent.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/verify-captcha-outage-alarm.sh');
const BASE_URL = 'https://staging-edge.example.net';
const STUB_LOGIN_PAGE = '<form method="POST" action="/login"><input type="hidden" name="cf-turnstile-response" value="stub-captcha-pass"></form>';

let workDir: string;
let callLog: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-captcha-alarm-'));
  callLog = join(workDir, 'calls.log');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface Estate {
  /** Alarm states returned by successive describe-alarms calls; the last repeats. */
  alarmStates?: string[];
  /** The login page body the GET returns. */
  loginPage?: string;
  /** Status the login POST answers. */
  postStatus?: string;
  /** Retry-After the login POST carries, or '' for none. */
  retryAfter?: string;
  /** Outage lines the log group reports. */
  loggedLines?: number;
}

function stub(name: string, body: string[]): string {
  const file = join(workDir, name);
  writeFileSync(file, ['#!/usr/bin/env bash', `echo "${name} $*" >> ${JSON.stringify(callLog)}`, ...body].join('\n'));
  chmodSync(file, 0o755);
  return file;
}

function run(target: string | null, estate: Estate = {}) {
  const states = estate.alarmStates ?? ['OK', 'OK', 'ALARM'];
  const statesFile = join(workDir, 'states');
  writeFileSync(statesFile, `${states.join('\n')}\n`);
  const counter = join(workDir, 'alarm-calls');
  // Each run starts from the first scripted state with an empty record.
  rmSync(counter, { force: true });
  rmSync(callLog, { force: true });
  writeFileSync(join(workDir, 'login.html'), estate.loginPage ?? STUB_LOGIN_PAGE);

  const aws = stub('aws', [
    'case "$1 $2" in',
    '  "cloudwatch describe-alarms")',
    `    n=$(( $(cat ${JSON.stringify(counter)} 2>/dev/null || echo 0) + 1 )); echo "$n" > ${JSON.stringify(counter)}`,
    `    total=$(wc -l < ${JSON.stringify(statesFile)}); [[ "$n" -gt "$total" ]] && n="$total"`,
    `    sed -n "\${n}p" ${JSON.stringify(statesFile)}; exit 0 ;;`,
    // The CLI pages this search and prints one line per page, an empty page
    // included, so the stand-in splits its answer the same way.
    `  "logs filter-log-events") for ((i = 1; i <= ${estate.loggedLines ?? 1}; i++)); do echo "event-$i"; done; echo ""; exit 0 ;;`,
    'esac',
    'exit 64',
  ]);
  const terraform = stub('terraform', [
    `[[ "$*" == *"output -raw public_base_url"* ]] && { echo ${JSON.stringify(BASE_URL)}; exit 0; }`,
    'exit 1',
  ]);
  const retryLine = estate.retryAfter === '' ? '' : `Retry-After: ${estate.retryAfter ?? '30'}\\r\\n`;
  const curl = stub('curl', [
    'out=""; dump=""; post=""; prev=""',
    'for a in "$@"; do case "$prev" in -o) out="$a" ;; -D) dump="$a" ;; esac; [[ "$a" == --data-urlencode ]] && post=1; prev="$a"; done',
    'if [[ -n "$post" ]]; then',
    `  printf "HTTP/2 ${estate.postStatus ?? '503'}\\r\\n${retryLine}\\r\\n" > "$dump"`,
    `  printf "${estate.postStatus ?? '503'}"; exit 0`,
    'fi',
    `[[ -n "$out" && "$out" != /dev/null ]] && cp ${JSON.stringify(join(workDir, 'login.html'))} "$out"`,
    'exit 0',
  ]);

  const res = spawnSync('bash', [SCRIPT, ...(target === null ? [] : ['--target', target])], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VERIFY_CAPTCHA_ALARM_AWS_BIN: aws,
      VERIFY_CAPTCHA_ALARM_TERRAFORM_BIN: terraform,
      VERIFY_CAPTCHA_ALARM_CURL_BIN: curl,
      VERIFY_CAPTCHA_ALARM_POLL_SECONDS: '0',
    },
    ...SPAWN_GUARD,
  });
  const calls = existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, calls };
}

function postCalls(calls: string): string[] {
  return calls.split('\n').filter((l) => l.startsWith('curl ') && l.includes('--data-urlencode'));
}

describe('verify-captcha-outage-alarm.sh', () => {
  it('passes when the outage post answers 503, the line is logged and the alarm fires', () => {
    const r = run('staging');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('GATE: CAPTCHA-OUTAGE-ALARM PASS');
    const posts = postCalls(r.calls);
    expect(posts).toHaveLength(1);
    // The front door refuses a post whose Origin is not the site's own, so a
    // post without it would never reach the captcha check at all.
    expect(posts[0]).toContain(`Origin: ${BASE_URL}`);
    expect(posts[0]).toContain('cf-turnstile-response=stub-captcha-unavailable');
    expect(posts[0]).toContain(`${BASE_URL}/login`);
    expect(r.stderr).toContain('TEST SEAM');
  });

  it('refuses production and a missing target before touching anything', () => {
    for (const target of ['production', null]) {
      const r = run(target);
      expect(r.status, String(target)).toBe(2);
      expect(r.calls, String(target)).toBe('');
    }
  });

  it('refuses to post when the alarm is already firing or missing, since that state proves nothing', () => {
    for (const before of ['ALARM', 'None']) {
      const r = run('staging', { alarmStates: [before] });
      expect(r.status, before).toBe(1);
      expect(postCalls(r.calls), before).toHaveLength(0);
    }
  });

  it('refuses to post when staging is not serving the stub captcha answer', () => {
    const r = run('staging', { loginPage: '<form method="POST" action="/login"></form>' });
    expect(r.status).toBe(1);
    expect(postCalls(r.calls)).toHaveLength(0);
  });

  it('fails by name on each broken link: wrong status, no retry hint, no log line, no alarm', () => {
    const cases: { estate: Estate; label: string }[] = [
      { estate: { postStatus: '422' }, label: 'answered 422' },
      { estate: { retryAfter: '' }, label: "Retry-After ''" },
      { estate: { loggedLines: 0 }, label: 'no captcha.unavailable line' },
      { estate: { alarmStates: ['OK'] }, label: 'did not reach ALARM' },
    ];
    for (const { estate, label } of cases) {
      const r = run('staging', estate);
      expect(r.status, label).toBe(1);
      expect(r.stdout, label).toContain(label);
      expect(r.stdout, label).toContain('GATE: CAPTCHA-OUTAGE-ALARM FAIL');
    }
  });
});
