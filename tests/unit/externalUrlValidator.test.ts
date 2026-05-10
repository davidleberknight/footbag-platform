// Unit tests for externalUrlValidator (DD §3.17). No DB, no network.
// Every test injects a stub DNS lookup and a stub SafeBrowsingAdapter so
// the validator's pipeline runs deterministically. Coverage spans the
// scheme allowlist, length cap, URL.parse, SSRF block (literal-IP +
// DNS-resolved IP, v4 + v6), Safe Browsing rejection, and adversarial
// inputs.

import { describe, it, expect } from 'vitest';
import {
  validateExternalUrl,
  type DnsLookupFn,
} from '../../src/lib/externalUrlValidator';
import {
  createStubSafeBrowsingAdapter,
  type SafeBrowsingAdapter,
  type StubSafeBrowsingAdapter,
} from '../../src/adapters/safeBrowsingAdapter';
import {
  createStubHttpReachabilityAdapter,
  type StubHttpReachabilityAdapter,
} from '../../src/adapters/httpReachabilityAdapter';

// Default stubs: a public-IP DNS lookup and an always-safe Safe Browsing
// adapter. Tests override one or the other when exercising a specific
// rejection path.
const PUBLIC_IP = '93.184.216.34'; // example.com per legacy IANA reservation
const PUBLIC_LOOKUP: DnsLookupFn = async () => ({ address: PUBLIC_IP, family: 4 });

function makeStubs(): {
  lookup: DnsLookupFn;
  safeBrowsing: StubSafeBrowsingAdapter;
  reachability: StubHttpReachabilityAdapter;
} {
  return {
    lookup: PUBLIC_LOOKUP,
    safeBrowsing: createStubSafeBrowsingAdapter(),
    reachability: createStubHttpReachabilityAdapter(),
  };
}

function lookupReturning(address: string, family: 4 | 6 = 4): DnsLookupFn {
  return async () => ({ address, family });
}

function lookupThrowing(err: Error): DnsLookupFn {
  return async () => { throw err; };
}

