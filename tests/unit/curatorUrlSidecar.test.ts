import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  validateUrlSidecarData,
  deriveUrlSidecarFilename,
  formatUrlSidecarJson,
  writeUrlSidecarFile,
  readUrlSidecarFile,
  deleteUrlSidecarFile,
  resolveSidecarForRow,
  UrlSidecarValidationError,
  type UrlSidecarData,
} from '../../src/lib/curatorUrlSidecar';

function youtubeBase(): UrlSidecarData {
  return {
    videoUrl: 'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
    videoPlatform: 'youtube',
    title: 'Demo title',
    tags: ['#freestyle', '#trick', '#around-the-world'],
  };
}

function vimeoBase(): UrlSidecarData {
  return {
    videoUrl: 'https://vimeo.com/12345678',
    videoPlatform: 'vimeo',
    title: 'Demo Vimeo',
    thumbnailUrl: 'https://i.vimeocdn.com/video/abc_640.jpg',
    tags: ['#freestyle', '#trick', '#blender'],
  };
}

describe('validateUrlSidecarData', () => {
  it('accepts a well-formed YouTube sidecar', () => {
    expect(() => validateUrlSidecarData(youtubeBase())).not.toThrow();
  });

  it('accepts a well-formed Vimeo sidecar with https thumbnailUrl', () => {
    expect(() => validateUrlSidecarData(vimeoBase())).not.toThrow();
  });

  it('rejects missing videoUrl', () => {
    const d = youtubeBase();
    (d as unknown as { videoUrl: string }).videoUrl = '';
    expect(() => validateUrlSidecarData(d)).toThrow(UrlSidecarValidationError);
  });

  it('rejects unsupported videoPlatform', () => {
    const d = youtubeBase();
    (d as unknown as { videoPlatform: string }).videoPlatform = 'tiktok';
    expect(() => validateUrlSidecarData(d)).toThrow(/videoPlatform/);
  });

  it('rejects YouTube sidecar with thumbnailUrl set', () => {
    const d = youtubeBase();
    d.thumbnailUrl = 'https://i.ytimg.com/vi/X/hqdefault.jpg';
    expect(() => validateUrlSidecarData(d)).toThrow(/thumbnailUrl must NOT appear/);
  });

  it('rejects Vimeo sidecar without thumbnailUrl', () => {
    const d = vimeoBase();
    delete d.thumbnailUrl;
    expect(() => validateUrlSidecarData(d)).toThrow(/vimeo sidecars must include thumbnailUrl/);
  });

  it('rejects Vimeo sidecar with non-https thumbnailUrl', () => {
    const d = vimeoBase();
    d.thumbnailUrl = 'http://i.vimeocdn.com/video/abc_640.jpg';
    expect(() => validateUrlSidecarData(d)).toThrow(/https:\/\//);
  });

  it('rejects empty tags array', () => {
    const d = youtubeBase();
    d.tags = [];
    expect(() => validateUrlSidecarData(d)).toThrow(/non-empty array/);
  });

  it('rejects tag without # prefix', () => {
    const d = youtubeBase();
    d.tags = ['no-hash'];
    expect(() => validateUrlSidecarData(d)).toThrow(/'#'/);
  });

  it('rejects uppercase tag', () => {
    const d = youtubeBase();
    d.tags = ['#Freestyle'];
    expect(() => validateUrlSidecarData(d)).toThrow(/lowercase/);
  });

  it('rejects #curated in caller-supplied tags', () => {
    const d = youtubeBase();
    d.tags = ['#curated', '#freestyle', '#trick'];
    expect(() => validateUrlSidecarData(d)).toThrow(/auto-prepends/);
  });
});

describe('deriveUrlSidecarFilename', () => {
  it('produces <slug>_<8hex>.meta.json', () => {
    const filename = deriveUrlSidecarFilename(
      'around-the-world',
      'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
    );
    expect(filename).toMatch(/^around-the-world_[0-9a-f]{8}\.meta\.json$/);
  });

  it('is deterministic for the same URL (idempotent re-uploads)', () => {
    const a = deriveUrlSidecarFilename('atom-smasher', 'https://vimeo.com/12345678');
    const b = deriveUrlSidecarFilename('atom-smasher', 'https://vimeo.com/12345678');
    expect(a).toBe(b);
  });

  it('different URLs produce different filenames for the same slug', () => {
    const a = deriveUrlSidecarFilename('blender', 'https://www.youtube.com/watch?v=AAAAAAAAAAA');
    const b = deriveUrlSidecarFilename('blender', 'https://www.youtube.com/watch?v=BBBBBBBBBBB');
    expect(a).not.toBe(b);
  });

  it('rejects slug with uppercase or invalid chars', () => {
    expect(() => deriveUrlSidecarFilename('Around-The-World', 'https://x')).toThrow(/lowercase/);
    expect(() => deriveUrlSidecarFilename('around the world', 'https://x')).toThrow();
    expect(() => deriveUrlSidecarFilename('', 'https://x')).toThrow();
  });
});

describe('formatUrlSidecarJson', () => {
  it('YouTube: 2-space JSON, trailing newline, no thumbnailUrl', () => {
    const out = formatUrlSidecarJson(youtubeBase());
    expect(out.endsWith('\n')).toBe(true);
    expect(out).toContain('"videoUrl"');
    expect(out).toContain('"videoPlatform"');
    expect(out).not.toContain('"thumbnailUrl"');
    expect(JSON.parse(out)).toMatchObject({ videoPlatform: 'youtube' });
  });

  it('Vimeo: includes thumbnailUrl', () => {
    const out = formatUrlSidecarJson(vimeoBase());
    expect(out).toContain('"thumbnailUrl"');
    expect(JSON.parse(out)).toMatchObject({
      videoPlatform: 'vimeo',
      thumbnailUrl: 'https://i.vimeocdn.com/video/abc_640.jpg',
    });
  });

  it('omits null optional fields (creator, sourceId, tier)', () => {
    const out = formatUrlSidecarJson(youtubeBase());
    expect(out).not.toContain('"creator"');
    expect(out).not.toContain('"sourceId"');
    expect(out).not.toContain('"tier"');
  });

  it('preserves field order: videoUrl first, tags last', () => {
    const out = formatUrlSidecarJson({
      videoUrl: 'https://www.youtube.com/watch?v=ABCABCABCAB',
      videoPlatform: 'youtube',
      title: 'T',
      creator: 'C',
      sourceId: 'src',
      tier: 'CANONICAL_TUTORIAL',
      tags: ['#freestyle', '#trick', '#x'],
    });
    expect(out.indexOf('"videoUrl"')).toBeLessThan(out.indexOf('"videoPlatform"'));
    expect(out.indexOf('"creator"')).toBeLessThan(out.indexOf('"sourceId"'));
    expect(out.indexOf('"tags"')).toBeGreaterThan(out.indexOf('"tier"'));
  });
});

describe('writeUrlSidecarFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'curated-url-sidecar-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the file with given filename + content', async () => {
    const json = formatUrlSidecarJson(youtubeBase());
    const result = await writeUrlSidecarFile(tmpDir, 'around-the-world_aabbccdd.meta.json', json);
    expect(result.filename).toBe('around-the-world_aabbccdd.meta.json');
    expect(result.overwritten).toBe(false);
    const written = await fs.readFile(result.filePath, 'utf-8');
    expect(written).toBe(json);
  });

  it('reports overwritten=true when target already exists', async () => {
    const json = formatUrlSidecarJson(youtubeBase());
    const filename = 'overwrite-me_aabbccdd.meta.json';
    await writeUrlSidecarFile(tmpDir, filename, json);
    const result = await writeUrlSidecarFile(tmpDir, filename, json);
    expect(result.overwritten).toBe(true);
  });
});

