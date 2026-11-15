/**
 * Drop-in replacement for the `supertest` default export.
 *
 * Why: `src/middleware/requireOriginPin.ts` rejects state-changing requests
 * (POST/PUT/PATCH/DELETE) whose `Origin` header does not match
 * `config.publicBaseUrl`. Supertest does not set an Origin header by default,
 * so without this wrapper every existing mutation test would 403 before
 * reaching the controller.
 *
 * It also posts the captcha answer a real browser posts. The five
 * captcha-gated forms (login, register, verify-email resend, password forgot,
 * password reset) carry a hidden `cf-turnstile-response` field whose fixed
 * answer the stub verifier passes, and the stub refuses a blank answer as the
 * live verifier does. A POST to one of those forms without the field gets that
 * answer added, so a test of what happens after the challenge reads as it
 * would from the page. A test of the blank-answer refusal sends the field
 * explicitly as an empty string; a test of a rejected or unavailable verifier
 * sends the stub's sentinel token.
 *
 * And it posts an object body as that route's real client does: JSON to the
 * few routes the app parses JSON on, a browser-encoded form everywhere else.
 *
 * Usage:
 *   import request from '../fixtures/supertestWithOrigin';
 *   await request(app).post('/foo').send({ ... });        // Origin auto-set
 *   await request(app).post('/foo').set('Origin', 'http://x'); // override wins
 *   const agent = request.agent(app);                     // cookie-jar agent
 *   await agent.post('/foo').send({ ... });               // also auto-set
 *
 * Tests that intentionally exercise the Origin-pin matrix (sending mismatched
 * or absent Origin headers) should import `supertest` directly, not via this
 * helper.
 */
import baseRequest from 'supertest';
import type { Express } from 'express';
// A plain list with no imports of its own, so loading it here loads no app
// config before a suite's setTestEnv runs.
import { JSON_BODY_PATHS } from '../../src/lib/jsonBodyRoutes';

type Agent = ReturnType<typeof baseRequest>;
type TestType = ReturnType<Agent['post']>;

const MUTATIONS = ['post', 'put', 'patch', 'delete'] as const;

const CAPTCHA_GATED_PATH = /^\/(login|register|verify\/resend|password\/forgot|password\/reset\/[^/?#]+)\/?(?:[?#]|$)/;
const CAPTCHA_FIELD = 'cf-turnstile-response';
// The answer the stub card in the captcha field partial posts. Spelled out
// rather than imported: importing the adapter here would load the app config
// before a suite's setTestEnv runs.
const STUB_CAPTCHA_ANSWER = 'stub-captcha-pass';

function withCaptchaAnswer(data: unknown): unknown {
  if (typeof data === 'string') {
    if (new URLSearchParams(data).has(CAPTCHA_FIELD)) return data;
    const extra = `${CAPTCHA_FIELD}=${STUB_CAPTCHA_ANSWER}`;
    return data === '' ? extra : `${data}&${extra}`;
  }
  if (data && typeof data === 'object' && !Buffer.isBuffer(data) && !Array.isArray(data)) {
    if (CAPTCHA_FIELD in (data as Record<string, unknown>)) return data;
    return { ...(data as Record<string, unknown>), [CAPTCHA_FIELD]: STUB_CAPTCHA_ANSWER };
  }
  return data;
}

function injectCaptchaAnswer(test: TestType): TestType {
  const send = test.send.bind(test);
  const end = test.end.bind(test);
  let sent = false;
  test.send = ((data?: unknown) => {
    const body = sent ? data : withCaptchaAnswer(data);
    sent = true;
    return send(body as Parameters<typeof send>[0]);
  }) as typeof test.send;
  test.end = ((callback?: Parameters<typeof end>[0]) => {
    if (!sent) {
      sent = true;
      if (!test.get('Content-Type')) test.type('form');
      send({ [CAPTCHA_FIELD]: STUB_CAPTCHA_ANSWER });
    }
    return end(callback);
  }) as typeof test.end;
  return test;
}

/**
 * A form body as a browser encodes it: each field once, a list as the same
 * key repeated. Supertest's own form encoding writes a list as `key[0]=...`,
 * which the app's urlencoded parser reads as a differently named field.
 */
function encodeAsForm(data: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item === null ? '' : String(item));
    }
  }
  return params.toString();
}

/**
 * Posts an object body the way the real client of that route does: as JSON to
 * the routes the app parses JSON on, and as a form everywhere else, since
 * every other state-changing route is an HTML form. A test that sets its own
 * Content-Type keeps it.
 */
function bodyAsTheClientSendsIt(test: TestType, url: string): TestType {
  const send = test.send.bind(test);
  const path = url.split(/[?#]/)[0];
  test.send = ((data?: unknown) => {
    const isObject = !!data && typeof data === 'object' && !Buffer.isBuffer(data) && !Array.isArray(data);
    if (isObject && !test.get('Content-Type')) {
      if (JSON_BODY_PATHS.includes(path)) return send(data as object);
      test.type('form');
      return send(encodeAsForm(data as Record<string, unknown>));
    }
    return send(data as Parameters<typeof send>[0]);
  }) as typeof test.send;
  return test;
}

/**
 * The site itself is the app that renders pages; the media workers are
 * separate apps whose every route takes JSON, so their bodies are left alone.
 */
function isTheSite(app: Express | undefined): boolean {
  return !!app && typeof app.get === 'function' && app.get('view engine') === 'hbs';
}

function injectOrigin(agent: Agent, site: boolean): Agent {
  for (const verb of MUTATIONS) {
    const orig = agent[verb].bind(agent) as (url: string) => TestType;
    agent[verb] = ((url: string): TestType => {
      const origin = process.env.PUBLIC_BASE_URL ?? 'http://localhost';
      const withOrigin = orig(url).set('Origin', origin);
      const test = site ? bodyAsTheClientSendsIt(withOrigin, url) : withOrigin;
      return verb === 'post' && CAPTCHA_GATED_PATH.test(url) ? injectCaptchaAnswer(test) : test;
    }) as Agent[typeof verb];
  }
  return agent;
}

function request(app: Express): Agent {
  return injectOrigin(baseRequest(app), isTheSite(app));
}

request.agent = function (app?: Express): Agent {
  return injectOrigin(baseRequest.agent(app) as unknown as Agent, isTheSite(app));
};

export default request;
