/**
 * The news renderer turns a pasted Markdown body into the HTML a news page
 * shows. Each case names what a reader would meet if the renderer broke: a
 * script or event handler running from a post, a link to a script address, an
 * image or table where posts carry text only, a second top-level heading, or
 * ordinary Markdown not formatted at all.
 */
import { describe, it, expect } from 'vitest';
import { renderNewsMarkdown } from '../../src/lib/newsMarkdown';

const news = (md: string): string => renderNewsMarkdown(md, { memberAuthored: false });
const community = (md: string): string => renderNewsMarkdown(md, { memberAuthored: true });

// Every tag name an output contains, so a case can hold the whole output to
// the allowlist rather than look for one known-bad tag.
function tagNames(html: string): string[] {
  return [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());
}

const ALLOWED = new Set([
  'p', 'br', 'strong', 'em', 'del', 'a', 'ul', 'ol', 'li', 'blockquote',
  'code', 'pre', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
]);

describe('renderNewsMarkdown: Markdown is formatted', () => {
  // Defect: the body reaches the page as raw Markdown, asterisks and hashes showing.
  it('renders emphasis, lists, quotes, code and links', () => {
    const html = news('## Results\n\n**Bold** and *em*.\n\n- one\n- two\n\n> quoted\n\n```\nx = 1\n```\n\n[site](/events)');
    expect(html).toContain('<h2>Results</h2>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<em>em</em>');
    expect(html).toMatch(/<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<pre><code>x = 1');
    expect(html).toContain('<a href="/events" rel="noopener noreferrer">site</a>');
  });

  // Defect: a pasted nested list renders flat.
  it('renders a nested list', () => {
    expect(news('- a\n  - b')).toMatch(/<li>a\s*<ul>\s*<li>b<\/li>/);
  });

  // Defect: a post's level-1 heading competes with the page title's.
  it('renders a level-1 heading as level 2', () => {
    const html = news('# Big news');
    expect(html).toContain('<h2>Big news</h2>');
    expect(tagNames(html)).not.toContain('h1');
  });
});

describe('renderNewsMarkdown: nothing executable comes out', () => {
  const hostile: Array<[string, string]> = [
    ['a block script', '<script>alert(1)</script>'],
    ['an inline script', 'Hello <script>alert(1)</script> there'],
    ['an event handler', '<img src=x onerror=alert(1)>'],
    ['an iframe', '<iframe src="https://example.com"></iframe>'],
    ['a styled div', '<div style="position:fixed">x</div>'],
    ['an svg', '<svg onload=alert(1)></svg>'],
  ];

  // Defect: raw HTML in a post becomes live markup on the page.
  it.each(hostile)('shows %s as the text typed', (_name, md) => {
    for (const html of [news(md), community(md)]) {
      expect(tagNames(html).filter((t) => !ALLOWED.has(t)), html).toEqual([]);
      expect(html).toContain('&lt;');
      expect(html).not.toMatch(/<(script|img|iframe|div|svg)\b/i);
    }
  });

  const badLinks: Array<[string, string]> = [
    ['a javascript link', '[x](javascript:alert(1))'],
    ['a mixed-case javascript link', '[x](JaVaScRiPt:alert(1))'],
    ['an entity-encoded javascript link', '[x](&#106;avascript:alert(1))'],
    ['a data link', '[x](data:text/html,<script>alert(1)</script>)'],
    ['a vbscript link', '[x](vbscript:msgbox)'],
    ['a protocol-relative link', '[x](//evil.example)'],
    ['a backslash protocol-relative link', '[x](/\\evil.example)'],
    ['a mail link', '[x](mailto:someone@example.com)'],
  ];

  // Defect: a post links to a script or an off-site address that looks like a site path.
  it.each(badLinks)('renders %s as text with no link', (_name, md) => {
    const html = news(md);
    expect(tagNames(html)).not.toContain('a');
    expect(html).toContain('x');
  });

  // Defect: a link title closes its quote and injects an event-handler attribute.
  it('renders a titled link with only its address and rel', () => {
    const html = news('[x](https://example.com "a\\" onmouseover=\\"alert(1)")');
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">x</a>');
    expect(html).not.toContain('onmouseover');
  });

  // Defect: an image appears in a text-only post, or its address is fetched.
  it('renders an image as its alt text', () => {
    const html = news('![a kick](https://example.com/k.png)');
    expect(tagNames(html)).not.toContain('img');
    expect(html).toContain('a kick');
    expect(html).not.toContain('example.com');
  });

  // Defect: a table appears in a text-only post.
  it('renders a table as its source text', () => {
    const html = news('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(tagNames(html).filter((t) => t.startsWith('t'))).toEqual([]);
    expect(html).toContain('| a | b |');
  });

  // Defect: a task list puts form inputs into a post.
  it('renders a task-list box as text', () => {
    const html = news('- [x] done\n- [ ] todo');
    expect(tagNames(html)).not.toContain('input');
    expect(html).toContain('[x] done');
    expect(html).toContain('[ ] todo');
  });
});

describe('renderNewsMarkdown: link marking', () => {
  // Defect: an administrator's web link loses the site's opener protection,
  // or a member's link is passed search credit as if IFPA endorsed it.
  it('marks a member\'s links as user content and an administrator\'s not', () => {
    const md = '[shop](https://example.com/shop)';
    expect(news(md)).toContain('<a href="https://example.com/shop" rel="noopener noreferrer">shop</a>');
    expect(community(md)).toContain('<a href="https://example.com/shop" rel="ugc nofollow noopener noreferrer">shop</a>');
  });

  // Defect: a bare web address is left unlinked, or a bare email address becomes a mail link.
  it('links a bare web address but not a bare email address', () => {
    const html = news('See https://example.com or write to someone@example.com');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).not.toContain('mailto:');
  });
});
