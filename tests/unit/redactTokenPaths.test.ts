import { describe, it, expect } from 'vitest';
import { redactTokenPaths } from '../../src/lib/redactTokenPaths';

// Contract: the debug-level request logger must not capture single-use
// tokens from any token-bearing route. A leaked debug log would otherwise
// let a reader replay the token and take over the associated account,
// password change, legacy-claim merge, or auto-link revert.

describe('redactTokenPaths', () => {
  it('strips the token segment from /verify/:token', () => {
    expect(redactTokenPaths('/verify/abc123')).toBe('/verify/[redacted]');
  });

  it('strips the token segment from /password/reset/:token', () => {
    expect(redactTokenPaths('/password/reset/xyz789')).toBe('/password/reset/[redacted]');
  });

  it('strips the token segment from /auto-link/report-incorrect/:token', () => {
    expect(redactTokenPaths('/auto-link/report-incorrect/abc123'))
      .toBe('/auto-link/report-incorrect/[redacted]');
  });

  it('strips the token segment from /register/wizard/legacy_claim/claim/confirm/:token', () => {
    expect(redactTokenPaths('/register/wizard/legacy_claim/claim/confirm/abc123'))
      .toBe('/register/wizard/legacy_claim/claim/confirm/[redacted]');
  });

  it('preserves the query string after the redacted token', () => {
    expect(redactTokenPaths('/verify/abc123?from=email')).toBe('/verify/[redacted]?from=email');
    expect(redactTokenPaths('/password/reset/xyz789?next=/members'))
      .toBe('/password/reset/[redacted]?next=/members');
    expect(redactTokenPaths('/auto-link/report-incorrect/abc123?src=email'))
      .toBe('/auto-link/report-incorrect/[redacted]?src=email');
    expect(redactTokenPaths('/register/wizard/legacy_claim/claim/confirm/abc123?from=email'))
      .toBe('/register/wizard/legacy_claim/claim/confirm/[redacted]?from=email');
  });

  it('preserves the fragment after the redacted token', () => {
    expect(redactTokenPaths('/verify/abc123#intro')).toBe('/verify/[redacted]#intro');
    expect(redactTokenPaths('/auto-link/report-incorrect/abc123#help'))
      .toBe('/auto-link/report-incorrect/[redacted]#help');
  });

  it('leaves paths without a token segment untouched', () => {
    expect(redactTokenPaths('/')).toBe('/');
    expect(redactTokenPaths('/members/foo')).toBe('/members/foo');
    expect(redactTokenPaths('/verify')).toBe('/verify');
    expect(redactTokenPaths('/verify/')).toBe('/verify/');
    expect(redactTokenPaths('/password/reset')).toBe('/password/reset');
    expect(redactTokenPaths('/auto-link/report-incorrect')).toBe('/auto-link/report-incorrect');
    expect(redactTokenPaths('/auto-link/report-incorrect/'))
      .toBe('/auto-link/report-incorrect/');
    expect(redactTokenPaths('/register/wizard/legacy_claim/claim/confirm'))
      .toBe('/register/wizard/legacy_claim/claim/confirm');
  });

  it('does not redact token-like segments on unrelated paths', () => {
    expect(redactTokenPaths('/members/verify/abc123')).toBe('/members/verify/abc123');
    expect(redactTokenPaths('/history/password/reset/xyz789'))
      .toBe('/history/password/reset/xyz789');
    expect(redactTokenPaths('/x/auto-link/report-incorrect/abc123'))
      .toBe('/x/auto-link/report-incorrect/abc123');
    expect(redactTokenPaths('/x/register/wizard/legacy_claim/claim/confirm/abc123'))
      .toBe('/x/register/wizard/legacy_claim/claim/confirm/abc123');
  });

  it('does not touch subsequent path segments under any token-bearing route', () => {
    // Only the single-segment :token is redacted; any trailing path is kept.
    expect(redactTokenPaths('/verify/abc123/extra')).toBe('/verify/[redacted]/extra');
    expect(redactTokenPaths('/auto-link/report-incorrect/abc123/extra'))
      .toBe('/auto-link/report-incorrect/[redacted]/extra');
  });

  it('handles URL-encoded and unicode token bytes', () => {
    expect(redactTokenPaths('/verify/%E2%9C%93abc')).toBe('/verify/[redacted]');
    expect(redactTokenPaths('/password/reset/tok%C3%A9n')).toBe('/password/reset/[redacted]');
    expect(redactTokenPaths('/auto-link/report-incorrect/%E2%9C%93abc'))
      .toBe('/auto-link/report-incorrect/[redacted]');
    expect(redactTokenPaths('/register/wizard/legacy_claim/claim/confirm/tok%C3%A9n'))
      .toBe('/register/wizard/legacy_claim/claim/confirm/[redacted]');
  });

  // Member-search query strings were logged verbatim, so a reader of
  // debug-level CloudWatch logs could observe who searched for whom; query
  // strings must be anonymized before persistence.
  describe('PII query-string redaction', () => {
    it('redacts q= as the first query parameter', () => {
      expect(redactTokenPaths('/members/alice?q=Jane'))
        .toBe('/members/alice?q=[redacted]');
    });

    it('redacts q= when preceded by another query parameter', () => {
      expect(redactTokenPaths('/members/alice?page=2&q=Jane+Smith'))
        .toBe('/members/alice?page=2&q=[redacted]');
    });

    it('preserves the parameter name and surrounding query string', () => {
      expect(redactTokenPaths('/members?q=Jane&page=2'))
        .toBe('/members?q=[redacted]&page=2');
    });

    it('redacts a URL-encoded q value', () => {
      expect(redactTokenPaths('/members?q=Jane%20Smith'))
        .toBe('/members?q=[redacted]');
    });

    it('leaves an empty q value redacted (the parameter is present)', () => {
      // Empty value is still a query-shape signal worth normalizing.
      expect(redactTokenPaths('/members?q=')).toBe('/members?q=[redacted]');
    });

    it('does not redact other query parameters that happen to share a prefix', () => {
      // Only `q=`, not `query=` or `qid=`.
      expect(redactTokenPaths('/members?query=Jane'))
        .toBe('/members?query=Jane');
      expect(redactTokenPaths('/members?qid=42'))
        .toBe('/members?qid=42');
    });

    it('redacts q= even on a token-bearing route after path redaction', () => {
      expect(redactTokenPaths('/verify/abc123?q=Jane'))
        .toBe('/verify/[redacted]?q=[redacted]');
    });

    it('leaves the fragment untouched after q= redaction', () => {
      expect(redactTokenPaths('/members?q=Jane#hash'))
        .toBe('/members?q=[redacted]#hash');
    });
  });
});
