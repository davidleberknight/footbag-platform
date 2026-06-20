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
});
