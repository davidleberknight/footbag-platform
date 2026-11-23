/**
 * Integration tests for scripts/check-archive-pages.py, the byte-level check
 * an archive edit must pass before any of its files reach the bucket.
 *
 * Each case builds a small tree of the files an edit would write, plus the
 * bucket's key listing, in a scratch directory and runs the real checker over
 * it. A refusal is always paired with the sound form of the same thing passing,
 * so a checker that refuses everything cannot pass this suite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const CHECKER = path.resolve(__dirname, '..', '..', 'scripts', 'check-archive-pages.py');

let root: string;
let caseCount = 0;

beforeAll(() => {
  root = createScratchDir('check-archive-pages');
});
afterAll(() => removeScratch(root));

interface CheckOpts {
  bucketKeys?: string[];
  deleted?: string[];
  /** Check only these keys; every file is still read for links to deleted keys. */
  only?: string[];
}

function check(files: Record<string, string | Buffer>, opts: CheckOpts = {}) {
  const dir = path.join(root, `case-${++caseCount}`);
  const tree = path.join(dir, 'tree');
  for (const [key, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(tree, key)), { recursive: true });
    fs.writeFileSync(path.join(tree, key), body);
  }
  fs.mkdirSync(tree, { recursive: true });
  const keysFile = path.join(dir, 'bucket-keys.txt');
  fs.writeFileSync(keysFile, (opts.bucketKeys ?? []).map((k) => `${k}\n`).join(''));
  const args = [CHECKER, '--root', tree, '--bucket-keys', keysFile];
  if (opts.deleted) {
    fs.writeFileSync(path.join(dir, 'deleted.txt'), opts.deleted.map((k) => `${k}\n`).join(''));
    args.push('--deleted', path.join(dir, 'deleted.txt'));
  }
  if (opts.only) {
    fs.writeFileSync(path.join(dir, 'only.txt'), opts.only.map((k) => `${k}\n`).join(''));
    args.push('--only', path.join(dir, 'only.txt'));
  }
  const res = spawnSync('python3', args, { encoding: 'utf-8', ...SPAWN_GUARD });
  const findings = (res.stdout ?? '').split('\n').filter(Boolean);
  return { status: res.status, findings, stderr: res.stderr };
}

const page = (body: string) => `<html><head><meta charset="utf-8"></head><body>${body}</body></html>`;

describe('check-archive-pages.py: a sound edit passes', () => {
  it('accepts a page whose links land on bucket keys and on its own sibling files', () => {
    // Defect caught: a checker that cannot resolve links refuses every real
    // edit, so operators learn to work around it.
    const res = check({
      'news/item.html': page([
        '<a href="/events/">events</a>',            // directory URL, served as its index page
        '<a href="../clubs/list.html">clubs</a>',    // page-relative, held only in the bucket
        '<img src="photo.jpg">',                     // a sibling file written by the same edit
        '<a href="https://www.footbag.org/">live site</a>', // the banner's way out to the live site
        '<img src="https://media.footbag.org/x.jpg">', // a footbag host is not another website
        '<embed src="//footbag.org/">',               // the apex host is footbag's own, not another website
        '<!-- <script src="old.js"></script> <form action="/x"></form> <a href="gone.html">x</a> -->',
        'text',
      ].join('')),
      'news/photo.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]),
      'feeds/rss.html': '<?xml version="1.0"?><rss><channel></channel></rss>',
    }, { bucketKeys: ['events/index.html', 'clubs/list.html'] });
    expect(res.findings).toEqual([]);
    expect(res.status, res.stderr).toBe(0);
  });
});

