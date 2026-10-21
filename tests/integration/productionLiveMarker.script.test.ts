/**
 * scripts/production-live-marker.sh: going live waits for an encrypted origin hop.
 *
 * Taking production live is what lets real member data onto it, and until origin
 * TLS is in place the CloudFront-to-origin hop carries session cookies and
 * passwords in clear. So the flip to live is refused unless the live
 * distribution's origin protocol reads https-only, checked before the typed
 * confirmation. Returning to pre-live is not gated.
 *
 * Every external reach is a stand-in: `aws` on PATH answers the marker read and
 * records any write, the terraform seam answers the distribution id, the
 * CloudFront seam answers the origin protocol, and the shared identity stub
 * proves the profile. No run here has a terminal, so a run that passes the guard
 * stops at the script's own terminal refusal, before any write.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'production-live-marker.sh');

let root: string;
let n = 0;

beforeAll(() => {
  root = createScratchDir('production-live-marker');
});
afterAll(() => removeScratch(root));

interface World {
  /** What the marker parameter currently reads. */
  marker: 'true' | 'false';
  /** The origin protocol CloudFront reports, or null for a failed read. */
  originPolicy: string | null;
  /** Whether terraform answers the distribution id, fails the read, or answers empty. */
  distributionId?: 'present' | 'fails' | 'empty';
}

function run(w: World, args: string[]) {
  const dir = path.join(root, `case-${++n}`);
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const writes = path.join(dir, 'writes.log');
  const exe = (name: string, lines: string[]) =>
    fs.writeFileSync(path.join(bin, name), ['#!/usr/bin/env bash', ...lines].join('\n') + '\n', { mode: 0o755 });

  exe('aws', [
    'if [[ "$1 $2" == "ssm get-parameter" ]]; then echo ' + w.marker + '; exit 0; fi',
    `if [[ "$1 $2" == "ssm put-parameter" ]]; then echo "$*" >> ${JSON.stringify(writes)}; exit 0; fi`,
    'echo "unexpected aws call: $*" >&2; exit 64',
  ]);
  exe('terraform', [
    {
      present: 'if [[ "$*" == *"output -raw cloudfront_distribution_id"* ]]; then echo E2TESTDIST; exit 0; fi',
      empty: 'if [[ "$*" == *"output -raw cloudfront_distribution_id"* ]]; then exit 0; fi',
      fails: '',
    }[w.distributionId ?? 'present'],
    'echo "No outputs found" >&2; exit 1',
  ]);
  exe('cloudfront', [
    'if [[ "$1 $2" != "cloudfront get-distribution-config" ]]; then exit 64; fi',
    w.originPolicy === null ? 'echo "AccessDenied" >&2; exit 255' : `echo ${w.originPolicy}`,
  ]);

  const res = spawnSync('bash', [SCRIPT, ...args, '--profile', 'footbag-operator'], {
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir),
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      TF_OUTPUT_BIN: path.join(bin, 'terraform'),
      ORIGIN_TLS_AWS_BIN: path.join(bin, 'cloudfront'),
    },
    ...SPAWN_GUARD,
  });
  return { res, wrote: fs.existsSync(writes) };
}

describe('production-live-marker.sh going live', () => {
  // Defect caught: production goes live, and real members sign in, while their
  // cookies and passwords still cross the origin hop in clear.
  it('refuses to go live while the origin hop is http-only, before asking for confirmation', () => {
    const { res, wrote } = run({ marker: 'false', originPolicy: 'http-only' }, ['--set', 'live']);
    expect(res.status, res.stdout + res.stderr).toBe(1);
    expect(res.stderr).toContain('refusing to take production live');
    expect(res.stderr).toContain("protocol policy 'http-only'");
    expect(res.stderr).not.toContain('requires an interactive terminal');
    expect(wrote).toBe(false);
  });

  // Defect caught: a correct, encrypted production can never be taken live
  // because the guard refuses every state.
  it('lets an https-only origin through to the typed confirmation', () => {
    const { res, wrote } = run({ marker: 'false', originPolicy: 'https-only' }, ['--set', 'live']);
    expect(res.status, res.stdout + res.stderr).toBe(1);
    expect(res.stdout).toContain('Origin hop: https-only');
    expect(res.stderr).toContain('requires an interactive terminal');
    expect(wrote).toBe(false);
  });

  // Defect caught: a read that fails is taken as safe, so a broken credential
  // or a missing output waves the flip through.
  it('fails closed when the origin protocol cannot be read', () => {
    const unreadable = run({ marker: 'false', originPolicy: null }, ['--set', 'live']);
    expect(unreadable.res.status).toBe(1);
    expect(unreadable.res.stderr).toContain('did not return the configuration of distribution E2TESTDIST');

    const noId = run({ marker: 'false', originPolicy: 'https-only', distributionId: 'fails' }, ['--set', 'live']);
    expect(noId.res.status).toBe(1);
    expect(noId.res.stderr).toContain('distribution id could not be read from Terraform');

    // An output that reads successfully but empty, as it does while CloudFront is
    // off in the tree, must not stand in for a distribution to check.
    const emptyId = run({ marker: 'false', originPolicy: 'https-only', distributionId: 'empty' }, ['--set', 'live']);
    expect(emptyId.res.status).toBe(1);
    expect(emptyId.res.stderr).toContain('distribution id could not be read from Terraform');
    expect(unreadable.wrote || noId.wrote || emptyId.wrote).toBe(false);
  });

  // Defect caught: the guard blocks the safe direction, so an operator cannot
  // return a scratch production to pre-live before the hop is encrypted.
  it('does not gate the return to pre-live', () => {
    const { res } = run({ marker: 'true', originPolicy: 'http-only' }, ['--set', 'pre-live']);
    expect(res.status).toBe(1);
    expect(res.stderr).not.toContain('refusing to take production live');
    expect(res.stderr).toContain('requires an interactive terminal');
  });
});
