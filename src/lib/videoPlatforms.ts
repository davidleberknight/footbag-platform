// The one check that decides which platform a video link belongs to. Every
// video link the site accepts or shows (member and curator media, curated
// sidecars, freestyle record videos) goes through parseVideoLink, and a link
// it returns null for is refused: a video may live on YouTube, Vimeo, TikTok
// or Instagram and nowhere else.
//
// Each platform is matched on its own hosts and path shapes, never on a
// substring of the whole URL, so a page on another site whose address merely
// contains a YouTube path is not mistaken for a YouTube video. YouTube and
// Vimeo play embedded on the site; TikTok and Instagram are link-only, shown
// as an item whose page links out to the post.

export type VideoLinkPlatform = 'youtube' | 'vimeo' | 'tiktok' | 'instagram';

export interface ParsedVideoLink {
  platform: VideoLinkPlatform;
  videoId: string;
  canonicalUrl: string;
  embeddable: boolean;
}

export const VIDEO_LINK_PLATFORMS: readonly VideoLinkPlatform[] = ['youtube', 'vimeo', 'tiktok', 'instagram'];

const PLATFORM_LABELS: Record<VideoLinkPlatform, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

export function videoPlatformLabel(platform: VideoLinkPlatform): string {
  return PLATFORM_LABELS[platform];
}

export function isLinkOnlyPlatform(platform: string | null | undefined): platform is 'tiktok' | 'instagram' {
  return platform === 'tiktok' || platform === 'instagram';
}

export function isVideoLinkPlatform(platform: string | null | undefined): platform is VideoLinkPlatform {
  return platform === 'youtube' || platform === 'vimeo' || platform === 'tiktok' || platform === 'instagram';
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com']);
const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PATH = /^\/(?:embed|v|shorts)\/([A-Za-z0-9_-]{11})\/?$/;
const YOUTU_BE_PATH = /^\/([A-Za-z0-9_-]{11})\/?$/;
const VIMEO_PATH = /^\/(?:video\/)?(\d+)(?:\/[A-Za-z0-9]+)?\/?$/;
const VIMEO_PLAYER_PATH = /^\/video\/(\d+)\/?$/;
const TIKTOK_PATH = /^\/@([A-Za-z0-9._]+)\/video\/(\d+)\/?$/;
const INSTAGRAM_PATH = /^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/;

function youtube(id: string): ParsedVideoLink {
  return { platform: 'youtube', videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}`, embeddable: true };
}

function vimeo(id: string): ParsedVideoLink {
  return { platform: 'vimeo', videoId: id, canonicalUrl: `https://vimeo.com/${id}`, embeddable: true };
}

export function parseVideoLink(raw: string): ParsedVideoLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (YOUTUBE_HOSTS.has(host)) {
    if (path === '/watch') {
      const id = url.searchParams.get('v');
      return id && YOUTUBE_ID.test(id) ? youtube(id) : null;
    }
    const m = path.match(YOUTUBE_PATH);
    return m ? youtube(m[1]) : null;
  }
  if (host === 'youtu.be') {
    const m = path.match(YOUTU_BE_PATH);
    return m ? youtube(m[1]) : null;
  }
  if (VIMEO_HOSTS.has(host)) {
    const m = path.match(VIMEO_PATH);
    return m ? vimeo(m[1]) : null;
  }
  if (host === 'player.vimeo.com') {
    const m = path.match(VIMEO_PLAYER_PATH);
    return m ? vimeo(m[1]) : null;
  }
  if (TIKTOK_HOSTS.has(host)) {
    const m = path.match(TIKTOK_PATH);
    if (!m) return null;
    return {
      platform: 'tiktok',
      videoId: m[2],
      canonicalUrl: `https://www.tiktok.com/@${m[1]}/video/${m[2]}`,
      embeddable: false,
    };
  }
  if (INSTAGRAM_HOSTS.has(host)) {
    const m = path.match(INSTAGRAM_PATH);
    if (!m) return null;
    return {
      platform: 'instagram',
      videoId: m[2],
      canonicalUrl: `https://www.instagram.com/${m[1]}/${m[2]}/`,
      embeddable: false,
    };
  }
  return null;
}
