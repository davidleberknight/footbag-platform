/**
 * scripts/smoke-local.sh, the route smoke both deploy scripts run against staging
 * before a production deploy and against every environment after one.
 *
 * Contract: a page passes only with a 200, the marker that page renders, and no
 * error template; every stylesheet and script the home page links answers 200
 * with the right type; on a deployed environment one curated image arrives as an
 * image; on production the payment webhook refuses an unsigned delivery with 400
 * and the sign-in page carries a live captcha key.
 *
 * The passing case runs the script against the real application in a separate
 * process, seeded through the factories, so the markers the script looks for are
 * proved true of the real templates rather than of a stub written to match them.
 * The failing cases run it against a stub that breaks one thing each. Both
 * targets run as separate processes, because the script is driven with
 * spawnSync, which blocks this process's event loop.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertEvent, insertClub } from '../fixtures/factories';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const { dbPath } = setTestEnv('4241');
const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, 'scripts/smoke-local.sh');

let scratch: string;
const children: ChildProcess[] = [];

/**
 * Kills a child and everything it started. The real-application target runs
 * through the tsx wrapper, which starts the server as a process of its own, so
 * killing only the wrapper leaves the server running after the suite. Each child
 * leads its own process group, and the whole group is killed.
 */
function killTree(proc: ChildProcess | undefined): void {
  if (!proc?.pid) return;
  try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* already gone */ }
}

function startProcess(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ proc: ChildProcess; port: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    children.push(proc);
    let out = '';
    const timer = setTimeout(() => reject(new Error(`no port announced: ${out}`)), 60_000);
    proc.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const m = /PORT=(\d+)/.exec(out);
      if (m) { clearTimeout(timer); resolve({ proc, port: m[1] }); }
    });
    proc.stderr!.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    proc.on('exit', (code) => { clearTimeout(timer); if (code !== null) reject(new Error(`exited ${code}: ${out}`)); });
  });
}

function runSmoke(port: string, env: Record<string, string> = {}): { status: number | null; out: string } {
  const res = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8', env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}`, ...env }, ...SPAWN_GUARD,
  });
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

beforeAll(() => {
  scratch = createScratchDir('smoke-local');
  const db = createTestDb(dbPath);
  insertEvent(db, { status: 'completed', title: 'Smoke Open', start_date: '2025-06-01', end_date: '2025-06-02' });
  insertClub(db, { name: 'Smoke Club', city: 'Portland', country: 'USA' });
  db.close();
});

afterAll(() => {
  for (const c of children) killTree(c);
  cleanupTestDb(dbPath);
  removeScratch(scratch);
});

describe('smoke-local.sh against the real application', () => {
  // Defect caught: the markers the smoke looks for do not appear on the real
  // pages, so every deploy's smoke fails, or they are so loose they prove nothing.
  it('passes every page, content and asset check', async () => {
    const entry = path.join(scratch, 'serve.ts');
    writeFileSync(
      entry,
      `import { createApp } from ${JSON.stringify(path.join(REPO_ROOT, 'src/app'))};\n`
      + "const server = createApp().listen(0, '127.0.0.1', () => {\n"
      + "  const a = server.address();\n"
      + "  console.log('PORT=' + (typeof a === 'object' && a ? a.port : ''));\n"
      + '});\n',
    );
    const { port } = await startProcess(path.join(REPO_ROOT, 'node_modules/.bin/tsx'), [entry], { ...process.env });
    const res = runSmoke(port);
    expect(res.status, res.out).toBe(0);
    expect(res.out).toContain('assets linked from /');
    expect(res.out).not.toContain('✗');
  }, 120_000);
});

