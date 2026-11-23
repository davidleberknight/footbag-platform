/**
 * The posts a seeded persona has published: a member's approved announcement
 * as a Community post in the news feed or as a blog post, and a News item an
 * administrator persona wrote. Each is written as the real flow writes it, so
 * a dev or staging stack seeded with personas shows news of every kind on the
 * home page band and the news page, and a post on the blog, each with its
 * opening line as the snippet.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  seedPersona,
  personaAuthoredNewsId,
  personaPostNewsId,
  type PersonaSpec,
} from '../../src/testkit/personaFactory';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../../src/lib/personaGuards';

const { dbPath } = setTestEnv('4988');

function poster(slug: string, place: 'feed' | 'blog', subject: string, body: string, hoursAgo: number): PersonaSpec {
  return {
    slug, displayName: `Poster ${slug}`, tier: 'tier2',
    testingUsage: 'Seeded post check.', coverageNotes: ['published post'],
    publishedPost: { place, subject, body, publishedHoursAgo: hoursAgo },
  };
}

let db: BetterSqlite3.Database;
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  db = createTestDb(dbPath);
  seedPersona(db, poster('pp_feed', 'feed', 'Park Kick Moves', 'The weekly kick now meets by the lake.\n\nAll welcome.', 3));
  seedPersona(db, poster('pp_blog', 'blog', 'My Morning Kick', 'Ten minutes a day keeps my touch sharp.', 1));
  seedPersona(db, {
    slug: 'pp_admin', displayName: 'Poster Admin', tier: 'tier2', isAdmin: true,
    testingUsage: 'Seeded News item check.', coverageNotes: ['authored News item'],
    authoredNews: { title: 'Pages Ready', body: 'Members can now edit their own page.', publishedHoursAgo: 1 },
  });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('a seeded persona\'s published posts', () => {
  // Defect caught: a post with no author or no approved announcement behind it
  // is one the persona refresh cannot tear down, or one the blog cannot credit.
  it('records each post as the approval writes it: the member its author, its announcement approved and linked', () => {
    const feedMember = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}pp_feed`;
    const blogMember = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}pp_blog`;
    const adminMember = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}pp_admin`;
    const items = db.prepare(`
      SELECT id, news_type, author_member_id, is_public FROM news_items WHERE id IN (?, ?, ?)
    `).all(personaPostNewsId('pp_feed'), personaPostNewsId('pp_blog'), personaAuthoredNewsId('pp_admin')) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items.find((r) => r.id === personaPostNewsId('pp_feed')))
      .toMatchObject({ news_type: 'community_post', author_member_id: feedMember, is_public: 1 });
    expect(items.find((r) => r.id === personaPostNewsId('pp_blog')))
      .toMatchObject({ news_type: 'blog_post', author_member_id: blogMember, is_public: 1 });
    expect(items.find((r) => r.id === personaAuthoredNewsId('pp_admin')))
      .toMatchObject({ news_type: 'announcement', author_member_id: adminMember, is_public: 1 });

    const announcements = db.prepare(`
      SELECT member_id, status, publish_to, news_item_id FROM member_announcements WHERE member_id IN (?, ?)
    `).all(feedMember, blogMember) as Array<Record<string, unknown>>;
    expect(announcements).toHaveLength(2);
    expect(announcements.find((a) => a.member_id === feedMember))
      .toMatchObject({ status: 'approved', publish_to: 'feed', news_item_id: personaPostNewsId('pp_feed') });
    expect(announcements.find((a) => a.member_id === blogMember))
      .toMatchObject({ status: 'approved', publish_to: 'blog', news_item_id: personaPostNewsId('pp_blog') });
  });

  // Defect caught: a seeded stack's home band shows headlines with nothing
  // under them, or a blog post leaks into the news feed.
  it('shows the News item and the Community post on the home band with their opening lines, and the blog post only on the blog', async () => {
    const app = createApp();
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toContain(`href="/news/${personaAuthoredNewsId('pp_admin')}"`);
    expect(home.text).toContain('<p class="card-description">Members can now edit their own page.</p>');
    expect(home.text).toContain(`href="/news/${personaPostNewsId('pp_feed')}"`);
    expect(home.text).toContain('<p class="card-description">The weekly kick now meets by the lake. All welcome.</p>');
    expect(home.text).not.toContain(personaPostNewsId('pp_blog'));

    const blog = await request(app).get('/blog');
    expect(blog.status).toBe(200);
    expect(blog.text).toContain(`/blog/${personaPostNewsId('pp_blog')}"`);
    expect(blog.text).toContain('Ten minutes a day keeps my touch sharp.');
  });
});
