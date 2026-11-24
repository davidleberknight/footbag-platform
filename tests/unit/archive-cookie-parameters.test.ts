/**
 * The two Terraform-published values the platform signs archive cookies with,
 * in both trees.
 *
 * The key-pair identifier must exist exactly when the archive's edge accepts
 * only signed cookies, and the cookie domain only once the archive also answers
 * on its custom domain: a browser discards a parent-domain cookie set from any
 * other host. Both trees carry the same declarations, so staging, whose edge
 * gate is off, publishes neither.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hclBlocks } from '../fixtures/hclBlocks';

const TREES = ['staging', 'production'] as const;

function param(tree: (typeof TREES)[number], name: string) {
  const tf = readFileSync(resolve(__dirname, `../../terraform/${tree}/archive.tf`), 'utf8');
  return hclBlocks(tf, 'resource').find((b) => b.type === 'aws_ssm_parameter' && b.name === name);
}
const attr = (body: string, key: string) => body.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm'))?.[1].trim();

describe.each(TREES)('%s archive cookie parameters', (tree) => {
  it('publishes the key-pair identifier from the archive public key, only while the edge gate is on', () => {
    // Defect caught: archive cookies naming a key the edge does not trust, so
    // every member is refused at the archive; or a staging host told to sign
    // cookies its login-redirect-gated archive never checks.
    const b = param(tree, 'app_archive_key_pair_id');
    expect(b).toBeDefined();
    expect(attr(b!.body, 'count')).toBe('var.enable_archive && var.archive_require_signed_cookies ? 1 : 0');
    expect(attr(b!.body, 'name')).toBe('"${local.ssm_prefix}/app/archive_key_pair_id"');
    expect(attr(b!.body, 'value')).toBe('aws_cloudfront_public_key.archive[0].id');
    // The deploy's by-path read copies plain values; a SecureString would reach
    // the host as ciphertext.
    expect(attr(b!.body, 'type')).toBe('"String"');
    expect(b!.body).not.toMatch(/ignore_changes/);
  });

  it('publishes the parent cookie domain only with the custom domain and the edge gate both on', () => {
    // Defect caught: a .footbag.org cookie domain published while the platform
    // still answers on a cloudfront.net name, so every browser discards the
    // archive cookies; or a domain without the leading dot, scoping them to
    // one host so the archive never receives them.
    const b = param(tree, 'app_archive_cookie_domain');
    expect(b).toBeDefined();
    expect(attr(b!.body, 'count')).toBe('var.enable_archive_custom_domain && var.archive_require_signed_cookies ? 1 : 0');
    expect(attr(b!.body, 'name')).toBe('"${local.ssm_prefix}/app/archive_cookie_domain"');
    expect(attr(b!.body, 'value')).toBe('".${var.domain_name}"');
    expect(attr(b!.body, 'type')).toBe('"String"');
  });

  it('publishes the login redirect exactly when the key-pair identifier is not, so one party gates the archive', () => {
    // Defect caught: both gates or neither, so the archive is either refused
    // to every member or served to anyone who finds its hostname.
    const redirect = attr(param(tree, 'app_archive_login_redirect')!.body, 'count');
    expect(redirect).toBe('var.enable_archive && !var.archive_require_signed_cookies ? 1 : 0');
  });
});
