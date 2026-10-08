import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3112');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /rules', () => {
  it('lists the sideline rules with internal hrefs', async () => {
    const res = await page('/rules');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/rules/sideline/2-square');
    expect(res.text).toContain('/rules/sideline/4-square');
  });

  it('highlights the Rules nav entry as active', async () => {
    const res = await page('/rules');
    expect(res.text).toMatch(/<a href="\/rules" class="active">Rules<\/a>/);
  });

  it('does not contain any offsite link to Google Docs, footbag.org, or YouTube', async () => {
    const res = await page('/rules');
    expect(res.text).not.toContain('docs.google.com');
    expect(res.text).not.toContain('youtube.com');
    expect(res.text).not.toContain('footbag.org/rules');
  });

  it('renders the browser tab title as "Footbag Rules" (not double-prefixed)', async () => {
    const res = await page('/rules');
    expect(res.text).toContain('<title>Footbag Rules</title>');
  });
});

describe('GET /rules/sideline/2-square', () => {
  it('renders verbatim Google Doc text', async () => {
    const res = await page('/rules/sideline/2-square');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Game is to 11, must win by 2 points');
    expect(res.text).toContain('Rally Scoring');
    expect(res.text).toContain('Hand-serve from the back line');
    expect(res.text).toContain('it&#39;s okay to HAVE FUN!');
  });

  it('shows the IFPA, 2020 metadata line', async () => {
    const res = await page('/rules/sideline/2-square');
    expect(res.text).toMatch(/<p class="rules-meta">IFPA, 2020<\/p>/);
  });

  it('renders the back-link to the parent page its frontmatter names', async () => {
    const res = await page('/rules/sideline/2-square');
    const back = res.text.match(/<section class="content-section rules-footer-back">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(back).toContain('href="/sideline"');
  });

  it('contains zero offsite links', async () => {
    const res = await page('/rules/sideline/2-square');
    expect(res.text).not.toContain('target="_blank"');
    expect(res.text).not.toContain('docs.google.com');
  });

  it('renders the browser tab title without double Footbag prefix', async () => {
    const res = await page('/rules/sideline/2-square');
    expect(res.text).toContain('<title>Footbag 2-Square Rules</title>');
    expect(res.text).not.toContain('<title>Footbag Footbag');
  });
});

describe('GET /rules/sideline/4-square', () => {
  it('returns 200 and shows verbatim 4-Square text', async () => {
    const res = await page('/rules/sideline/4-square');
    expect(res.status).toBe(200);
    expect(res.text).toContain('GOLDEN RULES');
    expect(res.text).toContain('TOO MUCH VOTING IS NO FUN!');
  });
});

describe('GET /rules/golf/footbag-golf', () => {
  it('returns 200 and renders verbatim Article IV text', async () => {
    const res = await page('/rules/golf/footbag-golf');
    expect(res.status).toBe(200);
    expect(res.text).toContain('first official game of footbag golf was played in Delta Park');
    expect(res.text).toContain('401. Conduct of Players');
    expect(res.text).toContain('402. Equipment');
    expect(res.text).toContain('403. Rules of Play');
    expect(res.text).toContain('404. Tournament Procedures');
    expect(res.text).toContain('405. Glossary');
  });

  it('renders specific rule paragraphs verbatim', async () => {
    const res = await page('/rules/golf/footbag-golf');
    expect(res.text).toContain('A maximum of 30 seconds is allowed to each player');
    expect(res.text).toContain('Mandatory Dog-Leg');
    expect(res.text).toContain('Yelling &quot;Fore&quot;');
  });

  it('shows the IFPA Article IV authority line', async () => {
    const res = await page('/rules/golf/footbag-golf');
    expect(res.text).toMatch(/<p class="rules-meta">IFPA Article IV<\/p>/);
  });

  it('renders the browser tab title as "Footbag Golf Rules"', async () => {
    const res = await page('/rules/golf/footbag-golf');
    expect(res.text).toContain('<title>Footbag Golf Rules</title>');
    expect(res.text).not.toContain('<title>Footbag Footbag');
  });

  it('contains zero offsite links', async () => {
    const res = await page('/rules/golf/footbag-golf');
    expect(res.text).not.toContain('target="_blank"');
    expect(res.text).not.toContain('docs.google.com');
    expect(res.text).not.toContain('footbag.org/rules');
  });
});

describe('GET /rules with golf added', () => {
  it('lists the Footbag Golf discipline group', async () => {
    const res = await page('/rules');
    expect(res.text).toContain('Footbag Golf');
    expect(res.text).toContain('/rules/golf/footbag-golf');
  });
});

describe('GET /rules/net/footbag-net (full English Article III)', () => {
  it('returns 200 with the full English Article III text (verbatim from live IFPA source)', async () => {
    const res = await page('/rules/net/footbag-net');
    expect(res.status).toBe(200);
    expect(res.text).toContain('301. Interpretation');
    expect(res.text).toContain('302. Field of Play');
    expect(res.text).toContain('303. Rules of Play');
    expect(res.text).toContain('304. Tournament Procedures');
    expect(res.text).toContain('305. Glossary');
  });

  it('renders specific English rule paragraphs verbatim', async () => {
    const res = await page('/rules/net/footbag-net');
    expect(res.text).toContain('20 feet in width divided in half by the center line');
    expect(res.text).toContain('GSM is a scoring system similar to tennis');
    expect(res.text).toContain('Coin Toss');
    expect(res.text).toContain('Net Equipment Foul');
    expect(res.text).toContain('three way fist-to-palm tie-breaking ritual');
  });

  it('contains no French-only headings or content from the bilingual chapter', async () => {
    const res = await page('/rules/net/footbag-net');
    expect(res.text).not.toContain('Interprétation');
    expect(res.text).not.toContain('Règles de Jeu');
    expect(res.text).not.toContain('Glossaire');
    expect(res.text).not.toContain('Le footbag net se joue');
  });

  it('offers no link to a translated rulebook the site does not publish', async () => {
    const res = await page('/rules/net/footbag-net');
    // The rules are published in English only; a language toggle here would
    // send the visitor to a page that returns not found.
    expect(res.text).not.toContain('rules-language-toggle');
    expect(res.text).not.toContain('/rules/net/jeu-au-filet');
  });
});

describe('GET /rules/net/jeu-au-filet', () => {
  it('is not published', async () => {
    const res = await page('/rules/net/jeu-au-filet');
    expect(res.status).toBe(404);
  });
});

// The rule pages the index links to, read from the rendered index so a page
// added to the IFPA rules files is covered without editing this list.
async function indexedRuleLinks(): Promise<Array<{ href: string; text: string }>> {
  const res = await page('/rules');
  return [...res.text.matchAll(/<a href="(\/rules\/[^"]+)"><strong>([^<]+)<\/strong><\/a>/g)]
    .map((m) => ({ href: m[1]!, text: m[2]! }));
}

describe('rule page titles and orientation', () => {
  it('titles every rule page as that game\'s rules, matching its index link', async () => {
    const links = await indexedRuleLinks();
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const res = await page(link.href);
      expect(res.status, link.href).toBe(200);
      const h1 = res.text.match(/<h1>([^<]+)<\/h1>/)?.[1];
      // A bare game name ("2-Square") reads as a page about the game, not its
      // rules; an index link naming something else than the page it opens
      // misleads the visitor about where the click lands.
      expect(h1, `${link.href} h1`).toMatch(/ Rules$/);
      expect(link.text, `${link.href} index link`).toBe(h1);
    }
  });

  it('opens every rule page with an orientation sentence under its title', async () => {
    for (const link of await indexedRuleLinks()) {
      const res = await page(link.href);
      // Without it the visitor lands on a title followed straight by rulebook
      // text, with nothing saying what the game is.
      expect(res.text, link.href).toMatch(/<p class="hero-subtitle">[^<]+<\/p>/);
    }
  });

  it('introduces every discipline group on the index', async () => {
    const res = await page('/rules');
    const groups = [...res.text.matchAll(/<section class="content-section rules-group" id="([^"]+)">([\s\S]*?)<\/section>/g)];
    expect(groups.length).toBeGreaterThan(0);
    for (const [, id, body] of groups) {
      // A bare heading over a link list says nothing about what the group covers.
      expect(body, id).toMatch(/<\/h2><\/div>\s*<p>[^<]+<\/p>/);
    }
  });

  it('links the rules index to the equipment page', async () => {
    const res = await page('/rules');
    // Equipment is the rules' sibling; without this link a visitor reading the
    // rules has no path from them to what they need to play.
    expect(res.text).toMatch(/<a href="\/equipment" class="action-link">[^<]+<\/a>/);
  });
});

