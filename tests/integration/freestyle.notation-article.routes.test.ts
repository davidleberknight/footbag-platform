import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3419');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Jobs notation article page', () => {
  it('serves Ben Job\'s article verbatim with the historical attribution', async () => {
    const res = await request(createApp()).get('/freestyle/notation-article');
    expect(res.status).toBe(200);
    expect(res.text).toContain('By the Way, Not the Name');
    expect(res.text).toContain('A List By the Way');
    expect(res.text).toContain('Benjamin Job');
    expect(res.text).toContain('Source: Ben Job');
  });

  it('reproduces the article without the footbag.org page chrome', async () => {
    const res = await request(createApp()).get('/freestyle/notation-article');
    // Site navigation, copyright, and implementation credits surrounding the
    // archived copy are page chrome, not the article, and must not appear.
    expect(res.text).not.toContain('Website implementation by');
  });
});

describe('Glossary Jobs-notation section — source-location prose removed', () => {
  const glossary = async () => (await request(createApp()).get('/freestyle/glossary')).text;

  it('links to the article page and keeps only the historical citation', async () => {
    const html = await glossary();
    expect(html).toContain('href="/freestyle/notation-article"');
    expect(html).toContain('To See the Entire Article, Press Here.');
    expect(html).toContain('Source: Ben Job');
  });

  it('no longer prints the source-link or reproduction-location prose', async () => {
    const html = await glossary();
    expect(html).not.toContain('Read Ben Job');
    expect(html).not.toContain('reproduced under');
  });
});
