/**
 * The image container's pinned tools agree with the one tool-version list.
 *
 * The image container runs the transcode, so its ffmpeg is the one production
 * uses; it is held to an exact package version in its Dockerfile, and that
 * version is the list's FFMPEG_VERSION. The sqlite3 command-line tool the
 * hosts, CI and workstations build is held to the engine the app bundles, so
 * SQLITE_VERSION is the version better-sqlite3 compiles in.
 *
 * Static-text reads of the committed files, because CI runs vitest and not
 * docker; the built image's own report is checked by scripts/check-versions.sh.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const list = readFileSync(join(root, 'ops', 'tool-versions.env'), 'utf8');

function pin(key: string): string {
  const line = list.split('\n').filter((l) => l.startsWith(`${key}=`)).pop();
  expect(line, `${key} in ops/tool-versions.env`).toBeDefined();
  return (line as string).slice(key.length + 1);
}

describe('pinned tools in the images and the app', () => {
  // Defect caught: the ffmpeg pin moved in the list but not in the image (or
  // the reverse), so the tests and the version report described one decoder
  // while production transcoded with another.
  it('installs exactly FFMPEG_VERSION in the image container', () => {
    const dockerfile = readFileSync(join(root, 'docker', 'image', 'Dockerfile'), 'utf8');
    const installs = [...dockerfile.matchAll(/apk add[^\n]*\bffmpeg(=\S+)?/g)].map((m) => m[1] ?? '');
    expect(installs).toEqual([`=${pin('FFMPEG_VERSION')}`]);
  });

  // Defect caught: better-sqlite3 was upgraded to a newer bundled engine while
  // the hosts' sqlite3 stayed behind, so the backup and restore would handle a
  // database with an older engine than the one that wrote it.
  it('pins the sqlite3 tool to the engine better-sqlite3 bundles', () => {
    const download = readFileSync(join(root, 'node_modules', 'better-sqlite3', 'deps', 'download.sh'), 'utf8');
    const encoded = /^VERSION="(\d{7})"/m.exec(download)?.[1];
    expect(encoded, 'VERSION in better-sqlite3 deps/download.sh').toBeDefined();
    const n = Number(encoded);
    const bundled = `${Math.floor(n / 1_000_000)}.${Math.floor(n / 10_000) % 100}.${Math.floor(n / 100) % 100}`;
    expect(pin('SQLITE_VERSION')).toBe(bundled);
  });
});
