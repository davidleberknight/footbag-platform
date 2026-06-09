/**
 * Integration tests for the /freestyle landing destination cards.
 *
 * Contract: the Trick Dictionary and Trick Records cards render only when
 * the underlying data exists. With an empty database the cards are omitted
 * entirely; the landing page never shows a dead "Coming soon" card.
 * The populated case (cards present with their links) is covered by the
 * portal route tests, which seed tricks and records.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3993');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle with no tricks or records loaded', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
  });

  it('omits the gated Trick Dictionary and Trick Records tiles entirely', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('>Trick Dictionary<');
    expect(res.text).not.toContain('>Trick Records<');
  });

  it('renders the History timeline items as coming-soon placeholders', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Coming soon');
    expect(res.text).toContain('History Timeline');
  });

  it('still renders the always-available banner destinations', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('href="/freestyle/glossary"');
    expect(res.text).toContain('href="/freestyle/competition"');
  });
});
