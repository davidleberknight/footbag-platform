// Canonical video-media shape consumed by the partials/video-facade.hbs
// click-to-play partial and by every service that surfaces a video tile.
//
// Producer-side: services build a VideoMedia from either hardcoded YouTube
// data (expandYouTubeVideo) or a DB row (expandVideoFromMediaItem). The shape
// is platform-aware: YouTube + Vimeo carry an iframe embed URL; S3 leaves
// videoEmbedUrl null because the click handler swaps in a native <video>.

export type VideoPlatform = 'youtube' | 'vimeo' | 's3';

export interface VideoMedia {
  videoPlatform: VideoPlatform;
  videoId: string;
  videoUrl: string;
  videoEmbedUrl: string | null;
  thumbnailUrl: string;
  videoTitle: string;
}

export function expandYouTubeVideo(videoId: string, videoTitle: string): VideoMedia {
  const id = encodeURIComponent(videoId);
  return {
    videoPlatform: 'youtube',
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${id}`,
    videoEmbedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    videoTitle,
  };
}

export interface VideoSourceRow {
  video_platform: VideoPlatform | string | null;
  video_id: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  caption?: string | null;
}

export interface ExpandVideoOptions {
  constructURL?: (key: string) => string;
  videoTitle?: string;
}

// constructURL is required when video_platform is 's3'; omitting it throws.
// YouTube and Vimeo URLs are derived from video_id directly and need no callback.
export function expandVideoFromMediaItem(
  row: VideoSourceRow,
  options: ExpandVideoOptions = {},
): VideoMedia | null {
  if (!row.video_platform || !row.video_id) return null;
  const videoTitle = options.videoTitle ?? row.caption ?? '';
  const id = encodeURIComponent(row.video_id);

  if (row.video_platform === 'youtube') {
    return {
      videoPlatform: 'youtube',
      videoId: row.video_id,
      videoUrl: row.video_url ?? `https://www.youtube.com/watch?v=${id}`,
      videoEmbedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
      thumbnailUrl: row.thumbnail_url ?? `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`,
      videoTitle,
    };
  }
  if (row.video_platform === 'vimeo') {
    return {
      videoPlatform: 'vimeo',
      videoId: row.video_id,
      videoUrl: row.video_url ?? '',
      videoEmbedUrl: `https://player.vimeo.com/video/${id}`,
      thumbnailUrl: row.thumbnail_url ?? '',
      videoTitle,
    };
  }
  if (row.video_platform === 's3') {
    if (!options.constructURL) {
      throw new Error('expandVideoFromMediaItem: constructURL required for s3 video');
    }
    return {
      videoPlatform: 's3',
      videoId: row.video_id,
      videoUrl: options.constructURL(row.video_id),
      videoEmbedUrl: null,
      thumbnailUrl: row.thumbnail_url ?? '',
      videoTitle,
    };
  }
  return null;
}