describe('readUrlSidecarFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'curated-url-sidecar-read-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('round-trips a file written by writeUrlSidecarFile', async () => {
    const original = youtubeBase();
    const json = formatUrlSidecarJson(original);
    const result = await writeUrlSidecarFile(tmpDir, 'rt_11223344.meta.json', json);
    const loaded = await readUrlSidecarFile(result.filePath);
    expect(loaded.videoUrl).toBe(original.videoUrl);
    expect(loaded.videoPlatform).toBe(original.videoPlatform);
    expect(loaded.title).toBe(original.title);
    expect(loaded.tags).toEqual(original.tags);
  });

  it('throws UrlSidecarValidationError on malformed JSON', async () => {
    const filePath = path.join(tmpDir, 'bad_aabbccdd.meta.json');
    await fs.writeFile(filePath, '{ not json', 'utf-8');
    await expect(readUrlSidecarFile(filePath)).rejects.toThrow(UrlSidecarValidationError);
  });

  it('throws UrlSidecarValidationError when JSON root is not an object', async () => {
    const filePath = path.join(tmpDir, 'arr_aabbccdd.meta.json');
    await fs.writeFile(filePath, '[]', 'utf-8');
    await expect(readUrlSidecarFile(filePath)).rejects.toThrow(UrlSidecarValidationError);
  });

  it('throws UrlSidecarValidationError on schema violation (#curated in tags)', async () => {
    const filePath = path.join(tmpDir, 'badtags_aabbccdd.meta.json');
    const bad = { ...youtubeBase(), tags: ['#freestyle', '#curated'] };
    await fs.writeFile(filePath, JSON.stringify(bad), 'utf-8');
    await expect(readUrlSidecarFile(filePath)).rejects.toThrow(UrlSidecarValidationError);
  });

  it('propagates ENOENT when the file is missing', async () => {
    await expect(
      readUrlSidecarFile(path.join(tmpDir, 'does-not-exist.meta.json')),
    ).rejects.toThrow(/ENOENT/);
  });
});

