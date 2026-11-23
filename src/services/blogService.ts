/**
 * BlogService -- the public blog: members' own writing, each post under its
 * author's name.
 *
 * Owns:
 *   - The public blog pages, for any visitor:
 *       - `/blog`, the current UTC year's posts, with an empty state when it
 *         has none; `/blog/year/:year`, another year's posts, which exists only
 *         while that year holds posts. Posts are listed newest first, each as a
 *         dated item card (date, headline, the author on the meta line,
 *         excerpt). The year navigation links only to years holding posts, the
 *         current year by its landing address.
 *       - `/blog/:postId`, one post's page: its author and date, the body, and
 *         the back link to the post's year.
 *   - The author's attribution: the display name for every viewer, linked to
 *     the author's profile only for a member viewer, because profiles are
 *     member-only (a registrant still onboarding is shaped as a visitor).
 *
 * Visibility invariant: a hidden post and a post whose publication time has
 *   not arrived appear on no blog surface; such a post's own page is not
 *   found. One filter in the statement layer applies it to every blog read, and
 *   the news reads exclude blog posts, so a post appears on the blog alone.
 *
 * Does not own:
 *   - Writing a post: a member's announcement approved with the blog among its
 *     places creates it (broadcast service), under the news service's
 *     authored-item rules.
 *   - Hiding, restoring and deleting a post (admin news service).
 *
 * Persistence: `news_items` (the public blog reads, `news_type = 'blog_post'`),
 *   reading the author through `members_onboarded`.
 * Side effects: none.
 */
import { newsItems } from '../db/db';
import { newsExcerpt, renderNewsMarkdown } from '../lib/newsMarkdown';
import type { DatedItemView } from '../types/datedItem';
import type { PageViewModel } from '../types/page';
import { getAdjacentArchiveYears } from './eventListing';
import { newsDateText, newsYearOf } from './newsService';
import { NotFoundError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';

/** Who is reading: a member sees the author's name as a link to their profile. */
export interface BlogViewer {
  isMember: boolean;
}

/** A public blog read's row: the post and its author. */
interface PublicBlogPostRow {
  id: string;
  title: string;
  body: string;
  published_at: string;
  author_display_name: string;
  author_slug: string;
}

/** The current year's page and each other year's page: one year's posts, newest first. */
export interface BlogYearContent {
  year: number;
  items: DatedItemView[];
}

/** One post's own page. */
export interface BlogPostContent {
  dateText: string;
  bodyHtml: string;
  author: { name: string; profileHref: string | null };
}

/** The address of a year's posts: the current year's is the blog landing page. */
function blogYearHref(year: number, currentYear: number): string {
  return year === currentYear ? '/blog' : `/blog/year/${year}`;
}

function authorOf(row: PublicBlogPostRow, viewer: BlogViewer): BlogPostContent['author'] {
  return {
    name: row.author_display_name,
    profileHref: viewer.isMember ? `/members/${row.author_slug}` : null,
  };
}

function toBlogDatedItem(row: PublicBlogPostRow, viewer: BlogViewer): DatedItemView {
  const author = authorOf(row, viewer);
  const excerpt = newsExcerpt(row.body);
  return {
    date: newsDateText(row.published_at),
    title: row.title,
    href: `/blog/${row.id}`,
    label: null,
    meta: [author.profileHref ? { text: author.name, href: author.profileHref } : { text: author.name }],
    excerpt: excerpt === '' ? null : excerpt,
    image: null,
  };
}

export const blogService = {
  /** The year whose posts the landing page shows: the current UTC year. */
  currentBlogYear(nowIso: string): number {
    return newsYearOf(nowIso);
  },

  /**
   * A year's blog page: the current year's at `/blog`, which shows an empty
   * state when it has no posts, or another year's, which exists only while it
   * holds posts. The year navigation links only to years holding posts.
   */
  getBlogYearPage(year: number, nowIso: string, viewer: BlogViewer): PageViewModel<BlogYearContent> {
    const currentYear = newsYearOf(nowIso);
    if (!Number.isInteger(year) || year < 1000 || year > currentYear) {
      throw new NotFoundError('No blog posts for that year.');
    }
    return runSqliteRead('getBlogYearPage', () => {
      const rows = newsItems.listPublicBlogByYear.all(nowIso, String(year)) as PublicBlogPostRow[];
      const isCurrent = year === currentYear;
      if (rows.length === 0 && !isCurrent) throw new NotFoundError('No blog posts for that year.');

      const yearsHoldingPosts = (newsItems.listPublicBlogYears.all(nowIso) as Array<{ year: number }>)
        .map((r) => r.year);
      const navYears = yearsHoldingPosts.includes(year) ? yearsHoldingPosts : [...yearsHoldingPosts, year];
      const { previousYear, nextYear } = getAdjacentArchiveYears(navYears, year);

      return {
        seo: isCurrent
          ? { title: 'Blog', description: 'Members\' own writing about footbag.' }
          : { title: `${year} Blog`, description: `Members' own writing about footbag in ${year}.` },
        page: isCurrent
          ? {
            sectionKey: 'blog',
            pageKey: 'blog_index',
            title: 'Footbag Blog',
            intro: 'Opinions and commentary from the footbag community.',
          }
          : {
            sectionKey: 'blog',
            pageKey: 'blog_year',
            title: `Footbag Blog From ${year}`,
            intro: 'Opinions and commentary from the footbag community.',
          },
        navigation: {
          siblings: {
            previous: previousYear !== null
              ? { label: String(previousYear), href: blogYearHref(previousYear, currentYear) } : undefined,
            next: nextYear !== null
              ? { label: String(nextYear), href: blogYearHref(nextYear, currentYear) } : undefined,
          },
          ...(isCurrent ? {} : { contextLinks: [{ label: 'Back to Footbag Blog', href: '/blog' }] }),
        },
        content: { year, items: rows.map((row) => toBlogDatedItem(row, viewer)) },
      };
    });
  },

  /** One post's own page: its author and date, the body, and the link back to its year. */
  getBlogPostPage(postId: string, nowIso: string, viewer: BlogViewer): PageViewModel<BlogPostContent> {
    return runSqliteRead('getBlogPostPage', () => {
      const row = newsItems.getPublicBlogById.get(postId, nowIso) as PublicBlogPostRow | undefined;
      if (!row) throw new NotFoundError('Blog post not found.');
      const currentYear = newsYearOf(nowIso);
      const postYear = newsYearOf(row.published_at);
      const description = newsExcerpt(row.body);
      return {
        seo: { title: row.title, ...(description !== '' ? { description } : {}) },
        page: { sectionKey: 'blog', pageKey: 'blog_post', title: row.title },
        navigation: {
          contextLinks: [postYear === currentYear
            ? { label: 'Back to Footbag Blog', href: '/blog' }
            : { label: `Back to Footbag Blog From ${postYear}`, href: `/blog/year/${postYear}` }],
        },
        content: {
          dateText: newsDateText(row.published_at),
          // A member's words: their links carry the user-content relation.
          bodyHtml: renderNewsMarkdown(row.body, { memberAuthored: true }),
          author: authorOf(row, viewer),
        },
      };
    });
  },
};
