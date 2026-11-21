/**
 * The news service's core: automatic items, one per source entity however
 * often the emitting flow runs; an entity's items removed with it; the rules
 * an authored item must meet; and how an item is shaped for display, its label
 * set by whose voice it is and a byline only on a member's Community post.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertEvent, insertNewsItem, insertMemberAnnouncement } from '../fixtures/factories';
import { ValidationError } from '../../src/services/serviceErrors';

const { dbPath } = setTestEnv('4748');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let newsMod: typeof import('../../src/services/newsService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');
let db: BetterSqlite3.Database;

const NOW = '2026-11-19T12:00:00.000Z';
const MEMBER_ID = 'member-news-author';

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: 'news_author', display_name: 'Pat Kicker' });
  newsMod = await import('../../src/services/newsService');
  dbMod = await import('../../src/db/db');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function countFor(entityId: string): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM news_items WHERE entity_id = ?').get(entityId) as { n: number }).n;
}

function emit(entityId: string, newsType: 'event_published' | 'event_results' = 'event_published', title = 'Open event') {
  return newsMod.newsService.emitAutomaticItem({
    newsType, entityType: 'event', entityId, title, body: '',
    publishedAt: NOW, actorId: 'system', nowIso: NOW,
  });
}

describe('emitAutomaticItem', () => {
  // Defect: a flow that runs twice (results uploaded again, an event
  // re-approved) puts two items about one event on the feed.
  it('leaves one item when the same flow emits twice, and returns that item both times', () => {
    const eventId = insertEvent(db, {});
    const first = emit(eventId);
    const second = emit(eventId, 'event_published', 'A changed title');
    expect(first.status).toBe('created');
    expect(second).toEqual({ status: 'already_held', newsItemId: first.newsItemId });
    expect(countFor(eventId)).toBe(1);
    const row = db.prepare('SELECT title, author_member_id, is_public FROM news_items WHERE id = ?')
      .get(first.newsItemId) as { title: string; author_member_id: string | null; is_public: number };
    expect(row).toEqual({ title: 'Open event', author_member_id: null, is_public: 1 });
  });

  // Defect: the one-per-entity rule is applied across types, so an event's
  // results item is refused because its opening item exists.
  it('keeps one item of each type for one event', () => {
    const eventId = insertEvent(db, {});
    expect(emit(eventId, 'event_published').status).toBe('created');
    expect(emit(eventId, 'event_results').status).toBe('created');
    expect(countFor(eventId)).toBe(2);
  });

  // Defect: the uniqueness reaches authored items, so an administrator's
  // second post about an event is refused or swallowed.
  it('lets authored posts about one event stand beside its automatic item', () => {
    const eventId = insertEvent(db, {});
    emit(eventId);
    insertNewsItem(db, { news_type: 'announcement', entity_type: 'event', entity_id: eventId });
    insertNewsItem(db, { news_type: 'announcement', entity_type: 'event', entity_id: eventId });
    expect(countFor(eventId)).toBe(3);
  });
});

describe('deleteItemsForEntity', () => {
  // Defect: a deleted event's items stay on the feed, or another event's go with it.
  it('deletes every item about the entity and only those', () => {
    const doomed = insertEvent(db, {});
    const kept = insertEvent(db, {});
    emit(doomed, 'event_published');
    emit(doomed, 'event_results');
    insertNewsItem(db, { entity_type: 'event', entity_id: doomed });
    emit(kept);
    expect(newsMod.newsService.deleteItemsForEntity('event', doomed)).toBe(3);
    expect(countFor(doomed)).toBe(0);
    expect(countFor(kept)).toBe(1);
  });
});

describe('the schema', () => {
  // Defect: a member's approved post cannot be stored as a Community post.
  it('stores a Community post with its author and links it from its announcement', () => {
    const postId = insertNewsItem(db, { news_type: 'community_post', author_member_id: MEMBER_ID });
    const annId = insertMemberAnnouncement(db, {
      member_id: MEMBER_ID, status: 'approved', publish_to: 'both', news_item_id: postId,
    });
    const row = db.prepare('SELECT publish_to, news_item_id FROM member_announcements WHERE id = ?')
      .get(annId) as { publish_to: string; news_item_id: string };
    expect(row).toEqual({ publish_to: 'both', news_item_id: postId });
  });

  // Defect: one announcement produces two Community posts.
  it('refuses a second announcement pointing at the same post', () => {
    const postId = insertNewsItem(db, { news_type: 'community_post', author_member_id: MEMBER_ID });
    insertMemberAnnouncement(db, { member_id: MEMBER_ID, status: 'approved', news_item_id: postId });
    expect(() => insertMemberAnnouncement(db, {
      member_id: MEMBER_ID, status: 'approved', news_item_id: postId,
    })).toThrow(/UNIQUE/);
  });

  // Defect: deleting a post is blocked by its announcement, or leaves the
  // announcement pointing at a post that no longer exists.
  it('clears the announcement\'s link when its post is deleted', () => {
    const postId = insertNewsItem(db, { news_type: 'community_post', author_member_id: MEMBER_ID });
    const annId = insertMemberAnnouncement(db, { member_id: MEMBER_ID, status: 'approved', news_item_id: postId });
    db.prepare('DELETE FROM news_items WHERE id = ?').run(postId);
    const row = db.prepare('SELECT news_item_id FROM member_announcements WHERE id = ?').get(annId) as { news_item_id: string | null };
    expect(row.news_item_id).toBeNull();
  });

  // Defect: an announcement records a place the form never offers.
  it('refuses a place other than the list, the feed or both', () => {
    // factory-cannot-express: the overrides are typed to the three valid places.
    expect(() => db.prepare(`
      INSERT INTO member_announcements (id, created_at, created_by, updated_at, updated_by,
        member_id, submit_token, subject, body_text, publish_to)
      VALUES ('mann-bad-place', ?, 'test', ?, 'test', ?, 'tok-bad-place', 's', 'b', 'nowhere')
    `).run(NOW, NOW, MEMBER_ID)).toThrow(/CHECK/);
  });

  // Defect: an announcement the current form submits, which names no place,
  // goes nowhere instead of to the list as before.
  it('defaults an announcement\'s place to the list', () => {
    const annId = 'mann-default-place';
    dbMod.memberAnnouncements.insert.run(
      annId, NOW, MEMBER_ID, NOW, MEMBER_ID, MEMBER_ID, 'tok-default-place',
      'Subject', 'Body', null,
    );
    const row = db.prepare('SELECT publish_to FROM member_announcements WHERE id = ?').get(annId) as { publish_to: string };
    expect(row.publish_to).toBe('list');
  });
});

describe('validateAuthoredInput', () => {
  type Input = { title: unknown; body: unknown; publishedAt?: unknown };
  const v = (input: Input) => newsMod.newsService.validateAuthoredInput(input, NOW);

  function fieldErrorsOf(input: Input): Record<string, string> {
    try {
      v(input);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      return (err as ValidationError).fieldErrors ?? {};
    }
    throw new Error('expected a refusal');
  }

  // Defect: a 200-character title the story allows is refused, or a longer one stored.
  it('accepts a 200-character title and refuses 201', () => {
    expect(v({ title: 'a'.repeat(200), body: 'b' }).title).toHaveLength(200);
    expect(Object.keys(fieldErrorsOf({ title: 'a'.repeat(201), body: 'b' }))).toEqual(['title']);
  });

  // Defect: a title of emoji counts its UTF-16 halves, refusing a title the writer sees as short enough.
  it('counts characters, not code units', () => {
    expect(v({ title: '⚽'.repeat(200), body: 'b' }).title).toBe('⚽'.repeat(200));
  });

  // Defect: an empty or markup-only title, or a whitespace-only body, is stored.
  it('requires a title and a body, naming each field', () => {
    expect(Object.keys(fieldErrorsOf({ title: '<b></b>', body: ' \n ' })).sort()).toEqual(['body', 'title']);
    expect(Object.keys(fieldErrorsOf({ title: 5, body: null })).sort()).toEqual(['body', 'title']);
  });

  // Defect: the body loses its Markdown indentation, or its raw text, before storage.
  it('stores the body as pasted Markdown, indentation kept, and cleans the title', () => {
    const out = v({ title: '  Big   <i>news</i> ', body: '- a\n  - b\n\n<b>as typed</b>' });
    expect(out.title).toBe('Big news');
    expect(out.body).toBe('- a\n  - b\n\n<b>as typed</b>');
  });

  // Defect: an item with no date is never published, or a bad date is stored.
  it('defaults the publication date to now and normalises a given one', () => {
    expect(v({ title: 't', body: 'b' }).publishedAt).toBe(NOW);
    expect(v({ title: 't', body: 'b', publishedAt: '2027-01-02T03:04:05Z' }).publishedAt).toBe('2027-01-02T03:04:05.000Z');
    expect(Object.keys(fieldErrorsOf({ title: 't', body: 'b', publishedAt: 'next tuesday' }))).toEqual(['publishedAt']);
  });
});

describe('shapeNewsItem', () => {
  const row = (newsType: 'announcement' | 'community_post' | 'event_published') => ({
    id: 'news_x', news_type: newsType, title: 'T', body: '[link](https://example.com)',
    published_at: NOW, author_display_name: 'Pat Kicker', author_slug: 'news_author',
  });

  // Defect: a Community post is shown as IFPA's voice, or an administrator's
  // or automatic item carries a personal byline.
  it('labels by voice and gives a byline only to a Community post', () => {
    const community = newsMod.newsService.shapeNewsItem(row('community_post'));
    expect(community.label).toBe('Community');
    expect(community.byline).toEqual({ displayName: 'Pat Kicker', profileHref: '/members/news_author' });
    for (const t of ['announcement', 'event_published'] as const) {
      const shaped = newsMod.newsService.shapeNewsItem(row(t));
      expect(shaped.label, t).toBe('News');
      expect(shaped.byline, t).toBeNull();
    }
  });

  // Defect: a member's links are rendered as IFPA's own, or an administrator's as user content.
  it('renders the body with the link marking of its voice', () => {
    expect(newsMod.newsService.shapeNewsItem(row('community_post')).bodyHtml).toContain('rel="ugc nofollow noopener noreferrer"');
    expect(newsMod.newsService.shapeNewsItem(row('announcement')).bodyHtml).toContain('rel="noopener noreferrer"');
    expect(newsMod.newsService.shapeNewsItem(row('announcement')).bodyHtml).not.toContain('ugc');
  });
});
