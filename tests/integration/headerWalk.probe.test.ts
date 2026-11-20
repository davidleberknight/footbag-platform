/**
 * The security-header walk probe agrees with the header set the app serves.
 *
 * The probe runs only in the operator's heavyweight pentest, never in the
 * suite, so an expectation it holds that the app no longer meets surfaces only
 * as a false finding at the end of a full gate. These cases run the real probe
 * process against the real app for the route shapes whose header set differs
 * (the password-reset page sends a stricter referrer policy than every other
 * page), and against a stand-in server that swaps the two policies, so a probe
 * that stopped checking the referrer policy at all cannot pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const { dbPath } = setTestEnv('4231');

const RESET_ROUTE = '/password/reset/:token';
const OTHER_ROUTE = '/clubs';

interface ProbeResult {
  code: number | null;
  findings: { check: string; pass: boolean; detail?: string }[];
}

let scratch: string;

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// Asynchronous on purpose: the server under probe answers from this process's
// event loop, which a synchronous spawn would block.
function runProbe(baseUrl: string, label: string): Promise<ProbeResult> {
  const outDir = join(scratch, label);
  mkdirSync(outDir);
  const routesFile = join(outDir, 'routes.json');
  writeFileSync(
    routesFile,
    JSON.stringify({
      allRoutes: [
        { method: 'GET', path: RESET_ROUTE },
        { method: 'GET', path: OTHER_ROUTE },
      ],
    }),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/.bin/tsx', 'scripts/pentest/probes/headerWalk.ts'],
      {
        ...SPAWN_GUARD,
        env: {
          ...process.env,
          PENTEST_BASE_URL: baseUrl,
          PENTEST_OUT_DIR: outDir,
          PENTEST_ROUTES_FILE: routesFile,
        },
        stdio: 'ignore',
      },
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      const report = JSON.parse(readFileSync(join(outDir, 'header-walk.json'), 'utf8'));
      resolve({ code, findings: report.findings });
    });
  });
}

function finding(result: ProbeResult, route: string) {
  const check = `GET ${route.replace(/:[^/]+/g, 'placeholder')}`;
  const found = result.findings.filter((f) => f.check === check);
  expect(found, `exactly one finding for ${check}`).toHaveLength(1);
  return found[0];
}

beforeAll(() => {
  createTestDb(dbPath).close();
  scratch = createScratchDir('header-walk-probe');
});

afterAll(() => {
  removeScratch(scratch);
  cleanupTestDb(dbPath);
});

describe('header-walk probe', () => {
  it('passes every route the real app serves, the reset page included', async () => {
    // A probe that expects one referrer policy on every route reports the
    // reset page's deliberate stricter policy as a security finding.
    const createApp = await importApp();
    const server = http.createServer(createApp());
    const base = await listen(server);
    try {
      const result = await runProbe(base, 'real-app');
      expect(finding(result, RESET_ROUTE)).toMatchObject({ pass: true });
      expect(finding(result, OTHER_ROUTE)).toMatchObject({ pass: true });
      expect(result.code).toBe(0);
    } finally {
      await close(server);
    }
  });

  it('flags each route that sends the other route shape\'s referrer policy', async () => {
    // A probe that stopped checking the referrer policy would pass an app
    // that leaked the reset token in its Referer header.
    const server = http.createServer((req, res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Strict-Transport-Security', 'max-age=15552000');
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      res.setHeader(
        'Referrer-Policy',
        req.url?.startsWith('/password/reset') ? 'strict-origin-when-cross-origin' : 'strict-origin',
      );
      res.end();
    });
    const base = await listen(server);
    try {
      const result = await runProbe(base, 'swapped-policies');
      for (const route of [RESET_ROUTE, OTHER_ROUTE]) {
        const f = finding(result, route);
        expect(f.pass, `${route} should be flagged`).toBe(false);
        expect(f.detail).toContain('referrer-policy');
      }
      expect(result.code).toBe(1);
    } finally {
      await close(server);
    }
  });
});