// A stub target. MODE breaks one thing:
//   good           every page carries its marker, assets resolve, deployed extras pass
//   error-page     the home page answers 200 with the error template
//   missing-css    the stylesheet the home page links answers 404
//   js-as-text     the script the home page links is served as text/plain
//   no-assets      the home page links no stylesheet or script at all
//   no-media       the media hub links no curated image
//   webhook-open   the payment webhook is not reachable (403 from the edge)
//   test-sitekey   the sign-in page carries a Cloudflare test key
const STUB = `
const http = require('http');
const mode = process.env.MODE || 'good';
const pages = {
  '/': '<html><head><link rel="stylesheet" href="/css/style.css?v=1"><script src="/js/app.js" defer></script></head><body><a href="/events">Events</a></body></html>',
  '/clubs': '<div id="clubs-map" hidden></div>',
  '/events': '<a href="/events/year/2025">2025</a>',
  '/events/year/2025': '<h1>2025</h1>',
  '/events/year/1899': '<h1>1899</h1>',
  '/freestyle': '<a href="/freestyle/tricks">Tricks</a>',
  '/freestyle/history': '<h1>History</h1>',
  '/freestyle/sets': '<a href="/freestyle/sets/x">x</a>',
  '/freestyle/tricks': '<a href="/freestyle/tricks/x">x</a>',
  '/media': '<img src="/media-store/a-display.jpg">',
  '/login': '<div class="cf-turnstile" data-sitekey="0x4AAAAAAAlivekey"></div>',
};
http.createServer((req, res) => {
  const url = req.url;
  if (url === '/health/live' || url === '/health/ready') { res.writeHead(200); return res.end('{}'); }
  if (url === '/payments/webhook' && req.method === 'POST') {
    res.writeHead(mode === 'webhook-open' ? 403 : 400); return res.end();
  }
  if (url.startsWith('/css/')) {
    if (mode === 'missing-css') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/css' }); return res.end('body{}');
  }
  if (url.startsWith('/js/')) {
    res.writeHead(200, { 'content-type': mode === 'js-as-text' ? 'text/plain' : 'application/javascript' });
    return res.end('');
  }
  if (url.startsWith('/media-store/')) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end('x'); }
  let body = pages[url];
  if (body === undefined) { res.writeHead(404); return res.end(); }
  if (mode === 'error-page' && url === '/') body = '<div class="error-page"><a href="/events">x</a></div>';
  if (mode === 'no-assets' && url === '/') body = '<html><body><a href="/events">Events</a></body></html>';
  if (mode === 'no-media' && url === '/media') body = '<p>nothing yet</p>';
  if (mode === 'test-sitekey' && url === '/login') body = '<div class="cf-turnstile" data-sitekey="1x00000000000000000000AA"></div>';
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(body);
}).listen(0, '127.0.0.1', function () { console.log('PORT=' + this.address().port); });
`;

let stub: ChildProcess | undefined;
afterEach(() => { killTree(stub); stub = undefined; });

async function stubTarget(mode: string): Promise<string> {
  const { proc, port } = await startProcess(process.execPath, ['-e', STUB], { ...process.env, MODE: mode });
  stub = proc;
  return port;
}

describe('smoke-local.sh refuses what a status code alone would pass', () => {
  it('passes a compliant production-shaped target', async () => {
    const res = runSmoke(await stubTarget('good'), { SMOKE_ENV: 'production' });
    expect(res.status, res.out).toBe(0);
  });

  it('fails a page that answered 200 with the error template', async () => {
    const res = runSmoke(await stubTarget('error-page'));
    expect(res.status).toBe(1);
    expect(res.out).toContain('the error template rendered');
  });

  it('fails a linked stylesheet that does not load', async () => {
    const res = runSmoke(await stubTarget('missing-css'));
    expect(res.status).toBe(1);
    expect(res.out).toContain('/css/style.css?v=1 — expected 200, got 404');
  });

  it('fails a script served with a type the browser will not run', async () => {
    const res = runSmoke(await stubTarget('js-as-text'));
    expect(res.status).toBe(1);
    expect(res.out).toContain('/js/app.js — served as text/plain, not JavaScript');
  });

  // Defect caught: the asset check passes having checked nothing.
  it('fails when the home page links no assets at all', async () => {
    const res = runSmoke(await stubTarget('no-assets'));
    expect(res.status).toBe(1);
    expect(res.out).toContain('none found, so nothing was checked');
  });

  // Defect caught: a secret containing a quote ends the curl config string and
  // injects a directive of its own.
  it('refuses an origin-verify secret that would break out of the curl config', async () => {
    const res = runSmoke(await stubTarget('good'), { X_ORIGIN_VERIFY_SECRET: 'abc"\nurl = "http://elsewhere' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('contains a quote, backslash or line break');
  });

  it('fails a deployed environment serving no curated image', async () => {
    const res = runSmoke(await stubTarget('no-media'), { SMOKE_ENV: 'staging' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('no /media-store/ image linked');
  });

  it('fails production when the payment webhook does not reach the app', async () => {
    const res = runSmoke(await stubTarget('webhook-open'), { SMOKE_ENV: 'production' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('expected 400 for an unsigned delivery, got 403');
  });

  it('fails production carrying a captcha test key', async () => {
    const res = runSmoke(await stubTarget('test-sitekey'), { SMOKE_ENV: 'production' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('a Cloudflare test key is configured');
  });

  it('refuses an unknown environment name', () => {
    const res = runSmoke('1', { SMOKE_ENV: 'prod' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('SMOKE_ENV must be development, staging or production');
  });
});
