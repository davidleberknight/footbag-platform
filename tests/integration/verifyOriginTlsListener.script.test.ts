/**
 * scripts/verify-origin-tls-listener.sh: the local proof, against the real
 * nginx image, that the origin's 443 listener shares the origin-verify gate and
 * the Host pin, that nginx boots on 80 alone without a certificate, and that
 * half a pair stops it.
 *
 * The real image is what the script exists to run, so here docker, curl and
 * openssl are stand-ins that behave as nginx does for each certificate
 * directory mounted. What is pinned is the script's own reading: each check
 * proved or reported as an error, the refusals before anything starts, and the
 * teardown of everything it started, on a passing and a failing run alike.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/verify-origin-tls-listener.sh');

let work: string;
let calls: string;
let state: string;

function exec(name: string, lines: string[]): string {
  const path = join(work, name);
  writeFileSync(path, ['#!/usr/bin/env bash', ...lines].join('\n') + '\n');
  chmodSync(path, 0o755);
  return path;
}

beforeEach(() => {
  work = createScratchDir('verify-tls-listener');
  calls = join(work, 'calls.log');
  state = join(work, 'mounted');
  const log = `echo "$(basename "$0") $*" >> ${JSON.stringify(calls)}`;
  // docker: records which certificate directory nginx was started with.
  exec('docker', [
    log,
    'case "$1" in',
    '  container|network) [[ "$2" == inspect && -n "${LEFTOVER:-}" ]] && exit 0; [[ "$2" == inspect ]] && exit 1; exit 0 ;;',
    `  run) for a in "$@"; do case "$a" in *:/etc/letsencrypt:ro) d="\${a%%:*}"; basename "$d" > ${JSON.stringify(state)} ;; esac; done; echo cid ;;`,
    `  inspect) [[ "$(cat ${JSON.stringify(state)} 2>/dev/null)" == half ]] && echo false || echo true ;;`,
    '  rm) exit 0 ;;',
    'esac',
  ]);
  // curl: answers as nginx does for the mounted directory; BROKEN_GATE makes
  // 443 proxy a request without the secret.
  exec('curl', [
    `m="$(cat ${JSON.stringify(state)} 2>/dev/null)"`,
    '[[ -n "${PORT_BUSY:-}" ]] && exit 0',
    'url="${!#}"; secret=0; old=0',
    'for a in "$@"; do [[ "$a" == X-Origin-Verify:* ]] && secret=1; [[ "$a" == 1.1 ]] && old=1; done',
    'case "$m:$url" in',
    '  none:http://127.0.0.1:18080/*|pair:http://127.0.0.1:18080/*) (( secret )) && echo "upstream saw host=www.example.org"; exit 0 ;;',
    '  pair:https://127.0.0.1:18443/nginx-healthz) (( old )) && exit 35; echo ok; exit 0 ;;',
    '  pair:https://127.0.0.1:18443/*) (( secret || ${BROKEN_GATE:-0} )) && { echo "upstream saw host=www.example.org"; exit 0; }; exit 52 ;;',
    '  *) exit 7 ;;',
    'esac',
  ]);
  // openssl: writes the two files it is asked for.
  exec('openssl', [
    'for ((i=1;i<=$#;i++)); do case "${!i}" in -keyout|-out) j=$((i+1)); echo stub > "${!j}" ;; esac; done',
  ]);
});
afterEach(() => removeScratch(work));

function run(env: NodeJS.ProcessEnv = {}, args: string[] = []) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: {
      ...process.env,
      FOOTBAG_VERIFY_TLS_DOCKER_BIN: join(work, 'docker'),
      FOOTBAG_VERIFY_TLS_CURL_BIN: join(work, 'curl'),
      FOOTBAG_VERIFY_TLS_OPENSSL_BIN: join(work, 'openssl'),
      FOOTBAG_VERIFY_TLS_SETTLE_SECS: '0',
      FOOTBAG_CR_REPORT_TO: '',
      ...env,
    },
    ...SPAWN_GUARD,
  });
  const stderr = r.stderr ?? '';
  return {
    status: r.status,
    stderr,
    report: stderr.slice(stderr.indexOf('==== Closing report')),
    calls: existsSync(calls) ? readFileSync(calls, 'utf-8') : '',
  };
}

describe('verify-origin-tls-listener.sh', () => {
  it('rejects an argument', () => {
    // Defect caught: a stray flag silently ignored, so an operator believes it
    // changed what was proved.
    const r = run({}, ['--target', 'production']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown argument '--target'/);
  });

  it('proves every listener behaviour when nginx behaves, and tears down what it started', () => {
    // Defect caught: a passing run that left containers or a network on the
    // workstation, or a behaviour checked under the wrong mount.
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    for (const proof of [
      /with no certificate, nothing answers on 443/,
      /with a pair, 443 closes a request without the secret/,
      /with a pair, 443 proxies a request carrying the secret, under the pinned Host/,
      /with a pair, 443 refuses TLS 1\.1/,
      /with half a pair, nginx refuses to start/,
    ]) expect(r.report).toMatch(proof);
    expect(r.calls).toMatch(/^docker rm -f footbag-tls-proof-web footbag-tls-proof-nginx$/m);
    expect(r.calls).toMatch(/^docker network rm footbag-tls-proof$/m);
  });

  it('fails, naming the check, when 443 serves a request without the secret, and still tears down', () => {
    // Defect caught: a listener outside the origin-verify gate passing the
    // proof, or a failing run leaving its containers behind.
    const r = run({ BROKEN_GATE: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/not so: with a pair, 443 closes a request without the secret/);
    expect(r.calls).toMatch(/^docker network rm footbag-tls-proof$/m);
  });

  it('refuses to start while a port it uses already answers', () => {
    // Defect caught: a proof read from some other server on the port.
    const r = run({ PORT_BUSY: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/something already answers on 127\.0\.0\.1:18080/);
    expect(r.calls).not.toMatch(/^docker run/m);
  });

  it('refuses to start over a container or network left from an earlier run', () => {
    // Defect caught: an earlier run's container answering in place of this
    // one's, or this run removing something it did not start.
    const r = run({ LEFTOVER: '1' });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/already exists, left from an earlier run/);
    expect(r.calls).not.toMatch(/^docker (run|rm)/m);
  });

  it('refuses without docker', () => {
    // Defect caught: a run with nothing to run reported as a proof.
    const r = run({ FOOTBAG_VERIFY_TLS_DOCKER_BIN: join(work, 'no-such-docker') });
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/is not installed; nothing was started/);
  });
});
