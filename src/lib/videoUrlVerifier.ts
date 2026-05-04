// Verifies external-platform video URLs (YouTube and Vimeo) via the
// platform's oEmbed endpoint, per DD §6.8. oEmbed is the authoritative
// availability signal: the YouTube and Vimeo page URLs both serve HTTP
// 200 for removed, private, or unavailable videos, but oEmbed returns
// 4xx for the same. The Vimeo oEmbed body also carries the public
// thumbnail URL which Vimeo callers must store in the sidecar (Vimeo
// thumbnails are not derivable from the video id).

export type VideoPlatform = 'youtube' | 'vimeo';

export interface VideoVerifyResult {
  ok: boolean;
  status: number;
  body?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const OEMBED_ENDPOINTS: Record<VideoPlatform, (url: string) => string> = {
  youtube: (url) =>
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  vimeo: (url) =>
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
};

const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/;

const VIMEO_ID_PATTERN = /vimeo\.com\/(?:video\/)?(\d+)/;

export function parseYouTubeVideoId(url: string): string | null {
  const m = url.match(YOUTUBE_ID_PATTERN);
  return m ? m[1] : null;
}

export function parseVimeoVideoId(url: string): string | null {
  const m = url.match(VIMEO_ID_PATTERN);
  return m ? m[1] : null;
}

export async function verifyExternalVideoUrl(
  videoUrl: string,
  platform: VideoPlatform,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<VideoVerifyResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = OEMBED_ENDPOINTS[platform](videoUrl);

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
