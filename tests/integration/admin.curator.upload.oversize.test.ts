/**
 * An oversized curator upload is refused while it is still arriving.
 *
 * The per-file ceiling is enforced by the multipart parser, which raises its
 * limit event as soon as a part crosses the cap. Answering there rather than
 * when the parser finishes is the whole contract: the parser cannot finish
 * until the entire body has arrived, so a reply that waits for it makes a
 * refusal cost the curator the full transfer of a file the server had already
 * decided to reject.
 *
 * The proof is a request body that never ends. If the refusal arrives while
 * the upload is still open, the server did not wait for it.
 *
 * The suite runs against the smallest cap the configuration admits so the
 * oversized case is a couple of megabytes rather than a couple of hundred.
 *
 * The last block covers the browser-side half of the same contract. It takes
 * the form exactly as the server renders it, evaluates the real upload script
 * against that markup, and drives a real oversized file through it. Asserting
 * the script's logic against hand-written markup would not do: the enhancement
 * once shipped selecting its form on an attribute the markup never carried, so
 * it returned immediately and refused nothing, and nothing that tested the two
 * halves separately could see it. Only the rendered page and the shipped script
 * together prove the refusal reaches a curator.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'node:stream';
import { Window } from 'happy-dom';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-curator-oversize-${Date.now()}.db`);
const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-media-oversize-'));
const TEST_CURATED_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-curated-oversize-'));

process.env.FOOTBAG_DB_PATH   = TEST_DB_PATH;
process.env.FOOTBAG_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.FOOTBAG_CURATED_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.PORT              = '3101';
process.env.NODE_ENV          = 'test';
process.env.LOG_LEVEL         = 'error';
process.env.PUBLIC_BASE_URL   = 'http://localhost:3101';
process.env.SESSION_SECRET    = 'curator-oversize-test-secret';
// The floor the configuration allows. The cap under test is the one the page
// states and the refusal names, so pinning it here pins all three at once.
process.env.VIDEO_MAX_BYTES   = String(1024 * 1024);

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { createTestDb } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const ADMIN_ID = 'admin-oversize-001';
const SYSTEM_ID = 'member_footbag_hacky_oversize';

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

const CAP_BYTES = 1024 * 1024;
const CAP_LABEL = '1 MB';

/**
 * A body that pushes past the ceiling and then holds the connection open
 * without ending it, the way a browser part-way through a large file does.
 * Nothing completes this upload, so a response can only come from a server
 * that refused without waiting for the rest.
 */
function neverEndingOversizedBody(): Readable {
  const chunk = Buffer.alloc(128 * 1024);
  chunk.write('ftyp', 4, 'ascii');
  let pushed = 0;
  return new Readable({
    read() {
      if (pushed < CAP_BYTES * 2) {
        pushed += chunk.length;
        this.push(chunk);
      }
      // Deliberately never pushes null: the request body stays open.
    },
  });
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  insertMember(db, {
    id: ADMIN_ID,
    slug: 'oversize_admin',
    display_name: 'Oversize Admin',
    login_email: 'oversize-admin@example.com',
    is_admin: 1,
  });
  insertMember(db, {
    id: SYSTEM_ID,
    slug: 'footbag_hacky',
    display_name: 'Footbag Hacky',
    real_name: 'Footbag Hacky',
    is_system: 1,
  });
  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;

  // The curated tree is the committed source of truth, so the service refuses
  // to touch disk until a test points it somewhere throwaway.
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(TEST_CURATED_DIR);
});

afterAll(async () => {
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(`${TEST_DB_PATH}${suffix}`); } catch { /* already gone */ }
  }
  fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CURATED_DIR, { recursive: true, force: true });
});

