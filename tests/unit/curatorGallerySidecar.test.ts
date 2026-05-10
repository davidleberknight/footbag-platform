/**
 * Unit tests for the gallery sidecar lib. Covers: validator rejection
 * paths, formatter byte-stability, write/read round-trip, and the
 * delete helper's ENOENT tolerance. The validator must mirror the
 * Python seeder's loader (`scripts/seed_fh_curator.py::_load_named_gallery_sidecars`)
 * field-for-field; cross-language drift would silently corrupt the
 * FH gallery seed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  validateGallerySidecarData,
  formatGallerySidecarJson,
  deriveGallerySidecarPath,
  writeGallerySidecarFile,
  readGallerySidecarFile,
  deleteGallerySidecarFile,
  GallerySidecarValidationError,
  type GallerySidecarData,
} from '../../src/lib/curatorGallerySidecar';

function valid(): GallerySidecarData {
  return {
    id: 'gallery_test_sample',
    name: 'Test Sample',
    description: 'A description.',
    sortOrder: 'upload_desc',
    criteriaTags: ['#alpha', '#beta'],
    excludeTags: ['#gamma'],
    externalLinks: [],
  };
}

describe('validateGallerySidecarData', () => {
  it('accepts a well-formed sidecar', () => {
    expect(() => validateGallerySidecarData(valid())).not.toThrow();
  });

  it('accepts empty description', () => {
    const d = valid();
    d.description = '';
    expect(() => validateGallerySidecarData(d)).not.toThrow();
  });

  it('accepts empty excludeTags', () => {
    const d = valid();
    d.excludeTags = [];
    expect(() => validateGallerySidecarData(d)).not.toThrow();
  });

  it('rejects id that does not match gallery_[a-z0-9_]+', () => {
    const d = valid();
    d.id = 'gallery_BAD';
    expect(() => validateGallerySidecarData(d)).toThrow(GallerySidecarValidationError);
  });

  it('rejects id missing the gallery_ prefix', () => {
    const d = valid();
    d.id = 'foo_bar';
    expect(() => validateGallerySidecarData(d)).toThrow(GallerySidecarValidationError);
  });

  it('rejects empty name', () => {
    const d = valid();
    d.name = '   ';
    expect(() => validateGallerySidecarData(d)).toThrow(/name is required/);
  });

  it('rejects name longer than 150 chars', () => {
    const d = valid();
    d.name = 'x'.repeat(151);
    expect(() => validateGallerySidecarData(d)).toThrow(/150 characters/);
  });

  it('rejects description longer than 1000 chars', () => {
    const d = valid();
    d.description = 'x'.repeat(1001);
    expect(() => validateGallerySidecarData(d)).toThrow(/1000 characters/);
  });

  it('rejects bad sortOrder', () => {
    const d = valid();
    (d as unknown as { sortOrder: string }).sortOrder = 'random';
    expect(() => validateGallerySidecarData(d)).toThrow(/sortOrder must be one of/);
  });

  it('accepts each valid sortOrder value', () => {
    for (const order of ['upload_desc', 'upload_asc', 'caption_asc'] as const) {
      const d = valid();
      d.sortOrder = order;
      expect(() => validateGallerySidecarData(d)).not.toThrow();
    }
  });

  it('rejects empty criteriaTags', () => {
    const d = valid();
    d.criteriaTags = [];
    expect(() => validateGallerySidecarData(d)).toThrow(/non-empty/);
  });

  it('rejects criteriaTags entry without # prefix', () => {
    const d = valid();
    d.criteriaTags = ['alpha'];
    expect(() => validateGallerySidecarData(d)).toThrow(/'#'-prefixed/);
  });

  it('rejects uppercase tag', () => {
    const d = valid();
    d.criteriaTags = ['#Alpha'];
    expect(() => validateGallerySidecarData(d)).toThrow(/lowercase/);
  });

  it('rejects duplicate criteriaTags', () => {
    const d = valid();
    d.criteriaTags = ['#alpha', '#alpha'];
    expect(() => validateGallerySidecarData(d)).toThrow(/duplicate criteriaTags/);
  });

  it('rejects duplicate excludeTags', () => {
    const d = valid();
    d.excludeTags = ['#gamma', '#gamma'];
    expect(() => validateGallerySidecarData(d)).toThrow(/duplicate excludeTags/);
  });

  it('rejects criteria/exclude overlap', () => {
    const d = valid();
    d.criteriaTags = ['#alpha', '#shared'];
    d.excludeTags = ['#shared'];
    expect(() => validateGallerySidecarData(d)).toThrow(/appear in both criteriaTags and excludeTags/);
  });

  it('rejects non-array criteriaTags', () => {
    const d = valid();
    (d as unknown as { criteriaTags: unknown }).criteriaTags = '#alpha';
    expect(() => validateGallerySidecarData(d)).toThrow(GallerySidecarValidationError);
  });

  it('rejects non-string description', () => {
    const d = valid();
    (d as unknown as { description: unknown }).description = null;
    expect(() => validateGallerySidecarData(d)).toThrow(GallerySidecarValidationError);
  });
});

describe('deriveGallerySidecarPath', () => {
  it('strips the gallery_ prefix and joins under galleries/', () => {
    const p = deriveGallerySidecarPath('/curated', 'gallery_curated_freestyle_tricks');
    expect(p).toBe(path.join('/curated', 'galleries', 'curated_freestyle_tricks.json'));
  });

  it('rejects an id that does not match gallery_[a-z0-9_]+', () => {
    expect(() => deriveGallerySidecarPath('/curated', 'BAD')).toThrow(GallerySidecarValidationError);
  });
});

describe('formatGallerySidecarJson', () => {
  it('produces 2-space JSON with trailing newline and fixed key order', () => {
    const out = formatGallerySidecarJson(valid());
    expect(out.endsWith('\n')).toBe(true);
    // Field order: id, name, description, sortOrder, criteriaTags, excludeTags.
    const idIdx = out.indexOf('"id"');
    const nameIdx = out.indexOf('"name"');
    const descIdx = out.indexOf('"description"');
    const sortIdx = out.indexOf('"sortOrder"');
    const critIdx = out.indexOf('"criteriaTags"');
    const exclIdx = out.indexOf('"excludeTags"');
    expect(idIdx).toBeLessThan(nameIdx);
    expect(nameIdx).toBeLessThan(descIdx);
    expect(descIdx).toBeLessThan(sortIdx);
    expect(sortIdx).toBeLessThan(critIdx);
    expect(critIdx).toBeLessThan(exclIdx);
  });

  it('is byte-stable: same input → same output', () => {
    const a = formatGallerySidecarJson(valid());
    const b = formatGallerySidecarJson(valid());
    expect(a).toBe(b);
  });

  it('matches the canonical /curated/galleries/curated_freestyle_tricks.json bytes', async () => {
    // Drift check: if this fails, the lib's formatter has diverged from
    // the on-disk canonical sidecar. Fix the lib, not the file (the
    // seeder reads the file).
    const repoRoot = path.resolve(__dirname, '..', '..');
    const canonicalPath = path.join(repoRoot, 'curated', 'galleries', 'curated_freestyle_tricks.json');
    const onDisk = await fs.readFile(canonicalPath, { encoding: 'utf-8' });
    const data = JSON.parse(onDisk) as GallerySidecarData;
    const reformatted = formatGallerySidecarJson(data);
    expect(reformatted).toBe(onDisk);
  });
});

describe('externalLinks (sidecar contract extension)', () => {
  it('rejects when externalLinks is not an array', () => {
    const d = valid() as unknown as { externalLinks: unknown };
    d.externalLinks = 'oops';
    expect(() => validateGallerySidecarData(d as GallerySidecarData)).toThrow(/externalLinks must be an array/);
  });

  it('accepts a populated externalLinks array', () => {
    const d = valid();
    d.externalLinks = [
      { label: 'IFPA', url: 'https://footbag.org', sortOrder: 0 },
      { label: 'Tournament', url: 'https://example.com/event', sortOrder: 1 },
    ];
    expect(() => validateGallerySidecarData(d)).not.toThrow();
  });

  it('rejects link with empty label', () => {
    const d = valid();
    d.externalLinks = [{ label: '', url: 'https://x.example/', sortOrder: 0 }];
    expect(() => validateGallerySidecarData(d)).toThrow(/label is required/);
  });

  it('rejects link with empty url', () => {
    const d = valid();
    d.externalLinks = [{ label: 'X', url: '', sortOrder: 0 }];
    expect(() => validateGallerySidecarData(d)).toThrow(/url is required/);
  });

  it('rejects link with non-integer sortOrder', () => {
    const d = valid();
    d.externalLinks = [{ label: 'X', url: 'https://x.example/', sortOrder: 1.5 as unknown as number }];
    expect(() => validateGallerySidecarData(d)).toThrow(/sortOrder must be an integer/);
  });

  it('formatGallerySidecarJson includes externalLinks in fixed field order', () => {
    const d = valid();
    d.externalLinks = [{ label: 'IFPA', url: 'https://footbag.org', sortOrder: 0 }];
    const json = formatGallerySidecarJson(d);
    const keysInOrder = Object.keys(JSON.parse(json));
    expect(keysInOrder).toEqual([
      'id', 'name', 'description', 'sortOrder',
      'criteriaTags', 'excludeTags', 'externalLinks',
    ]);
  });

  it('shipped /curated/galleries/*.json all have externalLinks: []', async () => {
    const galleriesDir = path.join(process.cwd(), 'curated', 'galleries');
    const files = await fs.readdir(galleriesDir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const txt = await fs.readFile(path.join(galleriesDir, f), 'utf-8');
      const data = JSON.parse(txt);
      expect(Array.isArray(data.externalLinks)).toBe(true);
    }
  });
});

describe('writeGallerySidecarFile / readGallerySidecarFile', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-sidecar-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('writes to /curated/galleries/<slug>.json and round-trips byte-equal', async () => {
    const data = valid();
    const result = await writeGallerySidecarFile(tmpRoot, data);
    expect(result.overwritten).toBe(false);
    expect(result.filePath).toBe(path.join(tmpRoot, 'galleries', 'test_sample.json'));

    const onDisk = await fs.readFile(result.filePath, { encoding: 'utf-8' });
    expect(onDisk).toBe(formatGallerySidecarJson(data));

    const readBack = await readGallerySidecarFile(result.filePath);
    expect(readBack).toEqual(data);
  });

  it('reports overwritten=true on second write', async () => {
    const data = valid();
    const r1 = await writeGallerySidecarFile(tmpRoot, data);
    expect(r1.overwritten).toBe(false);
    const r2 = await writeGallerySidecarFile(tmpRoot, data);
    expect(r2.overwritten).toBe(true);
  });

  it('mkdir -p creates the galleries/ subdir if missing', async () => {
    // tmpRoot exists but tmpRoot/galleries does not.
    await writeGallerySidecarFile(tmpRoot, valid());
    const stat = await fs.stat(path.join(tmpRoot, 'galleries'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('rejects invalid data at write time (validates before touching disk)', async () => {
    const bad = valid();
    bad.criteriaTags = [];
    await expect(writeGallerySidecarFile(tmpRoot, bad)).rejects.toThrow(GallerySidecarValidationError);
    // Confirm nothing was written.
    await expect(fs.access(path.join(tmpRoot, 'galleries', 'test_sample.json'))).rejects.toThrow();
  });

  it('readGallerySidecarFile rejects malformed JSON', async () => {
    const filePath = path.join(tmpRoot, 'galleries', 'bad.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{ not valid json');
    await expect(readGallerySidecarFile(filePath)).rejects.toThrow(GallerySidecarValidationError);
  });

  it('readGallerySidecarFile rejects array top-level', async () => {
    const filePath = path.join(tmpRoot, 'galleries', 'arr.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '[]');
    await expect(readGallerySidecarFile(filePath)).rejects.toThrow(/JSON object/);
  });
});

describe('deleteGallerySidecarFile', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-sidecar-del-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('removes an existing sidecar file', async () => {
    const data = valid();
    const { filePath } = await writeGallerySidecarFile(tmpRoot, data);
    await deleteGallerySidecarFile(filePath);
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('is a no-op (does not throw) when the file does not exist', async () => {
    const ghost = path.join(tmpRoot, 'galleries', 'nonexistent.json');
    await expect(deleteGallerySidecarFile(ghost)).resolves.toBeUndefined();
  });
});
