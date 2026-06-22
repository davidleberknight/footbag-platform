import { describe, it, expect } from 'vitest';
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
    // 5000 x 4900 = 24.5 megapixels, above the 24-megapixel cap.
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
