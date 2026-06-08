import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { urlRefMediaId } from '../../src/lib/curatorUrlSidecar';

// urlRefMediaId is the cross-tool idempotency contract with the curator
// seeder (scripts/seed_fh_curator.py `_url_ref_media_id`):
// media_<sha1("{platform}|{url}")[:24]>. The admin URL-reference upload and
// the pre-go-live seeder both derive a row's id from (video_platform,
// video_url) with this exact formula. If it drifts, the same video would land
// as two rows (admin-inserted + seeder-inserted) instead of one upsert. The
// pinned hash below is the literal value the Python formula emits for the same
// input; the whole existing curated corpus already uses this scheme.
describe('urlRefMediaId — parity with the curator seeder', () => {
  it('matches the pinned seeder hash for a known (platform, url)', () => {
    expect(urlRefMediaId('youtube', 'https://www.youtube.com/watch?v=ABC123'))
      .toBe('media_867f9735c5526f2bc53fa7ab');
  });

  it('reproduces the sha1("platform|url")[:24] formula for vimeo', () => {
    const platform = 'vimeo';
    const url = 'https://vimeo.com/123456';
    const expected = 'media_' + createHash('sha1').update(`${platform}|${url}`).digest('hex').slice(0, 24);
    expect(urlRefMediaId(platform, url)).toBe(expected);
  });

  it('distinguishes platform: same url, different platform yields different id', () => {
    const url = 'https://example.com/x';
    expect(urlRefMediaId('youtube', url)).not.toBe(urlRefMediaId('vimeo', url));
  });
});
