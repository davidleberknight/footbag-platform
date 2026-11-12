/**
 * Every Stripe client the payment adapter builds gives up on a silent Stripe
 * inside the window the reverse proxy waits for the app.
 *
 * What carries the risk: the SDK's own defaults wait 80 seconds per attempt
 * and retry twice, so a stalled Stripe holds a member's checkout request long
 * after the proxy has answered the member with a gateway error, and the
 * request keeps running behind it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Stripe from 'stripe';

import { STRIPE_CLIENT_OPTIONS } from '../../src/adapters/paymentAdapter';
import { listFiles, REPO_ROOT } from '../fixtures/sourceTree';

let server: Server | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.destroy();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

/** A peer that accepts the connection and then never answers. */
async function silentPeer(): Promise<number> {
  server = createServer((s) => { sockets.push(s); });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  return addr.port;
}

/** The seconds the proxy waits for the app on an ordinary page request. */
function proxyReadTimeoutMs(): number {
  const conf = readFileSync(join(REPO_ROOT, 'docker/nginx/nginx.conf.template'), 'utf-8');
  const block = conf.split(/location \/ \{/)[1];
  const m = block?.match(/proxy_read_timeout\s+(\d+)s;/);
  if (!m) throw new Error('no proxy_read_timeout in the catch-all location');
  return Number(m[1]) * 1000;
}

describe('the Stripe client limits', () => {
  // Defect caught: a client option the SDK does not read, so a silent Stripe
  // still holds the call open with no end.
  it('ends a call to a Stripe that accepts and never answers, with a timeout error', async () => {
    const port = await silentPeer();
    const client = new Stripe('sk_test_synthetic1', {
      ...STRIPE_CLIENT_OPTIONS,
      host: '127.0.0.1',
      port,
      protocol: 'http',
      timeout: 250,
      maxNetworkRetries: 0,
    });
    await expect(client.customers.del('cus_hang')).rejects.toMatchObject({
      type: 'StripeConnectionError',
      message: expect.stringContaining('timeout'),
    });
  });

  // Defect caught: a per-attempt limit or retry count whose worst case, with
  // the SDK's longest wait between attempts, outlasts the proxy, so the member
  // sees a gateway error while the charge carries on behind it.
  it('ends every attempt and its retries inside the proxy window', () => {
    const client = new Stripe('sk_test_synthetic2', { ...STRIPE_CLIENT_OPTIONS });
    const retryDelayMs = client.getMaxNetworkRetryDelay() * 1000;
    const { timeout, maxNetworkRetries } = STRIPE_CLIENT_OPTIONS;
    const worstCaseMs = timeout * (1 + maxNetworkRetries) + retryDelayMs * maxNetworkRetries;
    expect(worstCaseMs).toBeLessThan(proxyReadTimeoutMs());
  });

  // Defect caught: an adapter that builds a Stripe client without the shared
  // options, which nothing at run time would notice until Stripe stalls.
  it('is passed by every Stripe client an adapter constructs', () => {
    // The webhook module's client only verifies and signs payloads locally and
    // never calls Stripe, so there is nothing for a limit to end.
    const NO_NETWORK = new Set(['stripeWebhook.ts']);
    let total = 0;
    for (const file of listFiles('src/adapters', /\.ts$/)) {
      if (NO_NETWORK.has(file)) continue;
      const src = readFileSync(join(REPO_ROOT, 'src/adapters', file), 'utf-8');
      const constructed = [...src.matchAll(/new Stripe\(/g)].length;
      const limited = [...src.matchAll(/new Stripe\([^,]+,\s*\{\s*\.\.\.STRIPE_CLIENT_OPTIONS\s*\}\)/g)].length;
      expect(limited, `${file}: ${constructed} Stripe client(s) built, ${limited} with the shared options`).toBe(constructed);
      total += constructed;
    }
    expect(total, 'no Stripe client construction found under src/adapters').toBeGreaterThan(0);
    // An exemption outliving its file would excuse whatever takes the name next.
    for (const file of NO_NETWORK) {
      const src = readFileSync(join(REPO_ROOT, 'src/adapters', file), 'utf-8');
      expect(src, `${file} is exempt but builds no Stripe client`).toMatch(/new Stripe\(/);
    }
  });
});
