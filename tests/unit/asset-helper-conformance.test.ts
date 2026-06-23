/**
 * Asset-fingerprinting enforcement: every site CSS, JS, image, and font reference
 * in a template must go through the `asset` helper (which emits a content-hashed,
 * immutable path), never a hardcoded `/css/*`, `/js/*`, `/img/*`, or `/fonts/*`
 * URL. A raw URL would bypass cache-busting and serve stale assets after a deploy,
 * so this fails the build if one is added.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const VIEWS = path.join(process.cwd(), 'src', 'views');

function allHbs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return allHbs(full);
    return e.name.endsWith('.hbs') ? [full] : [];
  });
}

describe('static-asset helper conformance', () => {
  it('no template hardcodes a /css/* /js/* /img/* or /fonts/* URL (must use the asset helper)', () => {
    const offenders: string[] = [];
    for (const file of allHbs(VIEWS)) {
      const txt = fs.readFileSync(file, 'utf8');
      if (/(?:href|src)="\/(?:css|js|img|fonts)\//.test(txt)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders, `use {{{asset '...'}}} instead of a raw /css /js /img or /fonts URL:\n${offenders.join('\n')}`).toEqual([]);
  });
});
