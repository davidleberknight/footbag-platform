/**
 * Integration tests for the /legal public route.
 *
 * Covers:
 *   GET /legal — single page with Privacy, Terms, and Copyright sections
 *
 * Contract verified:
 *   - responds 200 to unauthenticated visitors
 *   - content includes anchors for #privacy, #terms, #copyright
 *   - includes the operator identity and contact email
 *   - includes Apache-2.0 source-code license reference
 *   - includes IFPA trademark notice and Hacky Sack descriptive-use notice
 *   - includes last-updated date
 *   - footer legal-link row is present on the page layout
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3090');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /legal', () => {
  it('returns 200 for unauthenticated visitors', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('renders the three anchored sections', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.text).toContain('id="privacy"');
    expect(res.text).toContain('id="terms"');
    expect(res.text).toContain('id="copyright"');
  });

  it('renders the section headings', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.text).toMatch(/>\s*Privacy\s*</);
    expect(res.text).toMatch(/>\s*Terms of Use\s*</);
    expect(res.text).toMatch(/>\s*Copyright &amp; Trademarks\s*</);
  });

  it('names the operator and contact email', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.text).toContain('David Leberknight');
    expect(res.text).toContain('admin@footbag.org');
  });

  it('references IFPA, California jurisdiction, and 501(c)(3) status', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.text).toContain('International Footbag Players Association Incorporated');
    expect(res.text).toContain('California');
    expect(res.text).toContain('501(c)(3)');
  });

  it('references the Apache-2.0 license and repository URL', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.text).toContain('Apache License 2.0');
    expect(res.text).toContain('github.com/davidleberknight/footbag-platform');
  });

  it('includes IFPA trademark notice and Hacky Sack descriptive-use notice', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.text).toContain('IFPA');
    expect(res.text).toMatch(/Hacky Sack/);
    expect(res.text).toMatch(/descriptive/i);
  });

  it('shows the last-updated date', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.text).toContain('2026-04-14');
  });

  it('includes the footer legal-links row on every layout', async () => {
    const app = createApp();
    const res = await request(app).get('/legal');
    expect(res.text).toContain('/legal#privacy');
    expect(res.text).toContain('/legal#terms');
    expect(res.text).toContain('/legal#copyright');
  });
});
