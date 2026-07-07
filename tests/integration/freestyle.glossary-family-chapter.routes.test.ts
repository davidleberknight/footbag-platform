/**
 * Integration tests for the Family Encyclopedia chapter on GET /freestyle/glossary.
 *
 * The Families section is the pilot for chapter-scale progressive disclosure: its
 * teaching prose ("what makes a family") stays visible, while the reference bulk
 * (edge cases, the roster, display tiers, other foundational atoms, family trees)
 * collapses into one large chapter <details>. This suite pins that structure:
 * the teaching lead renders outside the chapter, the reference content renders
 * inside it, and no content was dropped by the wrapping.
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

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Glossary — Family Encyclopedia chapter (pilot chapter disclosure)', () => {
  it('wraps the family reference bulk in a chapter details, keeping the teaching lead visible', async () => {
    const html = await glossary();

    const chapterAt   = html.indexOf('id="chapter-family-encyclopedia"');
    const teachingAt  = html.indexOf('What makes a family?');
    const edgeCasesAt = html.indexOf('id="edge-cases-special-structures"');
    const chapterEnd  = html.indexOf('glossary-section-next', chapterAt);

    // the chapter wrapper exists and is a details with a descriptive summary
    expect(chapterAt).toBeGreaterThan(-1);
    expect(html).toContain('class="glossary-chapter"');
    expect(html).toContain('class="glossary-chapter-summary-title"');

    // teaching lead stays OUTSIDE (before) the chapter
    expect(teachingAt).toBeGreaterThan(-1);
    expect(teachingAt).toBeLessThan(chapterAt);

    // reference bulk (edge cases, roster) lives INSIDE the chapter
    expect(edgeCasesAt).toBeGreaterThan(chapterAt);
    expect(edgeCasesAt).toBeLessThan(chapterEnd);
  });

  it('keeps all the family reference content present (nothing dropped by wrapping)', async () => {
    const html = await glossary();
    expect(html).toContain('id="edge-cases-special-structures"');
    expect(html).toContain('Other foundational atoms');
    expect(html).toContain('id="section-families"'); // the section element is preserved
  });
});
