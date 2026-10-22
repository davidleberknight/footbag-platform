/**
 * The dev outbox viewer's fetch of the worker's captured mail, and how loudly
 * it reports a failure.
 *
 * The contract: the fetch never throws and falls back to an empty list; a stack
 * with no worker listening (the browser-test stack runs none) is normal and
 * logs at debug, while a worker that is there but fails the request is a fault
 * worth a warning. Real sockets, no mocked fetch.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import net from 'node:net';

/** A local port with nothing listening on it. */
async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A local server that accepts each connection and drops it at once. */
async function droppingServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/** The client and logger, freshly loaded against a worker URL on this port. */
async function loadAgainst(port: number) {
  vi.resetModules();
  process.env.WORKER_INTERNAL_URL = `http://127.0.0.1:${port}`;
  const { createDevOutboxCaptureClient } = await import('../../src/testkit/devOutboxCaptureClient');
  const { logger } = await import('../../src/config/logger');
  return {
    client: createDevOutboxCaptureClient(),
    warn: vi.spyOn(logger, 'warn'),
    debug: vi.spyOn(logger, 'debug'),
  };
}

const savedUrl = process.env.WORKER_INTERNAL_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (savedUrl === undefined) delete process.env.WORKER_INTERNAL_URL;
  else process.env.WORKER_INTERNAL_URL = savedUrl;
  vi.resetModules();
});

describe('the worker capture fetch', () => {
  it('logs no warning when no worker is listening, and returns the empty list', async () => {
    // A stack that runs no worker would otherwise print a warning on every
    // viewer load, which teaches people to ignore warnings.
    const { client, warn, debug } = await loadAgainst(await closedPort());
    expect(await client.fetchWorkerCaptured()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('no worker is listening'));
  });

  it('warns when a worker is there but the request fails, and still returns the empty list', async () => {
    // A worker that accepts and then fails is a real fault on a stack that
    // runs one; demoting it would hide it.
    const server = await droppingServer();
    try {
      const { client, warn } = await loadAgainst(server.port);
      expect(await client.fetchWorkerCaptured()).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('worker fetch failed'),
        expect.objectContaining({ error: expect.any(String) }),
      );
    } finally {
      await server.close();
    }
  });
});
