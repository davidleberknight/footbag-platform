/**
 * docker/nginx/40-render-nginx-conf.sh — the origin TLS listener.
 *
 * The CloudFront-to-origin hop is encrypted once the host holds a certificate
 * for the origin's own name. The render script decides, at every container
 * start, whether nginx listens on 443: it writes the listener into a file the
 * one server block includes, so the TLS listener shares the body carrying the
 * origin-verify gate and the upstream Host pin. With no certificate the file is
 * empty, which is how development, staging and production before issuance boot.
 * Half a certificate pair refuses, because nginx cannot serve a listener whose
 * key or chain is missing and the failure is clearer at render than at reload.
 *
 * The script runs outside a container here, through its path overrides, against
 * the real template.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'docker/nginx/40-render-nginx-conf.sh');
const TEMPLATE = join(process.cwd(), 'docker/nginx/nginx.conf.template');
const SECRET = 'a'.repeat(64);

let scratch: string;
let certDir: string;
let listenPath: string;
let confPath: string;

function render(extraEnv: NodeJS.ProcessEnv = {}) {
  const result = spawnSync('sh', [SCRIPT], {
    encoding: 'utf-8',
    env: {
      PATH: process.env.PATH,
      X_ORIGIN_VERIFY_SECRET: SECRET,
      PUBLIC_BASE_URL: 'https://www.example.org',
      NGINX_TEMPLATE_PATH: TEMPLATE,
      NGINX_CONF_PATH: confPath,
      ORIGIN_TLS_LISTEN_PATH: listenPath,
      ORIGIN_TLS_CERT_DIR: certDir,
      ...extraEnv,
    },
    ...SPAWN_GUARD,
  });
  return { exitCode: result.status ?? 1, stderr: result.stderr ?? '' };
}

function placeCert(): void {
  writeFileSync(join(certDir, 'fullchain.pem'), 'chain\n');
}
function placeKey(): void {
  writeFileSync(join(certDir, 'privkey.pem'), 'key\n');
}

beforeEach(() => {
  scratch = createScratchDir('nginx-render');
  certDir = join(scratch, 'live', 'origin');
  mkdirSync(certDir, { recursive: true });
  listenPath = join(scratch, 'origin-tls-listen.conf');
  confPath = join(scratch, 'nginx.conf');
});

afterEach(() => {
  removeScratch(scratch);
});

describe('the rendered server block', () => {
  it('includes the origin TLS listener inside the one server block that carries the origin-verify gate', () => {
    // Defect caught: a 443 listener outside the gated block, serving any
    // client that reaches port 443 without the CloudFront secret, or a second
    // server block holding its own copy of the gate that drifts from the first.
    expect(render().exitCode).toBe(0);
    const conf = readFileSync(confPath, 'utf8');
    const blocks = conf.match(/^\s*server\s*\{/gm) ?? [];
    expect(blocks).toHaveLength(1);
    const server = conf.slice(conf.search(/^\s*server\s*\{/m));
    const includeAt = server.indexOf('include /etc/nginx/origin-tls-listen.conf;');
    const gateAt = server.indexOf(`if ($http_x_origin_verify = "${SECRET}")`);
    expect(includeAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(includeAt);
    expect(server).toMatch(/proxy_set_header\s+Host\s+www\.example\.org;/);
  });
});

describe('the origin TLS listener file', () => {
  it('is written empty when the host holds no certificate, so nginx listens on 80 alone', () => {
    // Defect caught: staging, development, or production before issuance
    // failing to boot because the include names a file that was never written,
    // or a 443 listener rendered with no certificate behind it.
    expect(render().exitCode).toBe(0);
    expect(existsSync(listenPath)).toBe(true);
    expect(readFileSync(listenPath, 'utf8')).toBe('');
  });

  it('opens 443 with the certificate pair, TLS 1.2 and later only, when both files are present', () => {
    // Defect caught: an issued certificate that never reaches the listener, so
    // CloudFront's switch to https-only meets a closed port; or a listener
    // accepting the TLS versions CloudFront's origin policy refuses.
    placeCert();
    placeKey();
    expect(render().exitCode).toBe(0);
    const listen = readFileSync(listenPath, 'utf8');
    expect(listen).toMatch(/^listen 443 ssl;$/m);
    expect(listen).toContain(`ssl_certificate ${join(certDir, 'fullchain.pem')};`);
    expect(listen).toContain(`ssl_certificate_key ${join(certDir, 'privkey.pem')};`);
    expect(listen).toMatch(/^ssl_protocols TLSv1\.2 TLSv1\.3;$/m);
    expect(listen).not.toMatch(/TLSv1(\.1)?[ ;]/);
  });

  it.each([
    ['the chain without the key', placeCert],
    ['the key without the chain', placeKey],
  ])('refuses to render with %s', (_label, place) => {
    // Defect caught: a container that starts with an origin listener whose
    // handshake cannot complete, which CloudFront reports as 502 to every
    // visitor once the hop is https-only, instead of a container that refuses
    // to start and says why.
    place();
    const result = render();
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/origin TLS needs both .*fullchain\.pem and .*privkey\.pem/);
  });

  it('empties a listener left from an earlier start once the certificate is gone', () => {
    // Defect caught: a restarted container keeping a 443 listener that points
    // at certificate files no longer present, so nginx fails at start.
    placeCert();
    placeKey();
    expect(render().exitCode).toBe(0);
    rmSync(certDir, { recursive: true });
    expect(render().exitCode).toBe(0);
    expect(readFileSync(listenPath, 'utf8')).toBe('');
  });
});

describe('the render guards that already held', () => {
  it('still refuses an origin-verify secret that is not 64 lowercase hex characters', () => {
    // Defect caught: the listener change loosening the secret's shape check,
    // so a truncated paste renders a gate that answers 444 to CloudFront.
    const result = render({ X_ORIGIN_VERIFY_SECRET: 'a'.repeat(32) });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/must be 64 hex chars/);
  });
});
