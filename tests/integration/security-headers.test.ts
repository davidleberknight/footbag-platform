/**
 * Security headers contract: helmet middleware applies defensive defaults to
 * every response, including a strict Content-Security-Policy that pins script
 * and style execution to the same origin and forbids inline handlers and
 * framing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3066');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Security headers (helmet defaults)', () => {
  it('public route carries the standard helmet headers', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=15552000/);
    expect(res.headers['strict-transport-security']).toMatch(/includeSubDomains/);
    expect(res.headers['strict-transport-security']).not.toMatch(/preload/);
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['origin-agent-cluster']).toBe('?1');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('Permissions-Policy denies unused device features outright', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    const policy = res.headers['permissions-policy'];
    expect(policy).toBeDefined();
    for (const feature of [
      'camera', 'microphone', 'geolocation', 'payment', 'usb', 'serial',
      'bluetooth', 'midi', 'display-capture', 'magnetometer',
    ]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it('Permissions-Policy delegates playback features to the embedded player origins', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    const policy = res.headers['permissions-policy'];
    // A nested context only receives what the parent document holds, so a
    // denial here would break the click-to-load video facade's iframes.
    for (const feature of [
      'autoplay', 'encrypted-media', 'picture-in-picture', 'fullscreen',
      'accelerometer', 'gyroscope',
    ]) {
      expect(policy).toContain(
        `${feature}=(self "https://www.youtube-nocookie.com" "https://player.vimeo.com")`,
      );
    }
  });

  it('Cross-Origin-Embedder-Policy stays unset so cross-origin players keep loading', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
  });

  it('CSP locks scripts, styles, framing, and external sources to the documented allowlist', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    const directives = [
      "default-src 'self'",
      "script-src 'self'",
      "script-src-attr 'none'",
      "style-src 'self'",
      "img-src 'self' data: https://i.ytimg.com",
      "font-src 'self'",
      "connect-src 'self' https://challenges.cloudflare.com",
      'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ];
    for (const directive of directives) {
      expect(csp).toContain(directive);
    }
    // No 'unsafe-inline' / 'unsafe-eval' anywhere.
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('CSP form-action permits the hosted checkout origin a payment redirects to', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    const csp = res.headers['content-security-policy'];
    // Donations and membership purchases are form POSTs answered with a 303
    // onto the payment provider's hosted page. Browsers apply form-action to
    // every hop of the redirect chain, not just the form's own action, so an
    // origin missing here blocks the navigation with no server-side error:
    // the member sees the form reload unchanged and nothing is logged. The
    // stub payment adapter redirects same-origin, so no suite that runs it
    // can observe this.
    expect(csp).toContain('https://checkout.stripe.com');
    expect(csp).toMatch(/form-action [^;]*https:\/\/checkout\.stripe\.com/);
  });

  it('health route also carries the helmet headers', async () => {
    const app = createApp();
    const res = await request(app).get('/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });
});