describe('POST /admin/curator/upload with a file over the per-file ceiling', () => {
  it('refuses while the upload is still arriving, without waiting for the rest', async () => {
    const app = createApp();
    const body = neverEndingOversizedBody();
    try {
      const res = await request(app)
        .post('/admin/curator/upload')
        .set('Cookie', adminCookie())
        .field('mediaType', 'video')
        .attach('mediaFile', body, 'huge.mp4');
      expect(res.status).toBe(422);
      expect(res.text).toContain(`maximum allowed size of ${CAP_LABEL}`);
    } finally {
      body.destroy();
    }
  });

  it('names the configured cap rather than refusing without a figure', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'video')
      .attach('mediaFile', Buffer.alloc(CAP_BYTES + 1024), 'over-by-a-little.mp4');
    expect(res.status).toBe(422);
    expect(res.text).toContain(`File exceeded the maximum allowed size of ${CAP_LABEL}.`);
  });

  it('states the same cap on the form the curator is sent back to', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/upload')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`up to ${CAP_LABEL.replace(' ', '&nbsp;')}`);
    expect(res.text).toContain(`data-video-max-bytes="${CAP_BYTES}"`);
  });
});

const UPLOAD_SCRIPT = path.join(process.cwd(), 'src', 'public', 'js', 'admin-curator-upload.js');

/**
 * The upload page as the server renders it, with the shipped upload script
 * evaluated against it. External resources are left unfetched: the only script
 * that runs is the one under test, evaluated explicitly.
 */
async function renderedFormWithScript() {
  const app = createApp();
  const res = await request(app).get('/admin/curator/upload').set('Cookie', adminCookie());
  expect(res.status).toBe(200);

  const window = new Window({
    settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  window.document.write(res.text);
  window.document.close();
  window.eval(fs.readFileSync(UPLOAD_SCRIPT, 'utf8'));
  // The script defers to DOMContentLoaded while the document is still parsing.
  if (window.document.readyState === 'loading') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  }
  return window;
}

/** A file of a given size, which is all the size check reads. */
function fileOfSize(window: InstanceType<typeof Window>, bytes: number, name: string) {
  return new window.File([new Uint8Array(bytes)], name, { type: 'video/mp4' });
}

function chooseVideo(window: InstanceType<typeof Window>, file: unknown) {
  const input = window.document.querySelector('.upload-tab-panel-video input[name="mediaFile"]');
  expect(input, 'the video panel input the script scopes its lookups to').not.toBeNull();
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input!.dispatchEvent(new window.Event('change', { bubbles: true }));
}

describe('the upload page and the upload script, together', () => {
  it('refuses an oversized video in the page, before any of it is sent', async () => {
    const window = await renderedFormWithScript();
    const form = window.document.querySelector('form[action="/admin/curator/upload"]');
    expect(form, 'the form the script selects on').not.toBeNull();

    chooseVideo(window, fileOfSize(window, CAP_BYTES * 3, 'too-big.mp4'));

    const status = window.document.querySelector('[data-async-status]');
    expect(status!.textContent).toBe(
      `That video is 3.0 MB. The maximum is ${CAP_LABEL.replace('1 MB', '1.0 MB')}. Pick a smaller file.`,
    );
    expect((status as unknown as HTMLElement).dataset.kind).toBe('error');

    const submit = new window.Event('submit', { bubbles: true, cancelable: true });
    form!.dispatchEvent(submit);
    expect(submit.defaultPrevented, 'the submit that would have sent the file').toBe(true);

    await window.happyDOM.close();
  });

  it('lets a file under the cap through, so the refusal is not a blanket block', async () => {
    const window = await renderedFormWithScript();
    const form = window.document.querySelector('form[action="/admin/curator/upload"]');

    chooseVideo(window, fileOfSize(window, 1024, 'small-enough.mp4'));

    const status = window.document.querySelector('[data-async-status]');
    expect(status!.textContent).toBe('');

    const submit = new window.Event('submit', { bubbles: true, cancelable: true });
    form!.dispatchEvent(submit);
    expect(submit.defaultPrevented, 'a submit the page had no reason to stop').toBe(false);

    await window.happyDOM.close();
  });
});
