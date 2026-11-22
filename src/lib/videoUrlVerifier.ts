// Verifies external-platform video URLs via the platform's oEmbed endpoint,
// per DD §6.8. oEmbed is the authoritative availability signal: the YouTube
// and Vimeo page URLs both serve HTTP 200 for removed, private, or
// unavailable videos, but oEmbed returns 4xx for the same. The Vimeo oEmbed
// body also carries the public thumbnail URL which Vimeo callers must store
// in the sidecar (Vimeo thumbnails are not derivable from the video id).
// TikTok's public oEmbed endpoint is checked the same way. Instagram links
// are accepted on their URL pattern alone with no network call, because
// Meta licenses its oEmbed endpoint for embedding, which this site does not
// do with Instagram posts.

import { parseVideoLink, type VideoLinkPlatform } from './videoPlatforms';

export type VideoPlatform = VideoLinkPlatform;

export interface VideoVerifyResult {
  ok: boolean;
  status: number;
  body?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const OEMBED_ENDPOINTS: Record<VideoPlatform, ((url: string) => string) | null> = {
  youtube: (url) =>
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  vimeo: (url) =>
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  tiktok: (url) =>
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  instagram: null,
};

export function parseYouTubeVideoId(url: string): string | null {
  const parsed = parseVideoLink(url);
  return parsed?.platform === 'youtube' ? parsed.videoId : null;
}

export function parseVimeoVideoId(url: string): string | null {
  const parsed = parseVideoLink(url);
  return parsed?.platform === 'vimeo' ? parsed.videoId : null;
}

export async function verifyExternalVideoUrl(
  videoUrl: string,
  platform: VideoPlatform,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<VideoVerifyResult> {
  const endpointFor = OEMBED_ENDPOINTS[platform];
  if (!endpointFor) {
    return parseVideoLink(videoUrl)?.platform === platform
      ? { ok: true, status: 200 }
      : { ok: false, status: 400 };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = endpointFor(videoUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(endpoint, { method: 'GET', signal: controller.signal });
    if (res.status !== 200) {
      // Drain body to avoid socket leak; ignore content.
      try { await res.text(); } catch { /* ignore */ }
      return { ok: false, status: res.status };
    }
    const body = (await res.json()) as Record<string, unknown>;
    return { ok: true, status: 200, body };
  } finally {
    clearTimeout(timer);
  }
}
