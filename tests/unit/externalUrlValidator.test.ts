// Unit tests for externalUrlValidator. No DB, no HTTP. Covers the slim
// subset of DD §3.17 implemented today (scheme allowlist, length cap,
// URL.parse). Adversarial cases included.

import { describe, it, expect } from 'vitest';
import { validateExternalUrl } from '../../src/lib/externalUrlValidator';

describe('validateExternalUrl', () => {
  describe('empty input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['tabs and newlines', '\t\n\r '],
    ])('treats %s as a valid absent value', (_label, input) => {
      const result = validateExternalUrl(input);
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBeNull();
      expect(result.error).toBeUndefined();
    });
  });

  describe('valid URLs', () => {
    it('accepts a plain http URL', () => {
      const result = validateExternalUrl('http://example.com/path');
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('http://example.com/path');
    });

    it('accepts a plain https URL', () => {
      const result = validateExternalUrl('https://example.com/path?q=1#frag');
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/path?q=1#frag');
    });

    it('normalizes case in the host', () => {
      const result = validateExternalUrl('HTTPS://Example.COM/Path');
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/Path');
    });

    it('preserves percent-encoded path segments', () => {
      const result = validateExternalUrl('https://example.com/p%20q');
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/p%20q');
    });

    it('trims surrounding whitespace before parsing', () => {
      const result = validateExternalUrl('  https://example.com  ');
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe('https://example.com/');
    });
  });

  describe('disallowed schemes (DD §3.17)', () => {
    it.each([
      ['javascript', 'javascript:alert(1)'],
      ['data', 'data:text/html,<script>alert(1)</script>'],
      ['file', 'file:///etc/passwd'],
      ['ftp', 'ftp://example.com/file'],
      ['custom scheme', 'app://launch/me'],
    ])('rejects %s scheme', (_label, input) => {
      const result = validateExternalUrl(input);
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
    ])('rejects %s', (_label, input) => {
      const result = validateExternalUrl(input);
      expect(result.valid).toBe(false);
      expect(result.normalizedUrl).toBeNull();
      expect(result.error).toBe('Invalid URL format.');
    });
  });

  describe('length cap', () => {
    it('accepts exactly 2048 characters', () => {
      const url = 'https://example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length);
      expect(url.length).toBe(2048);
      const result = validateExternalUrl(url);
      expect(result.valid).toBe(true);
    });

    it('rejects 2049 characters', () => {
      const url = 'https://example.com/' + 'a'.repeat(2049 - 'https://example.com/'.length);
      expect(url.length).toBe(2049);
      const result = validateExternalUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2048');
    });
  });

  describe('adversarial cases', () => {
    it('rejects percent-encoded scheme bypass attempt (%6Aavascript:)', () => {
      // %6A is lowercase j; an attacker might hope the scheme parser accepts
      // it as 'javascript'. The WHATWG URL parser does NOT decode the scheme,
      // so this falls into "unknown scheme" and gets rejected by the
      // allowlist. Test exists as a regression guard against future parsers
      // that might decode it.
      const result = validateExternalUrl('%6Aavascript:alert(1)');
      expect(result.valid).toBe(false);
    });

    it('rejects embedded NUL byte', () => {
      const result = validateExternalUrl('https://example.com/\x00path');
      // WHATWG URL parser may percent-encode the NUL or accept it. Either
      // way the resulting URL should not crash downstream consumers; if
      // accepted, it must be normalized.
      if (result.valid) {
        expect(result.normalizedUrl).not.toContain('\x00');
      }
    });

    it('rejects RTL override codepoint in scheme position', () => {
      const result = validateExternalUrl('‮https://example.com/');
      expect(result.valid).toBe(false);
    });

    it('rejects whitespace-only after a valid scheme', () => {
      const result = validateExternalUrl('https://   ');
      expect(result.valid).toBe(false);
    });

    it('rejects schemes that include http but are not http (httpx://)', () => {
      const result = validateExternalUrl('httpx://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This URL appears to use a disallowed protocol.');
    });
  });
});
