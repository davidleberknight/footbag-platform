/**
 * Drop-in replacement for the `supertest` default export.
 *
 * Why: `src/middleware/requireOriginPin.ts` rejects state-changing requests
 * (POST/PUT/PATCH/DELETE) whose `Origin` header does not match
 * `config.publicBaseUrl`. Supertest does not set an Origin header by default,
 * so without this wrapper every existing mutation test would 403 before
 * reaching the controller.
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

function injectOrigin(agent: Agent): Agent {
  for (const verb of MUTATIONS) {
    const orig = agent[verb].bind(agent) as (url: string) => TestType;
    agent[verb] = ((url: string): TestType => {
      const origin = process.env.PUBLIC_BASE_URL ?? 'http://localhost';
      return orig(url).set('Origin', origin);
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
