import { describe, it, expect } from 'vitest';
import {
  verifyExternalVideoUrl,
  parseYouTubeVideoId,
  parseVimeoVideoId,
} from '../../src/lib/videoUrlVerifier';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response('', { status });
}

describe('verifyExternalVideoUrl', () => {
  it('YouTube available URL: ok=true, status=200, body carries oEmbed JSON', async () => {
    let calledUrl = '';
    const fetchImpl: typeof fetch = async (input) => {
      calledUrl = String(input);
      return jsonResponse(200, { title: 'Demo', author_name: 'Anssi' });
    };
    const result = await verifyExternalVideoUrl(
      'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
      'youtube',
      { fetchImpl },
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ title: 'Demo', author_name: 'Anssi' });
    expect(calledUrl).toBe(
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DDmr7zj_c7cY&format=json',
    );
  });

  it('Vimeo available URL: ok=true, body carries thumbnail_url for sidecar use', async () => {
    let calledUrl = '';
    const fetchImpl: typeof fetch = async (input) => {
      calledUrl = String(input);
      return jsonResponse(200, {
        title: 'Demo',
        thumbnail_url: 'https://i.vimeocdn.com/video/abc_640.jpg',
      });
    };
    const result = await verifyExternalVideoUrl(
      'https://vimeo.com/12345678',
      'vimeo',
      { fetchImpl },
    );
    expect(result.ok).toBe(true);
    expect((result.body as { thumbnail_url: string }).thumbnail_url).toBe(
      'https://i.vimeocdn.com/video/abc_640.jpg',
    );
    expect(calledUrl).toBe(
      'https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F12345678',
    );
  });

  it('YouTube removed video (404): ok=false, no body', async () => {
    const fetchImpl: typeof fetch = async () => emptyResponse(404);
    const result = await verifyExternalVideoUrl(
      'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
      'youtube',
      { fetchImpl },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.body).toBeUndefined();
  });

  it('YouTube private video (401): ok=false', async () => {
    const fetchImpl: typeof fetch = async () => emptyResponse(401);
    const result = await verifyExternalVideoUrl(
      'https://www.youtube.com/watch?v=privateVideoX',
      'youtube',
      { fetchImpl },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('Vimeo removed video (404): ok=false', async () => {
    const fetchImpl: typeof fetch = async () => emptyResponse(404);
    const result = await verifyExternalVideoUrl(
      'https://vimeo.com/25019188',
      'vimeo',
      { fetchImpl },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('Transient 5xx: ok=false (caller may retry)', async () => {
    const fetchImpl: typeof fetch = async () => emptyResponse(503);
    const result = await verifyExternalVideoUrl(
      'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
      'youtube',
      { fetchImpl },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });

  it('URL with special chars is encoded into the oEmbed query', async () => {
    let calledUrl = '';
    const fetchImpl: typeof fetch = async (input) => {
      calledUrl = String(input);
      return jsonResponse(200, { title: 'Demo' });
    };
    await verifyExternalVideoUrl(
      'https://www.youtube.com/watch?v=Dmr7zj_c7cY&t=360&list=RD',
      'youtube',
      { fetchImpl },
    );
    expect(calledUrl).toContain('%3D'); // '=' encoded
    expect(calledUrl).toContain('%26'); // '&' encoded
  });

  it('Unicode in URL is encoded without throwing', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(200, {});
    await expect(
      verifyExternalVideoUrl(
        'https://www.youtube.com/watch?v=zw‮rj_c7cY',
        'youtube',
        { fetchImpl },
      ),
    ).resolves.toBeDefined();
  });

  it('Timeout: fetchImpl that hangs is aborted', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    await expect(
      verifyExternalVideoUrl(
        'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
        'youtube',
        { fetchImpl, timeoutMs: 50 },
      ),
    ).rejects.toThrow();
  });

  it('Network error from fetchImpl propagates', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(
      verifyExternalVideoUrl(
        'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
        'youtube',
        { fetchImpl },
      ),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe('parseYouTubeVideoId', () => {
  it('extracts id from watch?v= form', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=Dmr7zj_c7cY')).toBe('Dmr7zj_c7cY');
  });
  it('extracts id from youtu.be short form', () => {
    expect(parseYouTubeVideoId('https://youtu.be/Dmr7zj_c7cY')).toBe('Dmr7zj_c7cY');
  });
  it('extracts id from youtu.be with timecode', () => {
    expect(parseYouTubeVideoId('https://youtu.be/Dmr7zj_c7cY?t=12')).toBe('Dmr7zj_c7cY');
  });
  it('extracts id from embed form', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/embed/Dmr7zj_c7cY')).toBe('Dmr7zj_c7cY');
  });
  it('extracts id when v= is not the first query param', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?list=RD&v=Dmr7zj_c7cY')).toBe('Dmr7zj_c7cY');
  });
  it('returns null for non-YouTube URL', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/25019188')).toBeNull();
  });
  it('returns null for malformed id (wrong length)', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=tooshort')).toBeNull();
  });
});

describe('parseVimeoVideoId', () => {
  it('extracts id from vimeo.com/{id} form', () => {
    expect(parseVimeoVideoId('https://vimeo.com/25019188')).toBe('25019188');
  });
  it('extracts id from vimeo.com/video/{id} form', () => {
    expect(parseVimeoVideoId('https://vimeo.com/video/25019188')).toBe('25019188');
  });
  it('returns null for non-Vimeo URL', () => {
    expect(parseVimeoVideoId('https://www.youtube.com/watch?v=Dmr7zj_c7cY')).toBeNull();
  });
  it('returns null when no numeric id present', () => {
    expect(parseVimeoVideoId('https://vimeo.com/channels/staffpicks')).toBeNull();
  });
});
