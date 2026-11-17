/**
 * Integration tests for the Community Standards page and the texts that point at it.
 *
 * Covers:
 *   GET /community-standards — one public page holding the standards
 *   GET /legal — the Terms of Use make the standards part of the terms
 *
 * Contract verified:
 *   - the page is public and renders the same standards for a visitor and a member
 *   - every section and the rights paragraph carry the anchor other pages deep-link to
 *   - the enforcement scale renders as a numbered list of four steps
 *   - visitors are given a working mail link to report a problem
 *   - the Terms, the copyright notice and the email promise link to the page, and each
 *     link lands on an anchor the page actually has
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, completeOnboarding, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const MEMBER_ID = 'cs-member-1';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: 'cs_member_1' });
  completeOnboarding(db, MEMBER_ID);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The page's own content: everything inside <main>, so the signed-in header does not differ. */
function mainHtml(html: string): string {
  const start = html.indexOf('<main');
  const end = html.indexOf('</main>');
  expect(start, 'page has no main element').toBeGreaterThan(-1);
  return html.slice(start, end);
}

function sectionHtml(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  expect(start, `section ${id} is missing`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</section>', start));
}

describe('GET /community-standards', () => {
  it('serves a visitor, and carries every anchor the forms and the legal page link to', async () => {
    const res = await page('/community-standards');
    expect(res.status).toBe(200);
    // A flag form, an agreement box or the Terms deep-linking to a section that
    // has no anchor lands the reader at the top of a long page instead of the rule.
    for (const id of ['scope', 'general', 'rights', 'links', 'text', 'photos', 'announcements', 'enforcement', 'reporting', 'appeals']) {
      expect(res.text, `anchor ${id} is missing`).toContain(`id="${id}"`);
    }
  });

  it('shows a member the same standards a visitor sees', async () => {
    const visitor = await page('/community-standards');
    const member = await request(createApp())
      .get('/community-standards')
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`);
    expect(member.status).toBe(200);
    // Standards that differed by viewer would bind members to rules a visitor
    // deciding whether to join could not read.
    expect(mainHtml(member.text)).toBe(mainHtml(visitor.text));
  });

  it('lists the enforcement scale as four numbered steps', async () => {
    const res = await page('/community-standards');
    const enforcement = sectionHtml(res.text, 'enforcement');
    // The page's "goes straight to step 4" only means something if the steps
    // are numbered and all four are there.
    const list = enforcement.match(/<ol>([\s\S]*?)<\/ol>/);
    expect(list, 'enforcement steps are not a numbered list').not.toBeNull();
    expect(list![1].match(/<li>/g)).toHaveLength(4);
  });

  it('gives a visitor a working mail link for reporting a problem', async () => {
    const res = await page('/community-standards');
    // Visitors cannot flag or use the member contact form; without this link a
    // visitor who meets abusive content has no way to report it.
    expect(sectionHtml(res.text, 'reporting')).toContain('<a href="mailto:admin@footbag.org">admin@footbag.org</a>');
  });
});

describe('GET /legal links to the Community Standards', () => {
  it('links the Terms, the copyright notice and the email promise to anchors the page has', async () => {
    const legal = await page('/legal');
    const standards = await page('/community-standards');
    // Each link pairs a legal-page section with the standards section it rests
    // on. The Terms link is what makes the standards part of the terms; a link
    // whose anchor the page lacks sends the reader to the wrong place.
    const expected: Array<[string, string]> = [
      ['terms', '/community-standards"'],
      ['copyright', '/community-standards#rights"'],
      ['privacy', '/community-standards#announcements"'],
    ];
    for (const [legalSection, target] of expected) {
      expect(sectionHtml(legal.text, legalSection), `${legalSection} does not link ${target}`).toContain(`href="${target}`);
      const anchor = target.split('#')[1]?.replace('"', '');
      if (anchor) expect(standards.text, `standards page lacks #${anchor}`).toContain(`id="${anchor}"`);
    }
  });
});
