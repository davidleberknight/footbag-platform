/**
 * The dictionary's By set and By modifier views show one group at a time, and
 * the By ADD view lists each level alphabetically with no sort control.
 *
 * ?view=set and ?view=modifier open on the first group in browse order (a
 * group's browse group, then its stored order within it); ?view=set&set=<slug>
 * and ?view=modifier&modifier=<slug> are each group's own address; a group the
 * view does not render is a 404. Each view's chip row lists its groups in the
 * same order. The fixture stores orders that are not alphabetical (quantum
 * before pixie, spinning before ducking), so a default or chip order taken
 * from anything but the stored order fails.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleFamily,
  insertFreestyleOperator,
  insertFreestyleSet,
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3948');

let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleFamily(db, { slug: 'mirage', sort_order: 1 });

  const mod = (slug: string, type: string, group: string, order: number, full: 0 | 1) =>
    insertFreestyleTrickModifier(db, {
      slug, modifier_type: type, browse_group: group, browse_order: order, browse_full_section: full,
    });
  mod('quantum', 'set', 'set-uptime', 1, 1);
  mod('pixie', 'set', 'set-uptime', 2, 1);
  mod('fairy', 'set', 'set-uptime', 3, 1);           // no linked tricks
  mod('spinning', 'body', 'rotational-body', 1, 1);
  mod('ducking', 'body', 'rotational-body', 2, 1);
  mod('paradox', 'body', 'no-plant-timing', 1, 1);
  mod('symposium', 'body', 'no-plant-timing', 2, 0); // no section of its own

  // Reference entries: Pixie is in the Set Encyclopedia and Paradox and
  // Spinning on the Operators & Modifiers page. Quantum and Ducking have no
  // entry, so their headings must stay plain text.
  insertFreestyleSet(db, { slug: 'pixie' });
  insertFreestyleOperator(db, { slug: 'paradox', page_group: 'entry-side-relationship', page_order: 1 });
  insertFreestyleOperator(db, { slug: 'spinning', page_group: 'body-rotation', page_order: 1 });
  insertFreestyleOperator(db, { slug: 'ducking' }); // registered, not on the operators page

  const trick = (slug: string, adds: string, links: string[]) => {
    insertFreestyleTrick(db, {
      slug, canonical_name: slug.replace(/_/g, ' '), adds, base_trick: 'mirage', trick_family: 'mirage',
      category: slug === 'mirage' ? 'dex' : 'compound', review_status: 'expert_reviewed', is_active: 1,
    });
    links.forEach((m, i) => insertFreestyleTrickModifierLink(db, slug, m, i + 1));
  };
  trick('mirage', '2', []);
  trick('quantum_mirage', '3', ['quantum']);
  trick('pixie_mirage', '3', ['pixie']);
  trick('spinning_mirage', '3', ['spinning']);
  trick('ducking_mirage', '3', ['ducking']);
  trick('paradox_mirage', '3', ['paradox']);
  trick('symposium_mirage', '3', ['symposium']);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function sections(html: string, kind: 'set' | 'modifier'): string[] {
  return [...html.matchAll(new RegExp(`<section class="content-section trick-${kind}-group" id="${kind}-([a-z_]+)"`, 'g'))]
    .map(m => m[1]!);
}

function chips(html: string, label: string): { label: string; current: boolean; href: string | null }[] {
  const nav = html.match(new RegExp(`<nav class="jump-bar jump-bar--wide" aria-label="${label}">([\\s\\S]*?)</nav>`))?.[1] ?? '';
  return [...nav.matchAll(/<span aria-current="page"[^>]*>([^<]+)<\/span>|<a href="([^"]+)">([^<]+)<\/a>/g)]
    .map(m => (m[1] !== undefined
      ? { label: m[1], current: true, href: null }
      : { label: m[3]!, current: false, href: m[2]! }));
}

describe('the set view shows one set at a time', () => {
  // Defect caught: the bare set view renders every set again, or opens on a
  // set chosen by name rather than the stored browse order.
  it('opens on the first set in browse order, and only that set', async () => {
    const res = await getPage('/freestyle/tricks?view=set');
    expect(res.status).toBe(200);
    expect(sections(res.text, 'set')).toEqual(['quantum']);
  });

  // Defect caught: a set's own address shows another set, or several.
  it('shows exactly the named set at its own address', async () => {
    const res = await getPage('/freestyle/tricks?view=set&set=pixie');
    expect(res.status).toBe(200);
    expect(sections(res.text, 'set')).toEqual(['pixie']);
    expect(res.text).toContain('href="/freestyle/tricks/pixie_mirage"');
    expect(res.text).not.toContain('href="/freestyle/tricks/quantum_mirage"');
  });

  // Defect caught: an unknown set, or a set with no tricks, silently shows
  // another set, so a stale link looks like it worked.
  it('answers 404 for a set the view does not render', async () => {
    expect((await getPage('/freestyle/tricks?view=set&set=no_such_set')).status).toBe(404);
    expect((await getPage('/freestyle/tricks?view=set&set=fairy')).status).toBe(404);
  });

  // Defect caught: the selector loses a set, lists one with no tricks,
  // reorders by name, or marks the wrong set current.
  it('lists every rendered set in browse order and marks the one on screen', async () => {
    const res = await getPage('/freestyle/tricks?view=set&set=pixie');
    expect(chips(res.text, 'Browse by set')).toEqual([
      { label: 'Quantum', current: false, href: '/freestyle/tricks?view=set&amp;set=quantum' },
      { label: 'Pixie', current: true, href: null },
    ]);
  });
});

describe('the modifier view shows one modifier at a time', () => {
  // Defect caught: the modifier view renders every modifier again, or opens on
  // one chosen by name rather than the stored browse order.
  it('opens on the first modifier in browse order, and only that modifier', async () => {
    const res = await getPage('/freestyle/tricks?view=modifier');
    expect(res.status).toBe(200);
    expect(sections(res.text, 'modifier')).toEqual(['spinning']);
  });

  // Defect caught: a modifier's own address shows another modifier, or several.
  it('shows exactly the named modifier at its own address', async () => {
    const res = await getPage('/freestyle/tricks?view=modifier&modifier=paradox');
    expect(res.status).toBe(200);
    expect(sections(res.text, 'modifier')).toEqual(['paradox']);
    expect(res.text).toContain('href="/freestyle/tricks/paradox_mirage"');
    expect(res.text).not.toContain('href="/freestyle/tricks/spinning_mirage"');
  });

  // Defect caught: a modifier without a section of its own, or a launch set,
  // gets a page in the modifier view.
  it('answers 404 for a modifier the view does not render', async () => {
    expect((await getPage('/freestyle/tricks?view=modifier&modifier=symposium')).status).toBe(404);
    expect((await getPage('/freestyle/tricks?view=modifier&modifier=pixie')).status).toBe(404);
  });

  // Defect caught: the chips keep the category layer, lose a modifier, list a
  // modifier with no section, or reorder by name instead of browse order.
  it('lists the modifiers flat, in browse order, and marks the one on screen', async () => {
    const res = await getPage('/freestyle/tricks?view=modifier&modifier=paradox');
    expect(chips(res.text, 'Browse by modifier')).toEqual([
      { label: 'Spinning', current: false, href: '/freestyle/tricks?view=modifier&amp;modifier=spinning' },
      { label: 'Ducking', current: false, href: '/freestyle/tricks?view=modifier&amp;modifier=ducking' },
      { label: 'Paradox', current: true, href: null },
    ]);
  });
});

function heading(html: string, kind: 'set' | 'modifier', slug: string): string {
  const section = html.match(new RegExp(`id="${kind}-${slug}"[\\s\\S]*?<h2>([\\s\\S]*?)</h2>`))?.[1];
  if (section === undefined) throw new Error(`no ${kind}-${slug} section heading`);
  return section;
}

describe('a set or modifier heading links to its reference entry', () => {
  // Defect caught: the Pixie heading links somewhere other than its Set
  // Encyclopedia entry (its own browse page, the encyclopedia index, or nowhere).
  it('By set links Pixie to its Set Encyclopedia entry', async () => {
    const res = await getPage('/freestyle/tricks?view=set&set=pixie');
    expect(heading(res.text, 'set', 'pixie')).toBe('<a href="/freestyle/sets/pixie">Pixie</a>');
  });

  // Defect caught: the Paradox heading links somewhere other than its entry on
  // the Operators & Modifiers page.
  it('By modifier links Paradox to its Operators & Modifiers entry', async () => {
    const res = await getPage('/freestyle/tricks?view=modifier&modifier=paradox');
    expect(heading(res.text, 'modifier', 'paradox'))
      .toBe('<a href="/freestyle/operators#operator-paradox">Paradox</a>');
  });

  // Defect caught: a group the reference does not hold gets an invented
  // destination (a guessed encyclopedia page or a dead operators anchor).
  it('leaves a heading unlinked when the reference holds no entry', async () => {
    const quantum = await getPage('/freestyle/tricks?view=set');
    expect(heading(quantum.text, 'set', 'quantum')).toBe('Quantum');
    const ducking = await getPage('/freestyle/tricks?view=modifier&modifier=ducking');
    expect(heading(ducking.text, 'modifier', 'ducking')).toBe('Ducking');
  });

  // Defect caught: a heading link points at a reference destination that does
  // not render the group's entry, so the reader lands on a 404 or the wrong item.
  it('every heading link lands on an entry its destination renders', async () => {
    const pixie = await getPage('/freestyle/sets/pixie');
    expect(pixie.status).toBe(200);
    const operators = await getPage('/freestyle/operators');
    expect(operators.status).toBe(200);
    for (const slug of ['paradox', 'spinning']) {
      expect(operators.text, slug).toContain(`id="operator-${slug}"`);
    }
    expect(operators.text).not.toContain('id="operator-ducking"');
    const spinning = await getPage('/freestyle/tricks?view=modifier');
    expect(heading(spinning.text, 'modifier', 'spinning'))
      .toBe('<a href="/freestyle/operators#operator-spinning">Spinning</a>');
  });

  // Defect caught: adding the reference link changes the count or the trick
  // list under the heading.
  it('keeps the count and the trick list under a linked heading', async () => {
    const res = await getPage('/freestyle/tricks?view=modifier&modifier=paradox');
    const section = res.text.match(/id="modifier-paradox"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(section).toMatch(/<span class="section-count">1<\/span>/);
    expect(section).toContain('href="/freestyle/tricks/paradox_mirage"');
  });
});

describe('the cut set and modifier scaffolding stays gone', () => {
  // Defect caught: the explanatory box, the scale sentence, the category
  // sections or the other-tracked-groups band come back on either view.
  it('renders none of the removed parts on either view', async () => {
    for (const path of ['/freestyle/tricks?view=set', '/freestyle/tricks?view=modifier']) {
      const res = await getPage(path);
      for (const marker of [
        'class="browse-view-why"', 'class="browse-view-scale"',
        'trick-modifier-cluster-section', 'id="modifier-other-groups"',
      ]) {
        expect(res.text, `${path}: ${marker}`).not.toContain(marker);
      }
    }
  });
});

describe('links into the set and modifier views open the group\'s own page', () => {
  // Defect caught: the family filter's related-group links still jump to an
  // anchor on the old all-groups page, or link a modifier that has no page.
  it('the family filter links each related set or modifier to its own page', async () => {
    const res = await getPage('/freestyle/tricks?family=mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks?view=set&amp;set=pixie"');
    expect(res.text).toContain('href="/freestyle/tricks?view=modifier&amp;modifier=paradox"');
    expect(res.text).not.toContain('modifier=symposium');
    expect(res.text).not.toMatch(/view=(set|modifier)#/);
  });
});

describe('the By ADD view lists each level alphabetically, with no sort control', () => {
  // Defect caught: the sort row or the family bands come back, or a level
  // stops listing its tricks alphabetically.
  it('a level has no sort row and no family bands, and lists its tricks A to Z', async () => {
    const res = await getPage('/freestyle/tricks/3');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('aria-label="Sort within each ADD tier"');
    expect(res.text).not.toContain('trick-add-lineage');
    const order = [...res.text.matchAll(/href="\/freestyle\/tricks\/([a-z_]+_mirage)"/g)]
      .map(m => m[1]!).filter((s, i, a) => a.indexOf(s) === i);
    expect(order).toEqual([
      'ducking_mirage', 'paradox_mirage', 'pixie_mirage', 'quantum_mirage', 'spinning_mirage', 'symposium_mirage',
    ]);
  });

  // Defect caught: the retired sort parameter still changes the page.
  it('ignores the retired sort parameter', async () => {
    const plain = await getPage('/freestyle/tricks/3');
    const sorted = await getPage('/freestyle/tricks/3?sort=family');
    expect(sorted.status).toBe(200);
    expect(sorted.text).not.toContain('trick-add-lineage');
    expect(sorted.text.match(/href="\/freestyle\/tricks\/[a-z_]+_mirage"/g))
      .toEqual(plain.text.match(/href="\/freestyle\/tricks\/[a-z_]+_mirage"/g));
  });
});