describe('GET /rules/freestyle/footbag-freestyle', () => {
  it('returns 200 and renders verbatim Article V text', async () => {
    const res = await page('/rules/freestyle/footbag-freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('501. Interpretation');
    expect(res.text).toContain('504. Difficulty Analysis');
    expect(res.text).toContain('505. Choreographed Freestyle Routines');
    expect(res.text).toContain('506. Timed Technical Variety Competition');
    expect(res.text).toContain('507. Circle Contest');
    expect(res.text).toContain('508. Tournament Procedures');
  });

  it('renders the difficulty analysis terminology verbatim', async () => {
    const res = await page('/rules/freestyle/footbag-freestyle');
    expect(res.text).toContain('Dexterity Adds');
    expect(res.text).toContain('Add-to-Contact Ratio');
    expect(res.text).toContain('Tripless');
    expect(res.text).toContain('Guiltless');
  });

  it('shows the IFPA Article V authority line', async () => {
    const res = await page('/rules/freestyle/footbag-freestyle');
    expect(res.text).toMatch(/<p class="rules-meta">IFPA Article V<\/p>/);
  });
});

describe('GET /rules with all four disciplines', () => {
  it('lists every discipline group on the index', async () => {
    const res = await page('/rules');
    expect(res.text).toContain('Sideline');
    expect(res.text).toContain('Footbag Net');
    expect(res.text).toContain('Footbag Golf');
    expect(res.text).toContain('Freestyle');
    expect(res.text).toContain('/rules/net/footbag-net');
    expect(res.text).toContain('/rules/freestyle/footbag-freestyle');
  });
});

describe('GET /rules/:disciplineSlug/:ruleSlug 404 handling', () => {
  it('returns 404 for unknown discipline slug', async () => {
    const res = await page('/rules/unknown/2-square');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown rule slug', async () => {
    const res = await page('/rules/sideline/no-such-rule');
    expect(res.status).toBe(404);
  });
});
