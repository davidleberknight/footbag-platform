/**
 * Integration tests for the /equipment public route and the game pages that
 * link to it.
 *
 * Covers:
 *   GET /equipment — practical equipment guidance, one anchored section per topic
 *   GET /net, /freestyle, /sideline — each links to its rules and to its
 *     equipment section
 *
 * Contract verified:
 *   - every "Official IFPA rule" note links to a rule section that exists
 *   - every official figure the page states matches the rule it cites, so the
 *     rules stay the single source for official equipment requirements
 *   - the vendor is named as plain text, with no offsite link
 *   - every equipment deep link from a game page lands on a real section
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3094');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function mainOf(html: string): string {
  const start = html.indexOf('<main');
  const end = html.indexOf('</main>');
  return html.slice(start, end);
}

// The <li> on the equipment page whose official-rule note links to `href`.
function itemCiting(html: string, href: string): string {
  const at = html.indexOf(`href="${href}"`);
  const start = html.lastIndexOf('<li>', at);
  const end = html.indexOf('</li>', at);
  return html.slice(start, end);
}

// The rendered rule section under the heading carrying `anchor`, up to the
// next heading.
function ruleSection(html: string, anchor: string): string {
  const at = html.indexOf(`id="${anchor}"`);
  const next = html.slice(at + 1).search(/<h[1-6][ >]/);
  return next === -1 ? html.slice(at) : html.slice(at, at + 1 + next);
}

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
}

// For each official item: the figure as the equipment page words it, and the
// same figure as the rule words it. Both sides are matched, so a change to
// either text without the other fails here. An entry with no pairs states
// why the item has no figure to compare.
const OFFICIAL_FIGURES: Record<string, { pairs: Array<[RegExp, RegExp]>; why?: string }> = {
  '/rules/net/footbag-net#302-01-court-dimensions': {
    pairs: [
      [/44 feet long/, /44 feet in length/],
      [/20 feet wide/, /20 feet in width/],
    ],
  },
  '/rules/net/footbag-net#302-02-net-height-and-stanchion-placement': {
    pairs: [
      [/5 feet high/, /net height is five feet/],
      [/1-inch mesh/, /net mesh of one inch/],
    ],
  },
  '/rules/net/footbag-net#302-06-line-width': {
    pairs: [[/2-inch tape/, /two inches/]],
  },
  '/rules/freestyle/footbag-freestyle#502-01-playing-area': {
    pairs: [
      [/20 feet \(6 meters\)/, /6 meters \(20 feet\)/],
      [/40 feet \(12 meters\)/, /12 meters \(40 feet\)/],
    ],
  },
  '/rules/golf/footbag-golf#402-03-targets': {
    pairs: [
      [/18 inches in diameter/, /\b18"? in diameter/],
      [/standing 18 inches off the ground/, /standing 18"? off the ground/],
    ],
  },
  '/rules/golf/footbag-golf#402-04-greens': {
    pairs: [],
    why: 'The page describes the 20-foot radius as common practice; the rule gives the official range, read at the linked section.',
  },
  '/rules/golf/footbag-golf#403-02-teeing-off': {
    pairs: [[/6 feet square/, /six-foot-square tee box/]],
  },
  '/rules/golf/footbag-golf#402-02-markers': {
    pairs: [],
    why: 'The page names what to use as a marker and states no size.',
  },
};

describe('GET /equipment', () => {
  it('links every official-rule note to a rule section that exists', async () => {
    const res = await page('/equipment');
    expect(res.status).toBe(200);
    // A renumbered or renamed rule heading changes its anchor; the visitor
    // would land at the top of a long rulebook instead of on the rule.
    const hrefs = [...res.text.matchAll(/Official IFPA rule: <a href="([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const [path, anchor] = href.split('#') as [string, string];
      const rule = await page(path);
      expect(rule.status, `${href} rule page`).toBe(200);
      expect(rule.text, `${href} anchor`).toContain(`id="${anchor}"`);
    }
  });

  it('states every official figure exactly as the rule it cites does', async () => {
    const res = await page('/equipment');
    const hrefs = [...res.text.matchAll(/Official IFPA rule: <a href="([^"]+)"/g)].map((m) => m[1]!);
    // An official item added without a figure check would let the page and
    // the rule drift apart unseen, which is the failure the rules-as-single-
    // source design exists to prevent.
    expect(hrefs.sort()).toEqual(Object.keys(OFFICIAL_FIGURES).sort());
    for (const href of hrefs) {
      const [path, anchor] = href.split('#') as [string, string];
      const item = plainText(itemCiting(res.text, href));
      const section = plainText(ruleSection((await page(path)).text, anchor));
      for (const [onPage, inRule] of OFFICIAL_FIGURES[href]!.pairs) {
        expect(item, `${href}: page figure`).toMatch(onPage);
        expect(section, `${href}: rule figure`).toMatch(inRule);
      }
    }
  });

  it('names the vendor as plain text and links nowhere offsite', async () => {
    const res = await page('/equipment');
    const main = mainOf(res.text);
    // An offsite link from IFPA's site to a vendor reads as an endorsement the
    // page explicitly disclaims.
    expect(main).toContain('World Footbag (worldfootbag.com)');
    expect(main).not.toMatch(/href="(https?:)?\/\//);
  });
});

describe('game pages link to their rules and equipment', () => {
  const GAME_PAGES: Record<string, { rules: string[]; equipment: string[] }> = {
    '/net': { rules: ['/rules/net/footbag-net'], equipment: ['net'] },
    '/freestyle': { rules: ['/rules/freestyle/footbag-freestyle'], equipment: ['freestyle'] },
    '/sideline': {
      rules: ['/rules/golf/footbag-golf', '/rules/sideline/2-square', '/rules/sideline/4-square'],
      equipment: ['footbags', 'golf', 'square-games'],
    },
  };

  it('each game page links to its rules and to equipment sections that exist', async () => {
    const equipment = await page('/equipment');
    for (const [path, expected] of Object.entries(GAME_PAGES)) {
      const res = await page(path);
      expect(res.status, path).toBe(200);
      for (const rulesHref of expected.rules) {
        expect(res.text, `${path} links ${rulesHref}`).toContain(`href="${rulesHref}"`);
      }
      // A deep link to a section id the equipment page no longer carries drops
      // the visitor at the top of the page instead of on their game.
      const anchors = [...res.text.matchAll(/href="\/equipment#([^"]+)"/g)].map((m) => m[1]!);
      expect(new Set(anchors), path).toEqual(new Set(expected.equipment));
      for (const anchor of anchors) {
        expect(equipment.text, `${path} -> #${anchor}`).toContain(`id="${anchor}"`);
      }
    }
  });
});
