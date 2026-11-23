/**
 * The home page band with nothing to show: with no public news item, the news
 * list says so in one line in place of its items and still ends in the link to
 * the news page.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertNewsItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('4993');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A hidden item only, so an empty news list is the filter's doing.
  insertNewsItem(db, { id: 'band_only_hidden', is_public: 0 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function region(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  expect(start, `region ${id} present`).toBeGreaterThan(-1);
  // The list ends in its full-page link, so the region runs to that link's end.
  const link = html.indexOf('class="btn btn-outline" href="/news"', start);
  expect(link, `region ${id} ends in its link`).toBeGreaterThan(start);
  return html.slice(start, html.indexOf('</p>', link));
}

describe('the home page news list with nothing to show', () => {
  it('shows the news list\'s one-line empty state and its full-page link', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    const list = region(res.text, 'home-news');
    expect(list).not.toContain('<article');
    expect(list.match(/<p class="empty-state">/g) ?? []).toHaveLength(1);
    expect(list).toContain('<a class="btn btn-outline" href="/news">');
  });
});
