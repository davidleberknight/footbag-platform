/**
 * Unit tests for curatorSidecar — pure JSON sidecar IO. No DB, no HTTP.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  readSidecar,
  writeSidecar,
  deleteSidecar,
  sidecarPathForSource,
  SIDECAR_CAPTION_MAX_LEN,
  SIDECAR_TAG_MAX_LEN,
} from '../../src/lib/curatorSidecar';
import { ValidationError } from '../../src/services/serviceErrors';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'curated-sidecar-test-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('sidecarPathForSource', () => {
  it('strips extension and appends .meta.json', () => {
    expect(sidecarPathForSource('ripwalk.mp4')).toBe('ripwalk.meta.json');
    expect(sidecarPathForSource('fh-avatar.jpg')).toBe('fh-avatar.meta.json');
    expect(sidecarPathForSource('demo.poster.jpg')).toBe('demo.poster.meta.json');
  });

  it('handles files with no extension', () => {
    expect(sidecarPathForSource('README')).toBe('README.meta.json');
  });
});

describe('readSidecar', () => {
  it('parses a valid sidecar with all fields', () => {
    writeFileSync(
      join(tmp, 'fh-avatar.meta.json'),
      JSON.stringify({
        caption: 'Footbag Heroes avatar',
        tags: ['#event_2026_japan_worlds'],
        isAvatar: true,
        poster: null,
      }),
    );
    const result = readSidecar(tmp, 'fh-avatar.jpg');
    expect(result.caption).toBe('Footbag Heroes avatar');
    expect(result.tags).toEqual(['#event_2026_japan_worlds']);
    expect(result.isAvatar).toBe(true);
    expect(result.poster).toBeNull();
  });

  it('parses minimal sidecar (caption + tags only)', () => {
    writeFileSync(
      join(tmp, 'demo.meta.json'),
      JSON.stringify({ caption: null, tags: [] }),
    );
    const result = readSidecar(tmp, 'demo.mp4');
    expect(result.caption).toBeNull();
    expect(result.tags).toEqual([]);
    expect(result.isAvatar).toBeUndefined();
    expect(result.poster).toBeUndefined();
  });

  it('throws ValidationError when sidecar file is missing', () => {
    expect(() => readSidecar(tmp, 'nope.jpg')).toThrow(ValidationError);
    expect(() => readSidecar(tmp, 'nope.jpg')).toThrow(/Sidecar missing/);
  });

  it('throws ValidationError on malformed JSON', () => {
    writeFileSync(join(tmp, 'broken.meta.json'), '{ not valid json');
    expect(() => readSidecar(tmp, 'broken.jpg')).toThrow(ValidationError);
    expect(() => readSidecar(tmp, 'broken.jpg')).toThrow(/Sidecar JSON parse failed/);
  });

  it('throws when sidecar root is not an object', () => {
    writeFileSync(join(tmp, 'arr.meta.json'), JSON.stringify(['not', 'an', 'object']));
    expect(() => readSidecar(tmp, 'arr.jpg')).toThrow(/must be a JSON object/);
  });

  it('throws when caption exceeds max length', () => {
    writeFileSync(
      join(tmp, 'long.meta.json'),
      JSON.stringify({ caption: 'x'.repeat(SIDECAR_CAPTION_MAX_LEN + 1), tags: [] }),
    );
    expect(() => readSidecar(tmp, 'long.jpg')).toThrow(/caption exceeds/);
  });

  it('throws when caption is wrong type', () => {
    writeFileSync(join(tmp, 'bad.meta.json'), JSON.stringify({ caption: 42, tags: [] }));
    expect(() => readSidecar(tmp, 'bad.jpg')).toThrow(/caption must be string or null/);
  });

  it('throws when tags is not an array', () => {
    writeFileSync(join(tmp, 'bad.meta.json'), JSON.stringify({ caption: null, tags: 'nope' }));
    expect(() => readSidecar(tmp, 'bad.jpg')).toThrow(/tags must be an array/);
  });

  it('throws when a tag is not a string', () => {
    writeFileSync(join(tmp, 'bad.meta.json'), JSON.stringify({ caption: null, tags: ['#ok', 42] }));
    expect(() => readSidecar(tmp, 'bad.jpg')).toThrow(/tag must be a string/);
  });

  it('throws when a tag exceeds max length', () => {
    writeFileSync(
      join(tmp, 'bad.meta.json'),
      JSON.stringify({ caption: null, tags: ['#' + 'x'.repeat(SIDECAR_TAG_MAX_LEN)] }),
    );
    expect(() => readSidecar(tmp, 'bad.jpg')).toThrow(/tag exceeds/);
  });

  it('throws when isAvatar is wrong type', () => {
    writeFileSync(
      join(tmp, 'bad.meta.json'),
      JSON.stringify({ caption: null, tags: [], isAvatar: 'yes' }),
    );
    expect(() => readSidecar(tmp, 'bad.jpg')).toThrow(/isAvatar must be boolean/);
  });

  it('throws when poster is wrong type', () => {
    writeFileSync(
      join(tmp, 'bad.meta.json'),
      JSON.stringify({ caption: null, tags: [], poster: 42 }),
    );
    expect(() => readSidecar(tmp, 'bad.jpg')).toThrow(/poster must be string or null/);
  });

  it('accepts unicode in caption + tags', () => {
    writeFileSync(
      join(tmp, 'uni.meta.json'),
      JSON.stringify({ caption: 'café résumé 你好', tags: ['#tókyo'] }),
    );
    const result = readSidecar(tmp, 'uni.jpg');
    expect(result.caption).toBe('café résumé 你好');
    expect(result.tags).toEqual(['#tókyo']);
  });
});

describe('writeSidecar', () => {
  it('round-trips through readSidecar', async () => {
    await writeSidecar(tmp, 'demo.mp4', { caption: 'A demo', tags: ['#demo'], poster: 'demo-poster.jpg' });
    const result = readSidecar(tmp, 'demo.mp4');
    expect(result.caption).toBe('A demo');
    expect(result.tags).toEqual(['#demo']);
    expect(result.poster).toBe('demo-poster.jpg');
  });

  it('rejects malformed input at write time (defensive)', async () => {
    await expect(
      writeSidecar(tmp, 'demo.jpg', {
        caption: 'x'.repeat(SIDECAR_CAPTION_MAX_LEN + 1),
        tags: [],
      }),
    ).rejects.toThrow(/caption exceeds/);
  });

  it('emits trailing newline for editor friendliness', async () => {
    await writeSidecar(tmp, 'a.jpg', { caption: null, tags: [] });
    const raw = readFileSync(join(tmp, 'a.meta.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('deleteSidecar', () => {
  it('removes the sidecar file', async () => {
    await writeSidecar(tmp, 'a.jpg', { caption: null, tags: [] });
    expect(existsSync(join(tmp, 'a.meta.json'))).toBe(true);
    deleteSidecar(tmp, 'a.jpg');
    expect(existsSync(join(tmp, 'a.meta.json'))).toBe(false);
  });

  it('is idempotent when sidecar already absent', () => {
    expect(() => deleteSidecar(tmp, 'never-existed.jpg')).not.toThrow();
  });
});
