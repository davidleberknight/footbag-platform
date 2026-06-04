/**
 * Trust-proxy contract: each host sets an exact integer X-Forwarded-For hop
 * count matching the proxy chain in front of the app (web <- nginx <-
 * CloudFront, plus the legacy front-door proxy while it carries the apex).
 * Only the exact count makes req.ip resolve to the real client, which per-IP
 * rate limiting keys on. An unset value falls back to named IP ranges, which
 * fail closed: req.ip resolves to the CloudFront edge address and rate
 * limiting coarsens to per-edge buckets.
 *
 * These tests pin three properties:
 *   1. With the correct hop count, req.ip is the real client even when the
 *      viewer prepends junk XFF entries (the walk starts at the server side).
 *   2. A named-range trust value stops at CloudFront's public edge address,
 *      so req.ip becomes the edge address and every visitor behind that edge
 *      shares one rate-limit bucket (the fallback's accepted degradation).
 *   3. A hop count larger than the real chain hands req.ip control to the
 *      viewer, which is why the count must drop when the legacy front-door
 *      hop retires.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

const CLIENT = '203.0.113.7';        // real visitor
const LEGACY_PROXY = '198.51.100.5'; // legacy front-door server (public)
const CF_EDGE = '198.51.100.99';     // CloudFront edge peer (public, rotates)
const VIEWER_JUNK = '192.0.2.66';    // attacker-supplied XFF prefix

function makeApp(trustProxy: number | boolean | string): express.Application {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.get('/whoami', (req, res) => {
    res.json({ ip: req.ip, ips: req.ips });
  });
  return app;
}

describe('integer hop-count trust (per-host production configuration)', () => {
  // Supertest's socket peer is loopback; it stands in for the nginx
  // container hop. XFF entries then supply the CloudFront edge and (when
  // present) legacy front-door hops, exactly as nginx forwards them.

  it('hop count 0 (dev default): XFF is ignored, req.ip is the peer', async () => {
    const app = makeApp(0);
    const res = await request(app).get('/whoami').set('X-Forwarded-For', CLIENT);
    expect(res.body.ip).toBe('::ffff:127.0.0.1');
    expect(res.body.ips).toEqual([]);
  });

  it('hop count 3 (legacy front door -> CloudFront -> nginx): req.ip is the real client', async () => {
    const app = makeApp(3);
    const res = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', `${CLIENT}, ${LEGACY_PROXY}, ${CF_EDGE}`);
    expect(res.body.ip).toBe(CLIENT);
  });

  it('hop count 2 (CloudFront -> nginx, post-handover/staging): req.ip is the real client', async () => {
    const app = makeApp(2);
    const res = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', `${CLIENT}, ${CF_EDGE}`);
    expect(res.body.ip).toBe(CLIENT);
  });

  it('viewer-prepended XFF junk is ignored when the count matches the chain', async () => {
    const app = makeApp(2);
    const res = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', `${VIEWER_JUNK}, ${CLIENT}, ${CF_EDGE}`);
    expect(res.body.ip).toBe(CLIENT);
  });

  it('a count larger than the real chain lets the viewer choose req.ip (the trap that forces the count down when a hop retires)', async () => {
    const app = makeApp(3);
    const res = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', `${VIEWER_JUNK}, ${CLIENT}, ${CF_EDGE}`);
    expect(res.body.ip).toBe(VIEWER_JUNK);
  });

  it('different clients produce different req.ip at the same hop count (per-IP throttle keys diverge)', async () => {
    const app = makeApp(3);
    const a = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', `203.0.113.10, ${LEGACY_PROXY}, ${CF_EDGE}`);
    const b = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', `203.0.113.11, ${LEGACY_PROXY}, ${CF_EDGE}`);
    expect(a.body.ip).toBe('203.0.113.10');
    expect(b.body.ip).toBe('203.0.113.11');
    expect(a.body.ip).not.toBe(b.body.ip);
  });
});

describe('named-range trust (the fail-closed fallback when no hop count is set)', () => {
  it('named ranges stop at the public CloudFront edge: every visitor shares one req.ip', async () => {
    const app = makeApp('loopback, linklocal, uniquelocal');
    const a = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', `203.0.113.10, ${LEGACY_PROXY}, ${CF_EDGE}`);
    const b = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', `203.0.113.11, ${LEGACY_PROXY}, ${CF_EDGE}`);
    // The walk trusts the loopback peer, reaches the public edge address,
    // and stops: both visitors collapse into the edge's rate-limit bucket.
    expect(a.body.ip).toBe(CF_EDGE);
    expect(b.body.ip).toBe(CF_EDGE);
  });

  it('trust = true (broaden-to-all regression): any peer may forge XFF', () => {
    const app = makeApp(true);
    const trust = app.get('trust proxy fn') as (addr: string, hop: number) => boolean;
    expect(trust('203.0.113.7', 0)).toBe(true);
  });
});

describe('req.protocol resolves from X-Forwarded-Proto when the peer is trusted', () => {
  // CloudFront strips X-Forwarded-Proto and substitutes
  // CloudFront-Forwarded-Proto; nginx maps it back to X-Forwarded-Proto for
  // upstream Express. When the peer is inside the trusted hop count,
  // req.protocol must resolve to 'https' so secure-cookie issuance takes
  // the production path.
  function makeProtocolApp(trustProxy: number | boolean | string): express.Application {
    const app = express();
    app.set('trust proxy', trustProxy);
    app.get('/probe', (req, res) => {
      res.json({ protocol: req.protocol, secure: req.secure });
    });
    return app;
  }

  it("trusted peer + X-Forwarded-Proto: https → req.protocol === 'https'", async () => {
    const app = makeProtocolApp(2);
    const res = await request(app).get('/probe').set('X-Forwarded-Proto', 'https');
    expect(res.body.protocol).toBe('https');
    expect(res.body.secure).toBe(true);
  });

  it("trust = 0: X-Forwarded-Proto is ignored, req.protocol === 'http'", async () => {
    const app = makeProtocolApp(0);
    const res = await request(app).get('/probe').set('X-Forwarded-Proto', 'https');
    expect(res.body.protocol).toBe('http');
    expect(res.body.secure).toBe(false);
  });

  it("trusted peer without X-Forwarded-Proto: req.protocol falls back to the socket scheme", async () => {
    const app = makeProtocolApp(2);
    const res = await request(app).get('/probe');
    expect(res.body.protocol).toBe('http');
  });
});
