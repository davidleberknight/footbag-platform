/**
 * Self-check of the read-only guard the deployed browser check runs under.
 *
 * Contract: a request that is not a GET or HEAD, from a page or from the API
 * client, never reaches the server and turns the test that made it red; the
 * browser's policy-violation report is stopped without failing anything; reads
 * still get through. It runs in every deployed check, against a server of its
 * own on the loopback address, so the guard is proven in the same run as the
 * walk it protects and no deployed host is touched.
 */
import { test as base, expect } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test as guarded, guardContextReads, guardRequestReads, type WriteGuard } from '../helpers/readOnlyGuard';
import { watchPageProblems } from '../helpers/pageProblems';

/** What the local server received, by method and path. */
interface Received { lines: string[] }

let server: http.Server;
let origin: string;
const received: Received = { lines: [] };

base.beforeAll(async () => {
  server = http.createServer((req, res) => {
    received.lines.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>guard self-check</title><h1>guard self-check</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

base.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

base.beforeEach(() => {
  received.lines.length = 0;
});

/** A page script's POST, the shape a form submit or a script write takes; resolves to the failure text or 'sent'. */
async function postFromPage(page: import('@playwright/test').Page, path: string): Promise<string> {
  return page.evaluate(async (url) => {
    try {
      await fetch(url, { method: 'POST', body: 'x=1' });
      return 'sent';
    } catch (e) {
      return String(e);
    }
  }, `${origin}${path}`);
}

base('a POST from the page is blocked before it leaves, and recorded', async ({ context, page }) => {
  // Defect caught: the guard observes a write but lets it through, so a spec
  // change that submits a form writes to production and is only reported after.
  const guard: WriteGuard = { blocked: [] };
  await guardContextReads(context, guard);
  const failures: string[] = [];
  page.on('requestfailed', (r) => failures.push(`${r.method()} ${r.failure()?.errorText}`));

  await page.goto(`${origin}/`);
  expect(await postFromPage(page, '/write')).not.toBe('sent');

  expect(received.lines, 'the server must see the read and never the write').toEqual(['GET /']);
  expect(guard.blocked).toEqual([`browser POST ${origin}/write`]);
  // Chromium suffixes the code with the blocker's name, so the prefix is the contract.
  expect(failures).toHaveLength(1);
  expect(failures[0]).toMatch(/^POST net::ERR_BLOCKED_BY_CLIENT\b/);
});

base('the policy-violation report is stopped without counting as a write, with or without the watcher', async ({ context, page }) => {
  // Defect caught: the guard and the page-problems watcher's own abort of the
  // report fight over it, so either the report reaches the host or every
  // policy violation also fails the run as an attempted write.
  const guard: WriteGuard = { blocked: [] };
  await guardContextReads(context, guard);
  await page.goto(`${origin}/`);
  expect(await postFromPage(page, '/csp-report')).not.toBe('sent');

  await watchPageProblems(page, origin);
  expect(await postFromPage(page, '/csp-report')).not.toBe('sent');

  expect(received.lines).toEqual(['GET /']);
  expect(guard.blocked).toEqual([]);
});

base('the API client refuses every verb but GET and HEAD before sending', async ({ request }) => {
  // Defect caught: the redirect walk's API client is outside browser routing,
  // so without its own guard a request.post would reach the host unchecked.
  const guard: WriteGuard = { blocked: [] };
  const api = guardRequestReads(request, guard);

  expect((await api.get(`${origin}/read`)).status()).toBe(200);
  expect((await api.head(`${origin}/head`)).status()).toBe(200);
  expect((await api.fetch(`${origin}/fetch-get`)).status()).toBe(200);
  await expect(api.post(`${origin}/post`)).rejects.toThrow(/read-only/);
  await expect(api.delete(`${origin}/delete`)).rejects.toThrow(/read-only/);
  await expect(api.fetch(`${origin}/fetch-put`, { method: 'PUT' })).rejects.toThrow(/read-only/);

  expect(received.lines).toEqual(['GET /read', 'HEAD /head', 'GET /fetch-get']);
  expect(guard.blocked).toEqual([
    `request POST ${origin}/post`,
    `request DELETE ${origin}/delete`,
    `request PUT ${origin}/fetch-put`,
  ]);
});

// The planted defects: a spec written on the guarded test that writes must go
// red even when its own body swallows the refusal. test.fail() inverts the
// verdict, so these pass only while the guard fails them.
guarded('a guarded test whose page POSTs goes red', async ({ page }) => {
  guarded.fail();
  await page.goto(`${origin}/`);
  await postFromPage(page, '/planted-write');
  expect(received.lines).toEqual(['GET /']);
});

guarded('a guarded test whose API client POSTs goes red', async ({ request }) => {
  guarded.fail();
  await request.post(`${origin}/planted-write`).catch(() => undefined);
  expect(received.lines).toEqual([]);
});
