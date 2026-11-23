/**
 * The public blog: the current year's posts at /blog, an earlier year's at
 * /blog/year/:year, and each post's own page at /blog/:postId.
 *
 * The contract: a blog post is a member's own writing under their name.
 * Posts are listed newest first as dated cards carrying the author; the
 * author's name links to their profile only for a signed-in member, because
 * profiles are member-only. A hidden post and one whose publication time has
 * not come appear nowhere. The blog and the news feed never share an item:
 * no news item appears on the blog, and no blog post on any news surface. The
 * current year shows an empty state when it has no posts; another year with
 * none, a malformed year and a future year are not found; the current year's
 * own year address redirects to /blog.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { cachedGet } from '../fixtures/cachedGet';
import { completeOnboarding, createTestSessionJwt, insertMember, insertNewsItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('7501');

// The pages read the clock for the current year and for which posts have been
// published, so the suite runs at one fixed instant.
const NOW = new Date('2026-07-01T12:00:00.000Z');

const AUTHOR = 'blog-author';
const READER = 'blog-reader';

let createApp: Awaited<ReturnType<typeof importApp>>;
let page: (path: string) => Promise<request.Response>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  const db = createTestDb(dbPath);

  insertMember(db, { id: AUTHOR, slug: 'blog_author', display_name: 'Robin Writer' });
  completeOnboarding(db, AUTHOR);
  insertMember(db, { id: READER, slug: 'blog_reader', display_name: 'Lee Reader' });
  completeOnboarding(db, READER);

  insertNewsItem(db, { id: 'blog_a', published_at: '2026-06-20T09:00:00.000Z', news_type: 'blog_post', title: 'Blog A', body: 'My *own* view on kicking.', author_member_id: AUTHOR });
  insertNewsItem(db, { id: 'blog_b', published_at: '2026-06-25T09:00:00.000Z', news_type: 'blog_post', title: 'Blog B', author_member_id: AUTHOR });
  insertNewsItem(db, { id: 'blog_hidden', published_at: '2026-06-22T09:00:00.000Z', news_type: 'blog_post', title: 'Blog Hidden', author_member_id: AUTHOR, is_public: 0 });
  insertNewsItem(db, { id: 'blog_future', published_at: '2026-08-01T09:00:00.000Z', news_type: 'blog_post', title: 'Blog Future', author_member_id: AUTHOR });
  insertNewsItem(db, { id: 'blog_2024', published_at: '2024-03-01T09:00:00.000Z', news_type: 'blog_post', title: 'Blog Older', author_member_id: AUTHOR });
  insertNewsItem(db, { id: 'blog_2023_hidden', published_at: '2023-05-01T09:00:00.000Z', news_type: 'blog_post', title: 'Blog Hidden Older', author_member_id: AUTHOR, is_public: 0 });
  // News items in the same years: none belongs on the blog.
  insertNewsItem(db, { id: 'news_n', published_at: '2026-06-21T09:00:00.000Z', news_type: 'announcement', title: 'News N' });
  insertNewsItem(db, { id: 'news_c', published_at: '2026-06-23T09:00:00.000Z', news_type: 'community_post', title: 'Community C', author_member_id: AUTHOR });
  insertNewsItem(db, { id: 'news_2022', published_at: '2022-05-01T09:00:00.000Z', title: 'News Older' });
  db.close();

  createApp = await importApp();
  page = cachedGet(() => createApp());
});

afterAll(() => {
  vi.useRealTimers();
  cleanupTestDb(dbPath);
});

const memberCookie = (): string => `__Host-footbag_session=${createTestSessionJwt({ memberId: READER })}`;

function cards(html: string): string[] {
  const start = html.indexOf('id="blog-posts"');
  expect(start, 'blog card grid present').toBeGreaterThan(-1);
  return html.slice(start).split('<article class="card">').slice(1);
}

function postIds(html: string): string[] {
  return cards(html).map((c) => c.match(/class="card-link" href="\/blog\/([^"]+)"/)?.[1] ?? '');
}

describe('the blog landing page', () => {
  it('lists the current year\'s public blog posts newest first, and nothing else', async () => {
    const res = await page('/blog');
    expect(res.status).toBe(200);
    // ordering-is-the-contract: the story lists a year's posts newest first.
    expect(postIds(res.text)).toEqual(['blog_b', 'blog_a']);
    for (const id of ['blog_hidden', 'blog_future', 'news_n', 'news_c']) {
      expect(res.text, id).not.toContain(`/${id}"`);
    }
  });

  it('names each post\'s author, linked to the profile only for a signed-in member', async () => {
    const anonymous = await page('/blog');
    const card = cards(anonymous.text).find((c) => c.includes('href="/blog/blog_a"'))!;
    expect(card).toContain('Robin Writer');
    expect(card).not.toContain('/members/blog_author');

    const signedIn = await request(createApp()).get('/blog').set('Cookie', memberCookie());
    expect(signedIn.status).toBe(200);
    const memberCard = cards(signedIn.text).find((c) => c.includes('href="/blog/blog_a"'))!;
    expect(memberCard).toContain('href="/members/blog_author">Robin Writer</a>');
  });

  it('links back to the nearest earlier year holding public posts', async () => {
    const res = await page('/blog');
    expect(res.text).toContain('href="/blog/year/2024"');
    expect(res.text).not.toContain('href="/blog/year/2023"');
  });

  it('shows the empty state when the current year has no posts yet', async () => {
    vi.setSystemTime(new Date('2027-02-01T12:00:00.000Z'));
    try {
      const res = await request(createApp()).get('/blog');
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('id="blog-posts"');
      expect(res.text).toContain('class="empty-state"');
      expect(res.text).toContain('href="/blog/year/2026"');
    } finally {
      vi.setSystemTime(NOW);
    }
  });
});

describe('an earlier year\'s blog page', () => {
  it('lists that year\'s posts and links back to the blog', async () => {
    const res = await page('/blog/year/2024');
    expect(res.status).toBe(200);
    expect(postIds(res.text)).toEqual(['blog_2024']);
    expect(res.text).toContain('href="/blog"');
  });

  it('redirects the current year\'s address to the landing page', async () => {
    const res = await request(createApp()).get('/blog/year/2026');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/blog');
  });

  it('answers not found for a year holding only hidden posts or only news, a future year and a malformed one', async () => {
    for (const path of ['/blog/year/2023', '/blog/year/2022', '/blog/year/2030', '/blog/year/20x4']) {
      const res = await page(path);
      expect(res.status, path).toBe(404);
    }
  });
});

describe('a blog post\'s own page', () => {
  it('shows the post with its author and body, and links back to its year', async () => {
    const res = await page('/blog/blog_a');
    expect(res.status).toBe(200);
    const facts = res.text.slice(res.text.indexOf('id="blog-facts"'));
    expect(facts).toContain('Robin Writer');
    expect(facts).toContain('20 June 2026');
    expect(res.text).toContain('<em>own</em>');
    expect(res.text).toContain('href="/blog"');
    expect(res.text).not.toContain('/members/blog_author');
  });

  it('links the author to their profile for a signed-in member', async () => {
    const res = await request(createApp()).get('/blog/blog_a').set('Cookie', memberCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/members/blog_author">Robin Writer</a>');
  });

  it('links an earlier year\'s post back to that year', async () => {
    const res = await page('/blog/blog_2024');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/blog/year/2024"');
  });

  it('answers not found for a hidden post, a future post, an unknown id and a news item', async () => {
    for (const id of ['blog_hidden', 'blog_future', 'blog_no_such_post', 'news_n', 'news_c']) {
      const res = await page(`/blog/${id}`);
      expect(res.status, id).toBe(404);
    }
  });
});

describe('the blog and the news feed never share an item', () => {
  it('keeps every blog post off the news pages, the news item pages and the home page band', async () => {
    const news = await page('/news');
    expect(news.status).toBe(200);
    expect(news.text).toContain('/news/news_c"');
    const home = await page('/');
    expect(home.text).toContain('/news/news_c"');
    for (const id of ['blog_a', 'blog_b']) {
      expect(news.text, id).not.toContain(id);
      expect(home.text, id).not.toContain(id);
      expect((await page(`/news/${id}`)).status, id).toBe(404);
    }
    expect((await page('/news/year/2024')).status).toBe(404);
  });

  it('lists the public blog pages in the sitemap under the blog, never under the news', async () => {
    const res = await page('/sitemap.xml');
    expect(res.status).toBe(200);
    for (const path of ['/blog', '/blog/year/2024', '/blog/blog_a', '/blog/blog_2024']) {
      expect(res.text, path).toContain(`${path}</loc>`);
    }
    for (const path of ['/blog/year/2026', '/blog/year/2023', '/blog/blog_hidden', '/blog/blog_future', '/news/blog_a', '/blog/news_n']) {
      expect(res.text, path).not.toContain(`${path}</loc>`);
    }
  });
});
