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

function injectOrigin(agent: Agent): Agent {
  for (const verb of MUTATIONS) {
    const orig = agent[verb].bind(agent) as (url: string) => TestType;
    agent[verb] = ((url: string): TestType => {
      const origin = process.env.PUBLIC_BASE_URL ?? 'http://localhost';
      const test = orig(url).set('Origin', origin);
      return verb === 'post' && CAPTCHA_GATED_PATH.test(url) ? injectCaptchaAnswer(test) : test;
    }) as Agent[typeof verb];
  }
  return agent;
}

function request(app: Express): Agent {
  return injectOrigin(baseRequest(app));
}

request.agent = function (app?: Express): Agent {
  return injectOrigin(baseRequest.agent(app) as unknown as Agent);
};

export default request;
