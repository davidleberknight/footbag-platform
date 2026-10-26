/**
 * scripts/lib/host-values.sh: the catalogue of every value a deployed host's env
 * file carries, and the sync both deploy halves call to write the ones
 * Terraform publishes.
 *
 * Two kinds of case. The sync is driven for real, against a stand-in `aws` that
 * answers the by-path read from a fixture and a scratch env file, because its
 * own reading of what came back decides what it writes. The catalogue is then
 * held against every independently maintained list it must agree with: the
 * compose files that read the values, the committed per-environment files, both
 * deploy halves' allowlists, and both Terraform trees. A value one of those
 * names and the catalogue does not is a value some host will be missing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { listFiles } from '../fixtures/sourceTree';
import { requireToolInCI } from '../fixtures/toolAvailability';

const REPO = process.cwd();
const LIB = join(REPO, 'scripts/lib/host-values.sh');

interface Entry {
  key: string;
  klass: string;
  source: string;
  required: string;
  pattern: string;
}

/** The catalogue as the shell sees it, read through its own functions. */
function catalogue(): Entry[] {
  const r = spawnSync(
    'bash',
    ['-c', `source "${LIB}"; for k in $(host_values_keys); do printf '%s|%s|%s|%s|%s\\n' "$k" "$(host_value_field "$k" class)" "$(host_value_field "$k" source)" "$(host_value_field "$k" required)" "$(host_value_field "$k" pattern)"; done`],
    { encoding: 'utf-8', ...SPAWN_GUARD },
  );
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim().split('\n').map((line) => {
    const [key, klass, source, required, pattern] = line.split('|');
    return { key, klass, source, required, pattern };
  });
}

/** Every published parameter, as a by-path read returns it for staging. */
const PUBLISHED: Record<string, string> = {
  'app/media_bucket': 'footbag-staging-media',
  'app/jwt_kms_key_id': 'alias/footbag-staging-jwt',
  'app/ses_configuration_set_transactional': 'footbag-staging-transactional',
  'app/ses_configuration_set_bulk': 'footbag-staging-bulk',
  'app/snapshots_bucket': 'footbag-staging-db-snapshots',
  'app/alarm_topic_arn': 'arn:aws:sns:us-east-1:000000000000:footbag-staging-alarms',
  'app/ses_feedback_topic_arn': 'arn:aws:sns:us-east-1:000000000000:footbag-staging-ses-feedback',
  'app/alarm_queue_url': 'https://sqs.us-east-1.amazonaws.com/000000000000/footbag-staging-alarm-feed',
  'app/ses_feedback_queue_url': 'https://sqs.us-east-1.amazonaws.com/000000000000/footbag-staging-ses-feedback-feed',
  'app/ses_sender_identity': 'noreply@example.invalid',
  'app/public_base_url': 'https://d1234abcdef8.cloudfront.net',
  // Parameters the by-path read also returns that are not host values of this
  // class; the sync must leave them alone.
  'app/log_level': 'info',
  'app/payments_armed': 'dark',
};

let dir = '';
let envFile = '';
let listing = '';

function writeListing(params: Record<string, string>): void {
  writeFileSync(
    listing,
    Object.entries(params).map(([k, v]) => `/footbag/staging/${k}\t${v}`).join('\n') + '\n',
  );
}

function sync(awsRc = 0): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(
    'bash',
    ['-c', `source "${LIB}"; host_values_sync_params "$1" staging footbag-staging-runtime us-east-1`, '_', envFile],
    {
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, AWS_STUB_LISTING: listing, AWS_STUB_RC: String(awsRc) },
      ...SPAWN_GUARD,
    },
  );
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

beforeEach(() => {
  dir = createScratchDir('host-values');
  envFile = join(dir, 'env');
  listing = join(dir, 'listing.tsv');
  const bin = join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin], SPAWN_GUARD);
  // A stand-in for the one AWS call the sync makes. The by-path query's text
  // output is a contracted shape: one tab-separated name and value per line.
  writeFileSync(join(bin, 'aws'), '#!/usr/bin/env bash\n[[ "$AWS_STUB_RC" == 0 ]] || exit "$AWS_STUB_RC"\ncat "$AWS_STUB_LISTING"\n');
  chmodSync(join(bin, 'aws'), 0o755);
  writeFileSync(envFile, 'FOOTBAG_ENV=staging\nSESSION_SECRET=keep-this-secret-value\nMEDIA_STORAGE_S3_BUCKET=old-bucket\nALARM_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/000000000000/retired\n');
  chmodSync(envFile, 0o600);
});

afterEach(() => removeScratch(dir));

