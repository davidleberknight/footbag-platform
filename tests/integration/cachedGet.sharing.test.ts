/**
 * The shared-response helper renders each path once per file, keeps paths
 * apart, and reads the app only when the first request is made.
 *
 * Suites that assert many things about one page read it through this helper.
 * If it re-rendered, those suites would silently pay the full render cost
 * again. If it confused two paths, a test would read a different page from the
 * one it names and could pass against the wrong content. If it read the app
 * when the helper is built, it would capture the app before the file's setup
 * assigns it.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';

import { cachedGet } from '../fixtures/cachedGet';

function countingApp() {
  const hits: Record<string, number> = {};
  const app = express();
  app.get('/:name', (req, res) => {
    hits[req.params.name] = (hits[req.params.name] ?? 0) + 1;
    res.send(`page ${req.params.name}`);
  });
  return { app, hits };
}

describe('cachedGet', () => {
  it('renders a path once however many tests read it', async () => {
    const { app, hits } = countingApp();
    const page = cachedGet(() => app);

    const [first, second] = await Promise.all([page('/alpha'), page('/alpha')]);
    const third = await page('/alpha');

    expect(hits.alpha).toBe(1);
    expect(first.text).toBe('page alpha');
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('keeps each path to its own response', async () => {
    const { app, hits } = countingApp();
    const page = cachedGet(() => app);

    const alpha = await page('/alpha');
    const beta = await page('/beta');

    expect(alpha.text).toBe('page alpha');
    expect(beta.text).toBe('page beta');
    expect(hits).toEqual({ alpha: 1, beta: 1 });
  });

  it('reads the app at the first request, not when the helper is built', async () => {
    let current: express.Express | undefined;
    const page = cachedGet(() => current as express.Express);

    const { app } = countingApp();
    current = app;

    expect((await page('/late')).text).toBe('page late');
  });

  // Defect caught: one test edits the shared response and every later test in
  // the file reads the edited copy instead of what the server sent.
  it('refuses a write to the shared response', async () => {
    const { app } = countingApp();
    const page = cachedGet(() => app);
    const res = await page('/alpha');

    expect(() => {
      (res as { text: string }).text = 'edited';
    }).toThrow(TypeError);
    expect(() => {
      (res.headers as Record<string, string>)['x-edited'] = '1';
    }).toThrow(TypeError);
    expect((await page('/alpha')).text).toBe('page alpha');
  });

  // Defect caught: a page served as bytes (an image, a download) cannot be read
  // through the shared cache at all.
  it('serves a binary response', async () => {
    const app = express();
    app.get('/bytes', (_req, res) => {
      res.type('application/octet-stream').send(Buffer.from([1, 2, 3]));
    });
    const page = cachedGet(() => app);
    const res = await page('/bytes');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect([...(res.body as Buffer)]).toEqual([1, 2, 3]);
  });

  // Defect caught: a request that failed once is handed to every later reader
  // of the path, so one transient failure fails the rest of the file.
  it('does not keep a failed request', async () => {
    const { app, hits } = countingApp();
    let failNext = true;
    const page = cachedGet(() => {
      if (failNext) {
        failNext = false;
        throw new Error('app not ready');
      }
      return app;
    });

    await expect(page('/alpha')).rejects.toThrow('app not ready');
    expect((await page('/alpha')).text).toBe('page alpha');
    expect(hits.alpha).toBe(1);
  });
});
