import { describe, it, expect } from 'vitest';
import { redactTokenPaths } from '../../src/lib/redactTokenPaths';

// Contract: the debug-level request logger must not capture single-use
// tokens from /verify/:token or /password/reset/:token URLs. A leaked
// debug log would otherwise let a reader replay the token and take over
// the associated account or password change.

describe('redactTokenPaths', () => {
  it('strips the token segment from /verify/:token', () => {
    expect(redactTokenPaths('/verify/abc123')).toBe('/verify/[redacted]');
  });

  it('strips the token segment from /password/reset/:token', () => {
    expect(redactTokenPaths('/password/reset/xyz789')).toBe('/password/reset/[redacted]');
  });

  it('preserves the query string after the redacted token', () => {
    expect(redactTokenPaths('/verify/abc123?from=email')).toBe('/verify/[redacted]?from=email');
    expect(redactTokenPaths('/password/reset/xyz789?next=/members'))
      .toBe('/password/reset/[redacted]?next=/members');
  });

  it('preserves the fragment after the redacted token', () => {
    expect(redactTokenPaths('/verify/abc123#intro')).toBe('/verify/[redacted]#intro');
  });

  it('leaves paths without a token segment untouched', () => {
    expect(redactTokenPaths('/')).toBe('/');
    expect(redactTokenPaths('/members/foo')).toBe('/members/foo');
    expect(redactTokenPaths('/verify')).toBe('/verify');
    expect(redactTokenPaths('/verify/')).toBe('/verify/');
    expect(redactTokenPaths('/password/reset')).toBe('/password/reset');
  });

  it('does not redact token-like segments on unrelated paths', () => {
    expect(redactTokenPaths('/members/verify/abc123')).toBe('/members/verify/abc123');
    expect(redactTokenPaths('/history/password/reset/xyz789'))
      .toBe('/history/password/reset/xyz789');
  });

  it('does not touch subsequent path segments under /verify or /password/reset', () => {
    // Only the single-segment :token is redacted; any trailing path is kept.
    expect(redactTokenPaths('/verify/abc123/extra')).toBe('/verify/[redacted]/extra');
  });

  it('handles URL-encoded and unicode token bytes', () => {
    expect(redactTokenPaths('/verify/%E2%9C%93abc')).toBe('/verify/[redacted]');
    expect(redactTokenPaths('/password/reset/tok%C3%A9n')).toBe('/password/reset/[redacted]');
  });
});