describe('host_values_sync_params writes the Terraform-published values', () => {
  // Defect caught: a published value never reaches the host, or a stale one
  // survives beside the new one, and the host builds links or sends mail
  // against whatever an earlier deploy left there.
  it('writes every param-class value once, replacing stale lines and keeping the rest', () => {
    writeListing(PUBLISHED);
    const r = sync();
    expect(r.status, r.stderr).toBe(0);
    const lines = readFileSync(envFile, 'utf-8').trim().split('\n');
    for (const entry of catalogue().filter((e) => e.klass === 'param')) {
      const matching = lines.filter((l) => l.startsWith(`${entry.key}=`));
      expect(matching, `${entry.key} written exactly once`).toEqual([`${entry.key}=${PUBLISHED[entry.source]}`]);
    }
    expect(lines).toContain('SESSION_SECRET=keep-this-secret-value');
    expect(lines).toContain('FOOTBAG_ENV=staging');
    expect(lines.some((l) => l.startsWith('LOG_LEVEL=') || l.startsWith('PAYMENTS_ARMED='))).toBe(false);
    expect(statSync(envFile).mode & 0o777).toBe(0o600);
  });

  // Defect caught: a deploy against an environment whose tree was never
  // applied writes half the set and leaves a host that boots wrong.
  it('refuses a missing required parameter and leaves the env file byte-for-byte unchanged', () => {
    const before = readFileSync(envFile, 'utf-8');
    const { 'app/public_base_url': _omit, ...rest } = PUBLISHED;
    writeListing(rest);
    const r = sync();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('/footbag/staging/app/public_base_url is missing; it supplies PUBLIC_BASE_URL');
    expect(readFileSync(envFile, 'utf-8')).toBe(before);
  });

  // Defect caught: a host keeps polling a queue that has been removed, or an
  // absent optional value is treated as a failure and blocks every deploy.
  it('clears an optional value whose parameter is gone, and writes it when it exists', () => {
    const { 'app/alarm_queue_url': _omit, ...rest } = PUBLISHED;
    writeListing(rest);
    const r = sync();
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(envFile, 'utf-8')).not.toContain('ALARM_QUEUE_URL=');
    expect(r.stdout).toContain('Cleared ALARM_QUEUE_URL');

    writeListing(PUBLISHED);
    expect(sync().status).toBe(0);
    expect(readFileSync(envFile, 'utf-8')).toContain(`ALARM_QUEUE_URL=${PUBLISHED['app/alarm_queue_url']}`);
  });

  // Defect caught: a placeholder or malformed value reaches a container, where
  // the signing key's ARN publishes the account id or a bad sender fails every
  // send at the drain.
  it.each([
    ['app/ses_configuration_set_bulk', 'TODO set me', 'SES_CONFIGURATION_SET_BULK'],
    ['app/jwt_kms_key_id', 'arn:aws:kms:us-east-1:000000000000:key/abc', 'JWT_KMS_KEY_ID'],
    ['app/public_base_url', 'http://insecure.example.invalid', 'PUBLIC_BASE_URL'],
    ['app/ses_sender_identity', 'not-an-address', 'SES_FROM_IDENTITY'],
  ])('refuses %s shaped wrong, changing nothing', (source, bad, key) => {
    const before = readFileSync(envFile, 'utf-8');
    writeListing({ ...PUBLISHED, [source]: bad });
    const r = sync();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`which is not the shape ${key} needs`);
    expect(readFileSync(envFile, 'utf-8')).toBe(before);
  });

  // Defect caught: an unreadable Parameter Store reads as "nothing published"
  // and clears every optional value, or worse, proceeds on a partial read.
  it('refuses when the read itself fails, changing nothing', () => {
    const before = readFileSync(envFile, 'utf-8');
    writeListing(PUBLISHED);
    const r = sync(255);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('could not read /footbag/staging/app/');
    expect(readFileSync(envFile, 'utf-8')).toBe(before);
  });
});

