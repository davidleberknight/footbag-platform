/**
 * The link helper every service-shaped href renders through: it keeps a site
 * address readable as written, stops a value closing the attribute, and refuses
 * an address that could run script or leave the site's own paths.
 */
import { describe, it, expect } from 'vitest';
import Handlebars from 'handlebars';
import { siteHrefHelper } from '../../src/web/helpers/siteHref';

const render = (value: unknown): string => String(siteHrefHelper(value));

/** The page as Handlebars would draw it, so the helper is judged in its real place. */
function inAnchor(value: unknown): string {
  const hbs = Handlebars.create();
  hbs.registerHelper('siteHref', siteHrefHelper);
  return hbs.compile('<a href="{{siteHref v}}">x</a>')({ v: value });
}

describe('siteHref helper', () => {
  // Defect caught: a link the site builds reaches the page altered, so a test
  // or a reader of the source sees a different address than the one served.
  it('leaves a site path with a query and a fragment as written', () => {
    expect(inAnchor('/freestyle/tricks?family=osis#top')).toBe('<a href="/freestyle/tricks?family=osis#top">x</a>');
  });

  // Defect caught: a quote in the value closes the attribute and what follows
  // becomes markup, which is script injection on the page.
  it('stops a value closing the attribute or opening markup', () => {
    const html = inAnchor('/x" onmouseover="alert(1)');
    expect(html).toBe('<a href="/x&quot; onmouseover=&quot;alert(1)">x</a>');
    expect(render("/x'<b>`")).toBe('/x&#x27;&lt;b&gt;&#x60;');
  });

  // Defect caught: an ampersand in a query printed bare, which the browser may
  // read as the start of a character reference.
  it('escapes an ampersand between query parameters', () => {
    expect(inAnchor('/media/browse?context=a&page=2')).toBe('<a href="/media/browse?context=a&amp;page=2">x</a>');
  });

  // Defect caught: a link that runs script on click, or that leaves the site
  // through a scheme-relative or backslash path, because escaping alone stops
  // neither.
  it('refuses a script scheme, a scheme-relative address and a backslash path', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', '//evil.example/', '/\\evil.example', 'mailto:a@b.example']) {
      expect(render(bad), bad).toBe('');
    }
  });

  // Defect caught: a legitimate in-page or absolute link refused, so a working
  // control renders pointing nowhere.
  it('accepts a fragment, a query on the current page and an http(s) link', () => {
    expect(render('#section-2')).toBe('#section-2');
    expect(render('?view=add')).toBe('?view=add');
    expect(render('https://www.youtube-nocookie.com/embed/abc')).toBe('https://www.youtube-nocookie.com/embed/abc');
  });

  // Defect caught: a missing link crashes the render or prints "undefined".
  it('renders nothing for a missing or empty value', () => {
    expect(render(undefined)).toBe('');
    expect(render(null)).toBe('');
    expect(render('   ')).toBe('');
  });
});
