/**
 * Integration tests for scripts/smoke-security.sh.
 *
 * This is a blocking gate in both deploy scripts and it had no test at all,
 * which for a security smoke is the worst position: a probe that silently
 * stopped failing would wave every deploy through while reading as protection.
 * Each probe is exercised both ways against a stub target — a compliant one it
 * must pass, and a deliberately broken one it must fail — so the gate's ability
 * to fail is what is pinned, not just its happy path.
 *
 * The stub target runs as a separate node process, because the script under
 * test is driven with spawnSync, which blocks this process's event loop: an
 * in-process server would never answer the probes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The stub target. MODE picks the defect:
//   compliant     dev/staging shape: gated routes redirect, forgot-password is
//                 identical for both branches, dev harness present
//   production    production shape: dev harness absent
//   open-member   the member-only route serves 200 with content
//   leaky-forgot  forgot-password body differs by account existence
//   dev-leak      production shape but the dev harness answers 200
const SERVER_JS = `
const http = require('http');
const mode = process.env.MODE || 'compliant';
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const gated = ['/members/placeholder/edit', '/admin/'];
    if (gated.includes(req.url)) {
      if (mode === 'open-member' && req.url === gated[0]) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>member profile edit form</html>');
        return;
      }
      res.writeHead(302, { location: '/login?next=' + req.url });
      res.end();
      return;
    }
    if (req.url === '/internal/') { res.writeHead(404); res.end(); return; }
    if (req.url === '/password/forgot' && req.method === 'POST') {
      const registered = body.includes('personas.test');
      let page = '<html>\\n<form><input value="x"></form>\\nIf the address exists, mail was sent.\\n</html>';
      if (mode === 'leaky-forgot' && registered) {
        page = '<html>\\n<form><input value="x"></form>\\nA reset link was sent to your address.\\n</html>';
      }
      if (mode !== 'production' && registered) {
        // The simulated-email tester card, which legitimately differs by
        // account existence on stub-adapter hosts and must be stripped by the
        // probe before comparing. On its own lines, as rendered pages are,
        // because the probe strips it with a line-range delete.
        page = page.replace('\\n</html>',
          '\\n<section class="sec-card sec-card-dev">\\ncaptured mail\\n</section>\\n</html>');
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(page);
      return;
    }
    if (req.url.startsWith('/dev/')) {
      if (mode === 'production') { res.writeHead(404); res.end(); return; }
      if (mode === 'dev-leak' || mode === 'compliant') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>personas</html>');
        return;
      }
    }
    res.writeHead(404); res.end();
  });
});
srv.listen(0, '127.0.0.1', () => {
  console.log('PORT=' + srv.address().port);
});
`;

let server: ChildProcess | undefined;

function startTarget(mode: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, ['-e', SERVER_JS], {
      env: { ...process.env, MODE: mode },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const bail = setTimeout(() => reject(new Error('stub target never reported a port')), 10_000);
    let out = '';
    server.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const m = out.match(/PORT=(\d+)/);
      if (m) { clearTimeout(bail); resolve(Number(m[1])); }
    });
    server.on('error', (err) => { clearTimeout(bail); reject(err); });
  });
}

afterEach(() => {
  server?.kill('SIGKILL');
  server = undefined;
});

function runSmoke(port: number, smokeEnv: string) {
  return spawnSync('bash', ['scripts/smoke-security.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      BASE_URL: `http://127.0.0.1:${port}`,
      SMOKE_ENV: smokeEnv,
    },
    ...SPAWN_GUARD,
  });
}

describe('smoke-security.sh', () => {
  it('refuses an unknown SMOKE_ENV rather than probing with no contract', () => {
    const res = spawnSync('bash', ['scripts/smoke-security.sh'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, SMOKE_ENV: 'prod' },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("SMOKE_ENV must be 'development', 'staging', or 'production'");
  });

  it('passes a compliant staging-shaped target', async () => {
    const port = await startTarget('compliant');
    const res = runSmoke(port, 'staging');
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('SECURITY SMOKE PASSED');
    expect(res.stdout).toContain('password-forgot equivalence');
    expect(res.stdout).toContain('dev harness present');
  });

  it('fails when a member-only route serves content anonymously', async () => {
    const port = await startTarget('open-member');
    const res = runSmoke(port, 'staging');
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('SECURITY SMOKE FAILED');
    expect(res.stdout).toMatch(/member-only route gated — expected 302/);
  });

  it('fails when forgot-password leaks account existence outside the tester card', async () => {
    const port = await startTarget('leaky-forgot');
    const res = runSmoke(port, 'staging');
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('response body differs by account existence');
  });

  it('holds production to the dev-surface-absent contract and skips the mail-sending probe', async () => {
    const port = await startTarget('production');
    const res = runSmoke(port, 'production');
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('anti-enumeration probe skipped on production');
    expect(res.stdout).toContain('dev harness absent: /dev/switch');
  });

  it('fails a production target whose dev harness answers', async () => {
    const port = await startTarget('dev-leak');
    const res = runSmoke(port, 'production');
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/dev harness absent: \/dev\/personas — expected 404, got 200/);
  });
});
