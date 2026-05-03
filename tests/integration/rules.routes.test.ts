import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3112');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /rules', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
    expect(res.status).toBe(200);
  });

  it('shows the page heading', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
    expect(res.text).toContain('<h1>Footbag Rules</h1>');
  });

  it('lists the sideline rules with internal hrefs', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
    expect(res.text).toContain('/rules/sideline/2-square');
    expect(res.text).toContain('/rules/sideline/4-square');
  });

  it('groups by discipline with the Sideline label visible', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
    expect(res.text).toContain('Sideline');
  });

  it('highlights the Rules nav entry as active', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
    expect(res.text).toMatch(/<a href="\/rules" class="active">Rules<\/a>/);
  });

  it('does not contain any offsite link to Google Docs, footbag.org, or YouTube', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
    expect(res.text).not.toContain('docs.google.com');
    expect(res.text).not.toContain('youtube.com');
    expect(res.text).not.toContain('footbag.org/rules');
  });

  it('renders the browser tab title as "Footbag Rules" (not double-prefixed)', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
    expect(res.text).toContain('<title>Footbag Rules</title>');
  });
});

describe('GET /rules/sideline/2-square', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/2-square');
    expect(res.status).toBe(200);
  });

  it('renders verbatim Google Doc text', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/2-square');
    expect(res.text).toContain('Game is to 11, must win by 2 points');
    expect(res.text).toContain('Rally Scoring');
    expect(res.text).toContain('Hand-serve from the back line');
    expect(res.text).toContain('it&#39;s okay to HAVE FUN!');
  });

  it('shows the IFPA, 2020 metadata line', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/2-square');
    expect(res.text).toMatch(/<p class="rules-meta">IFPA, 2020<\/p>/);
  });

  it('renders the back-link to /sideline', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/2-square');
    expect(res.text).toContain('href="/sideline"');
    expect(res.text).toContain('Back to Sideline');
  });

  it('contains zero offsite links', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/2-square');
    expect(res.text).not.toContain('target="_blank"');
    expect(res.text).not.toContain('docs.google.com');
  });

  it('renders the browser tab title without double Footbag prefix', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/2-square');
    expect(res.text).toContain('<title>Footbag 2-Square Rules</title>');
    expect(res.text).not.toContain('<title>Footbag Footbag');
  });
});

describe('GET /rules/sideline/4-square', () => {
  it('returns 200 and shows verbatim 4-Square text', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/4-square');
    expect(res.status).toBe(200);
    expect(res.text).toContain('GOLDEN RULES');
    expect(res.text).toContain('TOO MUCH VOTING IS NO FUN!');
  });

  it('renders the browser tab title as "Footbag 4-Square Rules"', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/4-square');
    expect(res.text).toContain('<title>Footbag 4-Square Rules</title>');
  });
});

describe('GET /rules/golf/footbag-golf', () => {
  it('returns 200 and renders verbatim Article IV text', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/golf/footbag-golf');
    expect(res.status).toBe(200);
    expect(res.text).toContain('first official game of footbag golf was played in Delta Park');
    expect(res.text).toContain('401. Conduct of Players');
    expect(res.text).toContain('402. Equipment');
    expect(res.text).toContain('403. Rules of Play');
    expect(res.text).toContain('404. Tournament Procedures');
    expect(res.text).toContain('405. Glossary');
  });

  it('renders specific rule paragraphs verbatim', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/golf/footbag-golf');
    expect(res.text).toContain('A maximum of 30 seconds is allowed to each player');
    expect(res.text).toContain('Mandatory Dog-Leg');
    expect(res.text).toContain('Yelling &quot;Fore&quot;');
  });

  it('shows the IFPA Article IV authority line', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/golf/footbag-golf');
    expect(res.text).toMatch(/<p class="rules-meta">IFPA Article IV<\/p>/);
  });

  it('renders the browser tab title as "Footbag Golf Rules"', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/golf/footbag-golf');
    expect(res.text).toContain('<title>Footbag Golf Rules</title>');
    expect(res.text).not.toContain('<title>Footbag Footbag');
  });

  it('contains zero offsite links', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/golf/footbag-golf');
    expect(res.text).not.toContain('target="_blank"');
    expect(res.text).not.toContain('docs.google.com');
    expect(res.text).not.toContain('footbag.org/rules');
  });
});

