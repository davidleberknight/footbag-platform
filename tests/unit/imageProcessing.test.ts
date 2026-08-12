import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { processAvatar, processPhoto } from '../../src/lib/imageProcessing';

// A solid-colour PNG compresses to a few bytes regardless of dimensions, so an
// over-limit test image is cheap to build and the dimension guard rejects it
// from the header before any full-raster decode.
async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe('image processing decode guard', () => {
  it('processPhoto produces both variants for an in-bounds image', async () => {
    const out = await processPhoto(await solidPng(800, 600));
    expect(out.thumb.length).toBeGreaterThan(0);
    expect(out.display.length).toBeGreaterThan(0);
    expect(out.widthPx).toBe(800);
    expect(out.heightPx).toBe(600);
  });

  it('processAvatar produces both variants for an in-bounds image', async () => {
    const out = await processAvatar(await solidPng(400, 400));
    expect(out.thumb.length).toBeGreaterThan(0);
    expect(out.display.length).toBeGreaterThan(0);
  });

  it('processPhoto rejects an image whose pixel count exceeds the decode cap', async () => {
    // 5000 x 4900 = 24.5 megapixels, above the 16.8-megapixel cap.
    await expect(processPhoto(await solidPng(5000, 4900))).rejects.toThrow(/megapixels/i);
  });

  it('processAvatar rejects an image whose pixel count exceeds the decode cap', async () => {
    await expect(processAvatar(await solidPng(5000, 4900))).rejects.toThrow(/megapixels/i);
  });

  it('processPhoto rejects an image smaller than the minimum edge', async () => {
    await expect(processPhoto(await solidPng(150, 150))).rejects.toThrow(/too small/i);
  });

  it('processAvatar rejects an image smaller than the minimum edge', async () => {
    await expect(processAvatar(await solidPng(150, 150))).rejects.toThrow(/too small/i);
  });

  it('processPhoto rejects an image whose aspect ratio is too extreme', async () => {
    // 1000 x 200 is 5:1, beyond the 4:1 limit (and within size + megapixel bounds).
    await expect(processPhoto(await solidPng(1000, 200))).rejects.toThrow(/long and thin/i);
  });

  it('processAvatar rejects an image whose aspect ratio is too extreme', async () => {
    await expect(processAvatar(await solidPng(200, 1000))).rejects.toThrow(/long and thin/i);
  });
});

// A photo thumbnail keeps the shape of the photo and is cropped to whatever
// frame it is drawn into by the stylesheet; an avatar thumbnail is cropped
// square when it is written, because its frame never varies.
describe('thumbnail shape and bound', () => {
  async function thumbSize(thumb: Buffer): Promise<[number, number]> {
    const meta = await sharp(thumb).metadata();
    return [meta.width ?? 0, meta.height ?? 0];
  }

  it('bounds a landscape photo thumb on its long edge and keeps its shape', async () => {
    const out = await processPhoto(await solidPng(1200, 900));
    expect(await thumbSize(out.thumb)).toEqual([600, 450]);
  });

  it('bounds a portrait photo thumb on its long edge and keeps its shape', async () => {
    const out = await processPhoto(await solidPng(900, 1200));
    expect(await thumbSize(out.thumb)).toEqual([450, 600]);
  });

  it('leaves a photo smaller than the bound at its own size rather than enlarging it', async () => {
    const out = await processPhoto(await solidPng(400, 300));
    expect(await thumbSize(out.thumb)).toEqual([400, 300]);
  });

  it('crops an avatar thumb square whatever shape its source is', async () => {
    const out = await processAvatar(await solidPng(1200, 900));
    expect(await thumbSize(out.thumb)).toEqual([300, 300]);
  });
});

// Two programs write the same thumbnail column: this pipeline handles uploads,
// and the Python curator seeding script handles curated media. They must agree,
// because both shapes land in one gallery grid, and a divergence between them
// is invisible until someone compares two tiles.
describe('the upload pipeline and the curator seeding script agree on thumbnails', () => {
  const pipeline = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'imageProcessing.ts'), 'utf8',
  );
  const seeder = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'seed_fh_curator.py'), 'utf8',
  );

  function boundIn(source: string, name: string): string | undefined {
    return new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(source)?.[1];
  }

  function pythonFunctionBody(source: string, name: string): string {
    const start = source.indexOf(`def ${name}(`);
    expect(start, `${name} is missing from the seeding script`).toBeGreaterThan(-1);
    const rest = source.slice(start + 1);
    const end = rest.indexOf('\ndef ');
    return end === -1 ? rest : rest.slice(0, end);
  }

  it('uses one avatar bound and one photo bound across both', () => {
    expect(boundIn(seeder, 'AVATAR_THUMB_SIZE')).toBe(boundIn(pipeline, 'AVATAR_THUMB_SIZE'));
    expect(boundIn(seeder, 'PHOTO_THUMB_SIZE')).toBe(boundIn(pipeline, 'PHOTO_THUMB_SIZE'));
  });

  it('crops only the avatar thumbnail on the seeding side', () => {
    const photo = pythonFunctionBody(seeder, 'process_photo_thumb');
    const avatar = pythonFunctionBody(seeder, 'process_avatar_thumb');
    expect(photo).toContain('.thumbnail(');
    expect(photo).not.toContain('.crop(');
    expect(avatar).toContain('.crop(');
  });
});
