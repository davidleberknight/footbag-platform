/**
 * Renders a news item's Markdown body to the HTML a news page shows.
 *
 * News bodies are Markdown an administrator or member pasted on the site, so
 * unlike the committed rules and governance documents they are not trusted.
 * The allowlist is met by construction, through this module's own `Marked`
 * instance (never the shared global the committed-document loaders use, whose
 * raw HTML must keep rendering):
 *
 * - Raw HTML, block or inline, renders escaped, as the literal text typed.
 * - A link renders only for an http or https address or a site path; any other
 *   address (a script, data or mail scheme, a protocol-relative address)
 *   renders as its text alone. A link's Markdown title is not rendered.
 *   Every link carries `noopener noreferrer`; a
 *   member's post adds `ugc nofollow`, Google's marking for user-generated
 *   links.
 * - Images render as their alt text and tables as their source text: posts
 *   carry text only.
 * - A level-1 heading renders as level 2, because the page's title is its one
 *   level-1 heading. A task-list checkbox renders as `[x]` or `[ ]` text.
 *
 * Every other construct is Markdown's own (paragraphs, emphasis, lists, block
 * quotes, code, rules), whose text marked escapes. The result is named into a
 * `*Html` view-model field by the caller.
 */
import { Marked, type Tokens } from 'marked';

export interface NewsMarkdownOptions {
  /** True for a Community post: a member's words, whose links are marked as user content. */
  memberAuthored: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// An absolute web address, or a path on this site. A second slash or a
// backslash after the first would make a protocol-relative address.
const ALLOWED_HREF = /^(?:https?:\/\/[^\s]+|\/(?![\/\\])[^\s]*)$/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!ALLOWED_HREF.test(trimmed)) return null;
  try {
    return encodeURI(trimmed).replace(/%25/g, '%');
  } catch {
    return null;
  }
}

function buildRenderer(memberAuthored: boolean): Marked {
  const rel = memberAuthored ? 'ugc nofollow noopener noreferrer' : 'noopener noreferrer';
  return new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      html({ text }: Tokens.HTML | Tokens.Tag): string {
        return escapeHtml(text);
      },
      // A link's Markdown title is dropped: a tooltip adds nothing to a text
      // post, and one attribute fewer is one less place for markup to hide.
      link({ href, tokens }: Tokens.Link): string {
        const inner = this.parser.parseInline(tokens);
        const target = safeHref(href);
        if (target === null) return inner;
        return `<a href="${escapeHtml(target)}" rel="${rel}">${inner}</a>`;
      },
      image({ text }: Tokens.Image): string {
        return escapeHtml(text);
      },
      heading({ tokens, depth }: Tokens.Heading): string {
        const level = Math.max(depth, 2);
        return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
      table({ raw }: Tokens.Table): string {
        return `<p>${escapeHtml(raw.trim())}</p>\n`;
      },
      checkbox({ checked }: Tokens.Checkbox): string {
        return checked ? '[x]' : '[ ]';
      },
    },
  });
}

const newsRenderer = buildRenderer(false);
const communityRenderer = buildRenderer(true);

export function renderNewsMarkdown(markdown: string, options: NewsMarkdownOptions): string {
  const renderer = options.memberAuthored ? communityRenderer : newsRenderer;
  return renderer.parse(markdown, { async: false }) as string;
}
