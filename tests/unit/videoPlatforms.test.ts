// The one video-platform check: a video link may point to YouTube, Vimeo,
// TikTok or Instagram and nowhere else, and only YouTube and Vimeo embed.
import { describe, expect, it } from 'vitest';
import { parseVideoLink } from '../../src/lib/videoPlatforms';

describe('parseVideoLink accepts each allowed platform on its own hosts', () => {
  // Defect caught: a member's or curator's ordinary link on an allowed
  // platform is refused, or stored under the wrong platform, id or address.
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', true],
    ['http://youtube.com/watch?v=8WQ_bzl2I80', 'youtube', '8WQ_bzl2I80', 'https://www.youtube.com/watch?v=8WQ_bzl2I80', true],
    ['https://youtu.be/dQw4w9WgXcQ?t=5', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', true],
    ['https://www.youtube.com/shorts/nLm3UtIzOc4', 'youtube', 'nLm3UtIzOc4', 'https://www.youtube.com/watch?v=nLm3UtIzOc4', true],
    ['https://vimeo.com/143522157', 'vimeo', '143522157', 'https://vimeo.com/143522157', true],
    ['https://player.vimeo.com/video/143522157', 'vimeo', '143522157', 'https://vimeo.com/143522157', true],
    ['https://www.tiktok.com/@scout2015/video/6718335390845095173?lang=en', 'tiktok', '6718335390845095173', 'https://www.tiktok.com/@scout2015/video/6718335390845095173', false],
    ['https://www.instagram.com/p/DGlbm3quyxE/?img_index=3', 'instagram', 'DGlbm3quyxE', 'https://www.instagram.com/p/DGlbm3quyxE/', false],
    ['https://instagram.com/reel/C1a2B3c4D5e', 'instagram', 'C1a2B3c4D5e', 'https://www.instagram.com/reel/C1a2B3c4D5e/', false],
  ])('%s', (url, platform, videoId, canonicalUrl, embeddable) => {
    expect(parseVideoLink(url)).toEqual({ platform, videoId, canonicalUrl, embeddable });
  });
});

describe('parseVideoLink refuses every other link', () => {
  // Defect caught: an off-platform link is accepted and shown as a video,
  // breaking the four-platform rule, or a page on another host is mistaken
  // for a platform video because its address contains a platform path.
  it.each([
    ['Facebook video', 'https://www.facebook.com/watch/?v=123456789'],
    ['foreign host wrapping a YouTube address', 'https://evil.example/redirect?u=https://www.youtube.com/watch?v=wRaPPeRiD11'],
    ['look-alike host', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['TikTok short link (no video id in it)', 'https://vm.tiktok.com/ZMabc123/'],
    ['TikTok profile, not a video', 'https://www.tiktok.com/@scout2015'],
    ['Instagram profile, not a post', 'https://www.instagram.com/someone/'],
    ['YouTube id of the wrong length', 'https://www.youtube.com/watch?v=removed12345'],
    ['non-web scheme', 'javascript:alert(1)//www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['credentials in the address', 'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['not a URL', 'dQw4w9WgXcQ'],
    ['empty', ''],
  ])('%s', (_label, url) => {
    expect(parseVideoLink(url)).toBeNull();
  });
});
