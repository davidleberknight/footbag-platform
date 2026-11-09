/**
 * scripts/enable-cloudfront.sh: the second Terraform pass of a new
 * environment, driven against a scratch values file and stand-ins for the
 * apply and the read-back.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/enable-cloudfront.sh');

let dir: string;
let tfvars: string;

const STAGING_VALUES = [
  'domain_name     = ""',
  'enable_cloudfront    = false',
  'lightsail_origin_dns = ""        # set on the second pass',
  'enable_backup_alarm  = false',
  '',
].join('\n');
const PRODUCTION_VALUES = [
  'domain_name = "footbag.org"',
  'lightsail_origin_dns = "TODO-origin.footbag.org"',
  'enable_cloudfront             = false',
  '',
].join('\n');

function run(target: string, env: NodeJS.ProcessEnv = {}, args: string[] = ['--yes']) {
  const res = spawnSync('bash', [SCRIPT, '--target', target, '--tfvars', tfvars, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ENABLE_CLOUDFRONT_STATIC_IP: '203.0.113.20', ...env },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', file: readFileSync(tfvars, 'utf8') };
}

function stub(name: string, body: string): string {
  const p = join(dir, name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

beforeEach(() => {
  dir = createScratchDir('enable-cloudfront');
  tfvars = join(dir, 'terraform.tfvars');
});
afterEach(() => removeScratch(dir));

describe('enable-cloudfront.sh', () => {
  it('sets both lines on staging, deriving the origin from the static address, and leaves every other line as it was', () => {
    // Defect caught: one line set without the other, an origin typed wrong, or
    // an unrelated values-file line rewritten on the way.
    writeFileSync(tfvars, STAGING_VALUES);
    const r = run('staging');
    expect(r.status, r.stderr).toBe(0);
    expect(r.file).toBe([
      'domain_name     = ""',
      'enable_cloudfront    = true',
      'lightsail_origin_dns = "203.0.113.20.nip.io"        # set on the second pass',
      'enable_backup_alarm  = false',
      '',
    ].join('\n'));
  });

  it('names production\'s origin record under its domain, never nip.io', () => {
    writeFileSync(tfvars, PRODUCTION_VALUES);
    const r = run('production');
    expect(r.status, r.stderr).toBe(0);
    expect(r.file).toContain('lightsail_origin_dns = "origin.footbag.org"');
    expect(r.file).toContain('enable_cloudfront             = true');
    expect(r.file).not.toMatch(/nip\.io/);
  });

  it('leaves an environment already on with its own origin alone', () => {
    writeFileSync(tfvars, STAGING_VALUES
      .replace('enable_cloudfront    = false', 'enable_cloudfront    = true')
      .replace('lightsail_origin_dns = ""', 'lightsail_origin_dns = "203.0.113.20.nip.io"'));
    const before = readFileSync(tfvars, 'utf8');
    const r = run('staging');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/already on for staging with origin 203\.0\.113\.20\.nip\.io/);
    expect(r.file).toBe(before);
  });

  it('corrects the origin of an environment already on whose host was rebuilt onto a new address', () => {
    // Defect caught: a staging host rebuilt after its instance was deleted gets
    // a new static address, and the distribution keeps pointing at the old one
    // with no scripted way to correct it.
    writeFileSync(tfvars, STAGING_VALUES
      .replace('enable_cloudfront    = false', 'enable_cloudfront    = true')
      .replace('lightsail_origin_dns = ""', 'lightsail_origin_dns = "198.51.100.7.nip.io"'));
    const r = run('staging');
    expect(r.status, r.stderr).toBe(0);
    expect(r.file).toContain('lightsail_origin_dns = "203.0.113.20.nip.io"        # set on the second pass');
    expect(r.file).toContain('enable_cloudfront    = true');
  });

  it('refuses a values file without the line rather than inventing it', () => {
    writeFileSync(tfvars, 'enable_cloudfront = false\n');
    const r = run('staging');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/holds no lightsail_origin_dns line/);
    expect(r.file).toBe('enable_cloudfront = false\n');
  });

  it('refuses a static address that is not one', () => {
    writeFileSync(tfvars, STAGING_VALUES);
    const r = run('staging', { ENABLE_CLOUDFRONT_STATIC_IP: 'None' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/is not an IPv4 address/);
    expect(r.file).toBe(STAGING_VALUES);
  });

  it('changes nothing without the typed confirmation', () => {
    // No terminal and no --yes: the shared helper refuses rather than reading
    // an answer from somewhere else.
    writeFileSync(tfvars, STAGING_VALUES);
    const r = run('staging', {}, []);
    expect(r.status).not.toBe(0);
    expect(r.file).toBe(STAGING_VALUES);
  });

  it('applies and proves the published address', () => {
    writeFileSync(tfvars, STAGING_VALUES);
    const tf = stub('terraform-apply.sh', 'echo "applied $*"');
    const aws = stub('aws', 'echo "https://placeholder.cloudfront.net"');
    const r = run('staging', { ENABLE_CLOUDFRONT_TERRAFORM: tf, ENABLE_CLOUDFRONT_AWS_BIN: aws });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/applied --target staging/);
    expect(r.stderr).toMatch(/publishes \/footbag\/staging\/app\/public_base_url = https:\/\/placeholder\.cloudfront\.net/);
  });

  it('keeps the values file after a failed apply, because the apply may have created part of the distribution', () => {
    // Defect caught: a revert writing "off" over a distribution the apply
    // half-created, which is harder to see than the mismatch it hides.
    writeFileSync(tfvars, STAGING_VALUES);
    const tf = stub('terraform-apply.sh', 'echo "Error: creating CloudFront Distribution" >&2; exit 1');
    const r = run('staging', { ENABLE_CLOUDFRONT_TERRAFORM: tf });
    expect(r.status).not.toBe(0);
    expect(r.file).toContain('enable_cloudfront    = true');
  });

  it('fails when the address does not read back after a successful apply', () => {
    writeFileSync(tfvars, STAGING_VALUES);
    const tf = stub('terraform-apply.sh', 'exit 0');
    const aws = stub('aws', 'echo "An error occurred (ParameterNotFound)" >&2; exit 254');
    const r = run('staging', { ENABLE_CLOUDFRONT_TERRAFORM: tf, ENABLE_CLOUDFRONT_AWS_BIN: aws });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/does not read back as an https address: An error occurred \(ParameterNotFound\)/);
  });
});
