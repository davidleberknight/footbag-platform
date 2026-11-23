/**
 * The game section landing pages (X-Square, Golf, Sideline): each page's
 * section, its games, and its "More info" links. The pages read their demo
 * clips from the stored curated media, so they are shaped against a test
 * database; a schema-only one is enough here, since no case reads a clip.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3964');

type Page = ReturnType<typeof import('../../src/services/golfService').golfService.getGolfPage>;
let pages: Record<'x-square' | 'golf' | 'sideline', Page>;
let getRulePage: typeof import('../../src/lib/rulesLoader').getRulePage;

beforeAll(async () => {
  createTestDb(dbPath).close();
  const { xSquareService } = await import('../../src/services/xSquareService');
  const { golfService } = await import('../../src/services/golfService');
  const { sidelineService } = await import('../../src/services/sidelineService');
  ({ getRulePage } = await import('../../src/lib/rulesLoader'));
  pages = {
    'x-square': xSquareService.getXSquarePage(),
    golf: golfService.getGolfPage(),
    sideline: sidelineService.getSidelinePage(),
  };
});

afterAll(() => cleanupTestDb(dbPath));

describe('game section landing pages (X-Square, Golf, Sideline)', () => {
  // Defect caught: a page carries the wrong section key, so analytics and the
  // per-section body class name a different section than the visitor is on.
  it('keys each page to its own section', () => {
    for (const [section, vm] of Object.entries(pages)) {
      expect(vm.page.sectionKey, section).toBe(section);
    }
  });

  // Defect caught: a game with its own section drifts back onto the open-play page, or
  // the X-Square and golf games go missing from their own sections.
  it('places each game in its own section', () => {
    expect(pages['x-square'].content.games.map((g) => g.slug)).toEqual(['two-square', 'four-square']);
    expect(pages.golf.content.games.map((g) => g.slug)).toEqual(['footbag-golf']);
    expect(pages.sideline.content.games.map((g) => g.slug)).toEqual(['hack']);
  });

  // Defect caught: a "More info" rules link points at an address the rules
  // loader does not serve, so the visitor lands on a 404.
  it('links every rules page that the rules loader actually serves', () => {
    let checked = 0;
    for (const vm of Object.values(pages)) {
      for (const game of vm.content.games) {
        for (const link of game.moreInfo) {
          const m = link.href.match(/^\/rules\/([^/]+)\/([^/#]+)$/);
          if (!m) continue;
          checked += 1;
          expect(getRulePage(m[1]!, m[2]!), link.href).toBeDefined();
        }
      }
    }
    expect(checked).toBe(3);
  });

  // Defect caught: the open-play page loses its pointer to the X-Square games,
  // which are also played as open play.
  it('points the Sideline circle kicking section at the X-Square page', () => {
    const segments = pages.sideline.content.games[0]!.paragraphs.flat();
    expect(segments.some((s) => s.href === '/x-square')).toBe(true);
  });

  // Defect caught: the Sideline page grows a separate explainer again beside
  // its circle kicking section, so a visitor reads the same game described twice.
  it('gives Sideline one circle kicking section and no separate explainer', () => {
    expect(pages.sideline.content.explainer).toBeNull();
    expect(pages.sideline.content.games).toHaveLength(1);
  });

  // Defect caught: the Hack menu entry's anchor leaks onto an X-Square or Golf
  // explainer, giving them a subsection address nothing links to.
  it('anchors no X-Square or Golf explainer', () => {
    expect(pages['x-square'].content.explainer?.id).toBeUndefined();
    expect(pages.golf.content.explainer?.id).toBeUndefined();
  });

  it('keeps every More info link internal', () => {
    for (const vm of Object.values(pages)) {
      for (const game of vm.content.games) {
        for (const link of game.moreInfo) {
          expect(link.external, link.href).toBe(false);
          expect(link.href.startsWith('/'), link.href).toBe(true);
        }
      }
    }
  });
});