describe('check-archive-pages.py: each archive promise is refused when broken', () => {
  // Each row: the files, the finding a broken edit must draw, and why it matters.
  const cases: Array<[string, Record<string, string | Buffer>, string]> = [
    // A frozen archive runs nothing.
    ['a script element', { 'a.html': page('<script>alert(1)</script>x') }, 'a.html: code: a <script> element'],
    // A form's backend no longer exists; a surviving control posts nowhere or to the live site.
    ['a form', { 'a.html': page('<form action="/x"><input name="q"></form>x') }, 'a.html: form control:'],
    // The legacy registration form carried the account's password in a hidden field.
    ['a password field', { 'a.html': page('<input type="hidden" name="memberPassword" value="p">x') }, 'a.html: credential field:'],
    // A server-side include is an instruction to the old server, which the archive holds none of.
    ['a server directive', { 'a.html': page('<!--#include virtual="/ads/show" -->x') }, 'a.html: code: a server-side include directive'],
    // Without a declared encoding every accented name turns to mojibake.
    ['no character set', { 'a.html': '<html><head></head><body>x</body></html>' }, 'a.html: no character set:'],
    // A spreadsheet export's CSS font property names the word but declares nothing.
    ['only a spreadsheet font charset', { 'a.html': '<html><head><style>td{mso-font-charset:0}</style></head><body>x</body></html>' }, 'a.html: no character set:'],
    // Image bytes under a page name are served as text and destroyed.
    ['image bytes under a page name', { 'a.html': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x4a, 0x46, 0x49, 0x46]) }, 'a.html: binary under a page name:'],
    // A page under a media name is served to an <img> tag and shows nothing.
    ['a page under a media name', { 'a.jpg': '<!DOCTYPE html><html></html>' }, 'a.jpg: page under a media name:'],
    // An absolute legacy-host address goes dark when the old site shuts down.
    ['a live-host link', { 'a.html': page('<a href="http://footbag.org/news/1">n</a>') }, 'a.html: live-host reference: http://footbag.org/news/1'],
    // Another site's resource runs code or reports the reader to a third party.
    ['an off-site resource', { 'a.html': page('<iframe src="https://evilfootbag.org/p"></iframe>x') }, 'a.html: off-site resource: <iframe src> https://evilfootbag.org/p'],
    // A husk renders nothing for a member who follows a link to it.
    ['an empty page', { 'a.html': page('<div id="mirror-archive-banner">Archive</div>  ') }, 'a.html: empty page:'],
    // A link to a key neither the bucket nor the edit holds is a broken page.
    ['a dead link', { 'a.html': page('<a href="missing.html">m</a>') }, 'a.html: dead link: missing.html'],
    // Code by file type: a static archive cannot hold anything that runs.
    ['a script file', { 'lib/app.js': 'alert(1)' }, 'lib/app.js: code:'],
    // A type the archive does not serve was never scanned for what it carries.
    ['a type the archive does not serve', { 'docs/minutes.doc': 'x' }, 'docs/minutes.doc: type not served: .doc'],
    // The publish exclusion list withholds some paths whose type is otherwise served.
    ['a path the publish exclusion list withholds', { 'media/1458/x/index.html': page('x') }, 'media/1458/x/index.html: type not served: withheld'],
  ];

  for (const [name, files, finding] of cases) {
    it(`refuses ${name}`, () => {
      const res = check(files);
      expect(res.status, res.stderr).toBe(1);
      expect(res.findings.some((f) => f.startsWith(finding)), `${res.findings.join('\n')}`).toBe(true);
    });
  }
});

describe('check-archive-pages.py: deletes leave no page pointing at them', () => {
  const linking = page('<a href="old.html">old</a>');

  it('refuses a delete that an unchanged page in the pulled tree still links to', () => {
    // Defect caught: a withdrawn page leaves dead links across the archive. The
    // linking page is outside the checked set, so only the deleted-key scan sees it.
    const res = check({ 'a/index.html': linking, 'a/new.html': page('x') },
      { bucketKeys: ['a/old.html'], deleted: ['a/old.html'], only: ['a/new.html'] });
    expect(res.status).toBe(1);
    expect(res.findings).toEqual(['a/index.html: links to a deleted key: old.html']);
  });

  it('refuses a delete of a directory index that a page links to by its directory address', () => {
    // Both spellings of a directory address: with the trailing slash and without.
    const res = check({ 'a/index.html': page('<a href="sub/">sub</a><a href="/a/sub">sub</a>') },
      { bucketKeys: ['a/sub/index.html'], deleted: ['a/sub/index.html'], only: [] });
    expect(res.status).toBe(1);
    expect(res.findings).toEqual(['a/index.html: links to a deleted key: sub/', 'a/index.html: links to a deleted key: /a/sub']);
  });

  it('accepts the same tree when nothing is deleted', () => {
    const res = check({ 'a/index.html': linking, 'a/new.html': page('x') },
      { bucketKeys: ['a/old.html'], only: ['a/new.html'] });
    expect(res.findings).toEqual([]);
    expect(res.status).toBe(0);
  });
});