describe('the code deploy preflights every parameter it hard-requires', () => {
  // Defect caught: a required value the deploy writes from Parameter Store is
  // missing from the preflight, so the deploy promotes the release, then fails
  // on the missing parameter with a compose file it cannot interpolate.
  it('lists each required parameter, secrets included, once', () => {
    const r = spawnSync('bash', ['-c', `source "${LIB}"; host_values_required_parameters`], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(r.status, r.stderr).toBe(0);
    const listed = r.stdout.trim().split('\n');
    expect(new Set(listed).size, 'each parameter is listed once').toBe(listed.length);
    const expected = new Set(
      catalogue()
        .filter((e) => ['param', 'derived', 'secret'].includes(e.klass) && e.required === 'required')
        .map((e) => e.source),
    );
    expect(new Set(listed)).toEqual(expected);
    // The two secrets the stack cannot start without, named so the list cannot
    // shrink to the catalogue's non-secret entries and still agree with itself.
    expect(listed).toContain('secrets/session_secret');
    expect(listed).toContain('secrets/origin_verify_secret');
    expect(listed).toContain('app/public_base_url');
  });
});

describe('the catalogue agrees with every list it must match', () => {
  const declared = (): Map<string, Entry> => new Map(catalogue().map((e) => [e.key, e]));

  // Defect caught: a value the stack reads is declared nowhere, so no owner
  // writes it and a rebuilt host comes up without it.
  it('declares every variable the compose files read from the host env file', () => {
    const keys = declared();
    for (const file of ['docker/docker-compose.yml', 'docker/docker-compose.prod.yml']) {
      const code = readFileSync(join(REPO, file), 'utf-8')
        .split('\n')
        .filter((l) => !/^\s*#/.test(l))
        .join('\n');
      for (const [, name] of code.matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g)) {
        expect(keys.has(name), `${file} reads ${name}, which the catalogue does not declare`).toBe(true);
      }
    }
  });

  // Defect caught: a constant is committed but the catalogue calls it some
  // other owner's, or the other way round, so two owners write one value.
  it('marks exactly the keys the committed env files set as committed', () => {
    const keys = declared();
    for (const target of ['staging', 'production']) {
      const set = readFileSync(join(REPO, `docker/env/${target}.env`), 'utf-8')
        .split('\n')
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => l.slice(0, l.indexOf('=')));
      for (const k of set) {
        expect(keys.get(k)?.klass, `docker/env/${target}.env sets ${k}`).toBe('committed');
      }
    }
  });

  // Defect caught: the catalogue names a committed value the deploy's own
  // allowlist drops, so the committed file says one thing and the host another.
  it.each(['scripts/internal/deploy-code-remote.sh', 'scripts/internal/deploy-rebuild-remote.sh'])(
    '%s admits every committed key and nothing outside the catalogue',
    (half) => {
      const line = readFileSync(join(REPO, half), 'utf-8').split('\n').find((l) => l.includes("local key_re='"));
      expect(line).toBeDefined();
      const re = new RegExp(line!.slice(line!.indexOf("'") + 1, line!.lastIndexOf("'")));
      const committed = catalogue().filter((e) => e.klass === 'committed').map((e) => e.key);
      for (const k of committed) expect(re.test(k), `${half} admits ${k}`).toBe(true);
      for (const e of catalogue().filter((x) => x.klass !== 'committed')) {
        expect(re.test(e.key), `${half} admits ${e.key}, which is not a committed value`).toBe(false);
      }
    },
  );

  // Parameters each tree publishes that are not host values: the application
  // reads them at run time through its secrets adapter, or the deploy's guards
  // read them, so nothing copies them onto the host.
  const NOT_HOST_VALUES = new Set([
    'app/bootstrap',
    'app/production_live',
    'secrets/archive_signing_private_key',
    'secrets/safe_browsing_api_key',
    'secrets/stripe_secret_key',
    'secrets/turnstile_secret_key',
  ]);

  // Defect caught: a value the catalogue syncs is published by only one tree,
  // so the deploy refuses in one environment, or a tree publishes a host value
  // nothing ever copies onto the host.
  it.each(['staging', 'production'])('holds the %s tree to the parameters it publishes', (target) => {
    const tree = listFiles(`terraform/${target}`, /\.tf$/)
      .map((f) => readFileSync(join(REPO, `terraform/${target}`, f), 'utf-8'))
      .join('\n');
    const published = new Set([...tree.matchAll(/ssm_prefix\}\/((?:app|secrets)\/[a-z_]+)/g)].map((m) => m[1]));
    const sources = new Set(
      catalogue().filter((e) => ['param', 'derived', 'secret'].includes(e.klass)).map((e) => e.source),
    );
    for (const p of published) {
      if (NOT_HOST_VALUES.has(p)) continue;
      expect(sources.has(p), `terraform/${target} publishes ${p}, which no catalogue entry reads`).toBe(true);
    }
    for (const e of catalogue().filter((x) => x.klass === 'param')) {
      expect(published.has(e.source), `${e.key} reads ${e.source}, which terraform/${target} does not publish`).toBe(true);
    }
  });

  // Defect caught: the base address moves to www as soon as the custom domain
  // is on, while www still serves the legacy site, so every mail queued in that
  // gap links to the legacy site permanently and the CSRF origin pin refuses
  // the platform's own forms.
  it('gives production www only once www serves the platform', () => {
    const ssm = readFileSync(join(REPO, 'terraform/production/ssm.tf'), 'utf-8');
    const www = /www_serves_platform\s*=\s*([^\n]+)/.exec(ssm)?.[1] ?? '';
    expect(www).toContain('var.enable_platform_custom_domain');
    expect(www).toContain('var.enable_apex_alias_records');
    expect(www).toContain('!var.enable_cutover_notice');
    const choice = /public_base_url\s*=\s*\(([\s\S]*?)\n\s*\)/.exec(ssm)?.[1] ?? '';
    const order = ['local.www_serves_platform', 'local.preview_url', 'local.distribution_url'].map((n) => choice.indexOf(n));
    expect(order.every((i) => i > -1), `the base address chooses between www, preview and the distribution name: ${choice}`).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  // Defect caught: the base address names something other than the public name
  // that reaches the platform at some stage of the go-live sequence. Evaluates
  // the production locals themselves, copied out of ssm.tf with the one
  // resource reference swapped for a variable, so the formula is what is tested
  // rather than its spelling.
  const tfAvailable = requireToolInCI('terraform');
  it.skipIf(!tfAvailable)('decides the base address at each stage of the go-live sequence', () => {
    const ssm = readFileSync(join(REPO, 'terraform/production/ssm.tf'), 'utf-8');
    const locals = /\nlocals \{\n(\s+platform_url[\s\S]*?\n)\}\n/.exec(ssm)?.[1];
    expect(locals, 'the base-address locals block').toBeDefined();
    const mod = createScratchDir('base-address-formula');
    try {
      const flags = ['enable_cloudfront', 'enable_platform_custom_domain', 'enable_preview_record',
        'enable_cutover_notice', 'enable_apex_alias_records', 'rehearse_launch_base_address'];
      writeFileSync(join(mod, 'main.tf'), [
        ...flags.map((f) => `variable "${f}" { type = bool }`),
        'variable "domain_name" { type = string }',
        'variable "distribution_domain" { type = string }',
        `locals {\n${locals!.replaceAll('aws_cloudfront_distribution.main[0].domain_name', 'var.distribution_domain')}}`,
      ].join('\n'));
      const ask = (set: Record<string, boolean>): string => {
        const args = ['-chdir=' + mod, 'console',
          ...flags.map((f) => `-var=${f}=${set[f] ?? false}`),
          '-var=domain_name=footbag.org', '-var=distribution_domain=d1234abcdef8.cloudfront.net'];
        const r = spawnSync('terraform', args, { input: 'local.public_base_url\n', encoding: 'utf-8', ...SPAWN_GUARD });
        expect(r.status, r.stderr).toBe(0);
        return r.stdout.trim().replace(/^"|"$/g, '');
      };
      const cf = { enable_cloudfront: true };
      // Pass 1: no custom domain yet.
      expect(ask(cf)).toBe('https://d1234abcdef8.cloudfront.net');
      // After the custom-domain apply, www still serves legacy: preview.
      expect(ask({ ...cf, enable_platform_custom_domain: true, enable_preview_record: true })).toBe('https://preview.footbag.org');
      // The window state, and the window after the freeze switches the records: preview.
      expect(ask({ ...cf, enable_platform_custom_domain: true, enable_preview_record: true, enable_cutover_notice: true })).toBe('https://preview.footbag.org');
      expect(ask({ ...cf, enable_platform_custom_domain: true, enable_preview_record: true, enable_cutover_notice: true, enable_apex_alias_records: true })).toBe('https://preview.footbag.org');
      // The launch dress rehearsal: www, only through its own flag.
      expect(ask({ ...cf, enable_platform_custom_domain: true, enable_preview_record: true, rehearse_launch_base_address: true })).toBe('https://www.footbag.org');
      // Launch: the notice lifted with the records on the distribution: www.
      expect(ask({ ...cf, enable_platform_custom_domain: true, enable_apex_alias_records: true })).toBe('https://www.footbag.org');
    } finally {
      removeScratch(mod);
    }
  });

  // Defect caught: the deploy halves carry their own copy of the sync again,
  // and the two drift; or the catalogue never reaches the host, so the call
  // fails as an unknown command after the release is half promoted.
  it.each([
    ['scripts/deploy-code.sh', 'scripts/internal/deploy-code-remote.sh'],
    ['scripts/deploy-rebuild.sh', 'scripts/internal/deploy-rebuild-remote.sh'],
  ])('%s streams the catalogue ahead of %s, which syncs through it', (entry, half) => {
    const sender = readFileSync(join(REPO, entry), 'utf-8');
    expect(sender).toContain('HOST_VALUES_LIB="${SCRIPT_DIR}/lib/host-values.sh"');
    expect(sender).toMatch(/cat [^\n]*"\$HOST_VALUES_LIB" "\$REMOTE_HALF"/);
    const remote = readFileSync(join(REPO, half), 'utf-8');
    expect(remote).toContain('host_values_sync_params "$ENV_PATH" "$FOOTBAG_ENV_VAL" "$AWS_PROFILE_VAL" "$AWS_REGION_VAL"');
    expect(remote).not.toMatch(/for host_ident in|for ses_set_stream in/);
  });
});
