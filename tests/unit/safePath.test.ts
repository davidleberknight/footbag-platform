/**
 * The redirect-target guard accepts only a same-origin absolute path.
 *
 * Every refusal row is a way a request-supplied path can leave the site once
 * a browser reads it, whether as a redirect or as a link the page renders:
 * a scheme, a protocol-relative '//', a backslash some agents read as '/',
 * and a control character the browser strips while parsing a URL, which turns
 * '/<TAB>/evil.com' into '//evil.com'.
 */
import { describe, it, expect } from 'vitest';
import { isSafePath } from '../../src/lib/safePath';

describe('isSafePath', () => {
  it('accepts a clean same-origin path, query and fragment included', () => {
    for (const value of ['/', '/members/footbag_hacky/edit', '/clubs?country=united_states#map', '/ /x']) {
      expect(isSafePath(value), value).toBe(true);
    }
  });

  it('refuses anything that is not a string starting with a single slash', () => {
    for (const value of [undefined, null, 42, ['/a'], '', 'members', 'http://evil.com', '//evil.com/path']) {
      expect(isSafePath(value), String(value)).toBe(false);
    }
  });

  it('refuses a backslash, which some agents normalise to a slash', () => {
    expect(isSafePath('/\\evil.com')).toBe(false);
  });

  it('refuses every C0 control character and DEL, which browsers strip from a URL', () => {
    const refused: string[] = [];
    for (let code = 0; code <= 0x1f; code += 1) {
      const value = `/${String.fromCharCode(code)}/evil.com`;
      if (!isSafePath(value)) refused.push(value);
    }
    expect(refused).toHaveLength(0x20);
    expect(isSafePath('/\x7f/evil.com')).toBe(false);
  });

  it('accepts a percent-encoded tab, which the browser keeps as a literal path segment', () => {
    expect(isSafePath('/%09/evil.com')).toBe(true);
  });
});