describe('deleteUrlSidecarFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'curated-url-sidecar-delete-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('unlinks an existing file', async () => {
    const filePath = path.join(tmpDir, 'doomed_aabbccdd.meta.json');
    await fs.writeFile(filePath, '{}', 'utf-8');
    await deleteUrlSidecarFile(filePath);
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('is ENOENT-tolerant (no throw) when the file is missing', async () => {
    await expect(
      deleteUrlSidecarFile(path.join(tmpDir, 'gone.meta.json')),
    ).resolves.toBeUndefined();
  });
});

describe('resolveSidecarForRow', () => {
  let tmpDir: string;
  let categoryDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'curated-resolve-'));
    categoryDir = path.join(tmpDir, 'freestyle_tricks');
    await fs.mkdir(categoryDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null for non-URL-ref rows (photo)', async () => {
    const out = await resolveSidecarForRow(tmpDir, { video_platform: null, video_url: null });
    expect(out).toBeNull();
  });

  it('returns null for s3 video rows (file-paired curator upload)', async () => {
    const out = await resolveSidecarForRow(tmpDir, {
      video_platform: 's3', video_url: null,
    });
    expect(out).toBeNull();
  });

  it('returns null when no matching sidecar is on disk', async () => {
    const out = await resolveSidecarForRow(tmpDir, {
      video_platform: 'youtube',
      video_url: 'https://www.youtube.com/watch?v=NOT_PRESENT',
    });
    expect(out).toBeNull();
  });

  it('returns the absolute path on (videoPlatform, videoUrl) match', async () => {
    const data = youtubeBase();
    const filename = deriveUrlSidecarFilename('around-the-world', data.videoUrl);
    const filePath = path.join(categoryDir, filename);
    await fs.writeFile(filePath, formatUrlSidecarJson(data), 'utf-8');

    const out = await resolveSidecarForRow(tmpDir, {
      video_platform: 'youtube',
      video_url: data.videoUrl,
    });
    expect(out).toBe(filePath);
  });

  it('rejects an 8-char hash collision when the URL does not match (verify gate)', async () => {
    // Write a sidecar whose filename hash is sha1(URL_A)[:8] but whose
    // *content* references URL_B. resolveSidecarForRow must skip it and
    // return null when asked for URL_A, because the verify reads the
    // file and checks the videoUrl field.
    const urlA = 'https://www.youtube.com/watch?v=WANTED___';
    const urlB = 'https://www.youtube.com/watch?v=DIFFERENT';
    const filenameForA = deriveUrlSidecarFilename('decoy', urlA);
    const trickedSidecar = { ...youtubeBase(), videoUrl: urlB };
    await fs.writeFile(
      path.join(categoryDir, filenameForA),
      formatUrlSidecarJson(trickedSidecar),
      'utf-8',
    );

    const out = await resolveSidecarForRow(tmpDir, {
      video_platform: 'youtube', video_url: urlA,
    });
    expect(out).toBeNull();
  });

  it('returns null when curatedRootDir does not exist', async () => {
    const out = await resolveSidecarForRow(
      path.join(tmpDir, 'does-not-exist'),
      { video_platform: 'youtube', video_url: 'https://www.youtube.com/watch?v=ANYTHING' },
    );
    expect(out).toBeNull();
  });
});
