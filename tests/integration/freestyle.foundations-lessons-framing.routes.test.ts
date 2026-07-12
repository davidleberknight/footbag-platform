/**
 * Integration tests pinning the foundations-versus-lessons framing distinction.
 *
 * "The 12 Foundations of Freestyle" is reserved for the twelve foundational
 * movements on the landing page. The six-page beginner learning path is called
 * "six beginner lessons", never "six foundations", so a newcomer never meets two
 * conflicting foundation counts on adjacent onboarding surfaces.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3566');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Freestyle onboarding — foundations vs lessons framing', () => {
  it('the landing page presents twelve Foundations for the twelve movements', async () => {
    const res = await request(await createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The 12 Foundations of Freestyle');
    expect(res.text).not.toMatch(/six foundations/i);
  });

  it('the learning path presents six beginner lessons, not foundations', async () => {
    const res = await request(await createApp()).get('/freestyle/learn');
    expect(res.status).toBe(200);
    expect(res.text).toContain('six beginner lessons');
    expect(res.text).not.toMatch(/six foundations/i);
  });

  it('no public onboarding copy calls the six-page path "six foundations"', async () => {
    for (const path of ['/freestyle', '/freestyle/learn', '/freestyle/tricks', '/freestyle/history']) {
      const res = await request(await createApp()).get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).not.toMatch(/six foundations/i);
    }
  });

  it('the trick index onboarding link starts newcomers with the six beginner lessons', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Start with six beginner lessons');
  });
});
