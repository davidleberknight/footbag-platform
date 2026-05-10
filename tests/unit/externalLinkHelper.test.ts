import { describe, it, expect } from 'vitest';
import Handlebars from 'handlebars';
import { externalLinkHelper } from '../../src/web/helpers/externalLink';

function render(url: unknown, hash: Record<string, unknown> = {}): string {
  const result = externalLinkHelper(url, { hash } as any);
  return result instanceof Handlebars.SafeString
    ? result.toString()
    : String(result);
}

describe('externalLinkHelper', () => {
  it('renders all DD §3.17 attributes for a basic URL', () => {
    const html = render('https://example.com/');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
    expect(html).toContain('title="https://example.com/"');
    expect(html).toContain('class="external-link"');
  });

  it('uses the URL as label when no label kwarg is given', () => {
    const html = render('https://example.com/');
    expect(html).toContain('>https://example.com/<');
  });

  it('honors the label kwarg', () => {
    const html = render('https://example.com/', { label: 'Event Website' });
    expect(html).toContain('>Event Website<');
    expect(html).not.toMatch(/>https:\/\/example\.com\/<\/a>/);
  });

  it('appends the class kwarg alongside the default external-link class', () => {
    const html = render('https://example.com/', { class: 'btn btn-outline event-external-link' });
    expect(html).toContain('class="external-link btn btn-outline event-external-link"');
  });

  it('includes an inline SVG icon with aria-hidden', () => {
    const html = render('https://example.com/');
    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="external-link-icon"');
  });

  it('escapes URL with quotes (XSS in href and title)', () => {
    const html = render('https://example.com/"><script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;');
  });

  it('escapes label kwarg', () => {
    const html = render('https://example.com/', { label: '<script>x</script>' });
    expect(html).not.toMatch(/<script>x<\/script>/);
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes class kwarg', () => {
    const html = render('https://example.com/', { class: 'foo" onclick="alert(1)' });
    expect(html).not.toContain('onclick="alert(1)"');
    expect(html).toContain('&quot;');
  });

  it('returns empty string for null URL', () => {
    expect(render(null)).toBe('');
  });

  it('returns empty string for undefined URL', () => {
    expect(render(undefined)).toBe('');
  });

  it('returns empty string for empty / whitespace URL', () => {
    expect(render('')).toBe('');
    expect(render('   ')).toBe('');
  });

  it('returns empty string for non-string URL', () => {
    expect(render(123 as unknown)).toBe('');
    expect(render({} as unknown)).toBe('');
  });

  it('falls back to URL when label kwarg is empty', () => {
    const html = render('https://example.com/', { label: '   ' });
    expect(html).toContain('>https://example.com/<');
  });

  it('suppresses the trailing icon when noIcon=true', () => {
    const html = render('https://example.com/', { noIcon: true });
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('external-link-icon');
    // Anchor and safe attrs still present.
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });

  it('keeps the icon when noIcon is omitted, false, or not a boolean true', () => {
    expect(render('https://example.com/')).toContain('<svg');
    expect(render('https://example.com/', { noIcon: false })).toContain('<svg');
    expect(render('https://example.com/', { noIcon: 'true' as unknown as boolean })).toContain('<svg');
  });

  it('returns a Handlebars SafeString so the template does not double-escape', () => {
    const result = externalLinkHelper('https://example.com/', { hash: {} } as any);
    expect(result).toBeInstanceOf(Handlebars.SafeString);
  });
});
