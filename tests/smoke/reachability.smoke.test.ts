/**
 * HttpReachabilityAdapter live outbound-probe suite.
 *
 * Long-term, opt-in smoke suite. Every other test of this adapter injects a
 * fake fetch and a fake DNS lookup, which proves the adapter's own logic and
 * proves nothing about whether the real one works: an outbound HTTPS probe that
 * a network, a proxy or a DNS resolver quietly refuses looks identical to an
 * adapter that was never wired up. This is the leg that establishes the live
 * path runs, and it exists because the adapter became live in every deployed
 * environment under its own arming switch, which made the absence of any live
 * coverage a real gap rather than a theoretical one.
 *
 * What it does NOT do is reach the platform. The adapter's dependency is the
 * public internet, not a deployed host, so this runs the same code the host
 * runs and needs nothing deployed. Keeping it here rather than in the unit
 * suite is the point: it makes real outbound calls, which the default suite
 * must never do.
 *
 * Targets are chosen so nothing incidental is probed. example.com is IANA's
 * reserved documentation domain, maintained to be fetched by exactly this kind
 * of check, and is already the benign target the Safe Browsing smoke uses.
 * 192.0.2.1 is RFC 5737 TEST-NET-1, reserved for documentation and guaranteed
 * to be routed nowhere, so the unreachable case exercises a real timeout
 * without a third party noticing. 127.0.0.1 is the SSRF case and is refused
 * before any socket is opened.
 *
 * Failure modes:
 *   - example.com unreachable: outbound HTTPS from this machine is blocked, or
 *     DNS cannot resolve. On a host this means the reachability check rejects
 *     every link a member submits, which reads to them as "your URL is wrong".
 *   - The TEST-NET address reported reachable: the adapter is not the live one
 *     (a stub or the disabled implementation returns reachable unconditionally),
 *     or something upstream is answering for an address that must not be routed.
 *   - The loopback address reported reachable: the per-hop SSRF guard is not
 *     running, which is the serious one — it is what stops a submitted link
 *     from being used to probe the host's own private network.
 *
 * Run with: npm run test:smoke (gated behind RUN_STAGING_SMOKE=1).
 * Excluded from the default `npm test` suite via the test:smoke script's scope.
 */
import { describe, it, expect } from 'vitest';
import { createLiveHttpReachabilityAdapter } from '../../src/adapters/httpReachabilityAdapter';

const RUN = process.env.RUN_STAGING_SMOKE === '1';

// The adapter's own budget is 10s for all redirect hops together. Each case is
// given more than that, so a timeout here is the adapter deciding rather than
// vitest interrupting it: the two look the same in the output and mean opposite
// things about whether the code under test worked.
const CASE_TIMEOUT_MS = 20_000;

describe.skipIf(!RUN)('HttpReachabilityAdapter live outbound probe', () => {
  it('reports a real, reachable host as reachable', async () => {
    const adapter = createLiveHttpReachabilityAdapter();
    const result = await adapter.check('https://example.com/');
    expect(result.reachable).toBe(true);
    // The status is asserted loosely on purpose. The contract is "the host
    // answered", and the adapter treats a 4xx or 5xx as answered-but-warned,
    // so pinning 200 would fail on a documentation domain returning a redirect
    // or a maintenance page without anything being wrong.
    expect(result.status).toBeGreaterThanOrEqual(200);
  }, CASE_TIMEOUT_MS);

  it('reports an address that is routed nowhere as unreachable', async () => {
    const adapter = createLiveHttpReachabilityAdapter();
    const result = await adapter.check('http://192.0.2.1/');
    expect(result.reachable).toBe(false);
    expect(result.error).toBeTruthy();
  }, CASE_TIMEOUT_MS);

  it('refuses a loopback address without opening a connection', async () => {
    // Distinct from the case above: that one fails because nothing answers,
    // this one must fail because the adapter refuses to ask. A live adapter
    // that lost its SSRF guard would still pass the previous test.
    const adapter = createLiveHttpReachabilityAdapter();
    const result = await adapter.check('http://127.0.0.1/');
    expect(result.reachable).toBe(false);
  }, CASE_TIMEOUT_MS);
});
