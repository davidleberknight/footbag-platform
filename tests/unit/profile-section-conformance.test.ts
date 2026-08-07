/**
 * One-section-system conformance for the member profile.
 *
 * The profile must compose from a single section pattern: the `.profile-section`
 * container with the `.profile-section-heading` label. It must not reintroduce
 * the site-wide `.section-heading` (the 1.8rem h2 system) in its own markup, and
 * no single view file may mix the two heading systems on one page.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const VIEWS = path.join(process.cwd(), 'src', 'views');
const PARTIALS = path.join(VIEWS, 'partials');

function memberBlockPartials(): string[] {
  return fs
    .readdirSync(PARTIALS)
    .filter((f) => f.startsWith('member-block-') && f.endsWith('.hbs'))
    .map((f) => path.join(PARTIALS, f));
}

function profileOwnedFiles(): string[] {
  return [
    path.join(VIEWS, 'members', 'profile.hbs'),
    path.join(VIEWS, 'members', 'public-profile.hbs'),
    ...memberBlockPartials(),
  ];
}

function partialsReferencedBy(file: string): string[] {
  const txt = fs.readFileSync(file, 'utf8');
  return [...txt.matchAll(/\{\{>\s*([a-z0-9_-]+)/gi)].map((m) => m[1]);
}

/**
 * Partials the member profile renders that are also rendered by a page outside
 * the members section. Derived rather than listed, so a newly shared partial
 * joins the check on its own.
 */
function sharedPartialsRenderedInsideProfileSections(): string[] {
  const profilePages = [
    path.join(VIEWS, 'members', 'profile.hbs'),
    path.join(VIEWS, 'members', 'public-profile.hbs'),
  ];
  const usedByProfile = new Set(profilePages.flatMap(partialsReferencedBy));
  const outsideMembers = allViewFiles(VIEWS).filter(
    (f) => !f.startsWith(path.join(VIEWS, 'members')) && !f.startsWith(PARTIALS),
  );
  const usedElsewhere = new Set(outsideMembers.flatMap(partialsReferencedBy));
  return [...usedByProfile]
    .filter((name) => usedElsewhere.has(name))
    .map((name) => path.join(PARTIALS, `${name}.hbs`))
    .filter((p) => fs.existsSync(p));
}

function allViewFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return allViewFiles(full);
    return e.name.endsWith('.hbs') ? [full] : [];
  });
}

describe('member profile section-system conformance', () => {
  it('uses no .section-heading in profile-owned markup (one heading system)', () => {
    const offenders = profileOwnedFiles().filter((f) =>
      fs.readFileSync(f, 'utf8').includes('class="section-heading"'),
    );
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it('every profile-owned section heading is the .profile-section-heading label', () => {
    for (const f of memberBlockPartials()) {
      const txt = fs.readFileSync(f, 'utf8');
      for (const h2 of txt.match(/<h2[^>]*>/g) ?? []) {
        expect(h2, `${path.basename(f)} heading must use profile-section-heading`).toContain(
          'profile-section-heading',
        );
      }
    }
  });

  it('no single view file mixes the two section-heading systems', () => {
    const mixers = allViewFiles(VIEWS).filter((f) => {
      const txt = fs.readFileSync(f, 'utf8');
      return txt.includes('class="section-heading"') && txt.includes('class="profile-section-heading"');
    });
    expect(mixers.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it('a partial rendered by both a profile and a non-profile page carries no heading', () => {
    // Checking each file on its own cannot catch this: the heading arrives
    // through a partial, so the page that mixes systems contains only one of
    // them in its own markup. A shared partial therefore leaves the heading to
    // whichever page renders it, and each page uses its own system.
    const shared = sharedPartialsRenderedInsideProfileSections();
    // Without this the loop below would pass by running zero times if the
    // derivation ever stopped finding anything.
    expect(shared.length).toBeGreaterThan(0);
    for (const f of shared) {
      const txt = fs.readFileSync(f, 'utf8');
      expect(txt, `${path.basename(f)} must not carry a section heading`).not.toContain(
        'class="section-heading"',
      );
      expect(txt, `${path.basename(f)} must not carry its own h2`).not.toMatch(/<h2[\s>]/);
    }
  });
});
