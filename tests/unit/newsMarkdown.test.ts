/**
 * The news renderer turns a pasted Markdown body into the HTML a news page
 * shows. Each case names what a reader would meet if the renderer broke: a
 * script or event handler running from a post, a link to a script address, an
 * image or table where posts carry text only, a second top-level heading, or
 * ordinary Markdown not formatted at all.
 */
import { describe, it, expect } from 'vitest';
import { escapeNewsMarkdown, newsExcerpt, newsMarkdownToPlainText, renderNewsMarkdown } from '../../src/lib/newsMarkdown';

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

describe('newsMarkdownToPlainText: the words a reader sees, on one line', () => {
  // Defect: a list entry's excerpt or a page's description shows Markdown
  // syntax, a link's address, or markup instead of the words.
  it('drops the syntax and keeps the words of every construct', () => {
    const text = newsMarkdownToPlainText(
      '## Results\n\n**Bold** and *em* and `code`.\n\n- one\n- two\n\n> quoted\n\n[the site](/events) ![a kick](/x.png)',
    );
    expect(text).toBe('Results Bold and em and code. one two quoted the site a kick');
  });

  // Defect: raw HTML a member typed reaches a description as markup.
  it('keeps raw HTML as the literal text typed, never as markup to render', () => {
    expect(newsMarkdownToPlainText('Hello <b>there</b>')).toBe('Hello <b>there</b>');
  });

  // Defect: an empty body yields stray whitespace for the excerpt.
  it('is empty for an empty body', () => {
    expect(newsMarkdownToPlainText('')).toBe('');
    expect(newsMarkdownToPlainText('\n\n   \n')).toBe('');
  });
});

describe('escapeNewsMarkdown: text typed elsewhere renders as typed', () => {
  // An event title carrying every construct an organizer could slip into an
  // automatic item's body: emphasis, raw HTML, a Markdown link, bare web and
  // mail addresses, a heading marker, a list marker, code and an entity.
  const TYPED = '# **Big** _Jam_ <b>x</b> [go](https://evil.example) www.evil.example http://evil.example a@b.example 1. `c` &lt; ~~s~~ |t|';

  // Defect: an organizer's title becomes a link, a heading, emphasis or markup
  // in a news post the platform publishes in IFPA's voice.
  it('renders the typed text as one plain paragraph with no element but the paragraph', () => {
    const html = news(`Before ${escapeNewsMarkdown(TYPED)} after.`);
    expect(tagNames(html)).toEqual(['p', 'p']);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('&amp;lt;');
  });

  // Defect: a list entry's excerpt shows the escaping backslashes instead of the title.
  it('leaves the plain-text form the text exactly as typed', () => {
    expect(newsMarkdownToPlainText(`Before ${escapeNewsMarkdown(TYPED)} after.`)).toBe(`Before ${TYPED} after.`);
  });

  // Defect: a line break in a title starts a new block, which Markdown may read as a heading.
  it('keeps the text on one line, so it cannot open a block of its own', () => {
    const html = news(escapeNewsMarkdown('Jam\n\n# Heading\n- item'));
    expect(tagNames(html)).toEqual(['p', 'p']);
  });

  // Defect: ordinary text is changed, so a title shows differently in the news than on its event.
  it('changes nothing in text with no Markdown punctuation', () => {
    expect(escapeNewsMarkdown('Portland Spring Footbag Jam')).toBe('Portland Spring Footbag Jam');
  });
});

describe('newsExcerpt: the opening of a body, cut at a word', () => {
  // Defect: a short body is cut or ellipsised when it already fits.
  it('returns a body that fits whole', () => {
    expect(newsExcerpt('A short *post*.', 20)).toBe('A short post.');
  });

  // Defect: a long excerpt runs past the limit, or cuts a word in half.
  it('cuts a long body at the last word boundary within the limit and closes it with an ellipsis', () => {
    expect(newsExcerpt('one two three four five', 12)).toBe('one two…');
    expect(newsExcerpt('one two, three', 9)).toBe('one two…');
  });

  // Defect: a body of exactly the limit is cut although it fits.
  it('keeps a body exactly at the limit', () => {
    expect(newsExcerpt('abcde fghij', 11)).toBe('abcde fghij');
  });

  // Defect: a limit counted in UTF-16 units splits an emoji or accented letter.
  it('counts characters, not code units', () => {
    expect(newsExcerpt('😀😀😀 ok', 6)).toBe('😀😀😀 ok');
  });
});