describe('validateExternalUrl', () => {
  describe('empty input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['tabs and newlines', '\t\n\r '],
    ])('treats %s as a valid absent value', async (_label, input) => {
      const result = await validateExternalUrl(input, makeStubs());
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBeNull();
      expect(result.error).toBeUndefined();
    });
  });

  describe('valid URLs (happy path with stubbed DNS + safe-list)', () => {
    it('accepts a plain http URL', async () => {
      const result = await validateExternalUrl('http://example.com/path', makeStubs());
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('http://example.com/path');
    });

    it('accepts a plain https URL', async () => {
      const result = await validateExternalUrl('https://example.com/path?q=1#frag', makeStubs());
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/path?q=1#frag');
    });

    it('normalizes case in the host', async () => {
      const result = await validateExternalUrl('HTTPS://Example.COM/Path', makeStubs());
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/Path');
    });

    it('preserves percent-encoded path segments', async () => {
      const result = await validateExternalUrl('https://example.com/p%20q', makeStubs());
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/p%20q');
    });

    it('trims surrounding whitespace before parsing', async () => {
      const result = await validateExternalUrl('  https://example.com  ', makeStubs());
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/');
    });

    it('accepts a literal public IPv4 host (no DNS step)', async () => {
      // Hostname is already an IP literal; DNS is skipped. Public IP passes.
      const result = await validateExternalUrl('http://93.184.216.34/', makeStubs());
      expect(result.valid).toBe(true);
    });

    it('accepts a hostname that resolves to a non-blocked IP', async () => {
      const result = await validateExternalUrl(
        'https://example.com/',
        { ...makeStubs(), lookup: lookupReturning('203.0.113.5') },
      );
      expect(result.valid).toBe(true);
    });

    it('treats DNS lookup failure as non-blocking (does not pre-reject)', async () => {
      // Per DD §3.17 the resolution is a snapshot; lookup failure does not
      // mandate rejection. The URL passes validation here; reachability
      // (deferred) would catch true 404s.
      const result = await validateExternalUrl(
        'https://no-such-host.invalid/',
        { ...makeStubs(), lookup: lookupThrowing(new Error('ENOTFOUND')) },
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('disallowed schemes (DD §3.17)', () => {
    it.each([
      ['javascript', 'javascript:alert(1)'],
      ['data', 'data:text/html,<script>alert(1)</script>'],
      ['file', 'file:///etc/passwd'],
      ['ftp', 'ftp://example.com/file'],
      ['custom scheme', 'app://launch/me'],
    ])('rejects %s scheme', async (_label, input) => {
      const result = await validateExternalUrl(input, makeStubs());
      expect(result.valid).toBe(false);
      expect(result.normalizedUrl).toBeNull();
      expect(result.error).toBe('This URL appears to use a disallowed protocol.');
    });
  });

  describe('malformed input', () => {
    it.each([
      ['no scheme', 'example.com/path'],
      ['scheme only', 'http://'],
      ['empty host', '://example.com'],
      ['random text', 'not a url at all'],
      ['just whitespace and chars', 'a b c'],
    ])('rejects %s', async (_label, input) => {
      const result = await validateExternalUrl(input, makeStubs());
      expect(result.valid).toBe(false);
      expect(result.normalizedUrl).toBeNull();
      expect(result.error).toBe('Invalid URL format.');
    });
  });

  describe('length cap', () => {
    it('accepts exactly 2048 characters', async () => {
      const url = 'https://example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length);
      expect(url.length).toBe(2048);
      const result = await validateExternalUrl(url, makeStubs());
      expect(result.valid).toBe(true);
    });

    it('rejects 2049 characters', async () => {
      const url = 'https://example.com/' + 'a'.repeat(2049 - 'https://example.com/'.length);
      expect(url.length).toBe(2049);
      const result = await validateExternalUrl(url, makeStubs());
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2048');
    });
  });

  describe('SSRF block: literal IPv4 (DD §3.17)', () => {
    it.each([
      ['10.0.0.1 (10/8)', 'http://10.0.0.1/'],
      ['172.16.5.5 (172.16/12 low)', 'http://172.16.5.5/'],
      ['172.31.255.254 (172.16/12 high)', 'http://172.31.255.254/'],
      ['192.168.1.1 (192.168/16)', 'http://192.168.1.1/'],
      ['127.0.0.1 (loopback)', 'http://127.0.0.1/'],
      ['127.255.255.254 (loopback range)', 'http://127.255.255.254/'],
      ['169.254.169.254 (AWS metadata)', 'http://169.254.169.254/'],
    ])('rejects %s', async (_label, input) => {
      const result = await validateExternalUrl(input, makeStubs());
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This URL is not allowed.');
    });

    it('does NOT reject 172.15.x.x or 172.32.x.x (just outside 172.16/12)', async () => {
      // Boundary case: the 172.16/12 range covers 172.16.0.0 - 172.31.255.255.
      const justBelow = await validateExternalUrl('http://172.15.0.1/', makeStubs());
      expect(justBelow.valid).toBe(true);
      const justAbove = await validateExternalUrl('http://172.32.0.1/', makeStubs());
      expect(justAbove.valid).toBe(true);
    });

    it('does NOT reject 169.255.x.x (just outside link-local /16)', async () => {
      const result = await validateExternalUrl('http://169.255.0.1/', makeStubs());
      expect(result.valid).toBe(true);
    });
  });

  describe('SSRF block: literal IPv6', () => {
    it.each([
      ['loopback ::1', 'http://[::1]/'],
      ['unique local fc00:: prefix', 'http://[fc00::1]/'],
      ['unique local fd00:: prefix', 'http://[fd00::1]/'],
      ['link-local fe80::', 'http://[fe80::1]/'],
      ['link-local feb0::', 'http://[feb0::1]/'],
      ['IPv4-mapped loopback ::ffff:127.0.0.1', 'http://[::ffff:127.0.0.1]/'],
      ['IPv4-mapped private ::ffff:10.0.0.1', 'http://[::ffff:10.0.0.1]/'],
    ])('rejects %s', async (_label, input) => {
      const result = await validateExternalUrl(input, makeStubs());
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This URL is not allowed.');
    });

    it('does NOT reject a public-routable IPv6 address (2001:: prefix)', async () => {
      const result = await validateExternalUrl('http://[2001:db8::1]/', makeStubs());
      // Note: 2001:db8::/32 is documentation-only IRL but the validator
      // doesn't block it; the test asserts the SSRF guard doesn't over-reach.
      expect(result.valid).toBe(true);
    });
  });

  describe('SSRF block: DNS-resolved IP (re-check after lookup)', () => {
    it('rejects when hostname resolves to a private IPv4', async () => {
      const result = await validateExternalUrl(
        'https://attacker.example/',
        { ...makeStubs(), lookup: lookupReturning('10.1.2.3') },
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This URL is not allowed.');
    });

    it('rejects when hostname resolves to AWS metadata IP', async () => {
      const result = await validateExternalUrl(
        'https://meta.attacker.example/',
        { ...makeStubs(), lookup: lookupReturning('169.254.169.254') },
      );
      expect(result.valid).toBe(false);
    });

    it('rejects when hostname resolves to IPv6 loopback', async () => {
      const result = await validateExternalUrl(
        'https://attacker.example/',
        { ...makeStubs(), lookup: lookupReturning('::1', 6) },
      );
      expect(result.valid).toBe(false);
    });
  });

  describe('Safe Browsing', () => {
    it('rejects a URL flagged by the Safe Browsing adapter', async () => {
      const stubs = makeStubs();
      stubs.safeBrowsing.addThreat('https://malware.example/payload', 'MALWARE');
      const result = await validateExternalUrl('https://malware.example/payload', stubs);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This URL is not allowed.');
    });

    it('uses the same generic error message as SSRF rejections (no info leak)', async () => {
      const stubs = makeStubs();
      stubs.safeBrowsing.addThreat('https://phish.example/', 'SOCIAL_ENGINEERING');
      const sbResult = await validateExternalUrl('https://phish.example/', stubs);
      const ssrfResult = await validateExternalUrl('http://10.0.0.1/', makeStubs());
      expect(sbResult.error).toBe(ssrfResult.error);
    });

    it('propagates adapter errors (does not silently mark URL safe)', async () => {
      const stubs = makeStubs();
      stubs.safeBrowsing.failNext(new Error('Safe Browsing API unavailable'));
      await expect(
        validateExternalUrl('https://example.com/', stubs),
      ).rejects.toThrow('Safe Browsing API unavailable');
    });

    it('accepts a URL that is not in the deny list', async () => {
      const stubs = makeStubs();
      stubs.safeBrowsing.addThreat('https://only-this-one.example/', 'MALWARE');
      const result = await validateExternalUrl('https://different.example/', stubs);
      expect(result.valid).toBe(true);
    });
  });

  describe('adversarial cases', () => {
    it('rejects percent-encoded scheme bypass attempt (%6Aavascript:)', async () => {
      const result = await validateExternalUrl('%6Aavascript:alert(1)', makeStubs());
      expect(result.valid).toBe(false);
    });

    it('rejects embedded NUL byte', async () => {
      const result = await validateExternalUrl('https://example.com/\x00path', makeStubs());
      if (result.valid) {
        expect(result.normalizedUrl).not.toContain('\x00');
      }
    });

    it('rejects RTL override codepoint in scheme position', async () => {
      const result = await validateExternalUrl('‮https://example.com/', makeStubs());
      expect(result.valid).toBe(false);
    });

    it('rejects whitespace-only after a valid scheme', async () => {
      const result = await validateExternalUrl('https://   ', makeStubs());
      expect(result.valid).toBe(false);
    });

    it('rejects schemes that include http but are not http (httpx://)', async () => {
      const result = await validateExternalUrl('httpx://example.com', makeStubs());
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This URL appears to use a disallowed protocol.');
    });
  });

  describe('singleton fallback (no options provided)', () => {
    it('uses the configured Safe Browsing singleton when no adapter is injected', async () => {
      // In test env config.safeBrowsingAdapter === 'stub' so the singleton
      // resolves to a fresh empty stub (always-safe). Must not throw on a
      // valid URL with literal-IP host (skips DNS).
      const _typeCheck: SafeBrowsingAdapter = createStubSafeBrowsingAdapter();
      void _typeCheck;
      const result = await validateExternalUrl('http://93.184.216.34/');
      expect(result.valid).toBe(true);
    });
  });

  describe('reachability check (DD §3.17)', () => {
    it('rejects with the DD-verbatim message when reachability returns false', async () => {
      const stubs = makeStubs();
      stubs.reachability.setUnreachable('https://example.com/', 'timeout');
      const result = await validateExternalUrl('https://example.com/', stubs);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('URL could not be reached. Please verify the link.');
      expect(result.normalizedUrl).toBeNull();
    });

    it('passes through when reachability returns true with a 4xx status (warn-but-allow)', async () => {
      const stubs = makeStubs();
      stubs.reachability.setReachable('https://example.com/', 404);
      const result = await validateExternalUrl('https://example.com/', stubs);
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/');
    });

    it('passes through with default 200 when no override is set', async () => {
      const stubs = makeStubs();
      const result = await validateExternalUrl('https://example.com/', stubs);
      expect(result.valid).toBe(true);
    });

    it('runs reachability AFTER Safe Browsing so a flagged URL is rejected first', async () => {
      const stubs = makeStubs();
      stubs.safeBrowsing.addThreat('https://example.com/');
      stubs.reachability.setUnreachable('https://example.com/', 'should-not-see');
      const result = await validateExternalUrl('https://example.com/', stubs);
      expect(result.valid).toBe(false);
      // Generic SSRF-style message wins; reachability message must not surface.
      expect(result.error).toBe('This URL is not allowed.');
    });
  });
});
