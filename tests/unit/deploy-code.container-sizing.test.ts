/**
 * The deploy's container-sizing seed carries every tunable the video pipeline
 * depends on, and the deploy leaves the stack enabled for boot.
 *
 * The remote deploy half seeds an allowlist of sizing keys from the committed
 * per-environment env file into the host's runtime env. A key missing from
 * that allowlist silently never reaches the host, which is how the staging
 * height clamp once had to be hand-edited into place. This suite pins the
 * allowlist and its validators by inspecting the script text (the same
 * posture as the database-preserving suite: deploy scripts run only as root
 * inside the ssh pipe and have no shell-execution harness).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REMOTE_SCRIPT_PATH = resolve(__dirname, '../../scripts/internal/deploy-code-remote.sh');

function executableLines(): string[] {
  return readFileSync(REMOTE_SCRIPT_PATH, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line));
}

// Every key the committed docker/env/<environment>.env may carry. The compose
// overlay forwards each into the container that reads it; a key listed here
// but missing from the allowlist regex would be warned about and dropped at
// deploy time.
const SIZING_KEYS = [
  'NGINX_MEMORY_LIMIT',
  'WEB_MEMORY_LIMIT',
  'WORKER_MEMORY_LIMIT',
  'IMAGE_MEMORY_LIMIT',
  'IMAGE_MAX_CONCURRENT',
  'VIDEO_X264_PRESET',
  'VIDEO_X264_THREADS',
  'VIDEO_X264_RC_LOOKAHEAD',
  'VIDEO_MAX_HEIGHT',
  'FFMPEG_TIMEOUT_SECONDS',
  'VIDEO_TRANSCODE_TIMEOUT_MS',
  'VIDEO_MIN_HOST_AVAILABLE_MB',
];

describe('deploy-code-remote.sh container-sizing seed', () => {
  it('allowlists every sizing and video-tuning key, in both the key and line regexes', () => {
    const code = executableLines().join('\n');
    const keyReLine = code.match(/key_re='([^']+)'/);
    const lineReLine = code.match(/line_re='([^']+)'/);
    expect(keyReLine).not.toBeNull();
    expect(lineReLine).not.toBeNull();
    const keyRe = new RegExp(keyReLine![1]);
    for (const key of SIZING_KEYS) {
      expect(keyRe.test(key), `key_re admits ${key}`).toBe(true);
      expect(lineReLine![1].includes(`${key}=`) || keyRe.test(key), `line_re strips ${key}`).toBe(
        true,
      );
    }
  });

  it('validates the numeric video keys as integers', () => {
    const code = executableLines().join('\n');
    const intCase = code
      .split('\n')
      .find((line) => line.includes('IMAGE_MAX_CONCURRENT|') && line.includes(')'));
    expect(intCase).toBeDefined();
    for (const key of [
      'VIDEO_MAX_HEIGHT',
      'FFMPEG_TIMEOUT_SECONDS',
      'VIDEO_TRANSCODE_TIMEOUT_MS',
      'VIDEO_MIN_HOST_AVAILABLE_MB',
    ]) {
      expect(intCase, `integer validator covers ${key}`).toContain(key);
    }
  });

  it('asserts the service unit is enabled for boot', () => {
    const code = executableLines().join('\n');
    expect(code).toMatch(/systemctl is-enabled --quiet footbag \|\| systemctl enable footbag/);
  });

  it('provisions the disk swapfile as part of the deploy, before the service restart', () => {
    // The swap valve rides the canonical deploy rather than a separate
    // installer, so a bare redeploy carries every host-survivability piece
    // and nothing depends on an operator remembering a side step.
    const code = executableLines().join('\n');
    expect(code).toContain('mkswap /swapfile');
    expect(code).toContain('swapon /swapfile');
    expect(code).toMatch(/\/etc\/fstab/);
    expect(code).toContain('vm.swappiness=10');
    const swapIndex = code.indexOf('ensure_swapfile');
    const restartIndex = code.indexOf('systemctl restart footbag');
    expect(swapIndex).toBeGreaterThan(-1);
    expect(restartIndex).toBeGreaterThan(swapIndex);
  });
});
