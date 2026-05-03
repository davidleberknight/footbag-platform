import { describe, it, expect } from 'vitest';
import { sidelineService } from '../../src/services/sidelineService';

describe('sidelineService.getSidelineLandingPage', () => {
  const vm = sidelineService.getSidelineLandingPage();

  it('uses the sideline section key and Sideline title', () => {
    expect(vm.page.sectionKey).toBe('sideline');
    expect(vm.page.pageKey).toBe('sideline_home');
    expect(vm.page.title).toBe('Sideline');
    expect(vm.seo.title).toBe('Sideline');
  });

  it('exposes a hero mascot src and alt', () => {
    expect(vm.content.mascotSrc).toBe('/img/sideline-hackysack-hero.svg');
    expect(vm.content.mascotAlt.length).toBeGreaterThan(0);
  });

  it('lists the five game sections in the expected order', () => {
    const slugs = vm.content.games.map((g) => g.slug);
    expect(slugs).toEqual([
      'circle-kicking',
      'two-square',
      'four-square',
      'consecutive-kicks',
      'footbag-golf',
    ]);
  });

  it('attaches a webm demo video to circle-kicking, four-square, and footbag-golf', () => {
    const withVideo = vm.content.games
      .filter((g) => g.demoVideo !== null)
      .map((g) => g.slug);
    expect(withVideo).toEqual(['circle-kicking', 'four-square', 'footbag-golf']);
    for (const game of vm.content.games) {
      if (game.demoVideo) {
        expect(game.demoVideo.webmUrl.startsWith('/video/sideline/')).toBe(true);
        expect(game.demoVideo.webmUrl.endsWith('.webm')).toBe(true);
        expect(game.demoVideo.caption.length).toBeGreaterThan(0);
      }
    }
  });

  it('every moreInfo link is internal (external: false) and starts with /', () => {
    for (const game of vm.content.games) {
      for (const link of game.moreInfo) {
        expect(link.external).toBe(false);
        expect(link.href.startsWith('/')).toBe(true);
      }
    }
  });

  it('only 2-Square and 4-Square link to MD-backed rule pages', () => {
    const games = vm.content.games;
    const findRulesLink = (slug: string) =>
      games.find((g) => g.slug === slug)?.moreInfo.find((l) => l.href.startsWith('/rules/sideline/'));
    expect(findRulesLink('two-square')?.href).toBe('/rules/sideline/2-square');
    expect(findRulesLink('four-square')?.href).toBe('/rules/sideline/4-square');
    expect(findRulesLink('circle-kicking')).toBeUndefined();
    expect(findRulesLink('consecutive-kicks')).toBeUndefined();
    expect(findRulesLink('footbag-golf')).toBeUndefined();
  });

  it('Consecutive Kicks keeps the /records link', () => {
    const game = vm.content.games.find((g) => g.slug === 'consecutive-kicks')!;
    const hrefs = game.moreInfo.map((l) => l.href);
    expect(hrefs).toContain('/records');
  });

  it('omits the icon for Consecutive Kicks (no asset shipped)', () => {
    const game = vm.content.games.find((g) => g.slug === 'consecutive-kicks')!;
    expect(game.iconSrc).toBeNull();
  });
});
