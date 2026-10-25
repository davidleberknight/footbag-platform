import { describe, it, expect } from 'vitest';
import { xSquareService } from '../../src/services/xSquareService';
import { golfService } from '../../src/services/golfService';
import { sidelineService } from '../../src/services/sidelineService';
import { getRulePage } from '../../src/lib/rulesLoader';

const pages = {
  'x-square': xSquareService.getXSquarePage(),
  golf: golfService.getGolfPage(),
  sideline: sidelineService.getSidelinePage(),
};

describe('sport section landing pages (X Square, Golf, Sideline)', () => {
  // Defect caught: a page carries the wrong section key, so analytics and the
  // per-section body class name a different section than the visitor is on.
  it('keys each page to its own section', () => {
    for (const [section, vm] of Object.entries(pages)) {
      expect(vm.page.sectionKey, section).toBe(section);
    }
  });

  // Defect caught: a competitive game drifts back onto the open-play page, or
  // the X Square and golf games go missing from their own sections.
  it('places each game in its own section', () => {
    expect(pages['x-square'].content.games.map((g) => g.slug)).toEqual(['two-square', 'four-square']);
    expect(pages.golf.content.games.map((g) => g.slug)).toEqual(['footbag-golf']);
    expect(pages.sideline.content.games.map((g) => g.slug)).toEqual(['circle-kicking']);
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

  // Defect caught: the open-play page loses its pointer to the X Square games,
  // which are also played as open play.
  it('points the Sideline explainer at the X Square page', () => {
    const segments = pages.sideline.content.explainer!.paragraphs.flat();
    expect(segments.some((s) => s.href === '/x-square')).toBe(true);
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