describe('GET /rules with golf added', () => {
  it('lists the Footbag Golf discipline group', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
    expect(res.text).toContain('Footbag Golf');
    expect(res.text).toContain('/rules/golf/footbag-golf');
  });
});

describe('GET /rules/net/footbag-net (full English Article III)', () => {
  it('returns 200 with the full English Article III text (verbatim from live IFPA source)', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/net/footbag-net');
    expect(res.status).toBe(200);
    expect(res.text).toContain('301. Interpretation');
    expect(res.text).toContain('302. Field of Play');
    expect(res.text).toContain('303. Rules of Play');
    expect(res.text).toContain('304. Tournament Procedures');
    expect(res.text).toContain('305. Glossary');
  });

  it('renders specific English rule paragraphs verbatim', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/net/footbag-net');
    expect(res.text).toContain('20 feet in width divided in half by the center line');
    expect(res.text).toContain('GSM is a scoring system similar to tennis');
    expect(res.text).toContain('Coin Toss');
    expect(res.text).toContain('Net Equipment Foul');
    expect(res.text).toContain('three way fist-to-palm tie-breaking ritual');
  });

  it('contains no French-only headings or content from the bilingual chapter', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/net/footbag-net');
    expect(res.text).not.toContain('Interprétation');
    expect(res.text).not.toContain('Règles de Jeu');
    expect(res.text).not.toContain('Glossaire');
    expect(res.text).not.toContain('Le footbag net se joue');
  });

  it('renders a language toggle to /rules/net/jeu-au-filet', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/net/footbag-net');
    expect(res.text).toContain('class="rules-language-toggle"');
    expect(res.text).toContain('href="/rules/net/jeu-au-filet"');
    expect(res.text).toContain('Lire en français');
  });
});

describe('GET /rules/net/jeu-au-filet (bilingual Article III)', () => {
  it('returns 200 and renders the verbatim bilingual Article III', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/net/jeu-au-filet');
    expect(res.status).toBe(200);
    expect(res.text).toContain('301. Interprétation');
    expect(res.text).toContain('303. Règles de Jeu');
    expect(res.text).toContain('305. Glossaire');
  });

  it('renders a toggle back to the English summary', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/net/jeu-au-filet');
    expect(res.text).toContain('class="rules-language-toggle"');
    expect(res.text).toContain('href="/rules/net/footbag-net"');
    expect(res.text).toContain('Read in English');
  });
});

describe('GET /rules/freestyle/footbag-freestyle', () => {
  it('returns 200 and renders verbatim Article V text', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/freestyle/footbag-freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('501. Interpretation');
    expect(res.text).toContain('504. Difficulty Analysis');
    expect(res.text).toContain('505. Choreographed Freestyle Routines');
    expect(res.text).toContain('506. Timed Technical Variety Competition');
    expect(res.text).toContain('507. Circle Contest');
    expect(res.text).toContain('508. Tournament Procedures');
  });

  it('renders the difficulty analysis terminology verbatim', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/freestyle/footbag-freestyle');
    expect(res.text).toContain('Dexterity Adds');
    expect(res.text).toContain('Add-to-Contact Ratio');
    expect(res.text).toContain('Tripless');
    expect(res.text).toContain('Guiltless');
  });

  it('shows the IFPA Article V authority line', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/freestyle/footbag-freestyle');
    expect(res.text).toMatch(/<p class="rules-meta">IFPA Article V<\/p>/);
  });
});

describe('GET /rules with all four disciplines', () => {
  it('lists every discipline group on the index', async () => {
    const app = createApp();
    const res = await request(app).get('/rules');
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
    const app = createApp();
    const res = await request(app).get('/rules/unknown/2-square');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown rule slug', async () => {
    const app = createApp();
    const res = await request(app).get('/rules/sideline/no-such-rule');
    expect(res.status).toBe(404);
  });
});
