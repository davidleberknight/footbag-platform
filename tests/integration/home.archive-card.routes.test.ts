/**
 * The Legacy Archive card on the home page renders only when a deployment
 * provides the archive base URL, and links to exactly that URL: the landing
 * page is the only archive URL the platform ever emits. This file boots with
 * ARCHIVE_URL set before the config singleton loads; the default-env absence
 * case lives with the other home-page assertions in app.routes.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3214');

process.env.ARCHIVE_URL = 'https://archive.example.test';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const cfg = await import('../../src/config/env');
  expect(cfg.config.archiveUrl).toBe('https://archive.example.test');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET / — Legacy Archive card when the archive URL is configured', () => {
  it('renders the card linking to the configured archive base URL', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<div class="card-title">Legacy Archive<\/div>/);
    expect(res.text).toContain('href="https://archive.example.test"');
  });

  it('emits no archive URL other than the landing page', async () => {
    const res = await request(createApp()).get('/');
    const occurrences = res.text.match(/https:\/\/archive\.example\.test[^"]*/g) ?? [];
    expect(occurrences.length).toBeGreaterThan(0);
    for (const url of occurrences) {
      expect(url).toBe('https://archive.example.test');
    }
  });
});
